import { describe, expect, it } from 'vitest';
import {
  EQUAL_EARTH_HEIGHT,
  EQUAL_EARTH_WIDTH,
  equalEarth,
  equalEarthInverse,
  fromLonLat,
  toLonLat,
} from '../src/planet/equalEarth';

const p = { x: 0, y: 0 };
const ll = { lon: 0, lat: 0 };

describe('Equal Earth projection', () => {
  it('has the published extent (2.05458 : 1)', () => {
    // Šavrič et al. 2018 (via Wikipedia): 2.05458 : 1, semi-axes 2.70663 and 1.31736.
    expect(EQUAL_EARTH_WIDTH / EQUAL_EARTH_HEIGHT).toBeCloseTo(2.05458, 4);
    expect(EQUAL_EARTH_WIDTH / 2).toBeCloseTo(2.70663, 5);
    expect(EQUAL_EARTH_HEIGHT / 2).toBeCloseTo(1.31736, 5);
    expect(equalEarth(Math.PI, 0, p).x).toBeCloseTo(EQUAL_EARTH_WIDTH / 2, 10);
    expect(equalEarth(0, Math.PI / 2, p).y).toBeCloseTo(EQUAL_EARTH_HEIGHT / 2, 10);
    // The poles are lines, a bit over half the equator's length (straight-sided, not pointed).
    const pole = equalEarth(Math.PI, Math.PI / 2, p).x / (EQUAL_EARTH_WIDTH / 2);
    expect(pole).toBeGreaterThan(0.5);
    expect(pole).toBeLessThan(0.6);
  });

  it('round-trips through the inverse', () => {
    for (let lat = -89; lat <= 89; lat += 7) {
      for (let lon = -179; lon <= 179; lon += 13) {
        const l = (lon * Math.PI) / 180;
        const f = (lat * Math.PI) / 180;
        equalEarth(l, f, p);
        expect(equalEarthInverse(p.x, p.y, ll)).toBe(true);
        expect(ll.lon).toBeCloseTo(l, 9);
        expect(ll.lat).toBeCloseTo(f, 9);
      }
    }
  });

  it('reports points outside the outline', () => {
    expect(equalEarthInverse(EQUAL_EARTH_WIDTH / 2 + 0.01, 0, ll)).toBe(false);
    expect(equalEarthInverse(0, EQUAL_EARTH_HEIGHT / 2 + 0.01, ll)).toBe(false);
    // Past the pole line's end, near a corner of the bounding box.
    expect(equalEarthInverse(EQUAL_EARTH_WIDTH / 2 - 0.01, EQUAL_EARTH_HEIGHT / 2 - 0.01, ll)).toBe(false);
    expect(equalEarthInverse(0, 0, ll)).toBe(true);
  });

  it('is equal-area: latitude bands keep their share of the sphere', () => {
    // A band's share of the sphere is (sin φ2 − sin φ1) / 2. On the map, integrate its width over y.
    const mapArea = (lat1: number, lat2: number) => {
      const n = 2000;
      let area = 0;
      for (let i = 0; i < n; i++) {
        const a = lat1 + ((lat2 - lat1) * i) / n;
        const b = lat1 + ((lat2 - lat1) * (i + 1)) / n;
        const ya = equalEarth(0, a, p).y;
        const yb = equalEarth(0, b, p).y;
        const w = 2 * equalEarth(Math.PI, (a + b) / 2, p).x;
        area += w * (yb - ya);
      }
      return area;
    };
    const total = mapArea(-Math.PI / 2, Math.PI / 2);
    for (const [a, b] of [
      [0, 10],
      [30, 40],
      [60, 70],
      [80, 90],
      [-45, 15],
    ] as const) {
      const f1 = (a * Math.PI) / 180;
      const f2 = (b * Math.PI) / 180;
      const sphere = (Math.sin(f2) - Math.sin(f1)) / 2;
      expect(mapArea(f1, f2) / total).toBeCloseTo(sphere, 4);
    }
  });

  it('maps body-frame directions to longitude and latitude and back', () => {
    const d = [0, 0, 0];
    expect(toLonLat(0, 1, 0, ll).lat).toBeCloseTo(Math.PI / 2);
    toLonLat(0, 0, 1, ll);
    expect([ll.lon, ll.lat]).toEqual([0, 0]);
    expect(toLonLat(1, 0, 0, ll).lon).toBeCloseTo(Math.PI / 2);
    fromLonLat(1.2, -0.4, d);
    toLonLat(d[0]!, d[1]!, d[2]!, ll);
    expect(ll.lon).toBeCloseTo(1.2);
    expect(ll.lat).toBeCloseTo(-0.4);
    expect(Math.hypot(d[0]!, d[1]!, d[2]!)).toBeCloseTo(1);
  });
});
