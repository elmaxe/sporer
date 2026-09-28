import * as THREE from 'three';
import type { Entity } from '../core/Entity';

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
    for (let i = 0; i < STAR_COUNT; i++) {
      v.randomDirection().multiplyScalar(SKY_RADIUS);
      v.toArray(positions, i * 3);
      // Mostly white, with some warm and some cool stars of varying brightness.
      c.setHSL(Math.random() < 0.5 ? 0.6 : 0.08, Math.random() * 0.5, 0.5 + Math.random() * 0.5);
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
    this.points.position.copy(this.camera.position);
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
