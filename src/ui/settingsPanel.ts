import {
  CHOICES,
  SETTING_LIMITS,
  resetSettings,
  saveSettings,
  settings,
  type ChoiceKey,
  type NumberSettingKey,
} from "../game/settings";

const STYLE = `
.sp-gear { position: fixed; right: 14px; bottom: 14px; width: 44px; height: 44px; border-radius: 50%; border: 0; cursor: pointer;
  background: rgba(20, 24, 40, 0.7); color: #fff; font-size: 24px; line-height: 1; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.sp-gear:hover { background: rgba(40, 48, 80, 0.85); }
.sp-panel { position: fixed; right: 14px; bottom: 68px; width: 320px; max-height: calc(100vh - 90px); overflow-y: auto; padding: 14px 16px; border-radius: 14px; display: none;
  background: rgba(20, 24, 40, 0.92); color: #fff; font-family: system-ui, "Segoe UI", sans-serif; font-size: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
.sp-panel.open { display: block; }
.sp-panel h2 { margin: 0 0 4px; font-size: 16px; }
.sp-panel h3 { margin: 12px 0 2px; font-size: 13px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.85; }
.sp-panel .sp-note { margin: 0 0 6px; font-size: 12px; opacity: 0.65; }
.sp-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 7px 0; }
.sp-row input[type=number] { width: 70px; padding: 4px 6px; border-radius: 6px; border: 1px solid #556; background: #12152a; color: #fff; font-size: 14px; }
.sp-row select { padding: 4px 6px; border-radius: 6px; border: 1px solid #556; background: #12152a; color: #fff; font-size: 14px; }
.sp-row input[type=checkbox] { width: 20px; height: 20px; }
.sp-row .sp-unit { display: inline-block; width: 14px; opacity: 0.6; font-size: 12px; margin-left: 4px; }
@media (pointer: coarse) { .sp-gear { top: 14px; bottom: auto; } .sp-panel { top: 66px; bottom: auto; max-height: calc(100vh - 80px); width: 300px; } }
.sp-gear, .sp-panel { z-index: 20; }
.sp-sep { height: 1px; background: rgba(255,255,255,0.15); margin: 10px 0; }
.sp-reset { width: 100%; margin-top: 6px; padding: 7px; border: 0; border-radius: 8px; cursor: pointer; background: #3b4266; color: #fff; font-size: 13px; }
.sp-reset:hover { background: #4b5486; }
`;

interface Field {
  key: NumberSettingKey;
  label: string;
  step: number;
  unit: string;
  integer?: boolean;
}

// Timer fields apply as you type. Platform fields rebuild the platform, so they apply when you press
// Enter or click away from the box (not on every keystroke).
const TIMER_FIELDS: Field[] = [
  { key: "roamTime", label: "Get ready time", step: 0.5, unit: "s" },
  { key: "firstRoundTime", label: "Get to color time, round 1", step: 0.5, unit: "s" },
  { key: "timeStep", label: "Get to color time shrinks by", step: 0.5, unit: "s" },
  { key: "minRoundTime", label: "Shortest get to color time", step: 0.5, unit: "s" },
  { key: "resultPause", label: "Pause after tiles vanish", step: 0.5, unit: "s" },
];
// Shrinking applies from the next round, no restart needed
const SHRINK_FIELDS: Field[] = [
  { key: "roundsPerRing", label: "Rounds per ring that falls", step: 1, unit: "", integer: true },
];
// Bots: the count restarts the match, the skill applies live
const BOT_FIELDS: Field[] = [
  { key: "botCount", label: "Bot cars", step: 1, unit: "", integer: true },
  { key: "botSkill", label: "Bot skill (1 clumsy - 10 sharp)", step: 1, unit: "", integer: true },
  { key: "botMix", label: "Bot mix (0 clumsy, 1 mixed, 2 sharp)", step: 1, unit: "", integer: true },
];
// Driving applies live
const DRIVE_FIELDS: Field[] = [
  { key: "reverseDelay", label: "Reverse delay after stopping", step: 0.1, unit: "s" },
  { key: "carScale", label: "Car scale (1 = default size)", step: 0.1, unit: "x" },
  { key: "coastSteerSpeed", label: "Coasting: full steering only above", step: 1, unit: "m/s" },
  { key: "coastBrake", label: "Coasting: extra slowdown", step: 0.5, unit: "m/s²" },
  { key: "edgeSupport", label: "Edge: share of car on tiles to stay up", step: 0.05, unit: "" },
  { key: "edgePull", label: "Edge: slide toward the void", step: 2, unit: "m/s²" },
];
const COLLISION_FIELDS: Field[] = [
  { key: "bumpStrength", label: "Bump push strength", step: 1, unit: "m/s" },
];
const PLATFORM_FIELDS: Field[] = [
  { key: "gridSize", label: "Grid size (tiles per side)", step: 1, unit: "", integer: true },
  { key: "tileSize", label: "Tile size", step: 1, unit: "m" },
  { key: "colorCount", label: "Number of tile colors", step: 1, unit: "", integer: true },
  { key: "targetTiles", label: "Tiles of the called color", step: 1, unit: "", integer: true },
];

