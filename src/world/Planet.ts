import * as THREE from 'three';
import { createIceLook, type IceLook } from './iceLook';
import { applySeaGlint } from './seaWaves';
import type { Entity } from '../core/Entity';
import { RAPIER, type Physics } from '../physics/Physics';
import { keplerPosition, orbitPosition, type KeplerOrbit, type Orbit } from '../gen/orbit';
import type { ShapeData } from '../gen/shape';
import { describeClimate, type ClimateData } from '../gen/climate';
import { describeLife, type LifeEstimate } from '../gen/life';
import type { PlanetStyle, PlanetType, RingData } from '../gen/system';
import type { CelestialBody } from './CelestialBody';
import { atmosphereLook } from '../gen/atmosphere';
import { createAtmosphere, type AtmosphereSun } from './atmosphereShell';
import { createLavaLook, type LavaLook } from './lavaMaterial';
import { createGasLook, type GasLook } from './gasLook';
import type { SizeClass } from '../gen/planets';
import { createGasGeometry, createRings, createTerrainGeometry, terrainSampler } from './planetGeometry';
import { createWeatherLook, type WeatherLook } from './weatherLook';
import { PLANET_SCALE, RELIEF_SCALE, globeRadius } from '../planet/frame';
import { createGroundLook } from './groundLook';
import { surfaceNoise } from '../gen/craters';
import { VolcanoShape, eruptionStrength, volcanoGrowth, type VolcanoSite } from '../combat/volcano';
import { VolcanoMesh } from './volcanoMesh';
import { createGlowTexture } from './glowTexture';
import { CLOUD_RENDER_ORDER } from './weatherLook';
import { DEBRIS_REACH, debrisLookFor } from '../gen/debris';
import { DEBRIS_FAR, DebrisField } from './DebrisField';
import { realSurface } from '../gen/realSurface';

/** What the renderer needs; generated PlanetData and MoonData both satisfy it. */
export interface PlanetConfig {
  name: string;
  type: PlanetType;
  radius: number;
  seed: number;
  /** Radians per second around the planet's own axis. */
  spin: number;
  /** Around the star, or around the parent planet for moons. */
  orbit: Orbit;
  style: PlanetStyle;
  bands?: string[] | null;
  /** Planets' size class (ice giants' clouds differ from gas giants'). */
  size?: SizeClass;
  atmosphere?: string | null;
  rings?: RingData | null;
  tilt?: number;
  /** Solid bodies only (see gen/climate.ts). */
  climate?: ClimateData | null;
  /** The chance of life (gen/life.ts), where it's been worked out for the body's system. */
  life?: LifeEstimate | null;
  /** Irregular small bodies: the nucleus's shape (gen/shape.ts); `radius` is its longest reach. */
  shape?: ShapeData | null;
  /** A Kepler orbit round the star (comets), followed instead of `orbit`. */
  path?: KeplerOrbit | null;
  /** What kind of small body it is: comets have jets and a coma near the star. */
  small?: SmallBodyKind | null;
}

/** Kinds of irregular small body: comet nuclei (step 25) and named asteroids (step 26). */
export type SmallBodyKind = 'comet' | 'asteroid';

/**
 * Cube sphere segments of the system view's planets (gas giants need more for
 * smooth bands): 768 and 5808 triangles.
 */
export const TERRAIN_SEGMENTS = 8;
export const GAS_SEGMENTS = 22;
/** Bodies with real maps (Earth, the Moon, Mars, Pluto): fine enough for their continents and seas to read (19 200 triangles). */
export const REAL_SEGMENTS = 40;
/** Lava bodies' terrain: finer, since their seas' glow is worked out per vertex (1728 triangles). */
export const LAVA_SEGMENTS = 12;
/** Cratered bodies' terrain: fine enough for the biggest craters to read as bowls (6144 triangles). */
export const CRATER_SEGMENTS = 32;

/** Cube sphere segments of a solid body's terrain in the system view (`lava`: it has a lava sea). */
export function terrainSegments(config: PlanetConfig, lava: boolean): number {
  if (realSurface(config.seed)) return REAL_SEGMENTS;
  if (lava) return LAVA_SEGMENTS;
  return (config.style.craters ?? 0) > 0 ? CRATER_SEGMENTS : TERRAIN_SEGMENTS;
}

