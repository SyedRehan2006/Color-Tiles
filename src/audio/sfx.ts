import { audio } from "./audio";

// Every one-shot sound effect. Each is a few oscillators and noise bursts (see audio.ts); numbers are
// frequencies in Hz, durations in seconds. They are all tuning values: change them to taste.
// `vol` and `pan` are for sounds that come from another car (quieter and off to one side).

// One note per tile color, so the color call is also a sound (helps colorblind players).
// A pentatonic scale: any two of them sound fine together.
const COLOR_NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

export const sfx = {
  // ---- menus ----
  click() {
    audio.tone({ f: 700, to: 900, dur: 0.06, type: "triangle", vol: 0.22 });
  },

  // ---- rounds ----

  /** A new round: the called color rings out as two notes (a color-specific pitch, then its fifth) */
  announce(colorIndex: number) {
    const f = COLOR_NOTES[colorIndex % COLOR_NOTES.length];
    audio.tone({ f, dur: 0.28, type: "sine", vol: 0.4, attack: 0.008 });
    audio.tone({ f: f * 2, dur: 0.2, type: "triangle", vol: 0.12 });
    audio.tone({ f: f * 1.5, dur: 0.4, type: "sine", vol: 0.4, at: 0.14, attack: 0.008 });
    audio.tone({ f: f * 3, dur: 0.3, type: "triangle", vol: 0.1, at: 0.14 });
  },

  /** The round countdown: 3, 2, 1. Higher and sharper as it runs out. */
  countdown(secondsLeft: number) {
    const f = secondsLeft <= 1 ? 1175 : secondsLeft === 2 ? 988 : 784;
    audio.tone({ f, dur: 0.11, type: "square", vol: 0.16, lp: 3500 });
    if (secondsLeft <= 1) audio.tone({ f: f * 2, dur: 0.11, type: "sine", vol: 0.12 });
  },

  /** The roam countdown (next round in 3, 2, 1): a softer, lower tick */
  roamTick() {
    audio.tone({ f: 523, dur: 0.07, type: "sine", vol: 0.14 });
  },

  /** The timer hit zero and every tile that is not the called color vanishes */
  tilesVanish() {
    audio.noise({ dur: 0.7, vol: 0.5, filter: "bandpass", f: 3200, to: 260, q: 0.9, attack: 0.01 });
    audio.tone({ f: 130, to: 38, dur: 0.5, type: "sine", vol: 0.55 });
    audio.noise({ dur: 0.35, vol: 0.25, filter: "highpass", f: 4000, q: 0.5, at: 0.05 });
  },

  /** The tiles come back for the roam: a soft rising sweep with a small chime */
  tilesReturn() {
    audio.noise({ dur: 0.55, vol: 0.16, filter: "bandpass", f: 300, to: 3000, q: 1.2, attack: 0.15 });
    audio.tone({ f: 392, dur: 0.25, type: "triangle", vol: 0.14, at: 0.05 });
    audio.tone({ f: 587, dur: 0.35, type: "triangle", vol: 0.14, at: 0.16 });
  },

  /** The outer ring falls away for good: a long low rumble with crackle */
  ringFall() {
    audio.noise({ dur: 1.8, vol: 0.7, filter: "lowpass", f: 500, to: 70, q: 0.7, attack: 0.05 });
    audio.tone({ f: 70, to: 26, dur: 1.8, type: "sine", vol: 0.7, attack: 0.05 });
    for (let i = 0; i < 6; i++) {
      audio.noise({ dur: 0.12, vol: 0.18, filter: "bandpass", f: 1500 - i * 150, q: 2, at: 0.1 + i * 0.22 });
    }
  },

  // ---- cars ----

  jump() {
    audio.tone({ f: 240, to: 640, dur: 0.18, type: "sine", vol: 0.28 });
    audio.noise({ dur: 0.14, vol: 0.09, filter: "bandpass", f: 2200, to: 5200, q: 1 });
  },

  /** Landing after a jump. strength 0..1 (how long the car was in the air). */
  land(strength: number) {
    const s = Math.min(1, Math.max(0.25, strength));
    audio.noise({ dur: 0.13, vol: 0.35 * s, filter: "lowpass", f: 700, to: 140 });
    audio.tone({ f: 100, to: 42, dur: 0.14, type: "sine", vol: 0.4 * s });
  },

  /** Two cars hit. speed = closing speed in m/s. */
  bump(speed: number, vol = 1, pan = 0) {
    if (!audio.allow("bump", 70)) return;
    const s = Math.min(1, speed / 14) * vol;
    audio.noise({ dur: 0.1, vol: 0.4 * s, filter: "bandpass", f: 1000, to: 400, q: 1.2, pan });
    audio.tone({ f: 170, to: 55, dur: 0.12, type: "square", vol: 0.22 * s, lp: 900, pan });
  },

  /** A car loses its footing and goes off the edge: scrape, then a falling whistle */
  tumble(strength: number, vol = 1, pan = 0) {
    audio.noise({ dur: 0.35, vol: 0.28 * vol, filter: "bandpass", f: 900, to: 300, q: 1.4, pan });
    audio.tone({ f: 260 + strength * 700, to: 70, dur: 1.2, type: "sine", vol: 0.26 * vol, at: 0.05, pan });
    audio.noise({ dur: 1.0, vol: 0.1 * vol, filter: "bandpass", f: 1400, to: 200, q: 3, at: 0.1, pan });
  },

  /** A car dropping in from the sky (your own car only) */
  respawn() {
    audio.tone({ f: 180, to: 700, dur: 0.4, type: "sine", vol: 0.2 });
    audio.noise({ dur: 0.4, vol: 0.12, filter: "bandpass", f: 500, to: 2500, q: 1.2 });
  },

  // ---- match ----

  /** You lost a life */
  lifeLost() {
    audio.tone({ f: 233, to: 117, dur: 0.5, type: "sawtooth", vol: 0.28, lp: 1500, lpTo: 300 });
    audio.tone({ f: 175, to: 87, dur: 0.5, type: "sawtooth", vol: 0.22, at: 0.17, lp: 1500, lpTo: 300 });
  },

  /** Another car ran out of lives: a short, quiet pop so you notice the count going down */
  carOut() {
    audio.tone({ f: 420, to: 110, dur: 0.22, type: "square", vol: 0.1, lp: 2000 });
  },

  /** A small banner (fewer safe tiles, overtime) */
  notice() {
    audio.tone({ f: 660, dur: 0.1, type: "sine", vol: 0.25 });
    audio.tone({ f: 880, dur: 0.14, type: "sine", vol: 0.25, at: 0.1 });
  },

  /** Sudden death, heart drain: an alarm */
  alarm() {
    for (let i = 0; i < 3; i++) {
      audio.tone({ f: 620, to: 880, dur: 0.2, type: "square", vol: 0.16, at: i * 0.24, lp: 2600 });
    }
  },

  /** A match begins */
  matchStart() {
    const notes = [440, 554.37, 659.25];
    notes.forEach((f, i) => audio.tone({ f, dur: 0.14, type: "triangle", vol: 0.26, at: i * 0.1 }));
    audio.tone({ f: 880, dur: 0.5, type: "triangle", vol: 0.28, at: 0.3 });
    audio.tone({ f: 1318.5, dur: 0.5, type: "sine", vol: 0.12, at: 0.3 });
  },

  /** You won: a rising arpeggio and a held chord */
  win() {
    audio.duckMusic(3.5);
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => audio.tone({ f, dur: 0.3, type: "triangle", vol: 0.32, at: i * 0.12 }));
    for (const f of [523.25, 659.25, 783.99, 1046.5]) {
      audio.tone({ f, dur: 1.6, type: "triangle", vol: 0.2, at: 0.5, attack: 0.02 });
    }
    audio.tone({ f: 2093, dur: 0.9, type: "sine", vol: 0.1, at: 0.5 });
  },

  /** You are out: a slow descending line */
  lose() {
    audio.duckMusic(3);
    const notes = [392, 349.23, 293.66, 196];
    notes.forEach((f, i) => audio.tone({ f, dur: i === 3 ? 0.9 : 0.3, type: "triangle", vol: 0.3, at: i * 0.22, lp: 2400 }));
  },
};
