---
mechanic: Rounds, match flow and the difficulty director
status: Implemented 2026-11-11 (director, sudden death, tie-break, overtime, respawn rules, banners), type-checks, NOT yet playtested. Not built yet - landing marker for respawns, intro, spectating, winner moment, Poki SDK (section 8). Code - src/game/director.ts, round.ts, main.ts (loseLife, endMatch)
last_updated: 2026-11-11
engine: Web - Three.js + TypeScript + Vite + Rapier
---

> Reading guide for a Unity developer: the "director" is a small pure-logic class like a game manager that reads the match state (cars alive, who fell) after every round and sets the next round's settings. It has no Three.js, Rapier or DOM code, so the Colyseus server can run it later.

# 1. Goal

A match that feels like one smooth loop, with no "exit the game" moments, and that **ends only when exactly one car is left**. Target length: about 2 to 3 minutes for 8 cars (8 to 10 rounds). Difficulty adapts to how many cars are alive and how well they are doing, so a lobby of good players gets squeezed harder and a weak lobby gets room to breathe.

Decided 2026-11-11:
- **No shared win.** The old "only the middle ring is left, survivors win" rule is removed (this also removes a soft-lock where that rule showed no end screen).
- **Dynamic difficulty** as described below (section 4).
- **Sudden death** at 3 or fewer cars (section 5).
- **Tie-break by fall order**, never a draw (section 6).

# 2. Match flow

```
LOBBY/START -> INTRO -> [ ROAM -> ROUND (countdown) -> RESULT ] x N -> WINNER -> RESULTS CARD -> (Play Again)
```

| State | What happens | Exists today? |
|---|---|---|
| Intro | 3-2-1 before the first roam | No (later, see section 8) |
| Roam | Tiles are back, free driving, fallen cars drop in, rings fall if due, the director sets up the next round (6 s) | Yes |
| Round | A color is called, countdown, targets laid out | Yes |
| Result | Non-target tiles vanish, cars on them fall (1.5 s) | Yes |
| Winner | One car left: slow-mo, camera on the winner | No (section 8) |
| Results card | Placing, rounds survived, Play Again | Partly (the GAME OVER overlay) |

# 3. Falling, lives and respawn

- 3 lives. Every fall (in a round or in a roam) costs a life. A fall inside the roam costs a life too (unchanged).
- A car that falls in a round respawns at the next roam, a car that falls in a roam respawns after 1 s (unchanged).
- **Respawn point (new rule):** a random present tile that is **not on the outer ring**, **not on a tile another car is on or was just dropped on**, spread out (reuse the "best candidate" idea from `layoutRound`). Show a landing marker for the 0.7 s of the drop. Today the pick is purely random and `used` only applies at match start.
- **Sudden death:** see section 5.

# 4. The difficulty director

Two knobs, kept separate on purpose.

## 4.1 Space: the platform follows the cars alive

The platform is made of rings. Shrinking removes the outer ring (existing `TileGrid.removeOuterRing`). A 10x10 grid has 5 rings.

Desired rings by cars alive (for a 10x10 grid; scale the thresholds by `botCount + 1` for other sizes):

| Cars alive | Rings | Platform |
|---|---|---|
| 7 to 8 | 5 | 10x10 |
| 5 to 6 | 4 | 8x8 |
| 3 to 4 | 3 | 6x6 |
| 2 | 2 | 4x4 |

Rules (checked once, at the start of a roam, after the round was settled):
1. **Due:** shrink one ring if `ringsLeft > desiredRings(alive)`.
2. **Spacing:** never shrink two rounds in a row. At most one shrink per 2 rounds.
3. **Forced shrink (the ratchet):** if 3 rounds pass with no shrink and `ringsLeft > 1`, shrink anyway. A table-matching lobby cannot freeze the platform.
4. The innermost ring (2x2) is never removed.
5. A car standing on the ring when it falls is lifted off and respawned without losing a life (unchanged).

## 4.2 Pressure: target tiles and timer follow a pressure level

The director keeps a **pressure level L** (starts at 0).

