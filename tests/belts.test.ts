import { describe, expect, it } from 'vitest';
import {
  ASTEROID_CLASS_NAMES,
  KIRKWOOD_GAPS,
  MAIN_BELT_FROM_INNER_PLANET,
  MAIN_BELT_RATIO,
  MAX_SYSTEM_ROCKS,
  MIN_BELT_WIDTH,
  NAMED_RADIUS_KM,
  ROCK_SIZE,
  asteroidClass,
  asteroidRadius,
  beltFraction,
  beltTurns,
  carbonShare,
  describeAsteroid,
  describeBelt,
  generateBelts,
  generateRocks,
  librationTurns,
  rockEye,
  rockPosition,
  rockBounds,
  rocksOutOfReach,
  rockWithin,
  type BeltContext,
  type BeltData,
} from '../src/gen/belts';
import { generateGalaxy } from '../src/gen/galaxy';
import { isGiant } from '../src/gen/planets';
import { Rng } from '../src/gen/rng';
import { MIN_NECK, SHAPE_FLOOR, describeShape, shapeRadius } from '../src/gen/shape';
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
  it('span the main belt from the 4:1 to the 2:1 resonance, starting as far out from the inner planet as from Mars', () => {
    expect(resonance(JUPITER_AU, 2, 1) / resonance(JUPITER_AU, 4, 1)).toBeCloseTo(MAIN_BELT_RATIO, 9);
    expect(resonance(JUPITER_AU, 4, 1) / MARS_AU).toBeCloseTo(MAIN_BELT_FROM_INNER_PLANET, 2);
    // So the game's main belts are as wide for their size as the real one: (3.278 − 2.065) / 2.67 ≈ 0.45.
    for (const { belt } of belts.filter(({ belt }) => belt.kind === 'main')) {
      expect(belt.outer / belt.inner).toBeCloseTo(MAIN_BELT_RATIO, 9);
    }
  });

  it('make room for the main belt: just past the inner planet (by the Mars ratio) and clear of the giant', () => {
    for (const { system, belt } of belts.filter(({ belt }) => belt.kind === 'main')) {
      const g = system.planets.findIndex((p) => isGiant(p.size));
      const inner = system.planets[g - 1];
      if (inner) {
        expect(belt.inner).toBeGreaterThanOrEqual(inner.orbit.radius * MAIN_BELT_FROM_INNER_PLANET - 1e-9);
        expect(belt.inner).toBeGreaterThan(inner.orbit.radius + inner.extent);
      }
      const giant = system.planets[g]!;
      expect(giant.orbit.radius - giant.extent).toBeGreaterThan(belt.outer);
    }
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
      mainBelt: null,
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
    expect(describeShape({ binary: true, lobes: [{}, {}] as never })).toBe('Contact binary: two lobes joined by a neck');
    expect(describeShape({ binary: false, lobes: [{}] as never })).toBe('Irregular rock');
  });
});

