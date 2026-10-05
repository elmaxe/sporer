import { blackbodyRgb } from './incandescence';
import type { StarRef } from './galaxy';
import type { NebulaData } from './nebulas';
import { hashSeed, Rng } from './rng';
import type { SpectralClass, StarData } from './stars';

/*
 * Black holes (issue #77): a few of the galaxy's systems are a stellar-mass
 * black hole instead of a star, with an accretion disc round it that lights
 * whatever still orbits there. Plain data and maths here; the view is
 * world/BlackHoleLook.ts, which traces each pixel's light past the hole with
 * the same photon equation as `bendRay` below.
 *
 * Lengths are in Schwarzschild radii (r_s = 2GM/c²) unless they say otherwise.
 * Sources and measurements: docs/research/black-holes.md.
 */

/**
 * The edge of the hole's shadow, r_s: light passing closer than this impact
 * parameter, b = 3√3/2 r_s (= 3√3 GM/c²), falls in. Seen from afar the shadow
 * is a black disc this big, 2.6 times the horizon.
 */
export const SHADOW_RADIUS = (3 * Math.sqrt(3)) / 2;
/** The photon sphere, r_s: light can circle the hole here (unstably). */
export const PHOTON_SPHERE = 1.5;
/** The innermost stable circular orbit, r_s (6GM/c²): a thin disc's inner edge. */
export const ISCO = 3;

/**
 * Black holes per star on the map: ~10⁸ stellar black holes in the Milky
 * Way, about a thousand times fewer than its stars (Elbert, Bullock &
 * Kaplinghat 2018), so ~4 in a 4000-star galaxy.
 */
export const BLACK_HOLES_PER_STAR = 1 / 1000;

/**
 * Masses, suns, drawn log-evenly: from just above the mass gap (no black hole
 * below ~5 M☉ is known) to Cygnus X-1's 21.2 M☉ (Miller-Jones et al. 2021).
 */
export const BLACK_HOLE_MASS = [5, 21] as const;

/**
 * r_s in system units per solar mass. Stylised: the real 2.95 km per M☉ would
 * be invisible next to the game's 30-unit Sun, so a hole is drawn as big as a
 * star (its shadow 7–30 units across, as a white dwarf to a G star), keeping
 * r_s ∝ M.
 */
export const SYSTEM_RS_PER_SUN = 0.55;

/**
 * How far its disc reaches, r_s, drawn evenly. Stylised: real discs run out
 * to 10⁵ r_s and more (Cygnus X-1's ~500 r_s is small), far beyond what the
 * system could hold, and past ~20 r_s their light is negligible (T ∝ r^-¾).
 */
export const DISC_OUTER = [10, 18] as const;

/**
 * How fast it is fed, as a share of the Eddington rate (ṁ), drawn log-evenly:
 * from a quiet hole to one at its limit.
 */
export const FEEDING = [0.1, 1] as const;

/**
 * The disc's peak temperature for a 10 M☉ hole fed at the Eddington rate, K.
 * Stylised: a real one peaks at ~10⁷ K (soft X-rays; Lasota 2015) and would
 * be a blue-white glare. Like Interstellar's Gargantua, the game's discs are
 * drawn ~1500 times cooler, orange to white, but keep the real trends: the
 * profile across the disc and T ∝ (ṁ / M)^¼ (see discPeakTemperature).
 */
export const DISC_TEMPERATURE = 6500;
/** The hole whose disc peaks at DISC_TEMPERATURE when fed at the Eddington rate, M☉. */
const REFERENCE_MASS = 10;

/**
 * Where a thin disc is hottest, r / r_in: σT⁴ ∝ x⁻³ (1 − x^-½) (Shakura &
 * Sunyaev; Lasota 2015 eq. 58) peaks at x = 49/36.
 */
export const DISC_PEAK = 49 / 36;
/** x⁻³ (1 − x^-½) at its peak: the profile's maximum. */
const PEAK_FLUX = DISC_PEAK ** -3 * (1 - DISC_PEAK ** -0.5);

/**
 * The Sun as the game draws it, for luminosity: a G star's radius (the middle
 * of gen/stars.ts's 27–32) and the Sun's 5772 K (IAU 2015 B3). A star's
 * luminosity is 1 at this size and temperature.
 */
const SUN_GAME_RADIUS = 29.5;
const SUN_TEMPERATURE = 5772;

/** A black hole's accretion disc: what generation draws (everything else follows, see blackHoleStar). */
export interface AccretionDisc {
  /** Outer edge, r_s (the inner one is the ISCO). */
  outer: number;
  /** Feeding rate as a share of the Eddington rate, ṁ: sets how hot and bright it is. */
  feeding: number;
  /** Which way it turns: +1 the way the planets go round (+X towards +Z), −1 against them. */
  turn: 1 | -1;
}

/** Whether a star is a black hole. */
export function isBlackHole(star: Pick<StarData, 'kind'>): boolean {
  return star.kind === 'blackHole';
}

/** A black hole's Schwarzschild radius in system units, from its `radius` (its shadow's). */
export function schwarzschildRadius(star: Pick<StarData, 'radius'>): number {
  return star.radius / SHADOW_RADIUS;
}

