import { GASES, SIGMA, climateState, evaluateClimate, type ClimateData, type Gas } from '../gen/climate';
import { TERRAFORM_TUNING, applyLever, radiusFromSetting, type Lever, type TerraformAction, type TerraformMode, type TerraformTimeline } from '../gen/terraform';

/*
 * The magic rays (docs/design/terraforming.md, "Magic rays"): the first
 * terraforming tools, which push the climate's state directly, from
 * nothing, with no limits. Pure: what each ray does per second held, and
 * what it costs. The ray in low orbit (terraform/MagicRay.ts) writes the
 * body's action log as it's held, one action a second, so the same
 * pipeline as the real tools later (settling, leaks, the chart, the looks,
 * the milestones) plays it out.
 *
 * Rates are gameplay tunables (`rayParams`): a few seconds of holding moves
 * a world about one cell of the climate chart (terraform/chart.ts: 10 °C
 * across, a factor of √10 of pressure up). The heat rays add or take energy,
 * not temperature, so oceans and thick air still respond slowly.
 */

export type RayId = 'heatRay' | 'coolRay' | 'airRay' | 'vacuumRay' | 'waterRay';
export const RAYS: readonly RayId[] = ['heatRay', 'coolRay', 'airRay', 'vacuumRay', 'waterRay'];

/** Whether the water ray adds water (rain) or takes it away (steam). */
export type WaterWay = 'add' | 'take';

/** What the player picked for the rays that need it: the gas the air and vacuum rays move, and which way the water ray works. */
export interface RayChoice {
  gas: Gas;
  water: WaterWay;
}

export const DEFAULT_RAY_CHOICE: RayChoice = { gas: 'n2', water: 'add' };

export const rayParams = {
  /** The heat and cool rays: kelvin a second of holding moves the temperature the world settles at (at the body's present state). */
  kelvinPerSecond: 3.5,
  /** The air and vacuum rays: the share of the gas's (or air's) pressure added or taken a second, compounding second by second. */
  gasPerSecond: 0.75,
  /** The air ray never adds less than this a second, bar (it can start an atmosphere from nothing: 1 mbar in about 1.5 s). */
  minGasPerSecond: 0.0007,
  /** The vacuum ray takes at least this a second, bar (so it empties an atmosphere instead of halving it for ever). */
  minVacuumPerSecond: 0.0005,
  /** The water ray: water (0–1 of a global ocean) a second. */
  waterPerSecond: 0.03,
  /** Every ray's rate × this (a debug speed-up). */
  speed: 1,
  /** Energy a second held, for a body of Earth's size (more on bigger ones: by the surface area). */
  cost: { heatRay: 8, coolRay: 8, airRay: 10, vacuumRay: 10, waterRay: 12 } as Record<RayId, number>,
};

/** What a ray does now: the lever it moves and by how much a second (in the lever's unit, negative takes away). */
export interface RayEffect {
  lever: Lever;
  rate: number;
}

/**
 * Energy flowing through the surface's balance now, W/m²: what the body
 * absorbs from its star plus its internal and magic heat, σ T_eq⁴.
 */
export function heatBudget(climate: Pick<ClimateData, 'equilibriumTemperature'>): number {
  return SIGMA * climate.equilibriumTemperature ** 4;
}

/**
 * The heat (W/m²) that moves a world's settled temperature by `kelvin` at
 * its present state: with the optical depth held, T_s ∝ F^¼, so
 * dT_s / dF = T_s / 4F.
 */
export function heatForKelvin(climate: Pick<ClimateData, 'equilibriumTemperature' | 'temperature'>, kelvin: number): number {
  return (4 * heatBudget(climate) * kelvin) / Math.max(climate.temperature, 1);
}

/**
 * What `ray` does a second, held on a world whose climate is `climate` (the
 * temperature it's settling at for the heat rays, the air now for the gas
 * rays): the air and vacuum rays move `choice.gas`, the water ray adds or
 * takes as `choice.water` says.
 */
