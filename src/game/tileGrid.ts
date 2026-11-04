// Tile data and rules. No Three.js or Rapier here, so the server can reuse this later.

export const GRID_SIZE = 10; // tiles per side
export const TILE_SIZE = 6; // meters

export const COLOR_COUNT = 6; // default number of colors in play (docs/design-decisions.md, suggested)

// Every color the game knows. Only the first `colorCount` are used in a match (the settings panel
// can change that, from 2 up to all 8). Hex values are for rendering.
export const TILE_COLORS = [
  { name: "red", hex: 0xe63946 },
  { name: "blue", hex: 0x2a6fdb },
  { name: "green", hex: 0x2fbf4a },
  { name: "yellow", hex: 0xffd23f },
  { name: "purple", hex: 0x8e44ad },
  { name: "orange", hex: 0xff8c1a },
  { name: "pink", hex: 0xff6fb5 },
  { name: "cyan", hex: 0x2ec4d6 },
];

export class TileGrid {
  size: number; // tiles per side
  tileSize: number; // meters
  colorCount: number; // how many of TILE_COLORS are in play
  // Index into TILE_COLORS for every tile, row by row (index = row * size + column)
  colors: number[];
  // Whether a tile is part of the platform at all. The shrinking ring will set this to false for good.
  present: boolean[];
  // Whether a tile is solid right now. Tiles of the wrong color go false when a round ends,
  // and come back (to `present`) when the next round starts.
  alive: boolean[];
  // How many outer rings have fallen for good
  ringsRemoved = 0;

  constructor(size = GRID_SIZE, tileSize = TILE_SIZE, colorCount = COLOR_COUNT) {
    this.size = size;
    this.tileSize = tileSize;
    this.colorCount = colorCount;
    this.present = [];
    this.alive = [];
    this.colors = [];
    this.configure(size, tileSize, colorCount);
  }

  // Start over with a different platform. The same object is reused, so everything that holds a
  // reference to this grid (the round controller, the car) keeps working.
  configure(size: number, tileSize: number, colorCount: number) {
    this.size = size;
    this.tileSize = tileSize;
    this.colorCount = Math.min(Math.max(colorCount, 2), TILE_COLORS.length);
    this.resetPlatform();
    this.shuffleColors();
  }

  // Every tile back, no rings removed (new match)
  resetPlatform() {
    const n = this.size * this.size;
    this.present = new Array<boolean>(n).fill(true);
    this.alive = new Array<boolean>(n).fill(true);
    this.ringsRemoved = 0;
  }

  // Ring 0 is the outer edge, ring 1 the next one in, and so on to the middle
  ringOf(index: number) {
    const col = index % this.size;
    const row = Math.floor(index / this.size);
    return Math.min(col, row, this.size - 1 - col, this.size - 1 - row);
  }

  // Rings still part of the platform (a 10x10 grid starts with 5, a 3x3 with 2)
  get ringsLeft() {
    return Math.ceil(this.size / 2) - this.ringsRemoved;
  }

  // The outermost remaining ring falls for good. The innermost ring is never removed, so there is
  // always a platform. Returns the tiles that were solid and now need the falling animation (tiles
  // that already vanished this round are gone for good too, but are already hidden).
  removeOuterRing() {
    const falling: number[] = [];
    if (this.ringsLeft <= 1) return falling;
    for (let i = 0; i < this.present.length; i++) {
      if (this.present[i] && this.ringOf(i) === this.ringsRemoved) {
        if (this.alive[i]) falling.push(i);
        this.present[i] = false;
        this.alive[i] = false;
      }
    }
    this.ringsRemoved++;
    return falling;
  }

  // Spread the colors evenly, then shuffle them (Fisher-Yates)
  shuffleColors() {
    const n = this.size * this.size;
    const list: number[] = [];
    for (let i = 0; i < n; i++) list.push(i % this.colorCount);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    this.colors = list;
  }

