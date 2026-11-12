import { roundTime, type RoundSettings } from "./settings";

// The difficulty director (docs/mechanics/04_rounds.md). Pure game logic, no Three.js or DOM, so the
// server can run it later. Two knobs:
//   space    - the platform shrinks with the number of cars alive (planShrink)
//   pressure - target tiles and timer follow a pressure level that rises every round (endRound)
// With `settings.director` off it falls back to the old fixed rules (same numbers every match).
export class Director {
  level = 0; // pressure level: 0 = relaxed, higher = fewer target tiles and a shorter timer
  roundsSinceShrink = 0; // rounds finished since the last ring fell
  finalRounds = 0; // rounds played with only the last ring left and 2+ cars alive (overtime clock)
  fell = 0; // cars that lost a life in the current round (counted by main.ts)
  lastFell = 0; // the same, for the round before
  aliveAtStart = 0; // cars alive when the current round began

  private s: RoundSettings;

  constructor(settings: RoundSettings) {
    this.s = settings;
  }

  reset() {
    this.level = 0;
    this.roundsSinceShrink = 0;
    this.finalRounds = 0;
    this.fell = 0;
    this.lastFell = 0;
    this.aliveAtStart = 0;
  }

  get enabled() {
    return this.s.director;
  }

  // Safety net: only the last ring is left and the cars still do not fall (see the doc, section 6)
  get overtime() {
    return this.enabled && this.finalRounds >= 5;
  }
  // Last resort: every car loses a life each round, so lives decide it
  get drain() {
    return this.enabled && this.finalRounds >= 10;
  }

  beginRound(alive: number) {
    this.aliveAtStart = alive;
    this.fell = 0;
  }

  // The round is settled (tiles vanished, late fallers counted). Updates the pressure level.
  endRound(ringsLeft: number, alive: number) {
    this.lastFell = this.fell;
    this.roundsSinceShrink++;
    if (ringsLeft <= 1 && alive >= 2) this.finalRounds++;
    if (!this.enabled) return;
    const expected = Math.max(1, Math.ceil(this.aliveAtStart * this.s.expectedFalls));
    const heavy = Math.max(2, Math.ceil(this.aliveAtStart * this.s.heavyFalls));
    this.level += 1; // always tightens: nothing can stall
    if (this.fell < expected) this.level += 1; // too easy: tighten more
    else if (this.fell >= heavy) this.level -= 1; // brutal round: no extra pressure
    this.level = Math.max(0, this.level);
  }

  // Tiles of the called color for the coming round
  targetCount(presentTiles: number) {
    if (!this.enabled) return this.s.targetTiles;
    const step = (this.s.startCoverage - this.s.minCoverage) / 8; // the floor is reached at level 8
    const coverage = Math.max(this.s.minCoverage, this.s.startCoverage - step * this.level);
    return Math.max(1, Math.round(presentTiles * coverage));
  }

  // Seconds to reach a target tile in the coming round
  roundTime(round: number) {
    if (!this.enabled) return roundTime(this.s, round);
    let floor = this.s.minRoundTime;
    if (this.overtime) floor = Math.min(floor, Math.max(1, 2 - 0.25 * (this.finalRounds - 5)));
    return Math.max(floor, this.s.firstRoundTime - this.s.levelTimeStep * this.level);
  }

  // How many rings the platform should have for this many cars (10x10 with 8 cars: 5, 5, 4, 4, 3, 3, 2, 2)
  desiredRings(alive: number, total: number, startRings: number) {
    if (startRings <= 2) return startRings;
    const a8 = (alive * 8) / Math.max(1, total); // as if there were 8 cars
    const table = Math.min(5, Math.max(2, Math.ceil(a8 / 2) + 1)); // 2..5
    return 2 + Math.round(((table - 2) / 3) * (startRings - 2));
  }

  // Decided when a round starts, so the "ring falls after this round" warning is always true.
  // `round` is the round that is starting; it finishes before the ring would fall.
  planShrink(round: number, ringsLeft: number, startRings: number, alive: number, total: number) {
    if (!this.s.shrinking || ringsLeft <= 1) return false;
    if (!this.enabled) return round % this.s.roundsPerRing === 0;
    if (this.s.shrinkEveryRound) return true; // experiment: every round, whatever the car count
    const since = this.roundsSinceShrink + 1; // including the round that is starting
    if (since >= this.s.forceShrinkAfter) return true; // the ratchet: the platform cannot freeze
    if (since < 2) return false; // never two rounds in a row
    return ringsLeft > this.desiredRings(alive, total, startRings);
  }

  onShrunk() {
    this.roundsSinceShrink = 0;
  }
}
