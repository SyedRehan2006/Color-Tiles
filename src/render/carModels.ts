import * as THREE from "three";
import type { ThemeId } from "./theme";

// Low-poly cars built from boxes and cylinders (no model files, so no download). Every car faces -Z and
// fits the 1 x 0.5 x 2 m collider: the model's origin is the collider's center, so the wheels' bottoms
// sit at y = -0.25 (the floor).
export type CarShape = "sedan" | "truck" | "buggy";
export const CAR_SHAPES: CarShape[] = ["sedan", "truck", "buggy"];

// Shared by all cars (never disposed)
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const wheelCache = new Map<string, THREE.BufferGeometry>();
const GEO = {
  wheel: (r: number, w: number) => {
    const key = `${r}x${w}`;
    let geo = wheelCache.get(key);
    if (!geo) {
      geo = new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2);
      wheelCache.set(key, geo);
    }
    return geo;
  },
};
const glass = new THREE.MeshStandardMaterial({ color: 0x1b2a41, roughness: 0.15, metalness: 0.2 });
const tyre = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.9 });
const headlight = new THREE.MeshBasicMaterial({ color: 0xfff6c2 });
const taillight = new THREE.MeshBasicMaterial({ color: 0xff3030 });
const trim = new THREE.MeshStandardMaterial({ color: 0x2b2d3a, roughness: 0.7 });

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function wheels(g: THREE.Group, r: number, w: number, x: number, zFront: number, zBack: number) {
  const geo = GEO.wheel(r, w);
  const y = -0.25 + r;
  for (const sx of [-1, 1]) {
    part(g, geo, tyre, sx * x, y, zFront);
    part(g, geo, tyre, sx * x, y, zBack);
  }
}

function lights(g: THREE.Group, width: number, yFront: number, zFront: number, zBack: number) {
  const geo = box(0.2, 0.1, 0.06);
  for (const sx of [-1, 1]) {
    part(g, geo, headlight, sx * width * 0.32, yFront, zFront);
    part(g, geo, taillight, sx * width * 0.32, yFront, zBack);
  }
}

// Returns a Group; userData.bodyMaterial is the one material made per car (dispose it when replacing)
export function makeCarMesh(shape: CarShape, color: number, theme: ThemeId): THREE.Group {
  const g = new THREE.Group();
  const cyber = theme === "cyberpunk";
  const body = new THREE.MeshStandardMaterial({
    color,
    roughness: cyber ? 0.3 : 0.55,
    metalness: cyber ? 0.5 : 0,
  });
  g.userData.bodyMaterial = body;

  if (shape === "sedan") {
    part(g, box(1, 0.36, 2), body, 0, -0.02, 0);
    part(g, box(0.82, 0.3, 1.05), glass, 0, 0.31, 0.12);
    part(g, box(0.86, 0.06, 1.0), body, 0, 0.48, 0.12); // roof
    wheels(g, 0.22, 0.16, 0.5, -0.65, 0.65);
    lights(g, 1, 0, -1.0, 1.0);
  } else if (shape === "truck") {
    part(g, box(1, 0.34, 2), body, 0, 0, 0);
    part(g, box(0.92, 0.4, 0.75), body, 0, 0.34, -0.5); // cab
    part(g, box(0.8, 0.18, 0.04), glass, 0, 0.42, -0.89); // windshield
    part(g, box(0.92, 0.16, 0.9), trim, 0, 0.25, 0.5); // bed
    wheels(g, 0.26, 0.2, 0.5, -0.65, 0.65);
    lights(g, 1, 0.03, -1.0, 1.0);
  } else {
    part(g, box(0.9, 0.2, 1.7), body, 0, -0.07, 0);
    part(g, box(0.5, 0.2, 0.4), trim, 0, 0.1, 0.1); // seat
    const bar = box(0.05, 0.42, 0.05);
    for (const sx of [-1, 1]) for (const sz of [-0.35, 0.5]) part(g, bar, trim, sx * 0.4, 0.2, sz);
    part(g, box(0.85, 0.05, 0.95), trim, 0, 0.43, 0.08); // roll cage roof
    part(g, box(1, 0.05, 0.28), body, 0, 0.3, 0.92); // wing
    wheels(g, 0.27, 0.22, 0.52, -0.62, 0.62);
    lights(g, 0.9, -0.02, -0.85, 0.85);
  }

  if (cyber) {
    // Glowing underlight in the car's own color
    const glow = new THREE.Mesh(box(0.92, 0.02, 1.8), new THREE.MeshBasicMaterial({ color }));
    glow.position.y = -0.235;
    g.add(glow);
    g.userData.glowMaterial = glow.material;
  }

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

export function disposeCarMesh(g: THREE.Group) {
  (g.userData.bodyMaterial as THREE.Material | undefined)?.dispose();
  (g.userData.glowMaterial as THREE.Material | undefined)?.dispose();
}
