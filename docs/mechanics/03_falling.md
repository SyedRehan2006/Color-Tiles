---
mechanic: Falling (edge rule, lean, tumble, car knock-offs, fall effects)
status: Implemented, partly playtested (see section 9)
last_updated: 2026-11-10
engine: Web - Three.js + TypeScript + Vite + Rapier
---

> Reading guide for a Unity developer: the "floor rule" is a hand-written ground check instead of a floor Collider. A "collision group" is a Physics layer plus the collision matrix. "Unlocking rotation" is clearing the Freeze Rotation X/Z checkboxes on a Rigidbody. A "fixed tick" is `FixedUpdate` (1/60 s); a "render frame" is `Update`.

# 1. What this is

What happens when a car goes over a tile edge (the platform edge, or a hole left by vanished tiles). Before this work the car dropped straight down, level, and sank through the tile. Now it leans while hanging, tips off the edge as a real rigid body, can knock other cars, and the camera and effects react.

It sits on top of the driving doc (`01_driving.md`) and the tile grid (`src/game/tileGrid.ts`). Fall *scoring* (lives, respawn, game over) is unchanged and lives in `main.ts` (`loseLife`).

# 2. The three states of a car

| State | When | What happens | Code |
|---|---|---|---|
| **Driving** | enough of the car is over tiles | Normal driving. Rotation is locked to yaw only. | `CarController` |
| **Hanging (leaning)** | driving, but some wheels are off the tiles | Still drives, but the model leans over the edge (visual only). Optionally slides toward the void (`edgePull`). | `Racer.updateLean`, `CarController.resolveGround` |
| **Tumbling** | support falls below `edgeSupport` while at floor height | A free Rapier rigid body. No steering. Slides and tips off the edge, scrapes on real tile colliders, then falls. Final: no recovery. | `Racer.startTumble`, `TumbleFloor` |

The fall ends as before: below y = -12 the car counts as fallen and loses a life (`FALL_DEPTH` in `main.ts`).

# 3. The edge rule ("Tough" values)

- The floor is still a rule, not colliders (a Rapier tile floor stuttered at seams; see `01_driving.md`).
- `TileGrid.footprintSample` samples the car's footprint on a grid about 0.5 m apart, rotated by yaw, and returns the **coverage** (fraction over solid tiles) and the **direction of the void** (unit vector from the car's center toward the unsupported samples). Works for any car size and notices a hole between the corners of a big car.
- A car stands while `coverage >= settings.edgeSupport`. **Default 0.7** (range 0.3 to 0.95). It started at 0.5, which let players hang with almost half the car over the void for a long time.
- **Edge pull** (`settings.edgePull`, default **25** m/s², range 0 to 60): while standing with coverage below 1, the car's velocity is pushed toward the void by `edgePull * (1 - coverage)` per second. This makes hanging costly: you must steer or throttle back. 0 turns it off.
- The legacy `CAR_PARAMS.minSupport` (0.5) in `carController.ts` is no longer read; `settings.edgeSupport` replaced it.

# 4. Wheel lean (visual)

- Four wheel points (85% of the half width, 70% of the half length). Each frame (`Racer.updateLean`, called from `main.ts` before `render`) a wheel with no solid tile under it counts as out.
- Right wheels out roll the car right, front wheels out dip the nose, and so on. Smoothed with `LEAN_SPEED`.
- **Pivot on the tile edge, not the car center.** `Racer` finds the edge along the lean direction (last solid point between center and wheels) and rotates the model around that point at wheel-bottom height, so the supported side rests on the tile and does not sink into it (first version rotated around the center and clipped the tile top).
- Only while resting on the floor; no lean in the air, while tumbling or after a fall. The physics body stays level during the lean.

# 5. The tumble

**Trigger.** `CarController.resolveGround` returns the footprint sample when the car is not supported, is at floor height (`y <= rideHeight + 0.05`) and has not dropped below -0.5. `main.ts` then calls `Racer.startTumble(sample)`.

**On start.**
- The visual lean pose (and its pivot offset) is copied into the body, so nothing pops.
- `setEnabledRotations(true, true, true)`: pitch and roll unlocked.
- Angular kick: a tip toward the void (`TIP_SPIN` 2.5 rad/s, scaled by how much is out) and a yaw swing toward the heavy corner (`YAW_SPIN` 4 rad/s; a corner out front-right turns the nose right, back-right turns it left, a straight-out overhang adds no swing).
- Collision group switches to "tumbling", friction 0.4, restitution 0.15.

