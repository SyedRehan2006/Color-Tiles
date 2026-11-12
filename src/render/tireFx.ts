import * as THREE from "three";
import { tirefx } from "./fxParams";

// Tire effects for cyberpunk 5: skid marks (glowing light trails in the car's color, or dark rubber),
// smoke puffs from the rear wheels, sparks on hard slides, and a puff when landing from a jump.
// All of it is drawn from small fixed pools (no allocation while playing), only as decoration: nothing
// here touches physics. Call update() once per rendered frame after the cars are placed.

const MARK_SEGMENTS = 1600; // skid mark pieces alive at once (oldest are reused)
const SMOKE_MAX = 500;
const SPARK_MAX = 300;
const MARK_Y = 0.03; // just above the tile surface
// Rear wheel positions of a car at scale 1 (they match the models in retroCars.ts); multiplied by the car's scale
const WHEEL_BACK = 0.62; // rear wheels sit this far behind the car's middle
const WHEEL_SIDE = 0.43;

// What the effects need to know about a car (a Racer fits)
export interface FxCar {
  mesh: THREE.Object3D;
  controller: { grounded: boolean; drifting: boolean; slip: number; hardBraking: boolean };
  body: { linvel(): { x: number; y: number; z: number } };
  fallen: boolean;
  isPlayer: boolean;
  y: number;
  carColor: number;
  carScale?: number; // size multiplier of the car (default 1): wheel positions, marks and puffs scale with it
}

const markVertex = /* glsl */ `
attribute vec3 aP0;
attribute vec3 aP1;
attribute vec4 aData; // birth time, strength, width
attribute vec3 aColor;
uniform float uTime, uLife, uKillStart, uKillDur;
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
void main() {
  vec3 dir = aP1 - aP0;
  vec3 d = dir / (length(dir) + 1e-5);
  vec3 side = vec3(-d.z, 0.0, d.x);
  float w = aData.z;
  vec3 along = mix(aP0 - d * w * 0.5, aP1 + d * w * 0.5, position.x);
  vec3 p = along + side * position.y * w * 0.5;
  float age = uTime - aData.x;
  float fade = clamp(1.0 - age / uLife, 0.0, 1.0);
  float kill = aData.x < uKillStart ? clamp(1.0 - (uTime - uKillStart) / uKillDur, 0.0, 1.0) : 1.0;
  vA = fade * aData.y * kill;
  vUv = position.xy;
  vCol = aColor;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const markFragment = /* glsl */ `
uniform float uBright;
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
void main() {
  float core = pow(max(1.0 - abs(vUv.y), 0.0), 1.5); // max: pow of a tiny negative is NaN on some GPUs
  #ifdef NEON
    gl_FragColor = vec4(vCol * uBright * core * vA, 1.0);
  #else
    gl_FragColor = vec4(0.03, 0.02, 0.05, core * vA * 0.6);
  #endif
  #include <colorspace_fragment>
}
`;

const puffVertex = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aVel;
attribute vec4 aData; // birth time, life, size, unused
attribute vec3 aColor;
uniform float uTime, uGrav, uDrag, uGrow;
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
void main() {
  float age = uTime - aData.x;
  float t = age / max(aData.y, 0.001);
  vUv = position.xy;
  vCol = aColor;
  if (age < 0.0 || t > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vA = 0.0;
    return;
  }
  vec3 p = aStart + aVel * ((1.0 - exp(-uDrag * age)) / uDrag) + vec3(0.0, uGrav * 0.5 * age * age, 0.0);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * aData.z * (1.0 + uGrow * t) * 0.5; // a quad that always faces the camera
  gl_Position = projectionMatrix * mv;
  vA = (1.0 - t) * smoothstep(0.0, 0.1, t);
}
`;

const puffFragment = /* glsl */ `
uniform float uBright, uPow;
varying vec2 vUv;
varying float vA;
varying vec3 vCol;
void main() {
  float d = length(vUv);
  float a = pow(max(1.0 - smoothstep(0.0, 1.0, d), 0.0), uPow);
  gl_FragColor = vec4(vCol * uBright * vA * a, 1.0);
  #include <colorspace_fragment>
}
`;

// A fixed pool of particles (a ring: the oldest is reused), drawn as camera-facing quads.
// Position, velocity, timing and color live in buffers.
export class Particles {
  readonly points: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private pos: Float32Array;
  private vel: Float32Array;
  private data: Float32Array;
  private col: Float32Array;
  private geo = new THREE.InstancedBufferGeometry();
  private attrs: THREE.InstancedBufferAttribute[] = [];
  private next = 0;
  private dirty = false;
  private max: number;

