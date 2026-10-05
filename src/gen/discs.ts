import type { NebulaData } from './nebulas';
import type { StarRef } from './galaxy';
import { hexToRgb, hslToHex, rgbToHex } from './color';
import { hashSeed, Rng } from './rng';
import type { StarData } from './stars';

/*
 * Dust in systems (roadmap step 29). A few young stars, still inside the
 * clouds they formed in, are wrapped in a protoplanetary disc: optically
 * thick dust out to ~100 AU, with dark gaps where planets are forming and
 * bright rings at the gaps' edges (ALMA's HL Tau and DSHARP discs). Many
 * mature systems keep a faint debris disc instead: the dust that colliding
 * asteroids and comets grind off, like our own zodiacal cloud. Both are
 * plain data here; `world/DustDisc.ts` draws them, lit by the star.
 * Sources and numbers: docs/research/dust.md.
 */

export type DustKind = 'protoplanetary' | 'debris';

/** A dark gap a forming planet has cleared. */
export interface DustGap {
  /** Radius of its centre (system units). */
  at: number;
  /** Half-width (system units). */
  width: number;
  /** How much of the dust is gone at its centre, 0–1. */
  depth: number;
}

/** A bright ring of dust (a pressure bump outside a gap, or a debris belt). */
export interface DustRing {
  at: number;
  /** Half-width (system units). */
  width: number;
  /** Extra dust at its centre, as a multiple of the disc's own there. */
  boost: number;
}

export interface DustDiscData {
  kind: DustKind;
  /** Inner edge (the dust's sublimation radius, or just outside the star's glow) and the outer one, system units. */
  inner: number;
  outer: number;
  /** Surface density ∝ r^−slope inside `taper`, falling off exponentially outside it. */
  slope: number;
  taper: number;
  /** The dust layer's scale height over radius at `outer`, and how it flares (H ∝ r^flare). */
  aspect: number;
  flare: number;
  /** Optical depth through the disc at the inner edge, face on (protoplanetary: ≫ 1; debris: ≪ 1, drawn far brighter). */
  depth: number;
  gaps: DustGap[];
  rings: DustRing[];
  /** Two-armed spiral's strength (0 for most) and how tightly it winds (radians per e-fold of radius). */
  spiral: number;
  pitch: number;
  /** Scattering colour of the dust (lit by the star's light). */
  color: string;
  seed: number;
}

// --- Young stars ---

/**
 * Young stars per star on the map: "a realistic handful", 8 in a 4000-star
 * galaxy. Discs fade with an e-folding time of ~2.5 Myr (Mamajek 2009), so
 * against the galaxy's star formation and its billions of stars only 3–7 in
 * 10⁵ have one today, 0.1–0.3 per 4000 (docs/research/dust.md): a
 * deliberate ×30 or so, so there are a few to find.
 */
export const YOUNG_PER_STAR = 8 / 4000;
/** Most of them are still inside the clouds they formed in: this share comes from stars in nebulas. */
export const YOUNG_IN_NEBULAS = 0.75;
/** Nebulas young stars are found in: H II regions, reflection nebulas and dark clouds (Taurus's T Tauri stars). */
const BIRTH_NEBULAS: readonly NebulaData['kind'][] = ['emission', 'reflection', 'dark'];

/**
 * Whether a star could be young with a disc: T Tauri stars (K and M, the
 * game's red dwarfs), Herbig Ae/Be stars (A and B) and the classes between.
 * O stars' discs evaporate within ~1 Myr, and giants and white dwarfs are
 * old, so a system with either is never young.
 */
export function canBeYoung(ref: Pick<StarRef, 'stars' | 'real'>): boolean {
  if (ref.real || ref.stars.length === 0) return false;
  return ref.stars.every(
    (s) => s.kind === 'redDwarf' || (s.kind === 'mainSequence' && s.spectralClass !== 'O'),
  );
}

/**
 * Marks the galaxy's young stars (`StarRef.young`), from their own stream so
 * nothing else changes: three in four from the stars inside birth nebulas,
 * the rest from the field.
 */
export function chooseYoungStars(seed: number, stars: readonly StarRef[]): void {
  const rng = new Rng(hashSeed(seed, 'young'));
  const total = Math.round(stars.length * YOUNG_PER_STAR);
  const inNebulas = stars.filter((s) => canBeYoung(s) && s.nebula && BIRTH_NEBULAS.includes(s.nebula.kind));
  const field = stars.filter((s) => canBeYoung(s) && !s.nebula);
  const fromNebulas = Math.min(inNebulas.length, Math.round(total * YOUNG_IN_NEBULAS));
  for (const s of sample(rng.fork('nebulas'), inNebulas, fromNebulas)) s.young = true;
  for (const s of sample(rng.fork('field'), field, total - fromNebulas)) s.young = true;
}