// A gear button (bottom right) that opens a panel for tuning the timers and the platform.
export class SettingsPanel {
  private panel: HTMLDivElement;
  private inputs = new Map<NumberSettingKey, HTMLInputElement>();
  private showTimerBox: HTMLInputElement;
  private shrinkBox: HTMLInputElement;
  private collisionsBox: HTMLInputElement;
  private knockBox!: HTMLInputElement;
  private slowBox!: HTMLInputElement;
  private botRespawnBox!: HTMLInputElement;
  private onShowTimerChange: (show: boolean) => void;
  private onPlatformChange: () => void;
  private onVisualChange: () => void;
  private selects = new Map<ChoiceKey, HTMLSelectElement>();
  private shadowsBox!: HTMLInputElement;

  constructor(onShowTimerChange: (show: boolean) => void, onPlatformChange: () => void, onVisualChange: () => void) {
    this.onVisualChange = onVisualChange;
    this.onShowTimerChange = onShowTimerChange;
    this.onPlatformChange = onPlatformChange;

    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    const gear = document.createElement("button");
    gear.className = "sp-gear";
    gear.type = "button";
    gear.textContent = "⚙";
    gear.title = "Settings";
    gear.tabIndex = -1; // keep Space/Enter for driving, not for pressing this button

    this.panel = document.createElement("div");
    this.panel.className = "sp-panel";
    this.panel.innerHTML = `<h2>Settings</h2><p class="sp-note">Saved in this browser.</p>
      <h3>Timers</h3><p class="sp-note">Apply to the next round or roam.</p>`;

    for (const f of TIMER_FIELDS) this.addField(f, false);

    const timerRow = document.createElement("label");
    timerRow.className = "sp-row";
    const timerText = document.createElement("span");
    timerText.textContent = "Show timer on screen";
    this.showTimerBox = document.createElement("input");
    this.showTimerBox.type = "checkbox";
    this.showTimerBox.addEventListener("change", () => {
      settings.showTimer = this.showTimerBox.checked;
      saveSettings();
      this.onShowTimerChange(settings.showTimer);
      this.showTimerBox.blur(); // so Space doesn't toggle the box while driving
    });
    timerRow.append(timerText, this.showTimerBox);
    this.panel.appendChild(timerRow);

    const lookTitle = document.createElement("div");
    lookTitle.innerHTML = `<div class="sp-sep"></div><h3>Look</h3>
      <p class="sp-note">Theme, time of day, tile colors and car shapes. Applies right away.</p>`;
    this.panel.appendChild(lookTitle);
    this.addSelect("theme", "Theme");
    this.addSelect("timeOfDay", "Time of day");
    this.addSelect("tilePalette", "Tile colors");
    this.addSelect("carShape", "Car shapes");
    const shadowRow = document.createElement("label");
    shadowRow.className = "sp-row";
    const shadowText = document.createElement("span");
    shadowText.textContent = "Shadows";
    this.shadowsBox = document.createElement("input");
    this.shadowsBox.type = "checkbox";
    this.shadowsBox.addEventListener("change", () => {
      settings.shadows = this.shadowsBox.checked;
      saveSettings();
      this.onVisualChange();
      this.shadowsBox.blur();
    });
    shadowRow.append(shadowText, this.shadowsBox);
    this.panel.appendChild(shadowRow);

    const touchTitle = document.createElement("div");
    touchTitle.innerHTML = `<div class="sp-sep"></div><h3>Touch controls</h3>
      <p class="sp-note">On-screen buttons for phones. "on" shows them on desktop too, for testing.</p>`;
    this.panel.appendChild(touchTitle);
    this.addSelect("touchControls", "Show controls", false);
    this.addSelect("touchSteer", "Steering", false);
    this.addSelect("touchPedals", "Pedals", false);

    const camTitle = document.createElement("div");
    camTitle.innerHTML = `<div class="sp-sep"></div><h3>Camera</h3>
      <p class="sp-note">What the camera does while you have no car. Orbit = slow circle around the platform. Applies right away.</p>`;
    this.panel.appendChild(camTitle);
    this.addSelect("fallenCamera", "After a fall (waiting to respawn)", false);
    this.addSelect("eliminatedCamera", "When eliminated", false);

    const driveTitle = document.createElement("div");
    driveTitle.innerHTML = `<div class="sp-sep"></div><h3>Driving</h3>
      <p class="sp-note">S brakes first, then reverses after this delay. Applies right away.</p>`;
    this.panel.appendChild(driveTitle);
    for (const f of DRIVE_FIELDS) this.addField(f, false);

    const collTitle = document.createElement("div");
    collTitle.innerHTML = `<div class="sp-sep"></div><h3>Collisions</h3>
      <p class="sp-note">Cars bump each other. Off = they drive through each other. Applies right away.</p>`;
    this.panel.appendChild(collTitle);
    const collRow = document.createElement("label");
    collRow.className = "sp-row";
    const collText = document.createElement("span");
    collText.textContent = "Car collisions";
    this.collisionsBox = document.createElement("input");
    this.collisionsBox.type = "checkbox";
    this.collisionsBox.addEventListener("change", () => {
      settings.collisions = this.collisionsBox.checked;
      saveSettings();
      this.collisionsBox.blur(); // so Space doesn't toggle the box while driving
    });
    collRow.append(collText, this.collisionsBox);
    this.panel.appendChild(collRow);

    const knockRow = document.createElement("label");
    knockRow.className = "sp-row";
    const knockText = document.createElement("span");
    knockText.textContent = "Falling cars knock others";
    knockRow.title = "A car tumbling off an edge hits and shoves cars still driving. Off = it passes through them. Applies right away.";
    this.knockBox = document.createElement("input");
    this.knockBox.type = "checkbox";
    this.knockBox.addEventListener("change", () => {
      settings.knockOffCars = this.knockBox.checked;
      saveSettings();
      this.knockBox.blur();
    });
    knockRow.append(knockText, this.knockBox);
    this.panel.appendChild(knockRow);

    const slowRow = document.createElement("label");
    slowRow.className = "sp-row";
    const slowText = document.createElement("span");
    slowText.textContent = "Slow-mo when a car falls";
    this.slowBox = document.createElement("input");
    this.slowBox.type = "checkbox";
    this.slowBox.addEventListener("change", () => {
      settings.slowMo = this.slowBox.checked;
      saveSettings();
      this.slowBox.blur();
    });
    slowRow.append(slowText, this.slowBox);
    this.panel.appendChild(slowRow);    for (const f of COLLISION_FIELDS) this.addField(f, false);

    const platformTitle = document.createElement("div");
    platformTitle.innerHTML = `<div class="sp-sep"></div><h3>Platform</h3>
      <p class="sp-note">Changing these rebuilds the platform and restarts the match. Press Enter or click away to apply.</p>`;
    this.panel.appendChild(platformTitle);

    for (const f of PLATFORM_FIELDS) this.addField(f, true);

    const botTitle = document.createElement("div");
    botTitle.innerHTML = `<div class="sp-sep"></div><h3>Bots</h3>
      <p class="sp-note">Bot count restarts the match. Skill applies from the next round.</p>`;
    this.panel.appendChild(botTitle);
    for (const f of BOT_FIELDS) this.addField(f, f.key === "botCount");
    const botRespawnRow = document.createElement("label");
    botRespawnRow.className = "sp-row";
    const botRespawnText = document.createElement("span");
    botRespawnText.textContent = "Bots respawn";
    botRespawnRow.title = "Off = a bot that falls is out immediately, whatever lives it has left. Applies right away.";
    this.botRespawnBox = document.createElement("input");
    this.botRespawnBox.type = "checkbox";
    this.botRespawnBox.addEventListener("change", () => {
      settings.botRespawn = this.botRespawnBox.checked;
      saveSettings();
      this.botRespawnBox.blur();
    });
    botRespawnRow.append(botRespawnText, this.botRespawnBox);
    this.panel.appendChild(botRespawnRow);

    const shrinkTitle = document.createElement("div");
    shrinkTitle.innerHTML = `<div class="sp-sep"></div><h3>Shrinking</h3>
      <p class="sp-note">The outer ring of tiles falls when a round ends. Applies from the next round.</p>`;
    this.panel.appendChild(shrinkTitle);

    const shrinkRow = document.createElement("label");
    shrinkRow.className = "sp-row";
    const shrinkText = document.createElement("span");
    shrinkText.textContent = "Platform shrinks";
    this.shrinkBox = document.createElement("input");
    this.shrinkBox.type = "checkbox";
    this.shrinkBox.addEventListener("change", () => {
      settings.shrinking = this.shrinkBox.checked;
      saveSettings();
      this.shrinkBox.blur();
    });
    shrinkRow.append(shrinkText, this.shrinkBox);
    this.panel.appendChild(shrinkRow);
    for (const f of SHRINK_FIELDS) this.addField(f, false);


    const reset = document.createElement("button");
    reset.className = "sp-reset";
    reset.type = "button";
    reset.tabIndex = -1;
    reset.textContent = "Reset all to defaults";
    reset.addEventListener("click", () => {
      resetSettings();
      this.refresh();
      this.onShowTimerChange(settings.showTimer);
      this.onPlatformChange();
      this.onVisualChange();
      reset.blur();
    });
    this.panel.appendChild(reset);

    gear.addEventListener("click", () => {
      this.panel.classList.toggle("open");
      if (this.panel.classList.contains("open")) this.refresh();
      gear.blur(); // hand the keyboard back to the game
    });

    document.body.append(gear, this.panel);
    this.refresh();
  }

