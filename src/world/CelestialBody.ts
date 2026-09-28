import type * as THREE from 'three';

/** A star, planet or moon the player can hover, click and fly to. */
export interface CelestialBody {
  readonly name: string;
  /** One-line summary for the HUD tooltip, e.g. "Gas giant · rings · 2 moons". */
  readonly description: string;
  /** Visual radius, used for picking. */
  readonly radius: number;
  /** How far from the centre the autopilot parks, clear of rings and moons. */
  readonly standoff: number;
  /** Position after the latest fixed step (simulation state). */
  readonly position: THREE.Vector3;
  /** Velocity over the latest fixed step, units per second. */
  readonly velocity: THREE.Vector3;
  /** Interpolated position of the rendered object. */
  readonly renderPosition: THREE.Vector3;
}
