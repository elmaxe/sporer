import {
  GASES,
  atmosphereRetention,
  climateSettingOf,
  climateState,
  evaluateClimate,
  maxStablePressure,
  totalPressure,
  type ClimateData,
  type ClimateSetting,
  type ClimateState,
  type Gas,
} from './climate';

/*
 * Terraforming over time. Each body keeps an action log: what was done to
 * it and when, in game time (seconds on a clock that runs across systems;
 * a system's own clock starts afresh on every visit). Its climate at any
 * moment is a pure function of its generated climate, the log, the mode
 * the game was played in and the time: integrated on a fixed one-second
 * step from the first action, with checkpoints cached so a frame only
 * steps on from the last one. So the system view and low orbit agree, a
 * world keeps settling while you're away, and saving is just the log.
 *
 * What moves (tunables per mode, TERRAFORM_TUNING; real behaviour and
 * numbers in docs/research/terraforming.md):
 * - the levers, as each action delivers its amount over its duration;
 *   released gas spreads round the globe and counts fully after spreadTime;
 * - the temperature, which relaxes towards the one the state settles at,
 *   slower with more heat capacity (oceans and thick air);
 * - aerosol haze, which rains out with a half-life;
 * - leaks (Real only): air above what the body can hold bleeds away, the
 *   light gases first (Jeans escape).
 */

/** Sandbox: magic rays and no limits; Relaxed (the default): quicker, no leaks; Real: as designed. */
export type TerraformMode = 'sandbox' | 'relaxed' | 'real';
export const TERRAFORM_MODES: readonly TerraformMode[] = ['sandbox', 'relaxed', 'real'];
export const DEFAULT_TERRAFORM_MODE: TerraformMode = 'relaxed';

/** What an action changes: a gas (bar), trace greenhouse (× Earth's), water, starlight, aerosol, or heat (W/m²). */
export type Lever = Gas | 'greenhouse' | 'water' | 'starlight' | 'aerosol' | 'heat';
export const LEVERS: readonly Lever[] = [...GASES, 'greenhouse', 'water', 'starlight', 'aerosol', 'heat'];

export interface TerraformAction {
  lever: Lever;
  /** Game time it began, s. */
  start: number;
  /** How long it took (a ray held down), s; 0 for all at once. */
  duration: number;
  /**
   * The whole change, spread evenly over the duration, in the lever's unit:
   * bar of the gas, × Earth's trace greenhouse, water (0–1 of a global ocean),
   * starlight factor, aerosol reflectance, W/m² of heat. Negative takes away.
   */
  amount: number;
  /** Where on the body it was aimed (a unit vector in the body's frame), for the looks. */
  site?: [number, number, number];
}

/** The game's terraforming mode from `time` on (switched in the menu at any time). */
export interface ModeChange {
  time: number;
  mode: TerraformMode;
}

export interface TerraformTuning {
  /** Response time of the temperature on a dry, airless world, s. */
  dryResponse: number;
  /** Response time with a global ocean (water 1) and an Earth's air, s. */
  oceanResponse: number;
  /** Released gas counts fully this long after it's let go (the front spreading round the globe), s. */
  spreadTime: number;
  /** Aerosol haze halves in this time, s. */
  aerosolHalfLife: number;
  /** Air above what the body holds bleeds away (Real only). */
  leaks: boolean;
  /** Time constant of the leak (for nitrogen) on the shoreline itself (retention 0, Mars), s. */
  leakTime: number;
  /** The leak time ×10 for every this much retention above the shoreline (shorter below it). */
  leakDecade: number;
}

/**
 * Tunables per mode (see docs/design/terraforming.md, Sandbox, Relaxed and
 * Real). Relaxed settles in a third of the time, has no leaks and keeps its
 * haze three times as long; Sandbox plays like Relaxed.
 */
export const TERRAFORM_TUNING: Record<TerraformMode, TerraformTuning> = {
  real: {
    dryResponse: 20,
    oceanResponse: 90,
    spreadTime: 10,
    aerosolHalfLife: 120,
    leaks: true,
    // A marginal Mars leaks over an hour, the Moon (retention −1.67) in about five minutes.
    leakTime: 3600,
    leakDecade: 1.55,
  },
  relaxed: {
    dryResponse: 20 / 3,
    oceanResponse: 30,
    spreadTime: 10,
    aerosolHalfLife: 360,
    leaks: false,
    leakTime: 3600,
    leakDecade: 1.55,
  },
  sandbox: {
    dryResponse: 20 / 3,
    oceanResponse: 30,
    spreadTime: 10,
    aerosolHalfLife: 360,
    leaks: false,
    leakTime: 3600,
    leakDecade: 1.55,
  },
};

