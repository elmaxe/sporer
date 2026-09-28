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

/** `segments` points evenly spaced around the orbit (a closed loop), as xyz triples. */
export function orbitPath(orbit: Orbit, segments: number): Float32Array {
  const out = new Float32Array(segments * 3);
  const p = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < segments; i++) {
    orbitPosition(orbit, (orbit.period * i) / segments, p);
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
  }
  return out;
}
