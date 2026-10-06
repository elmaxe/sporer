import { hslToHex } from './color';
import { logRange, type MoonType, type PlanetType, type SizeClass } from './planets';
import type { Rng } from './rng';

/*
 * Climate of solid planets and moons: surface temperature, atmosphere and
 * internal heat. Built for terraforming: a body's climate is split into
 *
 * - its setting (ClimateSetting): starlight, gravity, internal heat. Fixed by
 *   the body and its orbit; nothing the player does changes it.
 * - its state (ClimateState): the atmosphere's gases, trace greenhouse gases,
 *   surface water and brightness, and the terraforming levers (mirrors and
 *   shades, aerosol haze, magic heat). The knobs terraforming turns.
 * - everything derived (pressure, composition, temperature, water phase,
 *   habitability, whether the air escapes), which evaluateClimate recomputes
 *   from the two. A terraformed world is `terraform(climate, { pressure: 1,
 *   composition: 'oxygenNitrogen' })`; nothing is stored twice. How a state
 *   changes over time, action by action, is gen/terraform.ts.
 *
 * Every constant and formula is sourced in docs/research/climate.md (and
 * planet-temperatures.md for the equilibrium temperature, terraforming.md for
 * the gases, mirrors, hazes and breathable air).
 */

/**
 * The atmosphere's character, derived from its gases (see compositionOf):
 * 'oxygenNitrogen' is the only breathable one. 'nitrogen' is any other air of
 * nitrogen and oxygen. 'hydrogen' is a rogue planet's primordial air: the
 * only gas that stays a gas at a starless world's ~35 K (see gen/rogues.ts).
 */
export type Composition = 'none' | 'oxygenNitrogen' | 'nitrogen' | 'carbonDioxide' | 'hydrogen';

/** The gases an atmosphere is made of. */
export type Gas = 'n2' | 'o2' | 'co2' | 'h2';
export const GASES: readonly Gas[] = ['n2', 'o2', 'co2', 'h2'];
/** Partial pressures in bar. */
export type Gases = Record<Gas, number>;

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
  /** The atmosphere: partial pressures in bar (all 0 for airless bodies). */
  gases: Gases;
  /**
   * Trace greenhouse gases (water vapour, CO₂ in air, methane, factory-made
   * gases) in units of Earth's: 1 gives an N₂–O₂ atmosphere Earth's
   * greenhouse at its pressure. A CO₂ or hydrogen atmosphere is its own
   * greenhouse gas on top of this (see opticalDepth); 0 is none.
   */
  greenhouse: number;
  /** Surface water inventory, 0 (dry) to 1 (global ocean or ice shell). */
  water: number;
  /** Bond albedo of the bare surface (clouds and hazes are added on top). */
  surfaceAlbedo: number;
  /** Mirrors (> 1) and sunshades (< 1): a factor on the starlight absorbed. Not on escape (see atmosphereRetention). */
  starlight: number;
  /** Reflectance of a stratospheric haze laid over the planet (aerosols), 0 for none. */
  aerosol: number;
  /** Heat added (or, negative, taken) by the magic rays, W/m², in the energy balance like internal heat. */
  magicHeat: number;
}

/**
 * A state as generation and older code describe one: a total pressure and a
 * composition instead of gases, and the greenhouse relative to the
 * composition's reference body (see climateStateOf).
 */
export interface StateSpec extends Partial<ClimateState> {
  pressure?: number;
  composition?: Composition;
}

export type WaterState = 'none' | 'ice' | 'liquid' | 'steam';
/** Whether the body can hold on to its air (the cosmic shoreline, see atmosphereRetention). */
export type Retention = 'holds' | 'marginal' | 'escapes';
/** Spore-style habitability tier: T0 hostile to T3 Earth-like. */
export type Habitability = 0 | 1 | 2 | 3;