/** The integration step, s of game time. */
export const TERRAFORM_STEP = 1;
/** A checkpoint is kept every this many steps. */
const CHECKPOINT_EVERY = 30;

/** The mode in force at `time`: the last change at or before it, else the first one, else the default. */
export function modeAt(modes: readonly ModeChange[], time: number): TerraformMode {
  let mode = modes[0]?.mode ?? DEFAULT_TERRAFORM_MODE;
  for (const m of modes) if (m.time <= time) mode = m.mode;
  return mode;
}

/** ∫₀ˣ of a ramp from 0 to 1 over `spread`: how much of a parcel counts, summed over x seconds of releases. */
function rampIntegral(x: number, spread: number): number {
  if (x <= 0) return 0;
  if (spread <= 0) return x;
  return x <= spread ? (x * x) / (2 * spread) : x - spread / 2;
}

/**
 * How much of an action has taken effect by `time`: its amount is let go
 * evenly over its duration, and each part counts fully `spread` seconds
 * after it was let go (linearly in between).
 */
export function delivered(action: Pick<TerraformAction, 'start' | 'duration' | 'amount'>, time: number, spread = 0): number {
  const t = time - action.start;
  if (t <= 0) return 0;
  const d = action.duration;
  if (d <= 0) return action.amount * (spread > 0 ? Math.min(t / spread, 1) : 1);
  return (action.amount / d) * (rampIntegral(t, spread) - rampIntegral(t - d, spread));
}

/** When an action has fully taken effect, s. */
function actionEnd(action: TerraformAction, spread: number): number {
  return action.start + action.duration + (isGas(action.lever) ? spread : 0);
}

function isGas(lever: Lever): lever is Gas {
  return (GASES as readonly string[]).includes(lever);
}

/**
 * Molar masses, g/mol (NIST Chemistry WebBook), for the order in which a
 * leaking atmosphere loses its gases.
 */
export const MOLAR_MASS: Record<Gas, number> = { n2: 28.0134, o2: 31.9988, co2: 44.0095, h2: 2.01588 };

/**
 * Jeans escape parameter λ = v_esc² / u² of nitrogen on a leaking body. The
 * regime turns hydrodynamic below λ ≈ 2–3 and is near Jeans escape above 3
 * (Gronoff et al. 2020); a body on the cosmic shoreline is at that boundary.
 */
export const LEAK_LAMBDA_N2 = 3;

/**
 * How fast each gas leaks relative to nitrogen: the Jeans flux per molecule,
 * u (1 + λ) e^−λ with λ ∝ m and u ∝ 1/√m (Gronoff et al. 2020, eq. 5).
 * Hydrogen ~18×, oxygen ~0.68×, CO₂ ~0.21× at λ_N₂ = 3.
 */
export function leakFactor(gas: Gas): number {
  const flux = (m: number) => {
    const lambda = (LEAK_LAMBDA_N2 * m) / MOLAR_MASS.n2;
    return Math.sqrt(MOLAR_MASS.n2 / m) * (1 + lambda) * Math.exp(-lambda);
  };
  return flux(MOLAR_MASS[gas]) / flux(MOLAR_MASS.n2);
}
const LEAK_FACTOR: Record<Gas, number> = { n2: leakFactor('n2'), o2: leakFactor('o2'), co2: leakFactor('co2'), h2: leakFactor('h2') };

/** The leak's time constant for nitrogen (s) at this retention (log10 above the cosmic shoreline). */
export function leakTime(retention: number, tuning: TerraformTuning): number {
  return tuning.leakTime * 10 ** (retention / tuning.leakDecade);
}

/**
 * Heat capacity per area of what a planet's surface temperature has to
 * warm: the ground's, plus the air's (c_p P / g) and the ocean's mixed
 * layer (scaled by the water inventory). Battisti's energy-balance notes:
 * land 3×10⁶ (1 m of rock), the atmosphere 10⁷, a 75 m mixed layer 3×10⁸,
 * all J m⁻² K⁻¹. See docs/research/terraforming.md.
 */
