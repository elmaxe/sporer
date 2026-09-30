import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { detailedTerrain } from '../gen/noise';
import { isGas, type PlanetConfig } from '../world/Planet';
import { atmosphereLook } from '../gen/atmosphere';
import { createAtmosphere } from '../world/atmosphereShell';
import { SEA_RENDER_ORDER, createLavaLook, type LavaLook } from '../world/lavaMaterial';
import { createRings, floorRadius, gasSampler, peakRadius, terrainSampler } from '../world/planetGeometry';
import { createCubeSphere } from '../world/cubeSphere';
import { GROUND_LAYER, GroundDepth } from '../world/groundDepth';
import { createWeatherLook, type WeatherLook } from '../world/weatherLook';
import type { Debug } from '../core/Debug';
import { PLANET_SCALE, RELIEF_SCALE, globeRadius } from './frame';
import { LodSurface, addLodDebug } from './LodSurface';
import type { RenderClock } from './PlanetFrame';

// Mountains' exaggeration up close lives in frame.ts (the system view's clouds need it too); re-exported here.
export { RELIEF_SCALE };

/** Cube sphere segments of the sea surface, and of the lava sea, whose shader works out its flow per vertex. */
const SEA_SEGMENTS = 46;
const LAVA_SEA_SEGMENTS = 37;
/** Cube sphere segments of the atmosphere shell. */
const ATMOSPHERE_SEGMENTS = 37;
/** Cube sphere segments of the cloud layer (12·48² ≈ 28k triangles; the noise is per pixel, the drift per vertex). */
const CLOUD_SEGMENTS = 48;
/** A vent's glow on the lava sea, radians. */
const VENT_RADIUS = 0.05;

/**
 * The visited planet or moon, at its true size (see globeRadius) and detailed: the
 * terrain from the same noise as the system view plus finer octaves, a sea
 * surface for worlds with liquid, rings and the atmosphere glow. Gas giants
 * are the same banded sphere as in the system view, only finer. The surface
 * refines where the camera looks (LodSurface). Static in the planet level's
 * body frame.
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

  private readonly surface: LodSurface;
  /** Bodies with an atmosphere: where the ground is, so the haze stops there (see renderDepth). */
  private readonly ground: GroundDepth | null;
  private readonly cameraPosition = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    config: PlanetConfig,
    private readonly frame: RenderClock,
    /** The surface refines where this camera is. */
    private readonly camera: THREE.Camera,
    debug: Debug,
  ) {
    const { seed, style } = config;
    const R = (this.radius = globeRadius(config.radius));
    const gas = isGas(config);
    this.top = gas ? R : peakRadius(R, style, RELIEF_SCALE);
    const seaFloor = !gas && style.sea !== null;
    this.lava = gas ? null : createLavaLook(config, VENT_RADIUS);

    this.surface = new LodSurface(
      R,
      gas ? R : floorRadius(R, style, RELIEF_SCALE, seaFloor),
      this.top,
      gas
        ? gasSampler(R, seed, config.bands, true, true)
        : terrainSampler(R, seed, style, { noise: detailedTerrain, reliefScale: RELIEF_SCALE, seaFloor }),
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: !gas, roughness: 0.9 }),
      // The cloud tops' detail is all colour, so their cells go well under the terrain's size.
      gas ? { cellScale: 0.4, extraDepth: 3 } : undefined,
    );
    this.object.add(this.surface.object);
    addLodDebug(debug);
    if (seaFloor) this.object.add(createSea(config.type, style.sea!, R, this.lava ? this.lava.createSeaMaterial(this.sun, this.sunLight, this.ambientLight) : null));
    if (config.rings) this.object.add(createRings(config.rings, seed, PLANET_SCALE));
    // The same look as in the system view (in planet radii), so the two match across the zoom.
    const look = config.atmosphere && config.climate ? atmosphereLook(config.climate, config.radius) : null;
    this.ground = look ? new GroundDepth() : null;
    if (look) this.object.add(createAtmosphere(R, config.atmosphere!, look, { vector: this.sun, point: false }, ATMOSPHERE_SEGMENTS, this.ground));
    this.weather = gas ? null : createWeatherLook(config, this.lava?.activity ?? null);
    if (this.weather) this.object.add(this.weather.createCloudLayer(1, CLOUD_SEGMENTS, { vector: this.sun, point: false }));
    scene.add(this.object);
    this.update(0);
  }

  /** True when the surface has every chunk the camera wants (for automation). */
  get settled(): boolean {
    return this.surface.settled;
  }

  /** The surface's chunks drawn now and their depths (the lab's readout). */
  lodStats(): { chunks: number; minDepth: number; maxDepth: number } {
    return this.surface.stats();
  }

  /** Draws the ground's depth for the atmosphere: call before drawing the scene with `camera`. */
  renderDepth(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    this.ground?.render(renderer, this.scene, camera);
  }

  update(frameDt: number): void {
    this.lava?.animate(this.frame.renderTime);
    this.weather?.animate(this.frame.renderTime);
    this.surface.update(this.object.worldToLocal(this.camera.getWorldPosition(this.cameraPosition)), frameDt);
  }

  dispose(): void {
    this.surface.dispose();
    this.ground?.dispose();
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
  const geometry = createCubeSphere(radius, lava ? LAVA_SEA_SEGMENTS : SEA_SEGMENTS);
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
  sea.layers.enable(GROUND_LAYER);
  return sea;
}
