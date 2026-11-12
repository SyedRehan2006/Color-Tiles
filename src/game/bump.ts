import type { Racer } from "./racer";

// Arcade car-vs-car bumping. Rapier is NOT used for this: cars stay "ghosts" to the physics engine and
// this rule pushes overlapping cars apart and bounces their velocities. CarController reads the body's
// velocity every tick, so a bounce set here carries into the next tick (and the grip then settles it).
//
// Each car is its real footprint: a box (halfWidth x halfLength, scaled by the car scale, turned by yaw).
// Two boxes overlap unless some axis separates them (SAT). The axis with the smallest overlap gives the
// push direction and depth.
const RESTITUTION = 0.6; // 0 = cars stick, 1 = perfect bounce
const MAX_HEIGHT_GAP = 0.8; // m at scale 1: a car in the air above another does not bump it
const PASSES = 3; // resolve passes per tick, so a pile of three or more cars settles

// Call once per physics tick after world.step(). bumpStrength is extra separation speed (m/s) added to
// every hit, so even a gentle touch pushes cars apart.
export function resolveBumps(racers: Racer[], bumpStrength: number, onHit?: (a: Racer, b: Racer, speed: number) => void) {
  for (let pass = 0; pass < PASSES; pass++) {
    // The kick only applies on the first pass, so it is not added three times
    const kick = pass === 0 ? bumpStrength : 0;
    for (let i = 0; i < racers.length; i++) {
      const a = racers[i];
      if (a.fallen || a.tumbling) continue;
      for (let j = i + 1; j < racers.length; j++) {
        const b = racers[j];
        if (b.fallen || b.tumbling) continue;
        collide(a, b, kick, onHit);
      }
    }
  }
}

function collide(a: Racer, b: Racer, bumpStrength: number, onHit?: (a: Racer, b: Racer, speed: number) => void) {
  if (Math.abs(a.y - b.y) > MAX_HEIGHT_GAP * Math.max(a.carScale, b.carScale)) return;

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  // Cheap reject: further apart than the two corner-to-center radii cannot touch
  const reach = Math.hypot(a.halfWidth, a.halfLength) + Math.hypot(b.halfWidth, b.halfLength);
  if (dx * dx + dz * dz > reach * reach) return;

  // Each car's axes (yaw 0 faces -Z): forward and right
  const ya = a.yaw;
  const yb = b.yaw;
  const axes: [number, number][] = [
    [-Math.sin(ya), -Math.cos(ya)],
    [Math.cos(ya), -Math.sin(ya)],
    [-Math.sin(yb), -Math.cos(yb)],
    [Math.cos(yb), -Math.sin(yb)],
  ];
  const ar: [number, number] = axes[1];
  const af: [number, number] = axes[0];
  const br: [number, number] = axes[3];
  const bf: [number, number] = axes[2];

  let minPen = Infinity;
  let nx = 0;
  let nz = 0;
  for (const [ax, az] of axes) {
    // How far each box reaches along this axis from its center
    const ra = a.halfWidth * Math.abs(ax * ar[0] + az * ar[1]) + a.halfLength * Math.abs(ax * af[0] + az * af[1]);
    const rb = b.halfWidth * Math.abs(ax * br[0] + az * br[1]) + b.halfLength * Math.abs(ax * bf[0] + az * bf[1]);
    const dist = dx * ax + dz * az;
    const pen = ra + rb - Math.abs(dist);
    if (pen <= 0) return; // a gap on this axis: the cars do not touch
    if (pen < minPen) {
      minPen = pen;
      const s = dist >= 0 ? 1 : -1; // normal points from a to b
      nx = ax * s;
      nz = az * s;
    }
  }

  // Push apart by half the overlap each
  const pa = a.body.translation();
  const pb = b.body.translation();
  a.body.setTranslation({ x: pa.x - nx * minPen * 0.5, y: pa.y, z: pa.z - nz * minPen * 0.5 }, true);
  b.body.setTranslation({ x: pb.x + nx * minPen * 0.5, y: pb.y, z: pb.z + nz * minPen * 0.5 }, true);

  // Bounce: equal masses, so each car gets half the closing speed times (1 + restitution),
  // plus the bumpStrength kick so a slow touch still separates the cars.
  const va = a.body.linvel();
  const vb = b.body.linvel();
  const closing = (va.x - vb.x) * nx + (va.z - vb.z) * nz; // > 0 means moving toward each other
  if (closing > 1.5) onHit?.(a, b, closing); // for the sound effect
  const j2 = (closing > 0 ? ((1 + RESTITUTION) * closing) / 2 : 0) + bumpStrength / 2;
  if (j2 === 0) return;
  a.body.setLinvel({ x: va.x - nx * j2, y: va.y, z: va.z - nz * j2 }, true);
  b.body.setLinvel({ x: vb.x + nx * j2, y: vb.y, z: vb.z + nz * j2 }, true);
}
