import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { orbitPosition } from '../gen/orbit';
import { TERRAIN_DETAIL, type Planet } from '../world/Planet';
import { createTerrainGeometry } from '../world/planetGeometry';
import type { PlanetFrame } from './PlanetFrame';
import { planetParams } from './PlanetFrame';

const Y = new THREE.Vector3(0, 1, 0);

/**
 * The visited planet's own moons, as real meshes at planet-level scale on
 * their true orbits. Unlike the rest of the sky they can come closer than the
 * globe's far side, so they must be depth-sorted with it in the same scene.
 * Same low-poly look as in the system view, lit by the level's sunlight.
 */
export class LocalMoons implements Entity {
  private readonly meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  private readonly spin = new THREE.Quaternion();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly frame: PlanetFrame,
    readonly moons: readonly Planet[],
  ) {
    this.meshes = moons.map((moon) => {
      const { radius, seed, style } = moon.config;
      const mesh = new THREE.Mesh(
        createTerrainGeometry(radius * frame.scale, seed, style, { detail: TERRAIN_DETAIL }),
        new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
      );
      mesh.name = moon.name;
      scene.add(mesh);
      return mesh;
    });
    this.update();
  }

  update(): void {
    const { frame } = this;
    const time = frame.renderTime;
    for (let i = 0; i < this.moons.length; i++) {
      const { config } = this.moons[i]!;
      const mesh = this.meshes[i]!;
      // A moon's orbit is relative to its planet: rotate it into the body frame and scale it up.
      orbitPosition(config.orbit, time, mesh.position).applyQuaternion(frame.inverse).multiplyScalar(frame.scale);
      this.spin.setFromAxisAngle(Y, config.spin * planetParams.spinScale * time);
      mesh.quaternion.multiplyQuaternions(frame.inverse, this.spin);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
