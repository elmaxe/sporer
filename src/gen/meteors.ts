import type { CometData } from './comets';
import { keplerPosition, orbitAngle, orbitPosition, type KeplerOrbit, type Orbit } from './orbit';
import { hashSeed } from './rng';
import type { Vec3Tuple } from './starActivity';
import { hash01 } from './weather';

/*
 * Meteor showers (roadmap step 29). A comet sheds dust all along its orbit,
 * so its orbit is also a meteoroid stream. A planet whose orbit passes close
 * to it runs through the stream once a year, at the same place on its orbit:
 * a shower, its meteors coming from one point in the sky (the radiant). With
 * air they burn up as streaks high up; on an airless body they hit the ground
 * as brief flashes, like the ones seen on the Moon. Pure: which planets get
 * showers, when, from where, and every meteor as a function of the clock.
 * Sources and numbers: docs/research/dust.md.
 */

/** A shower on one body: one crossing of a comet's stream. */
export interface MeteorShower {
  /** Index of the parent comet in `SystemData.comets`. */
  comet: number;
  /** The comet's name, for the HUD. */
  name: string;
  /** How close the two orbits come (system units). */
  moid: number;
  /** The planet's orbital angle (as `orbitAngle`) at the crossing. */
  angle: number;
  /** The active window's half-width at half maximum, radians of the planet's orbit. */
  halfWidth: number;
  /** 0–1: how strong it is at its peak (closer crossings are stronger). */
  strength: number;
  /** Unit vector in system space towards the radiant: the meteors fly away from it. */
  radiant: Vec3Tuple;
  /** Speed of the meteors entering the air, km/s: the stream's speed relative to the planet plus its escape speed. */
  speed: number;
  /** Seeds the meteors. */
  seed: number;
}

/**
 * A stream gives a shower when the planet's orbit passes within this many
 * habitable radii (≈ AU) of the comet's: the MOID that the parents of known
 * showers have with Earth's orbit (docs/research/dust.md).
 */
export const SHOWER_MOID = 0.1;

/**
 * The shower's half width at half maximum, in turns of the planet's orbit.
 * Real showers peak over ~1–3 days of the year; stretched to a tenth of an
 * orbit here (a deliberate departure) so a shower lasts long enough in the
 * game's minutes-long years to be caught.
 */
export const SHOWER_HALF_WIDTH = 0.05;

/**
 * Meteors need air to burn up in: they ablate at air densities of
 * 10^−9.2–10^−7 g/cm³, which an N₂/O₂ atmosphere reaches somewhere above
 * the ground when the surface pressure is over ~0.04 Pa (dust.md; Pluto's and
 * Triton's ~1 Pa are marginal). Below it (bar) a body counts as airless and
 * the dust hits the ground instead.
 */
export const METEOR_MIN_PRESSURE = 4e-7;

/** A gas giant's escape speed for its meteors' entry speed (Jupiter's 59.5 km/s; giants have no climate). */
export const GIANT_ESCAPE_VELOCITY = 59.5;

/** Earth's orbital speed, km/s: the game's orbital speeds are scaled to it at the habitable radius. */
export const EARTH_ORBITAL_SPEED = 29.78;

/** Samples round the comet's orbit for the MOID search (then refined). */
const MOID_SAMPLES = 720;

/** Unit normal of a circular orbit's plane (as orbitPosition lays it out). */
export function orbitNormal(orbit: Orbit, out: Vec3Tuple = [0, 0, 0]): Vec3Tuple {
  // The XZ plane (normal +Y) tilted about X by the inclination, then turned about +Y by the node.
  const i = orbit.inclination;
  const ny = Math.cos(i);
  const nz0 = -Math.sin(i);
  const node = orbit.node ?? 0;
  const c = Math.cos(node);
  const s = Math.sin(node);
  out[0] = nz0 * s;
  out[1] = ny;
  out[2] = nz0 * c;
  return out;
}

/** Distance from point `p` to the circle of `orbit`. */
export function circleDistance(orbit: Orbit, n: Vec3Tuple, p: Vec3Tuple): number {
  const h = p[0] * n[0] + p[1] * n[1] + p[2] * n[2];
  const rho = Math.hypot(p[0] - h * n[0], p[1] - h * n[1], p[2] - h * n[2]);
  return Math.hypot(h, rho - orbit.radius);
}

/** A point on a Kepler orbit by mean anomaly (time = M / 2π · period with phase 0). */
function cometPoint(comet: KeplerOrbit, meanAnomaly: number, out: Vec3Tuple): Vec3Tuple {
  const p = keplerPosition({ ...comet, phase: 0 }, (meanAnomaly / (2 * Math.PI)) * comet.period, { x: 0, y: 0, z: 0 });
  out[0] = p.x;
  out[1] = p.y;
  out[2] = p.z;
  return out;
}

