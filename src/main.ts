import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { KeyboardInput, type DriveInput } from "./game/input";
import { TouchInput } from "./game/touchInput";
import { Racer } from "./game/racer";
import { resolveBumps } from "./game/bump";
import { TumbleFloor } from "./game/tumbleFloor";
import { BotBrain } from "./game/bot";
import { ChaseCamera } from "./render/chaseCamera";
import { TileGrid } from "./game/tileGrid";
import { createTilePlatform } from "./render/tilePlatform";
import { RoundController } from "./game/round";
import { SkyWorld } from "./render/skyWorld";
import { CAR_SHAPES } from "./render/carModels";
import { LOOKS, isGlassTheme, isNeonTheme, isSpeedTheme, isSynthTheme, setPalette, tileHex } from "./render/theme";
import { wire, wire5 } from "./render/wireParams";
import { grade, reflection, speedfx, tirefx } from "./render/fxParams";
import { SpeedFx } from "./render/speedFx";
import { TireFx } from "./render/tireFx";
import { EdgeFx } from "./render/edgeFx";
import { scenery } from "./render/sceneryParams";
import { SynthWorld } from "./render/synthWorld";
import { neon } from "./render/neonParams";
import { createPostFx } from "./render/postFx";
import { VisualPanel, loadVisualConfig } from "./ui/visualPanel";
import { Hud } from "./ui/hud";
import { SettingsPanel } from "./ui/settingsPanel";
import { loadSettings, settings } from "./game/settings";

// Rapier is WebAssembly: it must finish loading before we use it
await RAPIER.init();

// Renderer: creates the <canvas> and draws to it
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.style.display = "block";
renderer.domElement.style.touchAction = "none"; // touch drags look around instead of scrolling the page
document.body.style.margin = "0";
document.body.style.overflow = "hidden"; // no page scrolling or pull-to-refresh while driving on a phone
document.body.style.overscrollBehavior = "none";
document.body.appendChild(renderer.domElement);

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 120, 500); // distant things fade into the sky color (color set by applyVisuals)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const skyWorld = new SkyWorld(scene);
const tireFx = new TireFx(scene); // skid marks, smoke, sparks (cyberpunk 5)
const edgeFx = new EdgeFx(scene); // sparks and dust at tile edges (all themes)
const synthWorld = new SynthWorld(scene); // cyberpunk 3 scenery (hidden for the other themes)

// Camera
const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1500,
);
const chaseCamera = new ChaseCamera(camera);
const speedFx = new SpeedFx();
const devSpeedParam = import.meta.env.DEV ? new URLSearchParams(location.search).get("speed") : null;
const devSpeedLevel = devSpeedParam !== null ? parseFloat(devSpeedParam) : null;
chaseCamera.attachMouse(renderer.domElement);
const postFx = createPostFx(renderer, scene, camera); // bloom for cyberpunk 2 (only used while switched on)

// Lights
// Colors and strengths come from the theme (applyVisuals). The sun casts the shadows.
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.05;
const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.6);
scene.add(sun, sun.target, hemi);

// Make the shadow camera cover the whole platform (call after the grid size changes)
function fitShadow() {
  const half = Math.min(150, tileGrid.size * tileGrid.tileSize * 0.5 * 1.15);
  const cam = sun.shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 1;
  cam.far = half * 5;
  cam.updateProjectionMatrix();
  sun.position.set(0.45, 1, 0.35).normalize().multiplyScalar(half * 2);
}

// Physics world
// Gravity is stronger than real life (-9.81) so jumps are short and snappy
const world = new RAPIER.World({ x: 0, y: -36, z: 0 });
loadVisualConfig(); // values saved from the visual panel (cyberpunk 2 tuning)
loadSettings(); // what you chose in the settings panel last time (timers, platform size, timer switch)
if (import.meta.env.DEV) {
  // Dev only: ?theme=cyberpunk5 opens the game in that theme (for quick checks and screenshots)
  const t = new URLSearchParams(location.search).get("theme");
  if (t) settings.theme = t as typeof settings.theme;
}

// The tile platform, centered on the origin, top surface at y = 0 (defaults: 10 x 10 tiles of 6 m).
// It is visuals + data only. The floor is a rule (see CarController), not a physics collider.
const tileGrid = new TileGrid(settings.gridSize, settings.tileSize, settings.colorCount);
const tumbleFloor = new TumbleFloor(world, tileGrid); // tile colliders, only for cars tumbling off an edge
const platform = createTilePlatform(scene, tileGrid);

