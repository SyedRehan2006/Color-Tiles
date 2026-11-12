import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { CarController } from "./carController";
import type { BotBrain } from "./bot";
import type { TileGrid } from "./tileGrid";
import { disposeCarMesh, makeCarMesh, type CarShape } from "../render/carModels";
import type { ThemeId } from "../render/theme";
import { settings } from "./settings";

// Mirror across the tile top (y = 0), for the reflection in the cyberpunk 5 glass
const MIRROR = new THREE.Matrix4().makeScale(1, -1, 1);

// Collision groups (Unity: Physics layers + the collision matrix). Each is membership << 16 | filter.
//   group 1: future walls/obstacles    group 2: driving cars    group 4: tumbling cars    group 8: tile colliders
// Driving cars hit nothing (the floor is a rule, car-vs-car is bump.ts). Tumbling cars hit the tiles and
// each other. With "knock-offs" on, tumbling and driving cars also hit each other.
const G_WALL = 1;
const G_DRIVE = 2;
const G_TUMBLE = 4;
const G_TILE = 8;
function groups(tumbling: boolean, knock: boolean) {
  return tumbling
    ? (G_TUMBLE << 16) | G_TILE | G_TUMBLE | (knock ? G_DRIVE : 0)
    : (G_DRIVE << 16) | G_WALL | (knock ? G_TUMBLE : 0);
}
const RESPAWN_HEIGHT = 8; // m: a car drops from the sky onto its tile

// Wheel lean: a wheel that is not over a solid tile sags, so a car hanging over an edge tips toward it.
const LEAN_MAX = 0.45; // rad (about 26 degrees) when a whole side or end is out
const LEAN_SPEED = 10; // 1/s: how fast the lean follows (higher = snappier)
const WHEEL_X = 0.85; // wheel positions as a fraction of the footprint half sizes
const WHEEL_Z = 0.7;

// Tumbling: a car that lost its footing becomes a free rigid body that slides and tips off the edge.
const TIP_SPIN = 2.5; // rad/s of tip toward the void at the start (scaled by how much is out)
const YAW_SPIN = 4; // rad/s: swing toward the heavy corner (zero if the overhang is straight out the side or end)
const TUMBLE_PUSH = 8; // m/s^2 toward the void while some of the car is still over a tile (keeps it from balancing)
const TUMBLE_FRICTION = 0.4;
const TUMBLE_BOUNCE = 0.15;
const SETTLE_TIME = 0.5; // s: a tumbling car that rests supported on the tiles this long drives again

// One car in the match, the player's or a bot's: its physics body, its look, and its own lives and
// fall state. (With multiplayer this becomes the server's per-player record.)
export class Racer {
  readonly isPlayer: boolean;
  readonly brain: BotBrain | null;
  readonly mesh = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly controller: CarController;
  private collider!: RAPIER.Collider;
  private scale = 1;
  tumbling = false; // fell off an edge and is now a free-moving rigid body (see startTumble)
  private settle = 0;
  private sample = { coverage: 1, voidX: 0, voidZ: 0 };
  lives: number;
  eliminated = false; // out of lives for good
  fallen = false; // fell off; waiting to drop back in (or eliminated)
  respawnDelay = 0; // s until a car that fell during the roam drops back in
  // Tie-break when the last cars fall together (docs/mechanics/04_rounds.md, section 6)
  doomedAt = -1; // match clock time the car passed the point of no return (-1 = not falling)
  livesAtFall = 0; // lives it had just before its last fall
  tieRoll = 0; // random last resort

  // Render interpolation: drawn between the previous and current physics state
  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private currQuat = new THREE.Quaternion();
  private teleported = false;

  // Visual lean from wheels hanging over an edge (radians, car's own axes)
  private leanPitch = 0;
  private leanRoll = 0;
  private leanEuler = new THREE.Euler();
  private leanQuat = new THREE.Quaternion();
  private pivotX = 0; // where the car tips over (car's own axes, meters from its center)
  private pivotZ = 0;
  private pivot = new THREE.Vector3();
  private pivotRotated = new THREE.Vector3();
  private pivotOffset = new THREE.Vector3();

