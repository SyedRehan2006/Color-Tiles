import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Retro-futuristic JDM cars for the neon themes, built in code (no model files, so no download).
// Each body is a side profile pulled out sideways (with a small bevel), with real wheel arches cut into
// the profile, a dark glass greenhouse, a roof panel, spoked wheels, lights and a glowing sill stripe.
// Paint is two-tone: the car's color on top, a shifted version below. Thin glowing edge lines trace the
// shapes, like the mountains in the scenery.
// Like carModels.ts: the car faces -Z, the origin is the collider's center (1 x 0.5 x 2 m), the floor is y = -0.25.
export type RetroKind = "hatch" | "wedge" | "fastback";

// Profile coordinates: x runs along the car (+1 = nose, -1 = tail), y is height. In 3D, z = -x.
type Pt = [number, number];

interface Spec {
  top: Pt[]; // upper outline of the lower body, nose to tail (the bottom is added, with the arches)
  cabin: Pt[]; // the greenhouse outline: front base, front top, rear top, rear base
}

const WHEEL_R = 0.2;
const WHEEL_W = 0.22;
const WHEEL_X = 0.43; // sideways offset of the wheel centers
const WHEEL_Z = 0.62; // wheel centers sit at x = +-0.62 along the car
const BODY_BOTTOM = -0.15;
const WHEEL_Y = -0.25 + WHEEL_R;
const ARCH_R = 0.25;
const BODY_W = 0.9; // pulled-out width (plus bevel)
const CABIN_W = 0.8;

const SPECS: Record<RetroKind, Spec> = {
  // 80s hatchback coupe: short nose, long sloping rear window
  hatch: {
    top: [[1, 0.1], [0.96, 0.2], [0.88, 0.25], [0.45, 0.28], [-0.3, 0.29], [-0.8, 0.29], [-0.97, 0.25], [-1, 0.1]],
    cabin: [[0.42, 0.28], [0.1, 0.56], [-0.52, 0.56], [-0.9, 0.28]],
  },
  // Wedge: low pointed nose, rising to a high tail with a big wing
  wedge: {
    top: [[1, 0.02], [0.97, 0.12], [0.88, 0.2], [0.45, 0.26], [0, 0.3], [-0.6, 0.33], [-0.97, 0.36], [-1, 0.2]],
    cabin: [[0.4, 0.27], [-0.02, 0.57], [-0.5, 0.59], [-0.92, 0.35]],
  },
  // Fastback coupe: long hood, cabin set back, sloping roof to the tail
  fastback: {
    top: [[1, 0.08], [0.96, 0.18], [0.9, 0.24], [0.3, 0.28], [-0.2, 0.29], [-0.8, 0.3], [-0.96, 0.32], [-1, 0.18]],
    cabin: [[0.28, 0.28], [-0.06, 0.55], [-0.38, 0.57], [-0.88, 0.3]],
  },
};

// Shared parts (built once, never disposed)
const glassMat = new THREE.MeshStandardMaterial({ color: 0x1b1650, roughness: 0.1, metalness: 0.6, emissive: 0x1a1450 });
const tyreMat = new THREE.MeshStandardMaterial({ color: 0x15141c, roughness: 0.9 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xd6ccff, roughness: 0.3, metalness: 0.5, emissive: 0x2a2060 });
const dishMat = new THREE.MeshStandardMaterial({ color: 0x14121f, roughness: 0.6 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1830, roughness: 0.6, metalness: 0.2 });
const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d0).multiplyScalar(1.5) });
const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1030).multiplyScalar(1.7) });

let wheelGeo: THREE.BufferGeometry | null = null;
function getWheelGeo() {
  if (wheelGeo) return wheelGeo;
  const r = WHEEL_R;
  const w = WHEEL_W;
  const tire = new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(r * 0.78, r * 0.78, w + 0.01, 18).rotateZ(Math.PI / 2);
  const dish = new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 18).rotateZ(Math.PI / 2);
  const spokes: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    spokes.push(new THREE.BoxGeometry(w + 0.03, r * 0.62, 0.045).translate(0, r * 0.31, 0).rotateX((k * Math.PI * 2) / 5));
  }
  // Groups follow the order given: tire, rim, dish, spokes (materials are listed in the same order)
  wheelGeo = mergeGeometries([tire, rim, dish, mergeGeometries(spokes, false)], true);
  return wheelGeo;
}
const wheelMats = [tyreMat, rimMat, dishMat, rimMat];

