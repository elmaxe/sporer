import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { hashSeed, Rng } from '../gen/rng';

const STAR_COUNT = 6000;
const SKY_RADIUS = 9000;

/** Distant background stars, recentred on the camera so they act as a skybox. */
export class Starfield implements Entity {
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const v = new THREE.Vector3();
    const c = new THREE.Color();
    const rng = new Rng(hashSeed('starfield'));
    for (let i = 0; i < STAR_COUNT; i++) {
      randomDirection(rng, v).multiplyScalar(SKY_RADIUS);
      v.toArray(positions, i * 3);
      // Mostly white, with some warm and some cool stars of varying brightness.
      c.setHSL(rng.next() < 0.5 ? 0.6 : 0.08, rng.next() * 0.5, 0.5 + rng.next() * 0.5);
      c.toArray(colors, i * 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
    scene.add(this.points);
  }

  update(): void {
    this.centerOn(this.camera.position);
  }

  /** Recentres the sky on `position` (for rendering the scene from another camera). */
  centerOn(position: THREE.Vector3): void {
    this.points.position.copy(position);
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

/** Uniform random unit vector (seeded version of Vector3.randomDirection). */
function randomDirection(rng: Rng, out: THREE.Vector3): THREE.Vector3 {
  const z = rng.range(-1, 1);
  const t = rng.range(0, Math.PI * 2);
  const r = Math.sqrt(1 - z * z);
  return out.set(r * Math.cos(t), r * Math.sin(t), z);
}
