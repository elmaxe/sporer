import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { surfaceNoise } from '../gen/craters';
import { isGas, type PlanetConfig } from '../world/Planet';
import { atmosphereLook } from '../gen/atmosphere';
import { createAtmosphere } from '../world/atmosphereShell';
import { SEA_RENDER_ORDER, createLavaLook, type LavaLook } from '../world/lavaMaterial';
import { createRings, floorRadius, gasSampler, peakRadius, terrainSampler, type SurfaceSampler } from '../world/planetGeometry';
import { createCubeSphere } from '../world/cubeSphere';
import { GROUND_LAYER, GroundDepth } from '../world/groundDepth';
import { createWeatherLook, type WeatherLook } from '../world/weatherLook';
import { createGasLook, type GasLook } from '../world/gasLook';
import type { Debug } from '../core/Debug';
import { PLANET_SCALE, RELIEF_SCALE, globeRadius } from './frame';
import { groundHit } from './ground';
import type { Landing } from '../cargo/plantFate';
import { LodSurface, addCraterDebug, addLodDebug } from './LodSurface';
import type { RenderClock } from './PlanetFrame';
import { RingRocks } from './RingRocks';

// Mountains' exaggeration up close lives in frame.ts (the system view's clouds need it too); re-exported here.
export { RELIEF_SCALE };

/** Cube sphere segments of the lava sea, whose shader works out its flow per vertex (so it can't change detail; water is a LodSurface). */
const LAVA_SEA_SEGMENTS = 37;
/** Cube sphere segments of the atmosphere shell. */
const ATMOSPHERE_SEGMENTS = 37;
/** Cube sphere segments of the cloud layer (12·48² ≈ 28k triangles; the noise is per pixel, the drift per vertex). */
const CLOUD_SEGMENTS = 48;
/** A vent's glow on the lava sea, radians. */
const VENT_RADIUS = 0.05;

/** Something raised on the ground since the planet was made (a volcano, combat/volcano.ts): how far it lifts it in a direction. */
export interface GroundRelief {
  lift(dir: THREE.Vector3): number;
}

/**
 * The visited planet or moon, at its true size (see globeRadius) and detailed: the
 * terrain from the same noise as the system view plus finer octaves, a sea
 * surface for worlds with liquid, rings (their rocks up close) and the atmosphere glow. Gas giants
 * are the same banded sphere as in the system view, only finer. The surface
 * refines where the camera looks (LodSurface). Static in the planet level's
 * body frame.
 */
export class PlanetGlobe implements Entity {
  readonly object = new THREE.Group();
  /** Sea-level (or cloud-top) radius; a small body's longest reach. */
  readonly radius: number;
  /** Radius of the highest terrain (or cloud tops): the ship hovers above this (once busted, the debris field's edge). */
  top: number;
  /** Unit direction to the (main) star; the atmospheres read it for their day and night sides. */
  readonly sun = new THREE.Vector3(0, 1, 0);
  /** The sun's light (colour × intensity) and the ambient light, for the lava's crust (set by PlanetLights). */
  readonly sunLight = new THREE.Color(1, 1, 1);
  readonly ambientLight = new THREE.Color(0, 0, 0);
  /** How bright the sun's light is on the air and clouds (1 for a star; the galaxy's glow round a rogue is less). */
  readonly sunStrength = { value: 1 };
  /** Lava worlds and moons: the animated sea and its eruptions' schedule. */
  readonly lava: LavaLook | null;
  /** Gas and ice giants: the cloud tops (the map draws them too). */
  readonly gas: GasLook | null;
  /** Bodies with weather: the cloud layer's look, its storms and lightning (planet/Weather.ts draws the rain and bolts). */
  readonly weather: WeatherLook | null;
  /** Ringed bodies: the ring's rocks and ice up close. */
  readonly rings: RingRocks | null;