/**
 * The disc's peak temperature, K. Fed at a share ṁ of the Eddington rate
 * (Ṁ ∝ ṁM) with its inner edge at a fixed number of r_s (∝ M), σT⁴ ∝
 * MṀ/R³ ∝ ṁ/M: heavier holes have cooler discs.
 */
export function discPeakTemperature(mass: number, feeding: number): number {
  return DISC_TEMPERATURE * ((feeding * REFERENCE_MASS) / mass) ** 0.25;
}

/** A thin disc's temperature at `r` (r_s) as a share of its peak: x^-¾ (1 − x^-½)^¼, x = r / ISCO; 0 inside the ISCO. */
export function discTemperatureShare(r: number): number {
  const x = r / ISCO;
  if (x <= 1) return 0;
  return (x ** -3 * (1 - x ** -0.5) / PEAK_FLUX) ** 0.25;
}

/**
 * Both faces' light, ∫ 2σT⁴ · 2πr dr from the ISCO out, over 4πr_in²σT_peak⁴:
 * (4π/3) / PEAK_FLUX / 4π (the profile integrates to 4π r_in² σT*⁴ / 3).
 */
export const DISC_LIGHT = 1 / (3 * PEAK_FLUX);

/** The disc's luminosity relative to the Sun's, as a star of radius r_in and the peak temperature would have it times DISC_LIGHT. */
export function discLuminosity(rs: number, peak: number): number {
  return DISC_LIGHT * ((ISCO * rs) / SUN_GAME_RADIUS) ** 2 * (peak / SUN_TEMPERATURE) ** 4;
}

/**
 * Representative temperatures of the spectral classes (Stellar
 * classification, as gen/stars.ts's light colours use them): a disc lights
 * its system like the class whose temperature is nearest its peak's.
 */
const CLASS_TEMPERATURES: readonly (readonly [SpectralClass, number])[] = [
  ['O', 50000],
  ['B', 20000],
  ['A', 8750],
  ['F', 6650],
  ['G', 5600],
  ['K', 4450],
  ['M', 3050],
];

export function nearestClass(temperature: number): SpectralClass {
  let best: SpectralClass = 'G';
  let gap = Infinity;
  for (const [cls, t] of CLASS_TEMPERATURES) {
    const d = Math.abs(Math.log(temperature / t));
    if (d < gap) {
      gap = d;
      best = cls;
    }
  }
  return best;
}