  constructor(max: number, grav: number, drag: number, grow: number, pow: number) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.data = new Float32Array(max * 4);
    this.col = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) this.data[i * 4] = -1e5;
    this.geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
    this.geo.setIndex([0, 1, 2, 2, 1, 3]);
    this.geo.instanceCount = max;
    const add = (name: string, a: Float32Array, n: number) => {
      const attr = new THREE.InstancedBufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute(name, attr);
      this.attrs.push(attr);
    };
    add("aStart", this.pos, 3);
    add("aVel", this.vel, 3);
    add("aData", this.data, 4);
    add("aColor", this.col, 3);
    this.material = new THREE.ShaderMaterial({
      vertexShader: puffVertex,
      fragmentShader: puffFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uGrav: { value: grav },
        uDrag: { value: drag },
        uGrow: { value: grow },
        uBright: { value: 1 },
        uPow: { value: pow },
      },
    });
    this.points = new THREE.Mesh(this.geo, this.material);
    this.points.frustumCulled = false;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, birth: number, life: number, size: number, c: THREE.Color) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.data.set([birth, life, size, 0], i * 4);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.dirty = true;
  }

  flush() {
    if (!this.dirty) return;
    for (const a of this.attrs) a.needsUpdate = true;
    this.dirty = false;
  }

  clear() {
    for (let i = 0; i < this.max; i++) this.data[i * 4] = -1e5;
    this.attrs[2].needsUpdate = true;
  }
}

interface WheelState {
  last: (THREE.Vector2 | null)[]; // where each rear wheel was when the last mark piece was laid
  smokeAcc: number[];
  sparkAcc: number[];
  wasGrounded: boolean;
  prevVy: number;
}

export class TireFx {
  readonly group = new THREE.Group();
  private time = 0;
  private marks: THREE.Mesh;
  private neonMat: THREE.ShaderMaterial;
  private rubberMat: THREE.ShaderMaterial;
  private aP0: THREE.InstancedBufferAttribute;
  private aP1: THREE.InstancedBufferAttribute;
  private aData: THREE.InstancedBufferAttribute;
  private aColor: THREE.InstancedBufferAttribute;
  private segIdx = 0;
  private smoke = new Particles(SMOKE_MAX, 0.7, 1.6, 2.2, 1.5);
  private sparks = new Particles(SPARK_MAX, -12, 0.6, -0.6, 3);
  private states = new Map<FxCar, WheelState>();
  private tmpColor = new THREE.Color();
  private smokeColor = new THREE.Color();
  private purple = new THREE.Color(0x8a3bff);

  constructor(scene: THREE.Scene) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    geo.instanceCount = MARK_SEGMENTS;
    const inst = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(MARK_SEGMENTS * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aP0 = inst(3);
    this.aP1 = inst(3);
    this.aData = inst(4);
    this.aColor = inst(3);
    for (let i = 0; i < MARK_SEGMENTS; i++) this.aData.array[i * 4] = -1e5;
    geo.setAttribute("aP0", this.aP0);
    geo.setAttribute("aP1", this.aP1);
    geo.setAttribute("aData", this.aData);
    geo.setAttribute("aColor", this.aColor);

    const uniforms = () => ({
      uTime: { value: 0 },
      uLife: { value: 3 },
      uKillStart: { value: -1e5 },
      uKillDur: { value: 0.4 },
      uBright: { value: 1.6 },
    });
    this.neonMat = new THREE.ShaderMaterial({
      vertexShader: markVertex,
      fragmentShader: markFragment,
      defines: { NEON: "" },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: uniforms(),
    });
    this.rubberMat = new THREE.ShaderMaterial({
      vertexShader: markVertex,
      fragmentShader: markFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: uniforms(),
    });
    this.marks = new THREE.Mesh(geo, this.neonMat);
    this.marks.frustumCulled = false;
    this.marks.renderOrder = 4; // after the glass and the shadow floor
    this.smoke.points.renderOrder = 5;
    this.sparks.points.renderOrder = 6;
    this.group.add(this.marks, this.smoke.points, this.sparks.points);
    this.group.visible = false;
    scene.add(this.group);
  }

  setEnabled(on: boolean) {
    if (this.group.visible && !on) this.clear();
    this.group.visible = on;
  }

  // Remove everything on screen
  clear() {
    for (let i = 0; i < MARK_SEGMENTS; i++) this.aData.array[i * 4] = -1e5;
    this.aData.needsUpdate = true;
    this.smoke.clear();
    this.sparks.clear();
    for (const s of this.states.values()) s.last = [null, null];
  }

  // The tiles under the marks are about to vanish: fade every existing mark out quickly
  fadeAll() {
    for (const m of [this.neonMat, this.rubberMat]) m.uniforms.uKillStart.value = this.time;
  }

  private addSegment(a: THREE.Vector2, bx: number, bz: number, strength: number, color: THREE.Color, width: number) {
    const k = this.segIdx;
    this.segIdx = (this.segIdx + 1) % MARK_SEGMENTS;
    this.aP0.array.set([a.x, MARK_Y, a.y], k * 3);
    this.aP1.array.set([bx, MARK_Y, bz], k * 3);
    this.aData.array.set([this.time, strength, width, 0], k * 4);
    this.aColor.array.set([color.r, color.g, color.b], k * 3);
  }

