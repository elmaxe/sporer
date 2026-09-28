import type { KeplerOrbit } from './orbit';
import type { Rng } from './rng';

export interface CometData {
  name: string;
  /** Nucleus radius in system units. */
  radius: number;
  orbit: KeplerOrbit;
  /** Ion tail (straight, anti-sunward) and dust tail (curved, lagging) colours. */
  ionColor: string;
  dustColor: string;
}

/** What comet generation needs to know about the rest of the system. */
export interface CometContext {
  systemName: string;
  /** Radius around the barycentre occupied by the star(s). */
  starZone: number;
  /** Largest star radius: perihelia stay outside its glow. */
  starRadius: number;
  /** Outer edge of the outermost planet's neighbourhood (0 with no planets). */
  outerEdge: number;
  /** Orbital period (seconds) for a semi-major axis, from the system's Kepler law. */
  period: (semiMajor: number) => number;
}

/** Perihelia start at least this many star radii from the barycentre (outside the glow). */
export const COMET_MIN_PERIHELION_RADII = 3.5;

/**
 * A few comets on long, inclined elliptical orbits: perihelion just outside
 * the star's glow, aphelion beyond the outermost planet. Uses its own Rng
 * stream (`rng.fork('comets')`), so adding comets changed nothing else.
 */
export function generateComets(rng: Rng, ctx: CometContext): CometData[] {
  const count = rng.weighted<number>([
    [1, 3],
    [2, 4],
    [3, 3],
    [4, 1],
  ]);
  const minPerihelion = Math.max(ctx.starZone + ctx.starRadius * 2, ctx.starRadius * COMET_MIN_PERIHELION_RADII);
  const outer = Math.max(ctx.outerEdge, minPerihelion * 4);

  const comets: CometData[] = [];
  for (let i = 0; i < count; i++) {
    const q = minPerihelion * rng.range(1, 1.8);
    const Q = outer * rng.range(1.1, 1.6);
    const semiMajor = (q + Q) / 2;
    comets.push({
      name: `Comet ${ctx.systemName} ${String.fromCharCode(65 + i)}`,
      radius: rng.range(0.8, 1.8),
      orbit: {
        semiMajor,
        eccentricity: (Q - q) / (Q + q),
        period: ctx.period(semiMajor),
        // The first comet is always on its way in, so most systems show one
        // with a growing tail; the rest are anywhere on their orbits.
        phase: i === 0 ? -rng.range(0.15, 0.6) : rng.range(0, Math.PI * 2),
        // Mostly near the ecliptic, sometimes steep; some retrograde.
        inclination: rng.chance(0.15) ? rng.range(Math.PI * 0.6, Math.PI) : Math.abs(rng.gaussian(0, 0.45)),
        argPerihelion: rng.range(0, Math.PI * 2),
        node: rng.range(0, Math.PI * 2),
      },
      ionColor: rng.pick(['#7cc4ff', '#8fb0ff', '#79e0ff']),
      dustColor: rng.pick(['#ffe6b8', '#fff1d6', '#ffd9a8']),
    });
  }
  return comets;
}
