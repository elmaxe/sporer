/** Circular orbit around the origin in the XZ plane, optionally tilted about X. */
export interface Orbit {
  radius: number;
  /** Seconds per revolution. */
  period: number;
  /** Starting angle in radians. */
  phase: number;
  /** Tilt of the orbital plane in radians. */
  inclination: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export function orbitAngle(orbit: Orbit, time: number): number {
  return orbit.phase + (2 * Math.PI * time) / orbit.period;
}

/** Writes the orbiting body's position at `time` into `out` and returns it. */
export function orbitPosition<T extends Vec3Like>(orbit: Orbit, time: number, out: T): T {
  const a = orbitAngle(orbit, time);
  const flatZ = orbit.radius * Math.sin(a);
  out.x = orbit.radius * Math.cos(a);
  out.y = flatZ * Math.sin(orbit.inclination);
  out.z = flatZ * Math.cos(orbit.inclination);
  return out;
}

/**
 * The inverse of orbitPosition: the angle (radians, in [-π, π]) of a point on
 * the orbit, e.g. where a body is actually drawn.
 */
export function orbitAngleOf(orbit: Orbit, p: Vec3Like): number {
  // Undo the tilt about X to get the in-plane coordinate that was sin(angle).
  const flatZ = p.y * Math.sin(orbit.inclination) + p.z * Math.cos(orbit.inclination);
  return Math.atan2(flatZ, p.x);
}

/**
 * Elliptical (Kepler) orbit around the origin, for comets. The orbital plane
 * starts as XZ like `Orbit`, is tilted about X by `inclination`, then turned
 * about +Y by `node`; the perihelion lies `argPerihelion` along the orbit
 * from the ascending node. With `eccentricity` 0 and both angles 0 it is the
 * same as an `Orbit` with the same radius, period, phase and inclination.
 */
export interface KeplerOrbit {
  semiMajor: number;
  /** 0 = circle, towards 1 = long thin ellipse. */
  eccentricity: number;
  /** Seconds per revolution. */
  period: number;
  /** Mean anomaly at time 0, in radians (0 = at perihelion). */
  phase: number;
  inclination: number;
  argPerihelion: number;
  /** Longitude of the ascending node, about +Y. */
  node: number;
}

/**
 * Solves Kepler's equation M = E − e·sin E for the eccentric anomaly E by
 * Newton iteration. Works for any mean anomaly and 0 ≤ e < 1; the result is
 * in the same turn as M wrapped into [−π, π].
 */
export function solveKepler(meanAnomaly: number, eccentricity: number): number {
  const e = eccentricity;
  const m = meanAnomaly - 2 * Math.PI * Math.round(meanAnomaly / (2 * Math.PI));
  // Starting at π (with M's sign) converges for highly eccentric orbits too.
  let E = e < 0.8 ? m : m >= 0 ? Math.PI : -Math.PI;
  for (let i = 0; i < 50; i++) {
    const d = (E - e * Math.sin(E) - m) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

export function perihelion(orbit: KeplerOrbit): number {
  return orbit.semiMajor * (1 - orbit.eccentricity);
}

export function aphelion(orbit: KeplerOrbit): number {
  return orbit.semiMajor * (1 + orbit.eccentricity);
}

/** Writes the body's position at `time` into `out` and returns it. */
export function keplerPosition<T extends Vec3Like>(orbit: KeplerOrbit, time: number, out: T): T {
  const { semiMajor: a, eccentricity: e } = orbit;
  const E = solveKepler(orbit.phase + (2 * Math.PI * time) / orbit.period, e);
  // In the orbital plane, perihelion along +x.
  const px = a * (Math.cos(E) - e);
  const py = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(orbit.argPerihelion);
  const sw = Math.sin(orbit.argPerihelion);
  const x = px * cw - py * sw;
  const flat = px * sw + py * cw;
  // Tilt about X (as orbitPosition), then turn about Y.
  const y = flat * Math.sin(orbit.inclination);
  const z = flat * Math.cos(orbit.inclination);
  const cn = Math.cos(orbit.node);
  const sn = Math.sin(orbit.node);
  out.x = x * cn + z * sn;
  out.y = y;
  out.z = -x * sn + z * cn;
  return out;
}
