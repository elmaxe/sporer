import {
  atmosphereTint,
  climateSetting,
  climateSettingOf,
  climateState,
  climateStateOf,
  earthRadii,
  evaluateClimate,
  generateClimate,
  type BodyKind,
  type ClimateBody,
  type ClimateData,
  type ClimateSetting,
  type ClimateState,
  type StateSpec,
} from '../gen/climate';
import { hexToRgb, rgbToHex } from '../gen/color';
import { NAMED_RADIUS_KM, asteroidBody, asteroidRadius, type AsteroidClass } from '../gen/belts';
import { NUCLEUS_RADIUS, cometNucleus } from '../gen/comets';
import { perihelion, type Orbit } from '../gen/orbit';
import {
  MOON_RADIUS,
  SIZE_CLASSES,
  SIZE_CLASS_RADIUS,
  chooseSizeClass,
  choosePlanetType,
  gasBands,
  gasStyle,
  isGiant,
  logRange,
  planetRadius,
  planetStyle,
  type MoonType,
  type PlanetStyle,
  type PlanetType,
  type SizeClass,
} from '../gen/planets';
import { Rng, hashSeed } from '../gen/rng';
import type { ShapeData } from '../gen/shape';
import { nominalStar, type StarKind, type SpectralClass } from '../gen/stars';
import { assessLife, moonDistance, type LifeEstimate, type LifeHost, type LifeStar } from '../gen/life';
import {
  describePlanet,
  describeSized,
  generateMoons,
  generateRings,
  generateSolidRings,
  solidRingColor,
  type MoonData,
  type RingData,
  type SystemData,
} from '../gen/system';
import { cometConfig } from '../world/Comet';
import { asteroidConfig } from '../world/AsteroidBelt';
import type { PlanetConfig } from '../world/Planet';

/*
 * The planet lab's model (see lab/PlanetLab.ts): one planet or moon with
 * everything the renderer and the climate take, editable field by field, and
 * made from the game's own generators so a lab planet is a game planet. Pure
 * data, no THREE, unit-tested in tests/lab.test.ts.
 */

/** A size class, a moon, or an irregular small body (a comet's nucleus or an asteroid). */
export type LabKind = BodyKind | SmallKind;
export type SmallKind = 'comet' | 'asteroid';
export const LAB_KINDS: readonly LabKind[] = [...SIZE_CLASSES, 'moon', 'comet', 'asteroid'];

/** True for the irregular small bodies (comets and asteroids), which have a shape and no climate. */
export function isSmallKind(kind: LabKind): kind is SmallKind {
  return kind === 'comet' || kind === 'asteroid';
}
export const LAB_TYPES: readonly PlanetType[] = ['lava', 'barren', 'desert', 'terran', 'ocean', 'ice', 'gas'];
export const SOLID_KINDS: readonly SizeClass[] = ['dwarf', 'small', 'earth', 'superEarth'];

/** A solid body's climate as its two editable halves; everything else is derived (evaluateClimate). */
export interface LabClimate {
  setting: ClimateSetting;
  state: ClimateState;
}

export interface LabPlanet {
  name: string;
  type: PlanetType;
  /** Size class, or 'moon' (moons can have geysers from tidal heat, and no moons of their own). */
  kind: LabKind;
  /** System units (Earth 8). */
  radius: number;
  seed: number;
  /** Radians per second. */
  spin: number;
  /** Axial tilt, radians. */
  tilt: number;
  style: PlanetStyle;
  /** Gas giant bands, darkest first; null for solid bodies. */
  bands: string[] | null;
  /** Atmosphere glow colour, or null for none. */
  atmosphere: string | null;
  rings: RingData | null;
  /** Null for gas giants. */
  climate: LabClimate | null;
  /** Shown in the lab's system view. */
  moons: MoonData[];
  /** Comets: the nucleus's irregular shape (gen/shape.ts); null for round bodies. */
  shape: ShapeData | null;
  /** Comets: how far from the star, in habitable radii (≈ AU), which sets how active it is. */
  zone: number;
  /** A game body's system for its chance of life: its stars and, for a moon, its planet. Absent: lit by the lab's star, no host. */
  home?: { stars: LifeStar[]; host: LifeHost | null } | null;
}

