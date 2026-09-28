import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import type { Debug } from '../core/Debug';
import { RAPIER, type Physics } from '../physics/Physics';

/** Tunables, exposed in the debug panel. */
export const shipParams = {
  /** Impulse per second (the ship has mass 1). */
  thrust: 60,
  boostMultiplier: 2.5,
  /** Top speed ≈ thrust / linearDamping. */
  linearDamping: 1.2,
  mouseSensitivity: 0.0025,
};

const MAX_PITCH = THREE.MathUtils.degToRad(80);

/**
 * The player's UFO. A dynamic Rapier body with locked rotations: orientation
 * comes directly from mouse yaw/pitch, and movement is impulse-based, so it
 * still collides and bounces off planets.
 */
export class Ship implements Entity {
  /** Interpolated render transform; read this for cameras and UI. */
  readonly object = new THREE.Group();
  private readonly body: RAPIER.RigidBody;
  private readonly ring: THREE.Object3D;

  private yaw = 0;
  private pitch = 0;
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly prevRot = new THREE.Quaternion();
  private readonly currRot = new THREE.Quaternion();

  // Scratch objects, reused every step to avoid per-frame allocation.
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly rot = new THREE.Quaternion();
  private readonly move = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    private readonly input: Input,
    debug: Debug,
    spawn: THREE.Vector3,
  ) {
    const { group, ring } = buildUfoMesh();
    this.object.add(group);
    this.ring = ring;
    this.object.position.copy(spawn);
    scene.add(this.object);

    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .lockRotations()
        .setLinearDamping(shipParams.linearDamping)
        .setCcdEnabled(true),
    );
    physics.world.createCollider(RAPIER.ColliderDesc.ball(2).setMass(1).setRestitution(0.4), this.body);

    this.currPos.copy(spawn);
    this.prevPos.copy(spawn);

    const f = debug.folder('Ship');
    f?.add(shipParams, 'thrust', 0, 300);
    f?.add(shipParams, 'boostMultiplier', 1, 6);
    f?.add(shipParams, 'linearDamping', 0, 5).onChange((v: number) => this.body.setLinearDamping(v));
    f?.add(shipParams, 'mouseSensitivity', 0.0005, 0.01);
  }

  /** Current speed in units per second. */
  get speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  fixedUpdate(dt: number): void {
    const { input } = this;

    const mouse = input.consumeMouseDelta();
    this.yaw -= mouse.x * shipParams.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - mouse.y * shipParams.mouseSensitivity, -MAX_PITCH, MAX_PITCH);
    this.rot.setFromEuler(this.euler.set(this.pitch, this.yaw, 0));
    this.body.setRotation(this.rot, true);

    // Local axes: -Z forward, +X right, +Y up.
    this.move.set(input.axis('KeyA', 'KeyD'), input.axis('KeyQ', 'KeyE'), input.axis('KeyW', 'KeyS'));
    if (this.move.lengthSq() > 0) {
      const boost = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? shipParams.boostMultiplier : 1;
      this.move
        .normalize()
        .applyQuaternion(this.rot)
        .multiplyScalar(shipParams.thrust * boost * dt);
      this.body.applyImpulse(this.move, true);
    }
  }

  afterPhysics(): void {
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currRot.set(r.x, r.y, r.z, r.w);
  }

  update(frameDt: number, alpha: number): void {
    this.object.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.object.quaternion.slerpQuaternions(this.prevRot, this.currRot, alpha);
    this.ring.rotation.y += frameDt * 2;
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.physics.world.removeRigidBody(this.body);
  }
}

/** Classic flying saucer: a hull disc, a glass dome and a spinning light ring. */
function buildUfoMesh(): { group: THREE.Group; ring: THREE.Group } {
  const group = new THREE.Group();

  const hull = new THREE.Mesh(
    new THREE.SphereGeometry(2, 32, 16),
    // Low metalness: there is no environment map, so metal would render black.
    new THREE.MeshStandardMaterial({ color: '#b9c3cf', emissive: '#1c2533', metalness: 0.35, roughness: 0.45 }),
  );
  hull.scale.set(1, 0.28, 1);
  group.add(hull);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: '#7fd8ff',
      emissive: '#1a6f99',
      transparent: true,
      opacity: 0.85,
      roughness: 0.1,
    }),
  );
  dome.position.y = 0.35;
  group.add(dome);

  const ring = new THREE.Group();
  const lightGeometry = new THREE.SphereGeometry(0.16, 8, 6);
  const lightCount = 10;
  for (let i = 0; i < lightCount; i++) {
    const a = (i / lightCount) * Math.PI * 2;
    // Each light owns its material so dispose() can treat every mesh alike.
    const light = new THREE.Mesh(
      i === 0 ? lightGeometry : lightGeometry.clone(),
      new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffe066' : '#66ffcc' }),
    );
    light.position.set(Math.cos(a) * 1.95, 0, Math.sin(a) * 1.95);
    ring.add(light);
  }
  group.add(ring);

  return { group, ring };
}