/** A black body's colour at `T` (K) as sRGB hex, its brightest channel at full. */
export function blackbodyHex(T: number): string {
  const rgb = blackbodyRgb(T, T).map((c) => Math.max(0, c));
  const top = Math.max(...rgb);
  const [r, g, b] = rgb.map((c) => toSrgb(c / top));
  return `#${[r!, g!, b!].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
}

function toSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/**
 * The black hole of `mass` suns with `disc` as a star: its radius is its
 * shadow's (what you see of it), its luminosity, class (for its light's
 * colour) and colour its disc's.
 */
export function blackHoleStar(mass: number, disc: AccretionDisc): StarData {
  const rs = SYSTEM_RS_PER_SUN * mass;
  const peak = discPeakTemperature(mass, disc.feeding);
  return {
    kind: 'blackHole',
    spectralClass: nearestClass(peak),
    color: blackbodyHex(peak),
    radius: SHADOW_RADIUS * rs,
    luminosity: discLuminosity(rs, peak),
    mass,
    disc: { ...disc },
  };
}

/** A random black hole. */
export function generateBlackHole(rng: Rng): StarData {
  const mass = logRange(rng, BLACK_HOLE_MASS);
  const outer = rng.range(DISC_OUTER[0], DISC_OUTER[1]);
  const feeding = logRange(rng, FEEDING);
  const turn = rng.sign() as 1 | -1;
  return blackHoleStar(mass, { outer, feeding, turn });
}

/** A typical black hole (tools): 10 M☉, a middling disc, fed at a third of the Eddington rate. */
export function nominalBlackHole(): StarData {
  return blackHoleStar(REFERENCE_MASS, { outer: (DISC_OUTER[0] + DISC_OUTER[1]) / 2, feeding: 0.3, turn: 1 });
}

/** The black hole's disc (a nominal one for a black hole made without, e.g. by hand). */
export function discOf(star: StarData): AccretionDisc {
  return star.disc ?? { outer: (DISC_OUTER[0] + DISC_OUTER[1]) / 2, feeding: 0.3, turn: 1 };
}

/**
 * How far from the hole the view bends light enough to matter, r_s: past
 * the disc, where the deflection (≈ 2 r_s / b) has dropped to ~5°. The view
 * eases the bending out towards this edge.
 */
export function lensReach(disc: AccretionDisc): number {
  return Math.max(disc.outer * 1.25, 16);
}

/** How far round a star its own space reaches, system units: its radius, or a black hole's lensing reach. */
export function starReach(star: StarData): number {
  if (!isBlackHole(star)) return star.radius;
  return lensReach(discOf(star)) * schwarzschildRadius(star);
}

/**
 * The disc's orbital speed at `r` (r_s) as a share of light's, as a static
 * observer there measures it: v/c = 1 / √(2(r − 1)), half of c at the ISCO.
 */
export function orbitalSpeed(r: number): number {
  return 1 / Math.sqrt(2 * (r - 1));
}

/** How much gravity alone reddens light leaving `r` (r_s) for far away: √(1 − 1/r). */
export function gravitationalShift(r: number): number {
  return Math.sqrt(1 - 1 / r);
}

/**
 * One step of a light ray past the hole (the hole at the origin, lengths in
 * r_s): in Schwarzschild coordinates its path obeys a = −(3/2) h² p / |p|⁵,
 * h = |p × v|, with |v| = 1 at the start (Binet's equation u'' + u = 3u²/2
 * written in Cartesian form). Velocity Verlet with a step ∝ r. Returns false
 * once the ray has crossed the horizon. The view's shader is the same loop.
 */
export function bendRay(p: Vec3, v: Vec3, h2: number, stepScale: number): boolean {
  const r = Math.hypot(p.x, p.y, p.z);
  if (r < 1) return false;
  const dt = stepScale * r;
  const k0 = (-1.5 * h2) / r ** 5;
  const nx = p.x + v.x * dt + 0.5 * k0 * p.x * dt * dt;
  const ny = p.y + v.y * dt + 0.5 * k0 * p.y * dt * dt;
  const nz = p.z + v.z * dt + 0.5 * k0 * p.z * dt * dt;
  const r1 = Math.hypot(nx, ny, nz);
  const k1 = (-1.5 * h2) / r1 ** 5;
  v.x += 0.5 * (k0 * p.x + k1 * nx) * dt;
  v.y += 0.5 * (k0 * p.y + k1 * ny) * dt;
  v.z += 0.5 * (k0 * p.z + k1 * nz) * dt;
  p.x = nx;
  p.y = ny;
  p.z = nz;
  return r1 >= 1;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The step the view takes, as a share of the distance from the hole: shadow edge within 0.3%. */
export const RAY_STEP = 0.08;

/**
 * A ray from far away passing the hole at impact parameter `b` (r_s): how far
 * it is bent (radians), or null if it falls in.
 */
export function deflection(b: number, stepScale = RAY_STEP): number | null {
  const start = Math.max(1000, b * 50);
  const p = { x: -start, y: b, z: 0 };
  const v = { x: 1, y: 0, z: 0 };
  for (let i = 0; i < 100000; i++) {
    if (!bendRay(p, v, b * b, stepScale)) return null;
    // Far out again and moving away.
    if (Math.hypot(p.x, p.y, p.z) > start && p.x * v.x + p.y * v.y + p.z * v.z > 0) break;
  }
  return Math.atan2(-v.y, v.x);
}

// --- In the galaxy ---

/**
 * Whether a system may become a black hole: not Sol, a young star or a lone
 * G or K main-sequence star (so it is never the home system), nor the star a
 * nebula other than a supernova remnant is made round (they need their
 * star: a white dwarf's planetary nebula, a hot star's H II region).
 */
export function canBeBlackHole(ref: StarRef, hosts: ReadonlyMap<number, NebulaData['kind']>): boolean {
  if (ref.real || ref.young || ref.stars.length === 0) return false;
  const [star, companion] = ref.stars;
  if (!companion && star!.kind === 'mainSequence' && (star!.spectralClass === 'G' || star!.spectralClass === 'K')) return false;
  const host = hosts.get(ref.id);
  return host === undefined || host === 'remnant';
}

/**
 * Turns some of the galaxy's systems into black holes, from their own stream
 * so nothing else changes: one in a supernova remnant if there is one (the
 * collapsed core of the star that blew it out, as SS 433 sits in W50), the
 * rest anywhere among the stars (black holes are spread through the disc and
 * bulge like the stars they came from). Each keeps its place, id, name and
 * seed; its stars become one black hole.
 */
export function chooseBlackHoles(seed: number, stars: readonly StarRef[], nebulas: readonly NebulaData[]): void {
  const rng = new Rng(hashSeed(seed, 'blackHoles'));
  const total = Math.round(stars.length * BLACK_HOLES_PER_STAR);
  const hosts = new Map(nebulas.map((n) => [n.star, n.kind] as const));
  const candidates = stars.filter((s) => canBeBlackHole(s, hosts));
  const chosen = new Set<StarRef>();
  const remnants = candidates.filter((s) => hosts.get(s.id) === 'remnant');
  if (total > 0 && remnants.length > 0) chosen.add(rng.fork('remnant').pick(remnants));
  const field = rng.fork('field');
  for (let tries = 0; chosen.size < total && tries < total * 20 && candidates.length > 0; tries++) {
    chosen.add(field.pick(candidates));
  }
  for (const ref of chosen) ref.stars = [generateBlackHole(rng.fork('hole', ref.id))];
}

function logRange(rng: Rng, [lo, hi]: readonly [number, number]): number {
  return lo * (hi / lo) ** rng.next();
}