interface ShapeGeos {
  body: THREE.BufferGeometry;
  cabin: THREE.BufferGeometry; // painted greenhouse
  windows: THREE.BufferGeometry; // dark glass: side windows, windshield and rear window
  bodyEdges: THREE.BufferGeometry;
  cabinEdges: THREE.BufferGeometry;
}
const geoCache = new Map<RetroKind, ShapeGeos>();

// Pull a side-view shape out sideways, centered, and turn it so the nose points to -Z
function extrudeSide(shape: THREE.Shape, width: number, bevel: number) {
  const depth = Math.max(0.01, width - 2 * bevel);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

function buildGeos(kind: RetroKind): ShapeGeos {
  const s = SPECS[kind];

  // Lower body: nose bottom, up the nose, along the top, down the tail, then back along the bottom
  // with an arch over each wheel
  const body = new THREE.Shape();
  const xNose = s.top[0][0];
  const xTail = s.top[s.top.length - 1][0];
  body.moveTo(xNose, BODY_BOTTOM);
  for (const [x, y] of s.top) body.lineTo(x, y);
  body.lineTo(xTail, BODY_BOTTOM);
  const dy = BODY_BOTTOM - WHEEL_Y;
  const dx = Math.sqrt(ARCH_R * ARCH_R - dy * dy);
  const aStart = Math.atan2(dy, -dx);
  const aEnd = Math.atan2(dy, dx);
  for (const wx of [-WHEEL_Z, WHEEL_Z]) {
    body.lineTo(wx - dx, BODY_BOTTOM);
    body.absarc(wx, WHEEL_Y, ARCH_R, aStart, aEnd, true); // clockwise: over the top of the wheel
  }
  body.lineTo(xNose, BODY_BOTTOM);

  const cabin = new THREE.Shape(s.cabin.map(([x, y]) => new THREE.Vector2(x, y)));

  // Side windows: the cabin outline shrunk toward its middle, pulled out a hair wider than the paint
  const cx = s.cabin.reduce((a, p) => a + p[0], 0) / s.cabin.length;
  const cy = s.cabin.reduce((a, p) => a + p[1], 0) / s.cabin.length;
  const win = new THREE.Shape(s.cabin.map(([x, y]) => new THREE.Vector2(cx + (x - cx) * 0.84, cy + (y - cy) * 0.72)));
  const parts: THREE.BufferGeometry[] = [extrudeSide(win, CABIN_W + 0.02, 0.004)];
  // Windshield and rear window: thin panes lying on the sloped faces
  for (const [a, b] of [[s.cabin[0], s.cabin[1]], [s.cabin[2], s.cabin[3]]] as [Pt, Pt][]) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(-dy, -dx);
    const pane = new THREE.BoxGeometry(CABIN_W * 0.88, 0.014, len * 0.86).toNonIndexed();
    pane.rotateX(ang);
    pane.translate(0, (a[1] + b[1]) / 2 + Math.cos(ang) * 0.008, -(a[0] + b[0]) / 2 + Math.sin(ang) * 0.008);
    parts.push(pane);
  }

  const g: ShapeGeos = {
    body: extrudeSide(body, BODY_W, 0.03),
    cabin: extrudeSide(cabin, CABIN_W, 0.012),
    windows: mergeGeometries(parts, false),
    bodyEdges: new THREE.BufferGeometry(),
    cabinEdges: new THREE.BufferGeometry(),
  };
  g.bodyEdges = new THREE.EdgesGeometry(g.body, 35);
  g.cabinEdges = new THREE.EdgesGeometry(g.cabin, 35);
  return g;
}

// Two-tone paint: `upper` above the split line (just above the sill), `lower` below it
function paintMaterial(upper: THREE.Color, lower: THREE.Color) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.15 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uUpper = { value: upper };
    shader.uniforms.uLower = { value: lower };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vPaintY;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPaintY = position.y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vPaintY;\nuniform vec3 uUpper;\nuniform vec3 uLower;")
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = mix(uLower, uUpper, smoothstep(0.02, 0.08, vPaintY));")
      // A little self-glow so the paint stays rich in the dark scenes
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.3;");
  };
  return m;
}

