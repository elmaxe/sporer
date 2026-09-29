import { describe, expect, it } from 'vitest';
import { generateGalaxy } from '../src/gen/galaxy';
import {
  MOON_MAX_FRACTION,
  MOON_RADIUS,
  SIZE_CLASSES,
  SIZE_CLASS_RADIUS,
  choosePlanetType,
  gameRadius,
  type PlanetType,
  type SizeClass,
} from '../src/gen/planets';
import { Rng } from '../src/gen/rng';
import { generateSystem, type PlanetData } from '../src/gen/system';

// See docs/research/body-sizes.md for the sources of these radii.
const EARTH_KM = 12756 / 2;
const km = (radius: number) => gameRadius(radius / EARTH_KM);

const systems = generateGalaxy(1337).stars.slice(0, 1500).map(generateSystem);
const planets = systems.flatMap((s) => s.planets);
const moons = planets.flatMap((p) => p.moons);

function classOf(radius: number): SizeClass | undefined {
  return SIZE_CLASSES.find((c) => radius >= SIZE_CLASS_RADIUS[c][0] && radius < SIZE_CLASS_RADIUS[c][1]);
}

describe('size classes', () => {
  it('put the Solar System bodies in the right class', () => {
    expect(gameRadius(1)).toBe(8);
    const cases: [string, number, SizeClass][] = [
      ['Ceres', 939.4 / 2, 'dwarf'],
      ['Pluto', 2376 / 2, 'dwarf'],
      ['Mercury', 4879 / 2, 'small'],
      ['Mars', 6792 / 2, 'small'],
      ['Venus', 12104 / 2, 'earth'],
      ['Earth', EARTH_KM, 'earth'],
      ['Neptune', 49528 / 2, 'iceGiant'],
      ['Uranus', 51118 / 2, 'iceGiant'],
      ['Saturn', 120536 / 2, 'gasGiant'],
      ['Jupiter', 142984 / 2, 'gasGiant'],
    ];
    for (const [name, radius, size] of cases) expect(classOf(km(radius)), name).toBe(size);
  });

  it('are contiguous, from dwarfs at 2 to inflated Jupiters at ~34', () => {
    expect(SIZE_CLASS_RADIUS.dwarf[0]).toBeCloseTo(2, 5);
    for (let i = 1; i < SIZE_CLASSES.length; i++) {
      expect(SIZE_CLASS_RADIUS[SIZE_CLASSES[i]!][0]).toBe(SIZE_CLASS_RADIUS[SIZE_CLASSES[i - 1]!][1]);
    }
    // 1.6 Jupiter radii.
    expect(SIZE_CLASS_RADIUS.gasGiant[1]).toBeCloseTo(km((142984 / 2) * 1.6), 0);
  });

  it('all appear, in sensible proportions', () => {
    for (const c of SIZE_CLASSES) {
      const share = planets.filter((p) => p.size === c).length / planets.length;
      expect(share, c).toBeGreaterThan(0.08);
      expect(share, c).toBeLessThan(0.3);
    }
  });

  it('draw radii inside the class, weighted towards its small end', () => {
    for (const c of SIZE_CLASSES) {
      const [min, max] = SIZE_CLASS_RADIUS[c];
      const radii = planets.filter((p) => p.size === c).map((p) => p.radius);
      for (const r of radii) expect(classOf(r)).toBe(c);
      // Log-uniform: half fall below the geometric mean, well under the midpoint.
      const below = radii.filter((r) => r < Math.sqrt(min * max)).length / radii.length;
      expect(below).toBeGreaterThan(0.45);
      expect(below).toBeLessThan(0.55);
    }
  });

  it('make a system’s solid worlds clearly differ in size', () => {
    const spreads = systems
      .map((s) => s.planets.filter((p) => p.type !== 'gas').map((p) => p.radius))
      .filter((r) => r.length >= 3)
      .map((r) => Math.max(...r) / Math.min(...r))
      .sort((a, b) => a - b);
    // Median ratio of largest to smallest was 1.75 before size classes.
    expect(spreads[Math.floor(spreads.length / 2)]!).toBeGreaterThan(2.3);
  });

  it('keep giants to about one of each kind per system', () => {
    for (const kind of ['iceGiant', 'gasGiant'] as const) {
      const perSystem = planets.filter((p) => p.size === kind).length / systems.length;
      expect(perSystem, kind).toBeGreaterThan(0.3);
      expect(perSystem, kind).toBeLessThan(1.2);
    }
  });
});

