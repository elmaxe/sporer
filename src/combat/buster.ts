/*
 * The planet buster's timeline, as pure functions of the seconds since it
 * was fired (no scene). Unit-tested in tests/buster.test.ts; the
 * projectile's path is combat/path.ts.
 *
 *   0          launch: the projectile leaves the ship, accelerating down
 *   flightTime impact: a bright flash where it hits, and the crust starts
 *              to glow and crack outwards from there
 *   blastAt    the blast: a blinding flash, the globe is gone and its
 *              pieces fly out (gen/debris.ts), a fireball swells and a
 *              shock ring races out along the old equator
 *   doneAt     the field has settled enough: the player can leave again
 */

export const busterParams = {
  /** Seconds from launch to impact. */
  flightTime: 2.2,
  /** Seconds from impact to the blast, while the crust glows and cracks. */
  fuse: 1.8,
  /** Seconds after the blast until the player may leave. */
  settle: 5,
  /** Peak brightness of the impact's and the blast's screen flashes (0–1) and their fade times, seconds. */
  impactFlash: 0.55,
  impactFade: 0.35,
  blastFlash: 1,
  blastFade: 0.9,
  /** The fireball: largest size (globe radii), and how long it lasts. */
  fireballSize: 2.6,
  fireballTime: 3,
  /** The shock ring: outer radius at the end (globe radii) and how long it races out. */
  ringSize: 7,
  ringTime: 4,
};

export type BusterParams = typeof busterParams;
export type BusterPhase = 'flight' | 'fuse' | 'blast' | 'done';

/** Seconds from launch to the blast. */
export function blastAt(p: BusterParams = busterParams): number {
  return p.flightTime + p.fuse;
}

/** Seconds from launch until the player may leave the planet again. */
export function doneAt(p: BusterParams = busterParams): number {
  return blastAt(p) + p.settle;
}

export function busterPhase(t: number, p: BusterParams = busterParams): BusterPhase {
  if (t < p.flightTime) return 'flight';
  if (t < blastAt(p)) return 'fuse';
  return t < doneAt(p) ? 'blast' : 'done';
}

/** How far along its path the projectile is (0 → 1): it leaves the ship moving and speeds up. */
export function projectileProgress(t: number, p: BusterParams = busterParams): number {
  const s = Math.min(1, Math.max(0, t / p.flightTime));
  return s * (0.35 + 0.65 * s);
}

/** The white screen flash (0–1): a short one at the impact, a blinding one at the blast. */
export function flashAt(t: number, p: BusterParams = busterParams): number {
  const impact = t >= p.flightTime ? p.impactFlash * Math.exp(-(t - p.flightTime) / p.impactFade) : 0;
  const blast = t >= blastAt(p) ? p.blastFlash * Math.exp(-(t - blastAt(p)) / p.blastFade) : 0;
  // The glow builds up just before the blast, so the flash doesn't come from nowhere.
  const build = t < blastAt(p) && t > blastAt(p) - 0.4 ? 0.5 * ((t - (blastAt(p) - 0.4)) / 0.4) ** 2 : 0;
  return Math.min(1, impact + blast + build);
}

/**
 * The glowing cracks spreading from the impact over the fuse: the angle from
 * the impact point they have reached (radians, 0 → π), and how bright they are.
 */
export function crackSpread(t: number, p: BusterParams = busterParams): { angle: number; glow: number } {
  if (t < p.flightTime) return { angle: 0, glow: 0 };
  const s = Math.min(1, (t - p.flightTime) / p.fuse);
  return { angle: Math.PI * Math.pow(s, 1.4), glow: t < blastAt(p) ? Math.min(1, 0.3 + 3 * s) : 0 };
}

/** The fireball after the blast: size (globe radii) and brightness (0 once it's gone). */
export function fireball(t: number, p: BusterParams = busterParams): { size: number; glow: number } {
  const s = (t - blastAt(p)) / p.fireballTime;
  if (s < 0 || s >= 1) return { size: 0, glow: 0 };
  return { size: p.fireballSize * (0.45 + 0.55 * (1 - (1 - s) ** 3)), glow: (1 - s) ** 2 };
}

/** The shock ring after the blast: outer radius (globe radii) and brightness. */
export function shockRing(t: number, p: BusterParams = busterParams): { radius: number; glow: number } {
  const s = (t - blastAt(p)) / p.ringTime;
  if (s < 0 || s >= 1) return { radius: 0, glow: 0 };
  return { radius: 1 + (p.ringSize - 1) * (1 - (1 - s) ** 2), glow: (1 - s) ** 1.5 };
}
