import * as THREE from "three";
import type { TileGrid } from "../game/tileGrid";
import { TILE_STYLES, tileHex, type TileStyle } from "./theme";

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
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: makeTileTexture(TILE_STYLES.candy) });
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let count = 0;
  let tiles!: THREE.InstancedMesh;

  // (Re)create the tile mesh from the grid's current size, tile size and colors
  function build() {
    if (tiles) {
      scene.remove(tiles);
      tiles.geometry.dispose();
      tiles.dispose();
    }
    count = grid.size * grid.size;
    tiles = new THREE.InstancedMesh(
      new THREE.BoxGeometry(grid.tileSize - GAP, THICKNESS, grid.tileSize - GAP),
      material,
      count,
    );
    for (let i = 0; i < count; i++) {
      const { x, z } = grid.centerOf(i);
      dummy.position.set(x, -THICKNESS / 2, z);
      dummy.updateMatrix();
      tiles.setMatrixAt(i, dummy.matrix);
      color.setHex(tileHex(grid.colors[i]));
      tiles.setColorAt(i, color);
    }
    tiles.receiveShadow = true;
    scene.add(tiles);
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
    if (animations.size === 0) return;
    for (const [i, a] of animations) {
      a.t += dt;
      if (a.vanishing) {
        const k = Math.min(a.t / VANISH_TIME, 1);
        if (k >= 1) {
          writeTile(i, -THICKNESS / 2, 0, 0); // scale 0 hides it
          animations.delete(i);
        } else {
          const tilt = (i % 2 === 0 ? 1 : -1) * k * 0.6;
          writeTile(i, -THICKNESS / 2 - 0.5 * TILE_FALL_ACCEL * a.t * a.t, 1 - k, tilt);
        }
      } else {
        const k = Math.min(a.t / RETURN_TIME, 1);
        writeTile(i, -THICKNESS / 2, k, 0);
        if (k >= 1) animations.delete(i);
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

  // Change the tile top look (border, corners, shininess) for a new theme
  function setStyle(style: TileStyle) {
    material.map?.dispose();
    material.map = makeTileTexture(style);
    material.roughness = style.roughness;
    material.metalness = style.metalness;
    material.needsUpdate = true;
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
    setStyle,
  };
}
