// Tunable values for the cyberpunk 2 look (unlit neon tiles + bloom glow). Edited live from the visual
// panel (src/ui/visualPanel.ts). Plain data: the tile shader (neonTileMaterial.ts), bloom (postFx.ts) and
// applyLook() in main.ts read it.
export interface NeonParams {
  // Tiles. Widths are fractions of one tile's width (0.035 of 6 m is about 0.2 m).
  brightness: number; // fill brightness; above 1 is "over-bright", which feeds the bloom glow
  fillSoftness: number; // 0 = flat color, 1 = clearly darker in the middle, brighter at the edge
  borderWidth: number; // the dark line between tiles
  borderColor: number;
  rimWidth: number; // the pale line just inside the tile edge
  rimBrightness: number; // 0 = same as the fill, 1 = white
  cornerRoundness: number;
  sideColor: number; // the dark side and underside of each tile
  // Glow
  fakeGlow: boolean; // glow painted into the tile border (what phones would get without bloom)
  bloomEnabled: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number; // how bright a pixel must be to glow
  // Atmosphere
  fogNear: number;
  fogFar: number;
}

export const NEON_DEFAULTS: NeonParams = {
  brightness: 1.3,
  fillSoftness: 0.35,
  borderWidth: 0.035,
  borderColor: 0x000000,
  rimWidth: 0.04,
  rimBrightness: 0.55,
  cornerRoundness: 0.05,
  sideColor: 0x05060f,
  fakeGlow: false,
  bloomEnabled: true,
  bloomStrength: 0.9,
  bloomRadius: 0.5,
  bloomThreshold: 0.9,
  fogNear: 120,
  fogFar: 500,
};

// The one live copy
export const neon: NeonParams = { ...NEON_DEFAULTS };