/** A comet's distance from the star in the lab by default (habitable radii): fully active, as at a close pass. */
export const LAB_COMET_ZONE = 1.2;

/** Stars the lab can light a planet with. */
export type LabStar = SpectralClass | Exclude<StarKind, 'mainSequence'>;
export const LAB_STARS: readonly LabStar[] = ['O', 'B', 'A', 'F', 'G', 'K', 'redDwarf', 'whiteDwarf', 'redGiant', 'blueGiant'];

/** The lab's view options (not part of the planet). */
export interface LabView {
  /** 'globe': low orbit (the planet level's globe); 'system': the system view's body with its moons. */
  view: 'globe' | 'system';
  /** 'orbit': the camera circles the planet's centre; 'fly': it follows the UFO, like in the game. */
  camera: 'orbit' | 'fly';
  /** The Equal Earth map (globe view). */
  map: boolean;
  star: LabStar;
  /** Where the sun is, degrees: around the axis, and above the equator (the subsolar latitude). */
  sunAzimuth: number;
  sunElevation: number;
  /** Globe view: the sun goes round as the planet turns (at the planet level's slowed spin). */
  dayCycle: boolean;
  paused: boolean;
  /** Clock rate: 1 = game time. */
  speed: number;
  wireframe: boolean;
  axes: boolean;
  starfield: boolean;
  /** Editing the radius, type or size recomputes gravity, escape velocity and heat flow. */
  autoSetting: boolean;
}

export const DEFAULT_VIEW: LabView = {
  view: 'globe',
  camera: 'orbit',
  map: true,
  star: 'G',
  sunAzimuth: 35,
  sunElevation: 15,
  dayCycle: false,
  paused: false,
  speed: 1,
  wireframe: false,
  axes: false,
  starfield: true,
  autoSetting: true,
};

/**
 * Where a planet loaded from the game came from: planet `planet` (or its moon
 * `moon`, comet `comet`, or named asteroid `asteroid` of belt `belt`) of star
 * `star` in galaxy `seed`.
 */
export interface LabSource {
  seed: string;
  star: number;
  planet: number;
  moon?: number;
  comet?: number;
  belt?: number;
  asteroid?: number;
}

/** Everything a lab link carries. */
export interface LabState {
  planet: LabPlanet;
  view: LabView;
  source?: LabSource;
}

/** A body at rest at the origin. */
export const STILL_ORBIT: Orbit = { radius: 0, period: 1, phase: 0, inclination: 0 };

/**
 * Distance from the star, in habitable-zone radii, where each type is typical
 * (the zones of gen/planets.ts's type weights). Starlight is 1 / zone².
 */
export const TYPICAL_ZONE: Record<PlanetType, number> = {
  lava: 0.35,
  desert: 0.9,
  barren: 1.2,
  terran: 1,
  ocean: 1,
  ice: 2.5,
  gas: 2.5,
};

/** A lab moon's planet, for its tidal heating: a Jupiter-like giant with the moon close in. */
export const LAB_MOON_HOST: NonNullable<ClimateBody['host']> = { radius: 25, size: 'gasGiant', orbitRadius: 45 };

/** Radius range (system units) the lab offers for a kind. */
export function kindRadiusRange(kind: LabKind): readonly [number, number] {
  if (kind === 'comet') return NUCLEUS_RADIUS;
  if (kind === 'asteroid') return [asteroidRadius(NAMED_RADIUS_KM.main[0]), asteroidRadius(NAMED_RADIUS_KM.kuiper[1])];
  return kind === 'moon' ? [MOON_RADIUS.min, MOON_RADIUS.max] : SIZE_CLASS_RADIUS[kind];
}

/** Moon types the game generates (a lab moon may be any solid type). */
const MOON_TYPES: readonly (readonly [MoonType, number])[] = [
  ['barren', 6],
  ['ice', 3],
  ['lava', 1],
];

export interface GenerateOptions {
  type?: PlanetType;
  kind?: LabKind;
  /** Starlight relative to Earth; default: 1 / TYPICAL_ZONE² for the type. */
  insolation?: number;
  /** Moons around a planet; default: drawn like the game does. */
  moons?: number;
}

