// Exact values for the Poki build, copied from the browser's saved tuning (the settings, gameplay and visual panels)
// on 2026-11-13. Only used when POKI is true (src/build.ts); the normal build keeps its own defaults + saved values.
// To change the Poki game, edit the numbers here and run `npm run build:poki`.

export const POKI_SETTINGS = {
  roamTime: 5, firstRoundTime: 5, timeStep: 1, minRoundTime: 3, resultPause: 4, targetTiles: 4,
  shrinking: true, botCount: 8, botSkill: 5, botMix: 1, botRespawn: false, roundsPerRing: 1,
  director: false, shrinkEveryRound: true, startCoverage: 0.05, minCoverage: 0.04, levelTimeStep: 0.5,
  expectedFalls: 0.2, heavyFalls: 0.4, forceShrinkAfter: 3, suddenDeathAt: 3,
  gridSize: 10, tileSize: 15, colorCount: 4,
  reverseDelay: 0, bumpStrength: 4, carScale: 2, coastSteerSpeed: 12, coastBrake: 3, edgeSupport: 0.7, edgePull: 25,
  showTimer: true, collisions: true, knockOffCars: true, slowMo: true,
  theme: "cyberpunk6", timeOfDay: "night", tilePalette: "classic", carShape: "mixed", shadows: true,
  touchControls: "auto", touchSteer: "joystick", touchPedals: "manual",
  fallenCamera: "orbit", eliminatedCamera: "orbit",
} as const;

export const POKI_VISUAL = {
  neon: {
    brightness: 1.3, fillSoftness: 0.35, borderWidth: 0.035, borderColor: 0, rimWidth: 0.04, rimBrightness: 0.55,
    cornerRoundness: 0.05, sideColor: 329231, fakeGlow: false, bloomEnabled: true, bloomStrength: 0.15,
    bloomRadius: 0, bloomThreshold: 0, fogNear: 120, fogFar: 500,
  },
  palette: [16717636, 4029439, 3800852, 16773632, 11544319, 16738816, 16722902, 61695],
  day: {
    skyTop: 3042006, skyHorizon: 11130623, skyBelow: 13625599, stars: false, bodyColor: 16774064, sunColor: 16773856,
    sunIntensity: 2, hemiSky: 13625855, hemiGround: 9072592, hemiIntensity: 0.8, cloudColor: 16777215, spaceOpacity: 0.4,
  },
  night: {
    skyTop: 131855, skyHorizon: 1057643, skyBelow: 263958, stars: true, bodyColor: 13228287, sunColor: 10335487,
    sunIntensity: 1.2, hemiSky: 5929215, hemiGround: 1709136, hemiIntensity: 0.7, cloudColor: 1714808, spaceOpacity: 1,
  },
  scenery: {
    skyTop: 656416, skyMid: 2953317, skyHorizon: 6955152, horizonGlow: 1.5, nebulaStrength: 1.5,
    nebulaColorA: 8003504, nebulaColorB: 2310344, starDensity: 1, starBrightness: 1, sunOn: true, sunSize: 150,
    sunHeight: 120, sunAngle: 0, sunTopColor: 16771098, sunBottomColor: 16723592, sunGlow: 0.5, mountainsOn: true,
    mountainSeed: 7, mountainHeight: 120, mountainDistance: 170, mountainWidth: 170, mountainFill: 0,
    mountainEdgeColor: 1736191, mountainEdgeBrightness: 0.45, mountainEdgeWidth: 1.5, floorOn: true, floorY: -70,
    gridColor: 13638856, gridBrightness: 1.2, gridSpacing: 20, gridLineWidth: 1.2, fogColor: 6955152, fogNear: 150,
    fogFar: 650, dustOn: true,
  },
  wire: {
    fillAmount: 0.3, fillBrightness: 1, lineWidth: 0.04, lineBrightness: 1.7, lineWhiten: 0.15, innerGlow: 0.6,
    innerGlowWidth: 0.18, gapWidth: 0.01, sideColor: 329231, diagonals: true, diagonalWidth: 0.012, cutCorners: false,
    cutSize: 0.12, edgeFlicker: true, flickerTime: 1.2, sideLines: true, sideLineWidth: 0.07, sideLineBrightness: 1.4,
    opacity: 1, gloss: 0, glossAngle: 35, glossWidth: 0.12, skyTint: 0,
  },
  palette4: [16717636, 4029439, 3800852, 16773632, 11544319, 16738816, 16722902, 61695],
  wire5: {
    fillAmount: 1, fillBrightness: 0.4, lineWidth: 0.023, lineBrightness: 0.4, lineWhiten: 0.35, innerGlow: 0.12,
    innerGlowWidth: 0.29, gapWidth: 0, sideColor: 329231, diagonals: false, diagonalWidth: 0.012, cutCorners: false,
    cutSize: 0.12, edgeFlicker: false, flickerTime: 1.2, sideLines: true, sideLineWidth: 0.01, sideLineBrightness: 0,
    opacity: 0.8, gloss: 0.09, glossAngle: 35, glossWidth: 0.12, skyTint: 1,
  },
  palette5: [16717636, 4029439, 3800852, 16773632, 11544319, 16738816, 16722902, 61695],
  reflection: { enabled: true, strength: 0.5 },
  grade: {
    enabled: true, shadowColor: 4930208, highlightColor: 14465279, tint: 0.5, contrast: 1, saturation: 1.1,
    vignette: 0.45, vignetteSize: 0.35, chromatic: 0, grain: 0.03,
  },
  tirefx: {
    enabled: true, marks: true, neonMarks: true, markLife: 3, markWidth: 0.16, markBrightness: 2.2, smoke: true,
    smokeAmount: 1.5, smokeLife: 1, smokeSize: 0.7, smokeBrightness: 0.2, smokeColorMix: 0.15, landingPuff: true,
    sparks: true, sparkAmount: 2,
  },
  edgefx: {
    enabled: true, dust: false, dustAmount: 0.7, dustLife: 0.5, dustSize: 0.45, dustBrightness: 0.25, dustColorMix: 0,
    sparks: true, sparkAmount: 3, sparkSize: 0.13, sparkBrightness: 5, burst: true,
  },
  speedfx: {
    enabled: true, startSpeed: 12, fullSpeed: 20, driftBoost: 0.25, blur: 0.5, blurClear: 0.25, lines: true,
    lineAmount: 0.4, lineCount: 90, lineInner: 0.56, lineColorA: 262399, lineColorB: 16722902, fringe: 0.018,
    vignette: 0.5, fovKick: 10, roll: 2.5, shake: 1.1,
  },
  camera: { distance: 15, height: 8, lookAhead: 4, lookHeight: 0, fov: 60 },
};
