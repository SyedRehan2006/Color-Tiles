import { settings } from "../game/settings";
import { TILE_COLORS } from "../game/tileGrid";
import { neon, type NeonParams } from "../render/neonParams";
import { LOOKS, PALETTES, isGlassTheme, isNeonTheme, type Look } from "../render/theme";
import { WIRE_PRESETS, wire, wire5, type WireParams } from "../render/wireParams";
import { edgefx, grade, reflection, speedfx, tirefx, type EdgeFxParams, type GradeParams, type ReflectionParams, type SpeedFxParams, type TireFxParams } from "../render/fxParams";
import { scenery, type SceneryParams } from "../render/sceneryParams";
import { CAMERA_PARAMS } from "../render/chaseCamera";
import { BAKED_CONFIG } from "../render/bakedConfig";
import { POKI } from "../build";
import { POKI_VISUAL } from "../pokiConfig";

// A second button (palette icon, next to the gear) that opens a panel for tuning the cyberpunk 2 and 3 looks live:
// the neon tiles and glow (shared by both), the cyberpunk 2 sky/light colors, and the cyberpunk 3 scenery. Values are saved in this browser. "Copy values"
// puts everything on the clipboard as text, so a look you like can be pasted back and made the default.
// This is a testing tool: remove or hide it before publishing.
const STYLE = `
.vp-btn { position: fixed; right: 66px; bottom: 14px; width: 44px; height: 44px; border-radius: 50%; border: 0; cursor: pointer; z-index: 20;
  background: rgba(20, 24, 40, 0.7); color: #fff; font-size: 22px; line-height: 1; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.vp-btn:hover { background: rgba(40, 48, 80, 0.85); }
.vp-panel { position: fixed; left: 14px; bottom: 14px; width: 330px; max-height: calc(100vh - 28px); overflow-y: auto; padding: 12px 14px; border-radius: 14px; display: none; z-index: 20;
  background: rgba(20, 24, 40, 0.93); color: #fff; font-family: system-ui, "Segoe UI", sans-serif; font-size: 13px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
.vp-panel.open { display: block; }
.vp-panel h2 { margin: 0 0 2px; font-size: 16px; }
.vp-panel .vp-note { margin: 0 0 8px; font-size: 12px; opacity: 0.65; }
.vp-panel .vp-warn { margin: 0 0 8px; padding: 6px 8px; border-radius: 8px; background: rgba(255, 180, 60, 0.2); font-size: 12px; display: none; }
.vp-panel details { margin: 6px 0; border-top: 1px solid rgba(255,255,255,0.15); padding-top: 6px; }
.vp-panel summary { cursor: pointer; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.9; padding: 4px 0; }
.vp-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 5px 0; }
.vp-row .vp-label { flex: 1 1 auto; }
.vp-row input[type=range] { width: 120px; }
.vp-row .vp-val { width: 42px; text-align: right; opacity: 0.7; font-variant-numeric: tabular-nums; }
.vp-row input[type=color] { width: 44px; height: 24px; padding: 0; border: 1px solid #556; background: none; }
.vp-row input[type=checkbox] { width: 18px; height: 18px; }
.vp-actions { display: flex; gap: 8px; margin-top: 10px; }
.vp-actions button { flex: 1; padding: 7px; border: 0; border-radius: 8px; cursor: pointer; background: #3b4266; color: #fff; font-size: 12px; }
.vp-actions button:hover { background: #4b5486; }
@media (pointer: coarse) { .vp-btn { top: 14px; bottom: auto; } .vp-panel { top: 66px; bottom: auto; max-height: calc(100vh - 80px); width: 300px; } }
`;

// New key: an older save (overwritten by an accidental reset) must not hide the baked look
const STORAGE_KEY = "car-color-tiles-visual-v2";
const CAMERA_KEY = "car-color-tiles-camera-v2";
// The tuned look becomes the default (applyConfig is hoisted; the snapshot below then includes it)
applyConfig(BAKED_CONFIG as unknown as Partial<VisualConfig>);
// The values the game starts with (taken before any saved changes are loaded)
const DEFAULTS = {
  neon: { ...neon },
  palette: [...PALETTES.cyberpunk2],
  day: { ...LOOKS.cyberpunk2.day },
  night: { ...LOOKS.cyberpunk2.night },
  scenery: { ...scenery },
  wire: { ...wire },
  palette4: [...PALETTES.cyberpunk4],
  wire5: { ...wire5 },
  palette5: [...PALETTES.cyberpunk5],
  reflection: { ...reflection },
  grade: { ...grade },
  tirefx: { ...tirefx },
  edgefx: { ...edgefx },
  speedfx: { ...speedfx },
  camera: cameraNow(),
};

