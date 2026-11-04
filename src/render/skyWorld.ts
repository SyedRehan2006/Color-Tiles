import * as THREE from "three";
import type { Look, ThemeId } from "./theme";

// Everything around the floating platform: gradient sky, stars, sun/moon, a sea of clouds below,
// theme props (candy: balloons, lollipops, donuts; cyberpunk: rings, billboards, drones, towers) and
// space objects (planets, asteroids) for both. Purely decoration: nothing here touches physics or tiles,
// and nothing is placed near the playing area, so tile colors stay the loudest thing on screen.
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

interface Floater {
  obj: THREE.Object3D;
  baseY: number;
  phase: number;
  bob: number; // m of up/down movement
  spinY: number; // rad/s
  spinX: number;
}

const CANDY_COLORS = [0xff6b8b, 0x4dabf7, 0xffe066, 0xb197fc, 0x69db7c, 0xffa94d];
const NEON_COLORS = [0x14f0ff, 0xff3df0, 0xfff23a, 0x1aff7a];

export class SkyWorld {
  readonly group = new THREE.Group();

  private domeColors: THREE.BufferAttribute;
  private domeGeo: THREE.SphereGeometry;
  private stars: THREE.Points;
  private body: THREE.Mesh;
  private bodyMat: THREE.MeshBasicMaterial;
  private clouds: THREE.InstancedMesh;
  private cloudMat: THREE.MeshLambertMaterial;
  private candy = new THREE.Group();
  private cyber = new THREE.Group();
  private space = new THREE.Group();
  private spaceMats: THREE.Material[] = [];
  private floaters: Floater[] = [];

