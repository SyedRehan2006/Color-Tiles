---
mechanic: Driving (drifty arcade car on a flat tile floor)
complexity: Critical
status: Designed
gdd_reference: docs/design-decisions.md (no formal GDD exists) - sections "Cars, driving and controls", "Camera", "Match and round rules", "Multiplayer, rooms and bots", "Devices", "Suggested, not yet confirmed"
last_updated: 2026-10-26
engine: Web - Three.js + TypeScript + Vite (Rapier proposed, NOT confirmed; see section 5)
---

> Reading guide for a Unity developer: a "fixed tick" here is `FixedUpdate`, the "render frame" is `Update`, "render interpolation" is what a Rigidbody's *Interpolate* checkbox does, and the "input struct" is a hand-made version of Unity's Input System actions.
>
> Source marks used in this doc: **(sourced)** = verified by the researcher from a primary/secondary source. **(UNCITED)** = general practice or the architect's estimate, a starting point to tune by feel, NOT a fact. **(placeholder)** = number I picked to make the doc concrete; expect to change it.

# 1. OVERVIEW

**One-line summary**: One drifty, arcade-style car per player, driven on a flat floor of tiles with WASD/arrows, Space = jump (no cooldown), Shift = handbrake. The driving has to let a player reach a target-colored tile and stop on it inside a 3-5 second window.

