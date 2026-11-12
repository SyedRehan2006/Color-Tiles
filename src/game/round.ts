import { TILE_COLORS, type TileGrid } from "./tileGrid";
import type { RoundSettings } from "./settings";
import { Director } from "./director";

// All the timer lengths (roam, round times, vanish pause) live in settings.ts and can be changed
// live from the settings panel. They are read when each phase starts. What changes from round to
// round (target tiles, timer, shrinking) is decided by the Director (director.ts).

// running: the countdown to reach a target tile. result: the tiles just vanished.
// roam: the tiles are back and everyone drives around freely; no color is called yet.
export type RoundState = "running" | "result" | "roam";

// Runs the rounds: roam, pick a color, count down, vanish, repeat. Pure game logic (no Three.js,
// no Rapier, no DOM) so the server can run the same code later. Call update(dt) once per physics
// tick, so the timers follow game time and not the wall clock.
export class RoundController {
  round = 0; // 1 for the first round. During the roam before round N, this is still N - 1.
  state: RoundState = "roam";
  timeLeft = 0; // seconds left in the current state (the countdown, or the roam)
  targetColor = 0; // index into TILE_COLORS
  targets = 0; // tiles of the called color in the current round
  shrinkPlanned = false; // the outer ring falls in the roam after this round (decided when it started)
  readonly director: Director;
  // The match reports who is still in, so the director can size the platform
  aliveCount: () => number = () => 1;
  carCount: () => number = () => 1;
  onRoamStart: (() => void) | null = null; // the tiles are back and the roam period begins
  onRoundStart: (() => void) | null = null; // called after the tiles are laid out for a new round
  onRoundSettled: (() => void) | null = null; // a round is over (before the ring falls): count late fallers
  onTilesVanish: ((tiles: number[], ring: boolean) => void) | null = null; // these tiles just vanished: the timer hit 0 (ring false), or the outer ring fell for good (ring true)
  onTilesReturn: ((tiles: number[]) => void) | null = null; // a new round: these tiles came back

  private grid: TileGrid;
  private settings: RoundSettings;
  private pause = 0;

  constructor(grid: TileGrid, settings: RoundSettings) {
    this.grid = grid;
    this.settings = settings;
    this.director = new Director(settings);
  }

  // The match begins with a roam period too, so nobody is rushed into the first round
  start() {
    this.round = 0;
    this.shrinkPlanned = false;
    this.director.reset();
    this.startRoam();
  }

  // Seconds until the next roam starts, which is when cars that fell in a round drop back in
  // (0 during a roam: a car that falls then comes back after its own short delay)
  get secondsToNextRoam() {
    if (this.state === "running") return Math.max(this.timeLeft, 0) + this.settings.resultPause;
    if (this.state === "result") return Math.max(this.pause, 0);
    return 0;
  }

  get targetName() {
    return TILE_COLORS[this.targetColor].name;
  }

  update(dt: number) {
    if (this.state === "running") {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.state = "result";
        this.pause = this.settings.resultPause;
        const gone = this.grid.vanishNonTarget(this.targetColor);
        this.onTilesVanish?.(gone, false);
      }
    } else if (this.state === "result") {
      this.pause -= dt;
      if (this.pause <= 0) this.startRoam();
    } else {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) this.nextRound();
    }
  }

  // The vanished tiles come back and everyone gets roamTime seconds to drive around
  private startRoam() {
    // First the round is settled: cars that are already past the point of no return count as falls
    // of this round, and the director learns how the round went.
    if (this.round > 0) this.onRoundSettled?.();
    // The shrink happens here, in the free roam after the round is settled, so it never decides who
    // wins or loses a round. A car on the ring just drops back in (no life lost, see main.ts).
    if (this.shrinkPlanned) {
      const falling = this.grid.removeOuterRing(); // compute first: an optional call would skip this
      this.onTilesVanish?.(falling, true);
      this.director.onShrunk();
    }
    this.shrinkPlanned = false;
    const back = this.grid.restoreAll();
    this.onTilesReturn?.(back);
    this.state = "roam";
    this.timeLeft = this.settings.roamTime;
    this.onRoamStart?.();
  }

  private nextRound() {
    this.round++;
    // A different color from last round
    const previous = this.round === 1 ? -1 : this.targetColor;
    let color = Math.floor(Math.random() * this.grid.colorCount);
    while (color === previous) color = Math.floor(Math.random() * this.grid.colorCount);
    this.targetColor = color;

    const alive = this.aliveCount();
    const d = this.director;
    d.beginRound(alive);
    let present = 0;
    for (const p of this.grid.present) if (p) present++;
    this.targets = Math.min(d.targetCount(present), Math.max(1, present - 1));
    this.grid.layoutRound(this.targetColor, this.targets);
    this.timeLeft = d.roundTime(this.round);
    this.shrinkPlanned = d.planShrink(
      this.round,
      this.grid.ringsLeft,
      this.grid.ringsLeft + this.grid.ringsRemoved,
      alive,
      this.carCount(),
    );
    this.state = "running";
    this.onRoundStart?.();
  }
}
