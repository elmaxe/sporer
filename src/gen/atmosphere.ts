import { cloudCovered, earthRadii, type ClimateData, type Composition } from './climate';

/*
 * How an atmosphere looks: how tall it is and how hazy, from the climate
 * (gen/climate.ts), plus the optical-depth integral the atmosphere shader
 * (world/planetGeometry.ts) evaluates per pixel. Pure maths, mirrored in GLSL.
 *
 * Real scale heights are tiny next to a planet (Earth's 8.5 km is 0.13% of
 * its radius), so the look is deliberately taller: the real scale height
 * sets the trend (puffier on small, light, warm bodies), and a stylised map
 * turns it into 3–8% of the radius. See docs/research/atmospheres.md.
 */

/** Molar gas constant, J mol⁻¹ K⁻¹ (CODATA 2018, exact). */
export const GAS_CONSTANT = 8.314462618;
/** Earth's mean surface gravity, m/s² (NASA Earth fact sheet); climate gravity is in these units. */
export const EARTH_GRAVITY = 9.82;
/** Earth's volumetric mean radius, km (NASA). */
export const EARTH_RADIUS_KM = 6371;
/** Mean molar mass per composition, kg/mol: Earth's air 28.97 (NASA), N₂ 28.0134 and CO₂ 44.0095 (NIST Webbook). */
export const MOLAR_MASS: Record<Exclude<Composition, 'none'>, number> = {
  oxygenNitrogen: 0.02897,
  nitrogen: 0.0280134,
  carbonDioxide: 0.0440095,
};

/** Isothermal scale height H = RT / (μg) in km (Earth 8.4, Venus 15.9, Mars 11.0). */
export function scaleHeight(c: Pick<ClimateData, 'temperature' | 'gravity' | 'composition'>): number {
  if (c.composition === 'none') return 0;
  return (GAS_CONSTANT * c.temperature) / (MOLAR_MASS[c.composition] * c.gravity * EARTH_GRAVITY) / 1000;
}

/** Earth's scale height relative to its radius, the reference of the stylised map. */
export const EARTH_RELATIVE_SCALE_HEIGHT =
  scaleHeight({ temperature: 288, gravity: 1, composition: 'oxygenNitrogen' }) / EARTH_RADIUS_KM;

/** Tunables of the stylised look (see docs/research/atmospheres.md). */
export const atmosphereParams = {
  /** Visual scale height of an Earth-like atmosphere, in planet radii. */
  earthScaleHeight: 0.05,
  /** How strongly the real relative scale height stretches the visual one (0 = all alike). */
  scaleHeightExponent: 0.35,
  minScaleHeight: 0.03,
  maxScaleHeight: 0.08,
  /** The shell's top, in scale heights above the ground; the density is brought to zero there. */
  heights: 6,
  /** Vertical optical depth of 1 bar; thinner and thicker air scale with depthExponent. */
  earthDepth: 0.2,
  depthExponent: 0.5,
  /** Clear air never gets hazier than this straight down; cloud decks and hazes get cloudDepth. */
  maxClearDepth: 0.8,
  cloudDepth: 1.5,
};

/** An atmosphere's look, in units of the planet's (sea-level) radius. */
export interface AtmosphereLook {
  /** Scale height of the density falloff. */
  scaleHeight: number;
  /** Radius of the shell's top (where the density reaches zero), e.g. 1.3. */
  top: number;
  /** Optical depth straight down from the top to the ground. */
  depth: number;
}

/**
 * A gas giant's haze: there is no ground to stand on, so its cloud tops sit
 * under a deep, soft blanket of gas that thickens towards the limb and lets
 * the bands show through dimmed. Stylised like the rest of the looks above
 * (no real scale height: a giant's is ~25 km on a 60 000 km radius), tuned by eye.
 */
export const gasHazeLook: AtmosphereLook = { scaleHeight: 0.025, top: 1.15, depth: 0.15 };

