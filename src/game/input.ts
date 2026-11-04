export interface DriveInput {
  throttle: number; // -1 (reverse) .. 1 (forward)
  steer: number; // -1 (left) .. 1 (right)
  handbrake: boolean; // held
  jumpPressed: boolean; // one-shot, true for exactly one read after a press
}

const GAME_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Space", "ShiftLeft", "ShiftRight",
]);

export class KeyboardInput {
  private held = new Set<string>();
  private jumpLatched = false;

  constructor() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    // Prevent stuck keys when the player leaves the window or tab
    window.addEventListener("blur", this.clear);
    document.addEventListener("visibilitychange", this.clear);
  }

  // Call once per physics tick. Reads the current state and consumes the jump press.
  read(): DriveInput {
    const h = this.held;
    const throttle =
      (h.has("KeyW") || h.has("ArrowUp") ? 1 : 0) -
      (h.has("KeyS") || h.has("ArrowDown") ? 1 : 0);
    const steer =
      (h.has("KeyD") || h.has("ArrowRight") ? 1 : 0) -
      (h.has("KeyA") || h.has("ArrowLeft") ? 1 : 0);
    const handbrake = h.has("Space");

    const jumpPressed = this.jumpLatched;
    this.jumpLatched = false;

    return { throttle, steer, handbrake, jumpPressed };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!GAME_KEYS.has(e.code)) return;
    // Typing in a settings box (or any form field) must not drive the car
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
      return;
    }
    e.preventDefault();
    if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat) {
      this.jumpLatched = true;
    }
    this.held.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    this.held.delete(e.code);
  };

  private clear = () => {
    this.held.clear();
    this.jumpLatched = false;
  };
}
