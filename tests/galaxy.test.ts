import { describe, expect, it } from 'vitest';
import { binaryLayout, galaxyMemberSize, galaxyStarSize } from '../src/galaxy/appearance';
import { pickPoint } from '../src/galaxy/pickPoint';
import { generateDust, generateGalaxy, type StarRef } from '../src/gen/galaxy';
import type { StarData, StarKind } from '../src/gen/stars';

describe('galaxyStarSize', () => {
  const galaxy = generateGalaxy(1337, 1500);
  const single = (kind: StarKind) => galaxy.stars.filter((s) => s.stars.length === 1 && s.stars[0]!.kind === kind);
  const avg = (refs: StarRef[]) => refs.reduce((t, r) => t + galaxyStarSize(r), 0) / refs.length;

  it('orders giants above main-sequence stars above dwarfs', () => {
    expect(avg(single('redGiant'))).toBeGreaterThan(avg(single('mainSequence')));
    expect(avg(single('mainSequence'))).toBeGreaterThan(avg(single('redDwarf')));
    expect(avg(single('redDwarf'))).toBeGreaterThan(avg(single('whiteDwarf')));
  });

  it('keeps every dot small next to the ~25-unit spacing between stars', () => {
    for (const s of galaxy.stars) {
      for (const star of s.stars) {
        expect(galaxyMemberSize(star)).toBeGreaterThan(0.5);
        expect(galaxyMemberSize(star)).toBeLessThan(4);
      }
      // A binary's pair, wherever it is in its turn (a giant with a light companion is the widest).
      expect(galaxyStarSize(s)).toBeLessThan(6);
    }
  });
});

describe('binaryLayout', () => {
  const galaxy = generateGalaxy(1337, 1500);
  const binaries = galaxy.stars.filter((s) => s.stars.length === 2);

  it('lays out binaries only', () => {
    expect(binaries.length).toBeGreaterThan(100);
    for (const s of galaxy.stars) expect(binaryLayout(s) === null).toBe(s.stars.length === 1);
  });

  it('separates the two dots with a gap, the heavier one nearer the centre of mass', () => {
    for (const s of binaries) {
      const { offsets, speed, phase } = binaryLayout(s)!;
      const [a, b] = s.stars as [StarData, StarData];
      const gap = offsets[0] + offsets[1] - (galaxyMemberSize(a) + galaxyMemberSize(b)) / 2;
      expect(gap).toBeGreaterThan(0.1);
      expect(offsets[0] * a.mass).toBeCloseTo(offsets[1] * b.mass, 9);
      // One slow turn every 30–90 s.
      expect((Math.PI * 2) / speed).toBeGreaterThanOrEqual(30);
      expect((Math.PI * 2) / speed).toBeLessThanOrEqual(90);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThanOrEqual(Math.PI * 2);
      // The marker ring's size covers both dots.
      expect(galaxyStarSize(s)).toBeGreaterThanOrEqual(2 * offsets[1] + galaxyMemberSize(b) - 1e-9);
    }
  });

  it('is deterministic', () => {
    expect(binaries.map(binaryLayout)).toEqual(binaries.map(binaryLayout));
  });
});

