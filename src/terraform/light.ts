import type { LightToolId } from '../combat/items';
import { climateState, evaluateClimate, type ClimateData, type ClimateSetting } from '../gen/climate';
import { applyLever, radiusFromSetting, type TerraformAction, type TerraformMode, type TerraformTimeline } from '../gen/terraform';

/*
 * Heat and light (docs/design/terraforming.md, phase 3): the first real
 * terraforming tools. Pure: what each does to a body's action log and what
 * it costs. The planet level's terraform/LightTools.ts uses them, the views
 * (terraform/LightRig.ts) draw what they leave up, and the planet lab's
 * Terraform folder plays them over time.
 *
 * - Orbital mirrors (Zubrin & McKay 1993): each adds a share of the body's
 *   own starlight while it's up. They stay: deployed and recalled one at a
 *   time, so the log says how many are up (`installationsAt`).
 * - The sunshade (Birch 1991): one per body, blocking a share of the light,
 *   closed or opened a step at a time. It shades the mirrors too (they're
 *   near the body, the shade far sunward), so starlight is
 *   (1 + k × mirrors) × (1 − shade).
 * - Aerosol spray (Pinatubo's haze): held, each second adds reflectance to
 *   a stratospheric haze, which rains out (gen/terraform.ts aerosolHalfLife).
 *   It needs air to hold it up.
 * - The mirror lance: the mirrors focused on a point. Local only (it burns
 *   what lives there, terraform/LightTools.ts), never the global climate.
 *
 * Mirrors and the shade write `starlight` changes worked out when they're
 * used, so the log's sum is always exactly starlightOf(mirrors, shade). The
 * real numbers and the stylisation are in docs/research/terraforming.md.
 */

export type { LightToolId };
export const LIGHT_TOOLS: readonly LightToolId[] = ['mirror', 'lance', 'sunshade', 'aerosol'];

/** Whether the mirror tool deploys one or recalls one. */
export type MirrorWay = 'deploy' | 'recall';
/** Whether the sunshade tool closes it a step (blocks more) or opens it. */
export type ShadeWay = 'close' | 'open';

export const lightParams = {
  /**
   * Each mirror adds this share of the body's own starlight (the design's
   * +25%: four make ×2). A flat mirror facing the sun intercepts the light
   * its own area does, so it's a sail of half the body's radius (computed;
   * the views draw it that big).
   */
  mirrorStarlight: 0.25,
  /** A mirror unfolds and takes station over this long, s; folds away in `recallTime`. */
  deployTime: 8,
  recallTime: 4,
  /** The sunshade closes or opens this much of the light a step, over `shadeTime` s. */
  shadeStep: 0.1,
  shadeTime: 4,
  /**
   * Aerosol haze reflectance a second of spraying: about one Pinatubo
   * (global optical depth 0.15, reflectance 0.017–0.025;
   * docs/research/terraforming.md) a second.
   */
  aerosolPerSecond: 0.02,
  /** The haze needs air to hold it up: at least this much, bar (sulphate settles out of a vacuum). */
  minHazePressure: 0.01,
  /** The haze can't be thickened past this reflectance. */
  maxAerosol: 0.6,
  /**
   * Energy, for a body of Earth's size (bigger bodies cost more by their
   * surface area: bigger mirrors, a bigger shade, more haze): a mirror built,
   * the whole shade (a step costs its share), a second of spray or of the lance.
   */
  cost: { mirror: 150, shade: 400, aerosol: 6, lance: 6 } as Record<'mirror' | 'shade' | 'aerosol' | 'lance', number>,
  /** The share of a mirror's or a shade step's cost given back when it's recalled or opened. */
  refund: 0.5,
};

/** How many mirrors and how much shade a body can have, per mode (the design's limits; Sandbox's are only practical caps). */
export interface LightLimits {
  mirrors: number;
  /** The most the shade can block, 0–1. */
  shade: number;
}

/**
 * Real: 4 mirrors and one shade blocking up to 70% (the design); Relaxed: 6
 * mirrors and the two shades' worth, 90%; Sandbox: 12 and 95%.
 */
export const LIGHT_LIMITS: Record<TerraformMode, LightLimits> = {
  real: { mirrors: 4, shade: 0.7 },
  relaxed: { mirrors: 6, shade: 0.9 },
  sandbox: { mirrors: 12, shade: 0.95 },
};

