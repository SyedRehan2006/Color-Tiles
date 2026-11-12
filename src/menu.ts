import * as THREE from "three";
import { TileGrid } from "./game/tileGrid";
import { createTilePlatform } from "./render/tilePlatform";
import { makeCarMesh } from "./render/carModels";
import { setPalette } from "./render/theme";
import { loadVisualConfig } from "./ui/visualPanel";
import { loadSettings, settings } from "./game/settings";
import { audio } from "./audio/audio";
import { sfx } from "./audio/sfx";
import { music } from "./audio/music";
import { installButtonClicks, mountMuteButton } from "./audio/audioUi";

// The main menu page (index.html): a synthwave backdrop with a small 4x4 platform and your car on the right.
// It is its own page with its own scene: Play just navigates to game.html.
const THEME = "cyberpunk6"; // the menu always uses the cyberpunk 6 tiles (glass) + retro car look
const PLAYER_COLOR = 0xff4444; // same as the player's car in the game
const CAR_SCALE = 2.2; // the car is drawn bigger than in the game so it reads well on the menu

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x0a0618);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 7, 24);
camera.lookAt(0, 1.5, -40);

scene.add(new THREE.HemisphereLight(0x8a7bff, 0x2a1450, 1.1));
const key = new THREE.DirectionalLight(0xffc0f0, 1.6);
key.position.set(-6, 10, 8);
scene.add(key);

// Stars
{
  const n = 1500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * 1.2 + 0.05; // radians above the horizon
    const r = 900;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    pos[i * 3 + 1] = Math.sin(e) * r;
    pos[i * 3 + 2] = -Math.abs(Math.sin(a) * Math.cos(e) * r) - 50;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfc8ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false })));
}

// The sun: a gradient disc with stripes cut out of its lower half. Kept small on purpose.
{
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, "#ffd23a");
  grad.addColorStop(0.55, "#ff5e8a");
  grad.addColorStop(1, "#b0208a");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 7; i++) {
    const y = S * 0.52 + i * S * 0.07;
    ctx.fillRect(0, y, S, 3 + i * 2.2); // the bands get thicker toward the bottom
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
  sun.position.set(-75, 38, -300);
  scene.add(sun);
}

// Wireframe mountains: black faces with blue edges, a ridge across the whole horizon
{
  const W = 700, D = 60, SX = 70, SZ = 8;
  const geo = new THREE.PlaneGeometry(W, D, SX, SZ);
  geo.rotateX(-Math.PI / 2);
  const p = geo.getAttribute("position");
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const edge = 1 - Math.abs(z) / (D / 2); // tallest in the middle of the strip
    p.setY(i, Math.pow(rnd(), 1.6) * 34 * Math.max(edge, 0.05) + (rnd() - 0.5) * 2 + Math.sin(x * 0.03) * 2);
  }
  geo.computeVertexNormals();
  const mountains = new THREE.Group();
  const faces = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  const lines = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1a5cae }));
  mountains.add(faces, lines);
  mountains.position.set(0, -2, -230);
  scene.add(mountains);
}

// Magenta grid floor, scrolling toward the camera
const FLOOR_CELL = 8;
const floor = new THREE.GridHelper(900, 900 / FLOOR_CELL, 0xc01cb8, 0x7a1a8a);
floor.position.set(0, -2, -400);
scene.add(floor);
const floorBase = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x120420 }));
floorBase.position.set(0, -2.05, -400);
scene.add(floorBase);

// The 4x4 platform with your car, on the right of the screen
// Use the tile look tuned in the game's visual panel (baked values + what you saved), and the same palette choice as the game
loadVisualConfig();
loadSettings();
setPalette(settings.tilePalette, THEME);
const grid = new TileGrid(4, 6, 6);
const platform = createTilePlatform(scene, grid);
platform.setTheme(THEME);
platform.updateNeon();
platform.refreshColors();
const stage = new THREE.Group(); // moved around to sit on the right half of the screen
stage.add(platform.tiles); // createTilePlatform put the tiles in the scene; adding them here moves them under the stage
const car = makeCarMesh("sedan", PLAYER_COLOR, THEME);
car.scale.setScalar(CAR_SCALE);
car.position.set(0, 0.25 * CAR_SCALE, 0);
car.rotation.y = Math.PI * 0.82; // front 3/4 view
stage.add(car);
scene.add(stage);

const DIST = 24; // camera to stage
function layout() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  const narrow = w / h < 1;
  const halfW = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect * DIST;
  // Right of centre on wide screens; centred and a bit higher on portrait
  stage.position.set(narrow ? 0 : halfW * 0.45, narrow ? 1 : 0, 24 - DIST);
  stage.scale.setScalar(narrow ? 0.7 : 1);
}
window.addEventListener("resize", layout);
layout();

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  floor.position.z = -400 + ((t * 6) % FLOOR_CELL);
  stage.rotation.y = Math.sin(t * 0.4) * 0.25; // slow sway
  car.position.y = 0.25 * CAR_SCALE + Math.sin(t * 1.6) * 0.03;
  platform.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// Sound: the music starts on the first key press or click (browsers do not allow it earlier)
audio.install();
installButtonClicks(() => sfx.click());
mountMuteButton(14);
music.setIntensity(0.45);
music.play();

const play = () => {
  location.href = "game.html"; // relative, so it works under the /Color-Tiles/ base path
};
document.getElementById("play")!.addEventListener("click", play);
window.addEventListener("keydown", (e) => {
  if (e.code === "Enter" || e.code === "NumpadEnter") play();
});
