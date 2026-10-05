import { describe, expect, it } from 'vitest';
import {
  BLACK_HOLES_PER_STAR,
  BLACK_HOLE_MASS,
  DISC_LIGHT,
  DISC_OUTER,
  DISC_PEAK,
  ISCO,
  SHADOW_RADIUS,
  blackHoleStar,
  canBeBlackHole,
  deflection,
  discLuminosity,
  discPeakTemperature,
  discTemperatureShare,
  gravitationalShift,
  isBlackHole,
  lensReach,
  nearestClass,
  orbitalSpeed,
  schwarzschildRadius,
  starReach,
} from '../src/gen/blackHoles';
import { generateGalaxy, solRef } from '../src/gen/galaxy';
import { perihelion } from '../src/gen/orbit';
import { hashSeed } from '../src/gen/rng';
import { findHomeSystem, generateSystem } from '../src/gen/system';
import { decodeStarLab, encodeStarLab, loadLabStars, rerollLook, sanitizeStar, DEFAULT_STAR_VIEW, derived } from '../src/starlab/labStars';

describe('light past a black hole', () => {
  it('falls in inside the shadow, 3√3/2 r_s, and escapes outside it', () => {
    expect(SHADOW_RADIUS).toBeCloseTo(2.598, 3);
    // The view's step (RAY_STEP) puts the edge within 0.3% (docs/research/black-holes.md).
    expect(deflection(SHADOW_RADIUS * 0.99)).toBeNull();
    expect(deflection(SHADOW_RADIUS * 1.01)).not.toBeNull();
    expect(deflection(2)).toBeNull();
  });

  it("bends as Einstein's 2 r_s / b far out, plus the second-order 15π/16 (r_s / b)²", () => {
    for (const b of [20, 50, 100]) {
      const traced = deflection(b)!;
      // Within 1% (higher orders) from b = 20 on: what the view uses for rays passing outside the disc.
      expect(Math.abs(traced / (2 / b + (15 * Math.PI) / (16 * b * b)) - 1)).toBeLessThan(0.01);
      expect(traced / (2 / b)).toBeGreaterThan(1);
    }
    // Close in it bends far more than the weak-field formula: past 90° at b = 3.
    expect(deflection(3)!).toBeGreaterThan(Math.PI / 2);
  });

  it('reproduces the Sun bending starlight by 1.75″', () => {
    // r_s of the Sun 2953.25 m, its radius 695,700 km: the grazing deflection 2 r_s / R.
    const b = 695_700e3 / 2953.25;
    expect(((2 / b) * 180 * 3600) / Math.PI).toBeCloseTo(1.75, 2);
  });
});