/** A local minimum of the distance between a circular orbit and a Kepler orbit. */
export interface OrbitApproach {
  /** The distance there (system units). */
  distance: number;
  /** The comet's mean anomaly there. */
  meanAnomaly: number;
  /** The comet's point there. */
  point: Vec3Tuple;
}

/**
 * Every local minimum of the distance between a circular orbit and a comet's
 * Kepler orbit, closest first (the first one's distance is the MOID). A comet
 * can come close at both of its nodes, like Halley's, which gives Earth the
 * η Aquariids in May and the Orionids in October.
 */
export function orbitApproaches(orbit: Orbit, comet: KeplerOrbit): OrbitApproach[] {
  const n = orbitNormal(orbit);
  const p: Vec3Tuple = [0, 0, 0];
  // Sampled evenly in eccentric anomaly would be better near aphelion; mean anomaly crowds samples near
  // perihelion, where the planets are, so sample the true path by its eccentric anomaly instead.
  const e = comet.eccentricity;
  const d: number[] = [];
  const m: number[] = [];
  for (let k = 0; k < MOID_SAMPLES; k++) {
    const E = (2 * Math.PI * k) / MOID_SAMPLES;
    const M = E - e * Math.sin(E);
    m.push(M);
    d.push(circleDistance(orbit, n, cometPoint(comet, M, p)));
  }
  const found: OrbitApproach[] = [];
  for (let k = 0; k < MOID_SAMPLES; k++) {
    const prev = d[(k + MOID_SAMPLES - 1) % MOID_SAMPLES]!;
    const next = d[(k + 1) % MOID_SAMPLES]!;
    if (!(d[k]! <= prev && d[k]! < next)) continue;
    // Refine by golden-section search in eccentric anomaly between the neighbours.
    let a = (2 * Math.PI * (k - 1)) / MOID_SAMPLES;
    let b = (2 * Math.PI * (k + 1)) / MOID_SAMPLES;
    const f = (E: number) => circleDistance(orbit, n, cometPoint(comet, E - e * Math.sin(E), p));
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a);
    let dd = a + g * (b - a);
    let fc = f(c);
    let fd = f(dd);
    for (let it = 0; it < 40; it++) {
      if (fc < fd) {
        b = dd;
        dd = c;
        fd = fc;
        c = b - g * (b - a);
        fc = f(c);
      } else {
        a = c;
        c = dd;
        fc = fd;
        dd = a + g * (b - a);
        fd = f(dd);
      }
    }
    const E = (a + b) / 2;
    const M = E - e * Math.sin(E);
    const point = cometPoint(comet, M, [0, 0, 0]);
    found.push({ distance: circleDistance(orbit, n, point), meanAnomaly: M, point });
  }
  return found.sort((x, y) => x.distance - y.distance);
}

/** The minimum orbit intersection distance between a circular orbit and a comet's (system units). */
export function moid(orbit: Orbit, comet: KeplerOrbit): number {
  return orbitApproaches(orbit, comet)[0]?.distance ?? Infinity;
}

/** The angle (as `orbitAngle`) of the point on a circular orbit nearest `p`. */
function angleNearest(orbit: Orbit, p: Vec3Tuple): number {
  // Undo the node's turn about Y, then the tilt about X (as orbitAngleOf).
  const node = orbit.node ?? 0;
  const c = Math.cos(node);
  const s = Math.sin(node);
  const x = p[0] * c - p[2] * s;
  const z = p[0] * s + p[2] * c;
  const flatZ = p[1] * Math.sin(orbit.inclination) + z * Math.cos(orbit.inclination);
  return Math.atan2(flatZ, x);
}

/** What a body's showers depend on beyond its orbit. */
export interface ShowerBody {
  /** The orbit round the star (a moon: its planet's). */
  orbit: Orbit;
  /** Escape speed, km/s (adds to the meteors' entry speed); 0 when unknown. */
  escapeVelocity: number;
  /** Seeds the meteors. */
  seed: number;
}

/**
 * The meteor showers a body on `orbit` gets from a system's comets: one for
 * each place where a comet's orbit passes within SHOWER_MOID habitable radii
 * of its own. Nothing for a starless system or a still body.
 */
