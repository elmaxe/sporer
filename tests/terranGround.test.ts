import { describe, expect, it } from 'vitest';
import { hexToRgb, rgbToHsl } from '../src/gen/color';
import { detailedTerrain, terrainNoise } from '../src/gen/noise';
import { landElevation, planetStyle, PLAINS_SLOPE, type PlanetStyle } from '../src/gen/planets';
import { Rng } from '../src/gen/rng';
import { groundPalette, groundTemperature, PEAK_KM, SNOW_TEMPERATURE, snowTemperature } from '../src/gen/terranGround';
import { peakRadius, terrainSampler } from '../src/world/planetGeometry';
import * as THREE from 'three';

// See docs/research/terran-ground.md.
const flat: PlanetStyle = { sea: '#2255aa', seaLevel: 0, low: '#447733', high: '#ddd0b8', relief: 0.03 };
const plains: PlanetStyle = { ...flat, plains: 1 };

describe('land elevation', () => {
  it('rises evenly without plains', () => {
    for (const h of [0, 0.1, 0.5, 0.9, 1]) expect(landElevation(flat, h)).toBe(h);
  });

  it('keeps the shore and the peaks, flattens the lowlands, and rises steadily', () => {
    expect(landElevation(plains, 0)).toBe(0);
    expect(landElevation(plains, 1)).toBeCloseTo(1, 12);
    let last = 0;
    for (let h = 0.01; h <= 1; h += 0.01) {
      const e = landElevation(plains, h);
      expect(e).toBeGreaterThan(last);
      expect(e).toBeLessThanOrEqual(h + 1e-12);
      last = e;
    }
    // Its slope at the shore is PLAINS_SLOPE.
    expect(landElevation(plains, 1e-4) / 1e-4).toBeCloseTo(PLAINS_SLOPE, 3);
    // Half plains: half way between.
    expect(landElevation({ ...flat, plains: 0.5 }, 1e-4) / 1e-4).toBeCloseTo(1 - 0.5 * (1 - PLAINS_SLOPE), 3);
  });

  it('leaves the sea floor alone', () => {
    expect(landElevation(plains, -0.4)).toBe(-0.4);
  });

  it('lowers the land under the same peaks in the terrain the views draw', () => {
    const R = 400;
    const even = terrainSampler(R, 9, flat, { noise: detailedTerrain, reliefScale: 1.6, seaFloor: true });
    const low = terrainSampler(R, 9, plains, { noise: detailedTerrain, reliefScale: 1.6, seaFloor: true });
    const dir = new THREE.Vector3();
    const c = new THREE.Color();
    const rng = new Rng(4);
    let land = 0;
    let lower = 0;
    for (let i = 0; i < 2000; i++) {
      dir.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      const a = even(dir, c);
      const b = low(dir, c);
      expect(b).toBeLessThanOrEqual(peakRadius(R, plains, 1.6) + 1e-9);
      if (a <= R) {
        // The same coasts and the same sea floor.
        expect(b).toBe(a);
        continue;
      }
      land++;
      expect(b).toBeGreaterThan(R);
      expect(b).toBeLessThanOrEqual(a + 1e-9);
      if (b < a - 1e-6) lower++;
    }
    // All but the ground hardly above the shore or at the very top (the noise clamps there).
    expect(lower).toBeGreaterThan(0.98 * land);
  });

  it('gives green worlds plains and lower relief than barren rock', () => {
    for (let i = 0; i < 50; i++) {
      for (const type of ['terran', 'ocean'] as const) {
        const style = planetStyle(new Rng(i), type);
        expect(style.plains).toBe(1);
        expect(style.relief).toBeGreaterThanOrEqual(0.012);
        expect(style.relief).toBeLessThanOrEqual(0.02);
      }
      for (const type of ['barren', 'desert', 'lava', 'ice'] as const) expect(planetStyle(new Rng(i), type).plains ?? 0).toBe(0);
    }
  });

  it('keeps most of a terran world dry land, and most of an ocean world sea', () => {
    // The share of the globe under the sea, from evenly spread directions (a Fibonacci sphere).
    const seaShare = (style: PlanetStyle, seed: number) => {
      const n = 1500;
      let wet = 0;
      for (let k = 0; k < n; k++) {
        const y = 1 - (2 * (k + 0.5)) / n, r = Math.sqrt(1 - y * y), t = k * 2.399963;
        if (terrainNoise(r * Math.cos(t), y, r * Math.sin(t), seed) < style.seaLevel) wet++;
      }
      return wet / n;
    };
    const terran: number[] = [];
    const ocean: number[] = [];
    for (let i = 0; i < 60; i++) {
      const seed = 1000 + i * 7919;
      terran.push(seaShare(planetStyle(new Rng(i), 'terran'), seed));
      ocean.push(seaShare(planetStyle(new Rng(i), 'ocean'), seed));
    }
    const mean = (shares: number[]) => shares.reduce((a, b) => a + b, 0) / shares.length;
    expect(mean(terran)).toBeGreaterThan(0.15);
    expect(mean(terran)).toBeLessThan(0.3);
    expect(Math.max(...terran)).toBeLessThan(0.5);
    expect(mean(ocean)).toBeGreaterThan(0.7);
    expect(Math.min(...ocean)).toBeGreaterThan(0.5);
  });
});

describe('ground palette', () => {
  const hsl = (hex: string) => rgbToHsl(...hexToRgb(hex));

  it('derives its detail colours from the painted ones', () => {
    for (let i = 0; i < 40; i++) {
      const style = planetStyle(new Rng(i), 'terran');
      const p = groundPalette(style);
      const [lh, , ll] = hsl(style.low);
      const [hh] = hsl(style.high);
      // Valleys darker than the painted lowland, dry grass paler, its hue turned towards the highlands'.
      expect(hsl(p.lush)[2]).toBeLessThan(ll);
      expect(hsl(p.dry)[2]).toBeGreaterThan(ll);
      const towards = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;
      const turn = towards(lh, hh);
      const moved = towards(lh, hsl(p.dry)[0]);
      if (Math.abs(turn) > 5) expect(Math.sign(moved)).toBe(Math.sign(turn));
      // Rock nearly grey, soil dark.
      expect(hsl(p.rock)[1]).toBeLessThan(0.12);
      expect(hsl(p.soil)[2]).toBeLessThan(0.35);
    }
  });
});

describe('snow', () => {
  it('lies above about 4–5 km on Earth’s equator (the tropics’ snow line, 4.5–5 km)', () => {
    const t0 = groundTemperature(288, 0, 0);
    const line = ((t0 - snowTemperature(0)) / (t0 - groundTemperature(288, 0, 1))) * PEAK_KM;
    expect(line).toBeGreaterThan(4);
    expect(line).toBeLessThan(5);
    expect(snowTemperature(0)).toBe(SNOW_TEMPERATURE);
  });

  it('reaches Earth’s sea level from about 70° of latitude', () => {
    const at = (deg: number) => groundTemperature(288, (deg * Math.PI) / 180, 0) - snowTemperature((deg * Math.PI) / 180);
    expect(at(65)).toBeGreaterThan(0);
    expect(at(75)).toBeLessThan(0);
  });

  it('is colder up the mountains', () => {
    expect(groundTemperature(288, 0.3, 0.5)).toBeLessThan(groundTemperature(288, 0.3, 0.2));
  });
});
