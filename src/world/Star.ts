import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { orbitPosition } from '../gen/orbit';
import type { SystemStar } from '../gen/system';
import { RAPIER, type Physics } from '../physics/Physics';

/**
 * A star: glowing sphere, additive glow sprite, point light and collider.
 * In binaries it orbits the barycentre (kinematic body); otherwise it is fixed.
 */
export class Star implements Entity {
  readonly object = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly glow: THREE.Sprite;
  private readonly light: THREE.PointLight;
  private readonly body: RAPIER.RigidBody;
  private readonly orbiting: boolean;
  private time = 0;
  private readonly prev = new THREE.Vector3();
  private readonly curr = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    readonly data: SystemStar,
    glowTexture: THREE.Texture,
  ) {
    this.orbiting = data.orbit.radius > 0;

    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(data.radius, 48, 24),
      new THREE.MeshBasicMaterial({ color: data.color }),
    );
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: data.color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    // Dim stars get a relatively larger halo so white dwarfs still read as stars.
    this.glow.scale.setScalar(data.radius * (data.radius < 12 ? 9 : 6));

    // decay 0 keeps intensity constant with distance, so outer planets stay lit.
    const intensity = THREE.MathUtils.clamp(1.2 + Math.log2(1 + data.luminosity), 1.2, 5);
    this.light = new THREE.PointLight(data.color, intensity, 0, 0);

    this.object.name = `Star (${data.kind})`;
    this.object.add(this.mesh, this.glow, this.light);
    orbitPosition(data.orbit, 0, this.curr);
    this.prev.copy(this.curr);
    this.object.position.copy(this.curr);
    scene.add(this.object);

    const desc = this.orbiting ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed();
    this.body = physics.world.createRigidBody(desc.setTranslation(this.curr.x, this.curr.y, this.curr.z));
    physics.world.createCollider(RAPIER.ColliderDesc.ball(data.radius), this.body);
  }

  fixedUpdate(dt: number): void {
    if (!this.orbiting) return;
    this.time += dt;
    this.prev.copy(this.curr);
    orbitPosition(this.data.orbit, this.time, this.curr);
    this.body.setNextKinematicTranslation(this.curr);
  }

  update(_frameDt: number, alpha: number): void {
    if (this.orbiting) this.object.position.lerpVectors(this.prev, this.curr, alpha);
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.glow.material.dispose(); // the glow texture is shared; its owner disposes it
    this.light.dispose();
    this.physics.world.removeRigidBody(this.body);
  }
}
