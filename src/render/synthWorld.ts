import * as THREE from "three";
import { scenery, type SceneryParams } from "./sceneryParams";

// The cyberpunk 3 scenery, all built in code (no downloads): a gradient sky with a drifting nebula and
// twinkling stars, a striped retro sun, a square ring of black wireframe mountains, a neon grid floor far
// below the platform, and a little floating dust. Pure decoration: nothing here touches physics or tiles.
// Colors and sizes come from `scenery` (sceneryParams.ts); call configure() after changing them.
const SKY_RADIUS = 900;
const STAR_COUNT = 1400;
const DUST_COUNT = 160;

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFragment = /* glsl */ `
uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor;
uniform vec3 uNebA; uniform vec3 uNebB;
uniform float uNeb; uniform float uGlow; uniform float uTime;
varying vec3 vDir;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5; float s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float t = clamp(y, 0.0, 1.0);
  vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.35, t));
  col = mix(col, uTop, smoothstep(0.25, 0.9, t));
  if (y < 0.0) col = mix(uHor, uTop * 0.4, clamp(-y * 3.0, 0.0, 1.0));
  float n = fbm(d * 2.4 + vec3(uTime * 0.008, 0.0, 0.0));
  float n2 = fbm(d * 3.7 + vec3(7.0, uTime * -0.006, 3.0));
  float neb = smoothstep(0.38, 0.85, n) * uNeb * smoothstep(-0.05, 0.3, y);
  col += mix(uNebA, uNebB, n2) * neb;
  col += uHor * uGlow * exp(-abs(y) * 9.0);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const starVertex = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime; uniform float uScale;
varying float vTw;
void main() {
  vTw = 0.65 + 0.35 * sin(uTime * 1.6 + aPhase);
  gl_PointSize = aSize * uScale;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const starFragment = /* glsl */ `
uniform float uBright;
varying float vTw;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vec3(1.0, 0.96, 1.0) * uBright * vTw, a);
  #include <colorspace_fragment>
}
`;

const sunFragment = /* glsl */ `
uniform vec3 uTop; uniform vec3 uBottom;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  float a = 1.0 - smoothstep(0.97, 1.0, d);
  float t = (p.y + 1.0) * 0.5;
  vec3 col = mix(uBottom, uTop, smoothstep(0.1, 0.9, t));
  // Horizontal gaps in the lower part of the sun, wider toward the bottom
  float yy = (0.1 - p.y) / 1.1;
  if (yy > 0.0) {
    float band = fract(yy * 7.0);
    float gap = mix(0.08, 0.6, yy);
    a *= smoothstep(gap - 0.03, gap + 0.03, band);
  }
  gl_FragColor = vec4(col * 1.1, a);
  #include <colorspace_fragment>
}
`;

const haloFragment = /* glsl */ `
uniform vec3 uColor; uniform float uStrength;
varying vec2 vUv;
void main() {
  float d = length(vUv * 2.0 - 1.0);
  float a = exp(-d * 3.2) * (1.0 - smoothstep(0.8, 1.0, d)) * uStrength;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}
