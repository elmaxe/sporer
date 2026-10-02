import { EARTH_ESCAPE_VELOCITY, EARTH_HEAT_FLOW, TIDAL_ORBIT_STRETCH, boilingPoint, type ClimateData } from './climate';
import type { MoonType, PlanetType, SizeClass } from './planets';
import { LATITUDE_SWING, growsPlants } from './plants';
import type { StarData } from './stars';
import type { MoonData, PlanetData, SystemData } from './system';

/*
 * The chance of life on a planet or moon (issue #59): how likely life as we
 * know it (water-based, carbon-based) is to be there, from what the game
 * knows of the body. Two places life could live are scored:
 *
 * - the surface: liquid water within life's temperature limits, an energy
 *   source, and a dose of ionising radiation life can bear (from cosmic
 *   rays, the star's particles and a giant host's radiation belts, shielded
 *   by the air above);
 * - underground: a sea under an ice shell (Europa, Enceladus) or water in the
 *   rock (Mars's mid-crust), wherever the internal heat melts it, fed by that
 *   heat's chemistry and shielded from radiation by the ice or rock;
 *
 * and both are scaled by the time the star gives life to start. Bodies where
 * the game grows plants have life for certain.
 *
 * Life's origin itself is unknown (one example, Earth's), so the game
 * assumes it starts wherever conditions allow: the chance is how close the
 * body's conditions come to ones where life is known to thrive, not a
 * measured probability. Every number is sourced in docs/research/life.md.
 */

// --- Water and temperature ---

/** Water's freezing point, K. */
const FREEZING = 273.15;
/**
 * Highest temperature any known organism grows at: Methanopyrus kandleri
 * strain 116 at 122 °C (Takai et al. 2008, PNAS 105:10949), K.
 */
export const LIFE_MAX_TEMPERATURE = 273.15 + 122;

// --- Body make-up (docs/research/life.md) ---

/** Earth's mean density, kg/m³ (NASA). */
const EARTH_DENSITY = 5513;
/** Io's density, kg/m³ (NASA Jovian satellite fact sheet): the reference for a dry rock-and-iron body. */
export const ROCK_DENSITY = 3530;
/** Water (liquid, or ice under pressure, ~920–1300), kg/m³. */
const WATER_DENSITY = 1000;
/** Earth's ocean mean depth, km (3682 m: Charette & Smith 2010, Oceanography 23(2)). */
const EARTH_OCEAN_DEPTH = 3.682;

/**
 * Water ice's thermal conductivity k = 567 / T W m⁻¹ K⁻¹ (Klinger 1980), so
 * a conductive shell from surface temperature T_s down to melting carries
 * F = 567 ln(273 / T_s) / d.
 */
export const ICE_CONDUCTIVITY = 567;
/**
 * Rock keeps open, water-filled pores down to this depth at Mars's gravity,
 * km: InSight found Mars's mid-crust (11.5–20 km) saturated with liquid water
 * (Wright, Manga & Panning 2024, PNAS). Pores close under the rock's weight,
 * ρ g z, so the depth scales as 1 / g.
 */
export const POROUS_DEPTH = { depth: 20, gravity: 0.379 } as const;
/** Basalt's thermal conductivity, ~2.6 W m⁻¹ K⁻¹ at 225–290 K (Halbert et al. 2022, MAPS 57:1130). */
export const ROCK_CONDUCTIVITY = 2.6;

// --- Energy ---

/** Chemical energy from inside, relative to Earth's sea floor: heat flow against Earth's. */
function chemicalEnergy(heatFlow: number): number {
  return Math.min(1, heatFlow / EARTH_HEAT_FLOW);
}

// --- Radiation (docs/research/life.md) ---

export const RADIATION = {
  /** Galactic cosmic rays in interplanetary space at 1 AU, mGy/day (MSL cruise, Zeitlin et al. 2013). */
  cosmic: 0.481,
  /** The Sun's energetic particles at 1 AU, averaged over time, mGy/day. */
  solarParticles: 0.02,
  /** Shielding by an air column x (g/cm²): dose × (1 + x / x0)^-k, through MSL cruise, Mars's surface and Earth's sea level. */
  shieldColumn: 24,
  shieldPower: 1.62,
  /** Below this, no life is harmed (Ramsar's highest natural background, ~260 mGy/yr), mGy/day. */
  harmless: 0.71,
  /** Above this, not even Deinococcus radiodurans grows (60 Gy/h chronic), mGy/day. */
  sterile: 60_000 * 24,
} as const;

