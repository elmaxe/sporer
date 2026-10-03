import * as THREE from 'three';
import { GLOBE_SIZE_FACTOR } from '../gen/planets';
import { Rng } from '../gen/rng';

/*
 * The volcano bomb and the volcanoes it raises, as pure functions (THREE
 * maths types only, no scene). Unit-tested in tests/volcano.test.ts.
 *
 *   0           launch: a molten shell leaves the ship and flies straight at
 *               the point (bowed out only to clear the ground: combat/path.ts)
 *   flightTime  impact: a flash and a ring of dust on the ground, and a
 *               volcano starts to rise out of it (growTime), erupting hard:
 *               lava fountains, an ash column, lava running down its flanks
 *   later       it settles into a gentle eruption that goes on for good
 *
 * A volcano's shape is stylised like the terrain's relief (planet/frame.ts
 * exaggerates mountains ×1.6): a steep stratovolcano cone with concave
 * flanks and a crater, a few gullies round it from its own seed.
 */

export const volcanoParams = {
  /** Seconds from launch to impact. */
  flightTime: 1.6,
  /** Seconds the volcano takes to rise to its full height after the impact. */
  growTime: 4,
  /** Seconds of the violent eruption that comes with its birth, fading into its lasting activity. */
  birthTime: 14,
  /** How far the lava runs down the flanks over the birth (share of the way to the foot). */
  flowReach: 0.85,
  /** Footprint radius, planet units (grows with the globes) ... */
  baseRadius: 12 * GLOBE_SIZE_FACTOR,
  /** ... but at most this share of the globe's radius (small moons). */
  maxBaseShare: 0.2,
  /** Height over the footprint radius. */
  heightRatio: 0.4,
  /** The crater rim's radius as a share of the footprint's, and how deep the crater is (share of the height). */
  craterShare: 0.17,
  craterDepth: 0.28,
  /** Rising out of a sea, the crater floor clears its surface by at least this share of the height. */
  islandClearance: 0.35,
  /** How many a body can carry. */
  maxPerBody: 8,
  /** The lasting eruption's strength (0–1) once the birth is over. */
  idle: 0.3,
};

export type VolcanoParams = typeof volcanoParams;

/** Where a volcano stands, as kept in a planet's change list (see surface/changes.ts). JSON-able. */
export interface VolcanoSite {
  /** Unit direction of its summit in the body frame. */
  x: number;
  y: number;
  z: number;
  /** Its shape's seed. */
  seed: number;
}

/** Gullies round the cone: count and their depth (share of the height). */
const GULLIES = 7;
const GULLY_DEPTH = 0.07;

/**
 * One volcano's shape on a globe of radius `globeRadius`: where it stands,
 * how wide (an angle from the summit) and how high, and its gullies. `lift`
 * is how far it raises the ground in a direction, × its `growth` (0 → 1 as
 * it rises).
 */
export class VolcanoShape {
  /** Unit direction of the summit. */
  readonly centre: THREE.Vector3;
  /** Footprint radius, planet units, and the angle it spans from the summit. */
  readonly baseRadius: number;
  readonly angle: number;
  readonly cosAngle: number;
  /** Height of the crater rim over the ground at the summit, planet units. */
  readonly height: number;
  /** Two unit tangents at the summit (east-ish and north-ish), for the azimuth round it. */
  readonly tangent: THREE.Vector3;
  readonly bitangent: THREE.Vector3;
  /** The lava channels down the flanks: their azimuths (radians) and widths. */
  readonly channels: readonly { azimuth: number; width: number; reach: number }[];
  /** How far it has risen (0–1); see volcanoGrowth. */
  growth = 1;
  private readonly gullyPhase: number[];
  private readonly gullyCount: number[];
  private readonly scratch = new THREE.Vector3();

