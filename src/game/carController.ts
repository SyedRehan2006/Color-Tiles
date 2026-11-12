import type { RigidBody } from "@dimforge/rapier3d-compat";
import type { DriveInput } from "./input";
import type { TileGrid } from "./tileGrid";
import { settings } from "./settings";

const FIXED_STEP = 1 / 60; // the physics tick (same as FIXED_DT in main.ts)

// Starting values from docs/mechanics/01_driving.md. All are placeholders to tune by feel.
// The world's gravity must be 36 m/s^2 for the jump numbers below to make sense.
export const CAR_PARAMS = {
  maxForward: 40, // m/s
  maxReverse: 10, // m/s
  accel: 40, // m/s^2
  brake: 40, // m/s^2 (W while rolling backward)
  stopBrake: 35, // m/s^2 (S while moving forward): gradual, 15 m/s takes about 1 s to stop
  drag: 0.5, // 1/s, rolling resistance when no throttle
  gripNormal: 5, // 1/s, how fast sideways sliding dies out
  maxYaw: 2.6, // rad/s at full steering
  steerSmoothing: 12, // 1/s, makes keyboard steering ease in and out
  yawFullSpeed: 3, // m/s: at or above this speed steering is at full strength

  // Handbrake: lower grip so the car slides, faster turning, and a speed cost
  gripHandbrake: 1.5, // 1/s
  maxYawHandbrake: 3.6, // rad/s
  dragHandbrake: 1.0, // 1/s extra forward drag while sliding
  handbrakeMinSpeed: 5, // m/s: below this the handbrake does nothing (no spinning in place)

  // Jump (only from the ground)
  jumpVelocity: 12,  // m/s up. With gravity 36: about 1.1 m high, 0.5 s in the air
  coyoteTime: 0.08, // s: can still jump this long after leaving the ground
  jumpBuffer: 0.1, // s: a Space press this long before landing still counts

  // In the air
  airSteer: 0.4, // fraction of ground turning
  airThrottle: 0.2, // fraction of ground acceleration
  airGrip: 0.3, // 1/s

  // Height of the car body's center when resting on the floor (half the car's height)
  rideHeight: 0.25,

  // Car footprint (half sizes at scale 1, matches the collider and the model)
  halfWidth: 0.5,
  halfLength: 1,
  // The car stands while at least this fraction of its footprint is over solid tiles, and falls
  // below it (0.5 = it falls once half of it hangs over the void)
  minSupport: 0.5,
};

// Reads DriveInput and drives one Rapier body. Per physics tick, call:
//   update(input, dt)  ->  world.step()  ->  resolveGround()
//
// The floor is NOT a physics collider. Rapier floors (one box per tile, or a voxel grid) made the
// car stutter at tile seams (measured in tests), so the floor is a rule instead: if the tile under
// the whole car (all four corners) is over solid tiles it rests on them; if any corner hangs over
// a gap the car falls. This is the same rule the server will use. Rapier still does gravity and the car body.
export class CarController {
  private steer = 0; // smoothed steering
  private coyote = 0; // seconds of "still counts as grounded" left
  private jumpBuffered = 0; // seconds of "jump was pressed" left
  private reverseHold = 0; // seconds S has been held while stopped
  private yawFullAt = CAR_PARAMS.yawFullSpeed; // m/s where steering reaches full strength right now (eased)
  private sample = { coverage: 1, voidX: 0, voidZ: 0 };
  private body: RigidBody;
  private grid: TileGrid;
  private p: typeof CAR_PARAMS;

  grounded = false;
  drifting = false;
  slip = 0; // sideways speed before grip acts on it, m/s (for the tire effects)
  hardBraking = false; // braking from a fast speed (for the tire effects)

  constructor(body: RigidBody, grid: TileGrid, params = CAR_PARAMS) {
    this.body = body;
    this.grid = grid;
    this.p = { ...params }; // own copy, so one car's scale doesn't change the others
    this.base = { rideHeight: params.rideHeight, halfWidth: params.halfWidth, halfLength: params.halfLength };
  }

  private base: { rideHeight: number; halfWidth: number; halfLength: number };

  // Scale the footprint and ride height (the car's size multiplier from the settings panel)
  setScale(s: number) {
    this.p.rideHeight = this.base.rideHeight * s;
    this.p.halfWidth = this.base.halfWidth * s;
    this.p.halfLength = this.base.halfLength * s;
  }

  // Call right after world.step(). Holds the car on the floor, or lets it fall.
  // Returns the footprint sample (coverage and the direction of the void) when the car just lost its
  // footing at floor height: that is the moment it starts to tumble off the edge. Otherwise null.
  resolveGround(): { coverage: number; voidX: number; voidZ: number } | null {
    const pos = this.body.translation();
    const v = this.body.linvel();
    const q = this.body.rotation();
    const yaw = 2 * Math.atan2(q.y, q.w);
    const s = this.grid.footprintSample(pos.x, pos.z, yaw, this.p.halfWidth, this.p.halfLength, this.sample);
    const solid = s.coverage >= settings.edgeSupport;
    // Below about half a meter the car has dropped past the tile edge and can't climb back onto it
    if (solid && pos.y <= this.p.rideHeight && pos.y > -0.5 && v.y <= 0) {
      // Landed (or resting): put the car exactly on the floor and stop its fall
      this.body.setTranslation({ x: pos.x, y: this.p.rideHeight, z: pos.z }, true);
      // Edge pull: a car with part of itself over the void slides toward it, harder the more is out.
      // This is what makes hanging at the edge costly. 0 = no pull (the car just sits there).
      let vx = v.x;
      let vz = v.z;
      if (settings.edgePull > 0 && s.coverage < 1) {
        const pull = settings.edgePull * (1 - s.coverage) * FIXED_STEP;
        vx += s.voidX * pull;
        vz += s.voidZ * pull;
      }
      this.body.setLinvel({ x: vx, y: 0, z: vz }, true);
      this.grounded = true;
      return null;
    }
    this.grounded = false;
    // Lost its footing while at floor height (or lower, still within reach of the tile): tumble
    return !solid && pos.y <= this.p.rideHeight + 0.05 && pos.y > -0.5 ? s : null;
  }

