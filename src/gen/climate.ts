import { hslToHex } from './color';
import { logRange, type MoonType, type PlanetType, type SizeClass } from './planets';
import type { Rng } from './rng';

/*
 * Climate of solid planets and moons: surface temperature, atmosphere and
 * internal heat. Built for terraforming: a body's climate is split into
 *
 * - its setting (ClimateSetting): starlight, gravity, internal heat. Fixed by
 *   the body and its orbit; nothing the player does changes it.
 * - its state (ClimateState): the atmosphere, greenhouse gases, surface water
 *   and surface brightness. The knobs terraforming turns.
 * - everything derived (temperature, water phase, habitability, whether the
 *   air escapes), which evaluateClimate recomputes from the two. A terraformed
 *   world is `terraform(climate, { pressure: 1 })`; nothing is stored twice.
 *
 * Every constant and formula is sourced in docs/research/climate.md (and
 * planet-temperatures.md for the equilibrium temperature).
 */

/**
 * Dominant atmospheric gas. 'oxygenNitrogen' is the only breathable one.
 * 'hydrogen' is a rogue planet's primordial air: the only gas that stays a gas
 * at a starless world's ~35 K (see gen/rogues.ts).
 */
export type Composition = 'none' | 'oxygenNitrogen' | 'nitrogen' | 'carbonDioxide' | 'hydrogen';

/** What the body is and where it is. Terraforming can't change these. */
export interface ClimateSetting {
  /** Starlight at the body relative to Earth's (S / 1361 W/m²). */
  insolation: number;
  /** Surface gravity in g (Earth = 1). */
  gravity: number;
  /** Escape velocity in km/s (Earth 11.2). */
  escapeVelocity: number;
  /** Heat from inside (radiogenic + tidal), W/m² (Earth 0.092, Io 2.24). */
  heatFlow: number;
}

/** The terraformable part of a climate. */
export interface ClimateState {
  /** Surface pressure in bar (Earth 1.01). 0 for airless bodies. */
  pressure: number;
  composition: Composition;
  /**
   * Greenhouse gas abundance relative to the composition's reference body
   * (Earth's water vapour and CO₂ for oxygenNitrogen, Titan's methane for
   * nitrogen; a CO₂ atmosphere is its own greenhouse gas). 1 = the reference.
   */
  greenhouse: number;
  /** Surface water inventory, 0 (dry) to 1 (global ocean or ice shell). */
  water: number;
  /** Bond albedo of the bare surface (clouds and hazes are added on top). */
  surfaceAlbedo: number;
}

export type WaterState = 'none' | 'ice' | 'liquid' | 'steam';
/** Whether the body can hold on to its air (the cosmic shoreline, see atmosphereRetention). */
export type Retention = 'holds' | 'marginal' | 'escapes';
/** Spore-style habitability tier: T0 hostile to T3 Earth-like. */
export type Habitability = 0 | 1 | 2 | 3;

export interface ClimateData extends ClimateSetting, ClimateState {
  /** Bond albedo of the whole planet, clouds and hazes included. */
  albedo: number;
  /** Black-body temperature (K) with no greenhouse. */
  equilibriumTemperature: number;
  /** Grey infrared optical depth of the atmosphere. */
  opticalDepth: number;
  /** Mean surface temperature in K. */
  temperature: number;
  /** log10 distance above the cosmic shoreline: > 0 keeps air, < 0 loses it. */
  retention: number;
  retentionClass: Retention;
  /** More air than the body can hold (see maxStablePressure): it is slowly being lost. */
  leaking: boolean;
  waterState: WaterState;
  /** Internal heat on a 0–1 scale (log of heatFlow; Earth ~0.4, Io ~0.95). */
  geothermal: number;
  habitability: Habitability;
}

// --- Physical constants and reference bodies (docs/research/climate.md) ---

