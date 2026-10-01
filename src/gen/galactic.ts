import { GALAXY_RADIUS } from './galaxy';
import type { Vec3Like } from './orbit';
import { conjugate, rotate, type Quat } from './quat';
import type { Rng } from './rng';

export { conjugate, randomRotation, rotate, type Quat } from './quat';

/*
 * How the galaxy looks from inside one system: which way its plane and its
 * centre lie in system space, and how bright the band of the galaxy is in
 * each direction. Pure data and maths (no THREE), unit-tested in
 * tests/galactic.test.ts.
 *
 * Galactic coordinates: latitude is the angle above the galactic plane,
 * longitude runs around it from the direction of the galactic centre (0)
 * through `east` (π/2).
 */

/** Longitude samples in a band profile (from 0 towards `east`, all the way round). */
export const BAND_SAMPLES = 64;
/** Disc surface brightness falls off as exp(-r / h), with h this fraction of the galaxy radius. */
const DISC_SCALE_LENGTH = 0.4;
/** The disc fades out between these radii (fractions of the galaxy radius). */
const DISC_EDGE = [1.05, 1.35] as const;
/**
 * Stylised disc half-thickness, in galaxy units, for the band's apparent
 * width. The real star layer is thinner, but a band that thin would be a line.
 */
const BAND_THICKNESS = 45;
const MIN_WIDTH = 0.05;
const MAX_WIDTH = 0.45;
/** Bulge radius (σ of its star distribution, see gen/galaxy.ts) and flattening. */
const BULGE_RADIUS = 0.13;
export const BULGE_FLATTENING = 0.55;
const MAX_BULGE_SIZE = 1.2;

export interface BandSample {
  /** Column of disc stars along this longitude; ~1 looking at the centre from mid-disc. */
  brightness: number;
  /** σ of the band's Gaussian profile in latitude, radians. */
  width: number;
  /** Latitude of the band's midline, radians (below 0 when the star is above the plane). */
  offset: number;
}

export interface GalacticSky {
  /** Unit vectors in system space: galactic north, the centre's longitude, and longitude π/2. */
  north: Vec3Like;
  center: Vec3Like;
  east: Vec3Like;
  /** BAND_SAMPLES samples at longitude 2π·i / BAND_SAMPLES. */
  band: BandSample[];
  /** Unit direction to the galactic centre (the bulge) in system space. */
  bulge: Vec3Like;
  /** Angular σ of the bulge glow along the plane, radians (flattened by BULGE_FLATTENING across it). */
  bulgeSize: number;
}

/**
 * Largest angle between a system's ecliptic and the galactic plane. Real
 * ecliptics are tilted every which way (median 60°, the Sun's is 60.19°),
 * but that made zooming between the galaxy and a system roll the view a long
 * way, so the game keeps systems within 30° of the galactic plane: a
 * deliberate, stylised departure (see docs/research/system-orientation.md).
 */
export const MAX_GALACTIC_TILT = Math.PI / 6;

/**
 * A system's `galacticTilt` (system → galaxy rotation): any turn about the
 * pole, then the ecliptic tilted by up to `maxTilt` about a random axis in
 * the plane, spread evenly over that cap of directions (cos θ uniform), so
 * the band still crosses each system's sky at its own angle.
 */
export function flatTilt(rng: Rng, maxTilt = MAX_GALACTIC_TILT): Quat {
  const turn = rng.range(0, Math.PI * 2);
  const axis = rng.range(0, Math.PI * 2);
  const tilt = Math.acos(1 - rng.next() * (1 - Math.cos(maxTilt)));
  // Tilt about (cos axis, 0, sin axis), after the turn about +Y.
  const ts = Math.sin(tilt / 2);
  const tx = Math.cos(axis) * ts;
  const tz = Math.sin(axis) * ts;
  const tw = Math.cos(tilt / 2);
  const ys = Math.sin(turn / 2);
  const yw = Math.cos(turn / 2);
  return { x: tx * yw - tz * ys, y: tw * ys, z: tz * yw + tx * ys, w: tw * yw };
}

/**
 * The galaxy as seen from a star at `position` (galaxy units), with
 * `galacticTilt` rotating system space into galaxy space. The band is
 * brightest towards the centre (more disc that way), dimmer and wider towards
 * the rim (the nearby stars dominate there), shifted off the midline when the
 * star sits above or below the plane, and fainter for stars near the rim.
 */
export function galacticSky(position: Vec3Like, galacticTilt: Quat, radius = GALAXY_RADIUS): GalacticSky {
  const toSystem = conjugate(galacticTilt);
  // Galaxy-space basis: the plane is y = 0, longitude 0 points at the centre.
  const d = Math.hypot(position.x, position.z);
  const cx = d > 1e-6 ? -position.x / d : 1;
  const cz = d > 1e-6 ? -position.z / d : 0;
  // east = north × center, with north = +y.
  const ex = cz;
  const ez = -cx;

  const band: BandSample[] = [];
  const h = DISC_SCALE_LENGTH * radius;
  const steps = 96;
  const maxPath = (DISC_EDGE[1] + 1) * radius;
  const ds = maxPath / steps;
  for (let i = 0; i < BAND_SAMPLES; i++) {
    const lon = (2 * Math.PI * i) / BAND_SAMPLES;
    const ux = Math.cos(lon) * cx + Math.sin(lon) * ex;
    const uz = Math.cos(lon) * cz + Math.sin(lon) * ez;
    let column = 0;
    let weighted = 0;
    for (let k = 0; k < steps; k++) {
      const s = (k + 0.5) * ds;
      const r = Math.hypot(position.x + ux * s, position.z + uz * s) / radius;
      const density = Math.exp((-r * radius) / h) * (1 - smoothstep(DISC_EDGE[0], DISC_EDGE[1], r));
      column += density * ds;
      weighted += density * s * ds;
    }
    // Mean distance of the stars seen that way: the band's apparent thickness and offset follow it.
    const distance = column > 0 ? weighted / column : maxPath;
    band.push({
      brightness: column / h,
      width: clamp(Math.atan(BAND_THICKNESS / distance), MIN_WIDTH, MAX_WIDTH),
      offset: -Math.atan(position.y / distance),
    });
  }

  const toCenter = Math.hypot(position.x, position.y, position.z);
  const bulge =
    toCenter > 1e-6
      ? { x: -position.x / toCenter, y: -position.y / toCenter, z: -position.z / toCenter }
      : { x: cx, y: 0, z: cz };
  return {
    north: rotate(toSystem, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }),
    center: rotate(toSystem, { x: cx, y: 0, z: cz }, { x: 0, y: 0, z: 0 }),
    east: rotate(toSystem, { x: ex, y: 0, z: ez }, { x: 0, y: 0, z: 0 }),
    band,
    bulge: rotate(toSystem, bulge, { x: 0, y: 0, z: 0 }),
    bulgeSize: Math.min(MAX_BULGE_SIZE, Math.atan((BULGE_RADIUS * radius) / Math.max(toCenter, 1))),
  };
}

