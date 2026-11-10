import { TILE_COLORS } from "../game/tileGrid";

// The look of the world: two themes (candy, cyberpunk), each in day and night. Pure data, no Three.js
// objects, so it is easy to tune. src/render/skyWorld.ts and applyVisuals() in main.ts read it.
export type ThemeId = "candy" | "cyberpunk" | "cyberpunk2" | "cyberpunk3" | "cyberpunk4" | "cyberpunk5" | "cyberpunk6";

// Cyberpunk 2 and 3 share the neon tiles (same shader, same settings, same palette)
export const isNeonTheme = (t: ThemeId) =>
  t === "cyberpunk2" || t === "cyberpunk3" || t === "cyberpunk4" || t === "cyberpunk5" || t === "cyberpunk6"; // unlit tiles + bloom
// Cyberpunk 3-6 share the synthwave scenery (synthWorld.ts); cyberpunk 4 has its own wireframe tiles
export const isSynthTheme = (t: ThemeId) => t === "cyberpunk3" || t === "cyberpunk4" || t === "cyberpunk5" || t === "cyberpunk6";
// Cyberpunk 5 and 6 share everything: glass tiles, reflections, color grade, tire effects, palette
export const isGlassTheme = (t: ThemeId) => t === "cyberpunk5" || t === "cyberpunk6";
// Only cyberpunk 6 has the speed effects (radial blur, speed lines, camera feel)
export const isSpeedTheme = (t: ThemeId) => t === "cyberpunk6";
export type TimeOfDay = "day" | "night";

export interface Look {
  skyTop: number; // sky color straight up
  skyHorizon: number; // sky color at the horizon (also the fog color unless fogColor is set)
  fogColor?: number;
  skyBelow: number; // color far below the platform
  stars: boolean;
  bodyColor: number; // the sun or the moon
  sunColor: number; // light color
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  cloudColor: number;
  spaceOpacity: number; // planets and asteroids: faint by day, clear at night
}

// Cyberpunk 2 night. Shared with cyberpunk 3 (the same object), so lights tuned in the panel apply to both.
const C2_NIGHT: Look = {
  skyTop: 0x02030f, skyHorizon: 0x10236b, skyBelow: 0x040716, stars: true, bodyColor: 0xc9d8ff,
  sunColor: 0x9db4ff, sunIntensity: 1.2, hemiSky: 0x5a78ff, hemiGround: 0x1a1450, hemiIntensity: 0.7,
  cloudColor: 0x1a2a78, spaceOpacity: 1,
};

// Light is kept fairly strong even at night: the tile colors must stay easy to read.
export const LOOKS: Record<ThemeId, Record<TimeOfDay, Look>> = {
  candy: {
    day: {
      skyTop: 0x2f86e8, skyHorizon: 0xbfe6ff, skyBelow: 0xdaf1ff, stars: false, bodyColor: 0xfff3b0,
      sunColor: 0xfff2e0, sunIntensity: 2.1, hemiSky: 0xcfe9ff, hemiGround: 0xffd9ec, hemiIntensity: 0.9,
      cloudColor: 0xffffff, spaceOpacity: 0.45,
    },
    night: {
      skyTop: 0x080c2c, skyHorizon: 0x3a3f95, skyBelow: 0x1b1f56, stars: true, bodyColor: 0xf6f1d9,
      sunColor: 0xaebcff, sunIntensity: 1.5, hemiSky: 0x7f8cff, hemiGround: 0x3a2f6e, hemiIntensity: 1.0,
      cloudColor: 0x7b82d6, spaceOpacity: 1,
    },
  },
  cyberpunk: {
    day: {
      skyTop: 0x4635b5, skyHorizon: 0xf3a0d2, skyBelow: 0x8a4fb8, stars: false, bodyColor: 0xffd6ea,
      sunColor: 0xffe3f4, sunIntensity: 2.0, hemiSky: 0xd8b8ff, hemiGround: 0x7a3f9e, hemiIntensity: 0.9,
      cloudColor: 0xffb3e6, spaceOpacity: 0.5,
    },
    night: {
      skyTop: 0x03000d, skyHorizon: 0x34115e, skyBelow: 0x14052e, stars: true, bodyColor: 0xff9de2,
      sunColor: 0xb59bff, sunIntensity: 1.6, hemiSky: 0x8f7bff, hemiGround: 0x3b1465, hemiIntensity: 1.0,
      cloudColor: 0x6a2fb0, spaceOpacity: 1,
    },
  },
  // Cyberpunk 2: unlit neon tiles on a dark navy night (bright blue sky by day). Tuned from the visual panel.
  cyberpunk2: {
    day: {
      skyTop: 0x2e6ad6, skyHorizon: 0xa9d6ff, skyBelow: 0xcfe8ff, stars: false, bodyColor: 0xfff3b0,
      sunColor: 0xfff2e0, sunIntensity: 2.0, hemiSky: 0xcfe9ff, hemiGround: 0x8a6fd0, hemiIntensity: 0.8,
      cloudColor: 0xffffff, spaceOpacity: 0.4,
    },
    night: C2_NIGHT,
  },
  // Cyberpunk 3: same tiles and lights as cyberpunk 2 night, with its own scenery (synthWorld.ts). Night only.
  cyberpunk3: {
    day: C2_NIGHT,
    night: C2_NIGHT,
  },
  cyberpunk4: {
    day: C2_NIGHT,
    night: C2_NIGHT,
  },
  cyberpunk5: {
    day: C2_NIGHT,
    night: C2_NIGHT,
  },
  cyberpunk6: {
    day: C2_NIGHT,
    night: C2_NIGHT,
  },
};

