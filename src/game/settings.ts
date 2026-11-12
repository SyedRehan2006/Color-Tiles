// Tunable game settings, edited live from the settings panel (src/ui/settingsPanel.ts).
// No Three.js or DOM code here except the localStorage save, which is wrapped in try/catch.
import { POKI } from "../build";
import { POKI_SETTINGS } from "../pokiConfig";

export interface RoundSettings {
  roamTime: number; // "get ready": s of free driving between rounds
  firstRoundTime: number; // "get to color": s to reach a target tile in round 1
  timeStep: number; // s taken off the timer each round
  minRoundTime: number; // s: the timer never goes below this
  resultPause: number; // s to watch the tiles vanish before the roam starts
  targetTiles: number; // tiles of the called color on the platform
  shrinking: boolean; // the outer ring of tiles falls for good as the match goes on
  roundsPerRing: number; // rounds between one ring falling and the next (director off only)
  // The difficulty director (docs/mechanics/04_rounds.md). Off = the fixed rules above.
  director: boolean;
  shrinkEveryRound: boolean; // experiment: a ring falls after every round (ignores the car-count rule and spacing)
  startCoverage: number; // share of the platform's tiles that are the called color at pressure 0
  minCoverage: number; // ... the lowest it goes
  levelTimeStep: number; // s taken off the countdown per pressure level
  expectedFalls: number; // share of cars that should fall per round; fewer than this = too easy
  heavyFalls: number; // share of cars falling that counts as a brutal round
  forceShrinkAfter: number; // a ring falls after this many rounds without one, whatever the car count
  suddenDeathAt: number; // with this many cars or fewer left, the next fall eliminates
}

// Changing these rebuilds the platform and restarts the match
export interface PlatformSettings {
  gridSize: number; // tiles per side
  tileSize: number; // meters
  colorCount: number; // different tile colors in play
}

// botCount restarts the match; botSkill is read live
export interface MatchSettings {
  botCount: number; // computer cars next to you (0 = drive alone)
  botSkill: number; // 1 (clumsy, slow to react) .. 10 (sharp)
  botMix: number; // 0 mostly clumsy bots, 1 mixed, 2 mostly sharp (applies live)
  botRespawn: boolean; // off = a bot's first fall eliminates it (applies live)
}

// Read live by CarController
export interface DriveSettings {
  reverseDelay: number; // s: after stopping, S must be held this long before the car reverses
  bumpStrength: number; // m/s: extra push apart when cars bump (only used when collisions are on)
  coastSteerSpeed: number; // m/s: while coasting (no W), steering only reaches full strength at this speed (3 = as strong as with W)
  coastBrake: number; // m/s^2: extra steady slowdown while coasting (0 = only the gentle rolling drag)
  edgeSupport: number; // fraction of the car that must be over tiles to stand (0.5 = falls at half; higher = less hang time)
  edgePull: number; // m/s^2 slide toward the void at full overhang (0 = none; higher = hanging at the edge slips off sooner)
  carScale: number; // size multiplier for every car: model, collider and footprint (1 = 1 x 2 m)
}

// Pick-one settings. The panel builds a drop-down from each list.
export const CHOICES = {
  theme: ["candy", "cyberpunk", "cyberpunk2", "cyberpunk3", "cyberpunk4", "cyberpunk5", "cyberpunk6"],
  timeOfDay: ["day", "night"],
  tilePalette: ["classic", "themed"], // classic = the original tile colors, themed = colors tuned to the theme
  carShape: ["mixed", "sedan", "truck", "buggy"],
  touchControls: ["auto", "on", "off"], // auto = only on touch devices; on = also on desktop (for testing)
  touchSteer: ["joystick", "arrows"],
  touchPedals: ["manual", "auto"], // manual = GAS + BRAKE buttons; auto = always accelerating, BRAKE only
  // What the camera does when you have no car to drive: orbit = slow circle around the platform, watch a car = follow a survivor
  fallenCamera: ["orbit", "watch a car"], // you fell and wait for the next round to respawn
  eliminatedCamera: ["watch a car", "orbit"], // you are out of lives
} as const;
export type ChoiceKey = keyof typeof CHOICES;