  // Lay out the colors for one round: exactly `targetCount` surviving tiles get `targetColor`,
  // spread across the platform (never all on one side). Every other tile gets a random other color.
  // Spreading uses "best candidate" sampling: each new target tile is the farthest-from-the-others
  // out of a few random candidates, which looks random but avoids clumps.
  layoutRound(targetColor: number, targetCount: number) {
    const alive: number[] = [];
    for (let i = 0; i < this.present.length; i++) if (this.present[i]) alive.push(i);
    // Always leave at least one tile that is NOT the target color, or nothing would ever vanish
    const count = Math.min(targetCount, Math.max(1, alive.length - 1));

    const chosen: number[] = [];
    const distSq = (a: number, b: number) => {
      const dc = (a % this.size) - (b % this.size);
      const dr = Math.floor(a / this.size) - Math.floor(b / this.size);
      return dc * dc + dr * dr;
    };
    // `pool` holds the tiles not chosen yet. Candidates only come from it, so every pick succeeds
    // (important on small platforms where most tiles end up chosen).
    const pool = alive.slice();
    for (let k = 0; k < count; k++) {
      let bestAt = -1;
      let bestDist = -1;
      for (let t = 0; t < 12; t++) {
        const at = Math.floor(Math.random() * pool.length);
        let nearest = Infinity;
        for (const c of chosen) nearest = Math.min(nearest, distSq(pool[at], c));
        if (nearest > bestDist) {
          bestDist = nearest;
          bestAt = at;
        }
      }
      chosen.push(pool[bestAt]);
      pool[bestAt] = pool[pool.length - 1]; // remove it from the pool
      pool.pop();
    }

    const others = this.colorCount - 1;
    for (let i = 0; i < this.colors.length; i++) {
      this.colors[i] = (targetColor + 1 + Math.floor(Math.random() * others)) % this.colorCount;
    }
    for (const c of chosen) this.colors[c] = targetColor;
  }

  // End of a round: every tile that is not the target color stops being solid.
  // Returns the tiles that just vanished (so the visuals can animate them).
  vanishNonTarget(targetColor: number) {
    const gone: number[] = [];
    for (let i = 0; i < this.alive.length; i++) {
      if (this.present[i] && this.alive[i] && this.colors[i] !== targetColor) {
        this.alive[i] = false;
        gone.push(i);
      }
    }
    return gone;
  }

  // Start of a round: every tile that is still part of the platform becomes solid again.
  // Returns the tiles that came back.
  restoreAll() {
    const back: number[] = [];
    for (let i = 0; i < this.alive.length; i++) {
      if (this.present[i] && !this.alive[i]) {
        this.alive[i] = true;
        back.push(i);
      }
    }
    return back;
  }

  // A random tile that is part of the platform, for dropping a car onto
  randomPresentTile() {
    const list: number[] = [];
    for (let i = 0; i < this.present.length; i++) if (this.present[i]) list.push(i);
    return list[Math.floor(Math.random() * list.length)];
  }

  // Where the platform starts on the X and Z axes, so the platform is centered on (0, 0)
  get origin() {
    return (-this.size * this.tileSize) / 2;
  }

  // Center of a tile in world space
  centerOf(index: number) {
    const col = index % this.size;
    const row = Math.floor(index / this.size);
    return {
      x: this.origin + (col + 0.5) * this.tileSize,
      z: this.origin + (row + 0.5) * this.tileSize,
    };
  }

  // The one rule for "which tile is under this point". Returns -1 outside the platform.
  // floor() means each tile owns its minimum edge, so a point exactly on a seam always
  // belongs to the tile with the larger index. Clients, server and bots must all use this.
  tileAt(x: number, z: number) {
    const col = Math.floor((x - this.origin) / this.tileSize);
    const row = Math.floor((z - this.origin) / this.tileSize);
    if (col < 0 || col >= this.size || row < 0 || row >= this.size) return -1;
    return row * this.size + col;
  }

  // True if there is a tile under this point that has not vanished
  isSolidAt(x: number, z: number) {
    const i = this.tileAt(x, z);
    return i >= 0 && this.alive[i];
  }

  // True if the whole car is over solid tiles: all four corners of its footprint (halfWidth x
  // halfLength, turned by yaw; yaw 0 faces -Z). A car half on a vanished tile does not count.
  isFootprintSolid(x: number, z: number, yaw: number, halfWidth: number, halfLength: number) {
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        const px = x + fx * halfLength * a + rx * halfWidth * b;
        const pz = z + fz * halfLength * a + rz * halfWidth * b;
        if (!this.isSolidAt(px, pz)) return false;
      }
    }
    return true;
  }

  // The color under a point, or null if there is no tile (off the platform or vanished)
  colorAt(x: number, z: number) {
    const i = this.tileAt(x, z);
    if (i < 0 || !this.alive[i]) return null;
    return TILE_COLORS[this.colors[i]];
  }
}