/** A vent's glow in the system view, radians (wider than up close, so it shows at that size). */
export const COARSE_VENT_RADIUS = 0.15;
/** Cube sphere segments of the system view's cloud layers (4800 triangles; the drift is worked out per vertex). */
export const CLOUD_SEGMENTS = 20;
/** Rings and segments of a volcano's cone in the system view. */
const VOLCANO_RINGS = 12;
const VOLCANO_SEGMENTS = 24;
/** A volcano's cone sinks this far under the globe at its foot, system units. */
const VOLCANO_FOOT_SINK = 0.01;
/** Ash puffs over each volcano in the system view, and the seconds each takes to rise. */
const VOLCANO_PUFFS = 4;
const PUFF_PERIOD = 6;

/** A volcano raised on the body (by a volcano bomb in low orbit), as the system view draws it. */
interface SystemVolcano {
  readonly cone: VolcanoMesh;
  /** The crater's glow and a few puffs of ash over it, which show it from afar. */
  readonly glow: THREE.Sprite;
  readonly puffs: THREE.Sprite[];
  /** A unit tangent at the summit, the way the wind takes the ash. */
  readonly downwind: THREE.Vector3;
  /** System time it was raised (-Infinity: long settled). */
  readonly bornAt: number;
  /** The ground's radius under the summit, and how far the crater floor rises over it at full height. */
  readonly ground: number;
  readonly rise: number;
}

/** True for gas giants, which are drawn as banded spheres instead of terrain. */
export function isGas(config: PlanetConfig): config is PlanetConfig & { bands: string[] } {
  return config.bands != null && config.bands.length > 0;
}

/**
 * A low-poly planet or moon on a circular orbit. Its collider is a kinematic
 * body driven along the orbit; the mesh is interpolated. Positions are a pure
 * function of the system clock (see StarSystem), and moons orbit their parent.
 */