// Rounds: pick a color, lay out the tiles, count down. The HUD shows the called color and time.
const hud = new Hud();
hud.setTimerVisible(settings.showTimer);
// Gear button, bottom right: the second function runs when the platform settings change
new SettingsPanel((show) => hud.setTimerVisible(show), () => applyPlatformSettings(), () => applyVisuals());
// Palette button, bottom right: live tuning of the cyberpunk 2 look (tiles, glow, sky)
const visualPanel = new VisualPanel(() => applyLook());
const rounds = new RoundController(tileGrid, settings);
rounds.onTilesVanish = (tiles) => {
  platform.vanish(tiles);
  tireFx.fadeAll(); // marks over vanishing tiles must not hang in the air
};
rounds.onTilesReturn = (tiles) => platform.restore(tiles);
rounds.onRoamStart = () => {
  // Only the middle is left: the cars still standing win
  if (rounds.round > 0 && settings.shrinking && tileGrid.ringsLeft <= 1 && !matchOver) {
    finishBySurvivors();
    return;
  }
  hud.showRoam();
  if (matchOver) return;
  // A car that fell drops back in when the roam period starts. So does a car standing on the ring
  // that just went: it is lifted off before the ring falls, so the shrink never makes a car fall.
  for (const r of racers) {
    // Already past the point of no return (fell in the last moments of the round): the fall counts
    if (!r.fallen && !r.eliminated && r.y < DOOMED_DEPTH) loseLife(r);
  }
  for (const r of racers) {
    if (r.eliminated) continue;
    const onRemovedTile = !r.fallen && !tileGrid.present[tileGrid.tileAt(r.x, r.z)];
    if (r.fallen || onRemovedTile) dropAt(r);
  }
};
rounds.onRoundStart = () => {
  platform.refreshColors();
  hud.showRound(rounds.round, rounds.targetName, tileHex(rounds.targetColor), rounds.shrinksAtEnd);
};
// (rounds.start() is called further down, once the car exists)

// The cars: you plus the bots from the settings panel
const FALL_DEPTH = -12; // below this a car counts as fallen
const MAX_LIVES = 3; // 2 respawns, then a car is out (docs/design-decisions.md)
const DOOMED_DEPTH = -0.5; // below this a car can no longer land back on a tile
const ROAM_RESPAWN_DELAY = 1; // s: a car that falls during the roam comes back this quickly
const CAR_COLORS = [
  0xff4444, 0x3b82f6, 0x22c55e, 0xfacc15, 0xa855f7, 0xf97316, 0xec4899, 0x14b8a6,
  0x94a3b8, 0x84cc16, 0x0ea5e9, 0xf43f5e, 0x8b5cf6, 0xd97706, 0x10b981, 0xe2e8f0,
];
let racers: Racer[] = [];
let player!: Racer;
let followed!: Racer; // the car the camera watches: you, or a survivor once you are out
let matchOver = false; // a winner is decided: rounds stop
const botCars: { x: number; z: number }[] = []; // positions of the cars on the platform, rebuilt every tick for the bots
let overlayUp = false; // the end screen is showing (Play Again / Enter restarts)
let lastAlive = -1;

function buildRacers() {
  for (const r of racers) r.dispose();
  racers = [];
  player = new Racer(world, scene, tileGrid, CAR_COLORS[0], null, MAX_LIVES);
  racers.push(player);
  for (let i = 0; i < settings.botCount; i++) {
    racers.push(new Racer(world, scene, tileGrid, CAR_COLORS[(i + 1) % CAR_COLORS.length], new BotBrain((i + 0.5) / settings.botCount), MAX_LIVES));
  }
  followed = player;
  applyRacerLooks();
}

// Give every car its shape and theme style (the player is always the first car)
function applyRacerLooks() {
  racers.forEach((r, i) => {
    const shape = settings.carShape === "mixed" ? CAR_SHAPES[i % CAR_SHAPES.length] : settings.carShape;
    r.setLook(shape, settings.theme);
    r.setReflection(isGlassTheme(settings.theme) && reflection.enabled, reflection.strength);
  });
}