describe('pickPoint', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const forward = { x: 0, y: 0, z: -1 };
  // A: slightly off-axis near, B: on-axis far, C: behind the origin.
  const points = [1, 0, -10, 0, 0.5, -100, 0, 0, 10];

  it('picks the point closest to the ray in angle, not distance', () => {
    expect(pickPoint(origin, forward, points, 0.2)).toBe(1);
  });

  it('ignores points outside the angle and behind the origin', () => {
    expect(pickPoint(origin, { x: 0, y: 0, z: 1 }, points, 0.2)).toBe(2);
    expect(pickPoint(origin, forward, points.slice(0, 3), 0.05)).toBe(-1);
  });

  it('picks stars of a rotated galaxy from a ray taken into its local frame', () => {
    // Galaxy points in local coordinates; the galaxy is turned about +Y by `angle`.
    const galaxy = generateGalaxy(1337, 300);
    const local = new Float32Array(galaxy.stars.flatMap((s) => [s.position.x, s.position.y, s.position.z]));
    const angle = 1.1;
    // Rotation about +Y (three.js convention): (x, z) → (x cos + z sin, −x sin + z cos).
    const rotate = (v: { x: number; y: number; z: number }, a: number) => ({
      x: v.x * Math.cos(a) + v.z * Math.sin(a),
      y: v.y,
      z: -v.x * Math.sin(a) + v.z * Math.cos(a),
    });
    const eye = { x: 40, y: 300, z: 900 };
    for (const target of [galaxy.stars[5]!, galaxy.stars[123]!, galaxy.stars[250]!]) {
      // Aim a world-space ray at where the star appears after the turn...
      const seen = rotate(target.position, angle);
      const len = Math.hypot(seen.x - eye.x, seen.y - eye.y, seen.z - eye.z);
      const dir = { x: (seen.x - eye.x) / len, y: (seen.y - eye.y) / len, z: (seen.z - eye.z) / len };
      // ...then undo the turn on the ray, as GalaxyPicker does with the root's inverse matrix.
      const hit = pickPoint(rotate(eye, -angle), rotate(dir, -angle), local, 1e-4);
      expect(hit).toBe(target.id);
      // Without undoing it, the ray misses (the star isn't where the ray points in local space).
      expect(pickPoint(eye, dir, local, 1e-4)).not.toBe(target.id);
    }
  });
});

describe('generateDust', () => {
  const galaxy = generateGalaxy(1337, 10);

  it('is deterministic', () => {
    expect(generateDust(galaxy, 50)).toEqual(generateDust(galaxy, 50));
  });

  it('concentrates along the spiral arms', () => {
    // Angular distance from the nearest arm's centreline at the cloud's radius
    // (the inverse of armPosition's layout).
    const offArm = (p: { x: number; z: number }) => {
      const t = (Math.hypot(p.x, p.z) / galaxy.radius - 0.08) / 0.92;
      let best = Infinity;
      for (let arm = 0; arm < galaxy.arms; arm++) {
        const centre = galaxy.armOffset + (arm / galaxy.arms) * Math.PI * 2 + t * galaxy.twist;
        const diff = Math.atan2(Math.sin(Math.atan2(p.z, p.x) - centre), Math.cos(Math.atan2(p.z, p.x) - centre));
        best = Math.min(best, Math.abs(diff));
      }
      return best;
    };
    const dust = generateDust(galaxy, 1000);
    const near = dust.filter((c) => offArm(c.position) < 0.5).length / dust.length;
    // Uniformly scattered clouds would give arms / π ≈ 0.3–0.6; arm dust is ~90%.
    expect(near).toBeGreaterThan(0.8);
    for (const c of dust) expect(Math.abs(c.position.y)).toBeLessThan(galaxy.radius * 0.15);
  });

  it('shapes clouds as flat ellipsoids lying along their arm', () => {
    const dust = generateDust(galaxy, 500);
    const t = { x: 0, z: 0 };
    let aligned = 0;
    for (const c of dust) {
      expect(c.length).toBeGreaterThan(c.width);
      expect(c.width).toBeGreaterThan(c.thickness);
      // Direction of the arm here, from two nearby points on the same arm curve.
      const theta = Math.atan2(c.position.z, c.position.x);
      const d = Math.hypot(c.position.x, c.position.z);
      const dt = 0.001;
      t.x = (d + 0.92 * galaxy.radius * dt) * Math.cos(theta + galaxy.twist * dt) - c.position.x;
      t.z = (d + 0.92 * galaxy.radius * dt) * Math.sin(theta + galaxy.twist * dt) - c.position.z;
      // The cloud's long axis (rotation about +Y maps +X to (cos, 0, -sin)).
      const ax = Math.cos(c.angle);
      const az = -Math.sin(c.angle);
      const cos = (ax * t.x + az * t.z) / Math.hypot(t.x, t.z);
      if (cos > Math.cos(0.5)) aligned++;
    }
    expect(aligned / dust.length).toBeGreaterThan(0.9);
  });
});
