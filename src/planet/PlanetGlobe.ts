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
import { addIceDebug, createIceLook, type IceLook } from '../world/iceLook';
import type { Debug } from '../core/Debug';
import { PLANET_SCALE, RELIEF_SCALE, globeRadius } from './frame';
import { addGroundDebug, createGroundLook } from '../world/groundLook';
import { groundHit } from './ground';
import type { Landing } from '../cargo/plantFate';
import { LodSurface, addCraterDebug, addLodDebug } from './LodSurface';
import type { RenderClock } from './PlanetFrame';
import { RingRocks } from './RingRocks';
import { CLEAR_SEA_RENDER_ORDER, createSeaWaves, addWaveDebug, seaClear, seaDepthFrame, waveParams, type SeaWaveLook } from '../world/seaWaves';
import type { ClimateData } from '../gen/climate';
import { NEW_SEA_COLOR, airKey, fibonacciDirections, liveAtmosphereColor, quantile, seaCoverage, shareBelow, weatherKey } from '../terraform/liveLook';
import { applyLiveSurface, createLiveSurfaceUniforms, setLiveIce, type LiveSurfaceUniforms } from '../world/liveSurface';
import { createHaze, setHaze } from '../world/hazeShell';
import type { GroundLook } from '../world/groundLook';

// Mountains' exaggeration up close lives in frame.ts (the system view's clouds need it too); re-exported here.
export { RELIEF_SCALE };