/** Each star kind's energetic particles relative to the Sun's, at the same distance. */
export const STAR_PARTICLES: Record<StarData['kind'], number> = {
  mainSequence: 1,
  redDwarf: 1,
  whiteDwarf: 0,
  redGiant: 1,
  blueGiant: 1,
};

/**
 * A giant host's radiation belts: surface dose at a moon (mGy/day) falls off
 * exponentially with its orbit, ln D = a − b · (orbit in host radii), fitted to
 * Io, Europa, Ganymede and Callisto. Ice giants' belts are weaker.
 */
export const BELTS = { gasGiant: { a: 0, b: 0 }, iceGiant: { a: 0, b: 0 } } as const;

// --- Time ---

/** Main-sequence lifetime t = 10 Gyr · M^-2.5 (M in suns). */
const SUN_LIFETIME = 10;
const LIFETIME_POWER = 2.5;
/** No star is older than the galaxy's disc, Gyr. */
const MAX_AGE = 10;
/** How long Earth took to get life once it had oceans, Gyr. */
export const EMERGENCE_TIME = 0.5;
/** Time a planet spends in an evolved star's habitable zone, Gyr. */
export const EVOLVED_HZ_TIME: Record<'redGiant' | 'whiteDwarf', number> = { redGiant: 0.5, whiteDwarf: 3 };

/** A star as far as life cares. */
export type LifeStar = Pick<StarData, 'kind' | 'mass' | 'luminosity'>;

/** A moon's giant host. */
export interface LifeHost {
  size: SizeClass;
  /** The moon's orbit in host radii, as a real one (the game squeezes moon orbits, see TIDAL_ORBIT_STRETCH). */
  distance: number;
}

/** What the chance of life is worked out from. */
export interface LifeBody {
  type: Exclude<PlanetType, 'gas'> | MoonType;
  climate: ClimateData;
  /** The system's stars; none for a rogue planet. */
  stars: readonly LifeStar[];
  /** The planet a moon orbits; null for planets. */
  host: LifeHost | null;
}

export interface SurfaceHabitat {
  /** Share of the surface where water is liquid and within life's limits (0 with no water or no air). */
  area: number;
  /** Ionising dose at the surface, mGy/day. */
  dose: number;
  /** 1 harmless, 0 sterile. */
  radiation: number;
  /** 1 with starlight; else the chemical energy from inside. */
  energy: number;
  chance: number;
}

export interface SubsurfaceHabitat {
  /** Where the water lies: under an ice shell or in the rock; none without water. */
  kind: 'ocean' | 'aquifer' | 'none';
  /** Depth where it melts, km. */
  depth: number;
  /** How deep the body's water goes, km. */
  water: number;
  /** How deep water could lie: the water's depth under ice, the pores' in rock, km. */
  reach: number;
  liquid: boolean;
  energy: number;
  chance: number;
}

export interface LifeEstimate {
  /** 0–1. */
  chance: number;
  /** Plants grow here: life for certain. */
  plants: boolean;
  surface: SurfaceHabitat;
  subsurface: SubsurfaceHabitat;
  /** Chance life has had time to start, from the star's age. */
  time: number;
}

/** Radius (Earth radii) and density (kg/m³) from a climate's gravity and escape velocity. */
export function bulkOf(c: Pick<ClimateData, 'gravity' | 'escapeVelocity'>): { radius: number; density: number } {
  const radius = (c.escapeVelocity / EARTH_ESCAPE_VELOCITY) ** 2 / c.gravity;
  const mass = c.gravity * radius * radius;
  return { radius, density: (EARTH_DENSITY * mass) / radius ** 3 };
}

/** Mass fraction of water in a rock-and-water body of this density (0 for rock or denser). */
export function waterFraction(density: number): number {
  if (density >= ROCK_DENSITY) return 0;
  return Math.min(1, (1 / density - 1 / ROCK_DENSITY) / (1 / WATER_DENSITY - 1 / ROCK_DENSITY));
}