/** Stefan–Boltzmann constant, W m⁻² K⁻⁴ (exact, SI 2019). */
const SIGMA = 5.670374419e-8;
/** Solar irradiance at Earth, W/m² (NASA Earth fact sheet). */
export const SOLAR_CONSTANT = 1361;
/** Earth's escape velocity, km/s (NASA). */
export const EARTH_ESCAPE_VELOCITY = 11.186;
/** Earth's mean density, kg/m³ (NASA). */
const EARTH_DENSITY = 5513;
/** Icy bodies: Ganymede 1942, Callisto 1834, Titan 1881, Triton 2065, Pluto 1850 kg/m³ (JPL, NASA). */
const ICY_DENSITY = 1900;
/** Gas giants: the mean of Jupiter (1326) and Saturn (687), kg/m³ (NASA). */
const GAS_GIANT_DENSITY = 1000;
/** Earth's surface heat flow: 47 TW (Davies & Davies 2010) over 4π(6371 km)², W/m². */
export const EARTH_HEAT_FLOW = 47e12 / (4 * Math.PI * 6371e3 ** 2);
/** Io's heat flow, W/m² (Lainey et al. 2009), the reference for tidal heating. */
export const IO_HEAT_FLOW = 2.24;
/** Io: radius 0.2859 Earth radii (1821.49 km), orbit 5.90 Jupiter radii (421 800 km / 71 492 km). JPL. */
const IO = { radius: 1821.49 / 6371, orbit: 421800 / 71492, planetDensity: 1326 };

/**
 * Chen & Kipping 2017 mass–radius relation (Earth units): R = 1.008 M^0.279
 * for Terran worlds up to 2.04 M⊕, then R ∝ M^0.589 (Neptunian).
 */
const CK = { constant: 1.008, terran: 0.279, neptunian: 0.589, transitionMass: 2.04 } as const;
const CK_TRANSITION_RADIUS = CK.constant * CK.transitionMass ** CK.terran;

/**
 * Cosmic shoreline (Zahnle & Catling 2017): bodies keep an atmosphere when
 * I < C · v_esc⁴. The paper draws the line by eye; C (I in Earth units, v in
 * km/s) is placed between Mars (6.73e-4, thin air) and Ganymede (6.54e-4,
 * none), the two bodies closest to it.
 */
export const SHORELINE = 6.7e-4;
/** retention above this holds a full atmosphere; below −this it all escapes (Mars sits at 0, Titan 0.48). */
export const RETENTION_MARGIN = 0.3;
/** The most a marginal body keeps, bar (Mars: 0.0064 at retention 0). */
export const MARGINAL_MAX_PRESSURE = 0.01;

/** Grey two-stream surface temperature factor: T⁴ = T_eq⁴ (1 + ¾ τ) (Robinson & Catling 2012, eq. 18 with k → 0, D = 3/2). */
function greenhouseFactor(tau: number): number {
  return Math.pow(1 + 0.75 * tau, 0.25);
}

/** Optical depth that turns an equilibrium temperature into a measured surface temperature. */
function tauFor(surface: number, equilibrium: number): number {
  return ((surface / equilibrium) ** 4 - 1) / 0.75;
}

function blackBody(irradiance: number, albedo: number, heatFlow = 0): number {
  return Math.pow((irradiance * (1 - albedo)) / 4 / SIGMA + heatFlow / SIGMA, 0.25);
}

/**
 * Optical depth τ = τ₀ (P / 1 bar)ⁿ per composition, each calibrated on its
 * reference body (T_eq from its irradiance and Bond albedo, surface T and P
 * measured). n: 1 for a well-mixed absorber (Earth's trace gases scale with
 * the column), 2 for pressure broadening (Venus, as Robinson & Catling 2012
 * recommend), 4/3 for Titan (McKay et al. 1999, as cited there).
 * `gravity`, where set: the pressure is taken as P / g^gravity (g in Earth's).
 */
export const GREENHOUSE: Record<Exclude<Composition, 'none'>, { tau0: number; n: number; gravity?: number }> = {
  // Earth: 1361 W/m², A 0.294, 288.15 K at 1.014 bar (NASA).
  oxygenNitrogen: { tau0: tauFor(288.15, blackBody(1361, 0.294)) / 1.014, n: 1 },
  // Venus: 2601.3 W/m², A 0.77, 737.15 K at 92 bar (NASA).
  carbonDioxide: { tau0: tauFor(737.15, blackBody(2601.3, 0.77)) / 92 ** 2, n: 2 },
  // Titan: 15.2 W/m², A 0.265 (Li et al. 2011), 93.65 K at 1.467 bar (Fulchignoni et al. 2005).
  nitrogen: { tau0: tauFor(93.65, blackBody(15.2, 0.265)) / 1.467 ** (4 / 3), n: 4 / 3 },
  // No real body to calibrate on: fitted (rms 3 K over 150–450 K) to Mol Lous et al. 2022's 153 model rogues,
  // whose H₂ collision-induced absorption depends on P²/g (Pierrehumbert & Gaidos 2011). See rogue-planets.md.
  hydrogen: { tau0: 6.38, n: 1.161, gravity: 0.5 },
};