/** The shortest step (units) the seabed's slope is measured over under the sea. */
const MIN_SLOPE_STEP = 0.25;
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
  /** Bodies with weather: the cloud layer's look, its storms and lightning (planet/Weather.ts draws the rain and bolts). Rebuilt as a terraformed climate changes it (`setLive`). */
  weather: WeatherLook | null;
  /** Ringed bodies: the ring's rocks and ice up close. */
  readonly rings: RingRocks | null;
  /** Icy bodies: snow, glacier ice, the frozen sea and lineae. */
  private readonly ice: IceLook | null;
  /** Water seas: the wind's waves on them. */
  waves: SeaWaveLook | null = null;

  private readonly surface: LodSurface;
  /** A water (or ice) sea, refined and culled like the ground (a terraformed world may gain one). */
  private water: LodSurface | null = null;
  /** The radius the water sea was built at (it's scaled to the live sea level). */
  private waterRadius = 0;
  /** The terrain's lit material, and green worlds' ground look. */
  private readonly material: THREE.MeshStandardMaterial;
  private readonly groundLook: GroundLook | null;
  /** Once terraformed (`setLive`): its seas' and ice's uniforms, the terrain's sampled radii (sorted), the generated sea's share. */
  private live: { uniforms: LiveSurfaceUniforms; radii: Float64Array; baseCoverage: number; airKey: string; weatherKey: string } | null = null;
  /** The live sea level (null: none); the generated one until terraformed. */
  private seaLevel: number | null;
  /** The atmosphere shell and the cloud layer, replaced as a terraformed climate changes them. */
  private atmosphere: THREE.Mesh | null = null;
  private clouds: THREE.Group | null = null;
  /** An aerosol haze over the air (made with the first, thinned in place as it rains out). */
  private haze: ReturnType<typeof createHaze> | null = null;
  /** The surface as drawn: radius (and colour) in a direction. */
  private readonly sample: SurfaceSampler;
  /** Worlds with a sea as generated: the ground is never lower than its surface. */
  private readonly sea: boolean;
  /** Gas and ice giants: the ground is their cloud tops. */
  private readonly gasGiant: boolean;
  private readonly groundColor = new THREE.Color();
  /** Bodies with an atmosphere: where the ground is, so the haze stops there (see renderDepth). */
  private ground: GroundDepth | null;
  private readonly cameraPosition = new THREE.Vector3();
  /** Once busted: the radius of the debris field, which is the ground from then on. */
  private bustedRadius: number | null = null;
  /** Raised on the ground since (volcanoes): drawn by their owners, counted in the ground here. */
  private readonly reliefs: GroundRelief[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly config: PlanetConfig,
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
    this.seaLevel = seaFloor ? R : null;
    this.gasGiant = gas;
    this.sample = gas
      ? gasSampler(R, seed, config.bands, config.size === 'iceGiant')
      : terrainSampler(R, seed, style, { noise: surfaceNoise(config, true), reliefScale: RELIEF_SCALE, seaFloor, shape: config.shape });
    const material = (this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
    this.gas = createGasLook(config);
    this.gas?.apply(material);
    const ice = (this.ice = gas ? null : createIceLook(config));
    if (ice) addIceDebug(debug);
    ice?.applyGround(material, R, R * style.relief * RELIEF_SCALE, false);
    // Green worlds' grass, soil, sand, rock and snow.
    const ground = (this.groundLook = gas ? null : createGroundLook(config));
    if (ground) addGroundDebug(debug);
    ground?.apply(material, R, R * style.relief * RELIEF_SCALE);
    this.surface = new LodSurface(gas ? R : floorRadius(R, style, RELIEF_SCALE, seaFloor, config.shape != null), this.top, this.sample, material, {
      smooth: gas ? 'outline' : null,
      // The opaque sea hides the sea floor's chunks that lie wholly under it.
      // Clear water shows its shallows' floor (world/seaWaves.ts), down to where it's opaque.
      hiddenBelow: seaFloor ? R - (seaClear(config) ? waveParams.clearDepth : 0) : -Infinity,
    });
    this.object.add(this.surface.object);
    addLodDebug(debug);
    addCraterDebug(debug);
    if (seaFloor && this.lava) {
      this.object.add(createLavaSea(R, this.lava.createSeaMaterial(this.sun, this.sunLight, this.ambientLight, R)));
    } else if (seaFloor) {
      // Ice sheets are still; water has waves (calm where there's no air to blow over it).
      this.waves = createSeaWaves(config, this.sun, this.sunLight);
      if (this.waves) addWaveDebug(debug);
      this.water = createWater(config.type, style.sea!, R, this.waves, this.sample, ice?.surface.frozenSea ? ice : null);
      this.waterRadius = R;
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
    if (look) this.object.add((this.atmosphere = createAtmosphere(R, config.atmosphere!, look, { vector: this.sun, point: false, strength: this.sunStrength }, ATMOSPHERE_SEGMENTS, this.ground)));
    this.weather = gas ? null : createWeatherLook(config, this.lava?.activity ?? null);
    if (this.weather) this.object.add((this.clouds = this.weather.createCloudLayer(1, CLOUD_SEGMENTS, { vector: this.sun, point: false, strength: this.sunStrength })));
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
    return this.seaLevel !== null ? Math.max(r, this.seaLevel) : r;
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

  /** The sea's radius, or null for a world without one (or a gas giant): a terraformed world's rises and falls. */
  get seaRadius(): number | null {
    return this.seaLevel;
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
    if (this.busted || this.seaLevel === null || this.sample(dir, this.groundColor) + this.liftAt(dir) >= this.seaLevel) return 'land';
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

  /**
   * Follows a terraformed climate (terraform/liveLook.ts): the atmosphere's
   * colour and thickness, the weather, the sea level, sea ice and ice caps.
   * The first call prepares the materials (a recompile, once); returns true
   * when the weather was rebuilt (the level's rain and bolts follow it).
   */
  setLive(climate: ClimateData): boolean {
    if (this.busted || this.gasGiant) return false;
    const config = this.config;
    const live = (this.live ??= this.goLive());
    const lavaWorld = this.lava !== null;
    // The sea, unless it's lava.
    if (!lavaWorld && !config.shape) {
      const coverage = seaCoverage(live.baseCoverage, config.climate?.water ?? 0, climate);
      this.setSeaLevel(coverage > 0 ? Math.max(quantile(live.radii, coverage), this.lowest + 1e-3) : null, climate);
    }
    const u = live.uniforms;
    u.uLiveSeaR.value = this.seaLevel ?? 0;
    setLiveIce(u, climate, config.type === 'barren' || config.type === 'desert');
    this.groundLook?.setTemperature(climate.temperature);
    // The air and the weather, rebuilt when they've moved on by a step.
    const body = { ...config, climate, atmosphere: liveAtmosphereColor(config, climate) };
    const air = airKey(config, climate);
    if (air !== live.airKey) {
      live.airKey = air;
      this.setAtmosphere(body);
    }
    if (climate.aerosol > 0 || this.haze) {
      if (!this.haze) {
        this.ground ??= new GroundDepth();
        this.object.add((this.haze = createHaze(this.radius, { vector: this.sun, point: false, strength: this.sunStrength }, ATMOSPHERE_SEGMENTS, this.ground)));
      }
      setHaze(this.haze, climate.aerosol);
    }
    const weather = weatherKey(config, climate);
    if (weather === live.weatherKey) return false;
    live.weatherKey = weather;
    if (this.clouds) {
      this.object.remove(this.clouds);
      disposeObject(this.clouds);
      this.clouds = null;
    }
    this.weather = createWeatherLook(body, this.lava?.activity ?? null);
    if (this.weather) this.object.add((this.clouds = this.weather.createCloudLayer(1, CLOUD_SEGMENTS, { vector: this.sun, point: false, strength: this.sunStrength })));
    return true;
  }

  /** The lowest the terrain goes (a sea sphere under it would draw nothing). */
  private get lowest(): number {
    return this.live?.radii[0] ?? this.radius;
  }

  private goLive(): NonNullable<PlanetGlobe['live']> {
    const config = this.config;
    const uniforms = createLiveSurfaceUniforms();
    // The terrain's radii over the whole globe: the level a share of it lies under.
    const n = 3000;
    const dirs = fibonacciDirections(n);
    const radii = new Float64Array(n);
    const dir = new THREE.Vector3();
    for (let i = 0; i < n; i++) radii[i] = this.sample(dir.set(dirs[i * 3]!, dirs[i * 3 + 1]!, dirs[i * 3 + 2]!), this.groundColor);
    radii.sort();
    const baseCoverage = this.sea && !this.lava ? shareBelow(radii, this.radius) : 0;
    applyLiveSurface(this.material, 'ground', uniforms);
    if (this.water) this.applyLiveWater(this.water, uniforms);
    const climate = config.climate!;
    return { uniforms, radii, baseCoverage, airKey: airKey(config, climate), weatherKey: weatherKey(config, climate) };
  }

  private applyLiveWater(water: LodSurface, uniforms: LiveSurfaceUniforms): void {
    applyLiveSurface(water.material as THREE.MeshStandardMaterial, this.config.type === 'ice' ? 'iceSea' : 'sea', uniforms);
  }

  /** The sea at radius `level` from now on (null: none): scaled, made if there was none, hidden if it's gone. */
  private setSeaLevel(level: number | null, climate: ClimateData): void {
    if (level === this.seaLevel) return;
    this.seaLevel = level;
    if (level === null) {
      if (this.water) this.water.object.visible = false;
      this.surface.setHiddenBelow(-Infinity);
      return;
    }
    if (!this.water) {
      // A world that had no sea gains one: water, with waves if there's air to blow over it.
      const config = { ...this.config, climate, style: { ...this.config.style, sea: NEW_SEA_COLOR } };
      this.waves = createSeaWaves(config, this.sun, this.sunLight);
      this.water = createWater(config.type, NEW_SEA_COLOR, level, this.waves, this.sample, null);
      this.waterRadius = level;
      this.applyLiveWater(this.water, this.live!.uniforms);
      this.object.add(this.water.object);
    }
    this.water.object.visible = true;
    this.water.object.scale.setScalar(level / this.waterRadius);
    this.water.object.updateMatrixWorld();
    // The ground under it isn't drawn (clear water shows its shallows).
    this.surface.setHiddenBelow(this.waves ? level - waveParams.clearDepth : level);
  }

  /** A new atmosphere shell for `body`'s climate (none if it's too thin to see). */
  private setAtmosphere(body: PlanetConfig): void {
    if (this.atmosphere) {
      this.object.remove(this.atmosphere);
      disposeObject(this.atmosphere);
      this.atmosphere = null;
    }
    const look = body.atmosphere && body.climate ? atmosphereLook(body.climate, body.radius) : null;
    if (!look) return;
    this.ground ??= new GroundDepth();
    this.atmosphere = createAtmosphere(this.radius, body.atmosphere!, look, { vector: this.sun, point: false, strength: this.sunStrength }, ATMOSPHERE_SEGMENTS, this.ground);
    this.object.add(this.atmosphere);
  }

  /** Draws what the scene reads from textures, the ground's depth for the atmosphere and the sea's wave tiles: call before drawing the scene with `camera`. */
  renderDepth(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    if (this.busted) return;
    this.ground?.render(renderer, this.scene, camera);
    this.waves?.render(renderer);
  }

  update(frameDt: number): void {
    if (this.busted) return;
    this.lava?.animate(this.frame.renderTime);
    this.gas?.animate(this.frame.renderTime);
    this.weather?.animate(this.frame.renderTime);
    this.rings?.animate(this.frame.renderTime);
    const camera = this.object.worldToLocal(this.camera.getWorldPosition(this.cameraPosition));
    this.waves?.animate(this.frame.renderTime, camera, this.weather?.shown ?? null);
    this.surface.update(camera, frameDt);
    this.water?.update(camera, frameDt);
  }

  dispose(): void {
    this.gas?.dispose();
    this.ice?.dispose();
    this.surface.dispose();
    this.water?.dispose();
    this.waves?.dispose();
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

/** Disposes a mesh's or group's geometries and materials. */
function disposeObject(object: THREE.Object3D): void {
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}

/**
 * A water or ice sea: a smooth sphere at sea level, glossy with waves or matte, refined
 * where the camera looks and culled behind the horizon like the ground (a
 * LodSurface of its own, split only as far as its outline and coasts need).
 * Opaque: the sky is drawn first, so see-through water would show stars
 * through the planet.
 */
function createWater(
  type: PlanetConfig['type'],
  color: string,
  radius: number,
  waves: SeaWaveLook | null,
  terrain: SurfaceSampler,
  ice: IceLook | null,
): LodSurface {
  // With waves, the roughness is the slope of the waves too small to draw (world/seaWaves.ts).
  const material = new THREE.MeshStandardMaterial({ color, roughness: type === 'ice' ? 0.55 : 0.25 });
  waves?.apply(material);
  // A frozen sea: floes, pressure ridges, leads and drifted snow (world/iceLook.ts).
  ice?.applySea(material, radius);
  // The waves' shader reads how deep the water is (units) from the colour's red, and how fast it deepens (the
  // seabed's slope, depth units per unit east and north, see seaDepthFrame) from its green and blue, so the shore
  // swells' crests turn smoothly along the coast.
  const floor = new THREE.Color();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const step = new THREE.Vector3();
  const sample: SurfaceSampler = waves
    ? (dir, out, spacing) => {
        const depth = radius - terrain(dir, floor, spacing);
        const h = Math.max(spacing ?? 0, MIN_SLOPE_STEP);
        seaDepthFrame(dir, east, north);
        step.set(dir.x, dir.y, dir.z).addScaledVector(east, h / radius).normalize();
        const de = radius - terrain(step, floor, spacing);
        step.set(dir.x, dir.y, dir.z).addScaledVector(north, h / radius).normalize();
        const dn = radius - terrain(step, floor, spacing);
        out.setRGB(Math.max(0, depth), (de - depth) / h, (dn - depth) / h);
        return radius;
      }
    : () => radius;
  // Drawn first, so the sea floor under it is rejected by the depth test rather than shaded; a clear sea is drawn
  // after the ground, being see-through. Its shallows split finely, for the shore swells.
  return new LodSurface(radius, radius, sample, material, {
    smooth: 'coast',
    renderOrder: waves ? CLEAR_SEA_RENDER_ORDER : SEA_RENDER_ORDER,
    shallow: waves?.shallowDepth ?? -Infinity,
    name: 'Sea',
  });
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
