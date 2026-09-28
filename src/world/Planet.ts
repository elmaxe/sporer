import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { RAPIER, type Physics } from '../physics/Physics';
import { orbitPosition, type Orbit } from './orbit';
import { terrainNoise } from './noise';

export interface PlanetStyle {
  /** Ocean colour, or null for no ocean (gas giants, barren rock). */
  sea: THREE.ColorRepresentation | null;
  low: THREE.ColorRepresentation;
  high: THREE.ColorRepresentation;
  /** Terrain height as a fraction of the radius. */
  relief: number;
}

export interface PlanetConfig {
  name: string;
  radius: number;
  seed: number;
  /** Radians per second around the planet's own axis. */
  spin: number;
  orbit: Orbit;
  style: PlanetStyle;
}

/**
 * A low-poly planet on a circular orbit. Its collider is a kinematic body
 * driven along the orbit each fixed step; the mesh is interpolated.
 */
export class Planet implements Entity {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly body: RAPIER.RigidBody;
  private time = 0;
  private readonly prev = new THREE.Vector3();
  private readonly curr = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    readonly config: PlanetConfig,
  ) {
    this.mesh = new THREE.Mesh(
      createPlanetGeometry(config.radius, config.seed, config.style),
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
    );
    this.mesh.name = config.name;

    orbitPosition(config.orbit, 0, this.curr);
    this.prev.copy(this.curr);
    this.mesh.position.copy(this.curr);
    scene.add(this.mesh);

    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.curr.x, this.curr.y, this.curr.z),
    );
    physics.world.createCollider(RAPIER.ColliderDesc.ball(config.radius), this.body);
  }

  fixedUpdate(dt: number): void {
    this.time += dt;
    this.prev.copy(this.curr);
    orbitPosition(this.config.orbit, this.time, this.curr);
    this.body.setNextKinematicTranslation(this.curr);
  }

  update(frameDt: number, alpha: number): void {
    this.mesh.position.lerpVectors(this.prev, this.curr, alpha);
    this.mesh.rotation.y += this.config.spin * frameDt;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.physics.world.removeRigidBody(this.body);
  }
}

/** Icosphere displaced by noise, with per-vertex colours and a flat ocean. */
function createPlanetGeometry(radius: number, seed: number, style: PlanetStyle): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, 5);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const dir = new THREE.Vector3();
  const color = new THREE.Color();
  const sea = style.sea === null ? null : new THREE.Color(style.sea);
  const low = new THREE.Color(style.low);
  const high = new THREE.Color(style.high);

  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i).normalize();
    const n = terrainNoise(dir.x, dir.y, dir.z, seed);
    const underwater = sea !== null && n < 0;
    const height = underwater ? 0 : n;

    // The geometry is non-indexed, but shared corners have identical positions
    // and therefore identical noise, so the surface stays watertight.
    dir.multiplyScalar(radius * (1 + style.relief * height));
    position.setXYZ(i, dir.x, dir.y, dir.z);

    if (underwater) color.copy(sea);
    else color.lerpColors(low, high, sea === null ? (n + 1) / 2 : n);
    color.toArray(colors, i * 3);
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
