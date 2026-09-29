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
