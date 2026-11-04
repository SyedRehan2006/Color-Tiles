import { TILE_COLORS, type TileGrid } from "./tileGrid";
import { roundTime, type RoundSettings } from "./settings";

// All the timer lengths (roam, round times, vanish pause) live in settings.ts and can be changed
// live from the settings panel. They are read when each phase starts.

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
  onRoamStart: (() => void) | null = null; // the tiles are back and the roam period begins
  onRoundStart: (() => void) | null = null; // called after the tiles are laid out for a new round
  onTilesVanish: ((tiles: number[]) => void) | null = null; // the timer hit 0: these tiles just vanished
  onTilesReturn: ((tiles: number[]) => void) | null = null; // a new round: these tiles came back

  private grid: TileGrid;
  private settings: RoundSettings;
  private pause = 0;

  constructor(grid: TileGrid, settings: RoundSettings) {
    this.grid = grid;
    this.settings = settings;
  }

  // The match begins with a roam period too, so nobody is rushed into the first round
  start() {
    this.round = 0;
    this.startRoam();
  }

  get targetName() {
    return TILE_COLORS[this.targetColor].name;
  }

  // True if the outer ring falls in the roam after this round (not during it)
  get shrinksAtEnd() {
    return (
      this.settings.shrinking &&
      this.round > 0 &&
      this.round % this.settings.roundsPerRing === 0 &&
      this.grid.ringsLeft > 1
    );
  }

  update(dt: number) {
    if (this.state === "running") {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.state = "result";
        this.pause = this.settings.resultPause;
        const gone = this.grid.vanishNonTarget(this.targetColor);
        this.onTilesVanish?.(gone);
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
    // The shrink happens here, in the free roam after the round is settled, so it never decides who
    // wins or loses a round. A car on the ring just drops back in (no life lost, see main.ts).
    // This checks the finished round's number, before the next round increases it.
    if (this.shrinksAtEnd) {
      const falling = this.grid.removeOuterRing(); // compute first: an optional call would skip this
      this.onTilesVanish?.(falling);
    }
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

    this.grid.layoutRound(this.targetColor, this.settings.targetTiles);
    this.timeLeft = roundTime(this.settings, this.round);
    this.state = "running";
    this.onRoundStart?.();
  }
}