  private addSelect(key: ChoiceKey, label: string, notify = true) {
    const row = document.createElement("label");
    row.className = "sp-row";
    const text = document.createElement("span");
    text.textContent = label;
    const select = document.createElement("select");
    for (const option of CHOICES[key]) {
      const o = document.createElement("option");
      o.value = option;
      o.textContent = option;
      select.appendChild(o);
    }
    select.addEventListener("change", () => {
      (settings as unknown as Record<string, string>)[key] = select.value;
      saveSettings();
      if (notify) this.onVisualChange();
      select.blur(); // hand the keyboard back to the game
    });
    row.append(text, select);
    this.panel.appendChild(row);
    this.selects.set(key, select);
  }

  private addField(f: Field, rebuildsPlatform: boolean) {
    const row = document.createElement("label");
    row.className = "sp-row";
    const text = document.createElement("span");
    text.textContent = f.label;
    const right = document.createElement("span");
    const input = document.createElement("input");
    input.type = "number";
    input.step = String(f.step);
    input.min = String(SETTING_LIMITS[f.key].min);
    input.max = String(SETTING_LIMITS[f.key].max);

    if (rebuildsPlatform) {
      // Apply when the box is committed (Enter, click away, or the arrow buttons)
      input.addEventListener("change", () => {
        if (this.commit(f, input)) this.onPlatformChange();
        this.refresh();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
      });
    } else {
      input.addEventListener("input", () => this.commit(f, input)); // live as you type
      input.addEventListener("change", () => this.refresh()); // snap a bad value back into range
    }

    const unit = document.createElement("span");
    unit.className = "sp-unit";
    unit.textContent = f.unit;
    right.append(input, unit);
    row.append(text, right);
    this.panel.appendChild(row);
    this.inputs.set(f.key, input);
  }

  // Take what is typed, if it is a valid number in range. Returns true if the setting changed.
  private commit(f: Field, input: HTMLInputElement) {
    let value = parseFloat(input.value);
    if (!Number.isFinite(value)) return false; // an empty or half-typed box is left alone
    if (f.integer) value = Math.round(value);
    const { min, max } = SETTING_LIMITS[f.key];
    if (value < min || value > max) return false;
    if (settings[f.key] === value) return false;
    settings[f.key] = value;
    saveSettings();
    return true;
  }

  // Show the current settings in the boxes
  private refresh() {
    for (const [key, input] of this.inputs) input.value = String(settings[key]);
    this.showTimerBox.checked = settings.showTimer;
    this.shrinkBox.checked = settings.shrinking;    this.collisionsBox.checked = settings.collisions;
    this.knockBox.checked = settings.knockOffCars;
    this.slowBox.checked = settings.slowMo;
    this.botRespawnBox.checked = settings.botRespawn;    this.shadowsBox.checked = settings.shadows;
    for (const [key, select] of this.selects) select.value = settings[key];
  }
}