/**
 * Disc e-folding time, Myr, by the system's heaviest star (relative to the
 * Sun): ~2.5 Myr for Sun-like and smaller stars, ~1.2 Myr above 1.3 M☉
 * (Ribas et al. 2015; dust.md). A star is caught with its disc in
 * proportion to how long it keeps it.
 */
export function discLifetime(ref: Pick<StarRef, 'stars'>): number {
  return Math.max(...ref.stars.map((s) => s.mass)) > 1.3 ? 1.2 : 2.5;
}

/** `count` distinct stars, drawn without replacement, each in proportion to its disc's lifetime. */
function sample(rng: Rng, items: readonly StarRef[], count: number): StarRef[] {
  const pool = items.slice();
  const picked: StarRef[] = [];
  while (picked.length < count && pool.length > 0) {
    const i = rng.weighted(pool.map((s, k) => [k, discLifetime(s)] as const));
    picked.push(pool.splice(i, 1)[0]!);
  }
  return picked;
}

// --- Protoplanetary discs ---

/**
 * Real disc sizes and gap positions (AU) are mapped to system units the way
 * Sol's are (gen/sol.ts: log-linear with Earth at the habitable radius), in
 * units of the star's habitable radius.
 */
export interface DiscContext {
  /** Radius around the barycentre occupied by the star(s). */
  starZone: number;
  habitableRadius: number;
  /** AU → system units for this system (`solOrbit(au)` scaled to its habitable radius). */
  toSystem: (au: number) => number;
  stars: readonly StarData[];
}

/**
 * Dust's outer radius, AU, drawn log-evenly: DSHARP's big bright discs reach
 * 27–264 AU (median 82), HL Tau's ~137 AU (dust.md).
 */
export const DISC_OUTER_AU = [30, 150] as const;
/** Planets forming in a disc, each in its own gap: DSHARP's discs have 1–7 gaps, median 2 (Huang et al. 2018). */
export const FORMING_PLANETS = [1, 3] as const;
/**
 * Gap centres between these AU. DSHARP's gaps lie at 9–145 AU, where ALMA
 * can resolve them; the game also puts rocky planets forming further in
 * (stylised: unresolved in real discs), each gap's outer edge inside 85% of
 * the disc.
 */
export const GAP_AU = [1, 145] as const;

/** A planet forming in a young disc: where, and whether it is a molten rocky body or a young giant. */
export interface FormingPlanet {
  at: number;
  giant: boolean;
  /** The planet's mass over the star's (sets its gap's width). */
  massRatio: number;
}

/**
 * The gap a planet of mass ratio q carves (Kanagawa et al. 2016):
 * Δ/r = 0.41 q^½ (h/r)^−¾ α^−¼ full width, with the gas disc's aspect ratio
 * h/r and viscosity α. Returns the half-width over r.
 */
export function gapHalfWidth(q: number, aspect: number, alpha: number): number {
  return (0.41 * Math.sqrt(q) * aspect ** -0.75 * alpha ** -0.25) / 2;
}

/**
 * The gas disc's aspect ratio h/r at `au`: 0.035 at 1 AU, flaring as r^(2/7)
 * (Chiang & Goldreich 1997; 0.09 at 30 AU, PDS 70's model disc has 0.089 at
 * 22 AU; dust.md).
 */
export function gasAspect(au: number): number {
  return 0.035 * au ** (2 / 7);
}
/** Turbulent viscosity for gap widths: Kanagawa's HL Tau fits and PDS 70's model use 10⁻³. */
export const DISC_ALPHA = 1e-3;
/**
 * Mass ratios of forming planets: rocky ones of a few Earths, young giants
 * of a Neptune or two to a Jupiter (Kanagawa's HL Tau gaps: 0.2–1.4 MJ), so
 * the gaps' widths over radius come out ~0.1–0.4, DSHARP's quartiles being
 * 0.08, 0.14 and 0.22 (dust.md).
 */
export const ROCKY_Q = [1e-5, 3e-5] as const;
export const GIANT_Q = [1e-4, 1e-3] as const;
/** The snow line round the Sun, AU (∝ √L): giants form beyond it. */
export const SNOW_LINE_AU = 2.7;

/**
 * A young star's disc and the planets forming in its gaps, outermost gap
 * first in no particular order (sorted by radius). Planets beyond the snow
 * line (~2.7 AU round the Sun, ∝ √L) are young giants, the rest molten
 * rocky bodies.
 */
