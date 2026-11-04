import * as THREE from "three";

// Tunable. Placeholders to adjust by feel.
export const CAMERA_PARAMS = {
  distance: 12, // m behind the car
  height: 9, // m above the car
  lookAhead: 3, // m in front of the car that the camera looks at
  positionFollow: 8, // 1/s, higher = camera sticks closer to its spot
  headingFollow: 4, // 1/s, higher = camera swings behind the car faster
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
  }

  // targetPos: car position. targetYaw: car yaw in radians (0 = facing -Z).
  update(targetPos: THREE.Vector3, targetYaw: number, dt: number) {
    const p = this.p;

    if (!this.started) {
      this.heading = targetYaw;
      this.started = true;
    }

    // Swing the heading toward the car's, taking the short way around the circle
    const diff = Math.atan2(
      Math.sin(targetYaw - this.heading),
      Math.cos(targetYaw - this.heading),
    );
    this.heading += diff * (1 - Math.exp(-p.headingFollow * dt));

    // Forward at yaw 0 is -Z
    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);

    // Camera spot on a sphere around the car: distance/height give the default radius and elevation,
    // the mouse adds yaw/pitch offsets and a zoom factor.
    const radius = Math.hypot(p.distance, p.height) * this.zoom;
    const elevation = Math.min(1.45, Math.max(0.15, Math.atan2(p.height, p.distance) + this.orbitPitch));
    const camYaw = this.heading + this.orbitYaw;
    const horiz = radius * Math.cos(elevation);
    const desiredX = targetPos.x + Math.sin(camYaw) * horiz;
    const desiredY = targetPos.y + radius * Math.sin(elevation);
    const desiredZ = targetPos.z + Math.cos(camYaw) * horiz;

    if (this.position.lengthSq() === 0) {
      this.position.set(desiredX, desiredY, desiredZ);
    }
    const k = 1 - Math.exp(-p.positionFollow * dt);
    this.position.x += (desiredX - this.position.x) * k;
    this.position.y += (desiredY - this.position.y) * k;
    this.position.z += (desiredZ - this.position.z) * k;

    this.lookTarget.set(
      targetPos.x + fx * p.lookAhead,
      targetPos.y,
      targetPos.z + fz * p.lookAhead,
    );

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.lookTarget);
  }
}