export interface ClimateData extends ClimateSetting, ClimateState {
  /** Surface pressure in bar (the sum of the gases; Earth 1.01). */
  pressure: number;
  composition: Composition;
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
 * Optical depth τ = τ₀ (P / 1 bar)ⁿ per kind of atmosphere, each calibrated
 * on its reference body (T_eq from its irradiance and Bond albedo, surface T
 * and P measured). n: 1 for a well-mixed absorber (Earth's trace gases scale
 * with the column), 2 for pressure broadening (Venus, as Robinson & Catling
 * 2012 recommend), 4/3 for Titan (McKay et al. 1999, as cited there).
 * `gravity`, where set: the pressure is taken as P / g^gravity (g in Earth's).
 * In a mixed atmosphere each absorber's column is its partial pressure and
 * its lines are broadened by the total (see opticalDepth), so a pure one
 * gives exactly τ₀ Pⁿ. See docs/research/climate.md and terraforming.md.
 */
/** CO₂'s low-pressure optical depth τ = a p^m (see GREENHOUSE). */
const CO2_LOW = { tau0: 1.585, n: 0.78 } as const;

export const GREENHOUSE = {
  // Earth: 1361 W/m², A 0.294, 288.15 K at 1.014 bar (NASA). The trace gases (`greenhouse` 1) in any air.
  trace: { tau0: tauFor(288.15, blackBody(1361, 0.294)) / 1.014, n: 1 },
  // CO₂: a·p^m for its saturating bands at low pressure, fitted (rms 0.5 K) to Ramirez et al. 2014's Mars under
  // today's Sun from 0.05 to 2.5 bar (terraforming.md), plus τ₀ p P, pressure-broadened, which carries Venus:
  // 2601.3 W/m², A 0.77, 737.15 K at 92 bar (NASA).
  carbonDioxide: {
    low: CO2_LOW,
    tau0: (tauFor(737.15, blackBody(2601.3, 0.77)) - CO2_LOW.tau0 * 92 ** CO2_LOW.n) / 92 ** 2,
    n: 2,
  },
  // Titan: 15.2 W/m², A 0.265 (Li et al. 2011), 93.65 K at 1.467 bar (Fulchignoni et al. 2005). Its methane's
  // greenhouse is expressed as trace gas (titanGreenhouse) when its air is turned into gases.
  nitrogen: { tau0: tauFor(93.65, blackBody(15.2, 0.265)) / 1.467 ** (4 / 3), n: 4 / 3 },
  // No real body to calibrate on: fitted (rms 3 K over 150–450 K) to Mol Lous et al. 2022's 153 model rogues,
  // whose H₂ collision-induced absorption depends on P²/g (Pierrehumbert & Gaidos 2011). See rogue-planets.md.
  hydrogen: { tau0: 6.38, n: 1.161, gravity: 0.5 },
} as const;

/** Cloud and haze albedos that replace the surface's under a thick atmosphere. */
const CLOUD_ALBEDO = {
  /**
   * Venus's sulphuric-acid cloud deck (Bond 0.77, NASA). Its cover grows on
   * a log scale from none at 3 bar of CO₂ (the Mars models of Ramirez et al.
   * 2014 and Forget et al. 2013 run without it up to there) to whole at 30
   * bar. The literature sets the deck by its SO₂ and water, not the
   * pressure, so the decade is a gameplay choice: it replaces a cliff at
   * 10 bar (9 bar was 100 K hotter). See terraforming.md.
   */
  carbonDioxide: { albedo: 0.77, minPressure: 3, fullPressure: 30 },
  /** Titan's orange haze (Bond 0.265, Li et al. 2011), above this pressure of N₂. */
  nitrogen: { albedo: 0.265, minPressure: 0.5, fullPressure: 0.5 },
} as const;

/**
 * Breathable air (habitability T3), see docs/research/terraforming.md:
 * - minOxygen: La Rinconada, the highest town lived in for good (5100 m,
 *   405 mmHg, West 2002 and Sci Rep 2024): 405 × 0.2095 mmHg = 0.113 bar of O₂.
 * - maxOxygen: half an atmosphere of O₂ (380 mmHg) can be breathed for good
 *   (NASA-STD-3001 Vol. 2); pulmonary toxicity starts above 0.5 ATA.
 * - maxOxygenFraction: NASA's exploration atmosphere, 34% O₂ (fire risk
 *   grows with the fraction; 30% is the flammability test level).
 * - maxCarbonDioxide: OSHA's and NIOSH's 8-hour limit, 5000 ppm at 1 atm.
 */
export const BREATHABLE = {
  minOxygen: (405 * 0.2095) / 750.06,
  maxOxygen: 0.5066,
  maxOxygenFraction: 0.34,
  maxCarbonDioxide: 0.005066,
} as const;

/** O₂'s share of Earth's dry air by volume (NASA; argon is counted with the nitrogen). */
export const EARTH_OXYGEN_FRACTION = 0.2095;

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

// --- Atmospheres: gases and what they make ---

export const NO_GASES: Readonly<Gases> = { n2: 0, o2: 0, co2: 0, h2: 0 };

/** Total surface pressure, bar. */
export function totalPressure(gases: Gases): number {
  return gases.n2 + gases.o2 + gases.co2 + gases.h2;
}

/**
 * The gases of an atmosphere described the old way, by total pressure and
 * composition. N₂–O₂ air gets Earth's share of oxygen, kept within the
 * breathable range when there is enough air for it (living worlds are
 * breathable at any of their pressures, as their composition always said).
 */
export function gasesOf(pressure: number, composition: Composition): Gases {
  const p = Math.max(0, pressure);
  if (composition === 'none' || p <= 0) return { ...NO_GASES };
  switch (composition) {
    case 'oxygenNitrogen': {
      const o2 = Math.min(p, clamp(EARTH_OXYGEN_FRACTION * p, BREATHABLE.minOxygen, BREATHABLE.maxOxygen));
      return { ...NO_GASES, n2: p - o2, o2 };
    }
    case 'nitrogen':
      return { ...NO_GASES, n2: p };
    case 'carbonDioxide':
      return { ...NO_GASES, co2: p };
    case 'hydrogen':
      return { ...NO_GASES, h2: p };
  }
}

/** Breathable: enough oxygen, not too much (by pressure or share), and not too much CO₂ (BREATHABLE). */
export function isBreathable(gases: Gases): boolean {
  const { o2, co2 } = gases;
  return (
    o2 >= BREATHABLE.minOxygen &&
    o2 <= BREATHABLE.maxOxygen &&
    o2 <= BREATHABLE.maxOxygenFraction * totalPressure(gases) &&
    co2 <= BREATHABLE.maxCarbonDioxide
  );
}

/**
 * The atmosphere's character: the dominant of nitrogen-and-oxygen, CO₂ and
 * hydrogen, with nitrogen-and-oxygen air 'oxygenNitrogen' when it's
 * breathable and 'nitrogen' otherwise.
 */
export function compositionOf(gases: Gases): Composition {
  if (totalPressure(gases) <= 0) return 'none';
  const air = gases.n2 + gases.o2;
  if (air >= gases.co2 && air >= gases.h2) return isBreathable(gases) ? 'oxygenNitrogen' : 'nitrogen';
  return gases.co2 >= gases.h2 ? 'carbonDioxide' : 'hydrogen';
}

/**
 * Titan's greenhouse (τ₀ P^4/3, its methane and collision-induced absorption)
 * as the trace gas abundance that gives the same optical depth at pressure
 * `pressure`: how a generated N₂ atmosphere's greenhouse becomes `greenhouse`.
 */
export function titanGreenhouse(pressure: number, greenhouse = 1): number {
  if (pressure <= 0) return 0;
  return (greenhouse * GREENHOUSE.nitrogen.tau0 * pressure ** GREENHOUSE.nitrogen.n) / (GREENHOUSE.trace.tau0 * pressure);
}

/**
 * The trace greenhouse (in Earth's units) of an atmosphere whose greenhouse
 * was given relative to its composition's reference body, the way generation
 * draws it: Earth's trace gases for N₂–O₂, Titan's for N₂; a CO₂ or hydrogen
 * atmosphere at 1 is its own greenhouse gas and nothing more; no air has none.
 */
export function traceGreenhouse(composition: Composition, pressure: number, greenhouse: number, gravity = 1): number {
  switch (composition) {
    case 'none':
      // No air, no trace gases in it.
      return 0;
    case 'oxygenNitrogen':
      return greenhouse;
    case 'nitrogen':
      return titanGreenhouse(pressure, greenhouse);
    case 'carbonDioxide':
    case 'hydrogen': {
      // Anything above 1 adds trace gas giving the same extra optical depth (only the lab sets it).
      if (greenhouse <= 1 || pressure <= 0) return 0;
      const own = opticalDepth({ gases: gasesOf(pressure, composition), greenhouse: 0 }, gravity);
      return ((greenhouse - 1) * own) / (GREENHOUSE.trace.tau0 * pressure);
    }
  }
}

/** The untouched levers: no mirrors, haze or magic heat. */
const UNTOUCHED = { starlight: 1, aerosol: 0, magicHeat: 0 } as const;

/**
 * A full state from a partial one. Given `pressure` and `composition`
 * instead of `gases`, the air is made with gasesOf, and `greenhouse` is then
 * read relative to the composition's reference body (traceGreenhouse), as
 * generation draws it. The rest defaults to an untouched, airless, dry body
 * (with Earth's trace greenhouse gases if it has air).
 */
export function climateStateOf(spec: StateSpec, gravity = 1): ClimateState {
  const legacy = !spec.gases && (spec.pressure !== undefined || spec.composition !== undefined);
  const composition = spec.composition ?? 'none';
  const gases = spec.gases ? { ...spec.gases } : gasesOf(spec.pressure ?? 0, composition);
  // Unless given: Earth's trace gases in any air, none without.
  const greenhouse = spec.greenhouse ?? (legacy || totalPressure(gases) > 0 ? 1 : 0);
  return {
    gases,
    greenhouse: legacy ? traceGreenhouse(composition, spec.pressure ?? 0, greenhouse, gravity) : greenhouse,
    water: spec.water ?? 0,
    surfaceAlbedo: spec.surfaceAlbedo ?? 0.3,
    starlight: spec.starlight ?? UNTOUCHED.starlight,
    aerosol: spec.aerosol ?? UNTOUCHED.aerosol,
    magicHeat: spec.magicHeat ?? UNTOUCHED.magicHeat,
  };
}

// --- Evaluation: state + setting → derived ---

/** How much of the planet a Venus-like cloud deck or Titan-like haze hides, 0–1. */
export function cloudCover(state: Pick<ClimateData, 'composition' | 'pressure'>): number {
  if (state.composition !== 'carbonDioxide' && state.composition !== 'nitrogen') return 0;
  const { minPressure, fullPressure } = CLOUD_ALBEDO[state.composition];
  if (state.pressure >= fullPressure) return 1;
  if (state.pressure < minPressure) return 0;
  return Math.log(state.pressure / minPressure) / Math.log(fullPressure / minPressure);
}

/** The cloud deck or haze hides most of the surface (its looks and weather follow). */
export function cloudCovered(state: Pick<ClimateData, 'composition' | 'pressure'>): boolean {
  return cloudCover(state) >= 0.5;
}

/**
 * Bond albedo of the planet: the surface's, where cloud or haze doesn't hide
 * it, and the clouds' where it does, with any aerosol haze on top.
 */
export function planetAlbedo(state: Pick<ClimateData, 'composition' | 'pressure' | 'surfaceAlbedo'> & Partial<Pick<ClimateState, 'aerosol'>>): number {
  const cover = cloudCover(state);
  let below = state.surfaceAlbedo;
  if (cover >= 1) below = CLOUD_ALBEDO[state.composition as keyof typeof CLOUD_ALBEDO].albedo;
  else if (cover > 0) below += (CLOUD_ALBEDO[state.composition as keyof typeof CLOUD_ALBEDO].albedo - below) * cover;
  return hazeAlbedo(below, state.aerosol ?? 0);
}

/**
 * Albedo of a non-absorbing reflecting layer (reflectance r) over a surface
 * of albedo a, all its multiple reflections added: (r + a − 2ra) / (1 − ra).
 * See docs/research/terraforming.md.
 */
export function hazeAlbedo(below: number, reflectance: number): number {
  if (reflectance <= 0) return below;
  const r = Math.min(reflectance, 1);
  return (r + below - 2 * r * below) / (1 - r * below);
}

/**
 * The atmosphere's grey optical depth; `gravity` (in g) matters only for
 * hydrogen. The sum of the trace gases' (τ₀ · greenhouse · P), CO₂'s (its
 * saturating bands, a p_CO₂^m, and its column broadened by the total
 * pressure, τ₀ p_CO₂ P) and hydrogen's (its column broadened by the total,
 * over the gravity).
 */
export function opticalDepth(state: Pick<ClimateState, 'gases' | 'greenhouse'>, gravity = 1): number {
  const { gases } = state;
  const p = totalPressure(gases);
  if (p <= 0) return 0;
  let tau = GREENHOUSE.trace.tau0 * state.greenhouse * p;
  if (gases.co2 > 0) {
    const { low, tau0, n } = GREENHOUSE.carbonDioxide;
    tau += low.tau0 * gases.co2 ** low.n + tau0 * gases.co2 * p ** (n - 1);
  }
  if (gases.h2 > 0) {
    const { tau0, n, gravity: k } = GREENHOUSE.hydrogen;
    const scale = gravity ** k;
    tau += tau0 * (gases.h2 / scale) * (p / scale) ** (n - 1);
  }
  return tau;
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

/** The surface temperature the state settles at (K): the equilibrium temperature warmed by the greenhouse. */
export function settledTemperature(equilibriumTemperature: number, tau: number): number {
  return equilibriumTemperature * greenhouseFactor(tau);
}

/**
 * Recomputes everything derived from a body's setting and its (possibly
 * terraformed) state. `temperature`, when given, is the surface temperature
 * now (a world still warming or cooling towards the one its state settles
 * at, see gen/terraform.ts): the water and habitability follow it.
 */
export function evaluateClimate(setting: ClimateSetting, state: ClimateState, temperature?: number): ClimateData {
  const gases = { ...state.gases };
  for (const gas of GASES) gases[gas] = Math.max(0, gases[gas]);
  const pressure = totalPressure(gases);
  const composition = compositionOf(gases);
  const s: ClimateState = { ...state, gases };
  const albedo = planetAlbedo({ composition, pressure, surfaceAlbedo: s.surfaceAlbedo, aerosol: s.aerosol });
  const equilibriumTemperature = blackBody(SOLAR_CONSTANT * setting.insolation * s.starlight, albedo, setting.heatFlow + s.magicHeat);
  const tau = opticalDepth(s, setting.gravity);
  const surface = temperature ?? settledTemperature(equilibriumTemperature, tau);
  // Escape follows the star's own light (its X-rays and UV), which mirrors don't add: insolation, not starlight.
  const retention = atmosphereRetention(setting.escapeVelocity, setting.insolation);
  const waterState = waterStateOf(s.water, surface, pressure);
  return {
    insolation: setting.insolation,
    gravity: setting.gravity,
    escapeVelocity: setting.escapeVelocity,
    heatFlow: setting.heatFlow,
    ...s,
    pressure,
    composition,
    albedo,
    equilibriumTemperature,
    opticalDepth: tau,
    temperature: surface,
    retention,
    retentionClass: retentionClass(retention),
    leaking: pressure > maxStablePressure(retention),
    waterState,
    geothermal: geothermalIndex(setting.heatFlow),
    habitability: habitabilityOf({ temperature: surface, pressure, composition, waterState }),
  };
}

/** The setting of a climate. */
export function climateSettingOf(c: ClimateSetting): ClimateSetting {
  return { insolation: c.insolation, gravity: c.gravity, escapeVelocity: c.escapeVelocity, heatFlow: c.heatFlow };
}

/** The terraformable state of a climate. */
export function climateState(c: ClimateState): ClimateState {
  return {
    gases: { ...c.gases },
    greenhouse: c.greenhouse,
    water: c.water,
    surfaceAlbedo: c.surfaceAlbedo,
    starlight: c.starlight,
    aerosol: c.aerosol,
    magicHeat: c.magicHeat,
  };
}

/**
 * A state after `change`. Given `pressure` and `composition` (or either),
 * the air is replaced as climateStateOf makes it, and a `greenhouse` given
 * with them is read relative to the composition (traceGreenhouse); otherwise
 * the greenhouse is kept.
 */
export function changeState(state: ClimateState, change: StateSpec, gravity = 1): ClimateState {
  const { pressure, composition, ...rest } = change;
  const next: ClimateState = { ...climateState(state), ...rest };
  if (!change.gases && (pressure !== undefined || composition !== undefined)) {
    const c = composition ?? compositionOf(state.gases);
    const p = pressure ?? totalPressure(state.gases);
    next.gases = gasesOf(p, c);
    if (change.greenhouse !== undefined) next.greenhouse = traceGreenhouse(c, p, change.greenhouse, gravity);
  }
  return next;
}

/** A body's climate after changing some of its state, e.g. terraform(c, { pressure: 1, composition: 'oxygenNitrogen' }). */
export function terraform(climate: ClimateData, change: StateSpec): ClimateData {
  return evaluateClimate(climate, changeState(climateState(climate), change, climate.gravity));
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

type DraftAtmosphere = { pressure: number; composition: Composition; greenhouse: number };

/** The atmosphere a body of this type would have if it could keep one (greenhouse relative to its composition's reference body). */
function draftAtmosphere(rng: Rng, body: ClimateBody): DraftAtmosphere {
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

  const state = climateStateOf({ ...atmosphere, water, surfaceAlbedo }, setting.gravity);
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
export function atmosphereTint(rng: Rng, c: Pick<ClimateData, 'pressure' | 'composition'>): string | null {
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
export function describeAtmosphere(c: Pick<ClimateData, 'pressure' | 'composition'>): string {
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