/**
 * A new planet from `seed` with the game's generators: size class and type
 * as the game would draw them (or as given), then radius, colours, rings,
 * climate, atmosphere and moons, each from its own stream so fixing one
 * choice doesn't change the others.
 */
export function generateLabPlanet(seed: number, options: GenerateOptions = {}): LabPlanet {
  const rng = new Rng(seed >>> 0);
  if (options.kind === 'comet' && options.type !== 'gas') return labComet(seed);
  if (options.kind === 'asteroid' && options.type !== 'gas') return labAsteroid(seed);
  const [type, kind] = resolveTypeAndKind(rng, options.type, options.kind);
  const radius = kind === 'moon' ? moonRadius(rng.fork('radius')) : planetRadius(rng.fork('radius'), kind);
  const { style, bands } = labStyle(seed, type, kind);
  const insolation = options.insolation ?? 1 / TYPICAL_ZONE[type] ** 2;
  const spinRng = rng.fork('spin');
  const planet: LabPlanet = {
    name: `Lab ${seed}`,
    type,
    kind,
    radius,
    seed: seed >>> 0,
    spin: spinRng.range(0.05, 0.35) * spinRng.sign(),
    tilt: kind === 'moon' ? 0 : rng.fork('tilt').gaussian(0, 0.2),
    style,
    bands,
    atmosphere: null,
    rings: kind === 'moon' ? null : labRings(seed, type, radius, style),
    climate: null,
    moons: [],
    shape: null,
    zone: Math.sqrt(1 / insolation),
  };
  const climated = withGeneratedClimate(planet, insolation);
  return kind === 'moon' ? climated : withMoons(climated, options.moons);
}

/** A comet's nucleus from `seed`, as the game makes them (gen/comets.ts), close to the star. */
export function labComet(seed: number): LabPlanet {
  const rng = new Rng(seed >>> 0);
  const nucleus = cometNucleus(rng.fork('nucleus'));
  return {
    name: `Lab ${seed}`,
    type: 'barren',
    kind: 'comet',
    radius: rng.fork('radius').range(...NUCLEUS_RADIUS),
    seed: seed >>> 0,
    spin: nucleus.spin,
    tilt: nucleus.tilt,
    style: nucleus.style,
    bands: null,
    atmosphere: null,
    rings: null,
    climate: null,
    moons: [],
    shape: nucleus.shape,
    zone: LAB_COMET_ZONE,
  };
}

/** Asteroid classes the lab draws from, by weight: the main belt's stony and dark ones most. */
const LAB_ASTEROID_CLASSES: readonly (readonly [AsteroidClass, number])[] = [
  ['stony', 3],
  ['carbon', 4],
  ['dtype', 1],
  ['icy', 1],
];

/** A named asteroid from `seed`, as the game makes them (gen/belts.ts): a main-belt one, of a drawn class. */
export function labAsteroid(seed: number): LabPlanet {
  const rng = new Rng(seed >>> 0);
  const kind = rng.fork('class').weighted(LAB_ASTEROID_CLASSES);
  const body = asteroidBody(rng.fork('asteroid'), kind === 'icy' ? 'kuiper' : kind === 'dtype' ? 'trojan' : 'main', kind);
  return {
    name: `Lab ${seed}`,
    type: 'barren',
    kind: 'asteroid',
    radius: body.radius,
    seed: seed >>> 0,
    spin: body.spin,
    tilt: body.tilt,
    style: body.style,
    bands: null,
    atmosphere: null,
    rings: null,
    climate: null,
    moons: [],
    shape: body.shape,
    zone: TYPICAL_ZONE.barren,
  };
}

/** A new small body of `kind` from `seed`. */
function labSmall(seed: number, kind: SmallKind): LabPlanet {
  return kind === 'comet' ? labComet(seed) : labAsteroid(seed);
}

/** True for the gas and ice giants' size classes. */
export function giantKind(kind: LabKind): boolean {
  return kind !== 'moon' && !isSmallKind(kind) && isGiant(kind);
}

