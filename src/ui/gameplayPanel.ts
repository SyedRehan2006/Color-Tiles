import {
  DEFAULT_SETTINGS,
  SETTING_LIMITS,
  saveSettings,
  settings,
  type GameSettings,
  type NumberSettingKey,
} from "../game/settings";

// A second panel (the sliders button, bottom right) just for tuning the difficulty director
// (docs/mechanics/04_rounds.md). Everything applies from the next round. Values are saved with the
// other settings.

const STYLE = `
.gp-btn { position: fixed; right: 118px; bottom: 14px; width: 44px; height: 44px; border-radius: 50%; border: 0; cursor: pointer; z-index: 20;
  background: rgba(20, 24, 40, 0.7); color: #fff; font-size: 22px; line-height: 1; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.gp-btn:hover { background: rgba(40, 48, 80, 0.85); }
.gp-panel { position: fixed; right: 350px; bottom: 68px; width: 340px; max-height: calc(100vh - 90px); overflow-y: auto; padding: 14px 16px; border-radius: 14px; display: none; z-index: 20;
  background: rgba(20, 24, 40, 0.92); color: #fff; font-family: system-ui, "Segoe UI", sans-serif; font-size: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
.gp-panel.open { display: block; }
.gp-panel h2 { margin: 0 0 4px; font-size: 16px; }
.gp-panel h3 { margin: 14px 0 2px; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.85; }
.gp-note { margin: 0 0 6px; font-size: 12px; opacity: 0.65; }
.gp-item { margin: 9px 0; }
.gp-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.gp-row input[type=number] { width: 74px; padding: 4px 6px; border-radius: 6px; border: 1px solid #556; background: #12152a; color: #fff; font-size: 14px; }
.gp-row input[type=checkbox] { width: 20px; height: 20px; }
.gp-desc { margin: 2px 0 0; font-size: 12px; opacity: 0.6; line-height: 1.3; }
.gp-reset { width: 100%; margin-top: 12px; padding: 7px; border: 0; border-radius: 8px; cursor: pointer; background: #3b4266; color: #fff; font-size: 13px; }
.gp-reset:hover { background: #4b5486; }
@media (pointer: coarse) { .gp-btn { top: 14px; bottom: auto; } .gp-panel { top: 66px; bottom: auto; right: 14px; max-height: calc(100vh - 80px); width: 300px; } }
`;

type BoolKey = "director" | "shrinking" | "shrinkEveryRound";

interface BoolField {
  key: BoolKey;
  label: string;
  desc: string;
}
interface NumField {
  key: NumberSettingKey;
  label: string;
  desc: string;
  step: number;
  integer?: boolean;
}

const SWITCHES: BoolField[] = [
  { key: "director", label: "Difficulty director", desc: "On: rounds adapt to the match. Off: the fixed timer, target tiles and shrink rules from the main settings." },
  { key: "shrinking", label: "Platform shrinks", desc: "Off: the outer rings never fall (the match is then decided by pressure and overtime)." },
  { key: "shrinkEveryRound", label: "Shrink every round", desc: "A ring falls after every round, ignoring the car count and the spacing rules below." },
];

const SPACE: NumField[] = [
  { key: "forceShrinkAfter", label: "Force a shrink after", step: 1, integer: true, desc: "Rounds without a shrink before a ring falls anyway, so the platform cannot freeze (the shrink is also spaced 2 rounds apart)." },
];

const PRESSURE: NumField[] = [
  { key: "startCoverage", label: "Called color share, start", step: 0.01, desc: "Share of the platform's tiles that are the called color at pressure 0 (0.12 = 12%, about 12 of 100 tiles)." },
  { key: "minCoverage", label: "Called color share, lowest", step: 0.01, desc: "The lowest that share goes. It is reached at pressure level 8; at least 1 tile always stays." },
  { key: "levelTimeStep", label: "Timer shrinks per level", step: 0.1, desc: "Seconds taken off the countdown for each pressure level (6 s start, never below the shortest time)." },
  { key: "expectedFalls", label: "Expected falls", step: 0.05, desc: "Share of cars that should fall each round. Fewer than this = the round was too easy, pressure goes up by 2 instead of 1." },
  { key: "heavyFalls", label: "Brutal round", step: 0.05, desc: "Share of cars falling that counts as brutal: pressure goes up by 0 that round instead of 1." },
];

