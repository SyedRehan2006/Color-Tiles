import type { DriveInput } from "./input";
import { settings } from "./settings";

// On-screen controls for phones and tablets. They produce the same DriveInput as the keyboard, so the car
// and the bots need no changes. What shows is set in the settings panel:
//   touchControls: auto (touch devices only) / on (also on desktop, for testing) / off
//   touchSteer:    joystick (slide left/right) or arrows (two buttons)
//   touchPedals:   manual (GAS + BRAKE buttons) or auto (the car always accelerates, BRAKE slows/reverses)
// Jump and handbrake buttons are always there. Landscape is expected.
const STYLE = `
.ti-root { position: fixed; inset: 0; z-index: 5; pointer-events: none; user-select: none; -webkit-user-select: none; touch-action: none;
  font-family: system-ui, "Segoe UI", sans-serif; }
.ti-root * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.ti-btn, .ti-stick { position: absolute; pointer-events: auto; touch-action: none; display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; letter-spacing: 1px; background: rgba(20, 24, 40, 0.45); border: 2px solid rgba(255,255,255,0.55); }
.ti-btn { border-radius: 50%; }
.ti-btn.down, .ti-stick.down { background: rgba(255,255,255,0.45); }
.ti-stick { border-radius: 50%; }
.ti-knob { width: 56px; height: 56px; border-radius: 50%; background: rgba(255,255,255,0.7); pointer-events: none; }
`;

type Steer = "joystick" | "arrows";
type Pedals = "manual" | "auto";

const isCoarse = () => window.matchMedia("(pointer: coarse)").matches;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class TouchInput {
  private root: HTMLDivElement | null = null;
  private builtKey = "";

  // Current control state
  private steerValue = 0; // joystick: -1..1
  private left = false;
  private right = false;
  private gas = false;
  private brake = false;
  private handbrake = false;
  private jumpLatched = false;

  constructor() {
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);
    window.addEventListener("blur", () => this.releaseAll());
  }

  private visible() {
    const m = settings.touchControls;
    return m === "on" || (m === "auto" && isCoarse());
  }

  // Call once per physics tick. Rebuilds the layout when a touch setting changed.
  read(): DriveInput {
    const show = this.visible();
    const key = `${show}|${settings.touchSteer}|${settings.touchPedals}`;
    if (key !== this.builtKey) {
      this.builtKey = key;
      this.build(show, settings.touchSteer, settings.touchPedals);
    }
    if (!show) return { throttle: 0, steer: 0, handbrake: false, jumpPressed: false };

    const pedals: Pedals = settings.touchPedals;
    const throttle = pedals === "auto" ? (this.brake ? -1 : 1) : (this.gas ? 1 : 0) - (this.brake ? 1 : 0);
    const steer = settings.touchSteer === "arrows" ? (this.right ? 1 : 0) - (this.left ? 1 : 0) : this.steerValue;
    const jumpPressed = this.jumpLatched;
    this.jumpLatched = false;
    return { throttle, steer, handbrake: this.handbrake, jumpPressed };
  }

  private releaseAll() {
    this.steerValue = 0;
    this.left = this.right = this.gas = this.brake = this.handbrake = false;
    this.jumpLatched = false;
  }

  // A round button that reports down/up (multi-touch safe: each button tracks its own pointer)
  private button(
    label: string,
    css: string,
    onDown: () => void,
    onUp: () => void,
  ) {
    const b = document.createElement("div");
    b.className = "ti-btn";
    b.style.cssText = css;
    b.textContent = label;
    let id = -1;
    b.addEventListener("pointerdown", (e) => {
      if (id !== -1) return;
      id = e.pointerId;
      b.setPointerCapture(id);
      b.classList.add("down");
      onDown();
      e.preventDefault();
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      b.classList.remove("down");
      onUp();
    };
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("lostpointercapture", up);
    return b;
  }

  private joystick() {
    const size = 150;
    const stick = document.createElement("div");
    stick.className = "ti-stick";
    stick.style.cssText = `left:calc(24px + env(safe-area-inset-left));bottom:calc(24px + env(safe-area-inset-bottom));width:${size}px;height:${size}px`;
    const knob = document.createElement("div");
    knob.className = "ti-knob";
    stick.appendChild(knob);
    let id = -1;
    const move = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const range = size / 2 - 10;
      const v = clamp(dx / range, -1, 1);
      this.steerValue = Math.abs(v) < 0.1 ? 0 : v; // small dead zone
      knob.style.transform = `translateX(${v * range}px)`;
    };
    stick.addEventListener("pointerdown", (e) => {
      if (id !== -1) return;
      id = e.pointerId;
      stick.setPointerCapture(id);
      stick.classList.add("down");
      move(e);
      e.preventDefault();
    });
    stick.addEventListener("pointermove", (e) => {
      if (e.pointerId === id) move(e);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      this.steerValue = 0;
      knob.style.transform = "";
      stick.classList.remove("down");
    };
    stick.addEventListener("pointerup", up);
    stick.addEventListener("pointercancel", up);
    stick.addEventListener("lostpointercapture", up);
    return stick;
  }

  private build(show: boolean, steer: Steer, pedals: Pedals) {
    this.releaseAll();
    this.root?.remove();
    this.root = null;
    if (!show) return;

    const root = document.createElement("div");
    root.className = "ti-root";
    root.addEventListener("contextmenu", (e) => e.preventDefault());
    const L = "left:calc(24px + env(safe-area-inset-left));";
    const R = "right:calc(24px + env(safe-area-inset-right));";
    const B = (px: number) => `bottom:calc(${px}px + env(safe-area-inset-bottom));`;

    // Steering (left side)
    if (steer === "joystick") {
      root.appendChild(this.joystick());
    } else {
      const size = "width:92px;height:92px;font-size:30px;";
      root.appendChild(this.button("◀", `${L}${B(24)}${size}`, () => (this.left = true), () => (this.left = false)));
      root.appendChild(
        this.button("▶", `left:calc(130px + env(safe-area-inset-left));${B(24)}${size}`, () => (this.right = true), () => (this.right = false)),
      );
    }

    // Pedals (right side): the big bottom row, then jump and handbrake above
    const pedal = "width:96px;height:96px;font-size:14px;";
    if (pedals === "manual") {
      root.appendChild(this.button("GAS", `${R}${B(24)}${pedal}`, () => (this.gas = true), () => (this.gas = false)));
      root.appendChild(
        this.button("BRAKE", `right:calc(136px + env(safe-area-inset-right));${B(24)}${pedal}`, () => (this.brake = true), () => (this.brake = false)),
      );
    } else {
      root.appendChild(this.button("BRAKE", `${R}${B(24)}${pedal}`, () => (this.brake = true), () => (this.brake = false)));
    }
    const small = "width:80px;height:80px;font-size:13px;";
    root.appendChild(this.button("JUMP", `${R}${B(140)}${small}`, () => (this.jumpLatched = true), () => {}));
    root.appendChild(
      this.button("DRIFT", `right:calc(116px + env(safe-area-inset-right));${B(140)}${small}`, () => (this.handbrake = true), () => (this.handbrake = false)),
    );

    document.body.appendChild(root);
    this.root = root;
  }
}
