---
mechanic: Audio (sound effects, engine, music)
status: Implemented 2026-11-12, type-checks and builds, NOT yet listened to or tuned by ear
last_updated: 2026-11-12
engine: Web - Web Audio API (no sound files)
---

> Unity comparison: `audio.ts` is the AudioMixer (master / music / sfx), `sfx.ts` is a bank of one-shot clips, `carAudio.ts` is an AudioSource per car with pitch tied to speed, `music.ts` is a small step sequencer.

# 1. Decisions

- **Everything is synthesized at runtime** (oscillators and noise). No audio files: nothing to download, no licenses, nothing to load. Costs a little CPU. If it ever sounds too thin, real samples can replace single sounds in `sfx.ts` without touching the game code.
- **Sound starts on the first key press or click** (browser rule). Until then every play call does nothing. The AudioContext is also suspended while the tab is hidden (Poki asks for this).
- **Mixing:** music and effects each have a volume (pause menu sliders), a speaker button and the **M** key mute everything. Saved in localStorage (`car-color-tiles-audio`). A compressor on the master stops clipping when many sounds overlap.

# 2. What plays when

| Moment | Sound | Where |
|---|---|---|
| Any button | short click | `installButtonClicks` (all buttons, no per-button code) |
| Round starts | color call: two notes, **a different pitch per tile color** (helps colorblind players) | `onRoundStart` |
| Last 3 s of a round | countdown ticks, higher each second | `animate` |
| Last 3 s of the roam | soft tick | `animate` |
| Timer hits 0 | whoosh + low thud (tiles vanish) | `onTilesVanish(ring=false)` |
| Tiles come back | rising sweep + chime | `onTilesReturn` |
| Outer ring falls | long rumble + crackle | `onTilesVanish(ring=true)` |
| Car drives | engine hum, pitch follows speed (yours + 4 nearest other cars, panned and quieter with distance) | `carAudio.ts` |
| Drift / hard brake | tire squeal | `carAudio.ts` |
| Jump / landing | rising blip / thud (landing after a respawn drop too) | tick loop in `main.ts` |
| Car bump | thud (only with "collisions" on) | `resolveBumps` callback |
| Car loses footing | scrape + falling whistle (other cars quieter, panned) | where `startTumble` is called |
| You lose a life | descending wah-wah | `loseLife` |
| Another car is out | small pop | tick loop |
| You drop in | rising whoosh | `dropAt` |
| Match start | 3-note jingle | `restartMatch` |
| Sudden death, heart drain | 3-beep alarm | with the banners |
| Fewer safe tiles, overtime | two-note blip | with the banners |
| You win / you are out | fanfare / sad descending line (music ducks under it) | `showEnd` |
| Slow-mo on a fall | music muffles, engines drop in pitch | `animate` |
| Pause | music muffled, engines silent | `animate` |

# 3. Music

A synthwave loop in A minor (Am - F - C - G), scheduled 150 ms ahead on the audio clock so the beat stays steady. `music.setIntensity(0..1)` builds it up: calm = pad and slow bass, then kick and hats, then snare and eighth-note bass, then arpeggio; the tempo goes from about 106 to 128 BPM. The game sets intensity from the director's pressure level and how many cars are left (`updateMusicIntensity`), and drops it low under the end screen.

# 4. Open / ideas

- Tune every volume and pitch by ear (all numbers are at the top of each sound in `sfx.ts`, `carAudio.ts`, `music.ts`). The engine levels in particular are guesses.
- **Poki SDK:** when it is added, mute with `audio.setMuted(true)` during ads and restore after (and `commercialBreak` should pause the game).
- Per-theme music (candy vs cyberpunk), a "sudden death" music layer, and a looping wind sound at high speed are not built.
- Bots' jumps and drifts are silent (only the car you watch has them).
