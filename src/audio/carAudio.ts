import { audio } from "./audio";
import type { Racer } from "../game/racer";

// Engine hum for the car you watch, a quieter hum for the nearest other cars (louder when close, panned
// left or right by where they are), and tire squeal while drifting or braking hard.
// The sounds are always running and only their pitch and volume change each frame, so there are no clicks.

const MAX_SPEED = 40; // m/s, the car's top speed (CAR_PARAMS.maxForward)
const OTHER_VOICES = 4; // other cars that can be heard at once (the nearest ones)
const NEAR = 10; // m: other cars are at full volume closer than this, then fade with distance
const PAN_RANGE = 22; // m of sideways offset that pans fully to one side

// One engine: two detuned saws and a square an octave down, through a low-pass that opens with the revs
class EngineVoice {
  private oscs: OscillatorNode[] = [];
  private mults: number[] = []; // each oscillator's pitch relative to the engine pitch
  private filter: BiquadFilterNode;
  private gain: GainNode;
  private panner: StereoPannerNode;
  private rpm = 0; // smoothed 0..1

  constructor(ctx: AudioContext, bus: AudioNode) {
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 2;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.panner = ctx.createStereoPanner();
    const defs: [OscillatorType, number, number][] = [
      ["sawtooth", 1, 0.5],
      ["sawtooth", 1.012, 0.4],
      ["square", 0.5, 0.35],
    ];
    for (const [type, mult, level] of defs) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 60 * mult;
      o.detune.value = 0;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g);
      g.connect(this.filter);
      o.start();
      this.oscs.push(o);
      this.mults.push(mult);
    }
    this.filter.connect(this.gain);
    this.gain.connect(this.panner);
    this.panner.connect(bus);
  }
  // speed 0..1 of top speed, throttle -1..1, volume 0..1 (already including distance), pitch scale (slow-mo)
  set(ctx: AudioContext, dt: number, speed: number, throttle: number, grounded: boolean, volume: number, pan: number, pitch: number) {
    const t = ctx.currentTime;
    // The revs follow the speed with a little lag, and rise when the pedal is down
    const target = Math.min(1, speed + Math.max(0, throttle) * 0.12);
    this.rpm += (target - this.rpm) * (1 - Math.exp(-6 * dt));
    const base = (52 + this.rpm * 150 + (grounded ? 0 : 25)) * pitch;
    for (let i = 0; i < this.oscs.length; i++) this.oscs[i].frequency.setTargetAtTime(base * this.mults[i], t, 0.04);
    this.filter.frequency.setTargetAtTime(260 + this.rpm * 1500 + Math.max(0, throttle) * 400, t, 0.05);
    const load = 0.55 + 0.45 * Math.max(0, throttle);
    this.gain.gain.setTargetAtTime(volume * 0.22 * load, t, 0.06);
    this.panner.pan.setTargetAtTime(pan, t, 0.06);
  }

  silence(ctx: AudioContext) {
    this.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }
}

// Tire squeal: looping noise through a band-pass, only audible while sliding
class SkidVoice {
  private gain: GainNode;
  private filter: BiquadFilterNode;

  constructor(ctx: AudioContext, bus: AudioNode, buffer: AudioBuffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "bandpass";
    this.filter.Q.value = 3;
    this.filter.frequency.value = 1500;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    src.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(bus);
    src.start();
  }

  set(ctx: AudioContext, amount: number) {
    const t = ctx.currentTime;
    this.gain.gain.setTargetAtTime(amount * 0.2, t, 0.05);
    this.filter.frequency.setTargetAtTime(1300 + amount * 900, t, 0.08);
  }
}

export class CarAudio {
  private ctx: AudioContext | null = null;
  private mine: EngineVoice | null = null;
  private others: EngineVoice[] = [];
  private skid: SkidVoice | null = null;
  // Where the listener is (the car you watch), for sounds that come from other cars
  private lx = 0;
  private lz = 0;
  private lyaw = 0;
  private near: { r: Racer; d2: number }[] = [];

  constructor() {
    audio.whenReady(() => {
      const ctx = audio.ctx!;
      this.ctx = ctx;
      this.mine = new EngineVoice(ctx, audio.sfxBus);
      for (let i = 0; i < OTHER_VOICES; i++) this.others.push(new EngineVoice(ctx, audio.sfxBus));
      this.skid = new SkidVoice(ctx, audio.sfxBus, audio.noiseBuffer);
    });
  }

  /** Volume (0..1) and stereo pan (-1..1) for a sound made by `r`, as heard from the car you watch */
  spatial(r: Racer): { vol: number; pan: number } {
    const dx = r.x - this.lx;
    const dz = r.z - this.lz;
    const dist = Math.hypot(dx, dz);
    // Right of the listener's nose: (cos yaw, -sin yaw)
    const side = dx * Math.cos(this.lyaw) - dz * Math.sin(this.lyaw);
    return {
      vol: Math.min(1, NEAR / Math.max(dist, NEAR)),
      pan: Math.max(-1, Math.min(1, side / PAN_RANGE)),
    };
  }

  /**
   * Once per frame. `followed` is the car whose view you have; `throttle` is its pedal (for a bot we
   * do not know, so pass a middling value). `pitch` is below 1 during slow-mo.
   */
  update(dt: number, racers: Racer[], followed: Racer, throttle: number, pitch: number) {
    const ctx = this.ctx;
    if (!ctx || !this.mine || !audio.running) return;

    // The listener sits on the car you watch; if it is gone (fell, orbit view) it sits over the platform
    const gone = followed.fallen || followed.y < -0.5;
    this.lx = gone ? 0 : followed.x;
    this.lz = gone ? 0 : followed.z;
    this.lyaw = gone ? 0 : followed.yaw;

    // Your own engine
    if (gone || followed.tumbling) {
      this.mine.silence(ctx);
    } else {
      const c = followed.controller;
      this.mine.set(ctx, dt, Math.abs(c.forwardSpeed) / MAX_SPEED, throttle, c.grounded, 1, 0, pitch);
    }

    // The nearest other cars
    this.near.length = 0;
    for (const r of racers) {
      if (r === followed || r.fallen || r.eliminated || r.tumbling) continue;
      const dx = r.x - this.lx;
      const dz = r.z - this.lz;
      this.near.push({ r, d2: dx * dx + dz * dz });
    }
    this.near.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < this.others.length; i++) {
      const voice = this.others[i];
      const n = this.near[i];
      if (!n) {
        voice.silence(ctx);
        continue;
      }
      const s = this.spatial(n.r);
      const c = n.r.controller;
      // Other cars are quieter than yours, and their pedal is guessed from their acceleration state
      voice.set(ctx, dt, Math.abs(c.forwardSpeed) / MAX_SPEED, 0.5, c.grounded, s.vol * 0.5, s.pan, pitch);
    }

    // Tire squeal from the car you watch
    if (this.skid) {
      const c = followed.controller;
      let amount = 0;
      if (!gone && !followed.tumbling && c.grounded) {
        amount = Math.min(1, Math.max(0, (c.slip - 2.5) / 7));
        if (c.hardBraking) amount = Math.max(amount, 0.5);
      }
      this.skid.set(ctx, amount);
    }
  }

  /** Menus and pauses: everything continuous goes quiet */
  silence() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.mine?.silence(ctx);
    for (const v of this.others) v.silence(ctx);
    this.skid?.set(ctx, 0);
  }
}
