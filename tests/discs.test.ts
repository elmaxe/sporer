import { describe, expect, it } from 'vitest';
import {
  COLD_BELT_AU,
  DEBRIS_SHARE,
  DISC_ALPHA,
  YOUNG_PER_STAR,
  canBeYoung,
  debrisChance,
  dustDensity,
  gapHalfWidth,
  gasAspect,
  type DustDiscData,
} from '../src/gen/discs';
import { generateGalaxy, solRef } from '../src/gen/galaxy';
import { MIN_GAP_RADII, findHomeSystem, generateSystem, systemExtent } from '../src/gen/system';

const galaxy = generateGalaxy(1337);
const young = galaxy.stars.filter((s) => s.young);

describe('young stars', () => {
  it('are a deterministic handful, most of them in nebulas', () => {
    expect(young.length).toBe(Math.round(galaxy.stars.length * YOUNG_PER_STAR));
    expect(young.filter((s) => s.nebula).length).toBeGreaterThanOrEqual(young.length / 2);
    expect(generateGalaxy(1337).stars.filter((s) => s.young).map((s) => s.id)).toEqual(young.map((s) => s.id));
    // Other galaxies have theirs too.
    for (const seed of [1, 2, 3]) expect(generateGalaxy(seed).stars.filter((s) => s.young).length).toBeGreaterThan(3);
  });

  it('are main-sequence stars (no O) and red dwarfs, never Sol or the home system', () => {
    for (const s of young) expect(canBeYoung(s)).toBe(true);
    expect(solRef(galaxy)!.young).toBeUndefined();
    expect(findHomeSystem(galaxy).young).toBeUndefined();
    expect(canBeYoung({ stars: [{ ...young[0]!.stars[0]!, kind: 'redGiant' }] })).toBe(false);
    expect(canBeYoung({ stars: [{ ...young[0]!.stars[0]!, kind: 'mainSequence', spectralClass: 'O' }] })).toBe(false);
  });

  it('wrap their star in a protoplanetary disc with its planets forming in the gaps', () => {
    let planets = 0;
    for (const ref of young) {
      const system = generateSystem(ref);
      const disc = system.dust!;
      expect(disc.kind).toBe('protoplanetary');
      expect(disc.inner).toBeGreaterThan(system.starZone);
      expect(disc.outer).toBeGreaterThan(disc.inner * 5);
      expect(system.comets).toEqual([]);
      expect(system.belts).toEqual([]);
      expect(disc.gaps.length).toBe(system.planets.length);
      expect(system.planets.length).toBeLessThanOrEqual(3);
      let clear = disc.inner;
      system.planets.forEach((p, i) => {
        const gap = disc.gaps[i]!;
        expect(p.orbit.radius).toBe(gap.at);
        expect(gap.width).toBeGreaterThanOrEqual(p.radius * MIN_GAP_RADII);
        // In order, apart, and each gap's ring inside the disc.
        expect(gap.at - gap.width).toBeGreaterThanOrEqual(clear);
        expect(disc.rings[i]!.at + disc.rings[i]!.width).toBeLessThanOrEqual(disc.outer);
        clear = disc.rings[i]!.at + disc.rings[i]!.width;
        expect(['lava', 'gas']).toContain(p.type);
        expect(p.moons).toEqual([]);
        // Giants beyond the snow line, molten rocky bodies inside it.
        expect(dustDensity(disc, gap.at)).toBeLessThan(dustDensity({ ...disc, gaps: [] }, gap.at));
      });
      planets += system.planets.length;
    }
    expect(planets).toBeGreaterThanOrEqual(young.length);
  });

  it("carve gaps as Kanagawa et al. 2016's simulations and HL Tau's fits say", () => {
    // Their simulations at h/r 0.05, α 10⁻³: 1 MJ → Δ 0.69 R, 0.3 MJ → 0.39 R (formula within 5%).
    expect(2 * gapHalfWidth(1e-3, 0.05, DISC_ALPHA)).toBeCloseTo(0.69, 0);
    expect(Math.abs(2 * gapHalfWidth(1e-3, 0.05, DISC_ALPHA) - 0.69)).toBeLessThan(0.69 * 0.06);
    expect(Math.abs(2 * gapHalfWidth(3e-4, 0.05, DISC_ALPHA) - 0.39)).toBeLessThan(0.39 * 0.06);
    // HL Tau's 30 AU gap: Δ/R 0.23 at h/r 0.07 → 0.2 MJ.
    expect(Math.abs(2 * gapHalfWidth(0.2 * 9.546e-4, 0.07, DISC_ALPHA) - 0.23)).toBeLessThan(0.03);
    // Chiang & Goldreich's flaring: 0.035 at 1 AU, ~0.09 at 30 AU (PDS 70's model: 0.089 at 22 AU).
    expect(gasAspect(1)).toBeCloseTo(0.035, 6);
    expect(gasAspect(22)).toBeCloseTo(0.085, 2);
  });
});