export const HEAT_CAPACITY = {
  /** J m⁻² K⁻¹: 1200 J kg⁻¹ K⁻¹ × 1 m × 2500 kg m⁻³. */
  ground: 1200 * 2500,
  /** J m⁻² K⁻¹ per bar at 1 g: c_p of air (1004 J kg⁻¹ K⁻¹) × 10⁵ Pa / 9.81 m s⁻². */
  airPerBar: (1004 * 1e5) / 9.81,
  /** J m⁻² K⁻¹: a 75 m mixed layer, 75 × 4.2×10⁶. */
  ocean: 75 * 4.2e6,
} as const;

/**
 * The temperature's response time, s: dryResponse on a dry, airless world,
 * oceanResponse under a global ocean and Earth's air, and in between (and
 * beyond, for Venus's 92 bar) on a log scale of the heat capacity. Real
 * planets respond in proportion to it (a land planet in under two weeks,
 * an ocean planet in ~3 years: a ratio of ~100); the game keeps the order
 * and compresses the ratio to oceanResponse / dryResponse.
 */
export function responseTime(state: Pick<ClimateState, 'gases' | 'water'>, gravity: number, tuning: TerraformTuning): number {
  const c = (water: number, bar: number) => HEAT_CAPACITY.ground + (HEAT_CAPACITY.airPerBar * bar) / Math.max(gravity, 1e-3) + HEAT_CAPACITY.ocean * water;
  const dry = HEAT_CAPACITY.ground;
  const ocean = HEAT_CAPACITY.ground + HEAT_CAPACITY.airPerBar + HEAT_CAPACITY.ocean;
  const here = c(Math.max(0, state.water), totalPressure(state.gases));
  const x = Math.log(here / dry) / Math.log(ocean / dry);
  return tuning.dryResponse * (tuning.oceanResponse / tuning.dryResponse) ** x;
}

/** What a body's climate is doing at a moment. */
export interface TerraformSnapshot {
  /** Game time, s. */
  time: number;
  /** The climate now, at the temperature it has reached. */
  climate: ClimateData;
  /** The climate its state settles at if nothing more is done (aerosols and leaks aside). */
  target: ClimateData;
  /** Roughly how long until it's within half a kelvin of the target, s (0 when settled). */
  settlesIn: number;
}

interface Point {
  time: number;
  state: ClimateState;
  temperature: number;
}

/** Within this of the target counts as settled, K. */
const SETTLED = 0.5;

/**
 * One body's climate over time: its generated climate, its action log and
 * the game's mode changes. `at(time)` is a pure function of those, cached by
 * checkpoints; recording or changing an action drops the checkpoints after
 * it, so the next query steps on from before it.
 */
export class TerraformTimeline {
  private readonly setting: ClimateSetting;
  private readonly base: ClimateState;
  private readonly baseTemperature: number;
  private readonly actions: TerraformAction[] = [];
  private modes: ModeChange[] = [];
  private checkpoints: Point[] = [];

  constructor(base: ClimateData, actions: readonly TerraformAction[] = [], modes: readonly ModeChange[] = []) {
    this.setting = climateSettingOf(base);
    this.base = climateState(base);
    this.baseTemperature = base.temperature;
    for (const a of actions) this.actions.push({ ...a });
    this.actions.sort((a, b) => a.start - b.start);
    this.modes = [...modes].sort((a, b) => a.time - b.time);
  }

  get log(): readonly TerraformAction[] {
    return this.actions;
  }

  /** Adds an action (kept in order of start). */
  record(action: TerraformAction): void {
    let i = this.actions.length;
    while (i > 0 && this.actions[i - 1]!.start > action.start) i--;
    this.actions.splice(i, 0, { ...action });
    this.invalidate(action.start);
  }

  /** Changes the action at `index` (e.g. a ray still held: its duration and amount grow). */
  update(index: number, action: TerraformAction): void {
    const old = this.actions[index];
    if (!old) return;
    this.actions.splice(index, 1);
    this.invalidate(old.start);
    this.record(action);
  }

  /** The game's mode changes (the whole list); checkpoints after the first difference are dropped. */
  setModes(modes: readonly ModeChange[]): void {
    const next = [...modes].sort((a, b) => a.time - b.time);
    let from = Infinity;
    const n = Math.max(next.length, this.modes.length);
    for (let i = 0; i < n; i++) {
      const a = this.modes[i];
      const b = next[i];
      if (a?.time !== b?.time || a?.mode !== b?.mode) {
        from = Math.min(a?.time ?? Infinity, b?.time ?? Infinity);
        break;
      }
    }
    this.modes = next;
    if (from < Infinity) this.invalidate(from);
  }

