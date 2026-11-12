// Pause menu and the pause button (plain HTML over the canvas, like the HUD).
// The main menu is its own page (index.html + src/menu.ts).
import { createVolumeSliders } from "../audio/audioUi";

const STYLE = `
.mn { position: fixed; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  z-index: 10; color: #fff; text-align: center; font-family: system-ui, "Segoe UI", sans-serif; user-select: none; }
.mn.show { display: flex; }
.mn-pause { background: rgba(10, 12, 24, 0.6); }
.mn h1 { margin: 0; font-size: 72px; font-weight: 900; letter-spacing: 4px; line-height: 1; text-shadow: 0 4px 0 rgba(0,0,0,0.4); }
.mn h2 { margin: 0 0 6px; font-size: 52px; font-weight: 900; letter-spacing: 4px; text-shadow: 0 4px 0 rgba(0,0,0,0.4); }
.mn p { margin: 0 0 10px; font-size: 18px; opacity: 0.85; }
.mn button { min-width: 240px; padding: 14px 36px; font-size: 22px; font-weight: 800; border: 0; border-radius: 14px; cursor: pointer;
  background: rgba(255,255,255,0.15); color: #fff; box-shadow: 0 4px 0 rgba(0,0,0,0.35); }
.mn button:hover { background: rgba(255,255,255,0.28); }
.mn button.primary { background: #ffd23f; color: #222; }
.mn button.primary:hover { background: #ffe066; }
.mn small { opacity: 0.65; font-size: 14px; line-height: 1.6; }
.mn-pausebtn { position: fixed; top: 108px; right: 16px; width: 40px; height: 40px; border-radius: 50%; border: 0; cursor: pointer; z-index: 5;
  background: rgba(20, 24, 40, 0.55); color: #fff; font-size: 16px; font-weight: 900; letter-spacing: 1px; }
.mn-pausebtn:hover { background: rgba(20, 24, 40, 0.8); }
@media (max-width: 600px) { .mn h1 { font-size: 44px; } .mn h2 { font-size: 36px; } }
`;

export interface MenuCallbacks {
  onPause: () => void; // the small pause button during play
  onResume: () => void; // pause menu: Resume
  onRestart: () => void; // pause menu: Restart match
  onQuitToMenu: () => void; // pause menu: Main menu (leaves for the menu page)
}

export class Menus {
  private pause: HTMLDivElement;
  private pauseButton: HTMLButtonElement;

  constructor(cb: MenuCallbacks) {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    this.pause = document.createElement("div");
    this.pause.className = "mn mn-pause";
    this.pause.innerHTML = `<h2>PAUSED</h2>`;
    const resume = this.button("Resume", "primary", cb.onResume);
    const restart = this.button("Restart", "", cb.onRestart);
    const quit = this.button("Main menu", "", cb.onQuitToMenu);
    this.pause.append(resume, restart, quit, createVolumeSliders());

    // Small pause button for mouse and touch players
    this.pauseButton = document.createElement("button");
    this.pauseButton.className = "mn-pausebtn";
    this.pauseButton.textContent = "II";
    this.pauseButton.title = "Pause (Esc)";
    this.pauseButton.addEventListener("click", cb.onPause);

    document.body.append(this.pause, this.pauseButton);
  }

  private button(label: string, cls: string, onClick: () => void) {
    const b = document.createElement("button");
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener("click", onClick);
    return b;
  }

  showPause() {
    this.pause.classList.add("show");
    this.pauseButton.style.display = "none";
  }

  // Back to the game: hide both menus, show the pause button
  hideAll() {
    this.pause.classList.remove("show");
    this.pauseButton.style.display = "";
  }
}
