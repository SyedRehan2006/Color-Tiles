import { TILE_COLORS } from "../game/tileGrid";

// The look of the world: two themes (candy, cyberpunk), each in day and night. Pure data, no Three.js
// objects, so it is easy to tune. src/render/skyWorld.ts and applyVisuals() in main.ts read it.
export type ThemeId = "candy" | "cyberpunk";
export type TimeOfDay = "day" | "night";

export interface Look {
  skyTop: number; // sky color straight up
  skyHorizon: number; // sky color at the horizon (also the fog color)
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
};

// Tile colors, in the same order as TILE_COLORS (red, blue, green, yellow, purple, orange, pink, cyan)
const CLASSIC = TILE_COLORS.map((c) => c.hex);
const PALETTES: Record<ThemeId, number[]> = {
  candy: [0xff4d6d, 0x4dabf7, 0x69db7c, 0xffe066, 0xb197fc, 0xffa94d, 0xff8fcb, 0x3bc9db],
  cyberpunk: [0xff2a55, 0x2b6bff, 0x1aff7a, 0xfff23a, 0xb026ff, 0xff7a1a, 0xff3df0, 0x14f0ff],
};

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
};