function resolveTypeAndKind(rng: Rng, type: PlanetType | undefined, wanted: LabKind | undefined): [PlanetType, BodyKind] {
  const kind = wanted && isSmallKind(wanted) ? undefined : wanted;
  const zone = rng.fork('zone').range(0.3, 4);
  if (type === 'gas') return ['gas', kind && kind !== 'moon' && isGiant(kind) ? kind : 'gasGiant'];
  if (kind && kind !== 'moon' && isGiant(kind)) return ['gas', kind];
  if (type) return [type, kind ?? rng.fork('size').pick(SOLID_KINDS)];
  if (kind === 'moon') return [rng.fork('type').weighted(MOON_TYPES), 'moon'];
  const size = kind ?? chooseSizeClass(rng.fork('size'), zone);
  return [choosePlanetType(rng.fork('type'), zone, size), size];
}

function moonRadius(rng: Rng): number {
  return logRange(rng, 1.5, MOON_RADIUS.max);
}

/** Colours and terrain for a type (the game's planetStyle / gasBands), from the seed. */
export function labStyle(seed: number, type: PlanetType, kind: LabKind): { style: PlanetStyle; bands: string[] | null } {
  const rng = new Rng(hashSeed(seed, 'style', type));
  if (type === 'gas') {
    const bands = gasBands(rng, kind === 'iceGiant');
    return { style: gasStyle(bands), bands };
  }
  return { style: planetStyle(rng, type), bands: null };
}

/** Rings as the game would give this planet (or null). `force` always gives some. */
export function labRings(seed: number, type: PlanetType, radius: number, style: PlanetStyle, force = false): RingData | null {
  const rng = new Rng(hashSeed(seed, 'rings'));
  if (type === 'gas') return force || rng.chance(0.45) ? generateRings(rng.fork('gas'), radius) : null;
  const rings = generateSolidRings(rng.fork('solid'), type, radius) ?? (force ? defaultSolidRings(radius) : null);
  if (rings) rings.color = solidRingColor(rng.fork('color'), type, style);
  return rings;
}

function defaultSolidRings(radius: number): RingData {
  return { inner: radius * 1.4, outer: radius * 1.85, color: '', opacity: 0.5 };
}

/** The setting the game would give this body (gravity, escape velocity, heat flow), at `insolation`. */
export function labSetting(planet: Pick<LabPlanet, 'type' | 'kind' | 'radius' | 'seed'>, insolation: number): ClimateSetting {
  if (planet.type === 'gas') return { insolation, gravity: 1, escapeVelocity: 11.2, heatFlow: 0 };
  return climateSetting(climateBody(planet, insolation), new Rng(hashSeed(planet.seed, 'heat')));
}

function climateBody(planet: Pick<LabPlanet, 'type' | 'kind' | 'radius'>, insolation: number): ClimateBody {
  return {
    type: planet.type as ClimateBody['type'],
    // Comets have no climate, so never get here.
    kind: planet.kind as BodyKind,
    radius: planet.radius,
    insolation,
    host: planet.kind === 'moon' ? LAB_MOON_HOST : undefined,
  };
}

/** A fresh climate and atmosphere tint for the planet's type and size, as generation would draw them. */
export function withGeneratedClimate(planet: LabPlanet, insolation: number): LabPlanet {
  if (planet.type === 'gas' || isSmallKind(planet.kind)) return { ...planet, climate: null, atmosphere: null };
  const rng = new Rng(hashSeed(planet.seed, 'climate', planet.type));
  const climate = generateClimate(rng, climateBody(planet, insolation));
  return {
    ...planet,
    climate: { setting: settingOf(climate), state: climateState(climate) },
    atmosphere: atmosphereTint(rng.fork('tint'), climate),
  };
}

/** Moons as the game would give this planet (`count` of them, or a drawn number); none for a moon. */
export function withMoons(planet: LabPlanet, count?: number): LabPlanet {
  const { kind } = planet;
  if (kind === 'moon' || isSmallKind(kind)) return { ...planet, moons: [] };
  const rng = new Rng(hashSeed(planet.seed, 'moons'));
  const insolation = planet.climate?.setting.insolation ?? 1 / TYPICAL_ZONE[planet.type] ** 2;
  const moons = generateMoons(rng, planet.name, kind, planet.radius, planet.rings, count).map((moon, j): MoonData => {
    const crng = rng.fork('climate', j);
    const climate = generateClimate(crng, {
      type: moon.type,
      kind: 'moon',
      radius: moon.radius,
      insolation,
      host: { radius: planet.radius, size: kind, orbitRadius: moon.orbit.radius },
    });
    return { ...moon, atmosphere: atmosphereTint(crng, climate), climate };
  });
  return { ...planet, moons };
}