describe('debris discs', () => {
  const systems = galaxy.stars.slice(0, 1500).filter((s) => !s.young).map(generateSystem);

  it('come in the surveys’ share of systems, none round giants or white dwarfs', () => {
    const expected = systems.reduce((sum, s) => sum + debrisChance(s.stars[0]), 0);
    const found = systems.filter((s) => s.dust).length;
    expect(Math.abs(found - expected)).toBeLessThan(4 * Math.sqrt(expected));
    for (const s of systems) {
      if (!s.dust) continue;
      expect(s.dust.kind).toBe('debris');
      expect(['whiteDwarf', 'redGiant', 'blueGiant']).not.toContain(s.stars[0]!.kind);
    }
    expect(DEBRIS_SHARE.A).toBeGreaterThan(DEBRIS_SHARE.G);
    expect(DEBRIS_SHARE.G).toBeGreaterThan(DEBRIS_SHARE.M);
  });

  it('sit outside the star, reach past the asteroid belt, with any cold belt inside them', () => {
    for (const s of systems) {
      const d = s.dust;
      if (!d) continue;
      expect(d.inner).toBeGreaterThan(s.starZone);
      expect(d.outer).toBeGreaterThan(d.taper);
      expect(d.slope).toBeCloseTo(1.34, 6);
      for (const ring of d.rings) {
        expect(ring.at + 2 * ring.width).toBeLessThanOrEqual(d.outer);
        expect(dustDensity(d, ring.at)).toBeGreaterThan(dustDensity({ ...d, rings: [] }, ring.at) * 2);
      }
    }
    expect(COLD_BELT_AU[0]).toBeGreaterThan(10);
  });

  it("don't change the rest of the system (their own stream)", () => {
    const s = systems.find((x) => x.dust)!;
    expect(systemExtent(s)).toBeGreaterThan(0);
    expect(generateSystem(galaxy.stars[s.id]!)).toEqual(s);
  });

  it('include our own zodiacal cloud in Sol', () => {
    const sol = generateSystem(solRef(galaxy)!);
    expect(sol.dust?.kind).toBe('debris');
    expect(sol.dust!.slope).toBeCloseTo(1.34, 6);
    // Kelsall's fan: the density halves 13.7° off the plane, σ ≈ 0.21 r.
    expect(sol.dust!.aspect).toBeCloseTo(0.244 / Math.sqrt(2 * Math.LN2), 2);
  });

  it('none in a rogue planet’s system', () => {
    for (const r of galaxy.rogues) expect(generateSystem(r).dust).toBeNull();
  });
});

describe('dustDensity', () => {
  const disc: DustDiscData = {
    kind: 'protoplanetary',
    inner: 50,
    outer: 1000,
    slope: 1,
    taper: 700,
    aspect: 0.1,
    flare: 1.25,
    depth: 30,
    gaps: [{ at: 300, width: 30, depth: 0.9 }],
    rings: [{ at: 360, width: 15, boost: 1 }],
    spiral: 0,
    pitch: 0,
    color: '#ffffff',
    seed: 1,
  };

  it('is zero outside the disc and falls off outwards', () => {
    expect(dustDensity(disc, 40)).toBe(0);
    expect(dustDensity(disc, 1001)).toBe(0);
    expect(dustDensity(disc, 100)).toBeGreaterThan(dustDensity(disc, 200));
    expect(dustDensity(disc, 900)).toBeLessThan(dustDensity(disc, 650) * 0.5);
  });

  it('is cleared in a gap and piled up in a ring', () => {
    const smooth = { ...disc, gaps: [], rings: [] };
    expect(dustDensity(disc, 300) / dustDensity(smooth, 300)).toBeCloseTo(0.1, 2);
    expect(dustDensity(disc, 360) / dustDensity(smooth, 360)).toBeGreaterThan(1.9);
  });
});