  update(input: DriveInput, dt: number) {
    const p = this.p;
    const q = this.body.rotation();
    const v = this.body.linvel();

    // The car only rotates around Y, so its heading comes straight from the quaternion.
    // Forward is -Z at yaw 0. sin(yaw) = 2*qy*qw, cos(yaw) = qw^2 - qy^2.
    const sinYaw = 2 * q.y * q.w;
    const cosYaw = q.w * q.w - q.y * q.y;
    const fx = -sinYaw;
    const fz = -cosYaw;
    const rx = cosYaw;
    const rz = -sinYaw;

    // Split velocity into forward and sideways parts
    let vF = v.x * fx + v.z * fz;
    let vL = v.x * rx + v.z * rz;

    // Handbrake only works on the ground and above a minimum speed
    const speed = Math.hypot(vF, vL);
    this.drifting = input.handbrake && this.grounded && speed >= p.handbrakeMinSpeed;

    // Throttle, brake, drag. In the air there is less push and no rolling drag.
    const air = this.grounded ? 1 : p.airThrottle;
    if (input.throttle > 0) {
      const a = vF < 0 ? p.brake : p.accel * air;
      vF = Math.min(vF + a * dt, Math.max(p.maxForward, vF));
    } else if (input.throttle < 0) {
      if (vF > 0) {
        // Moving forward: S is a brake. It stops at zero and does not roll on into reverse.
        vF = Math.max(vF - p.stopBrake * dt, 0);
        this.reverseHold = 0;
      } else {
        // Stopped (or already rolling back): reverse only starts after S has been held for reverseDelay
        this.reverseHold += dt;
        if (this.reverseHold >= settings.reverseDelay) {
          vF = Math.max(vF - p.accel * air * dt, Math.min(-p.maxReverse, vF));
        }
      }
    } else if (this.grounded) {
      vF *= Math.exp(-p.drag * dt);
      // Coasting: an extra steady slowdown, so the slow creep at the end of a coast doesn't last for seconds
      if (input.throttle === 0) vF = Math.sign(vF) * Math.max(0, Math.abs(vF) - settings.coastBrake * dt);
    }
    if (this.drifting) vF *= Math.exp(-p.dragHandbrake * dt);
    if (input.throttle >= 0) this.reverseHold = 0; // S released: the next reverse waits again

    this.slip = Math.abs(vL);
    this.hardBraking = input.throttle < 0 && vF > 8;

    // Grip: sideways speed fades. exp() keeps this the same at any frame rate.
    const grip = !this.grounded ? p.airGrip : this.drifting ? p.gripHandbrake : p.gripNormal;
    vL *= Math.exp(-grip * dt);

    // Steering eases toward the input, and is weaker at low speed. Reversing flips it.
    this.steer += (input.steer - this.steer) * (1 - Math.exp(-p.steerSmoothing * dt));
    // While coasting (no throttle, not drifting) steering only reaches full strength at a higher speed, so a
    // slowly rolling car turns gently instead of swinging round. Eased, so letting go of W doesn't jolt.
    const coasting = input.throttle === 0 && !this.drifting;
    const fullAt = coasting ? Math.max(p.yawFullSpeed, settings.coastSteerSpeed) : p.yawFullSpeed;
    this.yawFullAt += (fullAt - this.yawFullAt) * (1 - Math.exp(-8 * dt));
    const speedFactor = Math.min(Math.abs(vF) / this.yawFullAt, 1) * Math.sign(vF);
    const maxYaw = (this.drifting ? p.maxYawHandbrake : p.maxYaw) * (this.grounded ? 1 : p.airSteer);
    const yawRate = -this.steer * maxYaw * speedFactor; // +steer = turn right = clockwise = negative Y

    // Jump: Space press is remembered briefly (buffer), and the car can jump for a
    // brief moment after leaving the ground (coyote time).
    this.coyote = this.grounded ? p.coyoteTime : Math.max(0, this.coyote - dt);
    this.jumpBuffered = input.jumpPressed ? p.jumpBuffer : Math.max(0, this.jumpBuffered - dt);
    let vy = v.y;
    if (this.jumpBuffered > 0 && this.coyote > 0) {
      vy = p.jumpVelocity;
      this.jumpBuffered = 0;
      this.coyote = 0;
    }

    // Put it back together
    this.body.setLinvel({ x: fx * vF + rx * vL, y: vy, z: fz * vF + rz * vL }, true);
    this.body.setAngvel({ x: 0, y: yawRate, z: 0 }, true);
  }

  // Speed along the facing direction, for the debug readout
  get forwardSpeed() {
    const q = this.body.rotation();
    const v = this.body.linvel();
    return v.x * -(2 * q.y * q.w) + v.z * -(q.w * q.w - q.y * q.y);
  }
}