export function meteorShowers(body: ShowerBody, comets: readonly CometData[], habitableRadius: number): MeteorShower[] {
  const { orbit } = body;
  if (habitableRadius <= 0 || orbit.radius <= 0) return [];
  const limit = SHOWER_MOID * habitableRadius;
  const showers: MeteorShower[] = [];
  comets.forEach((comet, i) => {
    for (const a of orbitApproaches(orbit, comet.orbit)) {
      if (a.distance >= limit) continue;
      const angle = angleNearest(orbit, a.point);
      const radiant: Vec3Tuple = [0, 0, 0];
      const relative = streamVelocity(orbit, comet.orbit, a.meanAnomaly, angle, radiant);
      // Game speeds to km/s: a circular orbit at the habitable radius goes at Earth's speed (Kepler: v ∝ 1/√r).
      const scale = EARTH_ORBITAL_SPEED / (((2 * Math.PI * orbit.radius) / orbit.period) * Math.sqrt(orbit.radius / habitableRadius));
      const v = relative * scale;
      showers.push({
        comet: i,
        name: comet.name,
        moid: a.distance,
        angle,
        halfWidth: SHOWER_HALF_WIDTH * 2 * Math.PI,
        strength: 1 - a.distance / limit,
        radiant,
        speed: Math.sqrt(v * v + body.escapeVelocity * body.escapeVelocity),
        seed: hashSeed(body.seed, 'shower', i, showers.length),
      });
    }
  });
  return showers;
}

/**
 * The stream's velocity relative to the planet at the crossing, written as
 * the unit direction it comes from (the radiant) into `radiant`; returns its
 * size in system units per second. The planet's velocity is its circular
 * orbit's at `angle`; the stream's is the comet's at mean anomaly `M`.
 */
function streamVelocity(orbit: Orbit, comet: KeplerOrbit, M: number, angle: number, radiant: Vec3Tuple): number {
  const dt = comet.period * 1e-5;
  const c0 = keplerPosition({ ...comet, phase: M }, -dt, { x: 0, y: 0, z: 0 });
  const c1 = keplerPosition({ ...comet, phase: M }, dt, { x: 0, y: 0, z: 0 });
  const pdt = orbit.period * 1e-5;
  const at = { ...orbit, phase: angle };
  const p0 = orbitPosition(at, -pdt, { x: 0, y: 0, z: 0 });
  const p1 = orbitPosition(at, pdt, { x: 0, y: 0, z: 0 });
  const vx = (c1.x - c0.x) / (2 * dt) - (p1.x - p0.x) / (2 * pdt);
  const vy = (c1.y - c0.y) / (2 * dt) - (p1.y - p0.y) / (2 * pdt);
  const vz = (c1.z - c0.z) / (2 * dt) - (p1.z - p0.z) / (2 * pdt);
  const v = Math.hypot(vx, vy, vz);
  // The meteors fly along the relative velocity, so they come from the opposite way.
  radiant[0] = -vx / v;
  radiant[1] = -vy / v;
  radiant[2] = -vz / v;
  return v;
}

/** The first time at or after `after` when the planet on `orbit` is at the shower's peak. */
export function nextShowerPeak(shower: Pick<MeteorShower, 'angle'>, orbit: Orbit, after: number): number {
  const T = orbit.period;
  const t = ((shower.angle - orbit.phase) / (2 * Math.PI)) * T;
  return t + T * Math.ceil((after - t) / T);
}

/** How active a shower is with the planet at `time` on `orbit`, 0–1 (1 at the peak). */
export function showerActivity(shower: MeteorShower, orbit: Orbit, time: number): number {
  let d = orbitAngle(orbit, time) - shower.angle;
  d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
  // Showers rise and fall roughly exponentially either side of the peak (Jenniskens 1994); a Lorentzian-like
  // falloff would leave a faint tail all year, so this is a Gaussian with the same half width at half maximum.
  return shower.strength * Math.exp(-Math.LN2 * (d / shower.halfWidth) ** 2);
}

/** The body's strongest shower now and how active it is, or null when none is. */
export function activeShower(
  showers: readonly MeteorShower[],
  orbit: Orbit,
  time: number,
  threshold = 0.05,
): { shower: MeteorShower; activity: number } | null {
  let best: { shower: MeteorShower; activity: number } | null = null;
  for (const s of showers) {
    const a = showerActivity(s, orbit, time);
    if (a > threshold && (!best || a > best.activity)) best = { shower: s, activity: a };
  }
  return best;
}

/** The HUD's words for a shower, e.g. "meteor shower from Comet Foo". */
export function describeShower(shower: Pick<MeteorShower, 'name'>, airless: boolean): string {
  return airless ? `meteor impacts from ${shower.name}'s dust` : `meteor shower from ${shower.name}`;
}

// --- The meteors themselves ---

/**
 * Meteors per second over the part of the sky the camera sees at a shower's
 * peak (strength 1): stylised. A real major shower's ZHR is 15–150 an hour
 * (IMO; the 1966 Leonid storm ~15,000), too rare to notice in a short visit.
 */