`;

const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const mountainVertex = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec3 bary;
varying vec3 vBary;
void main() {
  vBary = bary;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const mountainFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uFill; uniform vec3 uEdge; uniform float uEdgeW;
varying vec3 vBary;
void main() {
  vec3 w = max(fwidth(vBary) * uEdgeW, vec3(1e-5));
  vec3 a = smoothstep(vec3(0.0), w, vBary);
  float line = 1.0 - min(min(a.x, a.y), a.z);
  gl_FragColor = vec4(mix(uFill, uEdge, line), 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const floorVertex = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const floorFragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uColor; uniform vec3 uBase; uniform float uSpacing; uniform float uLineW;
varying vec3 vWorld;
void main() {
  vec2 g = vWorld.xz / uSpacing;
  vec2 fw = fwidth(g);
  vec2 f = abs(fract(g - 0.5) - 0.5) / max(fw, vec2(1e-5));
  float line = 1.0 - smoothstep(0.0, uLineW, min(f.x, f.y));
  line *= 1.0 - smoothstep(0.35, 0.7, max(fw.x, fw.y)); // far away the lines would shimmer: fade them
  gl_FragColor = vec4(uBase + uColor * line, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

// Small seeded random numbers so the mountains look the same every time for the same seed
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, z: number, s: number) {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(s, 2147483647);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, z: number, s: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, s);
  const b = hash2(ix + 1, iz, s);
  const c = hash2(ix, iz + 1, s);
  const d = hash2(ix + 1, iz + 1, s);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

// A square ring of jagged peaks around the origin. Flat triangles with barycentric coordinates, so the
// shader can draw the triangle edges as glowing lines.
function buildMountains(p: SceneryParams) {
  const A = p.mountainDistance;
  const W = Math.max(20, p.mountainWidth);
  const B = A + W;
  const n = Math.ceil((2 * B) / 16);
  const step = (2 * B) / n;
  const rand = rng(p.mountainSeed * 7919 + 13);

  const vx = new Float32Array((n + 1) * (n + 1));
  const vz = new Float32Array((n + 1) * (n + 1));
  const vy = new Float32Array((n + 1) * (n + 1));
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = j * (n + 1) + i;
      const edge = i === 0 || j === 0 || i === n || j === n;
      const x = -B + i * step + (edge ? 0 : (rand() - 0.5) * step * 0.7);
      const z = -B + j * step + (edge ? 0 : (rand() - 0.5) * step * 0.7);
      const t = (Math.max(Math.abs(x), Math.abs(z)) - A) / W; // 0 at the inner edge, 1 at the outer edge
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.7);
      const r1 = 1 - Math.abs(valueNoise(x / 120, z / 120, p.mountainSeed) * 2 - 1);
      const r2 = 1 - Math.abs(valueNoise(x / 48, z / 48, p.mountainSeed + 7) * 2 - 1);
      const m = Math.min(1.2, Math.pow(0.65 * r1 + 0.35 * r2, 1.8) * 1.4);
      vx[k] = x;
      vz[k] = z;
      vy[k] = p.floorY + p.mountainHeight * env * (0.12 + 0.88 * m) * (0.8 + 0.4 * rand());
    }
  }

  const pos: number[] = [];
  const bary: number[] = [];
  const tri = (a: number, b: number, c: number) => {
    for (const [k, w] of [[a, [1, 0, 0]], [b, [0, 1, 0]], [c, [0, 0, 1]]] as [number, number[]][]) {
      pos.push(vx[k], vy[k], vz[k]);
      bary.push(...w);
    }
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cx = -B + (i + 0.5) * step;
      const cz = -B + (j + 0.5) * step;
      const t = (Math.max(Math.abs(cx), Math.abs(cz)) - A) / W;
      if (t < -0.02 || t > 1.02) continue;
      const v00 = j * (n + 1) + i;
      const v10 = v00 + 1;
      const v01 = v00 + (n + 1);
      const v11 = v01 + 1;
      tri(v00, v10, v01);
      tri(v10, v11, v01);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("bary", new THREE.Float32BufferAttribute(bary, 3));
  return geo;
}

export class SynthWorld {
  readonly group = new THREE.Group();

  private skyMat: THREE.ShaderMaterial;
  private starMat: THREE.ShaderMaterial;
  private starGeo: THREE.BufferGeometry;
  private sunGroup = new THREE.Group();
  private sunMat: THREE.ShaderMaterial;
  private haloMat: THREE.ShaderMaterial;
  private sunMesh: THREE.Mesh;
  private haloMesh: THREE.Mesh;
  private mountains: THREE.Mesh;
  private mountainMat: THREE.ShaderMaterial;
  private mountainKey = "";
  private floor: THREE.Mesh;
  private floorMat: THREE.ShaderMaterial;
  private dust: THREE.Points;

  constructor(scene: THREE.Scene) {
    // Sky dome
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uHor: { value: new THREE.Color() },
        uNebA: { value: new THREE.Color() },
        uNebB: { value: new THREE.Color() },
        uNeb: { value: 0.5 },
        uGlow: { value: 0.3 },
        uTime: { value: 0 },
      },
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 20), this.skyMat);
    dome.renderOrder = -1000;
    dome.frustumCulled = false;
    this.group.add(dome);

    // Stars: random directions above the horizon, each with its own size and twinkle phase
    const pos = new Float32Array(STAR_COUNT * 3);
    const size = new Float32Array(STAR_COUNT);
    const phase = new Float32Array(STAR_COUNT);
    const r = rng(12345);
    for (let i = 0; i < STAR_COUNT; i++) {
      const y = 0.02 + r() * 0.98;
      const a = r() * Math.PI * 2;
      const rad = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * rad * 850, y * 850, Math.sin(a) * rad * 850], i * 3);
      const big = r();
      size[i] = big > 0.97 ? 4.5 : big > 0.85 ? 3 : 1.8;
      phase[i] = r() * 6.28;
    }
    this.starGeo = new THREE.BufferGeometry();
    this.starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.starGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    this.starGeo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uScale: { value: Math.min(window.devicePixelRatio, 2) }, uBright: { value: 1 } },
    });
    const stars = new THREE.Points(this.starGeo, this.starMat);
    stars.renderOrder = -999;
    stars.frustumCulled = false;
    this.group.add(stars);

    // Sun: a glow behind a striped disc, both flat panels facing the platform
    this.haloMat = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: haloFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color() }, uStrength: { value: 0.5 } },
    });
    this.sunMat = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: sunFragment,
      transparent: true,
      depthWrite: false,
      uniforms: { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() } },
    });
    this.haloMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.haloMat);
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.sunMat);
    this.haloMesh.renderOrder = -998.5;
    this.sunMesh.renderOrder = -998;
    this.haloMesh.frustumCulled = false;
    this.sunMesh.frustumCulled = false;
    this.sunGroup.add(this.haloMesh, this.sunMesh);
    this.group.add(this.sunGroup);

    // Mountains
    this.mountainMat = new THREE.ShaderMaterial({
      vertexShader: mountainVertex,
      fragmentShader: mountainFragment,
      fog: true,
      side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uFill: { value: new THREE.Color() }, uEdge: { value: new THREE.Color() }, uEdgeW: { value: 1.5 } },
      ]),
    });
    this.mountains = new THREE.Mesh(new THREE.BufferGeometry(), this.mountainMat);
    this.mountains.frustumCulled = false;
    this.group.add(this.mountains);

    // Grid floor
    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: floorVertex,
      fragmentShader: floorFragment,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uColor: { value: new THREE.Color() },
          uBase: { value: new THREE.Color(0x07010f) },
          uSpacing: { value: 20 },
          uLineW: { value: 1.2 },
        },
      ]),
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200).rotateX(-Math.PI / 2), this.floorMat);
    this.floor.frustumCulled = false;
    this.group.add(this.floor);

    // Dust: a few dim specks that drift slowly around the platform
    const dpos = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) dpos.set([(r() - 0.5) * 140, -8 + r() * 45, (r() - 0.5) * 140], i * 3);
    const dgeo = new THREE.BufferGeometry();
    dgeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
    this.dust = new THREE.Points(
      dgeo,
      new THREE.PointsMaterial({ color: 0xff9be8, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.55, fog: false, depthWrite: false }),
    );
    this.dust.frustumCulled = false;
    this.group.add(this.dust);

    this.group.visible = false;
    scene.add(this.group);
    this.configure();
  }

  // Show or hide the whole scenery (it is only for the cyberpunk 3 theme)
  setVisible(on: boolean) {
    this.group.visible = on;
  }

  // Copy the current scenery values into the shaders and rebuild the mountains if their shape changed
  configure(p: SceneryParams = scenery) {
    const sk = this.skyMat.uniforms;
    sk.uTop.value.setHex(p.skyTop);
    sk.uMid.value.setHex(p.skyMid);
    sk.uHor.value.setHex(p.skyHorizon);
    sk.uNebA.value.setHex(p.nebulaColorA);
    sk.uNebB.value.setHex(p.nebulaColorB);
    sk.uNeb.value = p.nebulaStrength;
    sk.uGlow.value = p.horizonGlow;

    this.starGeo.setDrawRange(0, Math.round(STAR_COUNT * Math.min(1, Math.max(0, p.starDensity))));
    this.starMat.uniforms.uBright.value = p.starBrightness;

    this.sunGroup.visible = p.sunOn;
    this.sunGroup.rotation.y = (p.sunAngle * Math.PI) / 180;
    this.sunMesh.scale.setScalar(p.sunSize);
    this.sunMesh.position.set(0, p.sunHeight, -780);
    this.haloMesh.scale.setScalar(p.sunSize * 2.4);
    this.haloMesh.position.set(0, p.sunHeight, -781);
    this.sunMat.uniforms.uTop.value.setHex(p.sunTopColor);
    this.sunMat.uniforms.uBottom.value.setHex(p.sunBottomColor);
    this.haloMat.uniforms.uColor.value.setHex(p.sunBottomColor);
    this.haloMat.uniforms.uStrength.value = p.sunGlow;

    const key = [p.mountainSeed, p.mountainHeight, p.mountainDistance, p.mountainWidth, p.floorY].join("|");
    if (key !== this.mountainKey) {
      this.mountainKey = key;
      this.mountains.geometry.dispose();
      this.mountains.geometry = buildMountains(p);
    }
    this.mountains.visible = p.mountainsOn;
    const mu = this.mountainMat.uniforms;
    mu.uFill.value.setHex(p.mountainFill);
    mu.uEdge.value.setHex(p.mountainEdgeColor).multiplyScalar(p.mountainEdgeBrightness);
    mu.uEdgeW.value = p.mountainEdgeWidth;

    this.floor.visible = p.floorOn;
    this.floor.position.y = p.floorY;
    const fu = this.floorMat.uniforms;
    fu.uColor.value.setHex(p.gridColor).multiplyScalar(p.gridBrightness);
    fu.uSpacing.value = p.gridSpacing;
    fu.uLineW.value = p.gridLineWidth;

    this.dust.visible = p.dustOn;
  }

  // Once per rendered frame: nebula drift, star twinkle, dust drift
  update(dt: number, time: number) {
    if (!this.group.visible) return;
    this.skyMat.uniforms.uTime.value = time;
    this.starMat.uniforms.uTime.value = time;
    this.dust.rotation.y += dt * 0.01;
    this.dust.position.y = Math.sin(time * 0.2) * 2;
  }
}