/** The starlight factor with `mirrors` up and the shade blocking `shade` (0–1). */
export function starlightOf(mirrors: number, shade: number, k = lightParams.mirrorStarlight): number {
  return (1 + k * mirrors) * (1 - shade);
}

/** One mirror over a body: when it began unfolding (and for how long), and when it was recalled, if it was. */
export interface MirrorSlot {
  deployed: number;
  deployTime: number;
  recalled: number | null;
  recallTime: number;
}

/** What stays over a body at a moment, read back from its log. */
export interface Installations {
  /** Mirrors up or unfolding (counted for the limit and the next change). */
  mirrors: number;
  /** Mirrors fully unfolded and on station (the lance needs one). */
  ready: number;
  /** Every mirror to draw, with its unfolding or folding (`mirrorUnfold`); a recalled one stays until it's folded away. */
  slots: MirrorSlot[];
  /** How much the shade blocks once it's done moving, 0–1. */
  shade: number;
  /** How much it blocks now, as it closes or opens. */
  shadeShown: number;
}

export const NO_INSTALLATIONS: Installations = { mirrors: 0, ready: 0, slots: [], shade: 0, shadeShown: 0 };

/** How far a mirror is unfolded at `time`, 0–1 (0 again once it's folded away after a recall). */
export function mirrorUnfold(slot: MirrorSlot, time: number): number {
  const out = slot.deployTime > 0 ? clamp01((time - slot.deployed) / slot.deployTime) : time >= slot.deployed ? 1 : 0;
  if (slot.recalled === null || time < slot.recalled) return out;
  return slot.recallTime > 0 ? out * (1 - clamp01((time - slot.recalled) / slot.recallTime)) : 0;
}

/** The mirrors and the shade over a body at game time `time`, from its log (actions in order of start). */
export function installationsAt(actions: readonly TerraformAction[], time: number): Installations {
  const slots: MirrorSlot[] = [];
  let mirrors = 0;
  let shade = 0;
  let shadeShown = 0;
  for (const a of actions) {
    if (a.start > time) break;
    if (a.tool === 'mirror') {
      const level = Math.max(0, Math.round(a.level ?? mirrors));
      // Up: new slots unfolding. Down: the last ones still up fold away.
      for (let n = mirrors; n < level; n++) slots.push({ deployed: a.start, deployTime: a.duration, recalled: null, recallTime: 0 });
      for (let n = mirrors; n > level; n--) {
        const slot = [...slots].reverse().find((s) => s.recalled === null);
        if (slot) {
          slot.recalled = a.start;
          slot.recallTime = a.duration;
        }
      }
      mirrors = level;
    } else if (a.tool === 'shade') {
      const from = shade;
      shade = clamp01(a.level ?? shade);
      const u = a.duration > 0 ? clamp01((time - a.start) / a.duration) : 1;
      shadeShown = from + (shade - from) * u;
    }
  }
  const live = slots.filter((s) => mirrorUnfold(s, time) > 0 || s.recalled === null);
  const ready = live.filter((s) => s.recalled === null && mirrorUnfold(s, time) >= 1).length;
  return { mirrors, ready, slots: live, shade, shadeShown };
}

/** The body's surface area in Earth's (costs scale with it). */
function area(setting: Pick<ClimateSetting, 'gravity' | 'escapeVelocity'>): number {
  return radiusFromSetting(setting) ** 2;
}

/**
 * The action deploying or recalling a mirror at `time` (`way`), or why it
 * can't be (the mode's limit, none up). Its starlight change is the one
 * mirror's share under the shade as it will be.
 */
export function mirrorAction(actions: readonly TerraformAction[], time: number, mode: TerraformMode, way: MirrorWay): TerraformAction | string {
  const now = installationsAt(actions, time);
  const n = now.mirrors;
  if (way === 'deploy' && n >= LIGHT_LIMITS[mode].mirrors) return `No more mirrors here: ${LIGHT_LIMITS[mode].mirrors} is the most`;
  if (way === 'recall' && n <= 0) return 'No mirror here to recall';
  const level = way === 'deploy' ? n + 1 : n - 1;
  return {
    lever: 'starlight',
    start: time,
    duration: way === 'deploy' ? lightParams.deployTime : lightParams.recallTime,
    amount: starlightOf(level, now.shade) - starlightOf(n, now.shade),
    tool: 'mirror',
    level,
  };
}

