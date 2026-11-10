# Car Color Tiles: Design Decisions

As of 2026-10-24. Online copy: https://claude.ai/artifact/7XMCKtqBvaK2mF9r7kunK4

## Game concept

An online multiplayer party game played in cars. Cars drop onto a floor of colorful tiles and can drive around freely. Each round the screen calls out a color, and every car must reach a tile of that color before the other tiles vanish. Cars not on the right color fall. The platform shrinks every round, and the last car standing wins.

Friends can play together in the same match. More modes can come later, as long as they stay car-focused.

## Platform and tech

- **Target platform:** Poki comes first. Other web game platforms come later.
- **Engine:** Three.js. It was picked for small download size, fast loading and good AI support.
- **Tech stack:** Vite + TypeScript + Three.js + Rapier (physics), with Colyseus added later for multiplayer. Rapier is confirmed as the car physics (decided 2026-10-26, because more game modes are planned and may need collisions or obstacles). The car is a Rapier dynamic rigid body, not a hand-written model. Details: `docs/mechanics/01_driving.md`.
- **Build order:** single-player prototype first (driving feel, then the core tile loop, then bots). Multiplayer comes after that.

## Match and round rules

**Win condition:** last car standing. Aim for matches of 2 to 4 minutes, because web players play in short sessions.

**Players per match:** 8.

Each round runs in this order:

1. The screen announces a color.
2. A countdown shows how long players have to reach a tile of that color.
3. All tiles of other colors vanish.
4. Any car not on a target tile falls.
5. After a short pause the tiles return, with the outer ring removed and the colors reshuffled.
6. The next round starts.

**Timer:** the round timer does not decide the winner. It controls difficulty and gets shorter each round, for example 5s, then 4s, then 3s. It is always shown on screen so a loss feels fair.

**Roam period (decided 2026-11-03):** between rounds, after the tiles return, everyone gets 6 seconds to drive around freely before the next color is called. The match also begins with a roam. The tiles keep the previous round's colors during the roam and reshuffle the moment the next color is called (user approved). Falling off the platform during the roam costs no life; the car respawns after about 1 second.

## Lives, respawns and sudden death

- **Lives:** 3 in total (2 respawns). Falling a third time eliminates you, and you spectate.
- **Respawn point:** you drop from the sky onto a random tile at the start of the next round, not straight after falling.
- **Sudden death:** respawns turn off once only a few players are left, and the next fall eliminates you. This makes sure matches end. The exact player count is not set yet; 3 players was suggested.

## Tiles and shrinking

- **Shrinking:** the outer ring of tiles falls away each round.
- **Fewer targets:** when fewer players are left, fewer tiles of the target color appear, which makes rounds harder.
- **Fair spread:** target tiles are spread across the platform, never all on one side.
- **Reshuffle:** colors reshuffle every round, so players can't park on one tile and wait.

## Cars, driving and controls

- **Collisions:** off by default. Cars pass through each other and look see-through (a "ghost" look) when they overlap. Optional bumping exists behind a setting. Cars that fall off an edge tumble and can knock other cars (setting, on by default). Update 2026-11-10: edge rule, tumble, knock-offs and fall effects are in `docs/mechanics/03_falling.md`.
- **Driving feel:** drifty, arcade-style. It will be tested and tuned.
- **Jump rule:** if a car lands over empty space, it falls. Jump has no cooldown, but a car can only jump while on the ground (no mid-air jumps). Decided 2026-10-26.
- **Jump length:** jumps are made a little shorter than the first proposal (which covered about 9 m, roughly 4 tiles, at top speed). Working target: about 6 to 7 m at top speed (air time around 0.5 s). The exact value is tuned by feel. Decided 2026-10-26.
- **Cars in the air when tiles vanish:** the car is judged where it first lands. Suggested, not confirmed: the tile-return pause is longer than the longest jump.
- **Keys:** Shift = jump, Space = handbrake (swapped back to the first plan by the user on 2026-10-26). The first plan was changed to Space = jump, Shift = handbrake because tapping Shift 5 times on Windows opens the Sticky Keys popup. With jump on Shift and no cooldown, players may trigger that popup. Watch this in playtests; keys should be rebindable later.
- **Playtest watch item:** with no collisions, check whether the game feels like 8 people playing alone side by side.

## Camera

A chase camera behind the car, placed higher and further back than in a normal racing game and looking down at the car, so players can see tiles around and behind them. There will be no arrow at the screen edge pointing to target tiles.

## Multiplayer, rooms and bots

- **Private rooms:** for friends, with a minimum of 3 players. This stays as originally planned. Removing the minimum was suggested but not accepted for now.
- **Public matches:** a group of friends of any size can also join a public match and play with strangers.
- **Bots:** fill empty spots when a player is alone, a room isn't full, or there are few public players. Bots should make human-like mistakes. Whether bots are labeled as bots is not decided.
- **Who decides survival:** the server, never the player's browser. This keeps results fair with lag and stops cheating.

## Accounts and chat

Players use guest names for now, with no logins. Public lobbies will need a filter that blocks offensive names.

## Devices

The game targets desktop and mobile. Phones will need touch controls (a steering joystick, gas and brake, plus jump and handbrake buttons) and landscape orientation. Low-end phones set the limit on how detailed the art can be.

## Art style

Not decided yet. The suggestion was low-poly and toy-like. Whatever the style, tile colors must be the most eye-catching thing on screen.

## Suggested, not yet confirmed

These defaults were proposed to fill gaps in the design. None has been accepted or rejected yet.

| Topic | Suggested default |
| --- | --- |
| Colorblind players | Each color also gets a symbol (star, circle, triangle, square). The UI shows the swatch and symbol, not only the word. |
| Number of colors | 6 |
| What counts as "on the tile" | The car's center point |
| Eliminated players | Spectate living players, with "Play again" and "Leave" always visible |
| Last two players fall together | Replay the round, or a shared win (pick one) |
| Disconnects | The car is removed. Rejoining comes later. |
| Driving off the edge | Counts as a fall and costs a life |
| First round | Longer timer, about 6s |
| Party bigger than free slots | A party only joins a public match with room for the whole group |
| Chat | No text chat at first, only quick emotes |
| Mobile driving | Auto-accelerate as a simpler touch option |
| Server checks | Movement trusts the client at first, with basic speed checks on the server |

## Rejected suggestions and future ideas

**Rejected for now**

- A cooldown on jump
- Removing the 3-player minimum for private rooms
- An arrow at the screen edge pointing to target tiles

**Ideas for later**

- **Stroop mode:** the text says "RED" but is written in blue. Players go by the word, not the ink color, or the other way round.
- **Car collisions:** bumping or pushing other cars, if playtests show the game needs more interaction.
- **Bots avoiding edges (skipped for now, revisit later, 2026-11-10):** bots drive straight at their target tile and have no idea where the platform edge is, so with the tougher edge rules (car falls below 70% on tiles, plus a pull toward the void) they tend to drive off the rim by themselves. The plan, each part separate: (1) aim at the inner part of a rim tile; (2) look ahead along the heading and limit speed so the bot can still stop before the edge; (3) recovery: when a bot leans (wheels out) it steers and throttles or reverses back toward the middle; (4) scale all of it by skill (pros careful, newbie and chaotic bots barely) so some bots still fall, and add one "Bot edge care" setting to tune it. Keep some falls: bots that never fall make the match dull. Code to change: `src/game/bot.ts` (`goTo`, `pickTarget`, `wander`).
- **Reasons to come back:** car skins and colors, a leaderboard, and more car-focused modes.
