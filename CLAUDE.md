# Car Color Tiles

A multiplayer car party game for **Poki** (web). Cars race to the tile color called out on screen, the other tiles vanish, the platform shrinks each round, and the last car standing wins. Working title; the folder will be renamed once the game has a name.

**Read `docs/design-decisions.md` before any design or code work.** It holds every decision made so far, plus the suggestions that are still unconfirmed.

## Stack

- **Vite** (dev server + build to `dist/`)
- **TypeScript**
- **Three.js** (rendering)
- **Rapier** (physics)
- **Colyseus** (multiplayer server, added later, not yet)

## How the user works

- Comes from Unity. Comparisons to Unity concepts help.
- Does the setup **themselves**. For each step: explain what and why, give detailed instructions, then wait for them to report back. One step at a time.
- Docs go in `.md` files in this project (`docs/`). Never create artifacts or online docs unless asked; offer first if one would help.
- Windows + PowerShell. Node v24, npm v11.

## Plan

Build order: single-player prototype first, then multiplayer.

1. Project setup (done)
2. Driving feel: one car on a flat floor, drifty. Shift = jump, Space = handbrake. Prototype working and playtested (input layer, car, chase camera, interpolation); design doc `docs/mechanics/01_driving.md`. Open: re-tune speed/jump on the real tile platform, DoD checks (fps independence, touch input later).
3. Core loop: tile grid → color announcement → timer → tiles vanish → fall check → shrink → lives ← in progress. Done: tile grid + platform (10x10 tiles, 6 m, 6 colors, bordered look), floor is a grid rule not a collider (`CarController.resolveGround`, `TileGrid.isSolidAt`), `setTileSolid()` ready for vanishing. Also done: announcement + countdown HUD (`src/game/round.ts`, `src/ui/hud.ts`; 6/5/4/3 s, 12 target tiles), non-target tiles vanish at 0 (`TileGrid.present` vs `alive`), a fallen car respawns from the sky onto a random tile at the next round start. Also done: 6 s roam between rounds, 3 lives (hearts HUD), fall = life lost, game over screen + Play Again (single player, in `main.ts` for now). Also done: settings panel (gear button, `src/ui/settingsPanel.ts`, `src/game/settings.ts`, saved in localStorage) for timers, show-timer switch, grid size, tile size, color count (2-8), and number of target tiles; platform settings call `TileGrid.configure` + `platform.rebuild()` and restart the match. Also done: shrinking (outer ring falls for good at the start of the roam after a round, never during a round; a car standing on it is lifted off and respawned from the sky, no life lost; `TileGrid.removeOuterRing`, settings: on/off + rounds per ring; the innermost ring stays; single player wins when only it is left). Next: balance pass on bots/shrink pace, then multiplayer.
4. Bots: playable 8-car match offline ← built, needs playtest. `src/game/racer.ts` (one car: body, mesh, own lives/fall state), `src/game/bot.ts` (BotBrain: same DriveInput as the keyboard; skill 1-10 = reaction time, pick among k nearest target tiles, aim error), settings `botCount` (default 7, restarts match) and `botSkill` (live). Every fall costs a life, in a round or in the roam; a car stands only if all 4 corners are on solid tiles (`TileGrid.isFootprintSolid`, replaced the center-point rule). Last car standing wins; if only the middle ring is left the survivors win; player out = placing screen while the match continues.
   Audio: built (not yet tuned by ear), all synthesized with Web Audio, no files: `src/audio/` (`audio.ts` mixer, `sfx.ts`, `carAudio.ts` engine hum, `music.ts` synthwave loop that builds with the match, `audioUi.ts` mute button/M key/volume sliders in the pause menu); design doc `docs/mechanics/05_audio.md`.
5. Multiplayer (Colyseus)

### Setup steps

- [x] 1. Install Node.js
- [x] 2. Create the project with Vite (`vanilla-ts` template)
- [x] 3. Install Three.js and Rapier
- [x] 4. Tidy the folder structure (remove Vite example files)
- [x] 5. First 3D scene (floor, cube, camera)
- [x] 6. Physics: a cube falls onto the floor