**Player experience goal**: Snappy and forgiving at low speed, slidey but controllable at high speed. You should be able to "turn fast and stop on a tile" (think Mario Kart's *inside drifting*, where the car tightens into the turn instead of sliding wide; sourced, Mario Kart Wii TAS wiki). The car must feel the same on a 60 Hz laptop, a 144 Hz monitor and a low-end phone. Decisions are made by the player's skill, not by their hardware (QA top risk 3).

**Scope boundaries (non-goals)**:
- This mechanic does NOT include: tile grid and vanish logic, color announcement, round timer, lives/respawn rules, fall *scoring* (it only exposes `grounded`, position, and a "fell below kill plane" signal), chase camera, bots' decision-making, networking/Colyseus code, art/animation/particles, audio, car-car collisions (none for now per design-decisions.md).
- Adjacent mechanics handled separately: core tile loop (step 3 of the plan), camera, bots (step 4), multiplayer sync (step 5), touch UI layout (only the input *contract* is defined here).

---

# 2. GDD ALIGNMENT

There is no GDD. The source of truth is `docs/design-decisions.md` (as of 2026-10-24). I separate CONFIRMED text from SUGGESTED-not-confirmed text; unconfirmed items are not treated as settled.

**GDD says (CONFIRMED)** (quoted):
> **Driving feel:** drifty, arcade-style. It will be tested and tuned.
> **Jump rule:** if a car lands over empty space, it falls. Jump has no cooldown.
> **Keys:** Space = jump, Shift = handbrake. These were swapped from the first plan because tapping Shift 5 times on Windows opens the Sticky Keys popup.
> **Collisions:** none for now. Cars pass through each other and look see-through (a "ghost" look) when they overlap.
> **Who decides survival:** the server, never the player's browser. This keeps results fair with lag and stops cheating.
> **Players per match:** 8.
> **Timer:** ... gets shorter each round, for example 5s, then 4s, then 3s. It is always shown on screen so a loss feels fair.
> **Devices:** The game targets desktop and mobile. Phones will need touch controls (a steering joystick, gas and brake, plus jump and handbrake buttons) and landscape orientation. Low-end phones set the limit on how detailed the art can be.
> **Rejected for now:** A cooldown on jump.

**GDD says (SUGGESTED, NOT CONFIRMED)** (quoted from the "Suggested, not yet confirmed" table):
> What counts as "on the tile": The car's center point
> Driving off the edge: Counts as a fall and costs a life
> Mobile driving: Auto-accelerate as a simpler touch option
> Server checks: Movement trusts the client at first, with basic speed checks on the server
> Tech stack (Platform section): not confirmed yet. The proposed default is Vite + TypeScript + Three.js + Rapier (physics)...

**This design**:
- [ ] Aligned with GDD
- [x] Extends GDD scope (noted below) - **status: ⚠️ extends scope**
- [ ] Contradicts GDD

**No 🔴 contradiction with a CONFIRMED decision was found.** The jump-rule options below were checked specifically against "Jump has no cooldown" (a grounded-only jump is a *rule*, not a cooldown, and does not contradict it; the Open Questions ask the user to confirm that reading).

**Extensions / clarifications beyond GDD** (flag for the user; none changes a confirmed decision):
1. Jump is allowed only when grounded (plus optional coyote time and jump buffer). The GDD says "no cooldown" but is silent on mid-air jumping. Without a grounded rule, holding Space gives infinite hover (QA risk 1). **Needs designer confirmation.**
2. A device-independent input struct, key remapping hooks, hold-vs-toggle handbrake, an optional steering assist. Not in the GDD; needed for touch, bots and accessibility.
3. Handbrake design details (speed threshold, no handbrake in air, caps on stopping distance). The GDD only says "Shift = handbrake".
4. Choice of simulation approach (section 5). The GDD stack line is "proposed default, not confirmed", so choosing a hand-written model over Rapier is a *decision for the user*, not a contradiction.
5. Reading "Driving off the edge counts as a fall" as: the fall is decided by the one "on the tile" rule (below), not by physical support. Note this suggestion is unconfirmed, though the confirmed Jump rule line already says "lands over empty space, it falls".

**Tensions to resolve (not contradictions, but they must be decided before multiplayer)**:
- ⚠️ **"Server decides survival" (CONFIRMED) vs "Movement trusts the client at first" (SUGGESTED).** If the server only receives client-reported positions, a cheater can report "I'm on the target tile" and the server has nothing to check except a speed tolerance (QA: client-trusted movement is a critical risk; speed tolerance must be loose enough for jumps and lag, which is the cheater window). The confirmed sentence is only truly honoured if the server can simulate the car from inputs. The recommended approach (C) makes that possible later at low cost; approach A does not (it needs a Rapier world per room on the server). Single-player prototype is unaffected.
- ⚠️ **"On the tile = car center point" (SUGGESTED)** is not settled. It creates seam ambiguity and the "half the car is over the void but I'm safe" look (QA). The design below uses it as a working assumption, with a deterministic tiebreak, and asks the user to confirm.

**Gaps the GDD does not cover that this design needs** (all listed in section 10): jump grounded rule, coyote time, airborne-at-vanish rule, seam tiebreak, handbrake turning behavior, last-two-fall-together (owned by the core loop, but it affects driving tests), car size vs tile size.

---

# 3. INDUSTRY REFERENCE RESEARCH

*(From the industry researcher. Honest caveat: web search returned little primary-source tuning data. Only items marked "sourced" are verified. The researcher's own suggested numbers are UNCITED starting points.)*

## Reference Games
### 1. Rocket League (2015)
- What they do: real rigid-body cars with forces, tuned for responsiveness over realism. Jump is restored when all four wheels touch a surface. Handbrake is a binary powerslide input.
- Notable values (sourced, RLGym game values, https://rlgym.org/Cheatsheets/game_values): physics runs at 120 ticks/s; max speed 2300 uu/s (23 m/s); max angular velocity 5.5 rad/s; gravity 650 uu/s^2 (about 6.5 m/s^2, about 2/3 of Earth); double-jump window 1.25 s. Not found: steering curve, jump impulse, handbrake friction.
- Why it works: lower gravity plus capped angular velocity gives floaty but predictable jumps (Kill Screen). Takeaway: copy the *idea* (about 0.6x gravity, cap angular velocity), not the numbers, because our car and arena are a different scale. Talk not read: Jared Cone, GDC 2018 "It IS Rocket Science".

### 2. Mario Kart Wii (2008)
- What they do: drift is a state you enter on landing from a hop, with the button held and a direction, only above a speed threshold. Wii added "inside drifting".
- Notable values (sourced, TAS wiki https://wiki.mkwtas.com/wiki/Manual_drift): drift starts only above 55% of max base speed; mini-turbo +20% max speed. Gap: no frame counts or steering angles found.
- Takeaways: a speed threshold on drift entry prevents low-speed handbrake spam; inside drifting suits "turn fast and stop on a tile"; mini-turbo is probably not needed here.

### 3. Browser/hobby arcade drift builds (CodePen, Babylon.js forum)
- What they do: lower lateral-friction cap normally, a separate lower cap while handbrake is held, reduced angular damping, capped angular velocity (NewKrok CodePen; search snippet only, constants not retrieved).
- Failure mode (Babylon forum): clamping lateral force to stop rollover also killed natural rotation; fix was re-adding rotation manually.
- Note: for a flat floor many arcade games skip wheels and use one body (or no body).

### 4. Mobile racing controls (generic evidence)
- Auto-acceleration is a standard mobile default (GRID Autosport forces it; Assetto Corsa Mobile offers it plus toggleable steering assist). Layout customization/mirroring is common.

Not researched, do not cite: Micro Machines, Crazy Taxi, Smash Karts, Drift Hunters, Wreckfest, io car games, Stumble Guys, Poki-specific controls.

## Common Patterns (industry-standard, players expect)
- Fixed-timestep physics with render interpolation (Rocket League 120 Hz, sourced).
- Responsiveness over realism, stylized but consistent (Rocket League, sourced).
- Lower gravity plus capped angular velocity for readable jumps (Rocket League, sourced).
- Drift as a distinct state with a speed threshold and its own grip value (Mario Kart sourced; CodePen snippet).
- Auto-accelerate as the touch default, with assists toggleable (GRID, Assetto Corsa Mobile, sourced).

## Divergent Patterns (deliberate choices)
- Drift entry: Mario Kart hop + button + speed threshold vs Rocket League hold-to-reduce-grip with no hop. For 3-5 s stop-on-tile rounds, hold-to-reduce-grip (no hop) is simpler, especially on touch. (Researcher's inference.)
- Drift shape: outward slide vs inward-tightening drift. Inward is likely better for precision.
- Simulation: rigid body plus forces (Rocket League) vs custom velocity model with a lateral-grip factor. The custom model gives the most direct control over feel and is easier to run on a server (researcher's inference, not sourced).
- Jump: Rocket League restores jumps on ground contact. We have no cooldown, so effectively "again once grounded". Mid-air double jumps are likely not wanted because landing over empty space = fall.

## "Invisible" Polish Features (ranges UNCITED, general practice)
- Coyote time after leaving an edge: about 80-150 ms (fairness vs the fall rule is a designer decision).
- Jump input buffer (press just before landing): about 100-150 ms.
- Steering speed-sensitivity: full lock at low speed, reduced at high speed.
- Counter-steer assist while drifting: auto-align toward velocity when steer is released.
- Angular velocity cap (Rocket League 5.5 rad/s, sourced) plus angular damping against spin-outs.
- Strong braking / high drag when throttle is released (stopping on a tile matters more than top speed).
- Snap velocity to zero below a small threshold so the car does not creep across tile borders.
- Touch: analog steering smoothing plus dead zone; large hit areas for jump/handbrake.
- Camera: smooth follow with positional lag but fast yaw follow; avoid camera roll on drift (camera is a separate mechanic, noted as a dependency).

## Notable Failure Modes from Shipped Games
- Babylon.js forum: clamping lateral force to prevent rollover also killed natural rotation.
- Rapier + Three.js forum thread: cars sinking through the floor (use a thick collider or trigger-based floor, plus CCD if fast). Only relevant if the chosen approach uses floor colliders.
- No documented shipped-game post-mortem failures for this mechanic were found (research gap).

---

# 4. APPROACHES CONSIDERED

*(From the technical architect. Caveat from the architect: its Rapier API knowledge is firm only to about 0.19; every Rapier call must be verified against the `.d.ts` typings in `node_modules/@dimforge/rapier3d-compat` (installed 0.21) before coding.)*

Context: the floor is flat, with no ramps, walls or car-car collisions. Physics only needs to keep the car on the floor, make it fall when its tile is gone, and make jumps arc. "On a tile" and "fell" are *rules*, not physics: with the center-point rule it is a grid lookup `floor((x - originX) / tileSize)`. Current `src/main.ts` has a 60 Hz accumulator with a 0.1 s clamp, but NO render interpolation.

| Approach | How it works | Pros | Cons | Engine fit | Used by |
|---|---|---|---|---|---|
| A. Dynamic rigid body + custom lateral friction | One Rapier dynamic body per car, rotations locked except yaw, no sleeping. Each tick split velocity into forward/lateral, kill lateral by impulse (high grip normally, low with handbrake), steer by angular velocity, jump by impulse. Cars in a no-self-collision group. | Gravity, jump, landing free. Fits the cube demo already built. Later car bumping is a group change. | Not cheaply re-simulatable on a server (needs a Rapier WASM world per room), so client-trusted in practice. Floor needs real colliders: seam snagging, tunneling (CCD), collider removal each vanish, sleeping bodies, WASM handle leaks. Mixing forces and velocity overrides gets jittery. | Good on desktop; 1-3 ms on low-end phone for 8 bodies + ~400 colliders (architect estimate, UNCITED, not measured). | Rocket League style (real rigid bodies) |
| B. Rapier raycast vehicle controller | 4 wheels with suspension via the built-in vehicle controller. | Suspension, roll, pitch for free. | Wrong feel target (you fight the wheel model to get arcade drift). Wheels over a gap lose contact unevenly so the car tips. Jump awkward. 10+ params. API reshuffled across versions. | Poor fit for arcade party feel. | Simulation-leaning demos |
| C. Hand-written kinematic model (pure TS, no rigid body) | State: x, z, y, vy, yaw, vx, vz, grounded. Each fixed tick: split velocity into forward/lateral, apply throttle/brake/drag, damp lateral with `exp(-grip*dt)` (lower grip on handbrake), turn yaw by steer (speed-scaled), integrate, apply gravity and jump through vy. Ground check = y at floor AND a solid tile at the car center. If the tile is gone, the car keeps falling to a kill plane. | Most tunable and predictable. No solver surprises, seam snagging, tunneling or sleeping. Deterministic and cheap (about 0.02 ms/tick for 8 cars, no allocations). **Same module runs in the browser, in bots, and in the Colyseus Node server with no WASM**, so the server can simulate the exact model from inputs (best story for "server decides survival"). Falling is exact (grid flag). | You write jump/gravity/air control yourself (about 150-250 lines including input smoothing and tests). No free collisions (later bumping is about a 30-line circle push, or move to A). Removes most of the reason to have Rapier in the stack unless other features need it. Cosmetic tilt/roll/smoke is your job. | Best for flat grid and low-end mobile; removing Rapier also removes a base64 WASM of a few MB from the bundle (check with `vite build`, matters for Poki size). | Common for arcade/io-style games (general knowledge) |
| D. Sphere-on-rails | Invisible dynamic ball plus a visual car. | Stable, rarely snags. | Must still write lateral friction; separate heading can disagree with physics; visual lag reads as input lag; same server limits as A. | No advantage over A or C on a flat floor. | - |

Comparison (architect): drift tunability A good / B poor / C best / D good. Server determinism A, B, D poor / C best. Mobile CPU for 8 cars: C lowest. Seam snagging: A, B possible / C none / D rare. Later car collisions: A, B, D a group change / C write a simple push. Effort: A medium / B high / C medium (about 200 lines) / D medium.

**Performance considerations**: C is about 0.02 ms/tick for 8 cars with no GC (architect estimate). A and D are about 0.3-1 ms on desktop and 1-3 ms on a low-end phone (UNCITED). Rendering (draw calls, shadows, pixel ratio) will dominate either way. `Math.min(devicePixelRatio, 2)` is probably too high for low-end mobile.

**Engine-specific gotchas** (architect, verify against installed 0.21 typings):
- Rapier (only if A/B/D): `translation()`/`linvel()`/`rotation()` allocate per call (reuse scratch objects); `setCanSleep(false)` on cars; forces persist until `resetForces()`; set `world.timestep = FIXED_DT` explicitly; WASM objects (World, EventQueue, CharacterController) need `.free()`; CCD is off by default; collision-group bit layout and `castRay` hit field name (`toi` vs `timeOfImpact`) depend on version; `rapier3d-compat` is NOT guaranteed identical across machines (do not plan lockstep/rollback on it).
- Any approach: input smoothing belongs inside the fixed step, not in `requestAnimationFrame`, or 144 Hz screens steer differently. Physics yaw goes on a pivot; cosmetic tilt on a child mesh. Top-level `await` in `main.ts` may fail on old mobile browsers (set `build.target` to `esnext` or wrap it; test on a real old phone). Poki iframe: prevent scroll on Space/arrows, audio needs a first gesture, pause on focus loss. Gamepad needs per-frame `navigator.getGamepads()` polling.

**Dependencies**:
- Required first: the fixed-step loop with accumulator (exists; add previous/current state for interpolation); a device-independent input layer; tile grid data with `isSolidAt(x, z)`.
- Will depend on this: fall detection + lives, chase camera, bots, multiplayer sync, effects (smoke/skid/tilt read lateralSpeed, handbrake, grounded).

---

# 5. RECOMMENDED APPROACH

> **USER DECISION (2026-10-26): Approach A, Rapier dynamic rigid body.** The synthesizer recommended Approach C below, but the user plans extra game modes (collisions, obstacles and similar), so Rapier stays. Open Question 1 is closed. Read the text below as follows: Approach C is NOT being built, the "Fallback and when to prefer it (A)" paragraph is the active plan, and its listed costs apply (thick tile colliders, zero car friction + `CoefficientCombineRule.Min`, CCD on, `setCanSleep(false)`, `removeCollider(c, true)` on vanish, grid check for "on the tile"). Server validation of movement is weaker with A, so the "server decides survival" vs "client-trusted movement" tension (Open Question 7) must be settled at the multiplayer step. Keep the car-control code (input to desired velocity/yaw) separate from Rapier calls where practical.

*(Synthesizer's decision. This is a recommendation; the user decides, see the open decision below.)*

**Chosen**: **Approach C, a hand-written kinematic car model in a pure TypeScript module with no Three.js or Rapier imports**, with the model fixed-stepped at 60 Hz and rendered with interpolation. **This is a recommendation on an OPEN DECISION for the user (Open Question 1), not a settled fact.** The fallback is Approach A.

**Why**:
1. **It fits the game's actual physics needs.** The floor is flat, there are no car-car collisions, and "on a tile / fell" is a grid rule (architect). Approach C makes both "stop on a tile" and "fall" exact, with none of the QA tile-collider hazards: seams, tunneling, sleeping bodies, colliders reappearing inside a car, per-round collider rebuilds, WASM leaks (QA top risk 4, avoided by construction rather than mitigated).
2. **It is the only option that makes "the server decides survival" real.** The same TS file can run in Colyseus on Node with no WASM, so the server can later simulate each car from its *inputs* and use the one "on the tile" rule. With A the server either trusts client positions (the hollow case in QA top risk 5) or runs Rapier per room. Bots also run for free server-side with C.
3. **It gives direct control of feel.** The research shows arcade drift is a velocity-space trick: a lateral-grip factor, a lower grip while handbrake is held, a yaw-rate cap, and a speed-sensitive steering curve (Mario Kart, Rocket League angular cap, CodePen). With C those are the *actual* parameters, with no solver in between. This is the closest thing in the stack to Unity's "set `rb.velocity` yourself", rather than `AddForce` and hoping.
4. **It is cheapest on low-end phones** (about 0.02 ms vs 1-3 ms, with the numbers being estimates) and avoids the Rapier WASM bundle weight, which matters for a Poki load-time budget.
5. **It addresses the frame-rate risks directly** (QA top risk 3): the model has only fixed-step state, and render interpolation is a lerp between the previous and current state.

**Tradeoffs accepted**:
- Rapier's reason to be in the stack shrinks. If the user chooses C, Rapier is only needed later for collisions, ramps, obstacles or moving props; it can stay installed but unused for now, or be removed (a Vite build check will show the bundle saving).
- We write jump/gravity/air control ourselves and test it (about 150-250 lines).
- No free collisions. Bumping later is a simple circle push (about 30 lines) or a move to A. The confirmed "no collisions for now" and the "Car collisions" future idea make this acceptable but it is a real forecloser if bumping becomes central.
- The user already has a working Rapier cube demo; that work is not wasted (the loop, accumulator and scene code carry over), but the physics part of it is not reused for the car.
- Cosmetic body roll, pitch and drift smoke are hand-made (a spring-damped tilt on the mesh).

**Fallback and when to prefer it (A)**: choose A if the user expects physical objects (ramps, walls, moving obstacles, pushing cars) soon, or wants the car to be a real Rapier body for learning reasons. Then take on these costs: tiles as colliders with thick floors (at least 0.5 m), zero car friction + `CoefficientCombineRule.Min` against seam snagging, CCD on, `setCanSleep(false)`, `removeCollider(c, true)` on vanish, a pre-validated grid check for "on the tile", and an accepted client-trusted multiplayer model.

**What this enables / forecloses for future mechanics**:
- Enables: server-simulated survival, server-side bots, cheap 8-car sim on phones, deterministic automated reachability sweeps (a test can run thousands of simulated drives in Node in seconds).
- Forecloses (cheaply reversible): free rigid-body collisions, physically correct landing on uneven ground.
- Unchanged: the tile grid and fall rule are shared by both approaches, so the core loop (step 3) does not depend on this choice.

**Synthesis decisions on the rest**:
- **Jump**: grounded-only. Coyote time 0.08 s and jump buffer 0.1 s are included as the "invisible polish" features (architect default plus researcher's UNCITED ranges) pending the user's answer. A mid-air Space press does nothing. Key-repeat is ignored (edge-triggered), and the edge is *latched until a physics step consumes it* (QA risk 3, tap lost at 144 fps / double-fired at 20 fps).
- **"On the tile"**: one function `tileAt(x, z)` using the car center point and a fixed tiebreak (for example `floor` with a half-open interval, so a center exactly on a seam belongs to the tile with the larger index). Used by client visuals, server and bots (QA must-have).
- **Airborne at vanish**: recommended working rule: a car that is airborne when tiles vanish is judged at its **first touchdown against the vanished layout**, which matches the confirmed text "if a car lands over empty space, it falls". To stop the exploit "jump just before vanish, land on the returned layout" (QA risk 1), the tile-return pause must be longer than the maximum airtime (default airtime is 0.67 s, so the pause should be at least about 1.0 s; the core-loop mechanic owns this number). Pending user confirmation (Open Question 3).
- **Handbrake**: hold-to-reduce-grip (Rocket League style, no hop), enabled only when grounded and above a speed threshold (Mario Kart 55%-of-max idea, sourced for MK, threshold value here is a placeholder), inside-drift feel through a yaw boost, with high forward drag so it cannot slide forever, and a rule that it cannot rotate the car in place (see Open Question 4).
- **Diagonal input**: steer and throttle are separate axes in the input struct, so there is no unnormalized-vector 1.41x problem for keyboards by construction (QA exploit).
- **Frame-rate independence**: all damping uses `exp(-k * dt)`, never `v *= 0.98`; input smoothing runs inside the fixed step.
- **Gravity/jump reconciliation**: the researcher suggests gravity 0.6-0.7x Earth (about 6-7 m/s^2), jump peak 1.5-2.5 m, air time 0.6-0.9 s (UNCITED). The architect suggests gravity 24 m/s^2 and jump velocity 8 m/s, giving about 1.3 m peak and 0.67 s airtime, tuned for a 2 m car. The two agree on *air time* (about 0.6-0.9 s) but differ on gravity because they assume different scales (Rocket League's low gravity is for a bigger, faster arena). I take the architect's numbers as the default because they are tied to a stated car and tile size, and flag them as **placeholders to tune by feel**. The real constraint is the **maximum horizontal jump distance**, which at 14 m/s and 0.67 s is roughly 9 m, about 4 tiles of 2-2.5 m. That is large enough to skip over a vanished region, so the DoD requires measuring it and the designer may want a lower air speed or shorter airtime (Open Question 3).

---

# 6. EDGE CASES & FAILURE MODES

*(From the QA analyst; web research was not done, so "known bugs in shipped games" are unverified leads, not citations. Severity: 🔴 Critical / 🟡 Standard / 🟢 Minor. Condensed; every 🔴 is kept. Items marked [C-only], [A/B/D-only] or [N/A with C] say how my chosen approach treats them.)*

## Input Edge Cases
- 🔴 Stuck keys on blur / focus loss / ad start (keyup never fires, car drives or handbrakes forever).
- 🔴 Keyboard ghosting: W+A+Space+Shift (the drift-jump combo) can drop Space on membrane boards; also arrows+Space and Shift+arrows on laptops. Silent failed jump, player blames the game.
- 🔴 Shift is not a clean key: L/R Shift differ in `event.code`; Shift changes `event.key` of other keys; Shift+Arrow may select text or scroll.
- 🔴 Browser-default keys: Space scrolls the page, arrows scroll the Poki iframe, Tab/Alt/Win steal focus. Keys do not reach the game until the iframe is clicked (dead car in round one).
- 🔴 Sticky Keys is only half-handled: holding Shift for about 8 s opens Filter Keys (a plausible long handbrake hold). Also Ctrl, Alt, Win+Space.
- 🟡 Opposite keys together (A+D, W+S) need a defined result. 🟡 Keyboard + gamepad + touch at once (last-device-wins flicker, stale analog axis from stick drift). 🟡 Controller disconnect mid-drift freezes axes. 🟡 Input during non-play states (countdown, announce, fall, spectate, pause, ads); a held jump firing on the first frame of the next round. 🟡 OS key repeat: jump on keydown without an `e.repeat` check = free bunny-hop. 🟡 AZERTY/Dvorak/Cyrillic layouts. 🟡 Touch: needs 3+ simultaneous pointers; a finger sliding off a button never fires pointerup; iOS edge-swipe, long-press menu, double-tap zoom; auto-accelerate has no brake path so the car cannot stop on a tile; joystick dead zone and re-centering; rotation mid-round resets the joystick origin. 🟢 A stray mouse click steals canvas focus.

## State Transition Edge Cases
- 🔴 Car airborne at the instant tiles vanish (check at vanish kills a jumping car; check only when grounded is an exploit).
- 🔴 Survival-check timing vs vanish: reading cars already tumbling, or server tick vs client tick differing, produces "I was on it" complaints (top complaint of the genre, unverified).
- 🔴 Respawn drop onto a random tile: tile about to vanish; two cars on one tile; ring shrink between choice and landing; landing upside down or with inherited velocity. Needs a pre-reserved safe tile.
- 🔴 Fall event not one-shot: a car below the kill plane re-triggers, double life loss. Life decrement must be idempotent per round.
- 🔴 Last two players fall together is undecided in the GDD (hard lock, no winner).
- 🟡 Pause / tab switch: wall-clock round timer vs clamped physics diverge. 🟡 Tile return while a car is mid-fall. 🟡 Ring shrink while a car stands on a removed ring tile. 🟡 Elimination mid-jump or mid-drift: reset input; camera must not follow a falling car forever. 🟡 Disconnect/rejoin double cars. 🟢 Resize/rotation breaks camera aspect and joystick.

## Physics & Spatial Edge Cases
- 🔴 Seams between tile colliders: ghost-collision snagging/hopping, float gaps, per-round collider rebuild hitches. **[N/A with C: the floor is a grid flag; applies if A/B/D is chosen.]**
- 🔴 Tunneling through thin floors at speed (Rapier CCD is off by default; respawn drop at terminal velocity is the worst case). **[N/A with C]**
- 🔴 Car launched off tile edges/seams by a vanished neighbor's lip. **[N/A with C; in C the model only moves vertically from jump/gravity.]**
- 🔴 Flipped or stuck upside-down car with no recovery; a wedged car that does not fall (zombie car). **[Mostly N/A with C: no roll/pitch in the model, cosmetic tilt only.]**
- 🔴 Edge-of-tile ambiguity: center exactly on a boundary (`<` vs `<=` plus float) differs client vs server; target vs non-target on a seam must be deterministic; visual vs center-point mismatch (a car about 2 units wide vs a 4-unit tile): a car 50% over the void that does not fall looks like a bug.
- 🟡 Kill plane threshold; NaN bodies poisoning the solver (add validity guards in any approach). 🟡 Physical support vs center-point rule must be one definition. 🟡 Sleeping car on a removed tile may not wake. [N/A with C] 🟡 Camera clipping during a fall. 🟡 8 overlapping ghost cars: transparency sorting / z-fighting flicker. 🟢 2x2-tile platform late round with 8 ghosts.

## Timing & Frame Rate Edge Cases
- 🔴 60 Hz fixed accumulator with NO render interpolation judders on 144 Hz (the most common "feels bad on my monitor" bug); the camera must follow the interpolated position.
- 🔴 Input sampled once per render frame vs per physics step: at 144 fps a tap between steps can be dropped; at 20 fps several steps see the same input, so a tap becomes a double jump (no cooldown means no safety net). Latch edge-triggered input until consumed.
- 🔴 Spiral of death on low-end phones: the 0.1 s clamp allows up to 6 steps/frame; if each step costs more than 1/60 s it never recovers; slow-motion sim vs a wall-clock round timer makes the player lose through no fault. Server time wins in multiplayer.
- 🔴 Speed vs the 3 s timer: top speed, acceleration and turn radius vs the maximum distance to the nearest target tile; a drifty car may make the nearest tile unreachable; bad respawn spawn luck and facing; 0.1 s human reaction time; does the timer include the announce delay? Needs a measured guarantee (automated sweep).
- 🟡 dt-dependent handling (`v *= 0.98` per step; smoothing using render dt). 🟡 Background-tab throttling. 🟡 rapier3d-compat not cross-platform deterministic. 🟡 Ad breaks cause dt spikes. 🟢 WASM GC / collider rebuild hitches.

## Multiplayer / Network Edge Cases (later)
- 🔴 Client-trusted movement: teleport onto the target tile at the last moment, no-fall altitude hack, 1.3x speed under the tolerance. "Server decides survival" is nominal if it uses client-reported positions.
- 🔴 Lag at the survival moment: the server evaluates stale positions; high-ping players lose systematically; packet loss at the evaluation tick kills a player.
- 🔴 Round-start sync: client countdown vs the server's vanish message; show server time and compensate clock offset.
- 🟡 Client/server desync rubber-banding at the moment that matters. 🟡 Remote cars interpolated about 100 ms in the past look on-tile while the server disagrees. 🟡 Disconnect mid-round; mobile backgrounding drops the websocket. 🟡 Bot fairness (human-like 0.1-0.3 s delay; bots must not know the next color early; bots must not teleport; server-simulated bots vs client-trusted humans run different physics, which approach C avoids).

## Player Exploit Vectors
- 🔴 Jump-spam hover: no cooldown plus impulse on Space even mid-air = infinite flight; coyote time or a loose ground ray allows re-jump; bunny hop on landing keeps the car almost permanently airborne.
- 🔴 Airborne at vanish: check-grounded-only lets a jump just before t=0 be "not on any tile, not falling"; check-on-landing lets a roughly 1 s arc cover the round pause and land on the new layout for free; handbrake slide + jump can clear 2-3 tiles.
- 🔴 Handbrake stop-on-a-dime vs infinite slide: low drag = indefinite slide; high brake = instant stop removes the overshoot skill gap; handbrake in the air could allow mid-air steering/stalling; handbrake spam at 0 speed = a free 180-degree U-turn.
- 🔴 Speed gain: unnormalized diagonal (W+A) 1.41x; drift retaining the speed vector while rotating then accelerating (slide boost); reverse faster than forward; landing a jump while turning adding speed.
- 🟡 Same-color adjacent tiles form large safe zones; late rounds all 8 ghost cars stack on one tile so "last two fall together" becomes the common case. 🟡 Edge-hang: park with 60% of the body over the void while the center is on a target tile (rule-safe, looks floating; players will do it deliberately). 🟡 Driving off the edge on purpose to reposition through a random-tile respawn costs a life (acceptable trade); AFK/quit abuse; close a room if only bots remain. 🟡 Out-of-bounds sequence breaks via corner clipping (collider approaches only).

## Accessibility Edge Cases
- 🟡 Space/Shift hardcoded: need rebinding and hold-vs-toggle handbrake; one-handed players cannot hold Shift+W+A+Space. 🟡 Color-blind symbols unconfirmed (red/green and blue/purple pairs among 6 colors at risk; 3-5 s leaves no decode time). 🟡 Photosensitivity: flashing vanish/countdown/shake needs a reduced-motion option. 🟡 A 3 s timer is hostile to motor-impaired players; no assist option. 🟡 Announcement is visual-only; add audio. 🟢 Tiny touch targets; left-hand layout swap.

## Platform-Specific Edge Cases
- 🔴 Poki iframe: keyboard focus, audio unlock after gesture, ad breaks, `gameplayStart/Stop`; WASM init (base64 about 1.5-2 MB) delays first input on slow connections. **[Avoided with C: no WASM needed.]**
- 🔴 Mobile background: iOS suspends the tab and websocket; low-end Android `webglcontextlost` with transparent ghost materials/shadows, so handle context restore.
- 🟡 iOS Safari needs `touch-action: none` and `user-select: none`; address bar collapse resizes the viewport. 🟡 Steam Deck/gamepads: standard mapping may not apply; analog triggers need `.value`; stick dead zone. 🟡 Laptop battery saver caps 30 fps. 🟡 Safari coarsened `performance.now()`. 🟢 Audio context suspended; engine tone stuck on blur.

## Top 5 Risks (architect must design against these)
1. **Unconstrained jump** (no cooldown, no stated grounded rule) plus undefined "airborne at vanish" and "landing over empty space" rules = exploit factory (hover, gap skipping, free survival).
2. **Survival-rule ambiguity** (center point vs visual/physical support) plus seam tiebreak plus client-vs-server timing = "I was on it!" and edge-parking exploit.
3. **Frame-rate/device variance**: no render interpolation, per-render-frame input sampling, the 0.1 s clamp turning slow phones into slow-motion cars against a wall-clock timer, stuck/ghosted keys. Hardware decides who wins.
4. **Tile-collider seams, thin floors, per-round collider rebuild** (snagging, tunneling, sleeping, collider leak). Fully avoided by approach C.
5. **Client-trusted movement** makes "server decides survival" hollow; lag unfairness; handbrake/drift balance (stop-on-a-dime, in-place U-turn, diagonal gain) and timer reachability decide whether the game is winnable.

**How the chosen approach (C) handles them**: risk 1 is handled by the grounded-only jump rule plus a measured jump-distance DoD (needs the user's decisions); risk 2 by one shared `tileAt()` function, with the unresolved center-point confirmation left as an open question; risk 3 by fixed-step latched input, interpolation and `exp()` damping (but the slow-phone vs wall-clock-timer problem is only *partly* addressed here, see below); risk 4 is removed by construction; risk 5 is only addressed for later (server can simulate inputs) and by tuning caps on handbrake and speed.

**Risks NOT fully addressed by this doc (deferred)**:
- Slow-phone simulation vs wall-clock round timer: needs an explicit policy in the core loop (for example, the timer is driven by simulated ticks single-player, or by the server clock in multiplayer). Owner: tile loop mechanic. In this doc: the step cap and "dropped time" rule are in the DoD.
- Lag at the survival moment and clock sync: deferred to the multiplayer step.
- Respawn safe tile, idempotent life loss, last-two-fall-together: owned by the core loop / lives mechanic. This doc exposes `grounded`, position and a kill-plane event only.

---

# 7. DEFINITION OF DONE

The mechanic is NOT done unless ALL of these are checked. Where a number is a **placeholder**, the designer may revise it, but the check must still exist with the revised number.

## Input layer (spec, built before the car)
The driving model never sees keyboard events. It consumes one struct per fixed tick:

```
DriveInput { throttle: -1..1, steer: -1..1, handbrake: boolean (held), jumpPressed: boolean (edge, latched) }
```
- Keyboard fills it from `event.code` (KeyW/ArrowUp, KeyS/ArrowDown, KeyA/ArrowLeft, KeyD/ArrowRight, Space, ShiftLeft/ShiftRight), never `event.key` (layout-safe: AZERTY, Dvorak). Unity analogy: this is your Input System action map, built by hand.
- `preventDefault()` on Space, arrows and Shift combinations; focus the canvas on first click and show a "click to start" if the iframe has no focus.
- Opposite keys cancel to 0 (A+D = 0, W+S = 0). Keyboard throttle/steer are digital (-1, 0, 1) but go through the same smoothing as analog.
- `jumpPressed` is set on keydown (ignoring `e.repeat`), kept until a fixed step consumes it, then cleared. It expires after the jump-buffer time.
- Held state is cleared on `blur`, `visibilitychange`, `pointercancel`, `lostpointercapture`, gamepad disconnect, ad start/end and any non-play game state.
- Gamepad (optional later) polled once per rendered frame with a dead zone (0.08 as a placeholder). Touch uses Pointer Events with `touch-action: none`, 3+ simultaneous pointers.
- Bots write the same struct. Last-device-wins with a small hold time to avoid flicker.

## Performance
- [ ] Car model update for 8 cars costs < 0.1 ms per fixed tick on a desktop (architect estimate is about 0.02 ms; budget is deliberately loose), and < 0.5 ms on the target low-end phone (placeholder budget).
- [ ] No per-frame or per-tick heap allocations in the model update and input path (verified with a browser allocation profile over 60 s).
- [ ] Frame-rate independent: same input script gives the same car trajectory within 5 cm after 5 s of driving at 30 / 60 / 144 / 240 fps render rates (QA must-have; tolerance is a placeholder).
- [ ] Render interpolation on the car AND the camera input (previous/current state lerped by `accumulator / FIXED_DT`); no visible judder at 144 Hz.
- [ ] Step cap defined (max 5 steps/frame, placeholder); on a slow device excess time is dropped (documented), not simulated in slow motion.

## Behavior
- [ ] Input to action latency: the first change in velocity or yaw appears in the first fixed tick after the input (< 17 ms of sim time at 60 Hz). Steer smoothing must not add more than 100 ms (placeholder) to the full-lock response.
- [ ] Time from standstill to top speed within 0.4-0.8 s (placeholder, tune by feel); a full-speed brake stop within 6-10 m with no handbrake.
- [ ] A car with `steer = 0` and no handbrake never gains lateral velocity; lateral speed decays to < 0.1 m/s within 1 s.
- [ ] Diagonal input never exceeds forward top speed; reverse speed is capped at the reverse maximum; drift speed is capped at the forward maximum (QA exploit).
- [ ] Handbrake: works only grounded and above the speed threshold; cannot bring the car to rest faster than a minimum stopping distance (placeholder 3 m from top speed); cannot sustain a slide longer than a maximum time (placeholder 1.5 s) without throttle; cannot rotate the car at near-zero speed (no in-place U-turn); has no effect in the air.
- [ ] Jump: grounded-only; Space tap = exactly one jump at any frame rate (tested at 20 and 240 fps); holding Space does not repeat; mid-air Space does nothing; with the buffer on, a press within 0.1 s before landing jumps on touchdown (this chain rate is limited by airtime, documented as intended).
- [ ] Maximum horizontal jump distance and airtime measured (with and without handbrake, at top speed) and reported in this doc's section 11. It must be less than the smallest gap that matters, as set by the designer (see Open Question 3). Placeholder reference: about 0.67 s airtime and about 9 m at top speed with the architect's defaults.
- [ ] Landing: a car whose center point is over a vanished tile at touchdown does not become grounded and keeps falling to the kill plane.
- [ ] A reachable target tile exists within the round timer for every spawn position, every facing, and every round number, verified by an automated sweep (a Node script running the pure model) using a worst-case (slowest-reaching) human-like input policy that includes a 0.3 s reaction delay (placeholder). Failing configurations are reported.

## Industry-standard features (non-negotiable from research)
- [ ] Fixed-step simulation with render interpolation (Rocket League 120 Hz sourced; our 60 Hz is the project's current choice).
- [ ] Speed-sensitive steering: yaw rate reduced as speed rises (default 2.6 rad/s normal, ramping from `clamp(speed/3, 0, 1)`; UNCITED).
- [ ] Drift is a distinct handling state: lateral grip drops while handbrake is held (default 10 -> 1.5 per second; UNCITED), entered only above a speed threshold (Mario Kart: 55% of max speed, sourced for MK; value here is a placeholder).
- [ ] Angular velocity cap (Rocket League 5.5 rad/s sourced; our caps are 2.6 / 3.6 rad/s UNCITED).
- [ ] Coyote time (default 0.08 s, range 0-0.15, UNCITED) and jump buffer (default 0.1 s, range 0-0.15, UNCITED), both toggled by tunables; both default ON unless the user rejects coyote time (Open Question 2).
- [ ] Strong braking when throttle is released and a velocity snap to zero below a small threshold, so cars do not creep across a tile border (UNCITED).
- [ ] Counter-steer assist while drifting is available behind a tunable (default on for touch, off for keyboard; UNCITED).
- [ ] Touch: analog steering with smoothing and a dead zone; large jump/handbrake hit areas (UNCITED).

## Edge cases handled (from QA analysis)
- [ ] Blur, `visibilitychange`, ad start/end, `pointercancel` and gamepad disconnect all clear held inputs (tested by switching tabs while holding W+Shift).
- [ ] W+A+Space+Shift works on a standard keyboard; the ghosting fallback is known; keymaps use `event.code`; AZERTY layout works; pressing Space and arrows never scrolls the Poki iframe.
- [ ] "On the tile" is ONE function used by client visuals, the (future) server and bots, with a deterministic seam tiebreak (a car with its center exactly on a tile edge always resolves to the same tile) and a defined airborne-at-vanish rule.
- [ ] No NaN or Infinity can enter the model state: validity guards reset or remove the car and log an error.
- [ ] The kill-plane event fires exactly once per fall per car (idempotent).
- [ ] Tab hidden 5 / 30 / 120 s mid-round then returned: correct state and no catch-up burst.
- [ ] Hold-Shift tests: a long handbrake hold (more than 8 s) is handled (handbrake auto-limits or Filter Keys behavior documented to the player in the Poki build notes).
- [ ] Touch: 3-finger simultaneous control works, a finger dragged off a button releases it, no page zoom or scroll, device rotation does not break it.
- [ ] Respawn drop of 8 cars simultaneously works without errors (the safe-tile rule itself is owned by the core loop).
- [ ] Both-last-cars-fall-at-once and "match always terminates" are owned by the core loop; the driving model must not block them.
- [ ] (Only if Approach A/B/D is chosen instead) A car at 1.5x max speed cannot tunnel through a tile or the respawn-drop floor; driving over every seam at full speed straight/circle/diagonal gives no hop, snag or speed change above threshold; tile colliders are freed on removal with no WASM leak after 100 rounds.
- [ ] (Multiplayer step, later) 200 ms ping + 5% loss does not systematically eliminate the player; teleport or over-speed reports are rejected; survival results match the player's screen within a defined tolerance.

## Test scene
- [ ] Test scene exists at `src/scenes/drivingTest.ts` (path is a placeholder, follow the project's folder layout once step 4 of setup is done), with a tile floor, an on-screen readout of speed, lateral speed, grounded, airtime, current tile.
- [ ] The test scene has a frame-rate limiter (30 / 60 / 144 / 240) and a CPU throttle switch, plus a recorded-input replay for the 5 s frame-rate-independence test.
- [ ] The test scene exercises every DoD criterion above, and tile vanishing can be triggered by a key press.

## Telemetry / Debug
- [ ] Debug visualizer: car center point, current tile highlight, velocity vector, lateral vs forward split, ground/air state, kill plane.
- [ ] Logs surface anomalies: NaN guard hit, dt clamp hit, step cap hit, double kill-plane trigger, jump pressed while airborne ignored (count only).
- [ ] Tuning panel (for example a small debug overlay or `lil-gui`) edits every tunable below at runtime.

---

# 8. TUNABLE PARAMETERS

Assumes a car about 2 m long, an arena about 20 x 20 m, tiles about 2-2.5 m. Confidence legend: **Low** = architect's playtest starting point, not measured, UNCITED; **Sourced** = from a verified source; **Placeholder** = picked by the synthesizer. Nothing here has been measured on this project; every value is to be tuned by feel in the test scene.

| Parameter | Default | Range | Confidence / notes |
|---|---|---|---|
| Fixed timestep | 1/60 s | fixed | Project choice (existing accumulator). Rocket League runs 120 Hz (sourced) |
| Max steps per frame | 5 | 3-8 | Low. Existing 0.1 s clamp allows 6. Excess time dropped |
| Max forward speed | 14 m/s | 8-22 | Low. Researcher's UNCITED range is 15-22; architect picks 14 so a 20 m arena crosses in about 1.5 s. Reachability sweep decides |
| Max reverse speed | 6 m/s | 3-10 | Low. Must stay below forward (QA exploit) |
| Acceleration | 28 m/s^2 | 15-50 | Low. About 0.5 s to top speed; researcher UNCITED target about 1 s, so the architect's value is snappier |
| Brake deceleration | 40 m/s^2 | 20-60 | Low |
| Rolling drag (throttle released) | 2.0 1/s | 0.5-4 | Low. Exponential. Controls how well the car stops on a tile |
| Stop-snap threshold | 0.3 m/s | 0.1-0.5 | Placeholder. Below this with no throttle, velocity is set to 0 |
| Lateral grip, normal | 10 1/s | 5-20 | Low. `exp(-grip*dt)`; researcher's UNCITED 0.9-0.95 is a per-tick factor in a different unit; the two reports may disagree on how "drifty" the normal state is. Tune this first |
| Lateral grip, handbrake | 1.5 1/s | 0.5-4 | Low. Researcher's UNCITED "0.3-0.6" is a per-tick grip factor in a different unit from the architect's 1/s decay rate; do not convert, just tune by feel |
| Handbrake forward drag | 1.0 1/s | 0-3 | Low. Needed so the slide cannot last forever (QA) |
| Handbrake min speed | 55% of max | 30-70% | MK threshold of >55% of max base speed is sourced; applying it here is a Placeholder |
| Handbrake max slide time | 1.5 s | 0.8-3 | Placeholder (QA: no infinite slide) |
| Max yaw rate, normal | 2.6 rad/s | 1.5-4 | Low. Researcher UNCITED 120-180 deg/s at low speed (2.1-3.1 rad/s) and 60-90 at top speed (1.0-1.6 rad/s) |
| Max yaw rate, handbrake | 3.6 rad/s | 2-5 | Low. Rocket League angular cap 5.5 rad/s (sourced) is the hard ceiling |
| Steer speed factor | `clamp(speed/3, 0, 1)` | 1-6 m/s divisor | Low. Stops in-place spinning (QA U-turn exploit); full lock above the divisor |
| Steer-speed reduction at top speed | 1.0x -> 0.5x (add; see note) | 0.3-1.0 | Placeholder. Researcher's UNCITED yaw drops by about half at top speed; the architect's table has no such reduction, so this is added here |
| Steer smoothing | 12 1/s | 6-25 | Low. Inside the fixed step; touch can skip |
| Gravity | 24 m/s^2 | 15-35 | Low. Researcher suggests 0.6-0.7x Earth (6-7 m/s^2) UNCITED, tied to Rocket League scale (6.5 m/s^2 sourced). Conflict resolved toward architect's value, but this is a feel tune |
| Jump velocity | 8 m/s | 5-11 | Low. About 1.3 m peak, 0.67 s air at g=24. Researcher UNCITED peak 1.5-2.5 m, air 0.6-0.9 s |
| Air steer (fraction of ground yaw) | 40% | 0-100% | Low |
| Air throttle | 0-20% | 0-20% | Low |
| Air lateral grip | 0.3 1/s | 0-2 | Low |
| Handbrake in air | disabled | on/off | Placeholder (QA) |
| Coyote time | 0.08 s | 0-0.15 | UNCITED range 80-150 ms; designer decision (Open Question 2) |
| Jump buffer | 0.1 s | 0-0.15 | UNCITED range 100-150 ms |
| Ground check | y <= floor + 0.05 AND solid tile at center | - | Architect. Uses the one `tileAt()` rule |
| Kill plane | y < -8 | -15 to -4 | Low. Must be below the lowest visible falling tile for the camera |
| Remote-car interpolation delay (multiplayer) | 100 ms | 50-200 | Low. Later step |
| Net send rate (if client-trusted) | 20 Hz | 10-30 | Low. Later step |
| Server speed tolerance (if client-trusted) | 1.5x max speed incl. jump | 1.2-2.0 | Low. Loose enough for lag; this is the cheat window (QA) |
| Input dead zone (stick) | 0.08 | 0.05-0.2 | Placeholder |
| Touch steering smoothing | 12 1/s | 6-25 | Placeholder |

---

# 9. DEPENDENCIES

**Systems this mechanic depends on (must exist first)**:
- Fixed-step loop with an accumulator: exists in `src/main.ts`. Needs extending with previous/current state for interpolation (Unity: this is the *Interpolate* option on a Rigidbody, done by hand).
- Device-independent input layer (section 7): build first so touch is not an afterthought.
- Tile grid data: a 2D array, `tileSize`, `origin`, `isSolidAt(x, z)` and the shared `tileAt(x, z)` (core loop step 3 owns the data, but a stub is needed for the test scene).

**Systems that depend on this mechanic**:
- Fall detection and lives: read `grounded`, `tileAt(center)` and the kill-plane event.
- Chase camera: reads interpolated position, yaw and velocity heading.
- Bots: write `DriveInput` and share the same model.
- Multiplayer sync: client sends position and velocity at about 20 Hz (or, with C, inputs, so the server can simulate).
- Effects (smoke, skid marks, tilt): read lateral speed, handbrake, grounded.

**Cross-cutting concerns**:
- Save/load: none. (Key bindings and touch layout would persist in localStorage; deferred.)
- Networking: the model module must have **no Three.js, Rapier or DOM imports**, so Colyseus can import it. Fall results must come from the server (confirmed in design-decisions.md). See the client-trusted tension in section 2.
- Input: keyboard, touch, optional gamepad; `event.code` keys; clear on blur / visibilitychange / ad; Poki `gameplayStart/Stop` hooks.
- Accessibility: remappable keys, hold-vs-toggle handbrake, optional steering assist, reduced camera shake, audio callout of the color (the last two belong to other mechanics but need hooks here).

---

# 10. OPEN QUESTIONS FOR DESIGNER

Questions marked **[BLOCKS]** must be answered before the matching code is written. Each lists my recommendation, but these are your calls.

- [ ] **1. [BLOCKS physics code] Rapier or a hand-written model?** Recommended: hand-written pure-TS model (Approach C), because the floor is flat, falls are a grid rule, and it lets the server run the same code later. Trade-off: Rapier then has no job until you add bumping, ramps or obstacles (design-decisions.md lists collisions only as a "later idea"). Alternative: Approach A (Rapier body), which fits the cube demo you built and a future with collisions, but needs seam/CCD/leak handling and leaves survival client-trusted. This touches the unconfirmed tech-stack line in design-decisions.md; you decide, and the doc should be updated either way. Do you plan ramps, walls, obstacles or pushing cars in the next few milestones?
- [ ] **2. [BLOCKS input/jump code] Jump rule.** Recommended: grounded-only (not a cooldown, so it does not break "no cooldown"), mid-air Space does nothing, with a 0.08 s coyote time and a 0.1 s jump buffer. Do you accept grounded-only? Do you want coyote time at all (it lets a car jump just after driving off an edge, which is kinder but also gives a fall-rule loophole)?
- [ ] **3. [BLOCKS tile-loop rules] Airborne at the moment tiles vanish.** Recommended: judge the car at its first touchdown against the vanished layout (matches your confirmed "lands over empty space falls"), and make the tile-return pause longer than the longest possible airtime (about 1.0 s with the defaults). Alternative: judge at the vanish instant (a jumping car dies), which is simple but punishes jumping. Related: with the defaults, a jump at top speed crosses about 9 m (about 4 tiles). Is that acceptable, or should jump distance be limited (lower air speed, shorter airtime)?
- [ ] **4. Handbrake behavior.** Recommended: hold-to-slide only (no hop, no boost), needs speed above a threshold, no turning in place, no air use, cannot stop dead. Do you want a drift reward (Mario Kart mini-turbo-style boost; I recommend no for now), and do you want the handbrake to also brake, or only slide?
- [ ] **5. "On the tile" rule (currently only SUGGESTED).** Do you confirm the car's center point? If yes, what should happen on a seam (recommended: deterministic half-open interval)? And should a car that is mostly over the void but with its center on a target tile survive (the edge-hang exploit)? Option: shrink the check to a small circle or footprint instead of the center point.
- [ ] **6. Car size vs tile size.** The numbers assume a 2 m car and 2-2.5 m tiles. What do you want? This changes every speed and reachability number.
- [ ] **7. Client-trusted vs server-simulated movement (for the multiplayer step).** Your confirmed text says the server decides survival; the unconfirmed suggestion says movement trusts the client at first. Recommended: keep the model server-ready now (it costs nothing with Approach C) and decide the trust level when step 5 starts. OK to defer?
- [ ] **8. Mobile driving.** Is auto-accelerate the default on touch (recommended by the research as the industry default, but it makes the car unable to brake to stop on a tile unless a brake button exists)? Recommendation: auto-accelerate with a brake/handbrake button, plus a settings toggle for manual gas. Throttle then becomes a button instead of an analog value on mobile.
- [ ] **9. Turning feel target.** Do you prefer an outward slide (more "drifty", harder to stop) or an inward-tightening drift (Mario Kart "inside drift", easier to stop on a tile)? Recommended: inward.
- [ ] **10. Lowest-spec phone.** Which phone/browser defines "low end" for the frame-rate and slow-sim tests? Is a 60 Hz fixed simulation acceptable there?
- [ ] **11. Round timer vs slow devices.** If a slow phone cannot keep up, should the single-player round timer follow wall-clock time (fair to the timer, unfair to the player) or simulated time (fair to the player)? In multiplayer the server clock wins. Owned by the core loop but it changes the step-cap behavior here.
- [ ] **12. Accessibility baseline.** Rebindable keys and hold-vs-toggle handbrake: in scope for the first release, or later?

---

# 11. IMPLEMENTATION NOTES

*(Empty during design phase. Filled in during/after implementation.)*

**Suggested implementation order** (no code is written by this doc; one step at a time, as the project owner prefers):
1. Resolve Open Questions 1, 2 and 3 (they block the rest). Verify Rapier 0.21 typings in `node_modules` only if Approach A is chosen.
2. Add render interpolation to the existing loop (previous/current state, lerp by `accumulator / FIXED_DT`). Check judder at 144 Hz using the cube.
3. Build the input layer: a pure `DriveInput` struct, a keyboard source with `event.code`, latched jump edge, clear-on-blur. Test with an on-screen readout before there is a car.
4. Write the pure car model module (no Three.js/Rapier imports): throttle/brake/drag, lateral grip, steering, yaw cap, gravity/jump, ground check, kill plane, NaN guard.
5. Write a Node test script that runs the model headless: frame-rate independence, jump distance, diagonal speed, handbrake caps.
6. Build the test scene with a stub tile grid (`tileAt`, `isSolidAt`), debug visualizer and tuning panel.
7. Tune by feel against the Low-confidence parameters, then record the tuned values here.
8. Add the reachability sweep script (Node) against the shrinking grid and the timer table.
9. Add cosmetic tilt, drift smoke, skid marks (read model outputs only).
10. Add the touch input source and test on a real phone, then the gamepad source (optional).
11. Later: bots write `DriveInput`; multiplayer step decides trust level and server simulation.

## Decisions made during implementation
- 2026-10-26: Jump is grounded-only with no cooldown (user confirmed; Open Question 2 closed). Coyote time (0.08 s) is NOT yet confirmed by the user, so keep it as a tunable placeholder, default on.
- 2026-10-26: Jump made "a little shorter" (user; Open Question 3 closed for distance). Target max jump about 6-7 m at top speed, air time about 0.5 s (placeholder: jump velocity about 6 m/s at gravity 24 m/s^2, replacing 8 m/s). Tune by feel and measure with the DoD jump-distance test. Tile-return pause must stay longer than max air time.
- 2026-10-26: Jump hop raised on user request after playtest ("increase the jump hop"; drift feel approved). Jump velocity 9 m/s with world gravity 36 m/s^2: about 1.1 m high, still about 0.5 s air time, so jump distance stays about 7 m at top speed (higher, not longer). Gravity and jump velocity must be changed together.
- 2026-10-26: Built so far: input layer (src/game/input.ts, keys swapped: Shift = jump, Space = handbrake), car controller on a Rapier dynamic body (src/game/carController.ts), chase camera (src/render/chaseCamera.ts), temporary test road + trees (src/render/testTrack.ts), render interpolation of car and camera (src/main.ts; fixed the jitter the user saw at speed). User playtest: drifting and overall feel approved.
- 2026-10-26: User-tuned CAR_PARAMS after playtest (the user says the feel is good): maxForward 60 m/s (was 14), accel 50, drag 0.5, gripNormal 5; the rest unchanged (maxReverse 6, brake 40, maxYaw 2.6, steerSmoothing 12, gripHandbrake 1.5, maxYawHandbrake 3.6, dragHandbrake 1.0, handbrakeMinSpeed 5, jumpVelocity 9, coyote 0.08 s, jumpBuffer 0.1 s). World gravity 36 m/s^2. NOT yet checked against the game: at 60 m/s a jump covers about 30 m (the decided target was about 6-7 m), and the real tile platform (about 20 m across) can be crossed in well under a second. Re-tune top speed and jump once the tile platform exists.
- 2026-10-26: FLOOR IS A RULE, NOT A COLLIDER (changes the Approach A cost list: no tile colliders, no CCD, no ray ground check). Reason: measured in headless Node tests with the real CarController. One Rapier box per tile made the car stop dead at every seam (20 m/s to 0.3 m/s). A Rapier voxel collider fixed the stop but still dropped part of a step's movement at seams and tile corners (about 0.05-0.33 m in one step, even with a ball-shaped car and with CCD off), which is the bump the user felt. A single flat box is perfectly smooth but cannot make tiles vanish. So: the car is a Rapier dynamic body (gravity, future obstacle collisions), and after each `world.step()` `CarController.resolveGround()` checks `TileGrid.isSolidAt(center)`: solid -> snap the car onto the floor (y = 0.25, no fall); not solid (vanished tile or off the platform) -> the car falls. This is exactly the "on the tile = car center point" rule, shared with the server later. Verified: smooth (distance between steps changes by about 4 mm), jump identical to before (0.48 s, 1.1 m high, 7 m at top speed), falls when its tile is removed, falls off the platform edge. Consequences: a car whose center is over solid ground never tips or falls even if half its body hangs over the void (the known "edge-hang" case). Visual gap between tiles set to 0 (it looked like bumps at speed). Tile size is now 6 m (10 x 10 grid).
- 2026-10-26: Approach A (Rapier dynamic rigid body) chosen over the recommended Approach C - the user plans more game modes that may need collisions/obstacles.

## Deviations from design doc
- <date>: <what changed> - <why>

## Known issues
- <issue>: <severity> - <ticket reference>

---

# 12. CHANGE LOG

- 2026-10-26: Initial design doc created via /design-mechanic. Sources: researcher, architect and QA reports (condensed copies, sourcing marks preserved) plus docs/design-decisions.md. All numeric tuning values are unmeasured starting points.
