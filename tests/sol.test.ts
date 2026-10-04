/// <reference types="node" />
// Node only to read the map files from disk, as the browser fetches them (world/surfaceMaps.ts).
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateGalaxy, solRef } from '../src/gen/galaxy';
import { generateGasLayout } from '../src/gen/gasGiants';
import { geyserKind } from '../src/gen/geysers';
import { detailedTerrain, terrainNoise } from '../src/gen/noise';
import { orbitAngleOf, orbitPosition, perihelion, type Orbit } from '../src/gen/orbit';
import { fertility } from '../src/gen/plants';
import { decodeSurface, realSurface, registerSurface, surfaceColor, surfaceFile, SURFACE_NAMES, SURFACE_SEEDS } from '../src/gen/realSurface';
import { SOL_HABITABLE_RADIUS, solOrbit } from '../src/gen/sol';
import { findHomeSystem, generateSystem, type SystemData } from '../src/gen/system';
import { weatherKind } from '../src/gen/weather';
import { staggerLabels } from '../src/ui/systemMapLayout';

const galaxy = generateGalaxy(1337);
const ref = solRef(galaxy)!;
const sol: SystemData = generateSystem(ref);
const planet = (name: string) => sol.planets.find((p) => p.name === name)!;
const moon = (name: string) => sol.planets.flatMap((p) => p.moons).find((m) => m.name === name)!;
const DEG = Math.PI / 180;

/** Unit direction at longitude / latitude in degrees (planet/equalEarth.ts's convention). */
function dir(lon: number, lat: number): [number, number, number] {
  const c = Math.cos(lat * DEG);
  return [c * Math.sin(lon * DEG), Math.sin(lat * DEG), c * Math.cos(lon * DEG)];
}

describe('Sol in the galaxy', () => {
  it('is in every galaxy: one lone G star named Sol, outside the nebulas, about halfway out', () => {
    for (const seed of [1, 2, 1337, 99999]) {
      const g = generateGalaxy(seed);
      const sols = g.stars.filter((s) => s.real === 'sol');
      expect(sols).toHaveLength(1);
      const s = sols[0]!;
      expect(s.name).toBe('Sol');
      expect(s.stars).toHaveLength(1);
      expect(s.stars[0]!.spectralClass).toBe('G');
      expect(s.nebula).toBeNull();
      expect(Math.hypot(s.position.x, s.position.z) / g.radius).toBeCloseTo(0.55, 1);
    }
  });

  it('is never the home system, and leaves the home system where it was', () => {
    expect(findHomeSystem(galaxy).real).toBeUndefined();
    expect(findHomeSystem(galaxy).id).toBe(6);
  });

  it('is generated deterministically', () => {
    expect(JSON.stringify(generateSystem(ref))).toBe(JSON.stringify(sol));
  });
});