/** Cloud and haze albedos that replace the surface's under a thick atmosphere. */
const CLOUD_ALBEDO = {
  /** Venus's sulphuric-acid cloud deck (Bond 0.77, NASA), above this pressure of CO₂. */
  carbonDioxide: { albedo: 0.77, minPressure: 10 },
  /** Titan's orange haze (Bond 0.265, Li et al. 2011), above this pressure of N₂. */
  nitrogen: { albedo: 0.265, minPressure: 0.5 },
} as const;

/**
 * Water's boiling point against pressure, [bar, K], from the NIST Webbook
 * saturation table (IAPWS-95), triple point to critical point.
 */
const WATER_SATURATION: readonly (readonly [number, number])[] = [
  [0.0061165, 273.16],
  [0.01, 282.0],
  [0.03, 301.9],
  [0.1, 323.6],
  [0.3, 343.4],
  [0.5, 354.7],
  [1.01325, 373.2],
  [2, 393.4],
  [3, 406.7],
  [5, 425.0],
  [10, 453.0],
  [20, 485.5],
  [30, 507.0],
  [50, 537.1],
  [92, 578.1],
  [150, 615.3],
  [220.64, 647.1],
];
export const WATER_TRIPLE_POINT = { pressure: 0.0061165, temperature: 273.16 } as const;

/** Boiling point of water (K) at `pressure` bar; log-linear between NIST points. */
export function boilingPoint(pressure: number): number {
  const table = WATER_SATURATION;
  if (pressure <= table[0]![0]) return table[0]![1];
  for (let i = 1; i < table.length; i++) {
    const [p1, t1] = table[i]!;
    if (pressure <= p1) {
      const [p0, t0] = table[i - 1]!;
      return t0 + ((t1 - t0) * Math.log(pressure / p0)) / Math.log(p1 / p0);
    }
  }
  return table[table.length - 1]![1]; // supercritical: no boiling, treat as the critical point
}

// --- Body properties from size ---

export type BodyKind = SizeClass | 'moon';

/** Game radius → real radius in Earth radii (the inverse of gameRadius in gen/planets.ts). */
export function earthRadii(gameRadius: number): number {
  return (gameRadius / 8) ** 2;
}

/** Mass in Earth masses. Icy bodies use a density; rocky ones Chen & Kipping; gas giants a density. */
export function bodyMass(radiusEarth: number, icy: boolean, gasGiant = false): number {
  if (icy) return radiusEarth ** 3 * (ICY_DENSITY / EARTH_DENSITY);
  if (gasGiant) return radiusEarth ** 3 * (GAS_GIANT_DENSITY / EARTH_DENSITY);
  if (radiusEarth <= CK_TRANSITION_RADIUS) return (radiusEarth / CK.constant) ** (1 / CK.terran);
  return CK.transitionMass * (radiusEarth / CK_TRANSITION_RADIUS) ** (1 / CK.neptunian);
}

/** Mean density in kg/m³ for a body of this real radius and mass (Earth units). */
function density(radiusEarth: number, mass: number): number {
  return (EARTH_DENSITY * mass) / radiusEarth ** 3;
}

/**
 * Ice-rich bodies (ice moons, icy dwarfs and small worlds) are about half
 * rock, half ice; bigger ice worlds are rock under an ice shell.
 */
export function isIcy(type: PlanetType | MoonType, kind: BodyKind): boolean {
  return type === 'ice' && (kind === 'moon' || kind === 'dwarf' || kind === 'small');
}

/**
 * The shoreline distance: log10(C · v⁴ / I). Positive keeps air, negative
 * loses it. Earth 1.02, Venus 0.61, Titan 0.48, Mars 0.00, Mercury −1.46.
 */
export function atmosphereRetention(escapeVelocity: number, insolation: number): number {
  return Math.log10((SHORELINE * escapeVelocity ** 4) / Math.max(insolation, 1e-9));
}

/** The most air a body keeps for good: none below the shoreline, a Mars-like film on it, any amount above. */
export function maxStablePressure(retention: number): number {
  const c = retentionClass(retention);
  return c === 'holds' ? Infinity : c === 'marginal' ? MARGINAL_MAX_PRESSURE : 0;
}

