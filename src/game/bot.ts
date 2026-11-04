import { CAR_PARAMS } from "./carController";
import type { DriveInput } from "./input";
import type { RoundState } from "./round";
import type { TileGrid } from "./tileGrid";

// What a bot is allowed to know about its own car
export interface BotCar {
  x: number;
  z: number;
  yaw: number; // radians, 0 = facing -Z
  forwardSpeed: number; // m/s
}

// What a bot is allowed to know about the match: the same things a player can see on screen
export interface BotWorld {
  grid: TileGrid;
  state: RoundState;
  round: number;
  targetColor: number;
  skill: number; // 1..10, from the settings panel
  mix: number; // 0 = mostly clumsy bots, 1 = mixed, 2 = mostly sharp bots
  cars: { x: number; z: number }[]; // every car on the platform, this bot's own included
}

// Bot personalities. Each is a set of numbers that bends the skill-based behavior.
export type BotArchetype = "pro" | "average" | "newbie" | "chaotic";

interface Traits {
  skillBias: number; // added to skill (0..1)
  reactionScale: number; // multiplies the reaction time (below 1 = faster)
  speedFactor: number; // multiplies top speed
  slopScale: number; // multiplies the aim error on the tile
  randomPick: number; // chance to pick any target tile instead of a near one
  wrongColor: number; // chance to head for a tile that is NOT the called color
  freeze: number; // chance to hesitate for an extra moment at the start of a round
  avoidRivals: boolean; // prefers target tiles that rivals are not closer to
  retarget: boolean; // changes its mind partway through a round
}

const TRAITS: Record<BotArchetype, Traits> = {
  pro: { skillBias: 0.25, reactionScale: 0.7, speedFactor: 1, slopScale: 0.5, randomPick: 0, wrongColor: 0, freeze: 0.02, avoidRivals: true, retarget: false },
  average: { skillBias: 0, reactionScale: 1, speedFactor: 1, slopScale: 1, randomPick: 0, wrongColor: 0, freeze: 0.08, avoidRivals: false, retarget: false },
  newbie: { skillBias: -0.25, reactionScale: 1.4, speedFactor: 0.9, slopScale: 1.5, randomPick: 0.4, wrongColor: 0, freeze: 0.35, avoidRivals: false, retarget: false },
  chaotic: { skillBias: 0.1, reactionScale: 0.8, speedFactor: 1.05, slopScale: 2, randomPick: 0.1, wrongColor: 0.15, freeze: 0.2, avoidRivals: false, retarget: true },
};

// Cumulative thresholds over a roll of 0..1: below pro = pro, below average = average, and so on
const MIXES = [
  { pro: 0, average: 0.25, newbie: 0.75 }, // 0 mostly clumsy: 25% average, 50% newbie, 25% chaotic
  { pro: 0.2, average: 0.6, newbie: 0.85 }, // 1 mixed: 20% pro, 40% average, 25% newbie, 15% chaotic
  { pro: 0.5, average: 0.9, newbie: 0.9 }, // 2 mostly sharp: 50% pro, 40% average, 10% chaotic
];

