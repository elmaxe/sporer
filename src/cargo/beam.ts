/*
 * The cargo beam's motion, pure: how fast things go up and down the beam,
 * how they shrink on the way up (so a tree fits in the UFO) and grow back on
 * the way down, and how they fall when let go. Stylised, in planet-level
 * units (the UFO is ~4 wide, a tree 6–14 tall).
 */

export const beamParams = {
  /** Farthest the beam reaches from the ship, planet units. */
  range: 70,
  /** Units per second along the beam, up and down. */
  speed: 9,
  /** Shortest time a trip up or down the beam takes, s. */
  minTime: 0.9,
  /** How tall something is when it reaches the ship (its full height shrinks to this). */
  carriedHeight: 1.2,
  /** Falling: acceleration, units/s² (stylised: the same on every body), and fastest speed. */
  gravity: 30,
  maxFallSpeed: 60,
};

/** Seconds a trip along a beam `length` units long takes. */
export function tripTime(length: number, p = beamParams): number {
  return Math.max(p.minTime, length / p.speed);
}

/** Eased 0–1 position along the beam for trip progress `t` (0–1): it starts and ends gently. */
export function beamEase(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/** The scale something `height` tall (at scale 1) has at the ship: small enough to fit, never bigger than `full`. */
export function carriedScale(height: number, full: number, p = beamParams): number {
  return Math.min(full, p.carriedHeight / Math.max(height, 1e-6));
}

/** Its scale `t` (0 on the ground, 1 at the ship) of the way up: shrinking from `full` to `small` as it rises. */
export function beamScale(t: number, full: number, small: number): number {
  const u = Math.min(1, Math.max(0, t));
  return full + (small - full) * u;
}

/** A falling thing's height above the ground and speed (down is positive). */
export interface Fall {
  height: number;
  speed: number;
}

/** Steps a fall by `dt` seconds; true once it has hit the ground (height clamped to 0). */
export function stepFall(f: Fall, dt: number, p = beamParams): boolean {
  f.speed = Math.min(p.maxFallSpeed, f.speed + p.gravity * dt);
  f.height -= f.speed * dt;
  if (f.height > 0) return false;
  f.height = 0;
  return true;
}

/**
 * Its scale while falling from `startHeight` (where it was let go, at scale
 * `startScale`) with `height` still to go: growing back to `full` by the time it lands.
 */
export function fallScale(height: number, startHeight: number, startScale: number, full: number): number {
  if (startHeight <= 0) return full;
  const u = Math.min(1, Math.max(0, height / startHeight));
  return full + (startScale - full) * u;
}