  // focus: the car the camera follows (smoke is only made near it, and for the player)
  update(dt: number, cars: FxCar[], focus: THREE.Vector3) {
    if (!this.group.visible) return;
    this.time += dt;
    const p = tirefx;
    const mat = p.neonMarks ? this.neonMat : this.rubberMat;
    this.marks.material = mat;
    for (const m of [this.neonMat, this.rubberMat]) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uLife.value = p.markLife;
      m.uniforms.uBright.value = p.markBrightness;
    }
    this.smoke.material.uniforms.uTime.value = this.time;
    this.sparks.material.uniforms.uTime.value = this.time;
    this.smoke.material.uniforms.uBright.value = p.smokeBrightness;
    this.sparks.material.uniforms.uBright.value = 2;
    this.smoke.material.uniforms.uGrav.value = 0.7;

    let wrote = false;
    for (const car of cars) {
      let st = this.states.get(car);
      if (!st) {
        st = { last: [null, null], smokeAcc: [0, 0], sparkAcc: [0, 0], wasGrounded: true, prevVy: 0 };
        this.states.set(car, st);
      }
      const c = car.controller;
      const vel = car.body.linvel();
      if (!car.mesh.visible || car.fallen) {
        st.last = [null, null];
        st.prevVy = 0;
        st.wasGrounded = false;
        continue;
      }

      // Heading from where the nose points (the mesh also leans over edges, so the plain yaw formula is off)
      const q = car.mesh.quaternion;
      const yaw = Math.atan2(2 * q.w * q.y + 2 * q.z * q.x, 1 - 2 * (q.x * q.x + q.y * q.y));
      const s = Math.sin(yaw);
      const co = Math.cos(yaw);
      const sc = car.carScale ?? 1; // wheel positions, marks and puffs follow the car's size
      const wheelBack = WHEEL_BACK * sc;
      const wheelSide = WHEEL_SIDE * sc;
      const markWidth = p.markWidth * sc;
      const baseX = car.mesh.position.x + s * wheelBack;
      const baseZ = car.mesh.position.z + co * wheelBack;
      const near = car.isPlayer || Math.hypot(car.mesh.position.x - focus.x, car.mesh.position.z - focus.z) < 30;

      const skidding = c.grounded && car.y < 0.6 && (c.drifting || c.slip > 2.5 || c.hardBraking);
      const strength = skidding ? Math.min(1, Math.max(c.slip / 7, c.drifting ? 0.9 : 0, c.hardBraking ? 0.7 : 0, 0.25)) : 0;
      this.tmpColor.setHex(car.carColor);
      this.smokeColor.copy(this.tmpColor).lerp(this.purple, p.smokeColorMix);

      for (let w = 0; w < 2; w++) {
        const side = w === 0 ? -1 : 1;
        const x = baseX + co * side * wheelSide;
        const z = baseZ - s * side * wheelSide;
        if (strength > 0) {
          const last = st.last[w];
          if (last) {
            const d = Math.hypot(x - last.x, z - last.y);
            if (p.marks && d > 0.12 && d < 3) {
              this.addSegment(last, x, z, strength, this.tmpColor, markWidth);
              wrote = true;
              last.set(x, z);
            } else if (d >= 3) last.set(x, z);
          } else st.last[w] = new THREE.Vector2(x, z);

          if (near && p.smoke) {
            st.smokeAcc[w] += 38 * p.smokeAmount * strength * dt;
            while (st.smokeAcc[w] >= 1) {
              st.smokeAcc[w] -= 1;
              this.smoke.spawn(
                x, 0.1, z,
                vel.x * 0.25 + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, vel.z * 0.25 + (Math.random() - 0.5) * 0.6,
                this.time, p.smokeLife * (0.7 + Math.random() * 0.6), p.smokeSize * sc * (0.7 + Math.random() * 0.6), this.smokeColor,
              );
            }
          }
          if (near && p.sparks && strength > 0.6) {
            st.sparkAcc[w] += 30 * p.sparkAmount * strength * dt;
            while (st.sparkAcc[w] >= 1) {
              st.sparkAcc[w] -= 1;
              this.sparks.spawn(
                x, 0.08, z,
                vel.x * 0.4 + (Math.random() - 0.5) * 3, 2 + Math.random() * 3, vel.z * 0.4 + (Math.random() - 0.5) * 3,
                this.time, 0.3 + Math.random() * 0.25, 0.16 * sc, this.tmpColor,
              );
            }
          }
        } else {
          st.last[w] = null;
        }

        // Landing from a jump: a burst of puffs at each rear wheel
        if (near && p.smoke && p.landingPuff && !st.wasGrounded && c.grounded && st.prevVy < -4) {
          for (let k = 0; k < 6; k++) {
            const a = Math.random() * Math.PI * 2;
            this.smoke.spawn(
              x, 0.1, z, Math.cos(a) * 1.8, 0.3 + Math.random() * 0.5, Math.sin(a) * 1.8,
              this.time, p.smokeLife * 0.8, p.smokeSize * sc * 0.8, this.smokeColor,
            );
          }
        }
      }
      st.wasGrounded = c.grounded;
      st.prevVy = vel.y;
    }

    if (wrote) {
      this.aP0.needsUpdate = true;
      this.aP1.needsUpdate = true;
      this.aData.needsUpdate = true;
      this.aColor.needsUpdate = true;
    }
    this.smoke.flush();
    this.sparks.flush();
  }
}