// Tile colors, in the same order as TILE_COLORS (red, blue, green, yellow, purple, orange, pink, cyan)
const CLASSIC = TILE_COLORS.map((c) => c.hex);
const NEON_PALETTE = [0xff1744, 0x3d7bff, 0x39ff14, 0xfff200, 0xb026ff, 0xff6a00, 0xff2bd6, 0x00f0ff];
export const PALETTES: Record<ThemeId, number[]> = {
  candy: [0xff4d6d, 0x4dabf7, 0x69db7c, 0xffe066, 0xb197fc, 0xffa94d, 0xff8fcb, 0x3bc9db],
  cyberpunk: [0xff2a55, 0x2b6bff, 0x1aff7a, 0xfff23a, 0xb026ff, 0xff7a1a, 0xff3df0, 0x14f0ff],
  // Neon: red, blue, green, yellow, purple, orange, pink, cyan
  cyberpunk2: NEON_PALETTE,
  cyberpunk3: NEON_PALETTE, // the same array: edits to one are edits to both
  cyberpunk4: [...NEON_PALETTE], // its own copy
  cyberpunk5: [...NEON_PALETTE], // its own copy
  cyberpunk6: [], // replaced below: the same array as cyberpunk 5
};
PALETTES.cyberpunk6 = PALETTES.cyberpunk5;

let palette = CLASSIC;

export function setPalette(kind: "classic" | "themed", theme: ThemeId) {
  palette = kind === "classic" ? CLASSIC : PALETTES[theme];
}

// Render color of tile color number i (an index into TILE_COLORS)
export function tileHex(i: number) {
  return palette[i];
}

// How the tile top looks: border width, border darkness, corner roundness (fractions of the tile), material
export interface TileStyle {
  border: number;
  borderShade: number; // 1 = no visible border, 0 = black
  radius: number;
  roughness: number;
  metalness: number;
}

export const TILE_STYLES: Record<ThemeId, TileStyle> = {
  candy: { border: 0.05, borderShade: 0.62, radius: 0.09, roughness: 0.6, metalness: 0 },
  cyberpunk: { border: 0.028, borderShade: 0.15, radius: 0.015, roughness: 0.35, metalness: 0.3 },
  cyberpunk2: { border: 0.028, borderShade: 0.15, radius: 0.015, roughness: 0.35, metalness: 0.3 }, // unused: neon themes use the neon shader
  cyberpunk3: { border: 0.028, borderShade: 0.15, radius: 0.015, roughness: 0.35, metalness: 0.3 }, // unused
  cyberpunk4: { border: 0.028, borderShade: 0.15, radius: 0.015, roughness: 0.35, metalness: 0.3 }, // unused
  cyberpunk5: { border: 0.028, borderShade: 0.15, radius: 0.015, roughness: 0.35, metalness: 0.3 }, // unused
  cyberpunk6: { border: 0.028, borderShade: 0.15, radius: 0.015, roughness: 0.35, metalness: 0.3 }, // unused
};