**While tumbling** (`Racer.tumbleTick`, before every physics step).
- `CarController.update` and `resolveGround` are skipped for the car (they would overwrite its spin and snap it back to the floor), and `bump.ts` skips it.
- While some of it is still over a tile, a push toward the void (`TUMBLE_PUSH` 8 m/s²) keeps it from balancing on the edge.
- Safety net: if it ends up calm (speed under 1 m/s, low, and coverage at least `edgeSupport`) for `SETTLE_TIME` 0.5 s, `endTumble` levels it, locks rotation again and it drives. A tumbling car must never stay stuck on the platform.

**Tile colliders** (`src/game/tumbleFloor.ts`).
- Real static boxes (tile size x 1 m thick, top at y = 0, friction 0.5, restitution 0.1) created only around tumbling cars: the tiles within `ceil(1.6 * halfLength / tileSize) + 1` of each car. Synced every tick before `world.step()`: tiles that vanished or are out of range are removed, so a car falls through a vanished tile.
- They are in a collision group that only tumbling cars react to, so driving cars never touch them (no seam stutter). `tumbleFloor.clear()` runs on every match restart.

**Respawn.** `Racer.respawnAt` re-locks rotation, resets the lean and the collision groups and drops the car upright.

# 6. Cars hitting each other

Collision groups (membership << 16 | filter), defined in `racer.ts`:

| Group | Who | Collides with |
|---|---|---|
| 1 | walls (future) | (driving cars) |
| 2 | driving cars | walls; tumbling cars only if knock-offs are on |
| 4 | tumbling cars | tiles (8), other tumbling cars (4); driving cars (2) only if knock-offs are on |
| 8 | tile colliders | tumbling cars (4) |

- **Tumbling cars hit each other** (always on): two cars falling off the same edge bounce and tangle with real physics.
- **Falling cars knock driving cars** (`settings.knockOffCars`, default **on**, checkbox "Falling cars knock others" under Collisions): a tumbling car can hit and shove a car still driving. Toggled live (`Racer.setKnock`). Off = it passes through them. A shoved driving car keeps the shove only briefly, because grip fades sideways speed in about 0.2 s, so a glancing hit may not push a car off an edge. A "knock strength" setting could be added if it feels weak.
- **Normal car vs car** is still `src/game/bump.ts`, only when `settings.collisions` is on (default off). It was rewritten to oriented boxes (separating-axis test) that follow the car scale, 3 passes per tick, restitution 0.6, and it skips tumbling cars. Rapier does not handle driving car vs driving car.

# 7. Car scale

`settings.carScale` (0.5 to 4, default 1, live, panel field under Driving) scales the model, the Rapier collider, and the footprint and ride height the floor rule uses (`Racer.setScale`, `CarController.setScale`). The Rapier collider size does not affect the floor rule (the floor is a rule), only tumble contacts and knock-offs. `Racer.halfWidth / halfLength / carScale` are the one source of footprint size for the floor rule, bumping, lean and effects.

# 8. Feedback effects

**Camera** (`src/render/chaseCamera.ts`, `CAMERA_PARAMS`). While the followed car tumbles: heading follow fades out (the camera no longer swings with the spinning car), pulls back 30% (`tumbleZoom`), looks straight at the car, is a little floatier. One impact shake on start (`tumbleKick` 0.55, `tumbleShake` 0.9 m) with a short field-of-view punch (`tumbleFovPunch` 7 degrees). Camera yaw is taken from where the nose points, so it stays right while the car is pitched or rolled.

**Slow-mo** (`main.ts`, checkbox "Slow-mo when a car falls", default on). Triggered when the followed car starts to tumble. The physics, bots and round timer run slower; camera and screen effects stay in real time. Blended by horizontal speed at the moment of the fall (full effect at `SLOWMO_FULL_SPEED` 24 m/s and above):

| | Slide off (about 0 m/s) | Fast fall (24 m/s or more) |
|---|---|---|
| Game speed | 70% | 30% |
| Duration (real time) | 0.4 s | 1.0 s |
| Camera shake | 0.12 | 0.55 |

