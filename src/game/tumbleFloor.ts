import RAPIER from "@dimforge/rapier3d-compat";
import type { TileGrid } from "./tileGrid";
import type { Racer } from "./racer";

// Real colliders for the tiles, but only around cars that are tumbling off the edge.
//
// Driving cars never touch these (the floor is a rule for them, see CarController.resolveGround). A car that
// loses its footing becomes a free rigid body, and these boxes are what it slides, scrapes and bounces on.
// Unity comparison: a Physics layer that only "tumbling" cars collide with. Collision groups do that here:
// tile colliders are group 8 and only react to group 4, which is what a tumbling car switches to
// (the groups of the cars themselves are in racer.ts).
const GROUP_TILE = 0x00080004; // membership 8, collides with 4 (tumbling cars)
const THICKNESS = 1; // m, same as the tile meshes (src/render/tilePlatform.ts): top at y = 0

export class TumbleFloor {
  private colliders = new Map<number, RAPIER.Collider>();
  private world: RAPIER.World;
  private grid: TileGrid;

  constructor(world: RAPIER.World, grid: TileGrid) {
    this.world = world;
    this.grid = grid;
  }

  // Call every physics tick before world.step(): make the tiles around each tumbling car solid, and
  // remove the ones nobody needs any more (or that vanished, so a car falls through a vanished tile).
  sync(racers: Racer[]) {
    const wanted = new Set<number>();
    const g = this.grid;
    for (const r of racers) {
      if (!r.tumbling || r.fallen) continue;
      const col = Math.floor((r.x - g.origin) / g.tileSize);
      const row = Math.floor((r.z - g.origin) / g.tileSize);
      const reach = Math.ceil((r.halfLength * 1.6) / g.tileSize) + 1; // tiles around the car
      for (let dr = -reach; dr <= reach; dr++) {
        for (let dc = -reach; dc <= reach; dc++) {
          const c = col + dc;
          const rr = row + dr;
          if (c < 0 || c >= g.size || rr < 0 || rr >= g.size) continue;
          const i = rr * g.size + c;
          if (g.alive[i]) wanted.add(i);
        }
      }
    }
    for (const [i, collider] of this.colliders) {
      if (!wanted.has(i)) {
        this.world.removeCollider(collider, false);
        this.colliders.delete(i);
      }
    }
    for (const i of wanted) {
      if (this.colliders.has(i)) continue;
      const { x, z } = g.centerOf(i);
      const half = g.tileSize / 2;
      const desc = RAPIER.ColliderDesc.cuboid(half, THICKNESS / 2, half)
        .setTranslation(x, -THICKNESS / 2, z)
        .setFriction(0.5)
        .setRestitution(0.1)
        .setCollisionGroups(GROUP_TILE);
      this.colliders.set(i, this.world.createCollider(desc));
    }
  }

  // Remove everything (the platform was rebuilt or resized)
  clear() {
    for (const collider of this.colliders.values()) this.world.removeCollider(collider, false);
    this.colliders.clear();
  }
}
