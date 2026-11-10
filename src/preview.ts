import * as THREE from "three";
import { makeCarMesh, CAR_SHAPES } from "./render/carModels";
import { TireFx, type FxCar } from "./render/tireFx";
import { tirefx } from "./render/fxParams";

// Dev-only page (preview.html): the three retro cars on a dark floor, for checking their look.
// Query: ?angle=<degrees around the cars>&h=<camera height>&colors=ff1744,3d7bff,39ff14
const q = new URLSearchParams(location.search);
const angle = ((parseFloat(q.get("angle") ?? "35") || 0) * Math.PI) / 180;
const camH = parseFloat(q.get("h") ?? "1.6") || 1.6;
const dist = parseFloat(q.get("d") ?? "6.2") || 6.2;
const colors = (q.get("colors") ?? "ff2bd6,3d7bff,fff200").split(",").map((c) => parseInt(c, 16));

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.style.margin = "0";
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0a3a);
scene.add(new THREE.HemisphereLight(0x5a78ff, 0x1a1450, 0.9));
const sun = new THREE.DirectionalLight(0x9db4ff, 1.4);
sun.position.set(3, 6, 4);
scene.add(sun);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0x0b0418 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);
const grid = new THREE.GridHelper(30, 30, 0xd01cc8, 0x5a1a7a);
grid.position.y = 0.001;
scene.add(grid);

CAR_SHAPES.forEach((shape, i) => {
  const car = makeCarMesh(shape, colors[i % colors.length], "cyberpunk5");
  car.position.set((i - 1) * 2.4, 0.25, 0);
  if (!q.get("fx")) scene.add(car);
  else if (i === 0) scene.add(car);
});

// ?fx=1: a car drifts around a circle for a few seconds and the tire effects are drawn (neon=0 for rubber marks, sparks=1)
if (q.get("fx")) {
  tirefx.neonMarks = q.get("neon") !== "0";
  tirefx.sparks = q.get("sparks") === "1";
  const fx = new TireFx(scene);
  fx.setEnabled(true);
  const carMesh = scene.children.find((o) => o.position.y === 0.25) as THREE.Object3D;
  const vel = { x: 0, y: 0, z: 0 };
  const fake: FxCar = {
    mesh: carMesh,
    controller: { grounded: true, drifting: true, slip: 6, hardBraking: false },
    body: { linvel: () => vel },
    fallen: false,
    isPlayer: true,
    y: 0.25,
    carColor: colors[0],
  };
  const R = 5;
  const speed = 9;
  let a = 0;
  for (let step = 0; step < 150; step++) {
    a += (speed / R) / 60;
    carMesh.position.set(Math.sin(a) * R, 0.25, -Math.cos(a) * R + R);
    const yaw = -a - 0.5; // nose points along the circle, plus a sideways slide
    carMesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    vel.x = Math.cos(a) * speed;
    vel.z = Math.sin(a) * speed;
    fx.update(1 / 60, [fake], carMesh.position);
  }
}

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(Math.sin(angle) * dist, camH, Math.cos(angle) * dist);
camera.lookAt(0, 0.15, q.get('fx') ? 4 : 0);
renderer.render(scene, camera);
document.title = "ready";