export function retentionClass(retention: number): Retention {
  if (retention >= RETENTION_MARGIN) return 'holds';
  return retention >= -RETENTION_MARGIN ? 'marginal' : 'escapes';
}

/** Internal heat, 0–1: log scale from 0.01 W/m² (0) to 3 W/m² (1). The Moon is ~0.1, Earth 0.39, Io 0.95. */
export function geothermalIndex(heatFlow: number): number {
  return clamp(Math.log10(heatFlow / 0.01) / Math.log10(300), 0, 1);
}

/**
 * How far the game's moon orbits are squeezed, in planet radii: a moon at
 * a game radii from its planet is treated as a real one at STRETCH · a. The
 * innermost moons of game gas giants sit near 2 radii, so they get Io's 5.9.
 * See docs/research/climate.md.
 */
export const TIDAL_ORBIT_STRETCH = 2.9;

/**
 * Tidal heat flow of a moon (W/m²), scaled from Io: flow ∝ ρ_p^2.5 · R³ ·
 * (a / R_p)^-7.5, from Ė ∝ M_p^2.5 R^5 a^-7.5 over the surface. Assumes an
 * Io-like forced eccentricity and rigidity. Enceladus comes out at 0.023
 * against a measured 0.019–0.050.
 */
export function tidalHeatFlow(
  moonRadiusEarth: number,
  planetDensity: number,
  orbitInPlanetRadii: number,
): number {
  return (
    IO_HEAT_FLOW *
    (planetDensity / IO.planetDensity) ** 2.5 *
    (moonRadiusEarth / IO.radius) ** 3 *
    (IO.orbit / orbitInPlanetRadii) ** 7.5
  );
}

// --- Evaluation: state + setting → derived ---

/** A Venus-like cloud deck or Titan-like haze hides the surface. */
export function cloudCovered(state: Pick<ClimateState, 'composition' | 'pressure'>): boolean {
  if (state.composition !== 'carbonDioxide' && state.composition !== 'nitrogen') return false;
  return state.pressure >= CLOUD_ALBEDO[state.composition].minPressure;
}

/** Bond albedo of the planet: the surface's, unless a thick atmosphere hides it under cloud or haze. */
export function planetAlbedo(state: Pick<ClimateState, 'composition' | 'pressure' | 'surfaceAlbedo'>): number {
  if (cloudCovered(state)) return CLOUD_ALBEDO[state.composition as keyof typeof CLOUD_ALBEDO].albedo;
  return state.surfaceAlbedo;
}

/** The atmosphere's grey optical depth; `gravity` (in g) matters only for hydrogen. */
export function opticalDepth(state: Pick<ClimateState, 'composition' | 'pressure' | 'greenhouse'>, gravity = 1): number {
  if (state.composition === 'none' || state.pressure <= 0) return 0;
  const { tau0, n, gravity: k = 0 } = GREENHOUSE[state.composition];
  return tau0 * state.greenhouse * (state.pressure / gravity ** k) ** n;
}

export function waterStateOf(water: number, temperature: number, pressure: number): WaterState {
  if (water <= 0) return 'none';
  if (temperature < WATER_TRIPLE_POINT.temperature) return 'ice';
  // Below the triple-point pressure ice sublimates rather than melting.
  if (pressure < WATER_TRIPLE_POINT.pressure) return 'steam';
  return temperature < boilingPoint(pressure) ? 'liquid' : 'steam';
}

/**
 * Habitability tiers, like Spore's T0–T3. Gameplay thresholds, not biology:
 * T1 survivable (−20 to 60 °C, any real atmosphere), T2 comfortable (−10 to
 * 40 °C at 0.3–5 bar), T3 Earth-like (T2 with breathable air and liquid water).
 */
export const HABITABILITY = {
  survivable: { min: 253, max: 333, minPressure: WATER_TRIPLE_POINT.pressure },
  comfortable: { min: 263, max: 313, minPressure: 0.3, maxPressure: 5 },
} as const;

export function habitabilityOf(c: Pick<ClimateData, 'temperature' | 'pressure' | 'composition' | 'waterState'>): Habitability {
  const { survivable, comfortable } = HABITABILITY;
  const t = c.temperature;
  if (c.composition === 'none' || c.pressure < survivable.minPressure || t < survivable.min || t > survivable.max) return 0;
  if (t < comfortable.min || t > comfortable.max || c.pressure < comfortable.minPressure || c.pressure > comfortable.maxPressure)
    return 1;
  return c.composition === 'oxygenNitrogen' && c.waterState === 'liquid' ? 3 : 2;
}

