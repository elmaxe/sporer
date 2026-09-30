import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { detailedTerrain } from '../gen/noise';
import { isGas, type PlanetConfig } from '../world/Planet';
import { atmosphereLook } from '../gen/atmosphere';
import { createAtmosphere } from '../world/atmosphereShell';
import { SEA_RENDER_ORDER, createLavaLook, type LavaLook } from '../world/lavaMaterial';
import {
  createGasGeometry,
  createRings,
  createTerrainGeometry,
  peakRadius,
} from '../world/planetGeometry';
import { createWeatherLook, type WeatherLook } from '../world/weatherLook';
import { PLANET_SCALE, RELIEF_SCALE, globeDetail, globeRadius } from './frame';
import type { RenderClock } from './PlanetFrame';

export { RELIEF_SCALE };

/** Gas giants are smooth-shaded, so their bands need less detail than terrain as they grow. */
const GAS_DETAIL = 64;
/** A vent's glow on the lava sea, radians. */
const VENT_RADIUS = 0.05;

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
  /** Unit direction to the (main) star; the atmospheres read it for their day and night sides. */
  readonly sun = new THREE.Vector3(0, 1, 0);
  /** The sun's light (colour × intensity) and the ambient light, for the lava's crust (set by PlanetLights). */
  readonly sunLight = new THREE.Color(1, 1, 1);
  readonly ambientLight = new THREE.Color(0, 0, 0);
  /** Lava worlds and moons: the animated sea and its eruptions' schedule. */
  readonly lava: LavaLook | null;
  /** Bodies with weather: the cloud layer's look, its storms and lightning (planet/Weather.ts draws the rain and bolts). */
  readonly weather: WeatherLook | null;

  constructor(
    private readonly scene: THREE.Scene,
    config: PlanetConfig,
    private readonly frame: RenderClock,
  ) {
    const { seed, style } = config;
    const R = (this.radius = globeRadius(config.radius));
    const gas = isGas(config);
    this.top = gas ? R : peakRadius(R, style, RELIEF_SCALE);
    const seaFloor = !gas && style.sea !== null;
    this.lava = gas ? null : createLavaLook(config, VENT_RADIUS);

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
    if (seaFloor) this.object.add(createSea(config.type, style.sea!, R, this.lava ? this.lava.createSeaMaterial(this.sun, this.sunLight, this.ambientLight) : null));
    if (config.rings) this.object.add(createRings(config.rings, seed, PLANET_SCALE));
    // The same look as in the system view (in planet radii), so the two match across the zoom.
    const look = config.atmosphere && config.climate ? atmosphereLook(config.climate, config.radius) : null;
    if (look) this.object.add(createAtmosphere(R, config.atmosphere!, look, { vector: this.sun, point: false }, 128));
    this.weather = gas ? null : createWeatherLook(config, this.lava?.activity ?? null);
    // Earth-sized: 20·43² ≈ 37k triangles.
    if (this.weather) this.object.add(this.weather.createCloudLayer(1, Math.round(globeDetail(R) * 0.7), { vector: this.sun, point: false }));
    scene.add(this.object);
    this.update();
  }

  update(): void {
    this.lava?.animate(this.frame.renderTime);
    this.weather?.animate(this.frame.renderTime);
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
 * A smooth sphere at sea level: glossy water, matte ice, or the animated lava
 * (`lava`, see world/lavaMaterial.ts). Opaque: the sky is drawn first, so
 * see-through water would show stars through the planet.
 */
function createSea(type: PlanetConfig['type'], color: string, radius: number, lava: THREE.Material | null): THREE.Mesh {
  // The lava shader works out its flow per vertex, so it gets fewer (still smooth at the horizon).
  const geometry = lava ? new THREE.SphereGeometry(radius, 128, 64) : new THREE.SphereGeometry(radius, 160, 80);
  let material: THREE.Material;
  if (lava) {
    material = lava;
  } else if (type === 'ice') {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  } else {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.25 });
  }
  const sea = new THREE.Mesh(geometry, material);
  sea.name = 'Sea';
  // Drawn first, so the sea floor under it is rejected by the depth test rather than shaded.
  sea.renderOrder = SEA_RENDER_ORDER;
  return sea;
}
