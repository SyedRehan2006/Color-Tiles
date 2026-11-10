// Tunable values for the cyberpunk 4 platform: sharp square tiles with glowing edge lines.
// One look covers both ideas: fillAmount 0 is "wireframe" (dark face, glowing outline), 1 is "solid"
// (full color face with a bright edge line). Edited live from the visual panel (src/ui/visualPanel.ts),
// read by wireTileMaterial.ts, tilePlatform.ts and main.ts. Bloom is shared with the other neon themes.
export interface WireParams {
  // Face and edge line (widths are fractions of one tile)
  fillAmount: number; // 0 = dark face, 1 = full tile color
  fillBrightness: number;
  lineWidth: number;
  lineBrightness: number; // above 1 feeds the bloom glow
  lineWhiten: number; // 0 = line in the tile color, 1 = white (helps the line stand out on a solid face)
  innerGlow: number; // soft glow fading from the edge line toward the middle
  innerGlowWidth: number;
  gapWidth: number; // dark gap between tiles
  sideColor: number; // the dark slab under the face and the gap
  // Extras
  diagonals: boolean; // one corner-to-corner line per tile, like the mountains
  diagonalWidth: number;
  cutCorners: boolean; // chamfered corners
  cutSize: number;
  edgeFlicker: boolean; // lines of the tiles about to vanish flicker
  flickerTime: number; // seconds before the vanish
  sideLines: boolean; // glowing lines along the slab edges
  sideLineWidth: number; // meters
  sideLineBrightness: number;
  // Glass (cyberpunk 5; cyberpunk 4 keeps these neutral)
  opacity: number; // 1 = solid, lower = you see the floor and sky through the tile
  gloss: number; // diagonal light streak
  glossAngle: number; // degrees
  glossWidth: number;
  skyTint: number; // sky color reflected toward the far, shallow-angle tiles
}

export const WIRE_DEFAULTS: WireParams = {
  fillAmount: 0.3,
  fillBrightness: 1,
  lineWidth: 0.04,
  lineBrightness: 1.7,
  lineWhiten: 0.15,
  innerGlow: 0.6,
  innerGlowWidth: 0.18,
  gapWidth: 0.01,
  sideColor: 0x05060f,
  diagonals: true,
  diagonalWidth: 0.012,
  cutCorners: false,
  cutSize: 0.12,
  edgeFlicker: true,
  flickerTime: 1.2,
  sideLines: true,
  sideLineWidth: 0.07,
  sideLineBrightness: 1.4,
  opacity: 1,
  gloss: 0,
  glossAngle: 35,
  glossWidth: 0.12,
  skyTint: 0,
};

// The two starting looks (panel buttons): only the values that differ
export const WIRE_PRESETS: Record<"wireframe" | "solid", Partial<WireParams>> = {
  wireframe: { fillAmount: 0.3, fillBrightness: 1, lineWidth: 0.04, lineBrightness: 1.7, lineWhiten: 0.15, innerGlow: 0.6, gapWidth: 0.01 },
  solid: { fillAmount: 1, fillBrightness: 1.2, lineWidth: 0.03, lineBrightness: 1.6, lineWhiten: 0.65, innerGlow: 0, gapWidth: 0.012 },
};

// Cyberpunk 5: tinted glass. Same shader, its own values.
export const GLASS_DEFAULTS: WireParams = {
  ...WIRE_DEFAULTS,
  fillAmount: 1,
  fillBrightness: 0.55,
  lineWidth: 0.03,
  lineBrightness: 1.8,
  lineWhiten: 0.35,
  innerGlow: 0.5,
  innerGlowWidth: 0.15,
  gapWidth: 0.012,
  diagonals: false,
  opacity: 0.82,
  gloss: 0.22,
  skyTint: 0.6,
};

// The live copies (cyberpunk 4 and cyberpunk 5)
export const wire: WireParams = { ...WIRE_DEFAULTS };
export const wire5: WireParams = { ...GLASS_DEFAULTS };