interface VisualConfig {
  neon: NeonParams;
  palette: number[];
  day: Look;
  night: Look;
  scenery: SceneryParams;
  wire: WireParams;
  palette4: number[];
  wire5: WireParams;
  palette5: number[];
  reflection: ReflectionParams;
  grade: GradeParams;
  tirefx: TireFxParams;
  edgefx: EdgeFxParams;
  speedfx: SpeedFxParams;
  camera: CameraConfig;
}
interface CameraConfig { distance: number; height: number; lookAhead: number; lookHeight: number; fov: number }

function currentConfig(): VisualConfig {
  return {
    neon: { ...neon },
    palette: [...PALETTES.cyberpunk2],
    day: { ...LOOKS.cyberpunk2.day },
    night: { ...LOOKS.cyberpunk2.night },
    scenery: { ...scenery },
    wire: { ...wire },
    palette4: [...PALETTES.cyberpunk4],
    wire5: { ...wire5 },
    palette5: [...PALETTES.cyberpunk5],
    reflection: { ...reflection },
    grade: { ...grade },
    tirefx: { ...tirefx },
    edgefx: { ...edgefx },
    speedfx: { ...speedfx },
    camera: cameraNow(),
  };
}

function cameraNow(): CameraConfig {
  const { distance, height, lookAhead, lookHeight, fov } = CAMERA_PARAMS;
  return { distance, height, lookAhead, lookHeight, fov };
}

function applyConfig(c: Partial<VisualConfig>) {
  if (c.neon) Object.assign(neon, c.neon);
  if (Array.isArray(c.palette)) c.palette.forEach((v, i) => { if (typeof v === "number") PALETTES.cyberpunk2[i] = v; });
  if (c.day) Object.assign(LOOKS.cyberpunk2.day, c.day);
  if (c.night) Object.assign(LOOKS.cyberpunk2.night, c.night);
  if (c.scenery) Object.assign(scenery, c.scenery);
  if (c.wire) Object.assign(wire, c.wire);
  if (c.wire5) Object.assign(wire5, c.wire5);
  if (c.reflection) Object.assign(reflection, c.reflection);
  if (c.grade) Object.assign(grade, c.grade);
  if (c.tirefx) Object.assign(tirefx, c.tirefx);
  if (c.edgefx) Object.assign(edgefx, c.edgefx);
  if (c.speedfx) Object.assign(speedfx, c.speedfx);
  if (Array.isArray(c.palette5)) c.palette5.forEach((v, i) => { if (typeof v === "number") PALETTES.cyberpunk5[i] = v; });
  if (Array.isArray(c.palette4)) c.palette4.forEach((v, i) => { if (typeof v === "number") PALETTES.cyberpunk4[i] = v; });
  if (c.camera) Object.assign(CAMERA_PARAMS, c.camera);
}

// Call once at startup, before the first applyLook()
export function loadVisualConfig() {
  if (POKI) {
    applyConfig(POKI_VISUAL as unknown as Partial<VisualConfig>); // Poki build: exact values from src/pokiConfig.ts, never saved tuning
    return;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<VisualConfig>;
      delete saved.camera; // the camera has its own save (below), so old saved angles don't hide the new default
      applyConfig(saved);
    }
    const cam = localStorage.getItem(CAMERA_KEY);
    if (cam) applyConfig({ camera: JSON.parse(cam) });
  } catch {
    // Ignore a missing or damaged save
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentConfig()));
    localStorage.setItem(CAMERA_KEY, JSON.stringify(currentConfig().camera));
  } catch {
    // Storage can be blocked; the values just won't be remembered
  }
}

const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
const lookNow = () => LOOKS.cyberpunk2[settings.timeOfDay];

