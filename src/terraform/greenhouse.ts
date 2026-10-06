import type { GreenhouseToolId } from '../combat/items';
import { climateState, evaluateClimate, type ClimateData, type ClimateSetting } from '../gen/climate';
import {
  GREENHOUSE_WORKS,
  TERRAFORM_TUNING,
  radiusFromSetting,
  runningAt,
  worksRuns,
  type TerraformAction,
  type TerraformMode,
  type WorksKind,
  type WorksRun,
} from '../gen/terraform';

/*
 * Greenhouse (docs/design/terraforming.md, phase 4): works that stand on
 * the ground and run until they're beamed back up. Pure: what each does to
 * a body's action log, where they may stand and what they cost. The planet
 * level's terraform/GreenhouseTools.ts uses them, terraform/WorksLook.ts
 * draws them, and the planet lab's Terraform folder plays them over time.
 *
 * - The greenhouse factory (Zubrin & McKay 1993; Gerstell et al. 2001):
 *   makes super-greenhouse gas (trace greenhouse in Earth's units) until
 *   the air holds its share, then keeps it topped up as it breaks down.
 *   Taken away, its gas breaks down slowly. It needs air to work in (the
 *   trace gas's optical depth grows with the pressure), but it runs anyway.
 * - The carbon sink (enhanced weathering, the carbonate–silicate cycle sped
 *   up): crushed rock that locks CO₂ (and the trace gases) away, drawing
 *   them down while it runs. How a Venus is thinned.
 *
 * The timeline (gen/terraform.ts) plays what they do from the log; this
 * module writes the log. Real numbers and the stylisation are in
 * docs/research/terraforming.md, Phase 4.
 */

export type { GreenhouseToolId };
export const GREENHOUSE_TOOLS: readonly GreenhouseToolId[] = ['factory', 'sink'];

export const greenhouseParams = {
  /** A works is lowered from this high (planet units) over `landTime`, and lifted away in `liftTime`, s. */
  dropHeight: 40,
  landTime: 3,
  liftTime: 2,
  /** Works stand at least this far apart (radians of arc on the body; ~10 planet units on an Earth). */
  spacing: 0.025,
  /** How close (radians of arc) a click must be to a works to beam it back up. */
  pickRadius: 0.012,
  /** Energy, for a body of Earth's size (bigger bodies cost more by their surface area): one works built, and a second of it running. */
  cost: { factory: 300, sink: 300 } as Record<WorksKind, number>,
  upkeep: { factory: 2, sink: 2 } as Record<WorksKind, number>,
  /** The share of the build cost given back when it's beamed up. */
  refund: 0.5,
  /** How long the chart's arrow runs a new sink for, s. */
  sinkForecast: 120,
};

/** How many works of each kind a body can have, per mode (the design's limits; Sandbox's are only a practical cap). */
export const WORKS_LIMITS: Record<TerraformMode, Record<WorksKind, number>> = {
  real: { factory: 3, sink: 3 },
  relaxed: { factory: 5, sink: 5 },
  sandbox: { factory: 12, sink: 12 },
};

/** The works standing (or being lowered or lifted) on a body at a moment, read back from its log. */
export interface GroundWorks {
  /** Every works to draw: landed, being lowered or being lifted away. */
  runs: WorksRun[];
  /** Works there now or being lowered (counted for the limit). */
  factories: number;
  sinks: number;
  /** Of them, those running now. */
  factoriesRunning: number;
  sinksRunning: number;
  /** Energy a second all of them cost while they run. */
  upkeep: number;
}

export const NO_WORKS: GroundWorks = { runs: [], factories: 0, sinks: 0, factoriesRunning: 0, sinksRunning: 0, upkeep: 0 };

/** The works on a body at game time `time`, from its log. */
export function worksAt(actions: readonly TerraformAction[], time: number): GroundWorks {
  const all = worksRuns(actions.filter((a) => a.start <= time));
  const runs = all.filter((r) => r.removedBy === null || time < r.removedBy);
  const standing = (kind: WorksKind) => runs.filter((r) => r.kind === kind && r.removed === null).length;
  let upkeep = 0;
  for (const r of runs) if (r.from <= time && r.removed === null) upkeep += r.upkeep;
  return {
    runs,
    factories: standing('factory'),
    sinks: standing('sink'),
    factoriesRunning: runningAt(runs, 'factory', time),
    sinksRunning: runningAt(runs, 'sink', time),
    upkeep,
  };
}

/** How far a works is down (0 at `dropHeight`, 1 landed) and then lifted away (back to 0) at `time`. */
export function worksDescent(run: WorksRun, time: number): number {
  const down = run.from > run.placed ? clamp01((time - run.placed) / (run.from - run.placed)) : 1;
  if (run.removed === null || run.removedBy === null || time < run.removed) return down;
  const up = run.removedBy > run.removed ? clamp01((time - run.removed) / (run.removedBy - run.removed)) : 1;
  return down * (1 - up);
}

