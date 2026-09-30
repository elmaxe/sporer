import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { atmosphereLook } from '../gen/atmosphere';
import { orbitPosition } from '../gen/orbit';
import { createAtmosphere } from '../world/atmosphereShell';
import { COARSE_VENT_RADIUS, TERRAIN_SEGMENTS, type Planet } from '../world/Planet';
import { createLavaLook, type LavaLook } from '../world/lavaMaterial';
import { createTerrainGeometry } from '../world/planetGeometry';
import type { PlanetFrame } from './PlanetFrame';
import { planetParams } from './PlanetFrame';

const Y = new THREE.Vector3(0, 1, 0);

/**
 * The visited planet's own moons, as real meshes at planet-level scale on
 * their true orbits. Unlike the rest of the sky they can come closer than the
 * globe's far side, so they must be depth-sorted with it in the same scene.
 * Same low-poly look as in the system view (atmosphere included), lit by the level's sunlight.
 */
export class LocalMoons implements Entity {
  private readonly meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
  /** The lava moons' animated seas, by moon (null for the rest). */
  private readonly lava: (LavaLook | null)[];
  private readonly spin = new THREE.Quaternion();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly frame: PlanetFrame,
    readonly moons: readonly Planet[],
    /** Unit direction to the (main) star, for the atmospheres. */
    sun: THREE.Vector3,
  ) {
    this.lava = moons.map((moon) => createLavaLook(moon.config, COARSE_VENT_RADIUS));
    this.meshes = moons.map((moon, i) => {
      const { radius, seed, style } = moon.config;
      const lava = this.lava[i] ?? null;
      const mesh = new THREE.Mesh(
        createTerrainGeometry(radius * frame.scale, seed, style, { segments: TERRAIN_SEGMENTS, seaFloor: lava !== null }),
        new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
      );
      if (lava) mesh.add(lava.createSeaSphere(radius * frame.scale));
      mesh.name = moon.name;
      const { atmosphere, climate } = moon.config;
      const look = atmosphere && climate ? atmosphereLook(climate, radius) : null;
      if (look) mesh.add(createAtmosphere(radius * frame.scale, atmosphere!, look, { vector: sun, point: false }));
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
      this.lava[i]?.animate(time);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
  }
}