export function generateProtoplanetaryDisc(rng: Rng, ctx: DiscContext): { disc: DustDiscData; planets: FormingPlanet[] } {
  const luminosity = ctx.stars.reduce((l, s) => l + s.luminosity, 0);
  const outerAu = Math.exp(rng.range(Math.log(DISC_OUTER_AU[0]), Math.log(DISC_OUTER_AU[1])));
  const outer = ctx.toSystem(outerAu);
  // The dust sublimates inside 0.069 AU √L (1500 K; dust.md): in game units that's inside the star, so the disc starts outside its glow.
  const inner = Math.max(ctx.starZone * 1.6, ctx.toSystem(0.069 * Math.sqrt(luminosity)));
  const snowLine = SNOW_LINE_AU * Math.sqrt(luminosity);
  const count = rng.int(FORMING_PLANETS[0], FORMING_PLANETS[1]);
  // Gap radii spread over log radius, one per slice, so they don't crowd.
  const lo = Math.log(GAP_AU[0]);
  const hi = Math.log(Math.min(GAP_AU[1], outerAu * 0.7));
  const planets: FormingPlanet[] = [];
  const gaps: DustGap[] = [];
  const rings: DustRing[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + rng.range(0.25, 0.75)) / count;
    const au = Math.exp(lo + (hi - lo) * t);
    const giant = au > snowLine;
    const [q0, q1] = giant ? GIANT_Q : ROCKY_Q;
    const q = Math.exp(rng.range(Math.log(q0), Math.log(q1)));
    const at = ctx.toSystem(au);
    // The real gap's width as a share of its radius (the log mapping compresses distances, so it's kept as a share of r).
    const half = gapHalfWidth(q, gasAspect(au), DISC_ALPHA) * at;
    planets.push({ at, giant, massRatio: q });
    gaps.push({ at, width: half, depth: giant ? rng.range(0.85, 0.98) : rng.range(0.55, 0.8) });
    // Dust piles up in the pressure bump just outside the gap: a bright ring (HL Tau's are 5–8 AU wide).
    rings.push({ at: at + half * rng.range(1.6, 2.2), width: half * rng.range(0.4, 0.7), boost: rng.range(0.6, 1.4) });
  }
  // T Tauri discs scatter grey (the star's own light), Herbig Ae/Be discs redder (Ma et al. 2024; dust.md).
  const herbig = ctx.stars.some((s) => s.mass > 1.5);
  return {
    disc: {
      kind: 'protoplanetary',
      inner,
      outer,
      slope: rng.range(0.8, 1.1),
      taper: outer * rng.range(0.55, 0.75),
      // The dust layer at the outer edge: the gas's h/r there.
      aspect: gasAspect(outerAu),
      flare: 1 + 2 / 7,
      depth: rng.range(20, 60),
      gaps,
      rings,
      spiral: rng.chance(0.25) ? rng.range(0.25, 0.5) : 0,
      pitch: rng.range(2.5, 4),
      color: herbig ? hslToHex(rng.range(15, 30), rng.range(0.3, 0.45), 0.72) : hslToHex(rng.range(25, 40), rng.range(0.05, 0.15), 0.76),
      seed: rng.int(0, 1_000_000),
    },
    planets,
  };
}

// --- Debris discs ---

/**
 * Share of mature systems with a debris disc bright enough to see, by
 * spectral class: Herschel's DEBRIS survey (A 24%, F 24%, G 14%, K 13%,
 * M 2%; DUNES 22% for FGK; dust.md). B and O are given A's share
 * (unmeasured here). Giants and white dwarfs: none drawn.
 */
export const DEBRIS_SHARE: Record<StarData['spectralClass'], number> = {
  O: 0.24,
  B: 0.24,
  A: 0.24,
  F: 0.24,
  G: 0.14,
  K: 0.13,
  M: 0.02,
};

/** The chance of a debris disc round a system's main star (none round giants, white dwarfs or black holes, which have their accretion disc). */
export function debrisChance(star: StarData | undefined): number {
  if (!star || star.kind === 'whiteDwarf' || star.kind === 'redGiant' || star.kind === 'blueGiant' || star.kind === 'blackHole') return 0;
  return DEBRIS_SHARE[star.spectralClass];
}

/**
 * The warm dust's outer taper, AU: the zodiacal cloud thins out past the
 * asteroid belt (Kelsall et al. 1998's model reaches ~3–5 AU; dust.md).
 */
export const WARM_TAPER_AU = [3, 5] as const;
/**
 * A cold belt like the Kuiper belt's dust: Herschel's belts sit at ~40 AU
 * (blackbody radii 7–40 AU, corrected; Sibthorpe et al. 2018), here 20–100
 * AU, with a full width over radius from Fomalhaut's 0.10 to the median
 * resolved belt's 0.71 (Matrà et al. 2025).
 */