/**
 * The planet as another type, keeping its seed, size (a giant becomes a
 * super-Earth and a solid world a gas giant), starlight, spin and tilt: new
 * colours, climate and atmosphere for the type, rings kept (recoloured).
 */
export function withType(planet: LabPlanet, type: PlanetType): LabPlanet {
  // A small body keeps its shape and takes the type's colours (a gas one becomes a gas giant).
  if (isSmallKind(planet.kind) && type !== 'gas') return { ...planet, type, style: labStyle(planet.seed, type, planet.kind).style };
  if (isSmallKind(planet.kind)) return withType({ ...planet, kind: 'gasGiant', shape: null }, type);
  const giant = giantKind(planet.kind);
  let kind = planet.kind;
  if (type === 'gas' && !giant) kind = 'gasGiant';
  if (type !== 'gas' && giant) kind = 'superEarth';
  const radius = inRange(planet.radius, kind) ? planet.radius : classMiddle(kind);
  const { style, bands } = labStyle(planet.seed, type, kind);
  const rings = planet.rings && kind !== 'moon' ? recolourRings(planet, type, radius, style) : null;
  const next = withGeneratedClimate({ ...planet, type, kind, radius, style, bands, rings }, insolationOf(planet));
  return kind === 'moon' ? { ...next, moons: [] } : next;
}

/** The planet as another size class (or a moon), its radius moved into the class and its setting recomputed. */
export function withKind(planet: LabPlanet, kind: LabKind): LabPlanet {
  if (isSmallKind(kind)) return planet.kind === kind ? planet : { ...labSmall(planet.seed, kind), name: planet.name };
  if (isSmallKind(planet.kind)) {
    // Round again, with the climate a body of the class gets this far from the star.
    const round: LabPlanet = { ...planet, kind, shape: null, radius: classMiddle(kind) };
    return withKind(withGeneratedClimate(round, 1 / planet.zone ** 2), kind);
  }
  const giant = giantKind(kind);
  if (giant !== (planet.type === 'gas')) return withType({ ...planet, kind }, giant ? 'gas' : 'terran');
  const radius = inRange(planet.radius, kind) ? planet.radius : classMiddle(kind);
  const next: LabPlanet = { ...planet, kind, radius, moons: kind === 'moon' ? [] : planet.moons };
  if (kind === 'moon') next.rings = null;
  if (planet.type === 'gas' && planet.bands) {
    // Ice giants are mostly blue, gas giants mostly brown: new bands for the class.
    const { style, bands } = labStyle(planet.seed, 'gas', kind);
    next.style = style;
    next.bands = bands;
  }
  return withAutoSetting(next);
}

/** The setting recomputed from the radius, type and kind (keeping the starlight). */
export function withAutoSetting(planet: LabPlanet): LabPlanet {
  if (!planet.climate) return planet;
  return { ...planet, climate: { ...planet.climate, setting: labSetting(planet, planet.climate.setting.insolation) } };
}

/** The atmosphere glow the game would draw for the current climate (null when too thin to see). */
export function climateTint(planet: LabPlanet): string | null {
  const climate = labClimateData(planet);
  return climate ? atmosphereTint(new Rng(hashSeed(planet.seed, 'climate', planet.type)).fork('tint'), climate) : null;
}

function recolourRings(planet: LabPlanet, type: PlanetType, radius: number, style: PlanetStyle): RingData {
  const rings = planet.rings!;
  const k = radius / planet.radius;
  const color = labRings(planet.seed, type, radius, style, true)!.color;
  return { ...rings, inner: rings.inner * k, outer: rings.outer * k, color };
}

function insolationOf(planet: LabPlanet): number {
  return planet.climate?.setting.insolation ?? 1 / TYPICAL_ZONE[planet.type] ** 2;
}

function inRange(radius: number, kind: LabKind): boolean {
  const [min, max] = kindRadiusRange(kind);
  return radius >= min && radius <= max;
}

/** Geometric middle of a kind's radius range. */
export function classMiddle(kind: LabKind): number {
  const [min, max] = kindRadiusRange(kind);
  return Math.sqrt(min * max);
}