/** Recomputes everything derived from a body's setting and its (possibly terraformed) state. */
export function evaluateClimate(setting: ClimateSetting, state: ClimateState): ClimateData {
  const pressure = state.composition === 'none' ? 0 : Math.max(0, state.pressure);
  const s: ClimateState = { ...state, pressure, composition: pressure > 0 ? state.composition : 'none' };
  const albedo = planetAlbedo(s);
  const equilibriumTemperature = blackBody(SOLAR_CONSTANT * setting.insolation, albedo, setting.heatFlow);
  const tau = opticalDepth(s, setting.gravity);
  const temperature = equilibriumTemperature * greenhouseFactor(tau);
  const retention = atmosphereRetention(setting.escapeVelocity, setting.insolation);
  const waterState = waterStateOf(s.water, temperature, pressure);
  const derived = {
    albedo,
    equilibriumTemperature,
    opticalDepth: tau,
    temperature,
    retention,
    retentionClass: retentionClass(retention),
    leaking: pressure > maxStablePressure(retention),
    waterState,
    geothermal: geothermalIndex(setting.heatFlow),
  };
  return {
    insolation: setting.insolation,
    gravity: setting.gravity,
    escapeVelocity: setting.escapeVelocity,
    heatFlow: setting.heatFlow,
    ...s,
    ...derived,
    habitability: habitabilityOf({ temperature, pressure, composition: s.composition, waterState }),
  };
}

/** The terraformable state of a climate. */
export function climateState(c: ClimateState): ClimateState {
  return {
    pressure: c.pressure,
    composition: c.composition,
    greenhouse: c.greenhouse,
    water: c.water,
    surfaceAlbedo: c.surfaceAlbedo,
  };
}

/** A body's climate after changing some of its state, e.g. terraform(c, { pressure: 1, composition: 'oxygenNitrogen' }). */
export function terraform(climate: ClimateData, change: Partial<ClimateState>): ClimateData {
  return evaluateClimate(climate, { ...climateState(climate), ...change });
}

// --- Generation ---

/** What climate generation needs to know about a body. */
export interface ClimateBody {
  type: Exclude<PlanetType, 'gas'> | MoonType;
  kind: BodyKind;
  /** Game radius. */
  radius: number;
  /** Starlight relative to Earth: 1 / zone² (a moon uses its planet's). */
  insolation: number;
  /** For moons: the planet they orbit (game units) and its size class. */
  host?: { radius: number; size: SizeClass; orbitRadius: number };
}

/** Bare-surface Bond albedo by type (docs/research/climate.md). */
export const SURFACE_ALBEDO: Record<ClimateBody['type'], readonly [number, number]> = {
  // Mercury 0.068, the Moon 0.11 (NASA).
  barren: [0.07, 0.15],
  // Dark basalt, like Mercury and the Moon.
  lava: [0.06, 0.12],
  // Mars 0.25 (NASA).
  desert: [0.2, 0.3],
  // Earth 0.294 (NASA), clouds included.
  terran: [0.25, 0.35],
  ocean: [0.25, 0.35],
  // Pluto 0.72 (NASA); fresher or dirtier ice either side.
  ice: [0.55, 0.75],
};

/** Surface water by type: ocean worlds are nearly all water, ice worlds have a frozen shell. */
export const WATER: Record<ClimateBody['type'], readonly [number, number]> = {
  ocean: [0.8, 0.95],
  terran: [0.4, 0.7],
  ice: [0.5, 0.8],
  desert: [0, 0.08],
  barren: [0, 0],
  lava: [0, 0],
};

/**
 * Temperatures living worlds settle at: the carbonate–silicate cycle (Walker,
 * Hays & Kasting 1981) draws greenhouse gas down on warm worlds and lets it
 * build up on cold ones. Gameplay range around Earth's 288 K.
 */
export const THERMOSTAT = { target: [275, 300], greenhouse: [0.25, 6] } as const;

