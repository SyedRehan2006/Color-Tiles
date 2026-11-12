// Audio core. Every sound in the game is synthesized with the Web Audio API: no sound files to
// download or license. Unity comparison: this file is the AudioMixer (master / music / sfx groups)
// plus a tiny "play one-shot" helper. Sounds themselves are in sfx.ts, the engine hum in carAudio.ts,
// the music in music.ts.
//
// Browsers only allow sound after the player has pressed a key or clicked, so the AudioContext is
// created on the first input (see install()). Until then every play call quietly does nothing.

const STORAGE_KEY = "car-color-tiles-audio";

interface Prefs {
  music: number; // 0..1
  sfx: number; // 0..1
  muted: boolean;
}
const prefs: Prefs = { music: 0.6, sfx: 0.8, muted: false };

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const saved = JSON.parse(raw) as Partial<Prefs>;
    if (typeof saved.music === "number") prefs.music = Math.min(1, Math.max(0, saved.music));
    if (typeof saved.sfx === "number") prefs.sfx = Math.min(1, Math.max(0, saved.sfx));
    if (typeof saved.muted === "boolean") prefs.muted = saved.muted;
  }
} catch {
  // Storage blocked or damaged: defaults
}

function savePrefs() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Not remembered, that is fine
  }
}

export interface ToneOptions {
  f: number; // start frequency, Hz
  to?: number; // glide to this frequency over the duration
  dur: number; // seconds
  type?: OscillatorType;
  vol?: number; // peak gain, 0..1
  at?: number; // seconds from now
  attack?: number; // seconds to reach the peak
  pan?: number; // -1 (left) .. 1 (right)
  bus?: AudioNode; // default: the sfx bus
  lp?: number; // low-pass cutoff, Hz (softens harsh waves)
  lpTo?: number; // the cutoff glides to this
}

export interface NoiseOptions {
  dur: number;
  vol?: number;
  filter?: BiquadFilterType; // default bandpass
  f: number; // filter frequency, Hz
  to?: number; // filter glides to this
  q?: number;
  at?: number;
  attack?: number;
  pan?: number;
  bus?: AudioNode;
}

class AudioEngine {
  ctx: AudioContext | null = null;
  /** Everything a one-shot sound plays into */
  sfxBus!: GainNode;
  /** The music plays into this (through a filter that muffles it for slow-mo and pause) */
  musicBus!: GainNode;
  noiseBuffer!: AudioBuffer;

  private master!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private muffleTarget = 20000;
  private waiting: (() => void)[] = [];
  private lastPlayed = new Map<string, number>();
  private unlocked = false;

  get running() {
    return this.ctx !== null && this.ctx.state === "running";
  }
  get muted() {
    return prefs.muted;
  }
  get musicVolume() {
    return prefs.music;
  }
  get sfxVolume() {
    return prefs.sfx;
  }

  /** Listen for the first key press / click / touch, then start the audio. Call once per page. */
  install() {
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const go = () => {
      this.unlock();
      if (this.running) for (const e of events) window.removeEventListener(e, go, true);
    };
    for (const e of events) window.addEventListener(e, go, true);

    // Silence when the tab is hidden (Poki requires this), pick up again when it is shown
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx || !this.unlocked) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private unlock() {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return; // no Web Audio: the game stays silent
      this.ctx = new Ctor();
      this.build(this.ctx);
    }
    const ctx = this.ctx;
    void ctx.resume().then(() => {
      if (ctx.state !== "running" || this.unlocked) return;
      this.unlocked = true;
      const callbacks = this.waiting;
      this.waiting = [];
      for (const cb of callbacks) cb();
    });
  }

  /** Run this once audio is allowed (immediately if it already is) */
  whenReady(cb: () => void) {
    if (this.unlocked) cb();
    else this.waiting.push(cb);
  }

  private build(ctx: AudioContext) {
    // master -> compressor (so many sounds at once never clip) -> speakers
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = prefs.muted ? 0 : 1;
    this.master.connect(comp);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = prefs.sfx;
    this.sfxBus.connect(this.master);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass";
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.5;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = prefs.music * MUSIC_SCALE;
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.master);

    // Two seconds of white noise, reused by every whoosh, crash and hi-hat
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  // ---- volume ----

  setMuted(m: boolean) {
    prefs.muted = m;
    savePrefs();
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.03);
  }
  toggleMuted() {
    this.setMuted(!prefs.muted);
    return prefs.muted;
  }
  setMusicVolume(v: number) {
    prefs.music = Math.min(1, Math.max(0, v));
    savePrefs();
    if (this.ctx) this.musicBus.gain.setTargetAtTime(prefs.music * MUSIC_SCALE, this.ctx.currentTime, 0.03);
  }
  setSfxVolume(v: number) {
    prefs.sfx = Math.min(1, Math.max(0, v));
    savePrefs();
    if (this.ctx) this.sfxBus.gain.setTargetAtTime(prefs.sfx, this.ctx.currentTime, 0.03);
  }

  /** Low-pass the music: 20000 = clear, ~600 = muffled (slow-mo on a fall, pause menu) */
  setMuffle(hz: number) {
    if (!this.ctx || Math.abs(hz - this.muffleTarget) < this.muffleTarget * 0.02) return;
    this.muffleTarget = hz;
    this.musicFilter.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.08);
  }

  /** Briefly turn the music down, e.g. under a win jingle */
  duckMusic(seconds: number, to = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const g = this.musicBus.gain;
    const base = prefs.music * MUSIC_SCALE;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(base * to, t, 0.05);
    g.setTargetAtTime(base, t + seconds, 0.4);
  }

  /** True at most once per `ms` for this key: stops a sound from machine-gunning (e.g. bumps) */
  allow(key: string, ms: number) {
    if (!this.ctx) return false;
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -1e9) < ms) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  // ---- building blocks ----

  private out(node: AudioNode, bus: AudioNode | undefined, pan: number | undefined) {
    const ctx = this.ctx!;
    let tail: AudioNode = node;
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      tail.connect(p);
      tail = p;
    }
    tail.connect(bus ?? this.sfxBus);
  }

  /** One synthesized note: an oscillator with a quick fade in and a fade out */
  tone(o: ToneOptions) {
    if (!this.running) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.at ?? 0);
    const vol = o.vol ?? 0.3;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
    const g = ctx.createGain();
    const attack = Math.min(o.attack ?? 0.005, o.dur * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let tail: AudioNode = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.lpTo), t + o.dur);
      tail.connect(f);
      tail = f;
    }
    tail.connect(g);
    this.out(g, o.bus, o.pan);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  /** A burst of filtered noise: whoosh, crash, hi-hat, scrape */
  noise(o: NoiseOptions) {
    if (!this.running) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + (o.at ?? 0);
    const vol = o.vol ?? 0.3;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? "bandpass";
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
    const g = ctx.createGain();
    const attack = Math.min(o.attack ?? 0.005, o.dur * 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f);
    f.connect(g);
    this.out(g, o.bus, o.pan);
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
  }
}

// The music is mixed quieter than the effects at the same slider position
const MUSIC_SCALE = 0.5;

export const audio = new AudioEngine();
