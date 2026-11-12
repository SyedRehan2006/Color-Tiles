import { audio } from "./audio";

// The on-screen sound controls: a speaker button (also the M key) and the two volume sliders
// that live in the pause menu. Plain HTML like the rest of the UI.

const STYLE = `
.snd-btn { position: fixed; right: 16px; width: 40px; height: 40px; border-radius: 50%; border: 0; cursor: pointer; z-index: 5;
  background: rgba(20, 24, 40, 0.55); color: #fff; font-size: 18px; line-height: 40px; padding: 0; }
.snd-btn:hover { background: rgba(20, 24, 40, 0.8); }
.snd-sliders { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; font-size: 16px; font-weight: 700; letter-spacing: 1px; }
.snd-sliders label { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-width: 240px; }
.snd-sliders input { width: 140px; accent-color: #ffd23f; cursor: pointer; }
`;

function addStyle() {
  if (document.getElementById("snd-style")) return;
  const style = document.createElement("style");
  style.id = "snd-style";
  style.textContent = STYLE;
  document.head.appendChild(style);
}

/** The speaker button, `top` pixels from the top right corner. M toggles it too. */
export function mountMuteButton(top: number) {
  addStyle();
  const b = document.createElement("button");
  b.className = "snd-btn";
  b.style.top = `${top}px`;
  b.title = "Sound on/off (M)";
  const refresh = () => (b.textContent = audio.muted ? "🔇" : "🔊");
  refresh();
  b.addEventListener("click", () => {
    audio.toggleMuted();
    refresh();
    b.blur(); // so Space and Enter keep going to the game
  });
  window.addEventListener("keydown", (e) => {
    if (e.code !== "KeyM" || e.repeat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
    audio.toggleMuted();
    refresh();
  });
  document.body.appendChild(b);
}

/** Music and effects volume sliders (for the pause menu) */
export function createVolumeSliders() {
  addStyle();
  const box = document.createElement("div");
  box.className = "snd-sliders";
  const row = (label: string, value: number, onInput: (v: number) => void) => {
    const l = document.createElement("label");
    l.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.value = String(Math.round(value * 100));
    input.addEventListener("input", () => onInput(input.valueAsNumber / 100));
    l.appendChild(input);
    box.appendChild(l);
  };
  row("MUSIC", audio.musicVolume, (v) => audio.setMusicVolume(v));
  row("EFFECTS", audio.sfxVolume, (v) => audio.setSfxVolume(v));
  return box;
}

/** Every button press makes a click sound (menus, Play Again, settings panels), with no per-button code */
export function installButtonClicks(sfxClick: () => void) {
  document.addEventListener(
    "click",
    (e) => {
      if (e.target instanceof Element && e.target.closest("button")) sfxClick();
    },
    true,
  );
}