export const METEOR_PEAK_RATE = 8;
/**
 * Impact flashes per second on the hemisphere in view at the peak, stylised
 * like the meteors: the Moon shows ~2 an hour over a hemisphere (Suggs et
 * al. 2014), 2.5–3.7 times that in the Perseids (Madiedo et al. 2015).
 */
export const FLASH_PEAK_RATE = 8;
/** Each meteor is decided on this grid (seconds), like the lightning. */
export const METEOR_SLOT = 0.05;
/** Longest a meteor lasts (s): the slots this far back are checked. */
export const METEOR_SPAN = 1.6;

/** One meteor (or, on an airless body, impact flash), allocation-free. */
export interface Meteor {
  /** When it starts and how long it lasts (s). */
  start: number;
  duration: number;
  /** Where in the view: two numbers in [0, 1) the view turns into a place (a direction off the camera, a spot on the ground). */
  u: number;
  v: number;
  /** Relative brightness 0.3–1 (most meteors are faint). */
  brightness: number;
  /** 0–1, picks a colour from the emission lines (metal-rich green-blue to sodium orange). */
  hue: number;
  /** Stable id: the same meteor keeps it while it lasts. */
  id: number;
}

/** A pool of meteors to fill without allocating. */
export function meteorPool(size: number): Meteor[] {
  return Array.from({ length: size }, () => ({ start: 0, duration: 0, u: 0, v: 0, brightness: 0, hue: 0, id: 0 }));
}

/**
 * A meteor's duration (s) for an entry speed (km/s), from its path through
 * the air at that speed, `r` (0–1) drawing the path's length. Video meteors
 * last 0.33 ± 0.15 s, at most ~1.3 s (Brosch et al. 2004), over paths of
 * ~20–50 km; faster ones are shorter.
 */
export function meteorDuration(speed: number, r: number): number {
  return Math.min(METEOR_SPAN, (METEOR_PATH_KM[0] + (METEOR_PATH_KM[1] - METEOR_PATH_KM[0]) * r * r) / Math.max(speed, 11));
}

/** A meteor's visible path through the air, km. */
export const METEOR_PATH_KM = [12, 50] as const;

/**
 * Where a meteor begins and ends, km up, for its entry speed (km/s): faster
 * ones start and end higher. Measured: ρ-Geminids (23 km/s) 90–96 → 53–79 km,
 * Quadrantids (43 km/s) 94–111 → 67–100, September ε-Perseids (66 km/s)
 * 100–118 → 84–105 (dust.md); a line through the middles.
 */
export function meteorHeights(speed: number): { begin: number; end: number } {
  const t = Math.min(1, Math.max(0, (speed - 23) / (66 - 23)));
  return { begin: 93 + (109 - 93) * t, end: 66 + (94 - 66) * t };
}

/**
 * How long an impact flash shows (s): real ones last 20–160 ms (dust.md),
 * lengthened a little so the eye catches them.
 */
export const IMPACT_FLASH = [0.08, 0.3] as const;

/**
 * The meteors (or impact flashes) of `shower` alive at `time` with activity
 * `activity` (0–1), written into `pool`; returns how many. A pure function
 * of the clock: every slot of METEOR_SLOT seconds holds at most one, decided
 * by a hash, so any moment can be shown without replaying the past.
 */
export function collectMeteors(shower: MeteorShower, activity: number, time: number, airless: boolean, pool: Meteor[]): number {
  if (activity <= 0) return 0;
  const rate = (airless ? FLASH_PEAK_RATE : METEOR_PEAK_RATE) * activity;
  const p = Math.min(1, rate * METEOR_SLOT);
  const first = Math.floor((time - METEOR_SPAN) / METEOR_SLOT);
  const last = Math.floor(time / METEOR_SLOT);
  let n = 0;
  for (let j = first; j <= last && n < pool.length; j++) {
    if (hash01(shower.seed, j, 0) >= p) continue;
    const start = (j + hash01(shower.seed, j, 1)) * METEOR_SLOT;
    const r = hash01(shower.seed, j, 2);
    const duration = airless
      ? IMPACT_FLASH[0] + (IMPACT_FLASH[1] - IMPACT_FLASH[0]) * r
      : meteorDuration(shower.speed, r);
    if (time < start || time >= start + duration) continue;
    const m = pool[n++]!;
    m.start = start;
    m.duration = duration;
    m.u = hash01(shower.seed, j, 3);
    m.v = hash01(shower.seed, j, 4);
    // Brightness is steeply distributed: many faint, a few bright (a fireball now and then).
    m.brightness = 0.3 + 0.7 * hash01(shower.seed, j, 5) ** 3;
    m.hue = hash01(shower.seed, j, 6);
    m.id = j;
  }
  return n;
}