function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

// Returns a Group like makeCarMesh. userData.disposables: materials made for this car (dispose when replacing)
export function makeRetroCar(kind: RetroKind, color: number): THREE.Group {
  let geos = geoCache.get(kind);
  if (!geos) {
    geos = buildGeos(kind);
    geoCache.set(kind, geos);
  }
  const g = new THREE.Group();
  const upper = new THREE.Color(color);
  const lower = upper.clone().lerp(new THREE.Color(0x6a2bd0), 0.5).multiplyScalar(0.8); // pulled toward violet, a bit darker
  const accent = upper.clone().lerp(new THREE.Color(1, 1, 1), 0.45).multiplyScalar(1.6); // glowing lines
  const paint = paintMaterial(upper, lower);
  const lineMat = new THREE.LineBasicMaterial({ color: accent });
  const stripeMat = new THREE.MeshBasicMaterial({ color: accent });
  const glowMat = new THREE.MeshBasicMaterial({ color: upper.clone().multiplyScalar(1.5) });
  g.userData.disposables = [paint, lineMat, stripeMat, glowMat];

  const s = SPECS[kind];
  mesh(g, geos.body, paint, 0, 0, 0);
  mesh(g, geos.cabin, paint, 0, 0, 0);
  mesh(g, geos.windows, glassMat, 0, 0, 0);
  for (const e of [geos.bodyEdges, geos.cabinEdges]) {
    const lines = new THREE.LineSegments(e, lineMat);
    g.add(lines);
  }

  // Wheels
  const wg = getWheelGeo();
  for (const sx of [-1, 1]) for (const z of [-WHEEL_Z, WHEEL_Z]) mesh(g, wg, wheelMats, sx * WHEEL_X, WHEEL_Y, z);

  // Glowing stripe along the paint split, between the wheels
  for (const sx of [-1, 1]) mesh(g, box(0.02, 0.022, 0.62), stripeMat, sx * 0.455, 0.05, 0);

  // Mirrors
  const mirrorZ = -(s.cabin[0][0] - 0.06);
  for (const sx of [-1, 1]) mesh(g, box(0.08, 0.06, 0.1), paint, sx * 0.47, 0.34, mirrorZ);

  // Lights, tail bar, exhausts
  const noseY = s.top[0][1] + 0.05;
  const tailY = s.top[s.top.length - 1][1] + 0.05;
  if (kind === "fastback") {
    for (const sx of [-1, 1]) {
      mesh(g, new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12).rotateX(Math.PI / 2), headMat, sx * 0.3, noseY + 0.03, -1.0);
      mesh(g, box(0.2, 0.09, 0.04), tailMat, sx * 0.3, tailY, 1.0);
    }
  } else {
    for (const sx of [-1, 1]) mesh(g, box(0.28, 0.06, 0.05), headMat, sx * 0.28, noseY + 0.02, -0.99);
    mesh(g, box(0.82, 0.07, 0.04), tailMat, 0, tailY, 0.99); // light bar across the tail
  }
  const exhaust = new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8).rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) mesh(g, exhaust, trimMat, sx * 0.25, -0.1, 1.03);

  // Extras per car
  if (kind === "wedge") {
    // Big rear wing on two struts, with end plates
    mesh(g, box(1.0, 0.03, 0.3), paint, 0, 0.62, 0.9);
    for (const sx of [-1, 1]) {
      mesh(g, box(0.03, 0.14, 0.32), paint, sx * 0.5, 0.58, 0.9);
      mesh(g, box(0.03, 0.26, 0.08), trimMat, sx * 0.25, 0.48, 0.92);
    }
  } else if (kind === "fastback") {
    mesh(g, box(0.28, 0.05, 0.36), trimMat, 0, 0.31, -0.62); // hood scoop
    mesh(g, box(0.88, 0.04, 0.2), paint, 0, 0.37, 0.9); // ducktail
  } else {
    mesh(g, box(0.7, 0.03, 0.1), trimMat, 0, 0.3, 0.88); // small rear lip
  }
  mesh(g, box(0.9, 0.03, 0.12), trimMat, 0, -0.14, -1.0); // front splitter

  // Underglow in the car's color
  mesh(g, box(0.9, 0.02, 1.8), glowMat, 0, -0.235, 0);

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}
