import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { CarController } from "./carController";
import type { BotBrain } from "./bot";
import type { TileGrid } from "./tileGrid";
import { disposeCarMesh, makeCarMesh, type CarShape } from "../render/carModels";
import type { ThemeId } from "../render/theme";

// Cars are group 2 and only hit group 1 (future walls/obstacles), so cars pass through each other.
const GROUP_CAR = 0x00020001;
const RESPAWN_HEIGHT = 8; // m: a car drops from the sky onto its tile

// One car in the match, the player's or a bot's: its physics body, its look, and its own lives and
// fall state. (With multiplayer this becomes the server's per-player record.)
export class Racer {
  readonly isPlayer: boolean;
  readonly brain: BotBrain | null;
  readonly mesh = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly controller: CarController;
  lives: number;
  eliminated = false; // out of lives for good
  fallen = false; // fell off; waiting to drop back in (or eliminated)
  respawnDelay = 0; // s until a car that fell during the roam drops back in

  // Render interpolation: drawn between the previous and current physics state
  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();
  private prevQuat = new THREE.Quaternion();
  private currQuat = new THREE.Quaternion();
  private teleported = false;

  private color: number;
  private world: RAPIER.World;
  private scene: THREE.Scene;
  private maxLives: number;

  constructor(
    world: RAPIER.World,
    scene: THREE.Scene,
    grid: TileGrid,
    color: number,
    brain: BotBrain | null,
    maxLives: number,
  ) {
    this.world = world;
    this.scene = scene;
    this.brain = brain;
    this.isPlayer = brain === null;
    this.maxLives = maxLives;
    this.lives = maxLives;

    // Visual: the car faces -Z (headlights at the front). Shape and theme can change later via setLook().
    this.color = color;
    this.setLook("sedan", "candy");
    scene.add(this.mesh);

    // Physics: only yaw (turning) is free; no pitch or roll, so it never tips over
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, RESPAWN_HEIGHT, 0)
        .enabledRotations(false, true, false)
        .setCanSleep(false), // a sleeping car would ignore gravity when its tile vanishes
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.5, 0.25, 1) // half-extents: 1 x 0.5 x 2 m
        .setFriction(0) // we do the grip ourselves
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setCollisionGroups(GROUP_CAR),
      this.body,
    );
    this.controller = new CarController(this.body, grid);
  }

  // Swap the car model (shape + theme style), keeping this car's color
  setLook(shape: CarShape, theme: ThemeId) {
    for (const child of [...this.mesh.children]) {
      this.mesh.remove(child);
      disposeCarMesh(child as THREE.Group);
    }
    this.mesh.add(makeCarMesh(shape, this.color, theme));
  }

  get x() {
    return this.body.translation().x;
  }
  get z() {
    return this.body.translation().z;
  }
  get y() {
    return this.body.translation().y;
  }
  // Heading in radians (0 = facing -Z). The car only rotates around Y.
  get yaw() {
    const q = this.body.rotation();
    return 2 * Math.atan2(q.y, q.w);
  }

  // Drop the car from the sky onto a tile, facing the middle of the platform
  respawnAt(x: number, z: number) {
    const yaw = Math.hypot(x, z) > 0.5 ? Math.atan2(x, z) : 0;
    this.body.setEnabled(true);
    this.body.setTranslation({ x, y: RESPAWN_HEIGHT, z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.mesh.visible = true;
    this.fallen = false;
    this.respawnDelay = 0;
    this.teleported = true;
  }

  // The car went off the platform: hide it until it drops back in
  markFallen() {
    this.fallen = true;
    this.body.setEnabled(false);
    this.mesh.visible = false;
  }

  eliminate() {
    this.eliminated = true;
    this.markFallen();
  }

  // New match: full lives, back in the game
  reset() {
    this.lives = this.maxLives;
    this.eliminated = false;
  }

  // Call at the start of every physics tick, before moving anything
  beginTick() {
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
  }

  // Call at the end of every physics tick
  endTick() {
    this.currPos.copy(this.body.translation());
    this.currQuat.copy(this.body.rotation());
    if (this.teleported) {
      // Don't smear a respawn jump across the screen
      this.prevPos.copy(this.currPos);
      this.prevQuat.copy(this.currQuat);
      this.teleported = false;
    }
  }

  // Place the mesh part-way between the last two physics states
  render(alpha: number) {
    this.mesh.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.mesh.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
  }

  dispose() {
    this.world.removeRigidBody(this.body);
    this.scene.remove(this.mesh);
  }
}
