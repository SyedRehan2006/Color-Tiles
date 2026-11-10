// Tunable values for the cyberpunk 3 scenery: night sky with nebula and stars, retro sun, a ring of
// wireframe mountains, a neon grid floor far below the platform, and haze. Edited live from the visual
// panel (src/ui/visualPanel.ts), read by SynthWorld (synthWorld.ts) and applyLook() in main.ts.
// The tiles are NOT here: cyberpunk 3 shares the tile settings of cyberpunk 2 (neonParams.ts).
export interface SceneryParams {
  // Sky
  skyTop: number;
  skyMid: number;
  skyHorizon: number;
  horizonGlow: number; // extra bright band right at the horizon
  nebulaStrength: number; // 0 = clean gradient
  nebulaColorA: number;
  nebulaColorB: number;
  starDensity: number; // 0..1, share of the stars shown
  starBrightness: number;
  // Sun
  sunOn: boolean;
  sunSize: number; // radius in the sky
  sunHeight: number; // how high the middle of the sun sits
  sunAngle: number; // degrees, which direction the sun is in
  sunTopColor: number;
  sunBottomColor: number;
  sunGlow: number;
  // Mountains (a square ring around the platform)
  mountainsOn: boolean;
  mountainSeed: number;
  mountainHeight: number;
  mountainDistance: number; // from the platform center to the inner edge of the ring
  mountainWidth: number; // thickness of the ring
  mountainFill: number;
  mountainEdgeColor: number;
  mountainEdgeBrightness: number;
  mountainEdgeWidth: number; // pixels
  // Grid floor far below
  floorOn: boolean;
  floorY: number; // height of the floor (the platform top is 0)
  gridColor: number;
  gridBrightness: number;
  gridSpacing: number; // meters
  gridLineWidth: number; // pixels
  // Haze
  fogColor: number;
  fogNear: number;
  fogFar: number;
  // Floating dust near the platform
  dustOn: boolean;
}

export const SCENERY_DEFAULTS: SceneryParams = {
  skyTop: 0x0a0420,
  skyMid: 0x2d1065,
  skyHorizon: 0x6a2090,
  horizonGlow: 0.35,
  nebulaStrength: 0.55,
  nebulaColorA: 0x7a1fb0,
  nebulaColorB: 0x2340c8,
  starDensity: 1,
  starBrightness: 1,
  sunOn: true,
  sunSize: 150,
  sunHeight: 120,
  sunAngle: 0,
  sunTopColor: 0xffe81a,
  sunBottomColor: 0xff2e88,
  sunGlow: 0.5,
  mountainsOn: true,
  mountainSeed: 7,
  mountainHeight: 120,
  mountainDistance: 170,
  mountainWidth: 170,
  mountainFill: 0x000000,
  mountainEdgeColor: 0x1a7dff,
  mountainEdgeBrightness: 1.5,
  mountainEdgeWidth: 1.5,
  floorOn: true,
  floorY: -70,
  gridColor: 0xd01cc8,
  gridBrightness: 1.2,
  gridSpacing: 20,
  gridLineWidth: 1.2,
  fogColor: 0x6a2090,
  fogNear: 150,
  fogFar: 650,
  dustOn: true,
};

// The one live copy
export const scenery: SceneryParams = { ...SCENERY_DEFAULTS };
