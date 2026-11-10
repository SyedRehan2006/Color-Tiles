import * as THREE from "three";
import type { WireParams } from "./wireParams";
import { scenery } from "./sceneryParams";

// Unlit "neon wireframe" tile for cyberpunk 4, drawn in the shader so every value can change live.
// The top face is a sharp square (optionally with cut corners): a dark gap at the very edge, then a bright
// line, then the fill (dark or full color, see fillAmount) with an optional inner glow. Optional diagonal
// line, optional glowing lines on the slab sides, and a flicker for tiles that are about to vanish.
const vertex = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute float aWarn;
varying vec2 vUv;
varying vec3 vTint;
varying float vTop;
varying float vWarn;
varying vec3 vView;
void main() {
  vUv = uv;
  vWarn = aWarn;
  vTop = step(0.5, normal.y);
  #ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
  #else
    vTint = vec3(1.0);
  #endif
  vec4 mvPosition = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  vView = cameraPosition - (modelMatrix * mvPosition).xyz;
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragment = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uSideColor;
uniform float uFill, uFillB, uLineW, uLineB, uWhiten, uGlow, uGlowW, uGap;
uniform float uDiag, uDiagW, uCut, uCutSize;
uniform float uFlickerOn, uTime;
uniform float uSideLines, uSideW, uSideB, uTile, uThick;
uniform float uOpacity, uGloss, uGlossW, uSkyTint;
uniform vec2 uGlossDir;
uniform vec3 uSky;
varying vec3 vView;
varying vec2 vUv;
varying vec3 vTint;
varying float vTop;
varying float vWarn;
void main() {
  float flick = vWarn * uFlickerOn * step(0.5, fract(uTime * 7.0));
  vec3 col;
  float alpha = 1.0;
  if (vTop < 0.5) {
    col = uSideColor;
    if (uSideLines > 0.5) {
      float dx = min(vUv.x, 1.0 - vUv.x) * uTile;
      float dy = min(vUv.y, 1.0 - vUv.y) * uThick;
      float m = min(dx, dy);
      float aa = max(fwidth(m), 1e-5);
      float l = 1.0 - smoothstep(uSideW - aa, uSideW + aa, m);
      col += vTint * uSideB * l * (1.0 + flick);
      alpha = max(uOpacity * 0.85, l);
    } else {
      alpha = uOpacity * 0.85;
    }
  } else {
    vec2 p = abs(vUv - 0.5);
    float s = max(p.x, p.y) - 0.5;
    if (uCut > 0.5) s = max(s, (p.x + p.y - (1.0 - uCutSize)) * 0.70710678);
    float d = -s; // distance in from the tile edge (negative in a cut corner)
    float aa = max(fwidth(d), 1e-5);
    float inside = smoothstep(uGap - aa, uGap + aa, d);
    float e = d - uGap;
    float line = 1.0 - smoothstep(uLineW - aa, uLineW + aa, e);
    if (uDiag > 0.5) {
      float dd = abs(vUv.x - vUv.y) * 0.70710678;
      float aad = max(fwidth(dd), 1e-5);
      line = max(line, 1.0 - smoothstep(uDiagW - aad, uDiagW + aad, dd));
    }
    vec3 lineCol = mix(vTint, vec3(1.0), uWhiten) * uLineB;
    lineCol = mix(lineCol, vec3(2.0), flick * 0.8);
    float glow = exp(-max(e, 0.0) / max(uGlowW, 0.001)) * uGlow;
    vec3 fill = vTint * (uFill * uFillB) + vTint * uLineB * glow * 0.5;
    // Glass: a light streak across the pane and the sky color reflected at shallow viewing angles
    float gpos = dot(vUv - 0.5, uGlossDir);
    float streak = exp(-pow2((gpos - 0.12) / max(uGlossW, 0.01))) * 0.6 + exp(-pow2((gpos + 0.22) / max(uGlossW * 0.4, 0.01))) * 0.4;
    float fres = pow(1.0 - clamp(abs(normalize(vView).y), 0.0, 1.0), 2.0);
    fill += vec3(1.0) * uGloss * streak + uSky * uSkyTint * fres;
    fill *= 1.0 - 0.55 * flick;
    col = mix(uSideColor, mix(fill, lineCol, line), inside);
    alpha = mix(1.0, mix(uOpacity, 1.0, line), inside);
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function createWireMaterial(glass = false) {
  const f = (v = 0) => ({ value: v });
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    fog: true,
    transparent: glass, // glass is see-through; it is drawn after the cars and their reflections
    depthWrite: !glass,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uSideColor: { value: new THREE.Color() },
        uFill: f(), uFillB: f(), uLineW: f(), uLineB: f(), uWhiten: f(), uGlow: f(), uGlowW: f(), uGap: f(),
        uDiag: f(), uDiagW: f(), uCut: f(), uCutSize: f(),
        uFlickerOn: f(), uTime: f(),
        uOpacity: f(1), uGloss: f(), uGlossW: f(0.12), uSkyTint: f(), uGlossDir: { value: new THREE.Vector2(1, 0) }, uSky: { value: new THREE.Color() },
        uSideLines: f(), uSideW: f(), uSideB: f(), uTile: f(6), uThick: f(1),
      },
    ]),
  });
}

// Copy the current wire values into the shader (tileSize and thickness in meters, for the side lines)
export function updateWireMaterial(material: THREE.ShaderMaterial, wire: WireParams, tileSize: number, thickness: number) {
  const u = material.uniforms;
  u.uSideColor.value.setHex(wire.sideColor);
  u.uFill.value = wire.fillAmount;
  u.uFillB.value = wire.fillBrightness;
  u.uLineW.value = wire.lineWidth;
  u.uLineB.value = wire.lineBrightness;
  u.uWhiten.value = wire.lineWhiten;
  u.uGlow.value = wire.innerGlow;
  u.uGlowW.value = wire.innerGlowWidth;
  u.uGap.value = wire.gapWidth;
  u.uDiag.value = wire.diagonals ? 1 : 0;
  u.uDiagW.value = wire.diagonalWidth;
  u.uCut.value = wire.cutCorners ? 1 : 0;
  u.uCutSize.value = wire.cutSize;
  u.uFlickerOn.value = wire.edgeFlicker ? 1 : 0;
  u.uSideLines.value = wire.sideLines ? 1 : 0;
  u.uSideW.value = wire.sideLineWidth;
  u.uSideB.value = wire.sideLineBrightness;
  u.uTile.value = tileSize;
  u.uThick.value = thickness;
  u.uOpacity.value = wire.opacity;
  u.uGloss.value = wire.gloss;
  u.uGlossW.value = wire.glossWidth;
  u.uSkyTint.value = wire.skyTint;
  const a = (wire.glossAngle * Math.PI) / 180;
  u.uGlossDir.value.set(Math.cos(a), Math.sin(a));
  u.uSky.value.setHex(scenery.skyHorizon);
}