describe('the Sol system', () => {
  it('has the eight planets and Pluto, in order, with the right kinds', () => {
    expect(sol.planets.map((p) => p.name)).toEqual(['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']);
    expect(sol.planets.map((p) => p.size)).toEqual(['small', 'earth', 'earth', 'small', 'gasGiant', 'gasGiant', 'iceGiant', 'iceGiant', 'dwarf']);
    expect(planet('Earth').type).toBe('terran');
    expect(planet('Saturn').rings).not.toBeNull();
    expect(planet('Earth').orbit.radius).toBe(SOL_HABITABLE_RADIUS);
  });

  it('has the major moons', () => {
    const moons = (name: string) => planet(name).moons.map((m) => m.name);
    expect(moons('Earth')).toEqual(['Moon']);
    expect(moons('Mars')).toEqual(['Phobos', 'Deimos']);
    expect(moons('Jupiter')).toEqual(['Io', 'Europa', 'Ganymede', 'Callisto']);
    expect(moons('Saturn')).toEqual(['Mimas', 'Enceladus', 'Tethys', 'Dione', 'Rhea', 'Titan', 'Iapetus']);
    expect(moons('Uranus')).toEqual(['Miranda', 'Ariel', 'Umbriel', 'Titania', 'Oberon']);
    expect(moons('Neptune')).toEqual(['Triton']);
    expect(moons('Pluto')).toEqual(['Charon']);
    expect(moon('Phobos').shape).toBeTruthy();
  });

  it('keeps the same layout rules as generated systems', () => {
    let edge = sol.starZone;
    for (const p of sol.planets) {
      expect(p.orbit.radius - p.extent).toBeGreaterThan(edge);
      edge = p.orbit.radius + p.extent;
      let inner = Math.max(p.radius, p.rings?.outer ?? 0);
      for (const m of p.moons) {
        expect(m.orbit.radius - m.radius).toBeGreaterThan(inner);
        expect(m.orbit.radius + m.radius).toBeLessThanOrEqual(p.extent);
        inner = m.orbit.radius + m.radius;
      }
    }
    for (let i = 1; i < sol.planets.length; i++) expect(sol.planets[i]!.orbit.period).toBeGreaterThan(sol.planets[i - 1]!.orbit.period);
  });

  it('puts the belts in their gaps and Halley inside them', () => {
    const [main, l4, l5, kuiper] = sol.belts;
    expect(main!.inner).toBeGreaterThan(planet('Mars').orbit.radius + planet('Mars').extent);
    expect(main!.outer).toBeLessThan(planet('Jupiter').orbit.radius - planet('Jupiter').extent);
    expect(main!.asteroids.map((a) => a.name)).toContain('Ceres');
    expect(l4!.trojan?.lead).toBeCloseTo(Math.PI / 3);
    expect(l5!.trojan?.lead).toBeCloseTo(-Math.PI / 3);
    expect(kuiper!.inner).toBeGreaterThan(planet('Neptune').orbit.radius + planet('Neptune').extent);
    expect(planet('Pluto').orbit.radius).toBeGreaterThan(kuiper!.inner);
    const halley = sol.comets[0]!;
    expect(halley.orbit.inclination).toBeGreaterThan(Math.PI / 2);
    expect(perihelion(halley.orbit)).toBeGreaterThan(planet('Mercury').orbit.radius);
    expect(perihelion(halley.orbit)).toBeLessThan(planet('Venus').orbit.radius);
  });

  it('maps real distances monotonically', () => {
    for (let au = 0.3; au < 60; au *= 1.2) expect(solOrbit(au * 1.2)).toBeGreaterThan(solOrbit(au));
  });

  it('has the real climates', () => {
    const t = (c: { temperature: number } | null) => c!.temperature;
    // NASA fact sheets: Mercury 440 K, Venus 737, Earth 288, Mars 210, Titan 94, Triton 38 (mean surface temperatures).
    expect(t(planet('Mercury').climate)).toBeGreaterThan(420);
    expect(t(planet('Mercury').climate)).toBeLessThan(460);
    expect(t(planet('Venus').climate)).toBeCloseTo(737, -1);
    expect(t(planet('Earth').climate)).toBeCloseTo(288, 0);
    expect(t(planet('Mars').climate)).toBeCloseTo(210, -1);
    expect(t(moon('Titan').climate)).toBeCloseTo(94, -1);
    expect(t(moon('Triton').climate)).toBeCloseTo(38, -1);
    expect(planet('Earth').climate!.habitability).toBe(3);
    expect(planet('Earth').climate!.waterState).toBe('liquid');
    for (const p of sol.planets) if (p.name !== 'Earth' && p.climate) expect(p.climate.habitability).toBe(0);
  });

  it('brings each body its real weather and geysers', () => {
    expect(weatherKind('terran', planet('Earth').climate)).toBe('water');
    expect(weatherKind('desert', planet('Venus').climate)).toBe('acid');
    expect(weatherKind('desert', planet('Mars').climate)).toBe('dust');
    expect(weatherKind('ice', moon('Titan').climate)).toBe('methane');
    expect(weatherKind('barren', moon('Moon').climate)).toBeNull();
    expect(geyserKind('lava', moon('Io').climate)).toBe('sulphur');
    expect(geyserKind('ice', moon('Enceladus').climate)).toBe('cryo');
    expect(geyserKind('ice', moon('Triton').climate)).toBe('cryo');
    // The Moon's 16–21 mW/m² is enough for the stylised fumaroles (it does still vent radon and argon, faintly).
    expect(geyserKind('barren', moon('Moon').climate)).toBe('fumarole');
    // Mars has air: none.
    expect(geyserKind('desert', planet('Mars').climate)).toBeNull();
  });

  it('gives the moons in a planet\'s equator its tilt', () => {
    for (const name of ['Uranus', 'Saturn', 'Jupiter']) {
      const p = planet(name);
      // The planet's axis after its tilt about Z (world/Planet.ts).
      const axis = [-Math.sin(p.tilt), Math.cos(p.tilt), 0];
      for (const m of p.moons.filter((m) => m.name !== 'Iapetus')) {
        for (const time of [0, 3, 7]) {
          const at = orbitPosition(m.orbit, time, { x: 0, y: 0, z: 0 });
          expect(Math.abs(at.x * axis[0]! + at.y * axis[1]! + at.z * axis[2]!) / m.orbit.radius).toBeLessThan(1e-9);
        }
      }
    }
  });
});

