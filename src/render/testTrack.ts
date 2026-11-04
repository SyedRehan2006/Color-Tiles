import * as THREE from "three";

// Temporary scenery for testing the driving feel: a looping gravel road with low-poly trees.
// Purely visual. The physics floor stays flat.

export interface TestTrack {
  startPosition: THREE.Vector3;
  startYaw: number; // radians, 0 = facing -Z
}

const ROAD_WIDTH = 10;
const SHOULDER_WIDTH = 16;
const TREE_COUNT = 700;

// Small seeded random generator so the scenery is the same every reload
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A flat ribbon following the curve, lying just above the floor
function makeRibbon(points: THREE.Vector3[], curve: THREE.Curve<THREE.Vector3>, width: number, y: number, color: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const count = points.length;

  for (let i = 0; i < count; i++) {
    const p = points[i];
    const t = curve.getTangentAt(i / (count - 1));
    // Sideways direction on the ground: up x tangent
    const sx = t.z;
    const sz = -t.x;
    positions.push(p.x + sx * (width / 2), y, p.z + sz * (width / 2));
    positions.push(p.x - sx * (width / 2), y, p.z - sz * (width / 2));
    normals.push(0, 1, 0, 0, 1, 0);
    if (i < count - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, flatShading: true }),
  );
}

export function createTestTrack(scene: THREE.Scene): TestTrack {
  const rand = mulberry32(12345);

  // Closed loop with a few bends: radius wobbles as you go around
  const controlPoints: THREE.Vector3[] = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 110 + 35 * Math.sin(3 * a + 0.5) + 20 * Math.cos(2 * a);
    controlPoints.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(controlPoints, true, "centripetal");
  const samples = curve.getSpacedPoints(600);

  // Dirt shoulder under a gravel road
  scene.add(makeRibbon(samples, curve, SHOULDER_WIDTH, 0.015, 0x6b5a45));
  scene.add(makeRibbon(samples, curve, ROAD_WIDTH, 0.02, 0x9a9488));

  // Trees: trunk + two cones, each as one InstancedMesh (one draw call per part)
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2, 6);
  trunkGeo.translate(0, 1, 0);
  const coneLowGeo = new THREE.ConeGeometry(2.2, 3.5, 7);
  coneLowGeo.translate(0, 3.5, 0);
  const coneHighGeo = new THREE.ConeGeometry(1.6, 3, 7);
  coneHighGeo.translate(0, 5.6, 0);

  const trunks = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshStandardMaterial({ color: 0x6b4a2b, flatShading: true }),
    TREE_COUNT,
  );
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
  const lowLeaves = new THREE.InstancedMesh(coneLowGeo, leafMaterial, TREE_COUNT);
  const highLeaves = new THREE.InstancedMesh(coneHighGeo, leafMaterial, TREE_COUNT);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const minRoadDistSq = (ROAD_WIDTH / 2 + 4) ** 2;
  let placed = 0;
  let attempts = 0;

  while (placed < TREE_COUNT && attempts < TREE_COUNT * 20) {
    attempts++;
    const i = Math.floor(rand() * (samples.length - 1));
    const p = samples[i];
    const t = curve.getTangentAt(i / (samples.length - 1));
    const side = rand() < 0.5 ? 1 : -1;
    // More trees near the road, fewer far away
    const offset = ROAD_WIDTH / 2 + 4 + Math.pow(rand(), 1.6) * 60;
    const x = p.x + t.z * side * offset + (rand() - 0.5) * 6;
    const z = p.z - t.x * side * offset + (rand() - 0.5) * 6;

    // Keep trees off every part of the road, not just the nearest bit
    let tooClose = false;
    for (let s = 0; s < samples.length; s += 2) {
      const dx = samples[s].x - x;
      const dz = samples[s].z - z;
      if (dx * dx + dz * dz < minRoadDistSq) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const scale = 0.8 + rand() * 0.9;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = rand() * Math.PI * 2;
    dummy.scale.set(scale, scale * (0.9 + rand() * 0.5), scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    lowLeaves.setMatrixAt(placed, dummy.matrix);
    highLeaves.setMatrixAt(placed, dummy.matrix);

    color.setHSL(0.27 + rand() * 0.08, 0.45 + rand() * 0.2, 0.25 + rand() * 0.15);
    lowLeaves.setColorAt(placed, color);
    highLeaves.setColorAt(placed, color);
    placed++;
  }

  for (const mesh of [trunks, lowLeaves, highLeaves]) {
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
  }

  // Start at the beginning of the road, facing along it
  const start = curve.getPointAt(0);
  const tangent = curve.getTangentAt(0);
  return {
    startPosition: new THREE.Vector3(start.x, 1, start.z),
    startYaw: Math.atan2(-tangent.x, -tangent.z),
  };
}
