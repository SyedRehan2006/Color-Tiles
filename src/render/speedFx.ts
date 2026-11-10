import { speedfx } from "./fxParams";

// What the followed car is doing, as far as the speed effects care
export interface SpeedInput {
  speed: number; // m/s along the car's heading (sign ignored)
  grounded: boolean;
  drifting: boolean;
  vy: number; // vertical velocity, m/s
  steer: number; // -1 (left) .. 1 (right)
}

// Turns the car's motion into three smooth numbers: `level` (0..1, how fast it feels: drives the blur,
// lines, FOV), `roll` (radians, camera lean) and `shake` (0..1, landing thump). Cyberpunk 6 only.
export class SpeedFx {
  level = 0;
  roll = 0;
  shake = 0;
  private prevGrounded = true;
  private prevVy = 0;

  reset() {
    this.level = 0;
    this.roll = 0;
    this.shake = 0;
    this.prevGrounded = true;
    this.prevVy = 0;
  }

  update(dt: number, car: SpeedInput | null) {
    const p = speedfx;
    if (!car || !p.enabled) {
      // Fade everything out
      this.level += (0 - this.level) * (1 - Math.exp(-6 * dt));
      this.roll += (0 - this.roll) * (1 - Math.exp(-6 * dt));
      this.shake *= Math.exp(-9 * dt);
      return;
    }
    const range = Math.max(p.fullSpeed - p.startSpeed, 0.1);
    let target = Math.min(1, Math.max(0, (Math.abs(car.speed) - p.startSpeed) / range));
    if (car.drifting) target = Math.min(1, target + p.driftBoost);
    // Builds up quickly, fades out a little slower
    const rate = target > this.level ? 5 : 2.5;
    this.level += (target - this.level) * (1 - Math.exp(-rate * dt));

    // A hard landing gives a thump that dies out fast
    if (car.grounded && !this.prevGrounded && this.prevVy < -4) {
      this.shake = Math.max(this.shake, Math.min(1, -this.prevVy / 16));
    }
    this.shake *= Math.exp(-9 * dt);
    this.prevGrounded = car.grounded;
    this.prevVy = car.vy;

    // The camera leans into turns, more the faster you go (right turn = lean right)
    const rollTarget = -car.steer * this.level * (p.roll * Math.PI) / 180;
    this.roll += (rollTarget - this.roll) * (1 - Math.exp(-6 * dt));
  }
}
