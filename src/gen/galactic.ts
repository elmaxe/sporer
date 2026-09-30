import { GALAXY_RADIUS } from './galaxy';
import type { Vec3Like } from './orbit';
import type { Rng } from './rng';

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

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

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

/** A uniformly random rotation (Shoemake's method). */
export function randomRotation(rng: Rng): Quat {
  const u1 = rng.next();
  const u2 = rng.range(0, Math.PI * 2);
  const u3 = rng.range(0, Math.PI * 2);
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) };
}

/** Rotates `v` by the unit quaternion `q` into `out` (which may be `v`). */
export function rotate<T extends Vec3Like>(q: Quat, v: Vec3Like, out: T): T {
  // t = 2 q.xyz × v; v' = v + w t + q.xyz × t
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  const x = v.x + q.w * tx + (q.y * tz - q.z * ty);
  const y = v.y + q.w * ty + (q.z * tx - q.x * tz);
  const z = v.z + q.w * tz + (q.x * ty - q.y * tx);
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function conjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
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
