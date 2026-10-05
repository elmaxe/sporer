import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { detailedTerrain } from '../src/gen/noise';
import { RELIEF_SCALE, globeRadius } from '../src/planet/frame';
import type { Debug } from '../src/core/Debug';
import type { Input } from '../src/core/Input';
import { PlanetShip } from '../src/planet/PlanetShip';
import {
  HULL_DEPTH,
  HULL_RADIUS,
  aheadDirection,
  climbStep,
  flightRadius,
  followWeight,
  groundAhead,
  groundHit,
  groundParams,
  obstacleClearance,
  type GroundHeight,
  type Obstacles,
} from '../src/planet/ground';
import { peakRadius, terrainSampler } from '../src/world/planetGeometry';
import type { PlanetStyle } from '../src/gen/system';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const R = 100;

/** A ball of radius 100 with a 20-unit-tall bump (a cone of half-angle 0.3 rad) at +X. */
const bump: GroundHeight = (d) => R + Math.max(0, 20 * (1 - Math.acos(Math.min(1, d.x)) / 0.3));

describe('followWeight', () => {
  it('follows the ground when zoomed in and not at all when zoomed out, smoothly between', () => {
    expect(followWeight(0)).toBe(1);
    expect(followWeight(groundParams.followFrom)).toBe(1);
    expect(followWeight(groundParams.followTo)).toBe(0);
    expect(followWeight(1)).toBe(0);
    let last = 1;
    for (let f = 0; f <= 1; f += 0.02) {
      const w = followWeight(f);
      expect(w).toBeLessThanOrEqual(last + 1e-9);
      last = w;
    }
  });
});

describe('flightRadius', () => {
  it('is the zoom radius with no following, and the zoom altitude above the ground with full following', () => {
    const top = 130;
    const altitude = 3;
    expect(flightRadius(top + altitude, top, 105, 0)).toBe(133);
    expect(flightRadius(top + altitude, top, 105, 1)).toBe(108);
    expect(flightRadius(top + altitude, top, top, 1)).toBe(top + altitude);
  });
});

describe('groundAhead', () => {
  const heading = v(0, 0, 1);
  it('is the ground under the ship when it is level', () => {
    expect(groundAhead(() => 100, v(0, 1, 0), v(0, 0, 0), heading, 100)).toBe(100);
  });

  it('sees a hill ahead along the velocity, and not one behind', () => {
    // Ground rises in front of the ship (towards +Z) and not behind it.
    const ridge: GroundHeight = (d) => 100 + (d.z > 0.1 ? 10 : 0);
    const u = v(0, 1, 0);
    expect(groundAhead(ridge, u, v(0, 0, 60), heading, 100)).toBe(110);
    expect(groundAhead(ridge, u, v(0, 0, -60), v(0, 0, -1), 100)).toBe(100);
  });

  it('looks further the faster it goes', () => {
    const step: GroundHeight = (d) => (d.z > Math.sin(40 / 100) ? 110 : 100);
    const u = v(0, 1, 0);
    expect(groundAhead(step, u, v(0, 0, 10), heading, 100)).toBe(100);
    expect(groundAhead(step, u, v(0, 0, 60), heading, 100)).toBe(110);
  });
});

describe('climbStep', () => {
  it('rises quicker than it sinks and approaches the target', () => {
    const up = climbStep(100, 110, 0, 0.1) - 100;
    const down = 110 - climbStep(110, 100, 0, 0.1);
    expect(up).toBeGreaterThan(down);
    let r = 100;
    for (let i = 0; i < 300; i++) r = climbStep(r, 110, 0, 1 / 60);
    expect(r).toBeCloseTo(110, 3);
  });

  it('never goes below the floor', () => {
    expect(climbStep(110, 100, 109, 1)).toBe(109);
  });

  it('keeps clear of a slope climbed at speed (the ship tracks a ramp within its clearance)', () => {
    // Fly 60 units/s over ground rising 0.5 per unit, with the look-ahead feeding the goal.
    const ramp = (x: number): number => 100 + 0.5 * Math.max(0, x);
    const height: GroundHeight = (d) => ramp(d.x * 100);
    const u = v(0, 0, 1);
    let r = 103;
    let worst = Infinity;
    for (let t = 0; t < 4; t += 1 / 60) {
      const x = -30 + 60 * t;
      u.set(x / 100, 0, 1).normalize();
      const ground = groundAhead(height, u, v(60, 0, 0), v(1, 0, 0), 100);
      const goal = flightRadius(103, 100, ground, 1);
      r = climbStep(r, goal, height(u) + groundParams.minClearance, 1 / 60);
      worst = Math.min(worst, r - height(u));
    }
    // Without the look-ahead it sinks to the hard floor (1.2) on the ramp; with it, it keeps most of its 3 units.
    expect(worst).toBeGreaterThan(2.5);
  });
});