  /** The climate at game time `time`. */
  at(time: number): TerraformSnapshot {
    const point = this.pointAt(time);
    const tuning = TERRAFORM_TUNING[modeAt(this.modes, time)];
    const climate = evaluateClimate(this.setting, point.state, point.temperature);
    const target = evaluateClimate(this.setting, point.state);
    const gap = Math.abs(target.temperature - point.temperature);
    const settlesIn = gap > SETTLED ? responseTime(point.state, this.setting.gravity, tuning) * Math.log(gap / SETTLED) : 0;
    return { time, climate, target, settlesIn };
  }

  private get start(): number {
    return this.actions[0]?.start ?? Infinity;
  }

  private invalidate(time: number): void {
    // A checkpoint at t was stepped to from t − 1: keep only those not after the change.
    this.checkpoints = this.checkpoints.filter((c) => c.time <= time);
  }

  private pointAt(time: number): Point {
    const t0 = this.start;
    if (!(time > t0)) return { time, state: climateState(this.base), temperature: this.baseTemperature };
    // Step on from the last checkpoint at or before `time` (or from the first action).
    let point: Point = { time: t0, state: climateState(this.base), temperature: this.baseTemperature };
    for (let i = this.checkpoints.length - 1; i >= 0; i--) {
      const c = this.checkpoints[i]!;
      if (c.time <= time && c.time >= t0) {
        point = { time: c.time, state: climateState(c.state), temperature: c.temperature };
        break;
      }
    }
    const steps = Math.floor((time - point.time) / TERRAFORM_STEP + 1e-9);
    for (let k = 0; k < steps; k++) {
      point = this.step(point, TERRAFORM_STEP);
      const n = Math.round((point.time - t0) / TERRAFORM_STEP);
      if (n % CHECKPOINT_EVERY === 0 && !this.checkpoints.some((c) => c.time === point.time)) {
        this.checkpoints.push({ time: point.time, state: climateState(point.state), temperature: point.temperature });
        this.checkpoints.sort((a, b) => a.time - b.time);
      }
    }
    const rest = time - point.time;
    return rest > 1e-9 ? this.step(point, rest) : point;
  }

  /** One step of `dt` seconds from `from` (which isn't changed). */
  private step(from: Point, dt: number): Point {
    const t1 = from.time + dt;
    const tuning = TERRAFORM_TUNING[modeAt(this.modes, from.time)];
    const s = climateState(from.state);

    for (const action of this.actions) {
      if (action.start >= t1) break;
      const spread = isGas(action.lever) ? tuning.spreadTime : 0;
      if (actionEnd(action, spread) < from.time) continue;
      const change = delivered(action, t1, spread) - delivered(action, from.time, spread);
      apply(s, action.lever, change);
    }

    s.aerosol *= 0.5 ** (dt / tuning.aerosolHalfLife);

    if (tuning.leaks) leak(s, this.setting, dt, tuning);

    const target = evaluateClimate(this.setting, s).temperature;
    const tau = responseTime(s, this.setting.gravity, tuning);
    const temperature = target + (from.temperature - target) * Math.exp(-dt / tau);
    return { time: t1, state: s, temperature };
  }
}

/** Moves a lever of `s` by `change`, within its bounds. */
function apply(s: ClimateState, lever: Lever, change: number): void {
  switch (lever) {
    case 'greenhouse':
      s.greenhouse = Math.max(0, s.greenhouse + change);
      return;
    case 'water':
      s.water = Math.min(1, Math.max(0, s.water + change));
      return;
    case 'starlight':
      s.starlight = Math.max(0, s.starlight + change);
      return;
    case 'aerosol':
      s.aerosol = Math.min(0.95, Math.max(0, s.aerosol + change));
      return;
    case 'heat':
      s.magicHeat += change;
      return;
    default:
      s.gases[lever] = Math.max(0, s.gases[lever] + change);
  }
}

/**
 * Air above what the body can hold (maxStablePressure) bleeds away: each
 * gas's share of the excess decays with the leak time, faster for lighter
 * gases (leakFactor), so a leaking atmosphere loses its hydrogen first and
 * its CO₂ last.
 */