// The look of the world: theme, time of day, tile palette and colors, lights, shadows, glow.
// Cheap enough to call on every slider move in the visual panel.
function applyLook() {
  const look = LOOKS[settings.theme][settings.timeOfDay];
  const c2 = settings.theme === "cyberpunk2";
  const c3 = isSynthTheme(settings.theme); // cyberpunk 3 and 4 share the scenery
  setPalette(settings.tilePalette, settings.theme);
  (scene.background as THREE.Color).setHex(c3 ? scenery.fogColor : look.skyHorizon);
  const fog = scene.fog as THREE.Fog;
  fog.color.setHex(c3 ? scenery.fogColor : (look.fogColor ?? look.skyHorizon));
  fog.near = c3 ? scenery.fogNear : c2 ? neon.fogNear : 120;
  fog.far = c3 ? scenery.fogFar : c2 ? neon.fogFar : 500;
  sun.color.setHex(look.sunColor);
  sun.intensity = look.sunIntensity;
  sun.castShadow = settings.shadows;
  hemi.color.setHex(look.hemiSky);
  hemi.groundColor.setHex(look.hemiGround);
  hemi.intensity = look.hemiIntensity;
  skyWorld.apply(settings.theme, look);
  synthWorld.setVisible(c3);
  synthWorld.configure();
  platform.setTheme(settings.theme);
  platform.updateNeon();
  platform.refreshColors();
  const c5 = isGlassTheme(settings.theme); // cyberpunk 5 and 6
  const c6 = isSpeedTheme(settings.theme);
  postFx.configure(isNeonTheme(settings.theme) && neon.bloomEnabled, neon, c5 && grade.enabled ? grade : null, c6 && speedfx.enabled);
  for (const r of racers) r.setReflection(c5 && reflection.enabled, reflection.strength);
  tireFx.setEnabled(c5 && tirefx.enabled);
}

// Everything: the look, the shadow area, and the car models (heavier, so not for slider moves)
function applyVisuals() {
  applyLook();
  fitShadow();
  applyRacerLooks();
  visualPanel.refresh(); // the panel shows values for the current theme and time of day
}

// Drop a car from the sky onto a random tile (not one that `used` already has, if possible)
function dropAt(r: Racer, used?: Set<number>) {
  let tile = tileGrid.randomPresentTile();
  for (let tries = 0; used && used.has(tile) && tries < 30; tries++) tile = tileGrid.randomPresentTile();
  used?.add(tile);
  const { x, z } = tileGrid.centerOf(tile);
  r.respawnAt(x, z);
  if (r === followed) chaseCamera.snap();
}

// Cars that ran out of lives since the last check (handled once per tick)
const justOut: Racer[] = [];

// A car fell off the platform (or onto a vanished tile). Every fall costs a life, in a round or in
// the free roam. r.fallen makes this happen once per fall, so a fall can never cost two lives.
function loseLife(r: Racer) {
  r.markFallen();
  r.lives--;
  if (r === player) {
    hud.setLives(r.lives, MAX_LIVES);
    if (r.lives > 0) hud.flashMessage(`${r.lives} ${r.lives === 1 ? "LIFE" : "LIVES"} LEFT`, 0xff4d6d);
  }
  if (r.lives <= 0) {
    r.eliminate();
    justOut.push(r);
  } else if (rounds.state === "roam") {
    r.respawnDelay = ROAM_RESPAWN_DELAY; // in a round it waits for the next roam instead
  }
}

function ordinal(n: number) {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}

function aliveCount() {
  let n = 0;
  for (const r of racers) if (!r.eliminated) n++;
  return n;
}

function showEnd(title: string, text: string) {
  overlayUp = true;
  hud.showGameOver(text, restartMatch, title);
}

// You are out of lives. `aliveNow` = cars still in after this tick's eliminations.
function playerOut(aliveNow: number) {
  const survived = Math.max(rounds.round - 1, 0);
  const rd = `survived ${survived} round${survived === 1 ? "" : "s"}`;
  if (racers.length === 1) {
    matchOver = true;
    showEnd("GAME OVER", `You ${rd}`);
  } else if (aliveNow === 0) {
    showEnd("DRAW", `Everyone fell together - ${rd}`);
  } else {
    showEnd("GAME OVER", `You placed ${ordinal(aliveNow + 1)} of ${racers.length} - ${rd}`);
  }
}