function settingOf(c: ClimateSetting): ClimateSetting {
  return { insolation: c.insolation, gravity: c.gravity, escapeVelocity: c.escapeVelocity, heatFlow: c.heatFlow };
}

// --- Views of the model ---

/** The full climate (derived values included), or null for gas giants. */
export function labClimateData(planet: LabPlanet): ClimateData | null {
  if (planet.type === 'gas' || !planet.climate) return null;
  return evaluateClimate(planet.climate.setting, planet.climate.state);
}

/** The chance of life on a lab planet: in its game system if it came from one, else lit by the lab's `star`; null for gas giants. */
export function labLife(planet: LabPlanet, star: LabStar): LifeEstimate | null {
  const climate = labClimateData(planet);
  if (!climate || planet.type === 'gas' || isSmallKind(planet.kind)) return null;
  const nominal = star.length === 1 ? nominalStar('mainSequence', star as SpectralClass) : nominalStar(star as StarKind);
  const stars = planet.home?.stars ?? [nominal];
  return assessLife({ type: planet.type, climate, stars, host: planet.home?.host ?? null });
}

/** What the game's renderers take, at rest at the origin. */
export function toPlanetConfig(planet: LabPlanet): PlanetConfig {
  const gas = planet.type === 'gas';
  return {
    name: planet.name,
    type: planet.type,
    radius: planet.radius,
    seed: planet.seed,
    spin: planet.spin,
    orbit: STILL_ORBIT,
    style: planet.style,
    bands: gas ? planet.bands : null,
    size: planet.kind === 'iceGiant' || planet.kind === 'gasGiant' ? planet.kind : undefined,
    atmosphere: gas ? null : planet.atmosphere,
    rings: planet.rings,
    tilt: planet.tilt,
    climate: labClimateData(planet),
    shape: planet.shape,
    small: isSmallKind(planet.kind) ? planet.kind : null,
  };
}

/** The game's label, e.g. "Ice world · Earth-sized" or "Barren rock · moon". */
export function describeLab(planet: LabPlanet): string {
  if (planet.kind === 'comet') return planet.shape?.binary ? 'Comet nucleus · contact binary' : 'Comet nucleus';
  if (planet.kind === 'asteroid') return planet.shape?.binary ? 'Asteroid · contact binary' : 'Asteroid';
  return planet.kind === 'moon' ? `${describePlanet(planet.type)} · moon` : describeSized(planet.type, planet.kind);
}

/** Radius in Earth radii (the inverse of the game's square-root size map). */
export function labEarthRadii(planet: LabPlanet): number {
  return earthRadii(planet.radius);
}

// --- From the game ---

/** A planet or moon of the game as a lab planet: its data plus, for a planet, its moons. */
export function labFromBody(
  config: PlanetConfig & { size?: SizeClass },
  moon: boolean,
  moons: readonly MoonData[] = [],
  /** A comet's distance from the star, habitable radii (its activity in the lab). */
  zone = LAB_COMET_ZONE,
): LabPlanet {
  const climate = config.climate ?? null;
  const comet = config.small === 'comet';
  const small = config.small ?? null;
  return {
    name: config.name,
    type: config.type,
    kind: small ?? (moon ? 'moon' : (config.size ?? 'earth')),
    radius: config.radius,
    seed: config.seed,
    spin: config.spin,
    tilt: config.tilt ?? 0,
    style: { ...config.style },
    bands: config.bands ? [...config.bands] : null,
    atmosphere: config.atmosphere ?? null,
    rings: config.rings ? { ...config.rings } : null,
    climate: climate && config.type !== 'gas' ? { setting: settingOf(climate), state: climateState(climate) } : null,
    moons: moon || small ? [] : moons.map((m) => ({ ...m })),
    shape: config.shape ? structuredClone(config.shape) : null,
    zone: comet ? zone : TYPICAL_ZONE[config.type],
  };
}

/** A link to the planet lab (lab.html next to `base`, the game's page) showing `planet`. */
export function labLink(planet: LabPlanet, base: string, view: Partial<LabView> = {}): string {
  return new URL(`lab.html#${encodeLab({ planet, view: { ...DEFAULT_VIEW, ...view } })}`, base).href;
}

