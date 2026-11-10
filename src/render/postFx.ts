import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import type { NeonParams } from "./neonParams";
import type { GradeParams, SpeedFxParams } from "./fxParams";

// Safety net: a single bad pixel (NaN or infinity) would be smeared into a black patch by the bloom blur,
// so such pixels are replaced with black and very large values are capped before the bloom sees them.
const CleanShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(0.0);
      gl_FragColor = vec4(min(c.rgb, vec3(64.0)), 1.0);
    }
  `,
};

// Color grading, run last on the finished (screen-colored) picture: split tint, contrast, saturation,
// vignette, color fringing and grain.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uShadow: { value: new THREE.Color() },
    uHigh: { value: new THREE.Color() },
    uTint: { value: 0 },
    uContrast: { value: 1 },
    uSat: { value: 1 },
    uVig: { value: 0 },
    uVigSize: { value: 0.35 },
    uCA: { value: 0 },
    uGrain: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadow; uniform vec3 uHigh;
    uniform float uTint, uContrast, uSat, uVig, uVigSize, uCA, uGrain, uTime;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c);
      vec2 off = c * r * uCA;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(vec3(1.0), mix(uShadow, uHigh, clamp(l, 0.0, 1.0)) * 1.2, uTint);
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col *= 1.0 - uVig * smoothstep(uVigSize, uVigSize + 0.5, r);
      col += (hash(vUv * 1000.0 + fract(uTime)) - 0.5) * uGrain;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};


// Speed effects (cyberpunk 6): a radial blur that leaves the middle sharp, neon speed lines streaming out of
// the middle, extra color fringing and dark corners. Runs on the finished picture, only while the car is fast.
const SpeedShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uLevel: { value: 0 },
    uBlur: { value: 0.5 },
    uClear: { value: 0.22 },
    uAspect: { value: 1 },
    uLines: { value: 1 },
    uLineAmt: { value: 0.8 },
    uLineCount: { value: 90 },
    uLineInner: { value: 0.42 },
    uColA: { value: new THREE.Color() },
    uColB: { value: new THREE.Color() },
    uFringe: { value: 0.01 },
    uVig: { value: 0.2 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uLevel, uBlur, uClear, uAspect, uLines, uLineAmt, uLineCount, uLineInner, uFringe, uVig, uTime;
    uniform vec3 uColA; uniform vec3 uColB;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 center = vec2(0.5, 0.46);
      vec2 d = vUv - center;
      vec2 p = d * vec2(uAspect, 1.0);
      float r = length(p);
      float edge = smoothstep(uClear, uClear + 0.5, r);
      // Radial blur: average along the line toward the middle (stronger toward the edges)
      vec2 smear = d * uBlur * uLevel * 0.14 * edge;
      vec3 col = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float t = float(i) / 7.0;
        col += texture2D(tDiffuse, vUv - smear * t).rgb;
      }
      col /= 8.0;
      // Color fringing: red and blue pulled apart toward the edges
      vec2 off = d * uFringe * uLevel * edge;
      col.r = mix(col.r, texture2D(tDiffuse, vUv - off).r, 0.6);
      col.b = mix(col.b, texture2D(tDiffuse, vUv + off).b, 0.6);
      // Neon speed lines
      if (uLines > 0.5) {
        float lvl = smoothstep(0.12, 0.85, uLevel);
        float ang = atan(p.y, p.x + 1e-5);
        float u = (ang / 6.2831853 + 0.5) * uLineCount;
        float cell = floor(u);
        float f = fract(u) - 0.5;
        float h = hash(vec2(cell, 7.0));
        float h2 = hash(vec2(cell, 19.0));
        float on = step(1.0 - 0.15 - lvl * 0.5, h); // more lines the faster you go
        float width = mix(0.05, 0.16, h2);
        float line = 1.0 - smoothstep(width * 0.4, width, abs(f));
        float dash = fract(r * 1.6 - uTime * (1.2 + h * 2.2) + h2 * 5.0);
        float seg = smoothstep(0.0, 0.12, dash) * (1.0 - smoothstep(0.35, 0.6, dash));
        float radial = smoothstep(uLineInner, uLineInner + 0.35, r);
        float k = lvl * uLineAmt * line * on * seg * radial;
        vec3 lc = mix(uColA, uColB, step(0.5, fract(h * 3.7)));
        col += mix(lc, vec3(1.0), 0.35) * k * 1.4;
      }
      col *= 1.0 - uVig * uLevel * smoothstep(0.3, 0.95, r);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

// Post-processing: the scene is drawn into an off-screen HDR image, bloom makes the over-bright pixels
// glow, then the result goes through the screen conversion and the color grade. Only used while it is
// switched on (a neon theme with bloom or grading on); otherwise main.ts draws straight to the screen.
export function createPostFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // HalfFloat keeps colors above 1.0 (needed for bloom); samples keeps the edges smooth
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setSize(w, h);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.5, 0.9);
  const gradePass = new ShaderPass(GradeShader);
  const speedPass = new ShaderPass(SpeedShader);
  speedPass.enabled = false;
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass(CleanShader));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(speedPass);
  composer.addPass(gradePass);

  let enabled = false;
  let speedOn = false;
  // No color conversion: the grade works in screen colors
  const raw = (c: THREE.Color, hex: number) => c.setHex(hex, THREE.LinearSRGBColorSpace);

  return {
    get enabled() {
      return enabled;
    },
    // bloomOn / grade (null = off): which effects run. The composer is used when either does.
    configure(bloomOn: boolean, p: NeonParams, grade: GradeParams | null, speed = false) {
      speedOn = speed;
      enabled = bloomOn || grade !== null || speed;
      if (!speed) speedPass.enabled = false;
      bloom.enabled = bloomOn;
      bloom.strength = p.bloomStrength;
      bloom.radius = p.bloomRadius;
      bloom.threshold = p.bloomThreshold;
      gradePass.enabled = grade !== null;
      if (grade) {
        const u = gradePass.uniforms;
        raw(u.uShadow.value, grade.shadowColor);
        raw(u.uHigh.value, grade.highlightColor);
        u.uTint.value = grade.tint;
        u.uContrast.value = grade.contrast;
        u.uSat.value = grade.saturation;
        u.uVig.value = grade.vignette;
        u.uVigSize.value = grade.vignetteSize;
        u.uCA.value = grade.chromatic;
        u.uGrain.value = grade.grain;
      }
    },
    // Speed effects: call every frame in cyberpunk 6 (level 0..1 from SpeedFx; the pass is skipped near 0)
    setSpeed(level: number, sp: SpeedFxParams) {
      speedPass.enabled = speedOn && sp.enabled && level > 0.01;
      if (!speedPass.enabled) return;
      const u = speedPass.uniforms;
      u.uLevel.value = level;
      u.uBlur.value = sp.blur;
      u.uClear.value = sp.blurClear;
      u.uAspect.value = window.innerWidth / Math.max(window.innerHeight, 1);
      u.uLines.value = sp.lines ? 1 : 0;
      u.uLineAmt.value = sp.lineAmount;
      u.uLineCount.value = Math.max(8, Math.round(sp.lineCount));
      u.uLineInner.value = sp.lineInner;
      raw(u.uColA.value, sp.lineColorA);
      raw(u.uColB.value, sp.lineColorB);
      u.uFringe.value = sp.fringe;
      u.uVig.value = sp.vignette;
    },
    setSize(width: number, height: number) {
      composer.setSize(width, height);
    },
    render(time: number) {
      gradePass.uniforms.uTime.value = time;
      speedPass.uniforms.uTime.value = time;
      composer.render();
    },
  };
}
