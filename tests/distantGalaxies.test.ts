import { describe, expect, it } from 'vitest';
import {
  DISTANT_GALAXY_COUNT,
  generateDistantGalaxies,
  LARGE_SIZE,
  SMALL_SIZE,
  type DistantGalaxyKind,
} from '../src/gen/distantGalaxies';

describe('generateDistantGalaxies', () => {
  const galaxies = generateDistantGalaxies(1337);

  it('is deterministic per galaxy seed', () => {
    expect(generateDistantGalaxies(1337)).toEqual(galaxies);
    expect(generateDistantGalaxies(1338)).not.toEqual(galaxies);
  });

  it('makes ~200 galaxies on unit directions spread over the whole sky', () => {
    expect(galaxies).toHaveLength(DISTANT_GALAXY_COUNT);
    const mean = { x: 0, y: 0, z: 0 };
    for (const g of galaxies) {
      const { x, y, z } = g.direction;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
      mean.x += x / galaxies.length;
      mean.y += y / galaxies.length;
      mean.z += z / galaxies.length;
    }
    // Isotropic: the mean direction is near zero (≈ 1/√(3n) per axis ≈ 0.04).
    expect(Math.hypot(mean.x, mean.y, mean.z)).toBeLessThan(0.2);
    // Both hemispheres.
    expect(galaxies.filter((g) => g.direction.y > 0).length).toBeGreaterThan(70);
    expect(galaxies.filter((g) => g.direction.y < 0).length).toBeGreaterThan(70);
  });

  it('is mostly small and faint, with one or two large ones', () => {
    const large = galaxies.filter((g) => g.size >= LARGE_SIZE[0]);
    expect(large.length).toBeGreaterThanOrEqual(1);
    expect(large.length).toBeLessThanOrEqual(2);
    for (const g of large) expect(g.size).toBeLessThanOrEqual(LARGE_SIZE[1]);
    const small = galaxies.filter((g) => g.size < LARGE_SIZE[0]);
    for (const g of small) {
      expect(g.size).toBeGreaterThanOrEqual(SMALL_SIZE[0]);
      expect(g.size).toBeLessThanOrEqual(SMALL_SIZE[1]);
    }
    // Skewed to the small end: most are under ~10 px across (radius ≤ ~0.006 rad).
    expect(small.filter((g) => g.size < 0.006).length / small.length).toBeGreaterThan(0.5);
    for (const g of galaxies) {
      expect(g.brightness).toBeGreaterThan(0);
      expect(g.brightness).toBeLessThanOrEqual(1);
    }
  });

  it('mixes every kind, spirals most common', () => {
    const count = (kind: DistantGalaxyKind) => galaxies.filter((g) => g.kind === kind).length;
    expect(count('spiral')).toBeGreaterThan(count('elliptical'));
    expect(count('elliptical')).toBeGreaterThan(20);
    expect(count('edgeOn')).toBeGreaterThan(15);
    expect(count('irregular')).toBeGreaterThan(8);
    // Edge-on discs are (nearly) edge-on; spirals are seen well enough to show their arms.
    for (const g of galaxies) {
      if (g.kind === 'edgeOn') expect(g.tilt).toBeGreaterThan(1.3);
      if (g.kind === 'spiral') expect(g.tilt).toBeLessThan(1.2);
      expect(g.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
