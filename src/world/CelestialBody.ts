import type * as THREE from 'three';

/** Something the player can hover to see its name (e.g. a comet), but not necessarily fly to. */
export interface Sight {
  readonly name: string;
  /** One-line summary for the HUD tooltip, e.g. "Gas giant · rings · 2 moons". */
  readonly description: string;
  /** Optional second tooltip line, e.g. a planet's climate. */
  readonly details?: string;
  /** Visual radius, used for picking. */
  readonly radius: number;
  /** Picked as a sphere this big instead, when set (e.g. a comet's coma round its small nucleus). */
  readonly pickRadius?: number;
  /** The target ring goes round a sphere this big instead, when set (a black hole's disc round its small shadow). */
  readonly markRadius?: number;
  /** Interpolated position of the rendered object. */
  readonly renderPosition: THREE.Vector3;
}

/** A star, planet or moon the player can hover, click and fly to. */
export interface CelestialBody extends Sight {
  /** How far from the centre the autopilot parks, clear of rings and moons. */
  readonly standoff: number;
  /** Position after the latest fixed step (simulation state). */
  readonly position: THREE.Vector3;
  /** Velocity over the latest fixed step, units per second. */
  readonly velocity: THREE.Vector3;
}

/**
 * Something hovered by its own ray test rather than as a sphere (an asteroid
 * belt), and flown to by way of a body in it: clicking it sends the ship to
 * `bodyNear` the point the ray met.
 */
export interface Region extends Sight {
  /** Where `ray` meets it: the distance along the ray (the point in `out`), or null. */
  hit(ray: THREE.Ray, out: THREE.Vector3): number | null;
  bodyNear(point: THREE.Vector3): CelestialBody | null;
}