// Only the middle of the platform is left: the cars still standing win together
function finishBySurvivors() {
  matchOver = true;
  const winners = racers.filter((r) => !r.eliminated && !r.fallen);
  if (winners.includes(player)) {
    const others = winners.length - 1;
    showEnd("YOU WIN!", others > 0 ? `You and ${others} other car${others === 1 ? "" : "s"} survived all ${rounds.round} rounds` : `You survived all ${rounds.round} rounds`);
  }
}

// Start the match over: full lives, all tiles back and reshuffled, every car dropped onto a tile
function restartMatch() {
  matchOver = false;
  overlayUp = false;
  hud.hideGameOver();
  tumbleFloor.clear();
  edgeFx.clear();
  tileGrid.resetPlatform(); // the rings that fell come back
  tileGrid.shuffleColors();
  platform.rebuild();
  const used = new Set<number>();
  for (const r of racers) {
    r.reset();
    dropAt(r, used);
  }
  hud.setLives(MAX_LIVES, MAX_LIVES);
  lastAlive = -1;
  rounds.start();
}

// The settings panel changed the platform or the number of bots: rebuild and start over
function applyPlatformSettings() {
  tileGrid.configure(settings.gridSize, settings.tileSize, settings.colorCount);
  buildRacers();
  restartMatch(); // also rebuilds the platform visuals
  fitShadow();
}

window.addEventListener("keydown", (e) => {
  if (overlayUp && e.code === "Enter") restartMatch();
});

buildRacers();
restartMatch();
applyVisuals();

// Keep the view correct when the window is resized
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postFx.setSize(window.innerWidth, window.innerHeight);
});

// Game loop with a fixed physics timestep (like FixedUpdate + Update)
// Input + debug readout (temporary)
const keyboard = new KeyboardInput();
const touch = new TouchInput();
// Keyboard and touch both drive the same car; if both are used the larger push wins
const input = {
  read(): DriveInput {
    const k = keyboard.read();
    const t = touch.read();
    return {
      throttle: Math.max(-1, Math.min(1, k.throttle + t.throttle)),
      steer: Math.max(-1, Math.min(1, k.steer + t.steer)),
      handbrake: k.handbrake || t.handbrake,
      jumpPressed: k.jumpPressed || t.jumpPressed,
    };
  },
};
const debugText = document.createElement("pre");
debugText.style.cssText =
  "position:fixed;top:8px;left:8px;margin:0;color:#fff;font:14px monospace;text-shadow:0 0 3px #000;pointer-events:none";
document.body.appendChild(debugText);
let jumpCount = 0;

const FIXED_DT = 1 / 60;
let accumulator = 0;
let last = performance.now();

const camTarget = new THREE.Vector3();
// Fall effects, blended by the car's speed when it goes over: "slide" values at a stand-still, "fast" values
// at SLOWMO_FULL_SPEED and above.
const SLOWMO_FULL_SPEED = 24; // m/s
const SLOWMO_SCALE = 0.3; // game speed during the slow-mo, fast fall (1 = normal)
const SLOWMO_SCALE_SLIDE = 0.7; // ... slide off
const SLOWMO_TIME = 1.0; // s of real time the slow-mo lasts, fast fall
const SLOWMO_TIME_SLIDE = 0.4; // ... slide off
const KICK_FAST = 0.55; // camera shake (0..1), fast fall
const KICK_SLIDE = 0.12; // ... slide off
let slowTarget = SLOWMO_SCALE; // game speed the current slow-mo eases to
let slowLeft = 0; // real seconds of slow-mo left
let timeScale = 1; // current game speed (eased)
let tumbleKickFor: Racer | null = null; // the car the camera already shook for (so it shakes once per fall)

// Frame-time diagnostics (temporary)
let fpsSmooth = 60;
let worstFrameMs = 0;
let worstShown = 0;
let worstTimer = 0;
let lastDrive = input.read();