/** The look of a body's atmosphere, or null when it has none. `gameRadius` is the body's radius in system units. */
export function atmosphereLook(
  c: Pick<ClimateData, 'temperature' | 'gravity' | 'composition' | 'pressure'>,
  gameRadius: number,
): AtmosphereLook | null {
  if (c.composition === 'none' || c.pressure <= 0) return null;
  const p = atmosphereParams;
  const relative = scaleHeight(c) / (earthRadii(gameRadius) * EARTH_RADIUS_KM);
  const H = clamp(
    p.earthScaleHeight * (relative / EARTH_RELATIVE_SCALE_HEIGHT) ** p.scaleHeightExponent,
    p.minScaleHeight,
    p.maxScaleHeight,
  );
  const depth = cloudCovered(c) ? p.cloudDepth : Math.min(p.earthDepth * c.pressure ** p.depthExponent, p.maxClearDepth);
  return { scaleHeight: H, top: 1 + p.heights * H, depth };
}

/**
 * Relative density at radius r (planet radii): exp(−h/H), shifted and
 * rescaled so it is 1 at the ground and exactly 0 at the top, so the shell
 * has no visible edge.
 */
export function relativeDensity(look: AtmosphereLook, r: number): number {
  const edge = Math.exp(-(look.top - 1) / look.scaleHeight);
  return Math.max(0, (Math.exp(-(r - 1) / look.scaleHeight) - edge) / (1 - edge));
}

/**
 * Extinction per planet radius at the ground, chosen so the vertical column
 * from the ground to the top comes out at look.depth.
 */
export function groundDensity(look: AtmosphereLook): number {
  const D = look.top - 1;
  const H = look.scaleHeight;
  const edge = Math.exp(-D / H);
  const column = (H * (1 - edge) - D * edge) / (1 - edge);
  return look.depth / column;
}

type Vec3 = readonly [number, number, number];

/** Samples per half of the ray (the shader uses the same): within ~2% of the exact integral, 6 gets 1.5%, 4 3.5%. */
export const PATH_SAMPLES = 5;

/**
 * Optical depth along a ray from `origin` (planet radii, planet at the origin)
 * in unit direction `dir`, through the shell to the ground or out of the far
 * side. 0 when the ray misses the shell. The shader's scheme: the segment is
 * split where the ray comes closest to the planet (the densest point, or the
 * ground where the ray hits it), and each half is sampled with t ∝ u² so the
 * samples crowd where the density peaks.
 */
export function pathOpticalDepth(look: AtmosphereLook, origin: Vec3, dir: Vec3, samples = PATH_SAMPLES): number {
  const seg = raySegment(look, origin, dir);
  if (!seg) return 0;
  const [t0, t1, tc] = seg;
  const k = groundDensity(look);
  let tau = 0;
  for (let i = 0; i < samples; i++) {
    const u = (i + 0.5) / samples;
    // Back towards the start, then on towards the end.
    for (const length of [t0 - tc, t1 - tc]) {
      const t = tc + length * u * u;
      const r = Math.hypot(origin[0] + t * dir[0], origin[1] + t * dir[1], origin[2] + t * dir[2]);
      tau += relativeDensity(look, r) * ((2 * Math.abs(length) * u) / samples);
    }
  }
  return tau * k;
}

/**
 * The part of a ray inside the atmosphere: [start, end, closest], with the
 * start clamped to the origin (a camera inside the shell) and the end at the
 * ground when it's hit; `closest` is the point nearest the planet, clamped
 * into the segment. Null when the ray misses the shell or it's behind.
 */
export function raySegment(look: AtmosphereLook, origin: Vec3, dir: Vec3): [number, number, number] | null {
  const b = origin[0] * dir[0] + origin[1] * dir[1] + origin[2] * dir[2];
  const oo = origin[0] ** 2 + origin[1] ** 2 + origin[2] ** 2;
  const shell = b * b - (oo - look.top * look.top);
  if (shell <= 0) return null;
  const t0 = Math.max(-b - Math.sqrt(shell), 0);
  let t1 = -b + Math.sqrt(shell);
  if (t1 <= 0) return null;
  const ground = b * b - (oo - 1);
  if (ground > 0) {
    const tg = -b - Math.sqrt(ground);
    if (tg > 0) t1 = Math.min(t1, tg);
  }
  return [t0, t1, clamp(-b, t0, t1)];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