/**
 * The action closing or opening the sunshade a step at `time` (`way`), or
 * setting it to `block` exactly (the planet lab), or why it can't be (shut
 * as far as the mode allows, or open already).
 */
export function shadeAction(
  actions: readonly TerraformAction[],
  time: number,
  mode: TerraformMode,
  way: ShadeWay | { block: number },
): TerraformAction | string {
  const now = installationsAt(actions, time);
  const max = LIGHT_LIMITS[mode].shade;
  const from = now.shade;
  let to: number;
  if (typeof way === 'object') to = Math.min(max, clamp01(way.block));
  else {
    if (way === 'close' && from >= max - 1e-9) return `The shade blocks ${Math.round(max * 100)}%: the most it can here`;
    if (way === 'open' && from <= 1e-9) return 'The shade is open: no light blocked';
    // Steps land on the step's grid (and the limit).
    const step = lightParams.shadeStep;
    to = way === 'close' ? Math.min(max, (Math.floor(from / step + 1e-6) + 1) * step) : Math.max(0, (Math.ceil(from / step - 1e-6) - 1) * step);
  }
  to = Math.round(to * 1000) / 1000;
  if (Math.abs(to - from) < 1e-9) return 'The shade is set so already';
  return {
    lever: 'starlight',
    start: time,
    duration: lightParams.shadeTime,
    amount: starlightOf(now.mirrors, to) - starlightOf(now.mirrors, from),
    tool: 'shade',
    level: to,
  };
}

/** Energy a mirror costs to build on this body (free in Sandbox); recalling one gives back `lightParams.refund` of it. */
export function mirrorCost(setting: Pick<ClimateSetting, 'gravity' | 'escapeVelocity'>, mode: TerraformMode): number {
  return mode === 'sandbox' ? 0 : lightParams.cost.mirror * area(setting);
}

/** Energy closing the shade by `block` (0–1 of the light) costs on this body; opening it gives back `lightParams.refund` of it. */
export function shadeCost(setting: Pick<ClimateSetting, 'gravity' | 'escapeVelocity'>, mode: TerraformMode, block: number): number {
  return mode === 'sandbox' ? 0 : lightParams.cost.shade * area(setting) * Math.abs(block);
}

/** Energy a second the aerosol spray (by the surface area) or the lance (local: the same anywhere) costs. */
export function heldCost(tool: 'aerosol' | 'lance', setting: Pick<ClimateSetting, 'gravity' | 'escapeVelocity'>, mode: TerraformMode): number {
  if (mode === 'sandbox') return 0;
  return tool === 'aerosol' ? lightParams.cost.aerosol * area(setting) : lightParams.cost.lance;
}

/** What the aerosol spray adds a second: haze reflectance. */
export function aerosolRate(): number {
  return lightParams.aerosolPerSecond;
}

/** Why the spray can't thicken the haze here now (no air to hold it, or as thick as it gets), or null. */
export function aerosolBlocked(climate: Pick<ClimateData, 'pressure' | 'aerosol'>): string | null {
  if (!(climate.pressure >= lightParams.minHazePressure)) return 'No air here to hold a haze up';
  if (climate.aerosol >= lightParams.maxAerosol) return 'The haze is as thick as it gets';
  return null;
}

/**
 * The spray held for `seconds` from `start` (the planet lab's button, and
 * what the game's held spray writes): one action a second, each checked
 * against the climate then, stopping where the haze can't thicken. Each is
 * recorded on `timeline` as it's made.
 */
export function holdAerosol(timeline: TerraformTimeline, start: number, seconds: number): TerraformAction[] {
  const out: TerraformAction[] = [];
  for (let s = 0; s < seconds - 1e-9; s++) {
    const t = start + s;
    if (aerosolBlocked(timeline.at(t).climate)) break;
    const duration = Math.min(1, seconds - s);
    const action: TerraformAction = { lever: 'aerosol', start: t, duration, amount: aerosolRate() * duration };
    timeline.record(action);
    out.push(action);
  }
  return out;
}