describe('groundHit', () => {
  const out = new THREE.Vector3();
  const flat: GroundHeight = () => R;

  it('hits a plain sphere where the geometry says', () => {
    const ray = new THREE.Ray(v(300, 0, 0), v(-1, 0, 0));
    expect(groundHit(ray, flat, R, out)).toBeCloseTo(200, 3);
    expect(out.x).toBeCloseTo(R, 3);
  });

  it('misses past the limb', () => {
    expect(groundHit(new THREE.Ray(v(300, 150, 0), v(-1, 0, 0)), flat, R + 20, out)).toBeNull();
    expect(groundHit(new THREE.Ray(v(300, 0, 0), v(1, 0, 0)), flat, R + 20, out)).toBeNull();
  });

  it('hits the hillside, not the sea-level sphere behind it', () => {
    // Looking down on the bump's flank from the side, above the plain.
    const ray = new THREE.Ray(v(R + 60, 30, 0), v(-0.35, -0.2, 0).normalize());
    const t = groundHit(ray, bump, R + 20, out);
    expect(t).not.toBeNull();
    expect(out.length()).toBeCloseTo(bump(out.clone().normalize()), 2);
    // It is above the sphere: a ray against sea level would have hit lower.
    expect(out.length()).toBeGreaterThan(R + 1);
  });

  it('starts from inside the shell (a low camera)', () => {
    const ray = new THREE.Ray(v(R + 10, 0, 0), v(-1, 0, 0));
    expect(groundHit(ray, flat, R + 20, out)).toBeCloseTo(10, 2);
  });

  it('finds the point on the real terrain a ray was aimed at', () => {
    const style: PlanetStyle = { low: '#335522', high: '#bbbbaa', sea: null, seaLevel: 0, relief: 0.1 } as PlanetStyle;
    const radius = globeRadius(4);
    const sample = terrainSampler(radius, 7, style, { noise: detailedTerrain, reliefScale: RELIEF_SCALE, seaFloor: false });
    const color = new THREE.Color();
    const height: GroundHeight = (d) => sample(d, color);
    const top = peakRadius(radius, style, RELIEF_SCALE);
    const dir = v(0.2, 0.9, -0.4).normalize();
    const target = dir.clone().multiplyScalar(height(dir));
    // Aim from 60 units above and 40 sideways.
    const origin = target.clone().add(dir.clone().multiplyScalar(60)).add(v(40, 0, 0));
    const ray = new THREE.Ray(origin, target.clone().sub(origin).normalize());
    const t = groundHit(ray, height, top, out);
    expect(t).not.toBeNull();
    // The first surface along the ray is the target or something in front of it: never beyond it.
    expect(t!).toBeLessThanOrEqual(target.distanceTo(origin) + 0.1);
    expect(out.length()).toBeCloseTo(height(out.clone().normalize()), 2);
  });
});