  private readonly surface: LodSurface;
  /** A water (or ice) sea, refined and culled like the ground. */
  private readonly water: LodSurface | null = null;
  /** The surface as drawn: radius (and colour) in a direction. */
  private readonly sample: SurfaceSampler;
  /** Worlds with a sea: the ground is never lower than its surface. */
  private readonly sea: boolean;
  /** Gas and ice giants: the ground is their cloud tops. */
  private readonly gasGiant: boolean;
  private readonly groundColor = new THREE.Color();
  /** Bodies with an atmosphere: where the ground is, so the haze stops there (see renderDepth). */
  private readonly ground: GroundDepth | null;
  private readonly cameraPosition = new THREE.Vector3();
  /** Once busted: the radius of the debris field, which is the ground from then on. */
  private bustedRadius: number | null = null;
  /** Raised on the ground since (volcanoes): drawn by their owners, counted in the ground here. */
  private readonly reliefs: GroundRelief[] = [];

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

    this.sea = seaFloor;
    this.gasGiant = gas;
    this.sample = gas
      ? gasSampler(R, seed, config.bands, config.size === 'iceGiant')
      : terrainSampler(R, seed, style, { noise: surfaceNoise(config, true), reliefScale: RELIEF_SCALE, seaFloor, shape: config.shape });
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: !gas, roughness: 0.9 });
    this.gas = createGasLook(config);
    this.gas?.apply(material);
    this.surface = new LodSurface(gas ? R : floorRadius(R, style, RELIEF_SCALE, seaFloor, config.shape != null), this.top, this.sample, material, {
      smooth: gas ? 'outline' : null,
      // The opaque sea hides the sea floor's chunks that lie wholly under it.
      hiddenBelow: seaFloor ? R : -Infinity,
    });
    this.object.add(this.surface.object);
    addLodDebug(debug);
    addCraterDebug(debug);
    if (seaFloor && this.lava) {
      this.object.add(createLavaSea(R, this.lava.createSeaMaterial(this.sun, this.sunLight, this.ambientLight)));
    } else if (seaFloor) {
      this.water = createWater(config.type, style.sea!, R);
      this.object.add(this.water.object);
    }
    if (config.rings) {
      const sheet = createRings(config.rings, seed, PLANET_SCALE);
      this.rings = new RingRocks(config.rings, seed, config.spin, PLANET_SCALE, debug);
      this.rings.fadeSheet(sheet.material as THREE.Material);
      this.object.add(sheet, this.rings.object);
    } else {
      this.rings = null;
    }
    // The same look as in the system view (in planet radii), so the two match across the zoom.
    const look = config.atmosphere && config.climate ? atmosphereLook(config.climate, config.radius) : null;
    this.ground = look ? new GroundDepth() : null;
    if (look) this.object.add(createAtmosphere(R, config.atmosphere!, look, { vector: this.sun, point: false, strength: this.sunStrength }, ATMOSPHERE_SEGMENTS, this.ground));
    this.weather = gas ? null : createWeatherLook(config, this.lava?.activity ?? null);
    if (this.weather) this.object.add(this.weather.createCloudLayer(1, CLOUD_SEGMENTS, { vector: this.sun, point: false, strength: this.sunStrength }));
    scene.add(this.object);
    this.update(0);
  }

  /**
   * The radius of what the ship flies over in unit direction `dir`: the terrain
   * as drawn, or the sea's surface where the terrain is under it. Allocation-free.
   */
  groundRadius(dir: THREE.Vector3): number {
    if (this.bustedRadius !== null) return this.bustedRadius;
    const r = this.sample(dir, this.groundColor) + this.liftAt(dir);
    return this.sea ? Math.max(r, this.radius) : r;
  }

  /** How far what was raised on the ground since (volcanoes) lifts it in unit direction `dir`. */
  private liftAt(dir: THREE.Vector3): number {
    let lift = 0;
    for (const relief of this.reliefs) lift = Math.max(lift, relief.lift(dir));
    return lift;
  }

  /** The terrain as generated (under any sea, without what was raised on it since) in unit direction `dir`; its colour into `color`. */
  terrainRadius(dir: THREE.Vector3, color: THREE.Color): number {
    return this.sample(dir, color);
  }

  /** The sea's radius, or null for a world without one (or a gas giant). */
  get seaRadius(): number | null {
    return this.sea ? this.radius : null;
  }

  /**
   * Counts `relief` in the ground from now on (the ship flies over it, clicks
   * land on it); its highest point is `peak` (radius), which raises `top` if
   * it's higher.
   */
  addRelief(relief: GroundRelief, peak: number): void {
    this.reliefs.push(relief);
    if (this.bustedRadius === null) this.top = Math.max(this.top, peak);
  }

  /** What something falling at unit direction `dir` lands on: a giant's clouds, the sea (or the lava sea) where it covers the terrain (and any volcano raised there), or land. */
  landingAt(dir: THREE.Vector3): Landing {
    if (this.gasGiant) return 'clouds';
    if (this.busted || !this.sea || this.sample(dir, this.groundColor) + this.liftAt(dir) >= this.radius) return 'land';
    return this.lava ? 'lava' : 'sea';
  }

  /** Where `ray` (in the globe's frame) meets the ground, written into `out`; the distance along the ray, or null on a miss. */
  groundHit(ray: THREE.Ray, out: THREE.Vector3): number | null {
    return groundHit(ray, this.groundHeight, this.top, out);
  }

  /** `groundRadius` as a function to hand on. */
  readonly groundHeight = (dir: THREE.Vector3): number => this.groundRadius(dir);

  /** True when the surface has every chunk the camera wants (for automation). */
  get settled(): boolean {
    // A busted globe builds nothing more.
    return this.busted || (this.surface.settled && (this.water?.settled ?? true));
  }

  /** The surface's chunks drawn now and their depths (the lab's readout). */
  lodStats(): { chunks: number; minDepth: number; maxDepth: number } {
    return this.surface.stats();
  }

  /** The same for the water's chunks (null without a water sea). */
  waterStats(): { chunks: number; minDepth: number; maxDepth: number } | null {
    return this.water?.stats() ?? null;
  }

  /** True once a planet buster has blown it apart. */
  get busted(): boolean {
    return this.bustedRadius !== null;
  }

  /**
   * Blown apart by a planet buster: everything goes, rings and all, and the
   * ground is a sphere `radius` out from then on (the debris field's edge),
   * which the ship flies over and clicks land on.
   */
  bust(radius: number): void {
    this.bustedRadius = this.top = radius;
    for (const child of this.object.children) child.visible = false;
  }

  /** Draws the ground's depth for the atmosphere: call before drawing the scene with `camera`. */
  renderDepth(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    if (!this.busted) this.ground?.render(renderer, this.scene, camera);
  }

  update(frameDt: number): void {
    if (this.busted) return;
    this.lava?.animate(this.frame.renderTime);
    this.gas?.animate(this.frame.renderTime);
    this.weather?.animate(this.frame.renderTime);
    this.rings?.animate(this.frame.renderTime);
    const camera = this.object.worldToLocal(this.camera.getWorldPosition(this.cameraPosition));
    this.surface.update(camera, frameDt);
    this.water?.update(camera, frameDt);
  }

  dispose(): void {
    this.gas?.dispose();
    this.surface.dispose();
    this.water?.dispose();
    this.ground?.dispose();
    this.rings?.dispose();
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
 * A water or ice sea: a smooth sphere at sea level, glossy or matte, refined
 * where the camera looks and culled behind the horizon like the ground (a
 * LodSurface of its own, split only as far as its outline and coasts need).
 * Opaque: the sky is drawn first, so see-through water would show stars
 * through the planet.
 */
function createWater(type: PlanetConfig['type'], color: string, radius: number): LodSurface {
  const material = new THREE.MeshStandardMaterial({ color, roughness: type === 'ice' ? 0.55 : 0.25 });
  // Drawn first, so the sea floor under it is rejected by the depth test rather than shaded.
  return new LodSurface(radius, radius, () => radius, material, { smooth: 'coast', renderOrder: SEA_RENDER_ORDER, name: 'Sea' });
}

/** The lava sea: a fixed smooth sphere at sea level with the animated lava (see world/lavaMaterial.ts). */
function createLavaSea(radius: number, material: THREE.Material): THREE.Mesh {
  // The lava shader works out its flow per vertex, so a fixed sphere (with fewer segments: still smooth at the horizon).
  const sea = new THREE.Mesh(createCubeSphere(radius, LAVA_SEA_SEGMENTS), material);
  sea.name = 'Sea';
  sea.renderOrder = SEA_RENDER_ORDER;
  sea.layers.enable(GROUND_LAYER);
  return sea;
}