describe('the accretion disc', () => {
  it('is hottest at 49/36 of its inner edge, cold at the edge itself', () => {
    expect(discTemperatureShare(ISCO * DISC_PEAK)).toBeCloseTo(1, 6);
    expect(discTemperatureShare(ISCO)).toBe(0);
    expect(discTemperatureShare(ISCO * 1.2)).toBeLessThan(1);
    expect(discTemperatureShare(ISCO * 1.6)).toBeLessThan(1);
    // T ∝ r^-3/4 far out.
    const far = discTemperatureShare(300) / discTemperatureShare(600);
    expect(far).toBeCloseTo(2 ** 0.75, 1);
  });

  it('gives off (4π/3) r_in² σT*⁴ from both faces, DISC_LIGHT times a sphere at its peak', () => {
    // Numerically: ∫ 2 · 2πx · x⁻³(1 − x^-½) dx from 1 out, over 4π · max of the profile.
    let total = 0;
    for (let x = 1; x < 20000; x += 0.01) total += 4 * Math.PI * x * x ** -3 * (1 - x ** -0.5) * 0.01;
    expect(total).toBeCloseTo((4 * Math.PI) / 3, 2);
    const peak = DISC_PEAK ** -3 * (1 - DISC_PEAK ** -0.5);
    expect(DISC_LIGHT).toBeCloseTo(total / (4 * Math.PI * peak), 2);
  });

  it('is cooler round heavier holes and hotter when fed faster, T ∝ (ṁ / M)^¼', () => {
    expect(discPeakTemperature(20, 0.5) / discPeakTemperature(10, 0.5)).toBeCloseTo(2 ** -0.25, 6);
    expect(discPeakTemperature(10, 1) / discPeakTemperature(10, 0.1)).toBeCloseTo(10 ** 0.25, 6);
  });

  it('orbits at half the speed of light at its inner edge, and its light is reddened by gravity', () => {
    expect(orbitalSpeed(ISCO)).toBeCloseTo(0.5, 6);
    expect(orbitalSpeed(10)).toBeLessThan(orbitalSpeed(ISCO));
    expect(gravitationalShift(ISCO)).toBeCloseTo(Math.sqrt(2 / 3), 6);
  });

  it('lights its system like a star: luminosity ∝ M ṁ, a class for its light', () => {
    const a = blackHoleStar(10, { outer: 14, feeding: 0.5, turn: 1 });
    const b = blackHoleStar(20, { outer: 14, feeding: 0.5, turn: 1 });
    expect(b.luminosity / a.luminosity).toBeCloseTo(2, 6);
    expect(discLuminosity(1, 5772)).toBeGreaterThan(0);
    expect(nearestClass(5772)).toBe('G');
    expect(nearestClass(4000)).toBe('K');
    expect(nearestClass(30000)).toBe('B');
    expect(a.kind).toBe('blackHole');
    expect(a.radius / schwarzschildRadius(a)).toBeCloseTo(SHADOW_RADIUS, 9);
    expect(a.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('black holes in the galaxy', () => {
  const galaxy = generateGalaxy(1337);
  const holes = galaxy.stars.filter((s) => isBlackHole(s.stars[0]!));
  const hosts = new Map(galaxy.nebulas.map((n) => [n.star, n.kind] as const));

  it('are a rare, deterministic few: about one star in a thousand', () => {
    expect(holes.length).toBe(Math.round(galaxy.stars.length * BLACK_HOLES_PER_STAR));
    expect(generateGalaxy(1337).stars.filter((s) => isBlackHole(s.stars[0]!)).map((s) => s.id)).toEqual(holes.map((s) => s.id));
    for (const seed of [1, 2, 3]) expect(generateGalaxy(seed).stars.filter((s) => isBlackHole(s.stars[0]!)).length).toBe(4);
  });

  it('one sits in a supernova remnant, never Sol, a young star or the home system', () => {
    expect(holes.some((s) => s.nebula?.kind === 'remnant' && hosts.get(s.id) === 'remnant')).toBe(true);
    const home = findHomeSystem(galaxy);
    for (const s of holes) {
      expect(s.real).toBeUndefined();
      expect(s.young).toBeUndefined();
      expect(s.id).not.toBe(home.id);
      expect(s.stars).toHaveLength(1);
      expect(canBeBlackHole({ ...s, stars: [{ ...s.stars[0]!, kind: 'redDwarf' }] }, hosts)).toBe(true);
    }
    expect(solRef(galaxy)).toBeDefined();
    expect(isBlackHole(home.stars[0]!)).toBe(false);
  });

  it('keep their place, id, name and seed', () => {
    for (const s of holes) expect(s.seed).toBe(hashSeed(1337, 'system', s.id));
    const before = generateGalaxy(1337);
    expect(before.stars.map((s) => s.name)).toEqual(galaxy.stars.map((s) => s.name));
  });

  it('have masses, discs and light in their ranges', () => {
    for (const s of holes) {
      const h = s.stars[0]!;
      expect(h.mass).toBeGreaterThanOrEqual(BLACK_HOLE_MASS[0]);
      expect(h.mass).toBeLessThanOrEqual(BLACK_HOLE_MASS[1]);
      expect(h.disc!.outer).toBeGreaterThanOrEqual(DISC_OUTER[0]);
      expect(h.disc!.outer).toBeLessThanOrEqual(DISC_OUTER[1]);
      expect(h.luminosity).toBeGreaterThan(0.05);
      expect(h.luminosity).toBeLessThan(10);
    }
  });

  it('their planets orbit clear of the disc and the bent light, with no debris disc', () => {
    for (const ref of holes) {
      const system = generateSystem(ref);
      const hole = system.stars[0]!;
      expect(system.starZone).toBeCloseTo(starReach(hole), 6);
      expect(starReach(hole)).toBeCloseTo(lensReach(hole.disc!) * schwarzschildRadius(hole), 6);
      expect(system.dust).toBeNull();
      for (const p of system.planets) expect(p.orbit.radius - p.extent).toBeGreaterThan(system.starZone);
      for (const c of system.comets) expect(perihelion(c.orbit)).toBeGreaterThan(system.starZone);
    }
  });
});

describe('black holes in the star lab', () => {
  it('load from the game and survive a link', () => {
    const galaxy = generateGalaxy(1337);
    const hole = galaxy.stars.find((s) => isBlackHole(s.stars[0]!))!;
    const state = loadLabStars('1337', hole.id)!;
    expect(state.stars[0]!.kind).toBe('blackHole');
    const back = decodeStarLab(encodeStarLab({ ...state, view: DEFAULT_STAR_VIEW }))!;
    expect(back.stars[0]!.disc).toEqual(state.stars[0]!.disc);
    expect(back.stars[0]!.mass).toBeCloseTo(state.stars[0]!.mass, 9);
    expect(back.stars[0]!.radius).toBeCloseTo(state.stars[0]!.radius, 9);
  });

  it('work out their size and light again from mass and disc, and reroll another disc', () => {
    const hole = sanitizeStar({ kind: 'blackHole', mass: 12, disc: { outer: 15, feeding: 0.4, turn: -1 } });
    expect(hole.disc).toEqual({ outer: 15, feeding: 0.4, turn: -1 });
    const heavier = derived({ ...hole, mass: 24 });
    expect(heavier.radius).toBeCloseTo(hole.radius * 2, 9);
    const other = rerollLook(hole, 7);
    expect(other.mass).toBe(hole.mass);
    expect(other.disc).not.toEqual(hole.disc);
  });
});