const ENDGAME: NumField[] = [
  { key: "suddenDeathAt", label: "Sudden death at", step: 1, integer: true, desc: "With this many cars or fewer left, respawns turn off: the next fall eliminates a car even with lives left. 0 = never." },
];

export class GameplayPanel {
  private panel: HTMLDivElement;
  private inputs = new Map<NumberSettingKey, HTMLInputElement>();
  private boxes = new Map<BoolKey, HTMLInputElement>();

  constructor() {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    const btn = document.createElement("button");
    btn.className = "gp-btn";
    btn.type = "button";
    btn.textContent = "🎚";
    btn.title = "Gameplay: difficulty tuning";
    btn.tabIndex = -1; // keep Space/Enter for driving

    this.panel = document.createElement("div");
    this.panel.className = "gp-panel";
    this.panel.innerHTML = `<h2>Difficulty tuning</h2>
      <p class="gp-note">Applies from the next round and is saved in this browser. The base timer (round 1) and the shortest time are in the main settings (gear).</p>`;

    this.section("Switches");
    for (const f of SWITCHES) this.addSwitch(f);
    this.section("Space: the platform");
    for (const f of SPACE) this.addNumber(f);
    this.section("Pressure: tiles and timer");
    for (const f of PRESSURE) this.addNumber(f);
    this.section("Endgame");
    for (const f of ENDGAME) this.addNumber(f);

    const reset = document.createElement("button");
    reset.className = "gp-reset";
    reset.type = "button";
    reset.tabIndex = -1;
    reset.textContent = "Reset these to defaults";
    reset.addEventListener("click", () => {
      for (const f of SWITCHES) settings[f.key] = DEFAULT_SETTINGS[f.key];
      for (const f of [...SPACE, ...PRESSURE, ...ENDGAME]) settings[f.key] = DEFAULT_SETTINGS[f.key] as GameSettings[typeof f.key];
      saveSettings();
      this.refresh();
      reset.blur();
    });
    this.panel.appendChild(reset);

    btn.addEventListener("click", () => {
      this.panel.classList.toggle("open");
      if (this.panel.classList.contains("open")) this.refresh();
      btn.blur();
    });
    document.body.append(btn, this.panel);
    this.refresh();
  }

  private section(title: string) {
    const h = document.createElement("h3");
    h.textContent = title;
    this.panel.appendChild(h);
  }

  private item(label: string, desc: string, control: HTMLElement) {
    const wrap = document.createElement("label");
    wrap.className = "gp-item";
    wrap.style.display = "block";
    const row = document.createElement("div");
    row.className = "gp-row";
    const text = document.createElement("span");
    text.textContent = label;
    row.append(text, control);
    const d = document.createElement("div");
    d.className = "gp-desc";
    d.textContent = desc;
    wrap.append(row, d);
    this.panel.appendChild(wrap);
  }

  private addSwitch(f: BoolField) {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.addEventListener("change", () => {
      settings[f.key] = box.checked;
      saveSettings();
      box.blur(); // so Space doesn't toggle the box while driving
    });
    this.boxes.set(f.key, box);
    this.item(f.label, f.desc, box);
  }

  private addNumber(f: NumField) {
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(f.step);
    input.min = String(SETTING_LIMITS[f.key].min);
    input.max = String(SETTING_LIMITS[f.key].max);
    input.addEventListener("input", () => {
      // Live as you type; an empty, half-typed or out-of-range box is left alone
      let value = parseFloat(input.value);
      if (!Number.isFinite(value)) return;
      if (f.integer) value = Math.round(value);
      const { min, max } = SETTING_LIMITS[f.key];
      if (value < min || value > max || settings[f.key] === value) return;
      settings[f.key] = value;
      saveSettings();
    });
    input.addEventListener("change", () => this.refresh()); // snap a bad value back into range
    this.inputs.set(f.key, input);
    this.item(f.label, f.desc, input);
  }

  // Show the current settings in the boxes
  refresh() {
    for (const [key, input] of this.inputs) input.value = String(settings[key]);
    for (const [key, box] of this.boxes) box.checked = settings[key];
  }
}