/**
 * How deep a body's water goes, km: the outer layer its density's water
 * fraction makes, or the surface inventory spread as a global layer (Earth's
 * 0.71 gives its 2.6 km), whichever is more.
 */
export function waterDepth(c: Pick<ClimateData, 'gravity' | 'escapeVelocity' | 'water'>): number {
  if (c.water <= 0) return 0;
  const { radius, density } = bulkOf(c);
  const volume = (waterFraction(density) * density) / WATER_DENSITY;
  const layer = radius * 6371 * (1 - Math.cbrt(Math.max(0, 1 - volume)));
  return Math.max(layer, c.water * EARTH_OCEAN_DEPTH);
}

/** Depth (km) where heat flow `heatFlow` melts water under a surface at `temperature`: through ice, or through rock. */
export function meltDepth(temperature: number, heatFlow: number, ice: boolean): number {
  if (temperature >= FREEZING) return 0;
  if (heatFlow <= 0) return Infinity;
  const metres = ice ? (ICE_CONDUCTIVITY * Math.log(FREEZING / temperature)) / heatFlow : (ROCK_CONDUCTIVITY * (FREEZING - temperature)) / heatFlow;
  return metres / 1000;
}

/**
 * Share of a sphere's area between latitudes where the annual mean
 * temperature (gen/plants.ts's latitude model) is within [lo, hi] K.
 */
export function areaBetween(mean: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  // T(φ) = mean + S (cos 2φ − 1/3) falls from the equator to the poles; sin φ is uniform in area.
  const sinAt = (t: number): number => {
    const c = (t - mean) / LATITUDE_SWING + 1 / 3;
    if (c >= 1) return 0;
    if (c <= -1) return 1;
    return Math.sin(Math.acos(c) / 2);
  };
  // Warmer than hi up to latitude sinAt(hi); colder than lo beyond sinAt(lo).
  return Math.max(0, sinAt(lo) - sinAt(hi));
}

/** Air column, g/cm², from surface pressure (bar) and gravity (g). */
export function airColumn(pressure: number, gravity: number): number {
  return (pressure * 1e5) / (gravity * 9.80665) / 10;
}

/** Fraction of a dose left under an air column of `column` g/cm². */
export function shielding(column: number): number {
  return (1 + column / RADIATION.shieldColumn) ** -RADIATION.shieldPower;
}

/** The ionising dose (mGy/day) on the surface of a body. */
export function surfaceDose(body: LifeBody): number {
  const { climate } = body;
  let space = RADIATION.cosmic;
  // Starlight ∝ L / r², so particle flux ∝ 1 / r² = insolation / L.
  for (const star of body.stars) {
    const share = body.stars.length > 1 ? 1 / body.stars.length : 1;
    space += RADIATION.solarParticles * STAR_PARTICLES[star.kind] * ((climate.insolation * share) / Math.max(star.luminosity, 1e-6));
  }
  space += beltDose(body.host);
  return space * shielding(airColumn(climate.pressure, climate.gravity));
}

/** A giant's radiation belts at a moon, mGy/day; none round solid planets. */
export function beltDose(host: LifeHost | null): number {
  if (!host || (host.size !== 'gasGiant' && host.size !== 'iceGiant')) return 0;
  const { a, b } = BELTS[host.size];
  return Math.exp(a - b * host.distance);
}

/** 1 for a harmless dose, falling on a log scale to 0 where nothing known grows. */
export function radiationFactor(dose: number): number {
  const { harmless, sterile } = RADIATION;
  if (dose <= harmless) return 1;
  return Math.max(0, 1 - Math.log(dose / harmless) / Math.log(sterile / harmless));
}

/** Main-sequence lifetime, Gyr. */
export function lifetime(mass: number): number {
  return SUN_LIFETIME * mass ** -LIFETIME_POWER;
}

/**
 * Chance life has had time to start: emerging after EMERGENCE_TIME on average
 * (an exponential wait), seen at a random moment of the time available.
 */
