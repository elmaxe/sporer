import type { StarMix } from './starMix';

/**
 * How the volcanoes sound from where the camera is (tunables in the 'Volcano
 * sound' debug folder). Distances are measured from the vent in units of the
 * volcano's footprint radius, so a small moon's volcano sounds near from as
 * close, for its size, as a big planet's.
 */
export const volcanoSoundParams = {
  /** Distance (in footprint radii) at which a volcano is at half strength. */
  reach: 8,
  /** Below this distance only the near sound plays… */
  nearFrom: 0.8,
  /** …and beyond this one only the far sound. */
  nearTo: 4,
  /**
   * The loudness (0–1) of a volcano barely erupting, next to one erupting at
   * full strength (a settled one, at `volcanoParams.idle`, is a bit louder).
   */
  quiet: 0.5,
  /**
   * How far below the volcano's horizon the camera can be and still hear it
   * (the sine of the angle): it fades out from its horizon to this, so the
   * far side of the globe is quiet.
   */
  belowHorizon: 0.3,
};

/** Level (0–1) of the near and far loops. */
export type VolcanoMix = StarMix;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * One volcano's near and far levels for a listener `distance` from its vent,
 * written into `out`. `baseRadius` is its footprint's radius, `elevation` the
 * sine of the listener's angle above the vent's horizon (1 straight overhead,
 * negative beyond the curve of the globe) and `activity` how hard it erupts
 * (0–1; risen and settled is `volcanoParams.idle`, 0 is silent). Its strength falls off as
 * 1 / (1 + (d / reach)²) and is shared between the two loops with an
 * equal-power crossfade from near (close) to far.
 */
export function volcanoMix(
  distance: number,
  baseRadius: number,
  elevation: number,
  activity: number,
  out: VolcanoMix,
  params = volcanoSoundParams,
): VolcanoMix {
  const d = Math.max(0, distance) / baseRadius;
  const a = Math.min(1, Math.max(0, activity));
  const strength =
    (1 / (1 + (d / params.reach) ** 2)) *
    (params.quiet + (1 - params.quiet) * a) *
    (a > 0 ? 1 : 0) *
    smoothstep(-params.belowHorizon, 0, elevation);
  const angle = smoothstep(params.nearFrom, params.nearTo, d) * (Math.PI / 2);
  out.near = strength * Math.cos(angle);
  out.far = strength * Math.sin(angle);
  return out;
}
