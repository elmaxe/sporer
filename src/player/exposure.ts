/*
 * Eye (camera) adaptation to the star's brightness. Pure maths; the entity is
 * EyeAdaptation.ts. Stars are drawn over-bright (a white-hot disc with a
 * coloured limb and a strong glow); the more of the view a star fills, the
 * lower the exposure goes, until its surface shows at its natural colours.
 * The rest of the scene dims along, like a camera stopping down.
 */

export const exposureParams = {
  /** Star surface brightness before adaptation (1 = its plain colours). */
  starIntensity: 2.6,
  /** How strongly the star's share of the view pulls the exposure down. */
  sensitivity: 6,
  /** Lowest exposure; 1 / starIntensity shows the surface at its plain colours. */
  minExposure: 0.38,
  /** Seconds (time constant) to adapt to more light: fast, like squinting. */
  darkenSeconds: 0.35,
  /** Seconds to adapt back to the dark: slower. */
  brightenSeconds: 1.6,
  /** How much the rest of the scene dims along (0 = not at all, 1 = as much as the star). */
  sceneDimming: 0.75,
};

export type ExposureParams = typeof exposureParams;

/**
 * How much of the view a star fills, 0–1: its disc's area relative to the
 * view's (by the vertical half field of view), faded out as it leaves the
 * view. `angularRadius` and `offAxis` (angle between the view direction and
 * the star) are in radians.
 */
export function starGlare(angularRadius: number, offAxis: number, halfFov: number): number {
  const coverage = Math.min(1, (angularRadius / halfFov) ** 2);
  // By the disc's nearest edge: fully counted while it reaches the middle of
  // the view, gone once it's out of view.
  const edge = Math.max(0, offAxis - angularRadius);
  const visible = 1 - smoothstep(halfFov * 0.3, halfFov * 1.2, edge);
  return coverage * visible;
}

/** The exposure the eye settles at for a total glare. 1 = dark-adapted. */
export function targetExposure(glare: number, params: ExposureParams = exposureParams): number {
  return Math.min(1, Math.max(params.minExposure, 1 / (1 + params.sensitivity * glare)));
}

/** One frame of adaptation from `current` towards `target` (frame-rate independent). */
export function adaptExposure(
  current: number,
  target: number,
  dt: number,
  params: ExposureParams = exposureParams,
): number {
  const tau = target < current ? params.darkenSeconds : params.brightenSeconds;
  return target + (current - target) * Math.exp(-dt / Math.max(tau, 1e-3));
}

/** Tone-mapping exposure for everything but the star: part of the way to `exposure`. */
export function sceneExposure(exposure: number, params: ExposureParams = exposureParams): number {
  return 1 + (exposure - 1) * params.sceneDimming;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