export class Planet implements Entity, CelestialBody {
  /** Positioned at the interpolated orbit position. */
  readonly object = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  private readonly climateLine: string | undefined;
  /** Picked as a sphere this big when it's more than the body (a comet's coma); else its radius. */
  pickRadius: number | undefined = undefined;
  /**
   * When set, the surface's spin is this function of the system (render)
   * time instead of turning at the body's own rate, e.g. to follow the planet
   * level's slower spin while both show the same globe.
   */
  spinAt: ((time: number) => number) | null = null;
  private readonly surface: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** Lava worlds and moons: the animated seas. */
  private readonly lava: LavaLook | null;
  /** Gas and ice giants: the cloud tops. */
  readonly gas: GasLook | null;
  /** Icy bodies: snow, glacier ice, frozen seas and lineae. */
  private readonly ice: IceLook | null;
  /** Bodies with weather: the clouds, storms and lightning (see gen/weather.ts). */
  readonly weather: WeatherLook | null;
  private readonly body: RAPIER.RigidBody;
  private readonly prev = new THREE.Vector3();
  private readonly parentPosition = new THREE.Vector3();
  /** What it was before it was busted, e.g. "Terran world · 1 moon". */
  private readonly whole: string;
  /** Holds the surface and rings, leaning with the axis. */
  private readonly tilted = new THREE.Group();
  private readonly atmosphere: THREE.Object3D | null = null;
  /** Once busted by a planet buster: its debris and the system time of the blast. */
  private debris: DebrisField | null = null;
  private blastTime = 0;
  /** Volcanoes raised on it, and their glows' texture (made with the first). */
  private readonly volcanoes: SystemVolcano[] = [];
  private volcanoGlow: THREE.Texture | null = null;
  /** The system time it was last shown at. */
  private lastTime = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    readonly config: PlanetConfig,
    description: string,
    readonly standoff: number,
    /** Lights the atmosphere (the main star). */
    private readonly sun: AtmosphereSun,
    /** The planet a moon orbits; null for planets. */
    readonly parent: Planet | null = null,
  ) {
    const { radius, seed, style } = config;
    this.whole = description;
    this.climateLine = config.climate
      ? describeClimate(config.climate) + (config.life ? ` · ${describeLife(config.life)}` : '')
      : undefined;
    const gas = isGas(config);
    this.lava = gas ? null : createLavaLook(config, COARSE_VENT_RADIUS);
    this.surface = new THREE.Mesh(
      gas
        ? createGasGeometry(radius, seed, config.bands, GAS_SEGMENTS, config.size === 'iceGiant')
        : createTerrainGeometry(radius, seed, style, { segments: terrainSegments(config, this.lava !== null), noise: surfaceNoise(config, false), shape: config.shape }),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    );
    // Lava seas glow on the terrain's own flat sea.
    this.lava?.paintTerrain(this.surface.material, radius);
    // Water seas are as glossy as low orbit's from afar, so the sun's glint carries across the zoom.
    applySeaGlint(this.surface.material, config, radius);
    // Ice worlds' snow, glacier ice, frozen seas and lineae, as low orbit draws them, averaged.
    this.ice = gas ? null : createIceLook(config);
    this.ice?.applyGround(this.surface.material, radius, radius * style.relief, true, PLANET_SCALE);
    // Green worlds' grass, soil, sand, rock and snow, as low orbit draws them, averaged.
    if (!gas) createGroundLook(config)?.apply(this.surface.material, radius, radius * style.relief, PLANET_SCALE, false);
    this.gas = createGasLook(config);
    this.gas?.apply(this.surface.material);
    // Clouds turn with the ground; the same layer as low orbit's, in planet radii.
    this.weather = gas ? null : createWeatherLook(config, this.lava?.activity ?? null);
    if (this.weather) this.surface.add(this.weather.createCloudLayer(radius / globeRadius(radius), CLOUD_SEGMENTS, sun));

    // The tilted group holds everything aligned with the equator: surface and rings.
    const tilted = this.tilted;
    tilted.rotation.z = config.tilt ?? 0;
    tilted.add(this.surface);
    if (config.rings) tilted.add(createRings(config.rings, seed));
    this.object.add(tilted);
    const look = config.atmosphere && config.climate ? atmosphereLook(config.climate, radius) : null;
    if (look) this.object.add((this.atmosphere = createAtmosphere(radius, config.atmosphere!, look, sun)));

    this.object.name = config.name;
    this.positionAt(0, this.position);
    this.prev.copy(this.position);
    this.object.position.copy(this.position);
    scene.add(this.object);

    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.position.x, this.position.y, this.position.z),
    );
    physics.world.createCollider(RAPIER.ColliderDesc.ball(radius), this.body);
  }

  get name(): string {
    return this.config.name;
  }

  /** Its radius; once busted, the debris field's (bigger: the ship hovers above it and dives into it). */
  get radius(): number {
    return this.debris ? this.config.radius * DEBRIS_REACH : this.config.radius;
  }

  /** e.g. "Terran world · 1 moon", or "Debris field · was a terran world" once busted. */
  get description(): string {
    if (!this.debris) return this.whole;
    const was = this.whole.split(' · ')[0]!.toLowerCase();
    return `Debris field · was ${/^[aeiou]/.test(was) ? 'an' : 'a'} ${was}`;
  }

  /** The climate line of the tooltip, e.g. "−140 °C · thin N₂ atmosphere". */
  get details(): string | undefined {
    return this.debris ? 'Blown apart by a planet buster' : this.climateLine;
  }

  /** The system time it was blown apart by a planet buster, or null if it's whole. */
  get blastedAt(): number | null {
    return this.debris ? this.blastTime : null;
  }

  /** True once a planet buster has blown it apart. */
  get busted(): boolean {
    return this.debris !== null;
  }

  /**
   * Blows it apart (once): from then on it's a debris field, thrown out by a
   * blast at system time `blastTime` (gen/debris.ts). The rings stay.
   */
  bust(blastTime: number): void {
    if (this.debris) return;
    this.blastTime = blastTime;
    // Nothing of it is left, not even its rings: the debris ploughs through them at escape speed, with ~10⁸ times their mass.
    for (const child of this.tilted.children) child.visible = false;
    if (this.atmosphere) this.atmosphere.visible = false;
    const { config } = this;
    this.debris = new DebrisField(config.seed, config.style, config.bands, config.radius, DEBRIS_FAR, this.sun, debrisLookFor(config));
    this.tilted.add(this.debris.object);
  }

  get renderPosition(): THREE.Vector3 {
    return this.object.position;
  }

  /** The volcanoes raised on it by volcano bombs, oldest first (none once busted). */
  get volcanoSites(): VolcanoSite[] {
    return this.debris ? [] : this.volcanoes.map((v) => v.cone.shape.site);
  }

  /**
   * Shows a volcano raised at `site` (by a volcano bomb in low orbit) at
   * system time `bornAt`, rising and erupting with the clock; null for one
   * long settled. The same cone as low orbit's (planet/Volcanoes.ts), true
   * to scale in this view's units, standing on this globe's coarse facets,
   * with its crater's glow and a few ash puffs.
   * Nothing on a gas giant or once busted.
   */
  addVolcano(site: VolcanoSite, bornAt: number | null): void {
    if (this.debris || isGas(this.config)) return;
    const { config } = this;
    // Its shape comes from low orbit's ground, in planet units, exactly as there.
    const R = globeRadius(config.radius);
    const sea = config.style.sea !== null;
    const near = terrainSampler(R, config.seed, config.style, { noise: surfaceNoise(config, true), reliefScale: RELIEF_SCALE, seaFloor: sea, shape: config.shape });
    const paint = terrainSampler(config.radius, config.seed, config.style, { noise: surfaceNoise(config, false), shape: config.shape });
    const color = new THREE.Color();
    const centre = new THREE.Vector3(site.x, site.y, site.z).normalize();
    const shape = new VolcanoShape(site, R, near(centre, color), sea ? R : null);
    const ground = facetGround(this.surface.geometry, shape);
    const cone = new VolcanoMesh(shape, VOLCANO_RINGS, VOLCANO_SEGMENTS, {
      ground: (dir, out) => {
        paint(dir, out);
        return ground(dir);
      },
      // How far it stands over the ground (or the sea) in low orbit, in this view's units.
      rise: (dir, s, azimuth) => {
        const floor = near(dir, color);
        return (floor + shape.height * shape.profile(s, azimuth) - (sea ? Math.max(floor, R) : floor)) / PLANET_SCALE;
      },
      footSink: VOLCANO_FOOT_SINK,
    });
    this.volcanoGlow ??= createGlowTexture();
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.volcanoGlow,
        color: '#ff6a1e',
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    // Over the clouds, like low orbit's: you can see where it is under them.
    glow.renderOrder = CLOUD_RENDER_ORDER + 0.5;
    glow.position.copy(centre);
    const puffs = Array.from({ length: VOLCANO_PUFFS }, () => {
      const puff = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.volcanoGlow, color: '#4e4844', depthWrite: false, transparent: true }),
      );
      puff.renderOrder = CLOUD_RENDER_ORDER + 0.6;
      return puff;
    });
    const downwind = shape.tangent.clone().multiplyScalar(Math.cos(site.seed)).addScaledVector(shape.bitangent, Math.sin(site.seed));
    this.surface.add(cone.mesh, glow, ...puffs);
    this.volcanoes.push({ cone, glow, puffs, downwind, bornAt: bornAt ?? -Infinity, ground: ground(centre), rise: cone.summitRise });
    this.poseVolcanoes(this.lastTime);
  }

  /** Volcanoes risen and erupting as at system time `time`. */
  private poseVolcanoes(time: number): void {
    for (const v of this.volcanoes) {
      const age = time - v.bornAt;
      const growth = volcanoGrowth(age);
      v.cone.shape.growth = growth;
      v.cone.setGrowth(growth);
      v.cone.animate(time, age);
      const strength = eruptionStrength(Number.isFinite(age) ? age : 1e9);
      const flicker = 0.85 + 0.1 * Math.sin(time * 11.3) + 0.05 * Math.sin(time * 23.9 + 0.7);
      const size = v.cone.shape.baseRadius / PLANET_SCALE;
      const vent = v.ground + growth * v.rise;
      v.glow.position.setLength(vent);
      v.glow.scale.setScalar(size * (0.6 + 0.8 * strength) * Math.min(1, growth * 2));
      v.glow.material.opacity = Math.min(1, (0.5 + 0.5 * strength) * flicker);
      // Ash rising out of the crater, spreading and drifting downwind as it fades.
      const centre = v.cone.shape.centre;
      for (let k = 0; k < v.puffs.length; k++) {
        const puff = v.puffs[k]!;
        const a = (((time / PUFF_PERIOD + k / v.puffs.length) % 1) + 1) % 1;
        puff.position
          .copy(centre)
          .multiplyScalar(vent + size * (0.2 + 1.6 * a))
          .addScaledVector(v.downwind, size * 0.9 * a * a);
        puff.scale.setScalar(size * (0.35 + 0.9 * a));
        puff.material.opacity = Math.min(1, growth * 2) * (0.35 + 0.65 * strength) * Math.min(1, a / 0.15) * (1 - a) * 0.9;
      }
    }
  }

  /** How far the surface has turned about the (tilted) axis, in radians. */
  get spinAngle(): number {
    return this.surface.rotation.y;
  }

  set spinAngle(angle: number) {
    this.surface.rotation.y = angle % (Math.PI * 2);
  }

  /** Where the body is at system time `time` (around its parent, for moons). */
  positionAt(time: number, out: THREE.Vector3): THREE.Vector3 {
    if (this.config.path) return keplerPosition(this.config.path, time, out);
    orbitPosition(this.config.orbit, time, out);
    if (this.parent) out.add(this.parent.positionAt(time, this.parentPosition));
    return out;
  }

  /** One fixed step: moves to where the orbit is at `time` (the clock after the step). */
  step(time: number, dt: number): void {
    this.prev.copy(this.position);
    this.positionAt(time, this.position);
    this.velocity.subVectors(this.position, this.prev).divideScalar(dt);
    this.body.setNextKinematicTranslation(this.position);
  }

  /** Jumps straight to `time` (the clock was changed elsewhere), with no interpolation from before. */
  jumpTo(time: number, dt: number): void {
    // Start one step back, so the step gives the right velocity.
    this.positionAt(time - dt, this.position);
    this.step(time, dt);
    this.prev.copy(this.position);
    this.body.setTranslation(this.position, true);
    this.object.position.copy(this.position);
    this.object.scale.setScalar(1);
  }

  update(frameDt: number, alpha: number): void {
    this.object.position.lerpVectors(this.prev, this.position, alpha);
    this.surface.rotation.y += this.config.spin * frameDt;
  }

  /** Animated surfaces (lava seas, gas giants' clouds), weather and volcanoes at system time `time`. */
  animate(time: number): void {
    this.lastTime = time;
    if (this.debris) {
      // Turning with the old surface, as low orbit's field does in the body frame.
      this.debris.object.rotation.y = this.surface.rotation.y;
      this.debris.animate(time - this.blastTime);
      return;
    }
    this.lava?.animate(time);
    this.gas?.animate(time);
    this.weather?.animate(time);
    if (this.volcanoes.length > 0) this.poseVolcanoes(time);
  }

  dispose(): void {
    for (const v of this.volcanoes) for (const sprite of [v.glow, ...v.puffs]) sprite.material.dispose();
    this.volcanoGlow?.dispose();
    this.debris?.dispose();
    this.gas?.dispose();
    this.ice?.dispose();
    this.scene.remove(this.object);
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.physics.world.removeRigidBody(this.body);
  }
}

