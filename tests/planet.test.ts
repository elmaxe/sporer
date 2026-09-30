import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DETAIL_AMPLITUDE, detailedTerrain, terrainNoise } from '../src/gen/noise';
import {
  EARTH_GLOBE_RADIUS,
  PLANET_SCALE,
  angularRadius,
  bodyFrame,
  globeRadius,
  globeSegments,
  lightDirection,
  localToSystem,
  maxViewDistance,
  skyScale,
  travelScale,
} from '../src/planet/frame';
import { SIZE_CLASS_RADIUS } from '../src/gen/planets';
import { greatCircleDirection, sphereStep, surfaceArriveImpulse } from '../src/planet/surfaceMotion';
import type { ArriveParams } from '../src/player/autopilot';

const DT = 1 / 60;
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Points spread over the unit sphere (Fibonacci lattice). */
function spherePoints(n: number): THREE.Vector3[] {
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    return v(r * Math.cos(a), y, r * Math.sin(a));
  });
}

describe('detailedTerrain', () => {
  const points = spherePoints(4000);

  it('is deterministic and stays within [-1, 1]', () => {
    for (const p of points.slice(0, 200)) {
      const n = detailedTerrain(p.x, p.y, p.z, 42);
      expect(n).toBe(detailedTerrain(p.x, p.y, p.z, 42));
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the large scale of terrainNoise, so continents match the system view', () => {
    for (const seed of [3, 1234, 987654]) {
      let sumDiff = 0;
      let flipped = 0;
      for (const p of points) {
        const base = terrainNoise(p.x, p.y, p.z, seed);
        const detail = detailedTerrain(p.x, p.y, p.z, seed);
        expect(Math.abs(detail - base)).toBeLessThanOrEqual(DETAIL_AMPLITUDE + 1e-9);
        sumDiff += Math.abs(detail - base);
        // Land vs sea at a typical sea level.
        if (base < 0 !== detail < 0) flipped++;
      }
      expect(sumDiff / points.length).toBeLessThan(0.08);
      expect(flipped / points.length).toBeLessThan(0.1);
    }
  });

  it('adds detail: nearby points differ more than in terrainNoise', () => {
    let base = 0;
    let detail = 0;
    const eps = 0.02;
    for (const p of points) {
      const q = p
        .clone()
        .add(v(eps, 0, 0))
        .normalize();
      base += Math.abs(terrainNoise(p.x, p.y, p.z, 7) - terrainNoise(q.x, q.y, q.z, 7));
      detail += Math.abs(detailedTerrain(p.x, p.y, p.z, 7) - detailedTerrain(q.x, q.y, q.z, 7));
    }
    expect(detail).toBeGreaterThan(base * 1.5);
  });
});

describe('great-circle motion', () => {
  const params: ArriveParams = { maxSpeed: 60, accel: 120, gain: 8, damping: 1.2 };
  const radius = 112;

  /** Flies from `start` to `target` like PlanetShip; returns the path's angles to the target. */
  function fly(start: THREE.Vector3, target: THREE.Vector3, seconds: number) {
    const u = start.clone().normalize();
    const vel = new THREE.Vector3();
    const impulse = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const angles: number[] = [];
    let maxDrift = 0;
    for (let i = 0; i < seconds / DT; i++) {
      surfaceArriveImpulse(u, vel, target, radius, params, DT, impulse);
      vel.add(impulse).divideScalar(1 + params.damping * DT);
      sphereStep(u, vel, radius, DT, q);
      u.applyQuaternion(q);
      vel.applyQuaternion(q);
      maxDrift = Math.max(maxDrift, Math.abs(u.length() - 1), Math.abs(vel.dot(u)));
      angles.push(u.angleTo(target));
    }
    return { u, vel, angles, maxDrift };
  }

  it('points along the shortest way round', () => {
    const dir = new THREE.Vector3();
    const angle = greatCircleDirection(v(1, 0, 0), v(0, 0, 1), dir);
    expect(angle).toBeCloseTo(Math.PI / 2);
    expect(dir.distanceTo(v(0, 0, 1))).toBeLessThan(1e-9);
    // 170° away one way is 190° the other: go the short way.
    const target = v(Math.cos(3), Math.sin(3), 0);
    greatCircleDirection(v(1, 0, 0), target, dir);
    expect(dir.y).toBeGreaterThan(0.99);
  });

  it('handles standing on the target and on its antipode', () => {
    const dir = new THREE.Vector3();
    expect(greatCircleDirection(v(0, 1, 0), v(0, 1, 0), dir)).toBe(0);
    expect(dir.length()).toBeCloseTo(1);
    expect(dir.y).toBeCloseTo(0);
    expect(greatCircleDirection(v(0, 1, 0), v(0, -1, 0), dir)).toBeCloseTo(Math.PI);
    expect(dir.length()).toBeCloseTo(1);
    expect(dir.y).toBeCloseTo(0);
  });

  it('stays on the sphere with a tangent velocity and arrives', () => {
    const target = v(-0.3, 0.8, -0.5).normalize();
    const { u, vel, angles, maxDrift } = fly(v(1, 0.2, 0.4), target, 20);
    expect(maxDrift).toBeLessThan(1e-6);
    expect(u.angleTo(target) * radius).toBeLessThan(0.5);
    expect(vel.length()).toBeLessThan(0.5);
    // Never overshoots on the way in: the distance shrinks steadily (up to rounding once there).
    for (let i = 1; i < angles.length; i++) expect(angles[i]!).toBeLessThanOrEqual(angles[i - 1]! + 1e-5);
  });

  it('takes the short way round a nearly antipodal target and never exceeds cruise speed', () => {
    const start = v(1, 0, 0);
    const target = v(Math.cos(3), Math.sin(3), 0);
    const u = start.clone();
    const vel = new THREE.Vector3();
    const impulse = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (let i = 0; i < 25 / DT; i++) {
      surfaceArriveImpulse(u, vel, target, radius, params, DT, impulse);
      vel.add(impulse).divideScalar(1 + params.damping * DT);
      expect(vel.length()).toBeLessThan(params.maxSpeed * 1.05);
      sphereStep(u, vel, radius, DT, q);
      u.applyQuaternion(q);
      vel.applyQuaternion(q);
      // The short way passes through +y, never through -y.
      expect(u.y).toBeGreaterThan(-1e-6);
    }
    expect(u.angleTo(target) * radius).toBeLessThan(0.5);
  });

  it('does not move without velocity', () => {
    const q = sphereStep(v(0, 1, 0), v(0, 0, 0), radius, DT, new THREE.Quaternion());
    expect(q.equals(new THREE.Quaternion())).toBe(true);
  });
});

describe('planet frame and sky mapping', () => {
  const center = v(250, 3, -120);
  const radius = 8;
  const scale = PLANET_SCALE;
  const R = globeRadius(radius);
  const frame = bodyFrame(0.3, 1.1, new THREE.Quaternion());
  const inverse = frame.clone().invert();

  it('maps the planet-level globe onto the system body', () => {
    expect(R).toBe(EARTH_GLOBE_RADIUS);
    const out = new THREE.Vector3();
    expect(localToSystem(v(0, 0, 0), center, frame, scale, out).distanceTo(center)).toBeLessThan(1e-9);
    const onSurface = localToSystem(v(0, 0, R), center, frame, scale, out);
    expect(onSurface.distanceTo(center)).toBeCloseTo(radius);
  });

  it("matches the system view's tilted, spinning surface exactly", () => {
    // Planet.ts: a group tilted about Z holding the surface spun about Y.
    const tiltedGroup = new THREE.Group();
    const surface = new THREE.Object3D();
    tiltedGroup.add(surface);
    tiltedGroup.rotation.z = 0.3;
    surface.rotation.y = 1.1;
    tiltedGroup.updateMatrixWorld();
    const world = surface.getWorldQuaternion(new THREE.Quaternion());
    expect(Math.abs(world.dot(frame))).toBeCloseTo(1, 12);
  });

  it('tilts the spin axis like the system view (tilt about Z)', () => {
    const axis = v(0, 1, 0).applyQuaternion(bodyFrame(0.3, 2, new THREE.Quaternion()));
    expect(axis.distanceTo(v(-Math.sin(0.3), Math.cos(0.3), 0))).toBeLessThan(1e-9);
  });

  it('lights the globe from where the star is in the sky', () => {
    const star = v(0, 0, 0);
    const light = lightDirection(star, center, inverse, new THREE.Vector3());
    expect(light.length()).toBeCloseTo(1);
    // Seen from the planet's centre, the sky camera looks in the system direction
    // frame · light, which must be the direction to the star.
    const skyDirection = light.clone().applyQuaternion(frame);
    expect(skyDirection.distanceTo(star.clone().sub(center).normalize())).toBeLessThan(1e-9);
    // And the lit point of the globe is the side of the system body facing the star.
    const litPoint = localToSystem(
      light.clone().multiplyScalar(R),
      center,
      frame,
      scale,
      new THREE.Vector3(),
    );
    expect(litPoint.distanceTo(star)).toBeCloseTo(center.distanceTo(star) - radius);
  });

  it('keeps true angular sizes, with a minimum for distant bodies', () => {
    expect(angularRadius(10, 20)).toBeCloseTo(Math.PI / 6);
    expect(angularRadius(10, 5)).toBe(Math.PI / 2);
    const minAngle = 0.002;
    // Big enough already: unchanged.
    expect(skyScale(10, 100, minAngle)).toBe(1);
    // Too small: enlarged to exactly the minimum.
    const s = skyScale(5, 3000, minAngle);
    expect(s).toBeGreaterThan(1);
    expect(angularRadius(5 * s, 3000)).toBeCloseTo(minAngle, 9);
  });
});

describe('globe sizes', () => {
  it('keeps every body at its true size relative to the ship: one scale for all', () => {
    expect(globeRadius(8)).toBe(100);
    expect(globeRadius(SIZE_CLASS_RADIUS.dwarf[0])).toBeCloseTo(25, 6);
    expect(globeRadius(SIZE_CLASS_RADIUS.gasGiant[1]) / globeRadius(SIZE_CLASS_RADIUS.dwarf[0])).toBeCloseTo(
      SIZE_CLASS_RADIUS.gasGiant[1] / SIZE_CLASS_RADIUS.dwarf[0],
      9,
    );
  });

  it('gives bigger globes a flatter horizon from the same altitude', () => {
    // The horizon's dip below level, seen from `altitude` above a sphere of radius r.
    const dip = (r: number, altitude: number) => Math.acos(r / (r + altitude));
    const radii = [2, 5, 8, 12, 20, 34].map(globeRadius);
    for (let i = 1; i < radii.length; i++) expect(dip(radii[i]!, 12)).toBeLessThan(dip(radii[i - 1]!, 12));
  });

  it('adds terrain detail with size, within a budget', () => {
    expect(globeSegments(EARTH_GLOBE_RADIUS)).toBe(79);
    expect(globeSegments(10)).toBe(43);
    expect(globeSegments(globeRadius(SIZE_CLASS_RADIUS.superEarth[1]))).toBeLessThanOrEqual(110);
    expect(globeSegments(150)).toBeGreaterThan(79);
    expect(globeSegments(50)).toBeLessThan(79);
  });

  it('speeds up the autopilot on big globes, but not enough to hide the size', () => {
    expect(travelScale(EARTH_GLOBE_RADIUS)).toBe(1);
    expect(travelScale(10)).toBe(0.5);
    // Half way round takes longer the bigger the globe.
    const crossing = (r: number) => (Math.PI * r) / travelScale(r);
    const radii = [2, 3.5, 6, 8, 12, 20, 34].map(globeRadius);
    for (let i = 1; i < radii.length; i++) expect(crossing(radii[i]!)).toBeGreaterThan(crossing(radii[i - 1]!));
  });

  it('pulls the max camera distance in for small globes', () => {
    expect(maxViewDistance(EARTH_GLOBE_RADIUS, 260)).toBe(260);
    expect(maxViewDistance(400, 260)).toBe(260);
    expect(maxViewDistance(50, 260)).toBe(130);
    expect(maxViewDistance(10, 260)).toBe(100);
  });
});
