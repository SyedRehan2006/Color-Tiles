import type { Racer } from "./racer";

// Arcade car-vs-car bumping. Rapier is NOT used for this: cars stay "ghosts" to the physics engine and
// this rule pushes overlapping cars apart and bounces their velocities. CarController reads the body's
// velocity every tick, so a bounce set here carries into the next tick (and the grip then settles it).
//
// Each car is two circles along its length (a 1 x 2 m box is about two 1 m circles).
const R = 0.5; // circle radius (half the car's width)
const OFFSET = 0.5; // circle centre distance from the car's centre
const RESTITUTION = 0.6; // 0 = cars stick, 1 = perfect bounce
const MAX_HEIGHT_GAP = 0.8; // m: a car in the air above another does not bump it

function circles(r: Racer): [number, number, number, number] {
  const yaw = r.yaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return [r.x + fx * OFFSET, r.z + fz * OFFSET, r.x - fx * OFFSET, r.z - fz * OFFSET];
}

// Call once per physics tick after world.step(). bumpStrength is extra separation speed (m/s) added to
// every hit, so even a gentle touch pushes cars apart.
export function resolveBumps(racers: Racer[], bumpStrength: number) {
  for (let i = 0; i < racers.length; i++) {
    const a = racers[i];
    if (a.fallen) continue;
    for (let j = i + 1; j < racers.length; j++) {
      const b = racers[j];
      if (b.fallen) continue;
      if (Math.abs(a.y - b.y) > MAX_HEIGHT_GAP) continue;
      // Cheap reject: cars further apart than their length cannot touch
      if (Math.hypot(a.x - b.x, a.z - b.z) > 2 * (OFFSET + R)) continue;

      const ca = circles(a);
      const cb = circles(b);
      // Find the deepest overlapping pair of circles
      let bestPen = 0;
      let nx = 0;
      let nz = 0;
      for (let ia = 0; ia < 2; ia++) {
        for (let ib = 0; ib < 2; ib++) {
          const dx = cb[ib * 2] - ca[ia * 2];
          const dz = cb[ib * 2 + 1] - ca[ia * 2 + 1];
          const d = Math.hypot(dx, dz);
          const pen = 2 * R - d;
          if (pen > bestPen) {
            bestPen = pen;
            if (d > 1e-4) {
              nx = dx / d;
              nz = dz / d;
            } else {
              // Exactly on top of each other: push apart along an arbitrary axis
              nx = 1;
              nz = 0;
            }
          }
        }
      }
      if (bestPen <= 0) continue;

      // Push apart by half the overlap each (normal points from a to b)
      const pa = a.body.translation();
      const pb = b.body.translation();
      a.body.setTranslation({ x: pa.x - nx * bestPen * 0.5, y: pa.y, z: pa.z - nz * bestPen * 0.5 }, true);
      b.body.setTranslation({ x: pb.x + nx * bestPen * 0.5, y: pb.y, z: pb.z + nz * bestPen * 0.5 }, true);

      // Bounce: equal masses, so each car gets half the closing speed times (1 + restitution),
      // plus the bumpStrength kick so a slow touch still separates the cars.
      const va = a.body.linvel();
      const vb = b.body.linvel();
      const closing = (va.x - vb.x) * nx + (va.z - vb.z) * nz; // > 0 means moving toward each other
      const j2 = (closing > 0 ? ((1 + RESTITUTION) * closing) / 2 : 0) + bumpStrength / 2;
      a.body.setLinvel({ x: va.x - nx * j2, y: va.y, z: va.z - nz * j2 }, true);
      b.body.setLinvel({ x: vb.x + nx * j2, y: vb.y, z: vb.z + nz * j2 }, true);
    }
  }
}
