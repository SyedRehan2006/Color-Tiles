import * as THREE from "three";

// Tunable. Placeholders to adjust by feel.
export const CAMERA_PARAMS = {
  distance: 10, // m behind the car
  height: 3.5, // m above the car
  lookAhead: 14, // m in front of the car that the camera looks at (more = flatter view, more sky)
  lookHeight: 0, // m above the car's origin that the camera looks at (more = tilts up)
  positionFollow: 8, // 1/s, higher = camera sticks closer to its spot
  headingFollow: 4, // 1/s, higher = camera swings behind the car faster
  fov: 60, // vertical field of view in degrees

  // While the followed car tumbles off an edge
  tumbleZoom: 0.3, // extra distance (0.3 = pulls back 30%) so you see the whole fall
  tumbleKick: 0.55, // camera shake (0..1) when the tumble starts
  tumbleShake: 0.9, // m: how far the camera shakes at full shake
  tumbleFovPunch: 7, // degrees of extra field of view at full shake, fading out with it
  tumbleBlendSpeed: 4, // 1/s: how quickly the camera switches to and from the tumble framing

  // Orbit camera (while you wait to respawn): a slow circle around the platform centre
  orbitSpeed: 0.25, // rad/s (about 25 s per lap)
  orbitRadius: 0.8, // x the platform's side length
  orbitHeight: 0.45, // x the platform's side length
  orbitFollow: 2.5, // 1/s: how quickly the camera glides to the orbit
};

// Follows a target from behind and above. Call update() once per rendered frame.
export class ChaseCamera {
  private camera: THREE.PerspectiveCamera;
  private p: typeof CAMERA_PARAMS;
  private heading = 0; // smoothed yaw the camera sits behind
  private position = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private started = false;

  constructor(camera: THREE.PerspectiveCamera, params = CAMERA_PARAMS) {
    this.camera = camera;
    this.p = params;
  }

  // Mouse look: drag with the left button to orbit around the followed car, scroll to zoom, C to reset.
  // The offset stays where you leave it, so you can watch the bots while you keep driving.
  private orbitYaw = 0;
  private orbitPitch = 0;
  private zoom = 1;