/**
 * Where a world would settle if `tool` were used now (the chart's forecast
 * arrow): a mirror deployed or recalled, the shade moved a step, or
 * `seconds` of spray (the haze's decay aside, as the target leaves it). Null
 * for the lance (it changes nothing global) or a tool that can't be used.
 */
export function forecastLight(
  target: ClimateData,
  actions: readonly TerraformAction[],
  time: number,
  mode: TerraformMode,
  tool: LightToolId,
  ways: { mirror: MirrorWay; shade: ShadeWay },
  seconds: number,
): ClimateData | null {
  const state = climateState(target);
  if (tool === 'lance') return null;
  if (tool === 'aerosol') {
    if (aerosolBlocked(target)) return null;
    applyLever(state, 'aerosol', aerosolRate() * seconds);
    return evaluateClimate(target, state);
  }
  const action = tool === 'mirror' ? mirrorAction(actions, time, mode, ways.mirror) : shadeAction(actions, time, mode, ways.shade);
  if (typeof action === 'string') return null;
  applyLever(state, 'starlight', action.amount);
  return evaluateClimate(target, state);
}

/**
 * A haze's vertical optical depth from its reflectance: r ≈ 0.11–0.17 τ for
 * Pinatubo's haze (docs/research/terraforming.md), so τ ≈ r / 0.14.
 */
export const HAZE_REFLECTANCE_PER_DEPTH = 0.14;

export function hazeDepth(aerosol: number): number {
  return Math.max(0, aerosol) / HAZE_REFLECTANCE_PER_DEPTH;
}

/** A mirror's station, in body radii from the centre (stylised: near the body, where both views show it). */
export const MIRROR_DISTANCE = 2.6;
/** Its angle from the sun's direction: a little sunward of the terminator, over the day side. */
export const MIRROR_POLAR = (72 * Math.PI) / 180;
/** Where it aims when not lancing: this far from the sub-solar point towards it. */
export const MIRROR_AIM = (40 * Math.PI) / 180;
/** The shade stands this far sunward (body radii) and is this wide (its radius): stylised, as near as the views can show it. */
export const SHADE_DISTANCE = 4;
export const SHADE_RADIUS = 1.6;

/**
 * Mirror `k`'s place round the sun's direction (radians): the golden angle
 * apart, so each keeps its station as others come and go and any number of
 * them spread round evenly (recalling takes the last one).
 */
export function mirrorAzimuth(k: number): number {
  return 0.35 + k * Math.PI * (3 - Math.sqrt(5));
}

/**
 * The radius (body radii) of a flat mirror that intercepts `share` of the
 * starlight the body does, tilted so its normal is `cosIncidence` from the
 * sun: share × πR² = π r² cos i.
 */
export function sailRadius(share: number, cosIncidence: number): number {
  return Math.sqrt(share / Math.max(0.2, cosIncidence));
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * How bright the star's light is drawn on a body with starlight factor
 * `starlight` (low orbit's sunlight and air): stylised as its square root,
 * so four mirrors (×2) look brighter without blowing out the day side and a
 * 70% shade (×0.3) dimmer without blacking it out (the eye adapts).
 */
export function lightBrightness(starlight: number): number {
  return Math.min(2, Math.max(0.25, Math.sqrt(Math.max(0, starlight))));
}

/** The chart's line for what stays over a body and its haze, e.g. "Mirrors 2/4 · shade 30% · starlight ×1.05 · haze 4%" ('' for nothing). */
export function describeInstallations(inst: Installations, climate: Pick<ClimateData, 'starlight' | 'aerosol'>, mode: TerraformMode): string {
  const parts: string[] = [];
  const limits = LIGHT_LIMITS[mode];
  if (inst.mirrors > 0) parts.push(`Mirrors ${inst.mirrors}/${limits.mirrors}${inst.ready < inst.mirrors ? ' (unfolding)' : ''}`);
  if (inst.shade > 0 || inst.shadeShown > 0) parts.push(`shade ${Math.round(inst.shade * 100)}%`);
  if (Math.abs(climate.starlight - 1) > 0.005) parts.push(`starlight ×${climate.starlight.toFixed(2)}`);
  if (climate.aerosol >= 0.001) parts.push(`haze ${Math.round(climate.aerosol * 100)}%`);
  const line = parts.join(' · ');
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : '';
}