export function rayEffect(ray: RayId, climate: ClimateData, choice: RayChoice): RayEffect {
  const k = rayParams.speed;
  switch (ray) {
    case 'heatRay':
      return { lever: 'heat', rate: k * heatForKelvin(climate, rayParams.kelvinPerSecond) };
    case 'coolRay':
      return { lever: 'heat', rate: -k * heatForKelvin(climate, rayParams.kelvinPerSecond) };
    case 'airRay': {
      // A share of the whole air (so it grows a thin atmosphere as fast as a thick one, on the chart's log scale).
      const p = climate.pressure;
      return { lever: choice.gas, rate: k * Math.max(rayParams.minGasPerSecond, rayParams.gasPerSecond * p) };
    }
    case 'vacuumRay': {
      const p = climate.gases[choice.gas];
      return { lever: choice.gas, rate: -k * Math.max(rayParams.minVacuumPerSecond, rayParams.gasPerSecond * p * 0.6) };
    }
    case 'waterRay':
      return { lever: 'water', rate: (choice.water === 'add' ? 1 : -1) * k * rayParams.waterPerSecond };
  }
}

/** Why a ray can't do anything here now (nothing left to take), or null. */
export function rayBlocked(ray: RayId, climate: ClimateData, choice: RayChoice): string | null {
  if (ray === 'vacuumRay' && !(climate.gases[choice.gas] > 1e-7)) return `No ${GAS_NAME[choice.gas]} left here to take`;
  if (ray === 'waterRay' && choice.water === 'take' && !(climate.water > 0)) return 'No water left here to take';
  if (ray === 'waterRay' && choice.water === 'add' && climate.water >= 1) return 'The world is all ocean already';
  return null;
}

/** Energy a second the ray costs on a body (free in Sandbox): by the body's surface area, in Earth's. */
export function rayCost(ray: RayId, setting: Pick<ClimateData, 'gravity' | 'escapeVelocity'>, mode: TerraformMode): number {
  if (mode === 'sandbox') return 0;
  return rayParams.cost[ray] * radiusFromSetting(setting) ** 2;
}

export const GAS_NAME: Record<Gas, string> = { n2: 'N₂', o2: 'O₂', co2: 'CO₂', h2: 'H₂' };
/** The gases' colours (the air rays' puffs, the climate chart's bar). */
export const GAS_COLOR: Record<Gas, string> = { n2: '#cfe0ff', o2: '#8ff0ff', co2: '#ffc27a', h2: '#ffa8d8' };

/** The next gas after `gas`, for the key that cycles them. */
export function nextGas(gas: Gas): Gas {
  return GASES[(GASES.indexOf(gas) + 1) % GASES.length]!;
}

/**
 * Where a world would settle after `seconds` more of `ray` (the forecast
 * arrow on the climate chart): its settling state (`target`, the climate its
 * state settles at now) with the ray's change added. Leaks and aerosols
 * aside, as the target is.
 */
export function forecastClimate(target: ClimateData, ray: RayId, choice: RayChoice, seconds: number): ClimateData {
  const state = climateState(target);
  let effect = rayEffect(ray, target, choice);
  // The gas rays compound second by second, as they're held.
  for (let s = 0; s < seconds; s++) {
    const step = Math.min(1, seconds - s);
    applyLever(state, effect.lever, effect.rate * step);
    if (effect.lever !== 'heat' && effect.lever !== 'water') effect = rayEffect(ray, evaluateClimate(target, state), choice);
  }
  return evaluateClimate(target, state);
}

/**
 * The actions `ray` held for `seconds` from game time `start` writes to a
 * body's log (one a second, each at the rate the world has then, as the ray
 * in low orbit writes them), recorded into `timeline` as it goes. For the
 * planet lab's buttons and tests.
 */
export function holdRay(timeline: TerraformTimeline, start: number, seconds: number, ray: RayId, choice: RayChoice, mode: TerraformMode): TerraformAction[] {
  const out: TerraformAction[] = [];
  const spread = TERRAFORM_TUNING[mode].spreadTime;
  for (let s = 0; s < seconds - 1e-9; s++) {
    const t = start + s;
    const now = timeline.at(t);
    const anchor = ray === 'heatRay' || ray === 'coolRay' ? now.target : ray === 'airRay' || ray === 'vacuumRay' ? timeline.at(t + spread).climate : now.climate;
    if (rayBlocked(ray, anchor, choice)) break;
    const effect = rayEffect(ray, anchor, choice);
    const duration = Math.min(1, seconds - s);
    const action: TerraformAction = { lever: effect.lever, start: t, duration, amount: effect.rate * duration };
    timeline.record(action);
    out.push(action);
  }
  return out;
}