- **Target tiles** are a fraction of the tiles that exist, not a fixed count: `targets = max(1, round(presentTiles * coverage))`, `coverage = max(0.04, 0.12 - 0.01 * L)`. 12% at L0 is 12 tiles on the full platform (same as today). Shrinking the platform raises the pressure by itself, because the same fraction is fewer tiles in a smaller space.
- **Timer:** `max(floor, firstRoundTime - 0.5 * L)` (6 s down to a 3 s floor; 2 s floor in overtime, section 6).
- **After every round:** `L += 1`. If **fewer** cars fell than expected (`expected = max(1, ceil(alive * 0.2))`), `L += 1` more. If **many** fell (`>= ceil(alive * 0.4)`), `L -= 1` (net 0 that round). L never goes below 0.
- "Fell" means lost a life in the round (including the result pause), not the roam.

The ratchet in both knobs means pressure only goes up over a match, apart from the small relief after a brutal round. The match cannot stall at "nobody falls, nothing changes".

## 4.3 Announce changes

Whenever the director changes something, say so in a banner (never a silent change): "Platform shrinks after this round", "Fewer safe tiles!", "Sudden death". The existing "OUTER RING FALLS AFTER" label in the round HUD is the first example.

# 5. Sudden death

When **3 or fewer** cars are alive (not counting cars waiting to respawn that are out of lives), respawns are off: the next fall eliminates a car even if it has lives left. A banner announces it once. Cars that already fell and are waiting to respawn are brought back one last time at the next roam if they still have lives, and from then on it applies.

# 6. Ending: tie-break and overtime

**Win condition:** exactly one car left.

**Tie-break** if the last cars fall in the same round (they cannot all be eliminated, so one must win):
1. The car that fell **later** wins (compare the time each car went below the fall depth).
2. If that is equal too, the car with **more lives** wins.
3. If that is equal too, random (extremely rare).

**Overtime (safety net, rarely reached):** if the platform is at its smallest (1 ring, 2x2) and 2 or more cars are still alive after **5 rounds**:
- Timer floor drops to 2 s and falls by 0.25 s per further round, down to 1 s.
- After 5 more rounds, every remaining car loses one life each round (a "heart drain"), so the lives decide it.

Overtime is a guarantee that the match ends, not part of the normal game. If it shows up in playtests the director is too soft.

# 7. Settings and debug (for tuning by playtesting)

New or changed in `src/game/settings.ts` and the settings panel:
- Director on/off (off = the old fixed rounds, for comparison).
- Starting coverage (0.12), coverage floor (0.04), timer step per level (0.5), expected-falls fraction (0.2), heavy-falls fraction (0.4), forced shrink after N rounds (3), sudden death at N cars (3).
- A debug readout during the match: pressure level, targets, rings left, cars alive, falls last round, rounds since last shrink.

# 8. Not part of this step (open, decided later)

- **When you are out:** spectate until the end vs. a quick results card. Recommendation: spectate with a Skip/Play Again button that does not hide the match. Not decided yet.
- **Intro:** a short 3-2-1 and a "Play" start screen. Not decided yet. Also needed for audio and the Poki SDK.
- **Poki SDK:** `gameplayStart` / `gameplayStop`, and a commercial break before Play Again (the results screen is the natural place). Not wired yet.
- **Winner moment:** slow-mo and camera on the winner.

# 9. Definition of Done (checked in playtests)

- [ ] A match with 7 bots ends with exactly one winner, always. No draw, no soft-lock, no screen that cannot be left.
- [ ] A normal match takes about 2 to 3 minutes (measure over 10 matches).
- [ ] The platform does not shrink in two consecutive rounds, and shrinks at least every 4 rounds until 2x2.
- [ ] A round where nobody falls makes the next round noticeably harder (fewer target tiles, shorter timer).
- [ ] At 3 or fewer cars respawns are off and a banner says so.
- [ ] Two cars falling in the same round give one winner (fall order, then lives).
- [ ] Every director change shows a banner.
- [ ] Respawns never land on the outer ring or on another car.
- [ ] Overtime is reached in fewer than 1 in 20 matches (otherwise tune the director).
- [ ] The match is fun: ask "did the last 3 rounds feel tense?" after each playtest.