/**
 * The radius of a globe's surface as drawn (its coarse facets) in unit
 * directions round a volcano, for its cone to stand on: a ray from outside
 * against the triangles of `geometry` near it. Falls back to the nearest
 * vertex's radius if a ray misses.
 */
function facetGround(geometry: THREE.BufferGeometry, shape: VolcanoShape): (dir: THREE.Vector3) => number {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const index = geometry.index;
  const count = index ? index.count : pos.count;
  const vertex = (i: number) => (index ? index.getX(i) : i);
  // Triangles with a corner within reach of the footprint (a facet spans at most ~0.3 rad).
  const reach = Math.cos(Math.min(Math.PI, shape.angle + 0.35));
  const near: THREE.Triangle[] = [];
  const v = new THREE.Vector3();
  for (let t = 0; t < count; t += 3) {
    const corners = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, vertex(t + k)));
    if (corners.some((c) => v.copy(c).normalize().dot(shape.centre) > reach)) near.push(new THREE.Triangle(corners[0], corners[1], corners[2]));
  }
  let outer = 0;
  for (const tri of near) outer = Math.max(outer, tri.a.length(), tri.b.length(), tri.c.length());
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  return (dir) => {
    ray.origin.copy(dir).multiplyScalar(outer * 2);
    ray.direction.copy(dir).negate();
    let best = -Infinity;
    for (const tri of near) {
      if (ray.intersectTriangle(tri.a, tri.b, tri.c, false, hit)) best = Math.max(best, hit.length());
    }
    if (best > 0) return best;
    let closest = -2;
    for (const tri of near) {
      for (const c of [tri.a, tri.b, tri.c]) {
        const d = v.copy(c).normalize().dot(dir);
        if (d > closest) {
          closest = d;
          best = c.length();
        }
      }
    }
    return best;
  };
}