// Look of the world. Applies live (see applyVisuals in main.ts).
export interface VisualSettings {
  theme: (typeof CHOICES.theme)[number];
  timeOfDay: (typeof CHOICES.timeOfDay)[number];
  tilePalette: (typeof CHOICES.tilePalette)[number];
  carShape: (typeof CHOICES.carShape)[number];
  shadows: boolean;
}

export interface TouchSettings {
  touchControls: (typeof CHOICES.touchControls)[number];
  touchSteer: (typeof CHOICES.touchSteer)[number];
  touchPedals: (typeof CHOICES.touchPedals)[number];
}

export interface CameraSettings {
  fallenCamera: (typeof CHOICES.fallenCamera)[number];
  eliminatedCamera: (typeof CHOICES.eliminatedCamera)[number];
}

export interface GameSettings extends RoundSettings, PlatformSettings, MatchSettings, DriveSettings, VisualSettings, TouchSettings, CameraSettings {
  showTimer: boolean; // show the countdown number on screen
  collisions: boolean; // cars bump into each other (off = they drive through each other)
  slowMo: boolean; // slow motion for a moment when the car you watch falls off an edge
  knockOffCars: boolean; // a car tumbling off an edge can hit and shove cars that are still driving (off = it passes through them)
}

// Defaults match docs/design-decisions.md: rounds of 6, 5, 4, then 3 seconds
export const DEFAULT_SETTINGS: GameSettings = {
  roamTime: 6,
  firstRoundTime: 6,
  timeStep: 1,
  minRoundTime: 3,
  resultPause: 1.5,
  targetTiles: 12,
  shrinking: true,
  botCount: 7,
  botSkill: 5,
  botMix: 1,
  botRespawn: true,
  roundsPerRing: 1,
  director: true,
  shrinkEveryRound: true,
  startCoverage: 0.12,
  minCoverage: 0.04,
  levelTimeStep: 0.5,
  expectedFalls: 0.2,
  heavyFalls: 0.4,
  forceShrinkAfter: 3,
  suddenDeathAt: 3,
  gridSize: 10,
  tileSize: 6,
  colorCount: 6,
  reverseDelay: 0.5,
  bumpStrength: 4,
  carScale: 1,
  coastSteerSpeed: 12,
  coastBrake: 3,
  edgeSupport: 0.7,
  edgePull: 25,
  showTimer: true,
  collisions: false,
  knockOffCars: true,
  slowMo: true,
  theme: "candy",
  timeOfDay: "day",
  tilePalette: "themed",
  carShape: "mixed",
  shadows: true,
  touchControls: "auto",
  touchSteer: "joystick",
  touchPedals: "manual",
  fallenCamera: "orbit",
  eliminatedCamera: "watch a car",
};

// The one live copy that the game reads. The panel changes it, the game reads it when it needs it.
export const settings: GameSettings = { ...DEFAULT_SETTINGS };

// Allowed range for each number, used by the panel and when loading saved values
export type NumberSettingKey =
  | Exclude<keyof RoundSettings, "shrinking" | "director" | "shrinkEveryRound">
  | keyof PlatformSettings
  | Exclude<keyof MatchSettings, "botRespawn">
  | keyof DriveSettings;

