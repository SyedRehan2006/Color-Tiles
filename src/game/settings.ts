// Tunable game settings, edited live from the settings panel (src/ui/settingsPanel.ts).
// No Three.js or DOM code here except the localStorage save, which is wrapped in try/catch.

export interface RoundSettings {
  roamTime: number; // "get ready": s of free driving between rounds
  firstRoundTime: number; // "get to color": s to reach a target tile in round 1
  timeStep: number; // s taken off the timer each round
  minRoundTime: number; // s: the timer never goes below this
  resultPause: number; // s to watch the tiles vanish before the roam starts
  targetTiles: number; // tiles of the called color on the platform
  shrinking: boolean; // the outer ring of tiles falls for good as the match goes on
  roundsPerRing: number; // rounds between one ring falling and the next
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
}

// Read live by CarController
export interface DriveSettings {
  reverseDelay: number; // s: after stopping, S must be held this long before the car reverses
  bumpStrength: number; // m/s: extra push apart when cars bump (only used when collisions are on)
}

// Pick-one settings. The panel builds a drop-down from each list.
export const CHOICES = {
  theme: ["candy", "cyberpunk"],
  timeOfDay: ["day", "night"],
  tilePalette: ["classic", "themed"], // classic = the original tile colors, themed = colors tuned to the theme
  carShape: ["mixed", "sedan", "truck", "buggy"],
  touchControls: ["auto", "on", "off"], // auto = only on touch devices; on = also on desktop (for testing)
  touchSteer: ["joystick", "arrows"],
  touchPedals: ["manual", "auto"], // manual = GAS + BRAKE buttons; auto = always accelerating, BRAKE only
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

export interface GameSettings extends RoundSettings, PlatformSettings, MatchSettings, DriveSettings, VisualSettings, TouchSettings {
  showTimer: boolean; // show the countdown number on screen
  collisions: boolean; // cars bump into each other (off = they drive through each other)
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
  roundsPerRing: 1,
  gridSize: 10,
  tileSize: 6,
  colorCount: 6,
  reverseDelay: 0.5,
  bumpStrength: 4,
  showTimer: true,
  collisions: false,
  theme: "candy",
  timeOfDay: "day",
  tilePalette: "themed",
  carShape: "mixed",
  shadows: true,
  touchControls: "auto",
  touchSteer: "joystick",
  touchPedals: "manual",
};

// The one live copy that the game reads. The panel changes it, the game reads it when it needs it.
export const settings: GameSettings = { ...DEFAULT_SETTINGS };

// Allowed range for each number, used by the panel and when loading saved values
export type NumberSettingKey =
  | Exclude<keyof RoundSettings, "shrinking">
  | keyof PlatformSettings
  | keyof MatchSettings
  | keyof DriveSettings;

export const SETTING_LIMITS: Record<NumberSettingKey, { min: number; max: number }> = {
  roamTime: { min: 1, max: 30 },
  firstRoundTime: { min: 1, max: 30 },
  timeStep: { min: 0, max: 5 },
  minRoundTime: { min: 0.5, max: 30 },
  resultPause: { min: 0.5, max: 5 },
  targetTiles: { min: 1, max: 100 },
  roundsPerRing: { min: 1, max: 10 },
  botCount: { min: 0, max: 15 },
  botSkill: { min: 1, max: 10 },
  botMix: { min: 0, max: 2 },
  gridSize: { min: 3, max: 20 },
  tileSize: { min: 2, max: 20 },
  colorCount: { min: 2, max: 8 },
  reverseDelay: { min: 0, max: 3 },
  bumpStrength: { min: 0, max: 12 },
};

// How long the player has to reach a target tile in a given round (1 = the first round)
export function roundTime(s: RoundSettings, round: number) {
  return Math.max(s.minRoundTime, s.firstRoundTime - (round - 1) * s.timeStep);
}

const STORAGE_KEY = "car-color-tiles-settings";

export function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be blocked (private window, etc). The settings just won't be remembered.
  }
}

export function loadSettings() {
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
    settings.botCount = Math.round(settings.botCount);
    settings.botSkill = Math.round(settings.botSkill);
    settings.botMix = Math.round(settings.botMix);
    if (typeof saved.shrinking === "boolean") settings.shrinking = saved.shrinking;
    if (typeof saved.showTimer === "boolean") settings.showTimer = saved.showTimer;
    if (typeof saved.collisions === "boolean") settings.collisions = saved.collisions;
    if (typeof saved.shadows === "boolean") settings.shadows = saved.shadows;
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