export function archetypeFor(roll: number, mix: number): BotArchetype {
  const m = MIXES[Math.min(2, Math.max(0, Math.round(mix)))];
  if (roll < m.pro) return "pro";
  if (roll < m.average) return "average";
  if (roll < m.newbie) return "newbie";
  return "chaotic";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// One computer driver. It produces the same DriveInput a keyboard does, so bots go through exactly
// the same CarController as the player. Pure logic (no Three.js, Rapier or DOM), so the server can
// run it later.
//
// Skill (1..10) changes three things, with a small personal offset so bots differ from each other:
//   - how long it takes to react after a color is called
//   - how many of the closest target tiles it might pick from (the best one, or just a near one)
//   - how far off the middle of the tile it aims
export class BotBrain {
  // roll (0..1) decides which personality this bot gets; the match spreads the rolls so bots differ
  private roll: number;
  constructor(roll = Math.random()) {
    this.roll = roll;
  }

  get archetype(): BotArchetype {
    return this.lastArchetype;
  }
  private lastArchetype: BotArchetype = "average";
  private runTime = 0; // s since the current round started
  private retargetAt = Infinity;
  private personal = (Math.random() - 0.5) * 0.3; // -0.15 .. +0.15 added to skill (0..1)
  private lastRound = -1;
  private wait = 0; // s of reaction time left
  private targetX = 0;
  private targetZ = 0;
  private hasTarget = false;
  private wanderTimer = 0;

  drive(car: BotCar, w: BotWorld, dt: number): DriveInput {
    this.lastArchetype = archetypeFor(this.roll, w.mix);
    const t = TRAITS[this.lastArchetype];
    const s = clamp((w.skill - 1) / 9 + this.personal + t.skillBias, 0, 1);

    if (w.state === "running") {
      if (w.round !== this.lastRound) {
        this.lastRound = w.round;
        this.wait = (2.0 - 1.85 * s + Math.random() * 0.4) * t.reactionScale;
        if (Math.random() < t.freeze) this.wait += 0.5 + Math.random() * 0.7; // hesitates
        this.runTime = 0;
        this.retargetAt = t.retarget ? 1 + Math.random() * 1.5 : Infinity;
        this.pickTarget(car, w, s, t, true);
      }
      this.runTime += dt;
      if (this.runTime >= this.retargetAt) {
        this.retargetAt = Infinity;
        this.pickTarget(car, w, s, t, false); // changes its mind, to a correct tile
      }
      if (this.wait > 0) {
        this.wait -= dt;
        return this.goTo(car, car.x, car.z, 0); // still thinking: roll to a stop
      }
      if (!this.hasTarget) return this.wander(car, w, dt);
      return this.goTo(car, this.targetX, this.targetZ, CAR_PARAMS.maxForward * (0.85 + 0.15 * s) * t.speedFactor);
    }

    if (w.state === "roam") return this.wander(car, w, dt);
    return this.goTo(car, car.x, car.z, 0); // tiles just vanished: stay put
  }

  // Choose a target tile. mistakes = false means "pick sensibly" (used when a bot changes its mind).
  private pickTarget(car: BotCar, w: BotWorld, s: number, t: Traits, mistakes: boolean) {
    const g = w.grid;

    // A mistake: head for a tile that is not the called color (it will vanish)
    if (mistakes && Math.random() < t.wrongColor) {
      const wrong: number[] = [];
      for (let i = 0; i < g.alive.length; i++) if (g.alive[i] && g.colors[i] !== w.targetColor) wrong.push(i);
      if (wrong.length > 0) {
        const c = g.centerOf(wrong[Math.floor(Math.random() * wrong.length)]);
        this.targetX = c.x;
        this.targetZ = c.z;
        this.hasTarget = true;
        return;
      }
    }

    const options: { i: number; d: number; cost: number }[] = [];
    for (let i = 0; i < g.alive.length; i++) {
      if (!g.alive[i] || g.colors[i] !== w.targetColor) continue;
      const c = g.centerOf(i);
      const d = Math.hypot(c.x - car.x, c.z - car.z);
      let cost = d;
      if (t.avoidRivals) {
        // Every rival that is closer to this tile than we are makes it a worse choice
        for (const o of w.cars) {
          if (Math.hypot(o.x - car.x, o.z - car.z) < 0.05) continue; // that is us
          if (Math.hypot(c.x - o.x, c.z - o.z) < d) cost += 5;
        }
      }
      options.push({ i, d, cost });
    }
    if (options.length === 0) {
      this.hasTarget = false;
      return;
    }

    let pick: number;
    if (t.avoidRivals) {
      options.sort((a, b) => a.cost - b.cost);
      pick = options[0].i;
    } else if (mistakes && Math.random() < t.randomPick) {
      pick = options[Math.floor(Math.random() * options.length)].i;
    } else {
      options.sort((a, b) => a.d - b.d);
      const k = Math.min(options.length, 1 + Math.floor((1 - s) * 3));
      pick = options[Math.floor(Math.random() * k)].i;
    }
    const c = g.centerOf(pick);
    const slop = Math.min((1 - s) * 2 * t.slopScale, g.tileSize * 0.3);
    this.targetX = c.x + (Math.random() * 2 - 1) * slop;
    this.targetZ = c.z + (Math.random() * 2 - 1) * slop;
    this.hasTarget = true;
  }

  // Between rounds: potter about the platform, away from the very edge
  private wander(car: BotCar, w: BotWorld, dt: number): DriveInput {
    this.wanderTimer -= dt;
    const arrived = Math.hypot(this.targetX - car.x, this.targetZ - car.z) < 2;
    if (this.wanderTimer <= 0 || arrived || !this.hasTarget) {
      const g = w.grid;
      const minRing = g.ringsLeft > 2 ? g.ringsRemoved + 1 : g.ringsRemoved;
      const list: number[] = [];
      for (let i = 0; i < g.present.length; i++) if (g.present[i] && g.ringOf(i) >= minRing) list.push(i);
      if (list.length === 0) return this.goTo(car, car.x, car.z, 0);
      const c = g.centerOf(list[Math.floor(Math.random() * list.length)]);
      this.targetX = c.x;
      this.targetZ = c.z;
      this.hasTarget = true;
      this.wanderTimer = 2 + Math.random() * 2;
    }
    return this.goTo(car, this.targetX, this.targetZ, 5);
  }

  // Steer toward a point, and slow down on the way in so the car stops on it instead of overshooting.
  private goTo(car: BotCar, tx: number, tz: number, maxSpeed: number): DriveInput {
    const dx = tx - car.x;
    const dz = tz - car.z;
    const dist = Math.hypot(dx, dz);
    let steer = 0;
    let desired = 0;
    if (dist > 1 && maxSpeed > 0) {
      const fx = -Math.sin(car.yaw);
      const fz = -Math.cos(car.yaw);
      const rx = Math.cos(car.yaw);
      const rz = -Math.sin(car.yaw);
      const angle = Math.atan2((dx * rx + dz * rz) / dist, (dx * fx + dz * fz) / dist);
      steer = clamp(angle * 2, -1, 1);
      // Fastest speed from which the car can still stop in time (a little under CAR_PARAMS.stopBrake)
      desired = Math.min(maxSpeed, Math.sqrt(2 * CAR_PARAMS.stopBrake * 0.8 * dist));
      // Target off to the side or behind: slow right down, or the car just circles it (it turns in
      // a circle of about speed / 2.6 meters, which is wider than the gap if it comes in too fast)
      if (Math.abs(angle) > 0.8) desired = Math.min(desired, Math.max(2, dist * 1.2));
    }
    let throttle = 0;
    if (car.forwardSpeed < desired - 0.5) throttle = 1;
    else if (car.forwardSpeed > desired + 1.5) throttle = -1;
    return { throttle, steer, handbrake: false, jumpPressed: false };
  }
}