export function timeFactor(stars: readonly LifeStar[]): number {
  if (stars.length === 0) return 1;
  const available = Math.min(...stars.map(availableTime));
  const t = Math.min(available, MAX_AGE);
  const tau = EMERGENCE_TIME;
  return 1 - (tau / t) * (1 - Math.exp(-t / tau));
}

function availableTime(star: LifeStar): number {
  if (star.kind === 'redGiant' || star.kind === 'whiteDwarf') return EVOLVED_HZ_TIME[star.kind];
  return lifetime(star.mass);
}

/** The chance of life on a solid body. Pure. */
export function assessLife(body: LifeBody): LifeEstimate {
  const c = body.climate;
  const light = body.stars.length > 0 && c.insolation > 0;
  const chemical = chemicalEnergy(c.heatFlow);

  // Surface: liquid water needs water, air at least at the triple point (waterStateOf), and a temperature it's liquid at.
  const top = Math.min(boilingPoint(c.pressure), LIFE_MAX_TEMPERATURE);
  const wet = c.water > 0 && c.composition !== 'none' && c.waterState !== 'none' && c.pressure >= 0.0061165;
  const area = wet ? areaBetween(c.temperature, FREEZING, top) : 0;
  const dose = surfaceDose(body);
  const radiation = radiationFactor(dose);
  const surfaceEnergy = light ? 1 : chemical;
  const surface: SurfaceHabitat = { area, dose, radiation, energy: surfaceEnergy, chance: area * radiation * surfaceEnergy };

  // Underground: under ice for icy and watery worlds, in the rock for dry ones. The coldest it gets is the mean.
  const water = waterDepth(c);
  const iceShell = body.type === 'ice' || body.type === 'ocean' || body.type === 'terran';
  const depth = meltDepth(c.temperature, c.heatFlow, iceShell);
  // A shell melts if the water goes deeper than the melt depth; rock holds water in its pores, however little, if they reach down that far.
  const reach = iceShell ? water : (POROUS_DEPTH.depth * POROUS_DEPTH.gravity) / c.gravity;
  const liquid = water > 0 && depth < reach && c.temperature < LIFE_MAX_TEMPERATURE;
  const subsurface: SubsurfaceHabitat = {
    kind: water <= 0 ? 'none' : iceShell ? 'ocean' : 'aquifer',
    depth,
    water,
    reach,
    liquid,
    energy: chemical,
    chance: liquid ? chemical : 0,
  };

  const time = timeFactor(body.stars);
  const plants = growsPlants(c);
  const chance = plants ? 1 : time * (1 - (1 - surface.chance) * (1 - subsurface.chance));
  return { chance, plants, surface, subsurface, time };
}

/** A moon's real orbit in its planet's radii (the game squeezes them; Sol's moons say theirs). */
export function moonDistance(moon: Pick<MoonData, 'orbit' | 'hostDistance'>, planet: Pick<PlanetData, 'radius'>): number {
  return moon.hostDistance ?? (TIDAL_ORBIT_STRETCH * moon.orbit.radius) / planet.radius;
}

/** The chance of life on a planet of `system` (or its moon `moon`); null for gas giants. */
export function bodyLife(system: Pick<SystemData, 'stars'>, planet: PlanetData, moon?: MoonData): LifeEstimate | null {
  if (moon) {
    return assessLife({
      type: moon.type,
      climate: moon.climate,
      stars: system.stars,
      host: { size: planet.size, distance: moonDistance(moon, planet) },
    });
  }
  if (planet.type === 'gas' || !planet.climate) return null;
  return assessLife({ type: planet.type, climate: planet.climate, stars: system.stars, host: null });
}

/** e.g. "34%", "0.4%", "<0.1%", "0%". */
export function formatChance(chance: number): string {
  const p = chance * 100;
  if (p <= 0) return '0%';
  if (p < 0.1) return '<0.1%';
  if (p < 1) return `${p.toFixed(1)}%`;
  return `${Math.min(100, Math.round(p))}%`;
}

/** Tooltip and HUD wording, e.g. "life 34%" or "life: plants". */
export function describeLife(life: LifeEstimate): string {
  return life.plants ? 'life: plants' : `life ${formatChance(life.chance)}`;
}