export const COLD_BELT_AU = [20, 100] as const;
export const COLD_BELT_WIDTH = [0.1, 0.7] as const;
/** Share of debris discs drawn with a cold belt (most of Herschel's detections are cold belts). */
export const COLD_BELT_SHARE = 0.75;
/**
 * The dust's thickness: the zodiacal cloud's density halves at 13.7° off
 * its plane (Kelsall's fan), a Gaussian of σ ≈ 0.21 r; resolved debris
 * belts are thinner (Fomalhaut's ring, h/r ~0.02, is the extreme). Drawn
 * 0.08–0.21.
 */
export const DEBRIS_ASPECT = [0.08, 0.21] as const;

/**
 * A faint debris disc along the planets' plane, or null: a zodiacal cloud
 * of warm dust falling off as r^−1.34 (COBE's fit to ours, Kelsall et al.
 * 1998) from near the star out past its asteroid belt, and in most a cold
 * belt further out, like the Kuiper belt's dust or Fomalhaut's ring. Its
 * own stream (`rng.fork('dust')`). `extent` is how far the planets reach.
 */
export function generateDebrisDisc(rng: Rng, ctx: DiscContext, extent: number, force?: boolean): DustDiscData | null {
  // Drawn even when forced, so the disc's own draws stay as they were.
  const drawn = rng.chance(debrisChance(ctx.stars[0]));
  if (!(force ?? drawn)) return null;
  const inner = ctx.starZone * 1.5;
  const taper = Math.max(inner * 2, ctx.toSystem(rng.range(...WARM_TAPER_AU)));
  const disc: DustDiscData = {
    kind: 'debris',
    inner,
    outer: Math.max(taper * 1.6, Math.min(extent, taper * 3)),
    slope: 1.34,
    taper,
    aspect: rng.range(...DEBRIS_ASPECT),
    flare: 1,
    depth: rng.range(0.6, 1),
    gaps: [],
    rings: [],
    spiral: 0,
    pitch: 0,
    color: mixHex('#e8dcc8', hslToHex(rng.range(25, 40), 0.3, 0.75), rng.range(0, 0.5)),
    seed: rng.int(0, 1_000_000),
  };
  if (rng.chance(COLD_BELT_SHARE)) {
    const at = ctx.toSystem(Math.exp(rng.range(Math.log(COLD_BELT_AU[0]), Math.log(COLD_BELT_AU[1]))));
    // FWHM → the Gaussian's 1/e half-width.
    const width = (at * rng.range(...COLD_BELT_WIDTH)) / (2 * Math.sqrt(Math.LN2));
    disc.outer = Math.max(disc.outer, at + 2.5 * width);
    // As dense at its peak as the warm dust a few times further in than the belt is wide.
    const peak = rng.range(0.15, 0.4) * dustDensity({ ...disc, rings: [] }, inner * 3);
    disc.rings.push({ at, width, boost: peak / Math.max(dustDensity({ ...disc, rings: [] }, at), 1e-9) });
  }
  return disc;
}

/** The disc's surface density at radius r, relative (1 ≈ the inner edge's): the smooth disc times its structure. Pure; the view draws it. */
export function dustDensity(disc: DustDiscData, r: number): number {
  return smoothDustDensity(disc, r) * dustStructure(disc, r);
}

/** The smooth disc: a power law, tapered outside `taper`, soft at both edges (0 outside the disc). */
export function smoothDustDensity(disc: DustDiscData, r: number): number {
  if (r < disc.inner || r > disc.outer) return 0;
  const s = (r / disc.inner) ** -disc.slope * Math.exp((-Math.max(0, r - disc.taper) / (disc.outer - disc.taper + 1e-6)) * 3);
  return s * smoothstep(disc.inner, disc.inner * 1.15, r) * (1 - smoothstep(disc.outer * 0.97, disc.outer, r));
}

/** Its structure across the radius, as a factor on the smooth disc: gaps (< 1) and rings (> 1). */
export function dustStructure(disc: Pick<DustDiscData, 'gaps' | 'rings'>, r: number): number {
  let s = 1;
  for (const g of disc.gaps) s *= 1 - g.depth * Math.exp(-(((r - g.at) / g.width) ** 2));
  let boost = 1;
  for (const ring of disc.rings) boost += ring.boost * Math.exp(-(((r - ring.at) / ring.width) ** 2));
  return s * boost;
}

function mixHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** The HUD's word for a system's dust, e.g. "protoplanetary disc". */
export function describeDust(disc: Pick<DustDiscData, 'kind'>): string {
  return disc.kind === 'protoplanetary' ? 'protoplanetary disc' : 'debris disc';
}