/** Real-radius properties of a body: gravity, escape velocity, heat flow. */
export function climateSetting(body: ClimateBody, rng?: Rng): ClimateSetting {
  const R = earthRadii(body.radius);
  const icy = isIcy(body.type, body.kind);
  const mass = bodyMass(R, icy);
  const gravity = mass / R ** 2;
  const escapeVelocity = EARTH_ESCAPE_VELOCITY * Math.sqrt(mass / R);
  // Radiogenic heat scales with mass over area, i.e. with gravity (the Moon: 15 vs 16–21 mW/m² measured).
  let heatFlow = EARTH_HEAT_FLOW * gravity;
  if (body.host) {
    const hostR = earthRadii(body.host.radius);
    const hostDensity = density(hostR, bodyMass(hostR, false, body.host.size === 'gasGiant'));
    heatFlow += tidalHeatFlow(R, hostDensity, (TIDAL_ORBIT_STRETCH * body.host.orbitRadius) / body.host.radius);
  }
  // A lava world's surface is molten: its heat flow is at least Io's range. Deliberate, so the look and the climate agree.
  if (body.type === 'lava') heatFlow = Math.max(heatFlow, rng ? logRange(rng, 1, 3) : 1);
  return { insolation: body.insolation, gravity, escapeVelocity, heatFlow };
}

/** The atmosphere a body of this type would have if it could keep one. */
function draftAtmosphere(rng: Rng, body: ClimateBody): Pick<ClimateState, 'pressure' | 'composition' | 'greenhouse'> {
  const none = { pressure: 0, composition: 'none' as const, greenhouse: 1 };
  switch (body.type) {
    case 'terran':
    case 'ocean': {
      // Super-Earths hold deeper air.
      const scale = body.kind === 'superEarth' ? rng.range(1, 2.5) : 1;
      return { pressure: logRange(rng, 0.5, 2) * scale, composition: 'oxygenNitrogen', greenhouse: 1 };
    }
    case 'desert':
      if (!rng.chance(0.75)) return none;
      return {
        pressure: logRange(rng, 0.005, 0.8),
        composition: rng.chance(0.7) ? 'carbonDioxide' : 'nitrogen',
        greenhouse: 1,
      };
    case 'ice': {
      const roll = rng.next();
      // Titan-like haze, Pluto/Triton-like trace, or nothing.
      if (roll < 0.25) return { pressure: logRange(rng, 0.5, 3), composition: 'nitrogen', greenhouse: rng.range(0.7, 1.3) };
      if (roll < 0.6) return { pressure: logRange(rng, 1e-5, 1e-3), composition: 'nitrogen', greenhouse: 1 };
      return none;
    }
    case 'lava':
      // Sometimes a Venus.
      return rng.chance(0.4) ? { pressure: logRange(rng, 10, 100), composition: 'carbonDioxide', greenhouse: 1 } : none;
    case 'barren':
      // Sometimes a Mars-like remnant.
      return rng.chance(0.2) ? { pressure: logRange(rng, 1e-4, 0.01), composition: 'carbonDioxide', greenhouse: 1 } : none;
  }
}

/** A solid body's climate. Pure and deterministic for a given rng (use its own stream). */
export function generateClimate(rng: Rng, body: ClimateBody): ClimateData {
  const setting = climateSetting(body, rng);
  const [a0, a1] = SURFACE_ALBEDO[body.type];
  const [w0, w1] = WATER[body.type];
  const surfaceAlbedo = rng.range(a0, a1);
  const water = rng.range(w0, w1);
  let atmosphere = draftAtmosphere(rng, body);

  // Escape caps what the body keeps. Living worlds keep theirs (their type
  // says so) but may be marked as leaking: something to fix by terraforming.
  const retention = atmosphereRetention(setting.escapeVelocity, setting.insolation);
  const living = body.type === 'terran' || body.type === 'ocean';
  const stable = maxStablePressure(retention);
  if (!living && atmosphere.pressure > stable) {
    atmosphere = stable > 0 ? { ...atmosphere, pressure: stable } : { pressure: 0, composition: 'none', greenhouse: 1 };
  }

  const state: ClimateState = { ...atmosphere, water, surfaceAlbedo };
  if (living) state.greenhouse = thermostat(rng, setting, state);
  return evaluateClimate(setting, state);
}