export const SETTING_LIMITS: Record<NumberSettingKey, { min: number; max: number }> = {
  roamTime: { min: 1, max: 30 },
  firstRoundTime: { min: 1, max: 30 },
  timeStep: { min: 0, max: 5 },
  minRoundTime: { min: 0.5, max: 30 },
  resultPause: { min: 0.5, max: 5 },
  targetTiles: { min: 1, max: 100 },
  roundsPerRing: { min: 1, max: 10 },
  startCoverage: { min: 0.02, max: 0.5 },
  minCoverage: { min: 0.01, max: 0.5 },
  levelTimeStep: { min: 0, max: 2 },
  expectedFalls: { min: 0.05, max: 0.9 },
  heavyFalls: { min: 0.1, max: 1 },
  forceShrinkAfter: { min: 2, max: 10 },
  suddenDeathAt: { min: 0, max: 8 },
  botCount: { min: 0, max: 15 },
  botSkill: { min: 1, max: 10 },
  botMix: { min: 0, max: 2 },
  gridSize: { min: 3, max: 20 },
  tileSize: { min: 2, max: 20 },
  colorCount: { min: 2, max: 8 },
  reverseDelay: { min: 0, max: 3 },
  bumpStrength: { min: 0, max: 12 },
  carScale: { min: 0.5, max: 4 },
  coastSteerSpeed: { min: 3, max: 30 },
  coastBrake: { min: 0, max: 15 },
  edgeSupport: { min: 0.3, max: 0.95 },
  edgePull: { min: 0, max: 60 },
};

// How long the player has to reach a target tile in a given round (1 = the first round)
export function roundTime(s: RoundSettings, round: number) {
  return Math.max(s.minRoundTime, s.firstRoundTime - (round - 1) * s.timeStep);
}

const STORAGE_KEY = "car-color-tiles-settings";

export function saveSettings() {
  if (POKI) return; // the Poki build never stores or reads settings
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be blocked (private window, etc). The settings just won't be remembered.
  }
}

export function loadSettings() {
  if (POKI) {
    // Poki build: the exact values in src/pokiConfig.ts, never anything saved in the browser
    Object.assign(settings, POKI_SETTINGS);
    return;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<GameSettings>;
    for (const key of Object.keys(SETTING_LIMITS) as NumberSettingKey[]) {
      const value = saved[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        const { min, max } = SETTING_LIMITS[key];
        settings[key] = Math.min(max, Math.max(min, value));
      }
    }
    // These are counts of whole things
    settings.gridSize = Math.round(settings.gridSize);
    settings.colorCount = Math.round(settings.colorCount);
    settings.targetTiles = Math.round(settings.targetTiles);
    settings.roundsPerRing = Math.round(settings.roundsPerRing);
    settings.forceShrinkAfter = Math.round(settings.forceShrinkAfter);
    settings.suddenDeathAt = Math.round(settings.suddenDeathAt);
    if (typeof saved.director === "boolean") settings.director = saved.director;
    if (typeof saved.shrinkEveryRound === "boolean") settings.shrinkEveryRound = saved.shrinkEveryRound;
    settings.botCount = Math.round(settings.botCount);
    settings.botSkill = Math.round(settings.botSkill);
    settings.botMix = Math.round(settings.botMix);
    if (typeof saved.shrinking === "boolean") settings.shrinking = saved.shrinking;
    if (typeof saved.botRespawn === "boolean") settings.botRespawn = saved.botRespawn;
    if (typeof saved.showTimer === "boolean") settings.showTimer = saved.showTimer;
    if (typeof saved.collisions === "boolean") settings.collisions = saved.collisions;
    if (typeof saved.knockOffCars === "boolean") settings.knockOffCars = saved.knockOffCars;
    if (typeof saved.slowMo === "boolean") settings.slowMo = saved.slowMo;    if (typeof saved.shadows === "boolean") settings.shadows = saved.shadows;
    for (const key of Object.keys(CHOICES) as ChoiceKey[]) {
      const v = saved[key];
      if (typeof v === "string" && (CHOICES[key] as readonly string[]).includes(v)) {
        (settings as unknown as Record<string, string>)[key] = v;
      }
    }
  } catch {
    // Ignore a missing or damaged save
  }
}

export function resetSettings() {
  Object.assign(settings, DEFAULT_SETTINGS);
  saveSettings();
}
