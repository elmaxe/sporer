import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { detailedTerrain } from '../gen/noise';
import { isGas, type PlanetConfig } from '../world/Planet';
import {
  createAtmosphere,
  createGasGeometry,
  createRings,
  createTerrainGeometry,
  peakRadius,
} from '../world/planetGeometry';
import { PLANET_SCALE, globeDetail, globeRadius } from './frame';

/** Gas giants are smooth-shaded, so their bands need less detail than terrain as they grow. */
const GAS_DETAIL = 64;
/** Mountains are exaggerated a little up close, where the system view's relief reads as flat. */
export const RELIEF_SCALE = 1.6;
/** Atmosphere shell radius: low, so the camera (above the ship) always sees it from outside. */
const ATMOSPHERE_SCALE = 1.08;

/**
 * The visited planet or moon, at its true size (see globeRadius) and detailed: the
 * terrain from the same noise as the system view plus finer octaves, a sea
 * surface for worlds with liquid, rings and the atmosphere glow. Gas giants
 * are the same banded sphere as in the system view, only finer. Static in the
 * planet level's body frame.
 */
export class PlanetGlobe implements Entity {
  readonly object = new THREE.Group();
  /** Sea-level (or cloud-top) radius. */
  readonly radius: number;
  /** Radius of the highest terrain (or cloud tops): the ship hovers above this. */
  readonly top: number;
  /** Unit direction to the (main) star; the atmosphere reads it to dim its night side. */
  readonly sun = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly scene: THREE.Scene,
    config: PlanetConfig,
  ) {
    const { seed, style } = config;
    const R = (this.radius = globeRadius(config.radius));
    const gas = isGas(config);
    this.top = gas ? R : peakRadius(R, style, RELIEF_SCALE);
    const seaFloor = !gas && style.sea !== null;

    const surface = new THREE.Mesh(
      gas
        ? createGasGeometry(R, seed, config.bands, GAS_DETAIL, true)
        : createTerrainGeometry(R, seed, style, {
            // Earth-sized: 20·61² ≈ 74k triangles.
            detail: globeDetail(R),
            noise: detailedTerrain,
            reliefScale: RELIEF_SCALE,
            seaFloor,
          }),
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: !gas, roughness: 0.9 }),
    );
    surface.name = 'Surface';
    this.object.add(surface);
    if (seaFloor) this.object.add(createSea(config.type, style.sea!, R));
    if (config.rings) this.object.add(createRings(config.rings, seed, PLANET_SCALE));
    if (config.atmosphere) {
      this.object.add(
        createAtmosphere(R, style.relief * RELIEF_SCALE, config.atmosphere, ATMOSPHERE_SCALE, 128, this.sun),
      );
    }
    scene.add(this.object);
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}

/**
 * A smooth sphere at sea level: glossy water, glowing lava, matte ice. Opaque:
 * the sky is drawn first, so see-through water would show stars through the planet.
 */
function createSea(type: PlanetConfig['type'], color: string, radius: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 160, 80);
  let material: THREE.MeshStandardMaterial;
  if (type === 'lava') {
    material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.7 });
  } else if (type === 'ice') {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  } else {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.25 });
  }
  const sea = new THREE.Mesh(geometry, material);
  sea.name = 'Sea';
  return sea;
}