/** The body's surface area in Earth's (costs scale with it). */
function area(setting: Pick<ClimateSetting, 'gravity' | 'escapeVelocity'>): number {
  return radiusFromSetting(setting) ** 2;
}

/** Energy a works costs to build on this body (free in Sandbox); beaming it up gives back `greenhouseParams.refund` of it. */
export function worksCost(kind: WorksKind, setting: Pick<ClimateSetting, 'gravity' | 'escapeVelocity'>, mode: TerraformMode): number {
  return mode === 'sandbox' ? 0 : greenhouseParams.cost[kind] * area(setting);
}

/** Energy a second a works costs while it runs on this body (free in Sandbox). */
export function worksUpkeep(kind: WorksKind, setting: Pick<ClimateSetting, 'gravity' | 'escapeVelocity'>, mode: TerraformMode): number {
  return mode === 'sandbox' ? 0 : greenhouseParams.upkeep[kind] * area(setting);
}

/** The works standing within `radius` (radians of arc) of `site`, nearest first, or null. */
export function worksNear(works: GroundWorks, site: readonly [number, number, number], radius: number, kind?: WorksKind): WorksRun | null {
  const cos = Math.cos(radius);
  let best: WorksRun | null = null;
  let bestDot = cos;
  for (const r of works.runs) {
    if (r.removed !== null || (kind && r.kind !== kind)) continue;
    const dot = r.site[0] * site[0] + r.site[1] * site[1] + r.site[2] * site[2];
    if (dot >= bestDot) {
      bestDot = dot;
      best = r;
    }
  }
  return best;
}

/**
 * The action beaming a works of `kind` down at `site` (a unit vector in
 * the body frame; the caller checks it's dry land) at `time`, or why it
 * can't be (the mode's limit, another works too close).
 */
export function placeAction(
  actions: readonly TerraformAction[],
  time: number,
  mode: TerraformMode,
  kind: WorksKind,
  site: readonly [number, number, number],
  setting: Pick<ClimateSetting, 'gravity' | 'escapeVelocity'>,
): TerraformAction | string {
  const works = worksAt(actions, time);
  const limit = WORKS_LIMITS[mode][kind];
  const count = kind === 'factory' ? works.factories : works.sinks;
  if (count >= limit) return `No more ${kind === 'factory' ? 'factories' : 'carbon sinks'} here: ${limit} is the most`;
  if (worksNear(works, site, greenhouseParams.spacing)) return 'Too close to other works: set it down further off';
  const [x, y, z] = site;
  const n = Math.hypot(x, y, z) || 1;
  return {
    lever: 'greenhouse',
    start: time,
    duration: greenhouseParams.landTime,
    amount: 0,
    site: [x / n, y / n, z / n],
    tool: kind,
    level: 1,
    upkeep: worksUpkeep(kind, setting, mode),
  };
}

/** The action beaming `run` back up at `time`: it stops at once. */
export function removeAction(run: WorksRun, time: number): TerraformAction {
  return { lever: 'greenhouse', start: time, duration: greenhouseParams.liftTime, amount: 0, site: [...run.site], tool: run.kind, level: 0 };
}

/**
 * Where a world would settle with one more works of `kind` running now (the
 * chart's forecast arrow): a factory at its full share, a sink after
 * `greenhouseParams.sinkForecast` seconds (left running, it would take all
 * the CO₂). Null when one can't be added.
 */
export function forecastWorks(
  target: ClimateData,
  base: Pick<ClimateData, 'greenhouse'>,
  actions: readonly TerraformAction[],
  time: number,
  mode: TerraformMode,
  kind: WorksKind,
): ClimateData | null {
  const works = worksAt(actions, time);
  if ((kind === 'factory' ? works.factories : works.sinks) >= WORKS_LIMITS[mode][kind]) return null;
  const state = climateState(target);
  if (kind === 'factory') {
    state.greenhouse = Math.max(state.greenhouse, base.greenhouse + (works.factoriesRunning + 1) * GREENHOUSE_WORKS.factoryCap);
  } else {
    const keep = Math.exp(-greenhouseParams.sinkForecast / TERRAFORM_TUNING[mode].sinkTime);
    state.gases.co2 *= keep;
    state.greenhouse *= keep;
  }
  return evaluateClimate(target, state);
}

/** The chart's line for the works on a body, e.g. "Factories 2/3 · sinks 1/3 · greenhouse ×6.2" ('' for none). */
export function describeWorks(works: GroundWorks, climate: Pick<ClimateData, 'greenhouse'>, mode: TerraformMode): string {
  const limits = WORKS_LIMITS[mode];
  const parts: string[] = [];
  if (works.factories > 0) parts.push(`factories ${works.factories}/${limits.factory}${works.factoriesRunning < works.factories ? ' (landing)' : ''}`);
  if (works.sinks > 0) parts.push(`sinks ${works.sinks}/${limits.sink}${works.sinksRunning < works.sinks ? ' (landing)' : ''}`);
  if (parts.length > 0) parts.push(`greenhouse ×${climate.greenhouse.toFixed(1)}`);
  const line = parts.join(' · ');
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : '';
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
