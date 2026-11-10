import * as THREE from "three";
import { neon } from "./neonParams";

// Unlit neon look for the tile tops, drawn in the shader (no texture), so every value can change live.
// Each tile's instance color is the neon color. The top face is a rounded square: a black border outside,
// the fill inside (a little darker in the middle if fillSoftness > 0) and a pale rim line near the edge.
// Fill brightness above 1 is on purpose: the bloom pass makes those pixels glow.
const vertex = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vTint;
varying float vTop;
void main() {
  vUv = uv;
  vTop = step(0.5, normal.y); // 1 on the top face, 0 on the sides and underside
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #else
    vTint = vec3(1.0);
  #endif
  vec4 mvPosition = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uBorderColor;
uniform vec3 uSideColor;
uniform float uBrightness;
uniform float uSoftness;
uniform float uBorderW;
uniform float uRimW;
uniform float uRimBright;
uniform float uRound;
uniform float uFakeGlow;
varying vec2 vUv;
varying vec3 vTint;
varying float vTop;
void main() {
  vec3 col;
  if (vTop < 0.5) {
    col = uSideColor + vTint * 0.1; // dark side with a faint tint
  } else {
    vec2 p = vUv - 0.5;
    float h = 0.5 - uBorderW;
    float r = min(uRound, h);
    vec2 q = abs(p) - vec2(h - r);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; // < 0 inside the tile, > 0 in the border
    float aa = max(fwidth(d), 1e-5);
    float inside = 1.0 - smoothstep(-aa, aa, d);

    // Fill: slightly darker in the middle, full brightness toward the edge
    float k = mix(1.0, 0.55, uSoftness * (1.0 - smoothstep(-0.3, 0.0, d)));
    vec3 fill = vTint * uBrightness * k;
    // Rim: a lighter version of the tile color, just inside the edge
    float rim = smoothstep(-uRimW - aa, -uRimW + aa, d);
    vec3 rimCol = mix(vTint, vec3(1.0), uRimBright) * uBrightness;
    fill = mix(fill, rimCol, rim);

    // Border: dark, with an optional glow painted in (for when bloom is off)
    float glow = exp(-max(d, 0.0) / max(uBorderW * 0.7, 0.004)) * uFakeGlow;
    vec3 border = uBorderColor + vTint * uBrightness * 0.9 * glow;

    col = mix(border, fill, inside);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createNeonMaterial() {
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uBorderColor: { value: new THREE.Color() },
        uSideColor: { value: new THREE.Color() },
        uBrightness: { value: 1 },
        uSoftness: { value: 0 },
        uBorderW: { value: 0.03 },
        uRimW: { value: 0.04 },
        uRimBright: { value: 0.5 },
        uRound: { value: 0.05 },
        uFakeGlow: { value: 0 },
      },
    ]),
  });
  return material;
}

// Copy the current neon values into the shader
export function updateNeonMaterial(material: THREE.ShaderMaterial) {
  const u = material.uniforms;
  u.uBorderColor.value.setHex(neon.borderColor);
  u.uSideColor.value.setHex(neon.sideColor);
  u.uBrightness.value = neon.brightness;
  u.uSoftness.value = neon.fillSoftness;
  u.uBorderW.value = neon.borderWidth;
  u.uRimW.value = neon.rimWidth;
  u.uRimBright.value = neon.rimBrightness;
  u.uRound.value = neon.cornerRoundness;
  u.uFakeGlow.value = neon.fakeGlow ? 1 : 0;
}