Eased in and out. A strong slow-mo on a slow fall looked like a crawl, hence the blend. Note: the slow-mo slows the round timer too (about +0.7 s on the clock for everyone per fall).

**Edge sparks and dust** (`src/render/edgeFx.ts`, params `edgefx` in `fxParams.ts`, visual panel section "Edge sparks and dust (all themes)"). Dust and a few sparks come from the wheels nearest the edge the car is tipping over (and from the wheels of a tumbling car still sliding on the tile), plus a small burst when the car goes over. Dust color is the car color mixed toward purple (`dustColorMix`, same recipe as the tire smoke), sparks are the car color. Only for cars within 45 m of the camera target. All tunable and saved with the visual config. Decoration only.

# 9. Status and known limits

**Playtested by the user:** the tile clipping is gone, the lean looks good, slow-mo looks great (after the speed blend), the effects were tuned in the visual panel and look good. **Not verified:** tumble directions and strength on every approach angle, knock-offs shoving a driving car off an edge, behavior with scale 3 to 4, vanishing tiles under a car at round end, 8-car pile-ups.

**Known limits.**
- The drawn car lags the physics position by up to one tick (0.67 m at top speed), so a car may seem to fall slightly early at full speed. A fix (check the fall against the drawn position) was not needed so far.
- No swept check in `bump.ts`; very fast thin crossings could tunnel.
- Tumble is final: no recovery except the settle rule above. The "save window" idea (a short grace before the tumble starts) was skipped because the Tough settings already give enough time.
- Multiplayer: Rapier is deterministic, but the server must be the only authority for tumbling, knock-offs and the edge rule. Not done yet.
- Bots do not avoid edges (see below).

**Deferred or rejected.**
- Bots avoiding edges: deferred, written up in `docs/design-decisions.md` ("Ideas for later").
- Pre-fall wobble cue: rejected by the user.
- "WIPEOUT!" / "WHOOPS!" HUD flash: tried and removed (did not look good).

# 10. Tuning cheat sheet

| What | Where | Default |
|---|---|---|
| Share of car that must be on tiles | settings panel, Driving: `edgeSupport` | 0.7 |
| Slide toward the void | settings panel, Driving: `edgePull` | 25 m/s² |
| Car scale | settings panel, Driving: `carScale` | 1 |
| Falling cars knock others | settings panel, Collisions: `knockOffCars` | on |
| Car collisions (normal bumping) | settings panel, Collisions: `collisions` | off |
| Slow-mo on/off | settings panel: `slowMo` | on |
| Slow-mo and fall shake numbers | `main.ts` constants (`SLOWMO_*`, `KICK_*`) | see section 8 |
| Lean strength and speed | `racer.ts`: `LEAN_MAX` 0.45, `LEAN_SPEED` 10 | |
| Tumble feel | `racer.ts`: `TIP_SPIN`, `YAW_SPIN`, `TUMBLE_PUSH`, `TUMBLE_FRICTION`, `TUMBLE_BOUNCE`, `SETTLE_TIME` | 2.5, 4, 8, 0.4, 0.15, 0.5 |
| Tumble camera | `chaseCamera.ts` `CAMERA_PARAMS.tumble*` | see section 8 |
| Sparks and dust | visual panel, "Edge sparks and dust" | `EDGEFX_DEFAULTS` |

# 11. Files

- `src/game/tileGrid.ts`: `footprintSample`, `footprintCoverage`, `isFootprintSolid`
- `src/game/carController.ts`: `resolveGround` (floor rule, edge pull, tumble trigger), `setScale`
- `src/game/racer.ts`: lean, tumble state, collision groups, scale, `edgePoint`, `wheelPoint`
- `src/game/tumbleFloor.ts`: tile colliders for tumbling cars
- `src/game/bump.ts`: car vs car (oriented boxes)
- `src/game/settings.ts`, `src/ui/settingsPanel.ts`: the settings above
- `src/render/chaseCamera.ts`: tumble camera and impact shake
- `src/render/edgeFx.ts`, `src/render/fxParams.ts`, `src/ui/visualPanel.ts`: sparks and dust
- `src/main.ts`: tick order (`tumbleTick`, `tumbleFloor.sync`, `world.step`, `resolveGround`, `startTumble`), slow-mo, camera hook