function animate() {
  const now = performance.now();
  const rawDt = (now - last) / 1000;
  // Clamp so a long pause (e.g. switching tabs) doesn't cause a huge catch-up
  const frameDt = Math.min(rawDt, 0.1);
  // Slow-mo on a fall: the game (physics, bots, round timer) runs slower for a moment, the camera and
  // the screen effects stay in real time. The speed eases in and out instead of jumping.
  slowLeft = Math.max(0, slowLeft - frameDt);
  timeScale += ((slowLeft > 0 && settings.slowMo ? slowTarget : 1) - timeScale) * (1 - Math.exp(-12 * frameDt));
  accumulator += frameDt * timeScale;
  last = now;

  fpsSmooth += (1 / Math.max(rawDt, 0.001) - fpsSmooth) * 0.05;
  worstFrameMs = Math.max(worstFrameMs, rawDt * 1000);
  worstTimer += rawDt;
  if (worstTimer >= 1) {
    worstShown = worstFrameMs;
    worstFrameMs = 0;
    worstTimer = 0;
  }

  for (const r of racers) {
    r.setScale(settings.carScale); // live from the settings panel
    r.setKnock(settings.knockOffCars);
  }

  while (accumulator >= FIXED_DT) {
    for (const r of racers) r.beginTick();

    // Everyone drives: you from the keyboard, bots from their brain (same inputs, same controller)
    lastDrive = input.read();
    if (lastDrive.jumpPressed) jumpCount++;
    botCars.length = 0;
    for (const r of racers) if (!r.fallen) botCars.push({ x: r.x, z: r.z });
    const botView = {
      grid: tileGrid,
      state: rounds.state,
      round: rounds.round,
      targetColor: rounds.targetColor,
      skill: settings.botSkill,
      mix: settings.botMix,
      cars: botCars,
    };
    for (const r of racers) {
      if (r.fallen) continue;
      if (r.tumbling) continue; // a tumbling car is a free rigid body: no steering, no grip, just physics
      const drive = r.brain
        ? r.brain.drive({ x: r.x, z: r.z, yaw: r.yaw, forwardSpeed: r.controller.forwardSpeed }, botView, FIXED_DT)
        : lastDrive;
      r.controller.update(drive, FIXED_DT);
    }
    for (const r of racers) r.tumbleTick(FIXED_DT);
    tumbleFloor.sync(racers); // real tile colliders around cars that are tumbling off an edge
    world.step();
    for (const r of racers) {
      if (r.fallen || r.tumbling) continue;
      const lost = r.controller.resolveGround();
      if (lost) {
        r.startTumble(lost); // lost its footing: becomes a free rigid body
        const v = r.body.linvel();
        const strength = Math.min(1, Math.hypot(v.x, v.z) / SLOWMO_FULL_SPEED); // 0 = slid off, 1 = fast
        edgeFx.burst(r, strength);
      }
    }
    if (settings.collisions) resolveBumps(racers, settings.bumpStrength);
    if (!matchOver) rounds.update(FIXED_DT); // may drop cars back in when a roam starts

    // Cars that fell off the platform (or onto a vanished tile). r.fallen makes this happen once
    // per fall, so a fall can never cost two lives.
    for (const r of racers) {
      if (!r.fallen && r.y < FALL_DEPTH) loseLife(r);
      if (r.fallen && !r.eliminated && r.respawnDelay > 0) {
        r.respawnDelay -= FIXED_DT;
        if (r.respawnDelay <= 0 && !matchOver) dropAt(r);
      }
    }
    if (justOut.length > 0) {
      const aliveNow = aliveCount();
      if (justOut.includes(player)) playerOut(aliveNow);
      justOut.length = 0;
      // Last car standing (needs at least two cars to start with)
      if (racers.length > 1 && aliveNow <= 1 && !matchOver) {
        matchOver = true;
        const winner = racers.find((r) => !r.eliminated);
        if (winner === player) {
          showEnd("YOU WIN!", `Last car standing after ${Math.max(rounds.round - 1, 0)} rounds`);
        }
      }
    }
    const alive = aliveCount();
    if (alive !== lastAlive) {
      lastAlive = alive;
      hud.setAlive(alive, racers.length);
    }

    for (const r of racers) r.endTick();
    accumulator -= FIXED_DT;
  }

  // Draw every car part-way between its last two physics states
  const alpha = accumulator / FIXED_DT;
  for (const r of racers) {
    r.updateLean(frameDt);
    r.render(alpha);
  }
  tireFx.update(frameDt, racers, followed.mesh.position);
  edgeFx.update(frameDt * timeScale, racers, followed.mesh.position); // follows the slow-mo

  // The camera follows you, or a car still in the match once you are out
  if (player.eliminated) {
    const next = racers.find((r) => !r.eliminated && !r.fallen) ?? racers.find((r) => !r.eliminated);
    if (next && next !== followed) {
      followed = next;
      chaseCamera.snap();
    }
  } else if (followed !== player) {
    followed = player;
    chaseCamera.snap();
  }

  // Chase camera follows the smoothed position and heading. It stops following a car that falls
  // (it never goes below y = -1), so you watch the car drop away instead of chasing it down.
  // Speed effects (cyberpunk 6): how fast the followed car feels, and the camera extras that follow from it
  const speedOn = isSpeedTheme(settings.theme) && speedfx.enabled;
  speedFx.update(
    frameDt,
    speedOn
      ? {
          speed: followed.controller.forwardSpeed,
          grounded: followed.controller.grounded,
          drifting: followed.controller.drifting,
          vy: followed.body.linvel().y,
          steer: followed === player ? lastDrive.steer : 0,
        }
      : null,
  );
  if (import.meta.env.DEV && devSpeedLevel !== null) speedFx.level = devSpeedLevel; // dev only: ?speed=0.8 for screenshots
  chaseCamera.extraFov = speedFx.level * speedfx.fovKick;
  chaseCamera.roll = speedFx.roll;
  chaseCamera.shake = speedOn ? Math.min(1, speedFx.shake + speedFx.level * 0.12) * speedfx.shake : 0;
  postFx.setSpeed(speedFx.level, speedfx);

  const q = followed.mesh.quaternion;
  camTarget.copy(followed.mesh.position);
  camTarget.y = Math.max(camTarget.y, -1);
  // Tumble camera: stop swinging with the spinning car, and shake once when the fall starts
  chaseCamera.tumbling = followed.tumbling;
  if (followed.tumbling && tumbleKickFor !== followed) {
    // Shake and slow-mo depend on how fast the car was going: a fast fall gets the full effect, a slow
    // slide off the edge gets a light version (a strong slow-mo on a slow fall looks like a crawl).
    const v = followed.body.linvel();
    const strength = Math.min(1, Math.hypot(v.x, v.z) / SLOWMO_FULL_SPEED);
    const lerp = (slow: number, fast: number) => slow + (fast - slow) * strength;
    chaseCamera.kick(lerp(KICK_SLIDE, KICK_FAST));
    slowTarget = lerp(SLOWMO_SCALE_SLIDE, SLOWMO_SCALE);
    slowLeft = lerp(SLOWMO_TIME_SLIDE, SLOWMO_TIME);
  }
  tumbleKickFor = followed.tumbling ? followed : null;

  // Heading from where the nose points (stays right while the car is pitched, rolled or tumbling)
  const camYaw = Math.atan2(2 * q.w * q.y + 2 * q.z * q.x, 1 - 2 * (q.x * q.x + q.y * q.y));
  chaseCamera.update(camTarget, camYaw, frameDt);

  const flickerParams = isGlassTheme(settings.theme) ? wire5 : wire;
  const flickerOn = (settings.theme === "cyberpunk4" || isGlassTheme(settings.theme)) && flickerParams.edgeFlicker;
  platform.setWarning(
    flickerOn && rounds.state === "running" && rounds.timeLeft < flickerParams.flickerTime,
    rounds.targetColor,
  );
  platform.update(frameDt * timeScale); // tile animations follow the game's speed
  skyWorld.update(frameDt, now / 1000);
  synthWorld.update(frameDt, now / 1000);
  hud.setTime(rounds.timeLeft, rounds.state === "running");

  debugText.textContent =
    `throttle  ${lastDrive.throttle}\n` +
    `steer     ${lastDrive.steer}\n` +
    `handbrake ${lastDrive.handbrake}\n` +
    `jumps     ${jumpCount}\n` +
    `speed     ${player.controller.forwardSpeed.toFixed(1)} m/s\n` +
    `vert vel  ${player.body.linvel().y.toFixed(2)}\n` +
    `grounded  ${player.controller.grounded}\n` +
    `drifting  ${player.controller.drifting}\n` +
    `tile      ${tileGrid.colorAt(player.mesh.position.x, player.mesh.position.z)?.name ?? "none"}\n` +
    `fps       ${fpsSmooth.toFixed(0)}\n` +
    `worst ms  ${worstShown.toFixed(1)}`;

  if (postFx.enabled) postFx.render(now / 1000);
  else renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();