describe('orbit nodes', () => {
  it('turns an orbit about +Y, and orbitAngleOf undoes it', () => {
    const orbit: Orbit = { radius: 10, period: 20, phase: 0.3, inclination: 0.7, node: 1.1 };
    const flat: Orbit = { ...orbit, node: undefined };
    for (const time of [0, 4, 13]) {
      const a = orbitPosition(orbit, time, { x: 0, y: 0, z: 0 });
      const b = orbitPosition(flat, time, { x: 0, y: 0, z: 0 });
      expect(Math.hypot(a.x, a.y, a.z)).toBeCloseTo(10);
      expect(a.y).toBeCloseTo(b.y);
      expect(a.x).toBeCloseTo(b.x * Math.cos(1.1) + b.z * Math.sin(1.1));
      const angle = orbit.phase + (2 * Math.PI * time) / orbit.period;
      expect(Math.cos(orbitAngleOf(orbit, a))).toBeCloseTo(Math.cos(angle));
      expect(Math.sin(orbitAngleOf(orbit, a))).toBeCloseTo(Math.sin(angle));
    }
  });
});

describe('the giants\' real cloud tops', () => {
  it('give Jupiter its Great Red Spot in the south and Saturn its hexagon', () => {
    const jupiter = generateGasLayout(planet('Jupiter').seed, false);
    const red = jupiter.storms.find((s) => s.kind === 'red')!;
    expect(red.lat).toBeCloseTo(-22 * DEG);
    expect(generateGasLayout(planet('Saturn').seed, false).polygon?.sides).toBe(6);
    const neptune = generateGasLayout(planet('Neptune').seed, true);
    expect(neptune.storms.some((s) => s.kind === 'dark')).toBe(true);
  });

  it('run from pole to pole without gaps', () => {
    for (const name of ['Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
      const p = planet(name);
      const { bands } = generateGasLayout(p.seed, p.size === 'iceGiant');
      expect(bands[0]!.south).toBeCloseTo(-Math.PI / 2);
      expect(bands[bands.length - 1]!.north).toBeCloseTo(Math.PI / 2);
      for (let i = 1; i < bands.length; i++) expect(bands[i]!.south).toBe(bands[i - 1]!.north);
    }
  });
});

describe('real surface maps', () => {
  beforeAll(() => {
    for (const name of SURFACE_NAMES) registerSurface(decodeSurface(name, new Uint8Array(gunzipSync(readFileSync(`public/${surfaceFile(name)}`)))));
  });

  it('belong to the bodies with those seeds, and nothing else', () => {
    expect(planet('Earth').seed).toBe(SURFACE_SEEDS.earth);
    expect(moon('Moon').seed).toBe(SURFACE_SEEDS.moon);
    expect(planet('Mars').seed).toBe(SURFACE_SEEDS.mars);
    expect(planet('Pluto').seed).toBe(SURFACE_SEEDS.pluto);
    expect(realSurface(12345)).toBeUndefined();
    expect(realSurface(planet('Venus').seed)).toBeUndefined();
  });

  it('put Earth\'s continents and oceans where they are', () => {
    const seaLevel = planet('Earth').style.seaLevel;
    const n = (lon: number, lat: number) => terrainNoise(...dir(lon, lat), SURFACE_SEEDS.earth);
    for (const [lon, lat] of [[10, 23], [-60, -5], [100, 60], [135, -25], [-100, 40], [-40, 72]]) expect(n(lon!, lat!)).toBeGreaterThan(seaLevel);
    for (const [lon, lat] of [[-150, 0], [-30, 30], [80, -20], [160, 30]]) expect(n(lon!, lat!)).toBeLessThan(seaLevel);
    // The Himalaya stand above the plains.
    expect(n(87, 28)).toBeGreaterThan(n(80, 50));
    // The fine detail never floods the lowlands.
    expect(detailedTerrain(...dir(5, 52), SURFACE_SEEDS.earth)).toBeGreaterThan(seaLevel);
  });

  it('colour the Sahara sandy, the Amazon green, Antarctica white', () => {
    const rgb: [number, number, number] = [0, 0, 0];
    const earth = realSurface(SURFACE_SEEDS.earth)!;
    const [sr, sg, sb] = surfaceColor(earth, ...dir(10, 23), rgb);
    expect(sr).toBeGreaterThan(sb + 0.15);
    expect(sr + sg + sb).toBeGreaterThan(1.6);
    const [ar, ag] = surfaceColor(earth, ...dir(-62, -4), rgb);
    expect(ag).toBeGreaterThan(ar);
    expect(Math.min(...surfaceColor(earth, ...dir(0, -82), rgb))).toBeGreaterThan(0.8);
  });

  it('grow plants in the Amazon, not the Sahara', () => {
    const at = (lon: number, lat: number) => {
      // Fertility averaged round a point (it varies in patches).
      let sum = 0;
      for (let i = 0; i < 25; i++) sum += fertility(...dir(lon + (i % 5) * 0.4, lat + Math.floor(i / 5) * 0.4), SURFACE_SEEDS.earth);
      return sum / 25;
    };
    expect(at(10, 23)).toBeLessThan(0.05);
    expect(at(-62, -4)).toBeGreaterThan(0.2);
  });

  it('show the Moon\'s dark maria and Mars\'s volcanoes', () => {
    const rgb: [number, number, number] = [0, 0, 0];
    const moonMap = realSurface(SURFACE_SEEDS.moon)!;
    const grey = (lon: number, lat: number) => surfaceColor(moonMap, ...dir(lon, lat), rgb).reduce((a, b) => a + b) / 3;
    // Mare Imbrium against the southern highlands near Tycho.
    expect(grey(-16, 33)).toBeLessThan(grey(-11, -50) - 0.15);
    const mars = (lon: number, lat: number) => terrainNoise(...dir(lon, lat), SURFACE_SEEDS.mars);
    // Olympus Mons above Hellas' floor.
    expect(mars(-134, 18.6)).toBeGreaterThan(mars(70, -42) + 1);
  });
});

describe('staggerLabels', () => {
  it('keeps names on one row when they fit and moves the crowded ones to a second', () => {
    expect(staggerLabels([10, 60, 110], [30, 30, 30])).toEqual([0, 0, 0]);
    expect(staggerLabels([10, 30, 50, 70], [30, 30, 30, 30])).toEqual([0, 1, 0, 1]);
  });
});
