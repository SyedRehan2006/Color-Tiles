import * as THREE from "three";
import type { TileGrid } from "../game/tileGrid";
import { TILE_STYLES, isGlassTheme, isNeonTheme, tileHex, type ThemeId, type TileStyle } from "./theme";
import { createNeonMaterial, updateNeonMaterial } from "./neonTileMaterial";
import { createWireMaterial, updateWireMaterial } from "./wireTileMaterial";
import { wire, wire5 } from "./wireParams";

const THICKNESS = 1; // m
const GAP = 0; // m of see-through gap between tiles (0.06 showed the sky and looked like bumps at speed)

// Tile look: a darker border around each tile's top, drawn into a small texture.
// The texture multiplies each tile's color, so the border is a darker shade of that tile's own color.
// (The border width, darkness and corner shape come from the theme: TILE_STYLES in theme.ts.)
function makeTileTexture(style: TileStyle) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const shade = Math.round(style.borderShade * 255);
  ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
  ctx.fillRect(0, 0, size, size);
  const b = Math.round(size * style.border);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(b, b, size - 2 * b, size - 2 * b, size * style.radius);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8; // keeps the border crisp when seen at a shallow angle
  return texture;
}

// Builds the tile visuals for a grid: one InstancedMesh, top surface at y = 0.
// There is no physics here. Whether a car rests on a tile is decided by TileGrid.isSolidAt()
// (see CarController.resolveGround for why the floor is not a physics collider).
export function createTilePlatform(scene: THREE.Scene, grid: TileGrid) {
  // Two looks: lit tiles with a border texture (candy, cyberpunk) and the unlit neon shader (cyberpunk 2)
  const standardMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeTileTexture(TILE_STYLES.candy) });
  const neonMaterial = createNeonMaterial();
  const wireMaterial = createWireMaterial(); // cyberpunk 4: sharp tiles with glowing edge lines
  const glassMaterial = createWireMaterial(true); // cyberpunk 5: the same, as tinted glass
  let material: THREE.Material = standardMaterial;
  let currentTheme: ThemeId | null = null;
  // The neon tiles are unlit, so they cannot show shadows. This invisible floor catches the cars' shadows.
  const catcherMaterial = new THREE.ShadowMaterial({ opacity: 0.4 });
  let catcher: THREE.Mesh | null = null;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let count = 0;
  let tiles!: THREE.InstancedMesh;
  // What each tile looks like right now when no animation is running: 1 = full size and upright, 0 = hidden.
  // update() compares this with the grid data and fixes any tile that disagrees.
  let shown = new Uint8Array(0);
  let warnOn = false; // are the vanishing tiles flickering right now (cyberpunk 4)
  let clock = 0;

  // (Re)create the tile mesh from the grid's current size, tile size and colors
  function build() {
    if (tiles) {
      scene.remove(tiles);
      tiles.geometry.dispose();
      tiles.dispose();
    }
    if (catcher) {
      scene.remove(catcher);
      catcher.geometry.dispose();
    }
    count = grid.size * grid.size;
    const geometry = new THREE.BoxGeometry(grid.tileSize - GAP, THICKNESS, grid.tileSize - GAP);
    geometry.setAttribute("aWarn", new THREE.InstancedBufferAttribute(new Float32Array(count), 1)); // 1 = about to vanish
    warnOn = false;
    tiles = new THREE.InstancedMesh(geometry, material, count);
    shown = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      // writeTile sets position, rotation AND scale, so nothing is left over from an earlier animation
      const solid = grid.present[i] && grid.alive[i];
      writeTile(i, -THICKNESS / 2, solid ? 1 : 0, 0);
      shown[i] = solid ? 1 : 0;
      color.setHex(tileHex(grid.colors[i]));
      tiles.setColorAt(i, color);
    }
    tiles.receiveShadow = true;
    scene.add(tiles);

    const side = grid.size * grid.tileSize;
    catcher = new THREE.Mesh(new THREE.PlaneGeometry(side, side).rotateX(-Math.PI / 2), catcherMaterial);
    catcher.position.y = 0.02;
    catcher.receiveShadow = true;
    catcher.renderOrder = 3; // after the see-through glass
    tiles.renderOrder = 2;
    catcher.visible = isNeonTheme(currentTheme ?? "candy");
    updateNeon();
    scene.add(catcher);
  }
  build();

  // Tile animations. Only the visuals: the grid data (TileGrid.alive) already changed instantly,
  // so a car over a vanished tile starts falling right away while the tile drops and shrinks.
  const VANISH_TIME = 0.6; // s
  const RETURN_TIME = 0.25; // s
  const TILE_FALL_ACCEL = 25; // m/s^2
  const animations = new Map<number, { vanishing: boolean; t: number }>();

  function writeTile(index: number, y: number, scale: number, tilt: number) {
    const { x, z } = grid.centerOf(index);
    dummy.position.set(x, y, z);
    dummy.rotation.set(tilt, 0, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    tiles.setMatrixAt(index, dummy.matrix);
  }

  // Tiles that just stopped being solid: drop away and shrink
  function vanish(indices: number[]) {
    for (const i of indices) animations.set(i, { vanishing: true, t: 0 });
  }

  // Tiles that just became solid again: pop back in
  function restore(indices: number[]) {
    for (const i of indices) animations.set(i, { vanishing: false, t: 0 });
  }

  // Call once per rendered frame with the frame time
  function update(dt: number) {
    clock += dt;
    wireMaterial.uniforms.uTime.value = clock;
    glassMaterial.uniforms.uTime.value = clock;
    let dirty = false;
    // Self-healing: a tile with no animation must match the grid (solid = shown, otherwise hidden).
    // If an event was missed or overwritten, the tile is snapped back here instead of staying wrong.
    for (let i = 0; i < count; i++) {
      if (animations.has(i)) continue;
      const want = grid.present[i] && grid.alive[i] ? 1 : 0;
      if (shown[i] !== want) {
        writeTile(i, -THICKNESS / 2, want, 0);
        shown[i] = want;
        dirty = true;
      }
    }
    if (animations.size === 0) {
      if (dirty) tiles.instanceMatrix.needsUpdate = true;
      return;
    }
    for (const [i, a] of animations) {
      a.t += dt;
      if (a.vanishing) {
        const k = Math.min(a.t / VANISH_TIME, 1);
        if (k >= 1) {
          writeTile(i, -THICKNESS / 2, 0, 0); // scale 0 hides it
          shown[i] = 0;
          animations.delete(i);
        } else {
          const tilt = (i % 2 === 0 ? 1 : -1) * k * 0.6;
          writeTile(i, -THICKNESS / 2 - 0.5 * TILE_FALL_ACCEL * a.t * a.t, 1 - k, tilt);
        }
      } else {
        const k = Math.min(a.t / RETURN_TIME, 1);
        writeTile(i, -THICKNESS / 2, k, 0);
        if (k >= 1) {
          shown[i] = 1;
          animations.delete(i);
        }
      }
    }
    tiles.instanceMatrix.needsUpdate = true;
  }

  // Re-read the colors from the grid (call after TileGrid.layoutRound)
  function refreshColors() {
    for (let i = 0; i < count; i++) {
      color.setHex(tileHex(grid.colors[i]));
      tiles.setColorAt(i, color);
    }
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
  }

  // Switch the tile look for a theme (does nothing if the theme did not change)
  function setTheme(theme: ThemeId) {
    if (theme === currentTheme) return;
    currentTheme = theme;
    if (isGlassTheme(theme)) {
      material = glassMaterial;
    } else if (theme === "cyberpunk4") {
      material = wireMaterial;
    } else if (isNeonTheme(theme)) {
      material = neonMaterial;
    } else {
      const style = TILE_STYLES[theme];
      standardMaterial.map?.dispose();
      standardMaterial.map = makeTileTexture(style);
      standardMaterial.roughness = style.roughness;
      standardMaterial.metalness = style.metalness;
      standardMaterial.needsUpdate = true;
      material = standardMaterial;
    }
    tiles.material = material;
    if (catcher) catcher.visible = isNeonTheme(theme);
  }

  // Push the current neon values (visual panel) into the shader
  function updateNeon() {
    updateNeonMaterial(neonMaterial);
    updateWireMaterial(wireMaterial, wire, grid.tileSize, THICKNESS);
    updateWireMaterial(glassMaterial, wire5, grid.tileSize, THICKNESS);
  }

  // Make the tiles that will vanish at the end of the round flicker (cyberpunk 4 only shows it)
  function setWarning(on: boolean, targetColor: number) {
    if (on === warnOn) return;
    warnOn = on;
    const a = tiles.geometry.getAttribute("aWarn") as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) a.setX(i, on && grid.present[i] && grid.alive[i] && grid.colors[i] !== targetColor ? 1 : 0);
    a.needsUpdate = true;
  }

  // The grid changed size, tile size or color count (TileGrid.configure): build the tiles again
  function rebuild() {
    animations.clear();
    build();
  }

  return {
    get tiles() {
      return tiles;
    },
    vanish,
    restore,
    update,
    refreshColors,
    rebuild,
    setTheme,
    updateNeon,
    setWarning,
  };
}