function leak(s: ClimateState, setting: ClimateSetting, dt: number, tuning: TerraformTuning): void {
  const retention = atmosphereRetention(setting.escapeVelocity, setting.insolation);
  const stable = maxStablePressure(retention);
  const p = totalPressure(s.gases);
  if (!(p > stable)) return;
  const excess = p - stable;
  const time = leakTime(retention, tuning);
  for (const gas of GASES) {
    const share = (s.gases[gas] * excess) / p;
    s.gases[gas] -= share * (1 - Math.exp((-dt * LEAK_FACTOR[gas]) / time));
  }
}

/** The climate of a body with generated climate `base` after `actions`, at game time `time`. Pure. */
export function climateAt(
  base: ClimateData,
  actions: readonly TerraformAction[],
  time: number,
  modes: readonly ModeChange[] = [],
): TerraformSnapshot {
  return new TerraformTimeline(base, actions, modes).at(time);
}

// --- Matter: gas moved between bodies ---

/** A body's radius in Earth radii from its gravity and escape velocity (v² = 2GM/R, g = GM/R²: R ∝ v² / g). */
export function radiusFromSetting(setting: Pick<ClimateSetting, 'gravity' | 'escapeVelocity'>): number {
  return (setting.escapeVelocity / EARTH_ESCAPE) ** 2 / setting.gravity;
}
const EARTH_ESCAPE = 11.186;

/**
 * Surface pressure (bar) made by `mass` of gas, in Earth-bar (the mass that
 * makes 1 bar on Earth): p = M g / 4πR², so Δp = m · g / R² (g in g, R in
 * Earth radii). Small worlds fill up cheaply; big ones take many trips.
 */
export function pressureOfMass(mass: number, setting: Pick<ClimateSetting, 'gravity' | 'escapeVelocity'>): number {
  return (mass * setting.gravity) / radiusFromSetting(setting) ** 2;
}

/** The mass of gas (Earth-bar) that makes `pressure` bar on this body: the inverse of pressureOfMass. */
export function massOfPressure(pressure: number, setting: Pick<ClimateSetting, 'gravity' | 'escapeVelocity'>): number {
  return (pressure * radiusFromSetting(setting) ** 2) / setting.gravity;
}

// --- The logs of every body, for the game to keep ---

export interface TerraformLogsData {
  /** Body key (combat/busted.ts bodyKey) → its actions, in order of start. */
  bodies: Record<string, TerraformAction[]>;
  /** The game's terraforming mode changes, in time order. */
  modes: ModeChange[];
}

/**
 * Every body's action log and the game's mode changes, kept for the whole
 * game (levels are rebuilt on each visit, the logs stay). JSON-able for
 * save/load and the debug dump.
 */
export class TerraformLogs {
  private readonly bodies = new Map<string, TerraformAction[]>();
  private readonly modeChanges: ModeChange[] = [];

  /** A body's actions (empty if it was never touched). */
  actions(key: string): readonly TerraformAction[] {
    return this.bodies.get(key) ?? [];
  }

  get modes(): readonly ModeChange[] {
    return this.modeChanges;
  }

  /** Bodies with actions. */
  keys(): string[] {
    return [...this.bodies.keys()];
  }

  record(key: string, action: TerraformAction): void {
    const list = this.bodies.get(key) ?? [];
    let i = list.length;
    while (i > 0 && list[i - 1]!.start > action.start) i--;
    list.splice(i, 0, { ...action });
    this.bodies.set(key, list);
  }

  /** Switches the mode from `time` on (a no-op if it's the mode already in force). */
  setMode(time: number, mode: TerraformMode): void {
    if (modeAt(this.modeChanges, time) === mode && this.modeChanges.length > 0) return;
    this.modeChanges.push({ time, mode });
    this.modeChanges.sort((a, b) => a.time - b.time);
  }

  toJSON(): TerraformLogsData {
    return {
      bodies: Object.fromEntries([...this.bodies].map(([k, v]) => [k, v.map((a) => ({ ...a }))])),
      modes: this.modeChanges.map((m) => ({ ...m })),
    };
  }

  static fromJSON(data: TerraformLogsData): TerraformLogs {
    const logs = new TerraformLogs();
    for (const [key, actions] of Object.entries(data.bodies ?? {})) for (const a of actions) logs.record(key, a);
    for (const m of data.modes ?? []) logs.modeChanges.push({ ...m });
    logs.modeChanges.sort((a, b) => a.time - b.time);
    return logs;
  }
}