describe('scenery rocks', () => {
  // Belts with their rock counts capped, to keep the tests quick.
  const sample = belts.slice(0, 12).map(({ belt }) => {
    const capped = { ...belt, rocks: Math.min(belt.rocks, 3000) };
    return { belt: capped, rocks: generateRocks(capped, new Rng(belt.seed), 4) };
  });

  it('are as many as the belt says (or nearly, after the gaps), inside it, and the same every time', () => {
    for (const { belt, rocks } of sample) {
      expect(rocks.length).toBeGreaterThan(belt.rocks * 0.95);
      expect(rocks.length).toBeLessThanOrEqual(belt.rocks);
      for (const r of rocks) {
        expect(r.radius).toBeGreaterThanOrEqual(belt.inner);
        expect(r.radius).toBeLessThanOrEqual(belt.outer);
        expect(r.size).toBeGreaterThanOrEqual(ROCK_SIZE[0] - 1e-9);
        expect(r.size).toBeLessThanOrEqual(ROCK_SIZE[1] + 1e-9);
        expect(Math.hypot(...r.axis)).toBeCloseTo(1, 9);
      }
      expect(generateRocks(belt, new Rng(belt.seed), 4).slice(0, 100)).toEqual(rocks.slice(0, 100));
    }
  });

  it('thin out in the Kirkwood gaps', () => {
    const main = sample.filter(({ belt }) => belt.kind === 'main');
    expect(main.length).toBeGreaterThan(0);
    let inGap = 0;
    let beside = 0;
    for (const { belt, rocks } of main) {
      for (const r of rocks) {
        const d = Math.abs(beltFraction(belt, r.radius) - KIRKWOOD_GAPS[0].at);
        if (d < 0.01) inGap++;
        else if (d > 0.08 && d < 0.1) beside++;
      }
    }
    // Two bins of 0.02 either side against one of 0.02 in the middle: the gap holds well under half as many.
    expect(inGap).toBeLessThan(beside / 2 / 2);
  });

  it('keep half the real inclinations: the main belt median is about half of 7.15°', () => {
    const incl = sample.filter(({ belt }) => belt.kind === 'main').flatMap(({ rocks }) => rocks.map((r) => (r.inclination * 180) / Math.PI));
    incl.sort((a, b) => a - b);
    const median = incl[Math.floor(incl.length / 2)]!;
    expect(median).toBeGreaterThan(7.15 / 2 - 1);
    expect(median).toBeLessThan(7.15 / 2 + 1);
  });

  it('move as the shader moves them: Kepler rates outwards, Trojans with their host at 60°', () => {
    const p = { x: 0, y: 0, z: 0 };
    for (const { belt, rocks } of sample) {
      for (const r of rocks.slice(0, 50)) {
        rockPosition(r, 0, 0, p);
        expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(r.radius, 6);
        if (belt.trojan) {
          // The rock's longitude against the host's, at a few times: within the libration of ±60°.
          for (const time of [0, 37, 1234]) {
            rockPosition(r, beltTurns(belt, time), librationTurns(belt, time), p);
            const host = belt.trojan.orbit.phase + (2 * Math.PI * time) / belt.trojan.orbit.period;
            const off = Math.atan2(p.z, p.x) - host - belt.trojan.lead;
            const wrapped = Math.atan2(Math.sin(off), Math.cos(off));
            expect(Math.abs(wrapped)).toBeLessThan(belt.trojan.libration + 0.25);
          }
        } else {
          expect(r.rate).toBeCloseTo((belt.inner / r.radius) ** 1.5, 9);
        }
      }
    }
  });

  it('are chosen for meshes exactly as their true distance says, the shortcuts never missing one', () => {
    const rng = new Rng(5);
    const p = { x: 0, y: 0, z: 0 };
    const eye = { x: 0, y: 0, z: 0, distance: 0, radius: 0, turn: 0 };
    let near = 0;
    for (const { belt, rocks } of sample) {
      for (let k = 0; k < 6; k++) {
        const time = rng.range(0, 5000);
        const turns = beltTurns(belt, time);
        const lib = librationTurns(belt, time);
        // An eye beside a random rock, a little off the plane.
        const by = rocks[rng.int(0, rocks.length - 1)]!;
        rockPosition(by, turns, lib, p);
        rockEye({ x: p.x + rng.range(-20, 20), y: p.y + rng.range(-20, 20), z: p.z + rng.range(-20, 20) }, eye);
        const reach = rng.range(20, 300);
        for (const r of rocks) {
          rockPosition(r, turns, lib, p);
          const truth = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) <= reach;
          expect(rockWithin(r, turns, lib, eye, reach, p)).toBe(truth);
          if (truth) near++;
        }
      }
    }
    expect(near).toBeGreaterThan(100);
  });

  it('are never all out of reach while one is in reach (the whole-belt shortcut is safe)', () => {
    const rng = new Rng(9);
    const p = { x: 0, y: 0, z: 0 };
    const eye = { x: 0, y: 0, z: 0, distance: 0, radius: 0, turn: 0 };
    let skipped = 0;
    for (const { belt, rocks } of sample) {
      const bounds = rockBounds(rocks);
      for (let k = 0; k < 20; k++) {
        const time = rng.range(0, 5000);
        const turns = beltTurns(belt, time);
        const lib = librationTurns(belt, time);
        // Anywhere from inside the belt to far beyond it, above or below the plane.
        const angle = rng.range(0, 2 * Math.PI);
        const out = rng.range(0, 2.5) * belt.outer;
        rockEye({ x: Math.cos(angle) * out, y: rng.range(-1, 1) * belt.outer, z: Math.sin(angle) * out }, eye);
        const reach = rng.range(20, 600);
        if (!rocksOutOfReach(bounds, eye, reach)) continue;
        skipped++;
        for (const r of rocks) expect(rockWithin(r, turns, lib, eye, reach, p)).toBe(false);
      }
    }
    expect(skipped).toBeGreaterThan(20);
  });
});
