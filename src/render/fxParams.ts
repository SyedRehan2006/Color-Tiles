// Tunable values for the cyberpunk 5 extras: car reflections in the glass, and the color grading pass.
// Edited live from the visual panel (src/ui/visualPanel.ts), read by racer.ts, postFx.ts and main.ts.
export interface ReflectionParams {
  enabled: boolean;
  strength: number; // how bright the reflected car is (before the glass dims it)
}

export const REFLECTION_DEFAULTS: ReflectionParams = { enabled: true, strength: 1.2 };
export const reflection: ReflectionParams = { ...REFLECTION_DEFAULTS };

// Color grading: one tint, contrast and vignette over the whole picture so everything shares a palette
export interface GradeParams {
  enabled: boolean;
  shadowColor: number; // dark parts lean toward this
  highlightColor: number; // bright parts lean toward this
  tint: number; // how strongly (0 = none)
  contrast: number;
  saturation: number;
  vignette: number; // darker corners
  vignetteSize: number; // distance from the middle where it starts
  chromatic: number; // color fringing toward the corners
  grain: number; // film grain
}

export const GRADE_DEFAULTS: GradeParams = {
  enabled: true,
  shadowColor: 0x4b3aa0,
  highlightColor: 0xdcb8ff,
  tint: 0.35,
  contrast: 1.08,
  saturation: 1.1,
  vignette: 0.45,
  vignetteSize: 0.35,
  chromatic: 0.006,
  grain: 0.03,
};
export const grade: GradeParams = { ...GRADE_DEFAULTS };

// Tire effects (cyberpunk 5): skid marks, smoke, sparks, landing puffs. Read by tireFx.ts.
export interface TireFxParams {
  enabled: boolean;
  marks: boolean;
  neonMarks: boolean; // glowing trails in the car's color (false = dark rubber)
  markLife: number; // seconds until a mark has faded
  markWidth: number; // meters
  markBrightness: number;
  smoke: boolean;
  smokeAmount: number;
  smokeLife: number;
  smokeSize: number;
  smokeBrightness: number;
  smokeColorMix: number; // 0 = the car's color, 1 = purple
  landingPuff: boolean;
  sparks: boolean;
  sparkAmount: number;
}

export const TIREFX_DEFAULTS: TireFxParams = {
  enabled: true,
  marks: true,
  neonMarks: true,
  markLife: 3,
  markWidth: 0.16,
  markBrightness: 1.6,
  smoke: true,
  smokeAmount: 0.7,
  smokeLife: 1.1,
  smokeSize: 0.7,
  smokeBrightness: 0.2,
  smokeColorMix: 0.5,
  landingPuff: true,
  sparks: false,
  sparkAmount: 1,
};
export const tirefx: TireFxParams = { ...TIREFX_DEFAULTS };

// Edge sparks and dust (all themes): what a car throws up from its tyres while it scrapes over a tile
// edge, and when it goes over. Read by edgeFx.ts. Colors follow the car and the tire smoke.
export interface EdgeFxParams {
  enabled: boolean;
  dust: boolean;
  dustAmount: number;
  dustLife: number; // seconds
  dustSize: number; // meters
  dustBrightness: number;
  dustColorMix: number; // 0 = the car's color, 1 = purple (same idea as the tire smoke)
  sparks: boolean;
  sparkAmount: number;
  sparkSize: number; // meters
  sparkBrightness: number;
  burst: boolean; // a puff and a few sparks when the car goes over the edge
}

export const EDGEFX_DEFAULTS: EdgeFxParams = {
  enabled: true,
  dust: true,
  dustAmount: 0.7,
  dustLife: 0.7,
  dustSize: 0.45,
  dustBrightness: 0.25,
  dustColorMix: 0.5,
  sparks: true,
  sparkAmount: 0.5,
  sparkSize: 0.13,
  sparkBrightness: 2,
  burst: true,
};
export const edgefx: EdgeFxParams = { ...EDGEFX_DEFAULTS };

// Speed effects (cyberpunk 6 only): radial blur, neon speed lines, camera feel. Read by speedFx.ts, postFx.ts, main.ts.
export interface SpeedFxParams {
  enabled: boolean;
  startSpeed: number; // m/s: below this nothing shows
  fullSpeed: number; // m/s: at this speed the effects are at full strength
  driftBoost: number; // extra strength while the handbrake slide is on
  blur: number; // radial blur amount (0 = off)
  blurClear: number; // size of the sharp area in the middle (screen heights)
  lines: boolean;
  lineAmount: number; // brightness of the speed lines
  lineCount: number;
  lineInner: number; // where the lines start (distance from the middle, in screen heights)
  lineColorA: number;
  lineColorB: number;
  fringe: number; // extra color fringing at the edges while fast
  vignette: number; // extra dark corners while fast
  fovKick: number; // degrees the view widens at full speed
  roll: number; // degrees the camera leans when steering at speed
  shake: number; // strength of the landing and speed shake
}

export const SPEEDFX_DEFAULTS: SpeedFxParams = {
  enabled: true,
  startSpeed: 8,
  fullSpeed: 20,
  driftBoost: 0.25,
  blur: 0.5,
  blurClear: 0.22,
  lines: true,
  lineAmount: 0.8,
  lineCount: 90,
  lineInner: 0.42,
  lineColorA: 0x00f0ff,
  lineColorB: 0xff2bd6,
  fringe: 0.012,
  vignette: 0.25,
  fovKick: 10,
  roll: 2.5,
  shake: 0.5,
};
export const speedfx: SpeedFxParams = { ...SPEEDFX_DEFAULTS };
