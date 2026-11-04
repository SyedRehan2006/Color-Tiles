// On-screen display (plain HTML on top of the canvas). Unity comparison: a screen-space overlay Canvas.

const STYLE = `
.hud { position: fixed; inset: 0; pointer-events: none; font-family: system-ui, "Segoe UI", sans-serif; user-select: none; }
.hud-top { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 14px;
  padding: 8px 18px; border-radius: 16px; background: rgba(20, 24, 40, 0.55); color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,0.5); }
.hud-swatch { width: 44px; height: 44px; border-radius: 10px; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
.hud-label { font-size: 13px; letter-spacing: 2px; opacity: 0.8; }
.hud-color { font-size: 30px; font-weight: 800; letter-spacing: 1px; line-height: 1; }
.hud-time { min-width: 56px; text-align: center; font-size: 46px; font-weight: 800; font-variant-numeric: tabular-nums; }
.hud-time.urgent { color: #ff5a5a; }
.hud-round { position: absolute; top: 14px; right: 16px; color: #fff; font-size: 16px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.6); }
.hud-lives { position: absolute; top: 40px; right: 16px; color: #ff4d6d; font-size: 28px; letter-spacing: 3px; text-shadow: 0 2px 4px rgba(0,0,0,0.6); }
.hud-lives .lost { color: #fff; opacity: 0.3; }
.hud-alive { position: absolute; top: 76px; right: 16px; color: #fff; font-size: 16px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.6); }
.hud-over { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: rgba(10, 12, 24, 0.6); color: #fff; text-align: center; }
.hud-over.show { display: flex; }
.hud-over h1 { margin: 0; font-size: 72px; font-weight: 900; letter-spacing: 4px; text-shadow: 0 4px 0 rgba(0,0,0,0.4); }
.hud-over p { margin: 0; font-size: 22px; opacity: 0.9; }
.hud-over button { pointer-events: auto; margin-top: 8px; padding: 14px 36px; font-size: 22px; font-weight: 800; border: 0; border-radius: 14px;
  background: #ffd23f; color: #222; cursor: pointer; box-shadow: 0 4px 0 rgba(0,0,0,0.35); }
.hud-over button:hover { background: #ffe066; }
.hud-over small { opacity: 0.7; font-size: 14px; }
.hud-flash { position: absolute; top: 30%; left: 50%; transform: translate(-50%, -50%); font-size: 84px; font-weight: 900; letter-spacing: 4px;
  color: #fff; opacity: 0; text-shadow: 0 4px 0 rgba(0,0,0,0.35), 0 0 24px rgba(0,0,0,0.4); -webkit-text-stroke: 3px rgba(0,0,0,0.35); }
.hud-flash.go { animation: hud-pop 1.1s ease-out; }
@keyframes hud-pop { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  70% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1); } }
`;

function hex(color: number) {
  return "#" + color.toString(16).padStart(6, "0");
}

export class Hud {
  private swatch: HTMLDivElement;
  private label: HTMLDivElement;
  private colorName: HTMLDivElement;
  private time: HTMLDivElement;
  private roundLabel: HTMLDivElement;
  private flash: HTMLDivElement;
  private lives: HTMLDivElement;
  private alive: HTMLDivElement;
  private over: HTMLDivElement;
  private overText: HTMLParagraphElement;
  private overTitle: HTMLHeadingElement;
  private overButton: HTMLButtonElement;
  private shownSeconds = -1;

  constructor() {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    const root = document.createElement("div");
    root.className = "hud";
    root.innerHTML = `
      <div class="hud-top">
        <div class="hud-swatch"></div>
        <div><div class="hud-label">GET TO</div><div class="hud-color"></div></div>
        <div class="hud-time"></div>
      </div>
      <div class="hud-round"></div>
      <div class="hud-lives"></div>
      <div class="hud-alive"></div>
      <div class="hud-flash"></div>
      <div class="hud-over">
        <h1 class="hud-over-title">GAME OVER</h1>
        <p class="hud-over-text"></p>
        <button type="button">PLAY AGAIN</button>
        <small>or press Enter</small>
      </div>`;
    document.body.appendChild(root);

    this.swatch = root.querySelector(".hud-swatch")!;
    this.label = root.querySelector(".hud-label")!;
    this.colorName = root.querySelector(".hud-color")!;
    this.time = root.querySelector(".hud-time")!;
    this.roundLabel = root.querySelector(".hud-round")!;
    this.flash = root.querySelector(".hud-flash")!;
    this.lives = root.querySelector(".hud-lives")!;
    this.alive = root.querySelector(".hud-alive")!;
    this.over = root.querySelector(".hud-over")!;
    this.overText = root.querySelector(".hud-over-text")!;
    this.overTitle = root.querySelector(".hud-over-title")!;
    this.overButton = root.querySelector(".hud-over button")!;
  }

  // Hearts: filled for lives left, faded for lives lost
  setLives(lives: number, max: number) {
    let html = "";
    for (let i = 0; i < max; i++) html += i < lives ? "♥" : '<span class="lost">♥</span>';
    this.lives.innerHTML = html;
  }

  // Cars still in the match (hidden when you drive alone)
  setAlive(alive: number, total: number) {
    this.alive.textContent = total > 1 ? `CARS LEFT ${alive}/${total}` : "";
  }

  // A big message in the middle of the screen that fades out
  flashMessage(text: string, colorHex: number) {
    this.flash.textContent = text;
    this.flash.style.color = hex(colorHex);
    this.flash.classList.remove("go");
    void this.flash.offsetWidth; // restart the animation
    this.flash.classList.add("go");
  }

  showGameOver(text: string, onPlayAgain: () => void, title = "GAME OVER") {
    this.overTitle.textContent = title;
    this.overText.textContent = text;
    this.overButton.onclick = onPlayAgain;
    this.over.classList.add("show");
  }

  hideGameOver() {
    this.over.classList.remove("show");
  }

  // A new round: show the called color, and pop it up big in the middle of the screen
  showRound(round: number, name: string, colorHex: number, ringWarning = false) {
    const c = hex(colorHex);
    this.swatch.style.background = c;
    this.label.textContent = "GET TO";
    this.colorName.textContent = name.toUpperCase();
    this.colorName.style.color = c;
    this.roundLabel.textContent = ringWarning ? `ROUND ${round}  -  OUTER RING FALLS AFTER` : `ROUND ${round}`;
    this.shownSeconds = -1;

    this.flash.textContent = name.toUpperCase();
    this.flash.style.color = c;
    this.flash.classList.remove("go");
    void this.flash.offsetWidth; // restart the animation
    this.flash.classList.add("go");
  }

  // Show or hide the countdown number (the settings panel has a switch for it)
  setTimerVisible(visible: boolean) {
    this.time.style.display = visible ? "" : "none";
  }

  // The roam period between rounds: no color is called yet, just a countdown to the next round
  showRoam() {
    this.swatch.style.background = "#8a93a6";
    this.label.textContent = "NEXT ROUND IN";
    this.colorName.textContent = "GET READY";
    this.colorName.style.color = "#ffffff";
    this.shownSeconds = -1;
  }

  // Seconds left, shown as a whole number counting down (rounded up). Only touches the page when it changes.
  // `urgent` turns the number red at 3 seconds or less (used for the round countdown, not the roam).
  setTime(secondsLeft: number, urgent: boolean) {
    const whole = Math.ceil(secondsLeft);
    if (whole === this.shownSeconds) return;
    this.shownSeconds = whole;
    this.time.textContent = String(whole);
    this.time.classList.toggle("urgent", urgent && whole <= 3);
  }
}