  constructor(
    readonly site: VolcanoSite,
    globeRadius: number,
    /** The ground's radius at the summit (terrain, not the sea). */
    groundAtCentre: number,
    /** The sea's radius, or null with no sea. */
    sea: number | null,
    p: VolcanoParams = volcanoParams,
  ) {
    const rng = new Rng(site.seed);
    this.centre = new THREE.Vector3(site.x, site.y, site.z).normalize();
    const size = rng.range(0.8, 1.2);
    this.baseRadius = Math.min(p.baseRadius, p.maxBaseShare * globeRadius) * size;
    this.angle = this.baseRadius / globeRadius;
    this.cosAngle = Math.cos(this.angle);
    let height = this.baseRadius * p.heightRatio * rng.range(0.85, 1.15);
    // An island: it always breaks the surface, its crater floor (the vent) too.
    const floor = 1 - p.craterDepth;
    if (sea !== null && groundAtCentre + height * floor < sea + p.islandClearance * height) {
      height = (sea - groundAtCentre + p.islandClearance * height) / floor;
    }
    this.height = height;
    // Any tangent will do; take one away from the axis the summit is nearest.
    const c = this.centre;
    const axis = Math.abs(c.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    this.tangent = new THREE.Vector3().crossVectors(axis, c).normalize();
    this.bitangent = new THREE.Vector3().crossVectors(c, this.tangent);
    this.gullyPhase = [];
    this.gullyCount = [];
    for (let k = 0; k < 3; k++) {
      this.gullyCount.push(Math.round(rng.range(3, GULLIES + 3)));
      this.gullyPhase.push(rng.range(0, Math.PI * 2));
    }
    const channels = Math.round(rng.range(3, 6));
    this.channels = Array.from({ length: channels }, (_, k) => ({
      azimuth: ((k + rng.range(0.2, 0.8)) / channels) * Math.PI * 2,
      width: rng.range(0.08, 0.16),
      reach: rng.range(0.6, 1),
    }));
  }

  /**
   * The cone's height over the ground at `s` (0 at the summit → 1 at the
   * foot, as a share of the footprint) and azimuth `azimuth`, as a share of
   * `height`: concave flanks rising to the crater rim (1), the crater
   * dipping inside it, gullies scoring the flanks. 0 from the foot out.
   */
  profile(s: number, azimuth: number, p: VolcanoParams = volcanoParams): number {
    if (s >= 1) return 0;
    const c = p.craterShare;
    if (s <= c) {
      // A bowl, with its rim a little sharp.
      const u = s / c;
      return 1 - p.craterDepth * (1 - u * u) ** 1.5;
    }
    const u = (s - c) / (1 - c);
    // Concave flanks, flat at the foot (so the cone meets the ground smoothly).
    let h = (1 - u) ** 1.8;
    let gullies = 0;
    for (let k = 0; k < this.gullyCount.length; k++) gullies += Math.sin(this.gullyCount[k]! * azimuth + this.gullyPhase[k]!) / (k + 1);
    // Scored deepest halfway down, none on the rim and at the foot.
    h -= GULLY_DEPTH * Math.sin(Math.PI * u) * Math.max(0, gullies) * 0.6;
    return Math.max(0, h);
  }

  /** `s` and azimuth of unit direction `dir`; null outside the footprint. Allocation-free. */
  locate(dir: THREE.Vector3, out: { s: number; azimuth: number }): boolean {
    const d = dir.dot(this.centre);
    if (d <= this.cosAngle) return false;
    out.s = Math.acos(Math.min(1, d)) / this.angle;
    const v = this.scratch.copy(dir).addScaledVector(this.centre, -d);
    out.azimuth = Math.atan2(v.dot(this.bitangent), v.dot(this.tangent));
    return true;
  }

  /** How far it raises the ground in unit direction `dir` now (planet units; 0 outside it). */
  lift(dir: THREE.Vector3): number {
    if (this.growth <= 0 || !this.locate(dir, spot)) return 0;
    return this.growth * this.height * this.profile(spot.s, spot.azimuth);
  }

  /** Unit direction `s` (share of the footprint) out from the summit at `azimuth`, written into `out`. */
  direction(s: number, azimuth: number, out: THREE.Vector3): THREE.Vector3 {
    const a = s * this.angle;
    return out
      .copy(this.tangent)
      .multiplyScalar(Math.cos(azimuth))
      .addScaledVector(this.bitangent, Math.sin(azimuth))
      .multiplyScalar(Math.sin(a))
      .addScaledVector(this.centre, Math.cos(a));
  }

  /** How much of a lava channel (0–1) runs at `s`, `azimuth` (before the flow front: see lavaFront). */
  channel(s: number, azimuth: number): number {
    let best = 0;
    for (const ch of this.channels) {
      // Wandering a little as it runs down.
      const wander = 0.12 * Math.sin(s * 9 + ch.azimuth * 3);
      let d = Math.abs(azimuth - ch.azimuth - wander);
      d = Math.min(d, Math.PI * 2 - d);
      const width = ch.width * (0.5 + s);
      if (s > ch.reach) continue;
      best = Math.max(best, Math.exp(-((d / width) ** 2)) * (1 - THREE.MathUtils.smoothstep(s, ch.reach * 0.8, ch.reach)));
    }
    return best;
  }
}

const spot = { s: 0, azimuth: 0 };

/** How far a volcano has risen (0 → 1) `age` seconds after the impact: fast at first, easing in. */
export function volcanoGrowth(age: number, p: VolcanoParams = volcanoParams): number {
  if (age <= 0) return 0;
  const u = Math.min(1, age / p.growTime);
  return 1 - (1 - u) ** 3;
}

/** How hard it erupts (0–1) `age` seconds after the impact: violent at birth, then settling to `idle`. */
export function eruptionStrength(age: number, p: VolcanoParams = volcanoParams): number {
  if (age < 0) return 0;
  const build = Math.min(1, age / 0.6);
  const fade = Math.exp(-Math.max(0, age - p.growTime) / (p.birthTime / 3));
  return build * (p.idle + (1 - p.idle) * fade);
}

/** How far down the flanks (share of the footprint) the lava has run `age` seconds after the impact. */
export function lavaFront(age: number, p: VolcanoParams = volcanoParams): number {
  if (age <= 0) return 0;
  return p.craterShare + (p.flowReach - p.craterShare) * (1 - Math.exp(-age / (p.birthTime / 4)));
}

/** How far along its path the shell is (0 → 1) `t` seconds after launch: it leaves the ship moving and speeds up. */
export function shellProgress(t: number, p: VolcanoParams = volcanoParams): number {
  const s = Math.min(1, Math.max(0, t / p.flightTime));
  return s * (0.4 + 0.6 * s);
}