  attachMouse(el: HTMLElement) {
    let dragging = false;
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointerup", (e) => {
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      this.orbitYaw -= e.movementX * 0.005;
      this.orbitPitch = Math.min(0.8, Math.max(-0.6, this.orbitPitch + e.movementY * 0.005));
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = Math.min(2.5, Math.max(0.5, this.zoom * Math.exp(e.deltaY * 0.001)));
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.code === "KeyC") this.resetOrbit();
    });
  }

  resetOrbit() {
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.zoom = 1;
  }

  // Jump straight to the target on the next update() instead of gliding there (use after a respawn)
  snap() {
    this.started = false;
    this.position.set(0, 0, 0);
    this.tumbleBlend = 0;
    this.trauma = 0;
  }

  // Set every frame by main.ts: the followed car is tumbling off an edge. The camera stops swinging
  // around with the spinning car, pulls back a little and looks straight at it.
  tumbling = false;
  // Set every frame by main.ts: circle the platform instead of following a car
  orbitMode = false;
  orbitCenter = new THREE.Vector3();
  orbitSize = 60; // m: side length of the platform
  private orbitAngle = 0;
  private wasOrbiting = false;
  private tumbleBlend = 0; // 0 = normal chase, 1 = tumble framing (eased)
  private trauma = 0; // 0..1 impact shake, fades out on its own

  // Impact: shake and a short field-of-view punch (call when the tumble starts)
  kick(amount = this.p.tumbleKick) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  // targetPos: car position. targetYaw: car yaw in radians (0 = facing -Z).
  update(targetPos: THREE.Vector3, targetYaw: number, dt: number) {
    const p = this.p;
    this.tumbleBlend += ((this.tumbling ? 1 : 0) - this.tumbleBlend) * (1 - Math.exp(-p.tumbleBlendSpeed * dt));
    const tb = this.tumbleBlend;
    this.trauma = Math.max(0, this.trauma - dt * 1.2);
    const fov = p.fov + this.extraFov + this.trauma * this.trauma * p.tumbleFovPunch;
    if (Math.abs(this.camera.fov - fov) > 1e-4) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Orbit mode: circle the platform instead of following the car. Leaving it jumps back to the car.
    if (this.orbitMode) {
      if (!this.wasOrbiting) {
        this.wasOrbiting = true;
        // Start the circle where the camera already is, so it does not swing around first
        this.orbitAngle = Math.atan2(this.position.z - this.orbitCenter.z, this.position.x - this.orbitCenter.x);
      }
      this.orbitAngle += p.orbitSpeed * dt;
      const r = this.orbitSize * p.orbitRadius;
      const k = 1 - Math.exp(-p.orbitFollow * dt);
      this.position.x += (this.orbitCenter.x + Math.cos(this.orbitAngle) * r - this.position.x) * k;
      this.position.y += (this.orbitCenter.y + this.orbitSize * p.orbitHeight - this.position.y) * k;
      this.position.z += (this.orbitCenter.z + Math.sin(this.orbitAngle) * r - this.position.z) * k;
      this.lookTarget.lerp(this.orbitCenter, 1 - Math.exp(-4 * dt));
      this.applyView();
      return;
    }
    if (this.wasOrbiting) {
      this.wasOrbiting = false;
      this.snap();
    }

    if (!this.started) {
      this.heading = targetYaw;
      this.started = true;
    }

    // Swing the heading toward the car's, taking the short way around the circle
    const diff = Math.atan2(
      Math.sin(targetYaw - this.heading),
      Math.cos(targetYaw - this.heading),
    );
    // (not while tumbling: the car spins, the camera should not swing around with it)
    this.heading += diff * (1 - Math.exp(-p.headingFollow * (1 - tb) * dt));

    // Forward at yaw 0 is -Z
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);

    // Camera spot on a sphere around the car: distance/height give the default radius and elevation,
    // the mouse adds yaw/pitch offsets and a zoom factor.
    const radius = Math.hypot(p.distance, p.height) * this.zoom * (1 + p.tumbleZoom * tb);
    const elevation = Math.min(1.45, Math.max(0.15, Math.atan2(p.height, p.distance) + this.orbitPitch));
    const camYaw = this.heading + this.orbitYaw;
    const horiz = radius * Math.cos(elevation);
    const desiredX = targetPos.x + Math.sin(camYaw) * horiz;
    const desiredY = targetPos.y + radius * Math.sin(elevation);
    const desiredZ = targetPos.z + Math.cos(camYaw) * horiz;

    if (this.position.lengthSq() === 0) {
      this.position.set(desiredX, desiredY, desiredZ);
    }
    const k = 1 - Math.exp(-p.positionFollow * (1 - 0.4 * tb) * dt); // a little floatier while tumbling
    this.position.x += (desiredX - this.position.x) * k;
    this.position.y += (desiredY - this.position.y) * k;
    this.position.z += (desiredZ - this.position.z) * k;

    this.lookTarget.set(
      targetPos.x + fx * p.lookAhead * (1 - tb), // looks straight at the car while it tumbles
      targetPos.y + p.lookHeight * (1 - tb),
      targetPos.z + fz * p.lookAhead * (1 - tb),
    );

    this.applyView();
  }

  // Put the camera at the smoothed position, looking at the look target, plus the cinematic extras
  private applyView() {
    const p = this.p;
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookTarget);
    // Cinematic extras (set by main.ts from the speed effects; zero = off). They only change what is drawn,
    // never the smoothed camera position above.
    if (this.roll !== 0) this.camera.rotateZ(this.roll);
    const impact = this.trauma * this.trauma * p.tumbleShake; // squared: strong at first, dies away quickly
    if (impact > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * impact;
      this.camera.position.y += (Math.random() - 0.5) * impact;
      this.camera.position.z += (Math.random() - 0.5) * impact;
    }
    if (this.shake > 0.001) {
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
  }

  // Extra view widening in degrees, roll in radians, shake in meters-ish (all 0 = off)
  extraFov = 0;
  roll = 0;
  shake = 0;
}