/** Named asteroid `asteroid` of belt `belt` of a generated system, or null if there is none. */
export function labFromAsteroid(system: SystemData, belt: number, asteroid: number): LabPlanet | null {
  const a = system.belts[belt]?.asteroids[asteroid];
  return a ? labFromBody(asteroidConfig(a), false) : null;
}

/** Comet `comet` of a generated system, as it is at its closest pass (most active), or null if there is none. */
export function labFromComet(system: SystemData, comet: number): LabPlanet | null {
  const c = system.comets[comet];
  if (!c) return null;
  return labFromBody(cometConfig(c), false, [], perihelion(c.orbit) / system.habitableRadius);
}

/** Planet `planet` of a generated system (or its moon `moon`), or null if there is none. */
export function labFromSystem(system: SystemData, planet: number, moon?: number): LabPlanet | null {
  const p = system.planets[planet];
  if (!p) return null;
  const stars = system.stars.map(({ kind, mass, luminosity }) => ({ kind, mass, luminosity }));
  if (moon === undefined) return { ...labFromBody(p, false, p.moons), home: { stars, host: null } };
  const m = p.moons[moon];
  return m ? { ...labFromBody(m, true), home: { stars, host: { size: p.size, distance: moonDistance(m, p) } } } : null;
}

// --- Links ---

/** The lab state as URL-safe text (base64url JSON), for the link's #hash. */
export function encodeLab(state: LabState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * The lab state from `encodeLab`'s text, or null if it isn't one. Missing
 * fields are filled from a generated planet of the same seed and type and
 * from the default view, so older links keep working.
 */
export function decodeLab(text: string): LabState | null {
  try {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const raw = JSON.parse(new TextDecoder().decode(bytes)) as Partial<{
      planet: Partial<LabPlanet>;
      view: Partial<LabView>;
      source: LabSource;
    }>;
    const p = raw.planet;
    if (!p || typeof p !== 'object') return null;
    const type = LAB_TYPES.includes(p.type as PlanetType) ? p.type : undefined;
    const kind = LAB_KINDS.includes(p.kind as LabKind) ? p.kind : undefined;
    const seed = typeof p.seed === 'number' && Number.isFinite(p.seed) ? p.seed : 1;
    const base = generateLabPlanet(seed, { type, kind });
    const planet: LabPlanet = { ...base, ...p, type: base.type, kind: base.kind, seed: base.seed };
    if (typeof planet.radius !== 'number' || !Number.isFinite(planet.radius) || planet.radius <= 0) planet.radius = base.radius;
    planet.style = { ...base.style, ...p.style };
    if (planet.type !== 'gas' && !planet.climate) planet.climate = base.climate;
    // Links from before the atmosphere was split into gases (and the terraforming levers) still open.
    if (planet.climate) planet.climate = { ...planet.climate, state: upgradeState(planet.climate.state, planet.climate.setting.gravity) };
    if (Array.isArray(planet.moons)) planet.moons = planet.moons.map((m) => (m.climate && !m.climate.gases ? { ...m, climate: upgradeClimate(m.climate) } : m));
    if (isSmallKind(planet.kind) && !planet.shape) planet.shape = base.shape;
    if (typeof planet.zone !== 'number' || !Number.isFinite(planet.zone)) planet.zone = base.zone;
    const state: LabState = { planet, view: { ...DEFAULT_VIEW, ...raw.view } };
    if (raw.source && typeof raw.source.star === 'number') state.source = raw.source;
    return state;
  } catch {
    return null;
  }
}

/** A climate state from a link, made whole: an older one (a pressure and a composition) is turned into gases. */
function upgradeState(state: ClimateState | StateSpec, gravity: number): ClimateState {
  const spec = state as StateSpec;
  return climateStateOf(spec.gases ? { ...spec, pressure: undefined, composition: undefined } : spec, gravity);
}

/** A moon's whole climate from an older link, re-derived from its upgraded state. */
function upgradeClimate(climate: ClimateData): ClimateData {
  return evaluateClimate(climateSettingOf(climate), upgradeState(climate as StateSpec, climate.gravity));
}

/** Mixes two hex colours (t = 0 → a). */
export function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}
