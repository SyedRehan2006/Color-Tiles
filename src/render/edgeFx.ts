import * as THREE from "three";
import { Particles } from "./tireFx";
import { edgefx } from "./fxParams";
import type { Racer } from "../game/racer";

// Dust and sparks thrown up from the tyres while a car scrapes over a tile edge, and a small burst when it
// goes over. Works in every theme (the tire effects only run in cyberpunk 5/6). The colors follow the car:
// dust is the car's color mixed toward purple (same as the tire smoke), sparks are the car's color.
// Decoration only: nothing here touches physics. Tunable in the visual panel (edgefx in fxParams.ts).
// Call update() once per rendered frame after the cars are placed; call burst() when a car starts to tumble.

const SPARK_MAX = 300;
const DUST_MAX = 250;
const NEAR = 45; // m: only cars this close to the camera target make effects
const LEAN_MIN = 0.08; // rad: a car leaning less than this is not scraping the edge
const WHEEL_REACH = 1.3; // wheels within this many car-scales of the edge point throw dust

export class EdgeFx {
  readonly group = new THREE.Group();
  private time = 0;
  private sparks = new Particles(SPARK_MAX, -14, 0.6, -0.6, 3);
  private dust = new Particles(DUST_MAX, 0.5, 2.2, 1.6, 1.5);
  private acc = new WeakMap<Racer, { spark: number; dust: number }>();
  private dustColor = new THREE.Color();
  private sparkColor = new THREE.Color();
  private purple = new THREE.Color(0x8a3bff);
  private pt = { x: 0, z: 0 };
  private wheel = { x: 0, z: 0 };

  constructor(scene: THREE.Scene) {
    this.dust.points.renderOrder = 5;
    this.sparks.points.renderOrder = 6;
    this.group.add(this.dust.points, this.sparks.points);
    scene.add(this.group);
  }

  private colors(r: Racer) {
    this.sparkColor.setHex(r.carColor);
    this.dustColor.setHex(r.carColor).lerp(this.purple, edgefx.dustColorMix);
  }

  private spark(x: number, z: number, vx: number, vz: number, up: number, spread: number) {
    this.sparks.spawn(
      x, 0.06, z,
      vx * 0.3 + (Math.random() - 0.5) * spread, up * (0.5 + Math.random()), vz * 0.3 + (Math.random() - 0.5) * spread,
      this.time, 0.25 + Math.random() * 0.25, edgefx.sparkSize, this.sparkColor,
    );
  }

  private puff(x: number, z: number, vx: number, vz: number) {
    this.dust.spawn(
      x, 0.1, z,
      vx * 0.15 + (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.5, vz * 0.15 + (Math.random() - 0.5) * 0.8,
      this.time, edgefx.dustLife * (0.7 + Math.random() * 0.6), edgefx.dustSize * (0.7 + Math.random() * 0.6), this.dustColor,
    );
  }

  // The wheels nearest the edge the car is tipping over: that is where the dust and sparks come from
  private edgeWheels(r: Racer, fn: (x: number, z: number) => void) {
    r.edgePoint(this.pt);
    const reach = WHEEL_REACH * r.carScale;
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        r.wheelPoint(a, b, this.wheel);
        if (Math.hypot(this.wheel.x - this.pt.x, this.wheel.z - this.pt.z) <= reach) fn(this.wheel.x, this.wheel.z);
      }
    }
  }

  // A car just lost its footing: a small puff and a few sparks from the wheels at the edge.
  // strength 0..1 (how fast it was going).
  burst(r: Racer, strength: number) {
    if (!edgefx.enabled || !edgefx.burst) return;
    this.colors(r);
    const v = r.body.linvel();
    this.edgeWheels(r, (x, z) => {
      if (edgefx.dust) for (let i = 0; i < 2 + Math.round(2 * strength); i++) this.puff(x, z, v.x, v.z);
      if (edgefx.sparks) for (let i = 0; i < 1 + Math.round(3 * strength * edgefx.sparkAmount * 2); i++) this.spark(x, z, v.x, v.z, 3, 4);
    });
  }

  update(dt: number, racers: Racer[], focus: THREE.Vector3) {
    this.time += dt;
    this.sparks.material.uniforms.uTime.value = this.time;
    this.dust.material.uniforms.uTime.value = this.time;
    this.sparks.material.uniforms.uBright.value = edgefx.sparkBrightness;
    this.dust.material.uniforms.uBright.value = edgefx.dustBrightness;
    if (edgefx.enabled) this.emit(dt, racers, focus);
    this.sparks.flush();
    this.dust.flush();
  }

  private emit(dt: number, racers: Racer[], focus: THREE.Vector3) {
    for (const r of racers) {
      if (r.fallen || !r.mesh.visible) continue;
      if (Math.hypot(r.mesh.position.x - focus.x, r.mesh.position.z - focus.z) > NEAR) continue;
      const v = r.body.linvel();
      const speed = Math.hypot(v.x, v.z);
      // Scraping: leaning over the edge while moving, or a tumbling car still sliding along the tile
      const leaning = !r.tumbling && r.leanAmount > LEAN_MIN && speed > 1.5;
      const sliding = r.tumbling && r.y < 0.8 * r.carScale + 0.3 && speed > 3;
      if (!leaning && !sliding) continue;

      let a = this.acc.get(r);
      if (!a) {
        a = { spark: 0, dust: 0 };
        this.acc.set(r, a);
      }
      const k = leaning ? Math.min(1, r.leanAmount / 0.3) : 1; // harder lean = more
      a.spark += edgefx.sparks ? (3 + speed * 0.25) * edgefx.sparkAmount * k * dt : 0;
      a.dust += edgefx.dust ? (6 + speed * 0.35) * edgefx.dustAmount * k * dt : 0;
      if (a.spark < 1 && a.dust < 1) continue;

      this.colors(r);
      // Spread this frame's particles over the wheels that are at the edge (or any wheel, while sliding)
      const points: [number, number][] = [];
      if (leaning) this.edgeWheels(r, (x, z) => points.push([x, z]));
      else
        for (const w of [-1, 1])
          for (const s of [-1, 1]) {
            r.wheelPoint(w, s, this.wheel);
            points.push([this.wheel.x, this.wheel.z]);
          }
      if (points.length === 0) continue;
      while (a.spark >= 1) {
        a.spark -= 1;
        const [x, z] = points[Math.floor(Math.random() * points.length)];
        this.spark(x, z, v.x, v.z, 2.5, 3);
      }
      while (a.dust >= 1) {
        a.dust -= 1;
        const [x, z] = points[Math.floor(Math.random() * points.length)];
        this.puff(x, z, v.x, v.z);
      }
    }
  }

  // Remove everything on screen (match restart)
  clear() {
    this.sparks.clear();
    this.dust.clear();
  }
}