/** The band profile at any longitude (radians), interpolated between samples. */
export function bandAt(sky: GalacticSky, lon: number): BandSample {
  const f = (((lon / (2 * Math.PI)) % 1) + 1) % 1 * BAND_SAMPLES;
  const i = Math.floor(f) % BAND_SAMPLES;
  const a = sky.band[i]!;
  const b = sky.band[(i + 1) % BAND_SAMPLES]!;
  const t = f - Math.floor(f);
  return {
    brightness: a.brightness + (b.brightness - a.brightness) * t,
    width: a.width + (b.width - a.width) * t,
    offset: a.offset + (b.offset - a.offset) * t,
  };
}

/** A system-space unit vector from galactic longitude and latitude. */
export function galacticDirection<T extends Vec3Like>(sky: GalacticSky, lon: number, lat: number, out: T): T {
  const c = Math.cos(lat) * Math.cos(lon);
  const e = Math.cos(lat) * Math.sin(lon);
  const n = Math.sin(lat);
  out.x = sky.center.x * c + sky.east.x * e + sky.north.x * n;
  out.y = sky.center.y * c + sky.east.y * e + sky.north.y * n;
  out.z = sky.center.z * c + sky.east.z * e + sky.north.z * n;
  return out;
}

/**
 * Directions (xyz triples, system space) of faint background stars crowding
 * along the band: longitude drawn in proportion to the band's brightness,
 * latitude around its midline, plus some in the bulge.
 */
export function bandStarDirections(sky: GalacticSky, rng: Rng, count: number): Float32Array {
  const out = new Float32Array(count * 3);
  const maxBrightness = Math.max(...sky.band.map((s) => s.brightness));
  const bulgeLat = Math.asin(clamp(dot(sky.bulge, sky.north), -1, 1));
  const v = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < count; i++) {
    let lon: number;
    let lat: number;
    if (rng.chance(0.15)) {
      lon = rng.gaussian(0, sky.bulgeSize);
      lat = bulgeLat + rng.gaussian(0, sky.bulgeSize * BULGE_FLATTENING);
    } else {
      // Rejection sampling against the band's brightness (bounded tries, so it always ends).
      lon = rng.range(0, Math.PI * 2);
      for (let tries = 0; tries < 20 && rng.next() * maxBrightness > bandAt(sky, lon).brightness; tries++) {
        lon = rng.range(0, Math.PI * 2);
      }
      const s = bandAt(sky, lon);
      lat = s.offset + rng.gaussian(0, s.width);
    }
    lat = clamp(lat, -Math.PI / 2, Math.PI / 2);
    galacticDirection(sky, lon, lat, v);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

function dot(a: Vec3Like, b: Vec3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** One of the galaxy's other systems as a point in a system's sky. */
export interface SkyStar {
  /** Unit direction in system space. */
  dir: Vec3Like;
  /** Apparent brightness, luminosity / distance² (Sun-like luminosity 1, galaxy units). */
  flux: number;
  /** The brighter member's colour. */
  color: string;
}

/**
 * The galaxy's other stars as seen from `from` (a system at galaxy position
 * `from.position` whose `galacticTilt` turns system space into galaxy space):
 * each where it really lies, as bright as its luminosity over its distance
 * squared (binaries add up), brightest first. Rogue planets have no stars and
 * are left out.
 */
export function skyStars(
  stars: readonly { id: number; position: Vec3Like; stars: readonly { luminosity: number; color: string }[] }[],
  from: { id: number; position: Vec3Like },
  galacticTilt: Quat,
): SkyStar[] {
  const toSystem = conjugate(galacticTilt);
  const p = from.position;
  const out: SkyStar[] = [];
  for (const s of stars) {
    if (s.id === from.id || s.stars.length === 0) continue;
    const d = { x: s.position.x - p.x, y: s.position.y - p.y, z: s.position.z - p.z };
    const d2 = d.x * d.x + d.y * d.y + d.z * d.z;
    if (d2 < 1e-9) continue;
    const r = Math.sqrt(d2);
    const luminosity = s.stars.reduce((sum, m) => sum + m.luminosity, 0);
    const brightest = s.stars.reduce((a, b) => (b.luminosity > a.luminosity ? b : a));
    out.push({
      dir: rotate(toSystem, { x: d.x / r, y: d.y / r, z: d.z / r }, { x: 0, y: 0, z: 0 }),
      flux: luminosity / d2,
      color: brightest.color,
    });
  }
  return out.sort((a, b) => b.flux - a.flux);
}
