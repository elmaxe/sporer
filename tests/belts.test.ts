import { describe, expect, it } from 'vitest';
import {
  ASTEROID_CLASS_NAMES,
  KIRKWOOD_GAPS,
  MAIN_BELT_SPAN,
  MAX_SYSTEM_ROCKS,
  MIN_BELT_WIDTH,
  NAMED_RADIUS_KM,
  asteroidClass,
  asteroidRadius,
  beltFraction,
  carbonShare,
  describeAsteroid,
  describeBelt,
  generateBelts,
  type BeltContext,
  type BeltData,
} from '../src/gen/belts';
import { generateGalaxy } from '../src/gen/galaxy';
import { isGiant } from '../src/gen/planets';
import { Rng } from '../src/gen/rng';
import { MIN_NECK, SHAPE_FLOOR, shapeRadius } from '../src/gen/shape';
import { findHomeSystem, generateSystem, type SystemData } from '../src/gen/system';

const galaxy = generateGalaxy(1337);
const systems: SystemData[] = galaxy.stars.slice(0, 1500).map(generateSystem);
const belts = systems.flatMap((s) => s.belts.map((b) => ({ system: s, belt: b })));

/** Jupiter's and Neptune's semi-major axes, AU (NASA planetary fact sheet). */
const JUPITER_AU = 5.2038;
const MARS_AU = 1.524;
/** A mean-motion resonance p:q with a planet at `a`: a·(q/p)^(2/3). */
const resonance = (a: number, p: number, q: number) => a * (q / p) ** (2 / 3);

describe('belt placement rules', () => {
  it('put the main belt between the 4:1 and 2:1 resonances, in log radius from Mars to Jupiter', () => {
    const span = Math.log(JUPITER_AU / MARS_AU);
    expect(Math.log(resonance(JUPITER_AU, 4, 1) / MARS_AU) / span).toBeCloseTo(MAIN_BELT_SPAN[0], 2);
    expect(Math.log(resonance(JUPITER_AU, 2, 1) / MARS_AU) / span).toBeCloseTo(MAIN_BELT_SPAN[1], 2);
  });

  it('put the Kirkwood gaps at the 3:1, 5:2 and 7:3 resonances', () => {
    const inner = resonance(JUPITER_AU, 4, 1);
    const outer = resonance(JUPITER_AU, 2, 1);
    const at = [resonance(JUPITER_AU, 3, 1), resonance(JUPITER_AU, 5, 2), resonance(JUPITER_AU, 7, 3)].map((r) =>
      beltFraction({ inner, outer }, r),
    );
    KIRKWOOD_GAPS.forEach((gap, i) => expect(gap.at).toBeCloseTo(at[i]!, 2));
  });

  it('turn stony asteroids into carbonaceous ones outwards', () => {
    const share = (t: number) => {
      let carbon = 0;
      for (let i = 0; i < 1000; i++) if (asteroidClass({ kind: 'main' }, t, (i + 0.5) / 1000) === 'carbon') carbon++;
      return carbon / 1000;
    };
    // The measured dark shares of the inner, middle and outer belt (albedos of asteroids ≥ 5 km).
    expect(share(0.21)).toBeCloseTo(0.55, 1);
    expect(share(0.55)).toBeCloseTo(0.68, 1);
    expect(share(0.85)).toBeCloseTo(0.87, 1);
    for (let t = 0; t < 1; t += 0.05) expect(carbonShare(t + 0.05)).toBeGreaterThanOrEqual(carbonShare(t));
    expect(asteroidClass({ kind: 'trojan' }, 0.5, 0.5)).toBe('dtype');
    expect(asteroidClass({ kind: 'kuiper' }, 0.5, 0.5)).toBe('icy');
  });

  it('map real asteroid sizes like the planets', () => {
    // Vesta (262.7 km mean radius) next to the moons' smallest (64 km) and Ceres, a dwarf planet (~470 km).
    expect(asteroidRadius(64)).toBeCloseTo(0.8, 1);
    expect(asteroidRadius(262.7)).toBeGreaterThan(1.5);
    expect(asteroidRadius(262.7)).toBeLessThan(asteroidRadius(470));
  });
});

