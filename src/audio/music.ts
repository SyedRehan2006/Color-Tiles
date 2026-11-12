import { audio } from "./audio";

// Generated synthwave loop (matches the neon look): a four-chord progression in A minor played by a
// pad, a bass line, an arpeggio and a drum kit. Nothing is recorded, a 25 ms timer schedules the notes
// a fraction of a second ahead on the audio clock, which keeps the beat steady even when a frame is slow.
//
// `intensity` (0..1) builds the track up: calm = pad and a slow bass, higher = drums, then a busier bass,
// then the arpeggio, and the tempo creeps up as well. The game raises it as the match gets tighter.

// Each bar: a root note (Hz) and the chord's semitone offsets from it. Am - F - C - G
const BARS: { root: number; tones: number[] }[] = [
  { root: 110.0, tones: [0, 3, 7] }, // A2 minor
  { root: 87.31, tones: [0, 4, 7] }, // F2 major
  { root: 130.81, tones: [0, 4, 7] }, // C3 major
  { root: 98.0, tones: [0, 4, 7] }, // G2 major
];
const STEPS_PER_BAR = 16; // sixteenth notes
const LOOKAHEAD = 0.15; // s of notes scheduled ahead of the audio clock

const semis = (root: number, n: number) => root * Math.pow(2, n / 12);

class Music {
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private bpm = 108;
  private target = 0.3; // intensity the music is moving toward
  private level = 0.3; // intensity right now (eased, so changes do not jolt)

  /** Start the music (waits for the first key press or click if the browser has not allowed sound yet) */
  play() {
    audio.whenReady(() => {
      if (this.timer) return;
      this.nextTime = audio.ctx!.currentTime + 0.1;
      this.timer = window.setInterval(() => this.pump(), 25);
    });
  }

  stop() {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  /** 0 = calm, 1 = frantic */
  setIntensity(v: number) {
    this.target = Math.min(1, Math.max(0, v));
  }

  private pump() {
    const ctx = audio.ctx;
    if (!ctx || ctx.state !== "running") return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.02; // fell behind (slow tab): skip ahead
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.level += (this.target - this.level) * 0.08;
      this.bpm += (106 + 22 * this.level - this.bpm) * 0.05;
      this.playStep(this.step, this.nextTime - ctx.currentTime, 60 / this.bpm / 4);
      this.nextTime += 60 / this.bpm / 4;
      this.step++;
    }
  }

  // Schedule everything that happens on one sixteenth note. `at` is seconds from now, `len` one step.
  private playStep(step: number, at: number, len: number) {
    const bar = BARS[Math.floor(step / STEPS_PER_BAR) % BARS.length];
    const s = step % STEPS_PER_BAR;
    const v = this.level;
    const bus = audio.musicBus;

    // Pad: one long chord per bar, soft and wide
    if (s === 0) {
      for (const n of bar.tones) {
        audio.tone({ f: semis(bar.root * 2, n), dur: len * 17, type: "sawtooth", vol: 0.05, at, attack: len * 3, lp: 900, bus });
      }
    }

    // Bass: calm = a note on the first beat of each half bar; busier = eighth notes with an octave pop
    const bassF = bar.root / 2;
    if (v < 0.3) {
      if (s % 8 === 0) audio.tone({ f: bassF, dur: len * 7, type: "sawtooth", vol: 0.16, at, lp: 420, bus });
    } else if (s % 2 === 0) {
      const up = s % 4 === 2 && v > 0.45;
      audio.tone({ f: up ? bassF * 2 : bassF, dur: len * 1.7, type: "sawtooth", vol: 0.17, at, lp: 520 + v * 500, lpTo: 200, bus });
    }

    // Drums
    if (v >= 0.15) {
      if (s % 4 === 0) audio.tone({ f: 150, to: 42, dur: 0.2, type: "sine", vol: 0.55, at, bus }); // kick
      if (s % 4 === 2 || (v > 0.6 && s % 2 === 1)) {
        audio.noise({ dur: 0.05, vol: 0.07, filter: "highpass", f: 7000, at, bus }); // hi-hat
      }
    }
    if (v >= 0.35 && (s === 4 || s === 12)) {
      audio.noise({ dur: 0.16, vol: 0.2, filter: "bandpass", f: 2200, q: 0.8, at, bus }); // snare
      audio.tone({ f: 220, to: 130, dur: 0.1, type: "triangle", vol: 0.12, at, bus });
    }

    // Arpeggio of the chord, an octave or two up
    if (v >= 0.5 && (s % 2 === 0 || v > 0.75)) {
      const order = [0, 1, 2, 1];
      const n = bar.tones[order[s % order.length]];
      audio.tone({ f: semis(bar.root * 4, n), dur: len * 1.6, type: "square", vol: 0.045, at, lp: 2400, lpTo: 900, bus });
    }
  }
}

export const music = new Music();