  // A dim upside-down copy under the glass (cyberpunk 5). Hidden unless switched on and over solid tiles.
  private reflection = new THREE.Group();
  private reflectionMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  private reflectionOn = false;
  private grid: TileGrid;

  private color: number;
  private world: RAPIER.World;
  private scene: THREE.Scene;
  private maxLives: number;

  constructor(
    world: RAPIER.World,
    scene: THREE.Scene,
    grid: TileGrid,
    color: number,
    brain: BotBrain | null,
    maxLives: number,
  ) {
    this.world = world;
    this.scene = scene;
    this.grid = grid;
    this.reflection.matrixAutoUpdate = false;
    this.reflection.visible = false;
    scene.add(this.reflection);
    this.brain = brain;
    this.isPlayer = brain === null;
    this.maxLives = maxLives;
    this.lives = maxLives;

    // Visual: the car faces -Z (headlights at the front). Shape and theme can change later via setLook().
    this.color = color;
    this.setLook("sedan", "candy");
    scene.add(this.mesh);

    // Physics: only yaw (turning) is free; no pitch or roll, so it never tips over
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, RESPAWN_HEIGHT, 0)
        .enabledRotations(false, true, false)
        .setCanSleep(false), // a sleeping car would ignore gravity when its tile vanishes
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.5, 0.25, 1) // half-extents: 1 x 0.5 x 2 m
        .setFriction(0) // we do the grip ourselves
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setCollisionGroups(groups(false, settings.knockOffCars)),
      this.body,
    );
    this.controller = new CarController(this.body, grid);
  }

  // Make the car bigger or smaller: model, collider and the footprint the floor rule checks.
  // Cheap, and does nothing if the scale did not change, so it is safe to call every frame.
  setScale(s: number) {
    if (s === this.scale) return;
    this.scale = s;
    this.mesh.scale.setScalar(s);
    this.collider.setHalfExtents({ x: 0.5 * s, y: 0.25 * s, z: 1 * s });
    this.controller.setScale(s);
  }

  // Swap the car model (shape + theme style), keeping this car's color
  setLook(shape: CarShape, theme: ThemeId) {
    for (const child of [...this.mesh.children]) {
      this.mesh.remove(child);
      disposeCarMesh(child as THREE.Group);
    }
    const car = makeCarMesh(shape, this.color, theme);
    this.mesh.add(car);
    // Reflection: same shapes (shared geometry), one flat dim material
    for (const child of [...this.reflection.children]) this.reflection.remove(child);
    const copy = car.clone(true);
    copy.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = this.reflectionMat;
        o.renderOrder = 1; // before the glass, which is drawn over it
      } else if (o instanceof THREE.Line) {
        o.visible = false; // no glowing edge lines in the reflection
      }
    });
    this.reflection.add(copy);
  }

  // Switch the glass reflection on or off and set how bright it is
  setReflection(on: boolean, strength: number) {
    this.reflectionOn = on;
    this.reflectionMat.color.setHex(this.color).multiplyScalar(strength);
    this.reflectionMat.opacity = Math.min(1, strength);
    if (!on) this.reflection.visible = false;
  }

  // Footprint half sizes in meters at the current car scale (the one source for bumping and the floor rule)
  get halfWidth() {
    return 0.5 * this.scale;
  }
  get halfLength() {
    return 1 * this.scale;
  }
  get carScale() {
    return this.scale;
  }

  get carColor() {
    return this.color;
  }
  get x() {
    return this.body.translation().x;
  }
  get z() {
    return this.body.translation().z;
  }
  get y() {
    return this.body.translation().y;
  }
  // Heading in radians (0 = facing -Z). Taken from where the nose points, so it is right even while the
  // car is tumbling (when it is pitched and rolled as well).
  get yaw() {
    const q = this.body.rotation();
    const fx = -2 * q.w * q.y - 2 * q.z * q.x;
    const fz = -1 + 2 * (q.x * q.x + q.y * q.y);
    return Math.atan2(-fx, -fz);
  }

  // The car lost its footing at the edge: hand it to the physics engine. It keeps the pose the lean
  // gave it, gets a tip toward the void and a swing toward the heavy corner, and from now on collides
  // with the tiles (TumbleFloor), so it scrapes over the edge instead of sinking into it.
  startTumble(s: { coverage: number; voidX: number; voidZ: number }) {
    if (this.tumbling) return;
    this.tumbling = true;
    this.settle = 0;
    this.controller.grounded = false;

    // Not leaning (e.g. the tile vanished under it): the old pivot is stale, the edge point is the car itself
    if (this.leanAmount < 0.02) {
      this.pivotX = 0;
      this.pivotZ = 0;
    }

    // Carry the visual lean into the body so nothing pops
    const yaw = this.yaw;
    const half = yaw / 2;
    const yawQ = new THREE.Quaternion(0, Math.sin(half), 0, Math.cos(half));
    this.leanEuler.set(this.leanPitch, 0, this.leanRoll);
    this.leanQuat.setFromEuler(this.leanEuler);
    this.pivot.set(this.pivotX, -0.25 * this.scale, this.pivotZ);
    const offset = this.pivot.clone().sub(this.pivot.clone().applyQuaternion(this.leanQuat)).applyQuaternion(yawQ);
    const p = this.body.translation();
    const q = yawQ.multiply(this.leanQuat);
    this.leanPitch = 0;
    this.leanRoll = 0;

    this.body.setEnabledRotations(true, true, true, true);
    this.body.setTranslation({ x: p.x + offset.x, y: p.y + offset.y, z: p.z + offset.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);

    // Tip toward the void (right-hand rotation about the axis that drops the void side), and swing the
    // nose toward the heavy corner: a corner hanging out front-right turns the car right, back-right left.
    const out = 1 - s.coverage;
    const dx = s.voidX;
    const dz = s.voidZ;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const lf = dx * fx + dz * fz; // void direction along the car's nose
    const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw); // ... and across it (right is +)
    this.body.setAngvel({ x: dz * TIP_SPIN * out, y: -YAW_SPIN * 2 * lx * lf * out, z: -dx * TIP_SPIN * out }, true);

    this.applyGroups();
    this.collider.setFriction(TUMBLE_FRICTION);
    this.collider.setRestitution(TUMBLE_BOUNCE);
  }

  // Back to normal driving: level, locked to yaw only, standing on the floor
  private endTumble() {
    this.tumbling = false;
    this.settle = 0;
    const yaw = this.yaw;
    const p = this.body.translation();
    this.body.setEnabledRotations(false, true, false, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setTranslation({ x: p.x, y: 0.25 * this.scale, z: p.z }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const v = this.body.linvel();
    this.body.setLinvel({ x: v.x, y: 0, z: v.z }, true);
    this.applyGroups();
    this.collider.setFriction(0);
    this.collider.setRestitution(0);
    this.teleported = true;
  }

  // Which cars this one can hit right now: depends on tumbling and the knock-off setting
  private knock = settings.knockOffCars;
  private applyGroups() {
    this.collider.setCollisionGroups(groups(this.tumbling, this.knock));
  }

  // Live from the settings panel: tumbling cars can (or cannot) knock driving cars around
  setKnock(on: boolean) {
    if (on === this.knock) return;
    this.knock = on;
    this.applyGroups();
  }

  // Call every physics tick for a tumbling car, before world.step()
  tumbleTick(dt: number) {
    if (!this.tumbling || this.fallen) return;
    const p = this.body.translation();
    const s = this.grid.footprintSample(p.x, p.z, this.yaw, this.halfWidth, this.halfLength, this.sample);
    // Some of it is still over a tile: keep nudging it toward the void so it cannot balance on the edge
    if (s.coverage > 0.02 && s.coverage < 1) {
      const v = this.body.linvel();
      const push = TUMBLE_PUSH * (1 - s.coverage) * dt;
      this.body.setLinvel({ x: v.x + s.voidX * push, y: v.y, z: v.z + s.voidZ * push }, true);
    }
    // Landed back on the platform and calm: drive again (a car resting on the tiles must never stay stuck)
    const v = this.body.linvel();
    const calm = Math.hypot(v.x, v.y, v.z) < 1 && p.y < 0.6 * this.scale + 0.3;
    if (s.coverage >= settings.edgeSupport && calm) {
      this.settle += dt;
      if (this.settle >= SETTLE_TIME) this.endTumble();
    } else {
      this.settle = 0;
    }
  }

  // Drop the car from the sky onto a tile, facing the middle of the platform
  // facing: optional yaw override (radians, 0 = facing -Z)
  respawnAt(x: number, z: number, facing?: number) {
    const yaw = facing ?? (Math.hypot(x, z) > 0.5 ? Math.atan2(x, z) : 0);
    if (this.tumbling) {
      this.tumbling = false;
      this.settle = 0;
      this.body.setEnabledRotations(false, true, false, true);
      this.applyGroups();
      this.collider.setFriction(0);
      this.collider.setRestitution(0);
    }
    this.leanPitch = 0;
    this.leanRoll = 0;
    this.body.setEnabled(true);
    this.body.setTranslation({ x, y: RESPAWN_HEIGHT, z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.mesh.visible = true;
    this.fallen = false;
    this.respawnDelay = 0;
    this.doomedAt = -1;
    this.teleported = true;
  }

  // The car went off the platform: hide it until it drops back in
  markFallen() {
    this.fallen = true;
    this.body.setEnabled(false);
    this.mesh.visible = false;
  }

  eliminate() {
    this.eliminated = true;
    this.markFallen();
  }

  // New match: full lives, back in the game
  reset() {
    this.lives = this.maxLives;
    this.eliminated = false;
    this.doomedAt = -1;
  }

  // Call at the start of every physics tick, before moving anything
  beginTick() {
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
  }

  // Call at the end of every physics tick
  endTick() {
    this.currPos.copy(this.body.translation());
    this.currQuat.copy(this.body.rotation());
    if (this.teleported) {
      // Don't smear a respawn jump across the screen
      this.prevPos.copy(this.currPos);
      this.prevQuat.copy(this.currQuat);
      this.teleported = false;
    }
  }

  // How far the car is leaning over an edge right now (radians, 0 = level)
  get leanAmount() {
    return Math.hypot(this.leanPitch, this.leanRoll);
  }

  // World position of one wheel: a = +1 front / -1 back, b = +1 right / -1 left
  wheelPoint(a: number, b: number, out: { x: number; z: number }) {
    const yaw = this.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    out.x = this.x + fx * this.halfLength * WHEEL_Z * a + rx * this.halfWidth * WHEEL_X * b;
    out.z = this.z + fz * this.halfLength * WHEEL_Z * a + rz * this.halfWidth * WHEEL_X * b;
  }

  // World position of the tile edge the car is tipping over (for sparks and dust). Only meaningful
  // while leanAmount > 0.
  edgePoint(out: { x: number; z: number }) {
    const yaw = this.yaw;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    out.x = this.x + this.pivotX * c + this.pivotZ * s;
    out.z = this.z - this.pivotX * s + this.pivotZ * c;
  }

  // Look at the four wheels: each one that is off the tiles sags. Right side out = roll right, nose out =
  // nose dips. Purely visual (the body stays level); call once per rendered frame, before render().
  updateLean(dt: number) {
    let targetPitch = 0;
    let targetRoll = 0;
    // Only while resting on the floor: in the air or after a fall the car does not lean
    if (!this.fallen && !this.tumbling && this.mesh.visible && this.y < 0.25 * this.scale + 0.3) {
      const yaw = this.yaw;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      let front = 0;
      let back = 0;
      let left = 0;
      let right = 0;
      for (const a of [-1, 1]) {
        for (const b of [-1, 1]) {
          // a = +1 front, -1 back (forward is -Z at yaw 0, so front is along f); b = +1 right, -1 left
          const wx = this.x + fx * this.halfLength * WHEEL_Z * a + rx * this.halfWidth * WHEEL_X * b;
          const wz = this.z + fz * this.halfLength * WHEEL_Z * a + rz * this.halfWidth * WHEEL_X * b;
          if (this.grid.isSolidAt(wx, wz)) continue;
          if (a > 0) front++;
          else back++;
          if (b > 0) right++;
          else left++;
        }
      }
      targetPitch = -((front - back) / 2) * LEAN_MAX; // front wheels out: nose down (negative about X)
      targetRoll = -((right - left) / 2) * LEAN_MAX; // right wheels out: right side down (negative about Z)

      // The car tips over the tile edge, not around its own center: find where the edge is along the lean
      // direction (the last solid point between the car's center and the wheels) and pivot there.
      const edgeAlong = (dx: number, dz: number, maxDist: number) => {
        const steps = 8;
        for (let i = 1; i <= steps; i++) {
          const d = (maxDist * i) / steps;
          if (!this.grid.isSolidAt(this.x + dx * d, this.z + dz * d)) return (maxDist * (i - 1)) / steps;
        }
        return maxDist;
      };
      if (right !== left) {
        const s = right > left ? 1 : -1;
        this.pivotX = s * edgeAlong(rx * s, rz * s, this.halfWidth * WHEEL_X);
      }
      if (front !== back) {
        const s = front > back ? 1 : -1;
        this.pivotZ = -s * edgeAlong(fx * s, fz * s, this.halfLength * WHEEL_Z); // front is -Z in the car's own axes
      }
    }
    const k = 1 - Math.exp(-LEAN_SPEED * dt);
    this.leanPitch += (targetPitch - this.leanPitch) * k;
    this.leanRoll += (targetRoll - this.leanRoll) * k;
  }

  // Place the mesh part-way between the last two physics states
  render(alpha: number) {
    this.mesh.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.mesh.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
    // Lean on top of the heading (in the car's own axes)
    this.leanEuler.set(this.leanPitch, 0, this.leanRoll);
    this.leanQuat.setFromEuler(this.leanEuler);
    // Rotate around the edge point at wheel-bottom height instead of the car's center: the point stays
    // where it is, so the supported side keeps resting on the tile and does not sink into it.
    this.pivot.set(this.pivotX, -0.25 * this.scale, this.pivotZ);
    this.pivotOffset.copy(this.pivot).sub(this.pivotRotated.copy(this.pivot).applyQuaternion(this.leanQuat));
    this.pivotOffset.applyQuaternion(this.mesh.quaternion); // into world space (heading only, before the lean)
    this.mesh.position.add(this.pivotOffset);
    this.mesh.quaternion.multiply(this.leanQuat);
    // The reflection only shows while the car is resting over solid tiles (not while falling or over a gap)
    const show = this.reflectionOn && !this.tumbling && this.mesh.visible &&this.y < 1.2 && this.grid.isFootprintSolid(this.x, this.z, this.yaw, this.halfWidth, this.halfLength, 0.9);
    this.reflection.visible = show;
    if (show) {
      this.mesh.updateMatrix();
      this.reflection.matrix.copy(MIRROR).multiply(this.mesh.matrix);
      this.reflection.matrixWorldNeedsUpdate = true;
    }
  }

  dispose() {
    this.world.removeRigidBody(this.body);
    this.scene.remove(this.mesh);
    this.scene.remove(this.reflection);
    this.reflectionMat.dispose();
  }
}