  constructor(scene: THREE.Scene) {
    // Sky dome: a big inside-out sphere painted with a vertical gradient (colors set in apply())
    this.domeGeo = new THREE.SphereGeometry(900, 24, 16);
    this.domeColors = new THREE.BufferAttribute(new Float32Array(this.domeGeo.attributes.position.count * 3), 3);
    this.domeGeo.setAttribute("color", this.domeColors);
    const dome = new THREE.Mesh(
      this.domeGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    dome.renderOrder = -1000;
    this.group.add(dome);

    // Stars (night only)
    const starPos = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const y = rand(-0.15, 1);
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(1 - Math.min(1, y * y));
      starPos.set([Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, depthWrite: false }),
    );
    this.stars.renderOrder = -999;
    this.group.add(this.stars);

    // Sun / moon
    this.bodyMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.body = new THREE.Mesh(new THREE.SphereGeometry(45, 24, 16), this.bodyMat);
    this.body.position.set(-300, 260, -650);
    this.group.add(this.body);

    // Cloud sea: puffs mostly far below the platform, a few high ones
    const puffs: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let c = 0; c < 46; c++) {
      const high = c % 4 === 0;
      const ang = rand(0, Math.PI * 2);
      const rad = high ? rand(150, 320) : rand(60, 300);
      const cx = Math.cos(ang) * rad;
      const cz = Math.sin(ang) * rad;
      const cy = high ? rand(25, 60) : rand(-85, -45);
      for (let p = 0; p < 5; p++) {
        const s = rand(8, 17);
        m.compose(
          new THREE.Vector3(cx + rand(-11, 11), cy + rand(-2, 2), cz + rand(-11, 11)),
          q,
          new THREE.Vector3(s, s * 0.5, s),
        );
        puffs.push(m.clone());
      }
    }
    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), this.cloudMat, puffs.length);
    puffs.forEach((mat, i) => this.clouds.setMatrixAt(i, mat));
    this.group.add(this.clouds);

    this.buildCandy();
    this.buildCyber();
    this.buildSpace();
    this.group.add(this.candy, this.cyber, this.space);
    scene.add(this.group);
  }

  // Put a prop at a random spot around the platform, well outside the playing area
  private place(obj: THREE.Object3D, parent: THREE.Group, minR: number, maxR: number, minY: number, maxY: number, bob = 1.5, spinY = 0, spinX = 0) {
    const ang = rand(0, Math.PI * 2);
    const rad = rand(minR, maxR);
    const y = rand(minY, maxY);
    obj.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
    parent.add(obj);
    this.floaters.push({ obj, baseY: y, phase: rand(0, 6.28), bob, spinY, spinX });
  }

  private buildCandy() {
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const col = pick(CANDY_COLORS);
      const balloon = new THREE.Mesh(
        new THREE.SphereGeometry(3, 14, 12).scale(1, 1.2, 1),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 }),
      );
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 7, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      string.position.y = -6.5;
      g.add(balloon, string);
      this.place(g, this.candy, 90, 230, -15, 55, 2);
    }
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(4.5, 4.5, 1, 20).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: pick(CANDY_COLORS), roughness: 0.35 }),
      );
      disc.position.y = 8;
      g.add(stick, disc);
      g.rotation.z = rand(-0.5, 0.5);
      this.place(g, this.candy, 110, 240, -20, 45, 1.2, 0.3);
    }
    for (let i = 0; i < 9; i++) {
      const donut = new THREE.Mesh(
        new THREE.TorusGeometry(4.5, 1.8, 10, 22),
        new THREE.MeshStandardMaterial({ color: pick([0xff8fcb, 0xc98b5e, 0xfff0a8]), roughness: 0.5 }),
      );
      donut.rotation.x = rand(0.4, 1.2);
      this.place(donut, this.candy, 100, 250, -10, 60, 1.5, 0.4, 0.1);
    }
  }

  private buildCyber() {
    for (let i = 0; i < 12; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.4, 8, 36), new THREE.MeshBasicMaterial({ color: pick(NEON_COLORS) }));
      ring.rotation.x = rand(0, 3);
      this.place(ring, this.cyber, 100, 240, -15, 60, 2, 0.5, 0.3);
    }
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      g.add(
        new THREE.Mesh(new THREE.BoxGeometry(17, 10, 0.8), new THREE.MeshStandardMaterial({ color: 0x14102a })),
        new THREE.Mesh(new THREE.PlaneGeometry(15.5, 8.5), new THREE.MeshBasicMaterial({ color: pick(NEON_COLORS) })),
      );
      g.children[1].position.z = 0.45;
      g.rotation.y = rand(0, Math.PI * 2);
      this.place(g, this.cyber, 110, 250, -10, 50, 1.2, 0.05);
    }
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      g.add(
        new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 2), new THREE.MeshStandardMaterial({ color: 0x20203a })),
        new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.6), new THREE.MeshBasicMaterial({ color: pick(NEON_COLORS) })),
      );
      g.children[1].position.y = -0.4;
      this.place(g, this.cyber, 80, 200, -5, 40, 1.5, 1.2);
    }
    // Towers poking up through the cloud sea, far away
    const tower = new THREE.MeshLambertMaterial({ color: 0x1b1038 });
    for (let i = 0; i < 16; i++) {
      const h = rand(70, 150);
      const w = rand(10, 20);
      const g = new THREE.Group();
      g.add(
        new THREE.Mesh(new THREE.BoxGeometry(w, h, w), tower),
        new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, 1.2, w * 1.05), new THREE.MeshBasicMaterial({ color: pick(NEON_COLORS) })),
      );
      g.children[1].position.y = h / 2;
      const ang = rand(0, Math.PI * 2);
      const rad = rand(190, 330);
      g.position.set(Math.cos(ang) * rad, -105 + h / 2, Math.sin(ang) * rad);
      this.cyber.add(g);
    }
  }

  private buildSpace() {
    const mat = (color: number) => {
      const m = new THREE.MeshLambertMaterial({ color, transparent: true, fog: false });
      this.spaceMats.push(m);
      return m;
    };
    const planet = (r: number, color: number, x: number, y: number, z: number, ring: number | null) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(color)));
      if (ring !== null) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(r * 1.6, r * 0.12, 3, 48), mat(ring));
        t.rotation.x = Math.PI / 2.3;
        t.scale.z = 0.25;
        g.add(t);
      }
      g.position.set(x, y, z);
      this.space.add(g);
      this.floaters.push({ obj: g, baseY: y, phase: rand(0, 6), bob: 0, spinY: 0.02, spinX: 0 });
    };
    planet(70, 0xff9ecb, -420, 190, -320, 0xffe3a3);
    planet(28, 0x58d6c9, 390, 130, -360, null);
    planet(40, 0x8a7bff, 120, 230, 520, 0xcbb8ff);
    const rock = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 22; i++) {
      const a = new THREE.Mesh(rock, mat(0x8b8fa8));
      a.scale.set(rand(4, 10), rand(3, 8), rand(4, 10));
      this.place(a, this.space, 260, 430, -30, 170, 4, rand(-0.3, 0.3), rand(-0.2, 0.2));
    }
  }

  // Recolor for a theme + time of day (call whenever either changes)
  apply(theme: ThemeId, look: Look) {
    // Gradient: bottom (skyBelow) -> horizon -> top (skyTop)
    const pos = this.domeGeo.attributes.position;
    const top = new THREE.Color(look.skyTop);
    const hor = new THREE.Color(look.skyHorizon);
    const below = new THREE.Color(look.skyBelow);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / 900; // -1..1
      if (t >= 0) c.copy(hor).lerp(top, Math.pow(t, 0.55));
      else c.copy(hor).lerp(below, Math.min(1, -t * 2.5));
      this.domeColors.setXYZ(i, c.r, c.g, c.b);
    }
    this.domeColors.needsUpdate = true;

    this.stars.visible = look.stars;
    this.bodyMat.color.setHex(look.bodyColor);
    this.cloudMat.color.setHex(look.cloudColor);
    this.candy.visible = theme === "candy";
    this.cyber.visible = theme === "cyberpunk";
    for (const m of this.spaceMats) m.opacity = look.spaceOpacity;
  }

  // Once per rendered frame: clouds drift, props bob and spin
  update(dt: number, time: number) {
    this.clouds.rotation.y += dt * 0.004;
    for (const f of this.floaters) {
      f.obj.position.y = f.baseY + Math.sin(time * 0.6 + f.phase) * f.bob;
      f.obj.rotation.y += f.spinY * dt;
      f.obj.rotation.x += f.spinX * dt;
    }
  }
}