/** The greenhouse abundance that brings a living world to a drawn target temperature, within the cycle's reach. */
function thermostat(rng: Rng, setting: ClimateSetting, state: ClimateState): number {
  const target = rng.range(THERMOSTAT.target[0], THERMOSTAT.target[1]);
  const base = evaluateClimate(setting, { ...state, greenhouse: 1 });
  const needed = Math.max(0, tauFor(target, base.equilibriumTemperature));
  return clamp(needed / Math.max(base.opticalDepth, 1e-9), THERMOSTAT.greenhouse[0], THERMOSTAT.greenhouse[1]);
}

/**
 * The atmosphere's glow colour, from its composition and thickness, or null
 * when there's too little air to see (below 5 mbar; Mars's 6 mbar shows).
 */
export function atmosphereTint(rng: Rng, c: Pick<ClimateState, 'pressure' | 'composition'>): string | null {
  if (c.composition === 'none' || c.pressure < 0.005) return null;
  switch (c.composition) {
    case 'oxygenNitrogen':
      return hslToHex(rng.range(195, 215), 0.8, 0.7);
    case 'carbonDioxide':
      // Thin and dusty like Mars's butterscotch sky, or Venus's pale yellow cloud deck.
      return c.pressure < 3 ? hslToHex(rng.range(25, 40), 0.7, 0.65) : hslToHex(rng.range(42, 55), 0.6, 0.75);
    case 'nitrogen':
      // Titan's orange haze when thick, pale blue-white when thin.
      return c.pressure >= 0.5 ? hslToHex(rng.range(28, 40), 0.75, 0.55) : hslToHex(200, 0.5, 0.85);
    case 'hydrogen':
      // Clear gas that only scatters (Rayleigh): a pale blue-white, like the blue of air without its haze.
      return hslToHex(rng.range(205, 225), 0.45, 0.8);
  }
}

// --- Labels ---

const GAS_LABEL: Record<Exclude<Composition, 'none'>, string> = {
  oxygenNitrogen: 'N₂–O₂',
  nitrogen: 'N₂',
  carbonDioxide: 'CO₂',
  hydrogen: 'H₂',
};

export function celsius(kelvin: number): string {
  const c = Math.round(kelvin - 273.15);
  return `${c < 0 ? '−' : ''}${Math.abs(c)} °C`;
}

function formatPressure(bar: number): string {
  if (bar >= 10) return `${bar.toFixed(0)} bar`;
  if (bar >= 0.1) return `${bar.toFixed(1)} bar`;
  if (bar >= 0.001) return `${(bar * 1000).toFixed(0)} mbar`;
  return bar >= 1e-6 ? `${(bar * 1e6).toFixed(0)} µbar` : '<1 µbar';
}

/** e.g. "thin N₂ atmosphere", "N₂–O₂ atmosphere", "crushing CO₂ atmosphere", "no atmosphere". */
export function describeAtmosphere(c: Pick<ClimateState, 'pressure' | 'composition'>): string {
  if (c.composition === 'none' || c.pressure <= 0) return 'no atmosphere';
  const gas = GAS_LABEL[c.composition];
  if (c.pressure < 0.001) return `trace of ${gas}`;
  if (c.pressure < 0.3) return `thin ${gas} atmosphere`;
  if (c.pressure < 3) return `${gas} atmosphere`;
  if (c.pressure < 30) return `thick ${gas} atmosphere`;
  return `crushing ${gas} atmosphere`;
}

/** Tooltip line, e.g. "−140 °C · thin N₂ atmosphere". */
export function describeClimate(c: ClimateData): string {
  return `${celsius(c.temperature)} · ${describeAtmosphere(c)}`;
}

const GEOTHERMAL_LABEL = ['quiet', 'low', 'moderate', 'active', 'volcanic'] as const;

/** HUD line, e.g. "15 °C · N₂–O₂ 1.0 bar · 1.0 g · geothermal low · T3". */
export function describeClimateDetail(c: ClimateData): string {
  const air = c.composition === 'none' ? 'airless' : `${GAS_LABEL[c.composition]} ${formatPressure(c.pressure)}`;
  const parts = [celsius(c.temperature), air];
  if (c.leaking) parts.push('air escaping');
  if (c.waterState !== 'none') parts.push(`water: ${c.waterState}`);
  parts.push(`${c.gravity < 0.1 ? c.gravity.toPrecision(1) : c.gravity.toFixed(1)} g`);
  parts.push(`geothermal ${GEOTHERMAL_LABEL[Math.min(4, Math.floor(c.geothermal * 5))]}`);
  parts.push(`T${c.habitability}`);
  return parts.join(' · ');
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