export class VisualPanel {
  private panel: HTMLDivElement;
  private warn: HTMLDivElement;
  private refreshers: (() => void)[] = [];
  private gated: { el: HTMLElement; themes: string[] }[] = []; // groups shown only for some themes
  private onChange: () => void;

  // onChange: called after every edit; the game re-applies the look
  constructor(onChange: () => void) {
    this.onChange = onChange;
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.className = "vp-btn";
    btn.type = "button";
    btn.textContent = "🎨";
    btn.title = "Visual settings";
    btn.tabIndex = -1;

    this.panel = document.createElement("div");
    this.panel.className = "vp-panel";
    this.panel.innerHTML = `<h2>Visual settings</h2>
      <p class="vp-note">Live tuning for cyberpunk 2 to 5. Saved in this browser.</p>`;
    this.warn = document.createElement("div");
    this.warn.className = "vp-warn";
    this.warn.textContent = "These only change the cyberpunk 2 to 5 themes. Pick one under Settings → Look → Theme.";
    this.panel.appendChild(this.warn);

    // Tiles
    const tiles = this.group("Tiles (cyberpunk 2 and 3)");
    this.gate(tiles, ["cyberpunk2", "cyberpunk3"]);
    this.slider(tiles, "Neon brightness", () => neon.brightness, (v) => (neon.brightness = v), 0.5, 3, 0.05);
    this.slider(tiles, "Fill softness", () => neon.fillSoftness, (v) => (neon.fillSoftness = v), 0, 1, 0.01);
    this.slider(tiles, "Border width", () => neon.borderWidth, (v) => (neon.borderWidth = v), 0, 0.1, 0.002);
    this.color(tiles, "Border color", () => neon.borderColor, (v) => (neon.borderColor = v));
    this.slider(tiles, "Rim line width", () => neon.rimWidth, (v) => (neon.rimWidth = v), 0, 0.2, 0.002);
    this.slider(tiles, "Rim brightness", () => neon.rimBrightness, (v) => (neon.rimBrightness = v), 0, 1, 0.01);
    this.slider(tiles, "Corner roundness", () => neon.cornerRoundness, (v) => (neon.cornerRoundness = v), 0, 0.3, 0.005);
    this.color(tiles, "Tile side color", () => neon.sideColor, (v) => (neon.sideColor = v));

    // The eight neon colors
    // (cyberpunk 2 and 3 share one set of colors, cyberpunk 4 has its own)
    const colors = this.group("Tile colors (this theme)");
    const pal = () =>
      isGlassTheme(settings.theme) ? PALETTES.cyberpunk5 : settings.theme === "cyberpunk4" ? PALETTES.cyberpunk4 : PALETTES.cyberpunk2;
    TILE_COLORS.forEach((c, i) => {
      this.color(colors, c.name, () => pal()[i], (v) => (pal()[i] = v));
    });

    // Glow
    const glow = this.group("Glow (bloom)");
    this.toggle(glow, "Bloom on", () => neon.bloomEnabled, (v) => (neon.bloomEnabled = v));
    this.slider(glow, "Strength", () => neon.bloomStrength, (v) => (neon.bloomStrength = v), 0, 3, 0.05);
    this.slider(glow, "Radius", () => neon.bloomRadius, (v) => (neon.bloomRadius = v), 0, 1, 0.01);
    this.slider(glow, "Threshold", () => neon.bloomThreshold, (v) => (neon.bloomThreshold = v), 0, 1.5, 0.01);
    this.toggle(glow, "Fake glow (phone mode)", () => neon.fakeGlow, (v) => (neon.fakeGlow = v));

    // Sky and light: edits the look of the time of day that is showing
    const sky = this.group("Sky and light (current time of day)");
    this.gate(sky, ["cyberpunk2"]);
    this.color(sky, "Sky top", () => lookNow().skyTop, (v) => (lookNow().skyTop = v));
    this.color(sky, "Sky horizon", () => lookNow().skyHorizon, (v) => (lookNow().skyHorizon = v));
    this.color(sky, "Sky below", () => lookNow().skyBelow, (v) => (lookNow().skyBelow = v));
    this.color(sky, "Fog color", () => lookNow().fogColor ?? lookNow().skyHorizon, (v) => (lookNow().fogColor = v));
    this.slider(sky, "Fog start", () => neon.fogNear, (v) => (neon.fogNear = v), 0, 300, 5);
    this.slider(sky, "Fog end", () => neon.fogFar, (v) => (neon.fogFar = v), 100, 1000, 10);
    this.slider(sky, "Light strength", () => lookNow().sunIntensity, (v) => (lookNow().sunIntensity = v), 0, 4, 0.05);
    this.slider(sky, "Ambient strength", () => lookNow().hemiIntensity, (v) => (lookNow().hemiIntensity = v), 0, 3, 0.05);
    this.color(sky, "Cloud color", () => lookNow().cloudColor, (v) => (lookNow().cloudColor = v));

    // Cyberpunk 3 scenery
    const sc = scenery as unknown as Record<string, number | boolean>;
    const sl = (g: HTMLElement, label: string, k: keyof SceneryParams, min: number, max: number, step: number) =>
      this.slider(g, label, () => sc[k] as number, (v) => (sc[k] = v), min, max, step);
    const co = (g: HTMLElement, label: string, k: keyof SceneryParams) =>
      this.color(g, label, () => sc[k] as number, (v) => (sc[k] = v));
    const tg = (g: HTMLElement, label: string, k: keyof SceneryParams) =>
      this.toggle(g, label, () => sc[k] as boolean, (v) => (sc[k] = v));
    const grp = (title: string) => {
      const g = this.group(title);
      this.gate(g, ["cyberpunk3", "cyberpunk4", "cyberpunk5", "cyberpunk6"]);
      return g;
    };
    const gSky = grp("Sky (cyberpunk 3-6)");
    co(gSky, "Top", "skyTop");
    co(gSky, "Middle", "skyMid");
    co(gSky, "Horizon", "skyHorizon");
    sl(gSky, "Horizon glow", "horizonGlow", 0, 1.5, 0.01);
    sl(gSky, "Nebula strength", "nebulaStrength", 0, 1.5, 0.01);
    co(gSky, "Nebula color A", "nebulaColorA");
    co(gSky, "Nebula color B", "nebulaColorB");
    sl(gSky, "Star amount", "starDensity", 0, 1, 0.01);
    sl(gSky, "Star brightness", "starBrightness", 0, 2, 0.05);
    const gSun = grp("Sun");
    tg(gSun, "Show sun", "sunOn");
    sl(gSun, "Size", "sunSize", 30, 300, 5);
    sl(gSun, "Height", "sunHeight", -50, 400, 5);
    sl(gSun, "Direction (deg)", "sunAngle", -180, 180, 1);
    co(gSun, "Top color", "sunTopColor");
    co(gSun, "Bottom color", "sunBottomColor");
    sl(gSun, "Glow", "sunGlow", 0, 2, 0.02);
    const gMtn = grp("Mountains");
    tg(gMtn, "Show mountains", "mountainsOn");
    sl(gMtn, "Seed (new shape)", "mountainSeed", 1, 99, 1);
    sl(gMtn, "Height", "mountainHeight", 20, 300, 5);
    sl(gMtn, "Distance", "mountainDistance", 80, 500, 5);
    sl(gMtn, "Thickness", "mountainWidth", 40, 400, 5);
    co(gMtn, "Fill color", "mountainFill");
    co(gMtn, "Edge color", "mountainEdgeColor");
    sl(gMtn, "Edge brightness", "mountainEdgeBrightness", 0, 4, 0.05);
    sl(gMtn, "Edge width (px)", "mountainEdgeWidth", 0.5, 4, 0.1);
    const gFloor = grp("Grid floor");
    tg(gFloor, "Show floor", "floorOn");
    sl(gFloor, "Depth below platform", "floorY", -250, -20, 5);
    co(gFloor, "Grid color", "gridColor");
    sl(gFloor, "Grid brightness", "gridBrightness", 0, 4, 0.05);
    sl(gFloor, "Grid spacing", "gridSpacing", 5, 80, 1);
    sl(gFloor, "Line width (px)", "gridLineWidth", 0.5, 4, 0.1);
    const gHaze = grp("Haze and dust");
    co(gHaze, "Haze color", "fogColor");
    sl(gHaze, "Haze start", "fogNear", 20, 500, 5);
    sl(gHaze, "Haze end", "fogFar", 100, 1400, 10);
    tg(gHaze, "Floating dust", "dustOn");

    // Platform groups: cyberpunk 4 (wireframe tiles) and cyberpunk 5 (the same as tinted glass)
    const platformGroup = (title: string, themes: string[], wp: WireParams, glass: boolean) => {
      const wr = wp as unknown as Record<string, number | boolean>;
      const ws = (g: HTMLElement, label: string, k: keyof WireParams, min: number, max: number, step: number) =>
        this.slider(g, label, () => wr[k] as number, (v) => (wr[k] = v), min, max, step);
      const wt = (g: HTMLElement, label: string, k: keyof WireParams) =>
        this.toggle(g, label, () => wr[k] as boolean, (v) => (wr[k] = v));
      const gw = this.group(title);
      this.gate(gw, themes);
      if (!glass) {
        const presets = document.createElement("div");
        presets.className = "vp-actions";
        for (const [label, key] of [["Wireframe look", "wireframe"], ["Solid look", "solid"]] as const) {
          const b = document.createElement("button");
          b.type = "button";
          b.tabIndex = -1;
          b.textContent = label;
          b.addEventListener("click", () => {
            Object.assign(wp, WIRE_PRESETS[key]);
            this.refresh();
            this.changed();
            b.blur();
          });
          presets.appendChild(b);
        }
        gw.appendChild(presets);
      } else {
        ws(gw, "Opacity (see-through)", "opacity", 0.3, 1, 0.01);
        ws(gw, "Gloss streak", "gloss", 0, 1, 0.01);
        ws(gw, "Gloss angle", "glossAngle", -90, 90, 1);
        ws(gw, "Gloss width", "glossWidth", 0.03, 0.4, 0.01);
        ws(gw, "Sky tint (far tiles)", "skyTint", 0, 3, 0.05);
      }
      ws(gw, glass ? "Tint amount (0 dark .. 1 full)" : "Fill (0 dark .. 1 full)", "fillAmount", 0, 1, 0.01);
      ws(gw, glass ? "Tint brightness" : "Fill brightness", "fillBrightness", 0.1, 2, 0.05);
      ws(gw, "Line width", "lineWidth", 0.005, 0.15, 0.001);
      ws(gw, "Line brightness", "lineBrightness", 0, 4, 0.05);
      ws(gw, "Line whiteness", "lineWhiten", 0, 1, 0.01);
      ws(gw, "Inner glow", "innerGlow", 0, 2, 0.02);
      ws(gw, "Inner glow width", "innerGlowWidth", 0.02, 0.5, 0.01);
      ws(gw, "Gap between tiles", "gapWidth", 0, 0.06, 0.001);
      this.color(gw, "Slab / gap color", () => wp.sideColor, (v) => (wp.sideColor = v));
      wt(gw, "Diagonal line", "diagonals");
      ws(gw, "Diagonal width", "diagonalWidth", 0.003, 0.05, 0.001);
      wt(gw, "Cut corners", "cutCorners");
      ws(gw, "Cut size", "cutSize", 0.02, 0.4, 0.01);
      wt(gw, "Flicker before vanish", "edgeFlicker");
      ws(gw, "Flicker starts (s before)", "flickerTime", 0.3, 3, 0.1);
      wt(gw, "Glowing side lines", "sideLines");
      ws(gw, "Side line width (m)", "sideLineWidth", 0.01, 0.3, 0.005);
      ws(gw, "Side line brightness", "sideLineBrightness", 0, 4, 0.05);
    };
    platformGroup("Platform (cyberpunk 4)", ["cyberpunk4"], wire, false);
    platformGroup("Glass platform (cyberpunk 5, 6)", ["cyberpunk5", "cyberpunk6"], wire5, true);

    // Cyberpunk 5 extras: reflections and the color grade
    const gRef = this.group("Reflections (cyberpunk 5, 6)");
    this.gate(gRef, ["cyberpunk5", "cyberpunk6"]);
    this.toggle(gRef, "Car reflections", () => reflection.enabled, (v) => (reflection.enabled = v));
    this.slider(gRef, "Reflection strength", () => reflection.strength, (v) => (reflection.strength = v), 0, 3, 0.05);
    const gGrade = this.group("Color grade (cyberpunk 5, 6)");
    this.gate(gGrade, ["cyberpunk5", "cyberpunk6"]);
    this.toggle(gGrade, "Color grade on", () => grade.enabled, (v) => (grade.enabled = v));
    this.color(gGrade, "Shadow tint", () => grade.shadowColor, (v) => (grade.shadowColor = v));
    this.color(gGrade, "Highlight tint", () => grade.highlightColor, (v) => (grade.highlightColor = v));
    this.slider(gGrade, "Tint amount", () => grade.tint, (v) => (grade.tint = v), 0, 1, 0.01);
    this.slider(gGrade, "Contrast", () => grade.contrast, (v) => (grade.contrast = v), 0.7, 1.6, 0.01);
    this.slider(gGrade, "Saturation", () => grade.saturation, (v) => (grade.saturation = v), 0, 2, 0.01);
    this.slider(gGrade, "Vignette", () => grade.vignette, (v) => (grade.vignette = v), 0, 1, 0.01);
    this.slider(gGrade, "Vignette size", () => grade.vignetteSize, (v) => (grade.vignetteSize = v), 0, 0.8, 0.01);
    this.slider(gGrade, "Color fringing", () => grade.chromatic, (v) => (grade.chromatic = v), 0, 0.03, 0.001);
    this.slider(gGrade, "Film grain", () => grade.grain, (v) => (grade.grain = v), 0, 0.2, 0.005);

    const gTire = this.group("Tire effects (cyberpunk 5, 6)");
    this.gate(gTire, ["cyberpunk5", "cyberpunk6"]);
    this.toggle(gTire, "Tire effects on", () => tirefx.enabled, (v) => (tirefx.enabled = v));
    this.toggle(gTire, "Skid marks", () => tirefx.marks, (v) => (tirefx.marks = v));
    this.toggle(gTire, "Neon trails (off = rubber)", () => tirefx.neonMarks, (v) => (tirefx.neonMarks = v));
    this.slider(gTire, "Mark lifetime (s)", () => tirefx.markLife, (v) => (tirefx.markLife = v), 0.5, 10, 0.1);
    this.slider(gTire, "Mark width (m)", () => tirefx.markWidth, (v) => (tirefx.markWidth = v), 0.05, 0.5, 0.01);
    this.slider(gTire, "Mark brightness", () => tirefx.markBrightness, (v) => (tirefx.markBrightness = v), 0.2, 4, 0.05);
    this.toggle(gTire, "Smoke", () => tirefx.smoke, (v) => (tirefx.smoke = v));
    this.slider(gTire, "Smoke amount", () => tirefx.smokeAmount, (v) => (tirefx.smokeAmount = v), 0.1, 3, 0.05);
    this.slider(gTire, "Smoke lifetime (s)", () => tirefx.smokeLife, (v) => (tirefx.smokeLife = v), 0.3, 3, 0.05);
    this.slider(gTire, "Smoke size (m)", () => tirefx.smokeSize, (v) => (tirefx.smokeSize = v), 0.3, 2.5, 0.05);
    this.slider(gTire, "Smoke brightness", () => tirefx.smokeBrightness, (v) => (tirefx.smokeBrightness = v), 0.05, 2, 0.05);
    this.slider(gTire, "Smoke color (car .. purple)", () => tirefx.smokeColorMix, (v) => (tirefx.smokeColorMix = v), 0, 1, 0.01);
    this.toggle(gTire, "Landing puff", () => tirefx.landingPuff, (v) => (tirefx.landingPuff = v));
    this.toggle(gTire, "Sparks", () => tirefx.sparks, (v) => (tirefx.sparks = v));
    this.slider(gTire, "Spark amount", () => tirefx.sparkAmount, (v) => (tirefx.sparkAmount = v), 0.1, 3, 0.05);

    // All themes: sparks and dust from the tyres when a car scrapes over a tile edge
    const gEdge = this.group("Edge sparks and dust (all themes)");
    this.toggle(gEdge, "Edge effects on", () => edgefx.enabled, (v) => (edgefx.enabled = v));
    this.toggle(gEdge, "Dust", () => edgefx.dust, (v) => (edgefx.dust = v));
    this.slider(gEdge, "Dust amount", () => edgefx.dustAmount, (v) => (edgefx.dustAmount = v), 0.1, 3, 0.05);
    this.slider(gEdge, "Dust lifetime (s)", () => edgefx.dustLife, (v) => (edgefx.dustLife = v), 0.2, 2, 0.05);
    this.slider(gEdge, "Dust size (m)", () => edgefx.dustSize, (v) => (edgefx.dustSize = v), 0.15, 1.5, 0.05);
    this.slider(gEdge, "Dust brightness", () => edgefx.dustBrightness, (v) => (edgefx.dustBrightness = v), 0.05, 2, 0.05);
    this.slider(gEdge, "Dust color (car .. purple)", () => edgefx.dustColorMix, (v) => (edgefx.dustColorMix = v), 0, 1, 0.01);
    this.toggle(gEdge, "Sparks", () => edgefx.sparks, (v) => (edgefx.sparks = v));
    this.slider(gEdge, "Spark amount", () => edgefx.sparkAmount, (v) => (edgefx.sparkAmount = v), 0.1, 3, 0.05);
    this.slider(gEdge, "Spark size (m)", () => edgefx.sparkSize, (v) => (edgefx.sparkSize = v), 0.05, 0.5, 0.01);
    this.slider(gEdge, "Spark brightness", () => edgefx.sparkBrightness, (v) => (edgefx.sparkBrightness = v), 0.3, 5, 0.1);
    this.toggle(gEdge, "Burst when going over", () => edgefx.burst, (v) => (edgefx.burst = v));

    // Cyberpunk 6 only: speed effects
    const gSpeed = this.group("Speed effects (cyberpunk 6)");
    this.gate(gSpeed, ["cyberpunk6"]);
    const sp = (label: string, k: keyof SpeedFxParams, min: number, max: number, step: number) =>
      this.slider(gSpeed, label, () => speedfx[k] as number, (v) => ((speedfx as unknown as Record<string, number>)[k] = v), min, max, step);
    this.toggle(gSpeed, "Speed effects on", () => speedfx.enabled, (v) => (speedfx.enabled = v));
    sp("Starts at speed (m/s)", "startSpeed", 0, 20, 0.5);
    sp("Full strength at (m/s)", "fullSpeed", 5, 30, 0.5);
    sp("Extra while drifting", "driftBoost", 0, 0.6, 0.01);
    sp("Blur amount", "blur", 0, 2, 0.02);
    sp("Sharp middle size", "blurClear", 0, 0.6, 0.01);
    this.toggle(gSpeed, "Speed lines", () => speedfx.lines, (v) => (speedfx.lines = v));
    sp("Line brightness", "lineAmount", 0, 2, 0.02);
    sp("Line count", "lineCount", 20, 200, 1);
    sp("Lines start at (from middle)", "lineInner", 0.1, 0.8, 0.01);
    this.color(gSpeed, "Line color A", () => speedfx.lineColorA, (v) => (speedfx.lineColorA = v));
    this.color(gSpeed, "Line color B", () => speedfx.lineColorB, (v) => (speedfx.lineColorB = v));
    sp("Color fringing", "fringe", 0, 0.04, 0.001);
    sp("Dark corners", "vignette", 0, 1, 0.01);
    sp("View widening (deg)", "fovKick", 0, 25, 0.5);
    sp("Camera lean (deg)", "roll", 0, 8, 0.1);
    sp("Shake (landing)", "shake", 0, 2, 0.05);

    // Camera (all themes): the default view looks steeply down, so little sky shows. Lower it to see the scenery.
    const cam = this.group("Camera (all themes)");
    this.slider(cam, "Distance behind", () => CAMERA_PARAMS.distance, (v) => (CAMERA_PARAMS.distance = v), 6, 40, 0.5);
    this.slider(cam, "Height", () => CAMERA_PARAMS.height, (v) => (CAMERA_PARAMS.height = v), 1, 30, 0.25);
    this.slider(cam, "Look ahead (m)", () => CAMERA_PARAMS.lookAhead, (v) => (CAMERA_PARAMS.lookAhead = v), 0, 60, 0.5);
    this.slider(cam, "Look up/down (m)", () => CAMERA_PARAMS.lookHeight, (v) => (CAMERA_PARAMS.lookHeight = v), -5, 15, 0.25);
    this.slider(cam, "Field of view", () => CAMERA_PARAMS.fov, (v) => (CAMERA_PARAMS.fov = v), 40, 100, 1);

    // Actions
    const actions = document.createElement("div");
    actions.className = "vp-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.tabIndex = -1;
    copy.textContent = "Copy values";
    copy.addEventListener("click", () => {
      const text = JSON.stringify(currentConfig(), null, 2);
      const done = () => { copy.textContent = "Copied!"; setTimeout(() => (copy.textContent = "Copy values"), 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => window.prompt("Copy these values:", text));
      else window.prompt("Copy these values:", text);
      copy.blur();
    });
    const reset = document.createElement("button");
    reset.type = "button";
    reset.tabIndex = -1;
    reset.textContent = "Reset to defaults";
    reset.addEventListener("click", () => {
      applyConfig(structuredClone(DEFAULTS));
      // fogColor is not in the defaults (it follows the sky horizon), so clear any edited value
      delete LOOKS.cyberpunk2.day.fogColor;
      delete LOOKS.cyberpunk2.night.fogColor;
      save();
      this.refresh();
      this.onChange();
      reset.blur();
    });
    actions.append(copy, reset);
    this.panel.appendChild(actions);

    btn.addEventListener("click", () => {
      this.panel.classList.toggle("open");
      if (this.panel.classList.contains("open")) this.refresh();
      btn.blur(); // hand the keyboard back to the game
    });
    document.body.append(btn, this.panel);
    this.refresh();
  }

  // Show the current values in the controls (call after the theme or time of day changes)
  refresh() {
    this.warn.style.display = isNeonTheme(settings.theme) ? "none" : "block";
    for (const g of this.gated) g.el.style.display = g.themes.includes(settings.theme) ? "" : "none";
    for (const r of this.refreshers) r();
  }

  private gate(el: HTMLElement, themes: string[]) {
    this.gated.push({ el, themes });
  }

  private changed() {
    save();
    this.onChange();
  }

  private group(title: string) {
    const d = document.createElement("details");
    d.open = true;
    const s = document.createElement("summary");
    s.textContent = title;
    d.appendChild(s);
    this.panel.appendChild(d);
    return d;
  }

  private row(parent: HTMLElement, label: string) {
    const row = document.createElement("label");
    row.className = "vp-row";
    const text = document.createElement("span");
    text.className = "vp-label";
    text.textContent = label;
    row.appendChild(text);
    parent.appendChild(row);
    return row;
  }

  private slider(parent: HTMLElement, label: string, get: () => number, set: (v: number) => void, min: number, max: number, step: number) {
    const row = this.row(parent, label);
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const val = document.createElement("span");
    val.className = "vp-val";
    const show = () => {
      input.value = String(get());
      val.textContent = String(Math.round(get() * 1000) / 1000);
    };
    input.addEventListener("input", () => {
      set(parseFloat(input.value));
      val.textContent = String(Math.round(get() * 1000) / 1000);
      this.changed();
    });
    input.addEventListener("change", () => input.blur()); // so the arrow keys keep driving the car
    row.append(input, val);
    this.refreshers.push(show);
  }

  private color(parent: HTMLElement, label: string, get: () => number, set: (v: number) => void) {
    const row = this.row(parent, label);
    const input = document.createElement("input");
    input.type = "color";
    input.addEventListener("input", () => {
      set(parseInt(input.value.slice(1), 16));
      this.changed();
    });
    input.addEventListener("change", () => input.blur());
    row.appendChild(input);
    this.refreshers.push(() => (input.value = hex(get())));
  }

  private toggle(parent: HTMLElement, label: string, get: () => boolean, set: (v: boolean) => void) {
    const row = this.row(parent, label);
    const input = document.createElement("input");
    input.type = "checkbox";
    input.addEventListener("change", () => {
      set(input.checked);
      this.changed();
      input.blur();
    });
    row.appendChild(input);
    this.refreshers.push(() => (input.checked = get()));
  }
}