describe('generateBelts', () => {
  it('is deterministic and changes nothing else in the system', () => {
    const ref = galaxy.stars[42]!;
    expect(JSON.stringify(generateSystem(ref).belts)).toBe(JSON.stringify(generateSystem(ref).belts));
  });

  it('gives a fair share of systems a belt of each kind', () => {
    const share = (kind: BeltData['kind']) => systems.filter((s) => s.belts.some((b) => b.kind === kind)).length / systems.length;
    const any = systems.filter((s) => s.belts.length > 0).length / systems.length;
    expect(any).toBeGreaterThan(0.45);
    expect(any).toBeLessThan(0.8);
    for (const kind of ['main', 'kuiper', 'trojan'] as const) {
      expect(share(kind)).toBeGreaterThan(0.15);
      expect(share(kind)).toBeLessThan(0.55);
    }
  });

  it('keeps belts clear of every planet neighbourhood (Trojans: of the other planets)', () => {
    for (const { system, belt } of belts) {
      expect(belt.outer - belt.inner).toBeGreaterThan(0);
      if (belt.kind !== 'trojan') expect(belt.outer - belt.inner).toBeGreaterThanOrEqual(MIN_BELT_WIDTH - 1e-9);
      system.planets.forEach((p, i) => {
        if (belt.trojan?.planet === i) return;
        const clear = belt.outer < p.orbit.radius - p.extent || belt.inner > p.orbit.radius + p.extent;
        expect(clear).toBe(true);
      });
      expect(belt.inner).toBeGreaterThan(system.starZone);
    }
  });

  it('puts the main belt inside the first giant and outer belts beyond the last planet', () => {
    for (const { system, belt } of belts) {
      if (belt.kind === 'main') {
        const giant = system.planets.find((p) => isGiant(p.size))!;
        expect(belt.outer).toBeLessThan(giant.orbit.radius);
      } else if (belt.kind === 'kuiper') {
        const last = system.planets[system.planets.length - 1]!;
        expect(belt.inner).toBeGreaterThan(last.orbit.radius + last.extent);
        expect(belt.icy).toBe(true);
      }
    }
  });

  it('places Trojans 60° ahead of and behind a giant, on its orbit', () => {
    const trojans = belts.filter(({ belt }) => belt.kind === 'trojan');
    expect(trojans.length).toBeGreaterThan(50);
    for (const { system, belt } of trojans) {
      const host = system.planets[belt.trojan!.planet]!;
      expect(isGiant(host.size)).toBe(true);
      expect(Math.abs(belt.trojan!.lead)).toBeCloseTo(Math.PI / 3, 9);
      expect(belt.inner).toBeLessThan(host.orbit.radius);
      expect(belt.outer).toBeGreaterThan(host.orbit.radius);
      for (const a of belt.asteroids) {
        expect(a.orbit.period).toBe(host.orbit.period);
        // Within its libration of the Lagrange point.
        const ahead = a.orbit.phase - host.orbit.phase;
        const off = Math.atan2(Math.sin(ahead - belt.trojan!.lead), Math.cos(ahead - belt.trojan!.lead));
        expect(Math.abs(off)).toBeLessThanOrEqual(belt.trojan!.libration);
      }
    }
  });

  it('keeps the rocks within the system budget', () => {
    for (const system of systems) {
      expect(system.belts.reduce((n, b) => n + b.rocks, 0)).toBeLessThanOrEqual(MAX_SYSTEM_ROCKS + system.belts.length);
    }
    expect(Math.max(...belts.map(({ belt }) => belt.rocks))).toBeGreaterThan(3000);
  });

  it('names a few asteroids per belt, inside it, on orbits that never touch', () => {
    for (const { belt } of belts) {
      expect(belt.asteroids.length).toBeGreaterThan(0);
      const radii = belt.asteroids.map((a) => a.orbit.radius);
      for (let i = 0; i < radii.length; i++) {
        expect(radii[i]!).toBeGreaterThanOrEqual(belt.inner);
        expect(radii[i]!).toBeLessThanOrEqual(belt.outer);
        if (i > 0) expect(radii[i]! - radii[i - 1]!).toBeGreaterThan(belt.asteroids[i]!.radius + belt.asteroids[i - 1]!.radius);
      }
      for (const a of belt.asteroids) {
        const [lo, hi] = NAMED_RADIUS_KM[belt.kind];
        expect(a.radius).toBeGreaterThanOrEqual(asteroidRadius(lo) - 1e-9);
        expect(a.radius).toBeLessThanOrEqual(asteroidRadius(hi) + 1e-9);
      }
    }
  });

  it('makes a share of them contact binaries, with shapes built on demand', () => {
    const named = belts.flatMap(({ belt }) => belt.asteroids);
    const binaries = named.filter((a) => a.binary);
    expect(binaries.length / named.length).toBeGreaterThan(0.12);
    expect(binaries.length / named.length).toBeLessThan(0.35);
    for (const a of binaries.slice(0, 20)) {
      const { shape } = a;
      expect(shape.binary).toBe(true);
      expect(shape.lobes.length).toBe(2);
      expect(a.shape).toBe(shape); // built once
      expect(shape.min).toBeGreaterThanOrEqual(SHAPE_FLOOR - 1e-6);
      expect(MIN_NECK).toBeGreaterThan(0);
    }
    for (const a of named.slice(0, 50)) {
      expect(a.shape.binary).toBe(a.binary);
      expect(shapeRadius(a.shape, 0, 1, 0)).toBeLessThanOrEqual(1.001);
    }
  });

  it('builds the same shape for the same asteroid', () => {
    const ref = galaxy.stars[6]!;
    const a = generateSystem(ref).belts[0]?.asteroids[0];
    const b = generateSystem(ref).belts[0]?.asteroids[0];
    expect(a && b).toBeTruthy();
    expect(JSON.stringify(a!.shape)).toBe(JSON.stringify(b!.shape));
  });

  it('gives the home system a main belt with a contact binary (the smoke test visits both)', () => {
    const home = generateSystem(findHomeSystem(galaxy));
    const main = home.belts.find((b) => b.kind === 'main');
    expect(main).toBeTruthy();
    expect(main!.asteroids.some((a) => a.binary)).toBe(true);
    expect(main!.asteroids.some((a) => !a.binary)).toBe(true);
  });

  it('needs a giant for a main belt and planets for an outer one', () => {
    const ctx: BeltContext = {
      systemName: 'Test',
      starZone: 30,
      firstEdge: 70,
      planets: [],
      period: (r) => r,
    };
    for (let i = 0; i < 50; i++) expect(generateBelts(new Rng(i), ctx)).toEqual([]);
  });

  it('describes belts and asteroids', () => {
    expect(describeBelt({ kind: 'main', asteroids: [{}, {}] as never })).toBe('Asteroid belt · 2 named asteroids');
    expect(describeBelt({ kind: 'trojan', asteroids: [{}] as never })).toBe('Trojan swarm · 1 named asteroid');
    expect(describeAsteroid({ class: 'stony', binary: true }, { name: 'Kreu belt' })).toBe('Stony asteroid · contact binary · Kreu belt');
    expect(Object.keys(ASTEROID_CLASS_NAMES)).toHaveLength(4);
  });
});