describe('types follow size', () => {
  it('makes giants gas and everything else solid', () => {
    for (const p of planets) expect(p.type === 'gas').toBe(p.size === 'iceGiant' || p.size === 'gasGiant');
  });

  it('makes small worlds barren, icy or volcanic and super-Earths terran or ocean', () => {
    const share = (size: SizeClass, zone: number, types: PlanetType[]) => {
      const rng = new Rng(7);
      let hits = 0;
      for (let i = 0; i < 4000; i++) if (types.includes(choosePlanetType(rng, zone, size))) hits++;
      return hits / 4000;
    };
    const wet: PlanetType[] = ['terran', 'ocean'];
    // Temperate zone.
    expect(share('dwarf', 1, wet)).toBe(0);
    expect(share('dwarf', 1, ['barren'])).toBeGreaterThan(0.85);
    expect(share('small', 1, wet)).toBeLessThan(0.25);
    expect(share('superEarth', 1, wet)).toBeGreaterThan(0.8);
    expect(share('superEarth', 1, ['ocean'])).toBeGreaterThan(share('earth', 1, ['ocean']));
    // Hot and cold zones keep their own types.
    expect(share('dwarf', 0.3, ['lava', 'barren'])).toBeGreaterThan(0.9);
    expect(share('small', 2, ['ice', 'barren'])).toBe(1);

    const smallOnes = planets.filter((p) => p.size === 'dwarf' || p.size === 'small');
    const rugged = smallOnes.filter((p) => ['barren', 'ice', 'lava'].includes(p.type)).length / smallOnes.length;
    expect(rugged).toBeGreaterThan(0.75);
  });

  it('takes exactly one draw for the type, whatever the class', () => {
    for (const size of SIZE_CLASSES) {
      const a = new Rng(99);
      choosePlanetType(a, 1, size);
      const b = new Rng(99);
      b.next();
      expect(a.next()).toBe(b.next());
    }
  });
});

describe('moons', () => {
  it('range from pebbles to bigger than Mercury, never above half their planet', () => {
    for (const p of planets) {
      for (const m of p.moons) {
        expect(m.radius).toBeGreaterThanOrEqual(MOON_RADIUS.min);
        expect(m.radius).toBeLessThanOrEqual(MOON_RADIUS.max);
        expect(m.radius).toBeLessThanOrEqual(p.radius * MOON_MAX_FRACTION + 1e-9);
      }
    }
    expect(Math.min(...moons.map((m) => m.radius))).toBeLessThan(1);
    expect(moons.some((m) => m.radius > km(4879 / 2))).toBe(true);
  });

  it('are big (Moon to Ganymede size) only now and then, and only around big planets', () => {
    // The Moon and Ganymede both fall in the big-moon range.
    for (const r of [1737.4, 2631.2]) {
      expect(km(r)).toBeGreaterThan(MOON_RADIUS.bigMin);
      expect(km(r)).toBeLessThan(MOON_RADIUS.max);
    }
    const hosts = planets.filter((p) => p.moons.some((m) => m.radius >= MOON_RADIUS.bigMin));
    for (const p of hosts) expect(['dwarf', 'small']).not.toContain(p.size);
    const big = moons.filter((m) => m.radius >= MOON_RADIUS.bigMin).length / moons.length;
    expect(big).toBeGreaterThan(0.03);
    expect(big).toBeLessThan(0.15);
    const gasGiants = planets.filter((p) => p.size === 'gasGiant');
    const withBig = gasGiants.filter((p) => hosts.includes(p)).length / gasGiants.length;
    expect(withBig).toBeGreaterThan(0.15);
    expect(withBig).toBeLessThan(0.35);
  });

  it('are more numerous around bigger planets', () => {
    const average = (size: SizeClass) => {
      const ps: PlanetData[] = planets.filter((p) => p.size === size);
      return ps.reduce((n, p) => n + p.moons.length, 0) / ps.length;
    };
    expect(average('dwarf')).toBeLessThan(0.3);
    for (let i = 1; i < SIZE_CLASSES.length; i++) {
      expect(average(SIZE_CLASSES[i]!)).toBeGreaterThan(average(SIZE_CLASSES[i - 1]!));
    }
  });
});