describe('obstacleClearance', () => {
  const lift = HULL_DEPTH + groundParams.obstacleMargin;
  // A tree at +Y on a ball of radius 100: 2 wide (radius), its top 10 above the ground.
  const tree = [0, 1, 0, 2, 110] as const;
  const clear = (from: THREE.Vector3, to: THREE.Vector3) => obstacleClearance(...tree, from.normalize(), to.normalize());

  it('keeps the hull its depth and the margin over the top when right over it', () => {
    expect(clear(v(0, 1, 0), v(0, 1, 0))).toBeCloseTo(110 + lift);
  });

  it('lets the hull come lower near its rim, and ignores it once past the rim', () => {
    const at = (x: number) => clear(v(x / 110, 1, 0), v(x / 110, 1, 0));
    // Within the crown, still the full depth; between the crown's edge and the rim, less and less.
    expect(at(1.9)).toBeCloseTo(110 + lift, 1);
    expect(at(2 + HULL_RADIUS * 0.5)).toBeLessThan(110 + lift);
    expect(at(2 + HULL_RADIUS * 0.5)).toBeGreaterThan(110 + groundParams.obstacleMargin);
    expect(at(2 + HULL_RADIUS + 0.05)).toBe(-Infinity);
  });

  it('counts a tree anywhere along the stretch, not just at its ends', () => {
    // From 10 units one side of the tree to 10 units the other.
    expect(clear(v(-0.1, 1, 0), v(0.1, 1, 0))).toBeCloseTo(110 + lift, 1);
    // A stretch passing well beside it.
    expect(clear(v(-0.1, 1, 0.1), v(0.1, 1, 0.1))).toBe(-Infinity);
  });
});

describe('aheadDirection', () => {
  it('reaches the footprint ahead along the heading when still, and further along the velocity when moving', () => {
    const u = v(0, 1, 0);
    const out = v(0, 0, 0);
    aheadDirection(u, v(0, 0, 0), v(0, 0, 1), 100, 1, out);
    expect(out.angleTo(u) * 100).toBeCloseTo(groundParams.footprint);
    expect(out.z).toBeGreaterThan(0);
    aheadDirection(u, v(-20, 0, 0), v(0, 0, 1), 100, 1, out);
    expect(out.angleTo(u) * 100).toBeCloseTo(groundParams.footprint + 20 * groundParams.lookAhead);
    expect(out.x).toBeLessThan(0);
  });
});

describe('PlanetShip over obstacles', () => {
  const debug = { folder: () => undefined } as unknown as Debug;
  const input = { isDown: () => false, axis: () => 0 } as unknown as Input;
  const camera = new THREE.PerspectiveCamera();
  const flat: GroundHeight = () => R;
  // A line of tall trees across its way, at +Z of the start.
  const trees: [number, number, number, number, number][] = [];
  for (let k = -3; k <= 3; k++) {
    const d = v(k * 0.04, 1, 0.3).normalize();
    trees.push([d.x, d.y, d.z, 3, R + 12]);
  }
  const obstacles: Obstacles = {
    clearAlong: (from, to, atLeast) => trees.reduce((best, t) => Math.max(best, obstacleClearance(...t, from, to)), atLeast),
  };

  it('rises over trees in its way and never brings its hull into them, then sinks back', () => {
    const ship = new PlanetShip(new THREE.Scene(), input, camera, debug, R + 3, v(0, 1, 0), 1, { height: flat, top: R, obstacles });
    ship.setRadius(R + 3, 1);
    ship.placeAt(v(0, 1, 0));
    ship.moveTo(v(0, 1, 0.6));
    const dt = 1 / 60;
    let highest = 0;
    for (let i = 0; i < 60 * 8; i++) {
      ship.fixedUpdate(dt);
      const u = ship.direction;
      // What the hull needs right where it is.
      const need = obstacles.clearAlong(u, u, -Infinity);
      expect(ship.radius).toBeGreaterThanOrEqual(need - 0.05);
      highest = Math.max(highest, ship.radius);
    }
    expect(highest).toBeGreaterThan(R + 12 + HULL_DEPTH);
    // Well past the trees, back down at the zoom's altitude.
    expect(ship.direction.angleTo(v(0, 1, 0.6).normalize())).toBeLessThan(0.01);
    expect(ship.radius).toBeCloseTo(R + 3, 1);
  });

  it('flies through them with collisions off', () => {
    groundParams.collide = false;
    try {
      const ship = new PlanetShip(new THREE.Scene(), input, camera, debug, R + 3, v(0, 1, 0), 1, { height: flat, top: R, obstacles });
      ship.setRadius(R + 3, 1);
      ship.placeAt(trees[3]!.length ? v(trees[3]![0], trees[3]![1], trees[3]![2]) : v(0, 1, 0));
      expect(ship.radius).toBeCloseTo(R + 3);
    } finally {
      groundParams.collide = true;
    }
  });
});
