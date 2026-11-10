// The tuned look (copied from the visual panel with "Copy values"). It is applied at startup before the panel
// takes its "defaults" snapshot, so "Reset to defaults" brings back exactly this look.
// Cyberpunk 5 and 6 share the glass platform, palette5, reflection and grade values.
export const BAKED_CONFIG = {
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
  camera: { distance: 12, height: 9, fov: 60 },
};
