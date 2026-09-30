import { describe, expect, it } from 'vitest';
import {
  BAND_SAMPLES,
  bandAt,
  bandStarDirections,
  conjugate,
  flatTilt,
  galacticSky,
  MAX_GALACTIC_TILT,
  randomRotation,
  rotate,
  type Quat,
} from '../src/gen/galactic';
import { GALAXY_RADIUS, generateGalaxy } from '../src/gen/galaxy';
import { Rng } from '../src/gen/rng';
import { generateSystem } from '../src/gen/system';

type V = { x: number; y: number; z: number };
const len = (v: V) => Math.hypot(v.x, v.y, v.z);
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const identity: Quat = { x: 0, y: 0, z: 0, w: 1 };
const midDisc = { x: 0.5 * GALAXY_RADIUS, y: 0, z: 0 };
const half = BAND_SAMPLES / 2;

describe('randomRotation / rotate', () => {
  it('gives deterministic unit quaternions', () => {
    const a = randomRotation(new Rng(7));
    expect(randomRotation(new Rng(7))).toEqual(a);
    expect(Math.hypot(a.x, a.y, a.z, a.w)).toBeCloseTo(1, 12);
  });

  it('preserves lengths, and the conjugate undoes it', () => {
    const q = randomRotation(new Rng(3));
    const v = { x: 1, y: -2, z: 0.5 };
    const r = rotate(q, v, { x: 0, y: 0, z: 0 });
    expect(len(r)).toBeCloseTo(len(v), 12);
    const back = rotate(conjugate(q), r, { x: 0, y: 0, z: 0 });
    expect(back.x).toBeCloseTo(v.x, 12);
    expect(back.y).toBeCloseTo(v.y, 12);
    expect(back.z).toBeCloseTo(v.z, 12);
  });

  it('rotates 90° about +Y as expected', () => {
    const s = Math.SQRT1_2;
    const r = rotate({ x: 0, y: s, z: 0, w: s }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.z).toBeCloseTo(-1, 12);
  });
});

describe('flatTilt', () => {
  /** Angle between the system's ecliptic north, turned into galaxy space, and galactic north. */
  const tiltOf = (q: Quat) => Math.acos(Math.min(1, rotate(q, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }).y));

  it('gives deterministic unit quaternions', () => {
    const a = flatTilt(new Rng(7));
    expect(flatTilt(new Rng(7))).toEqual(a);
    expect(Math.hypot(a.x, a.y, a.z, a.w)).toBeCloseTo(1, 12);
  });

  it('keeps every ecliptic within the maximum tilt, spread over the whole cap and every heading', () => {
    const rng = new Rng(42);
    const tilts: number[] = [];
    const headings = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const q = flatTilt(rng);
      tilts.push(tiltOf(q));
      const n = rotate(q, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 });
      headings.add(Math.floor(((Math.atan2(n.z, n.x) + Math.PI) / (2 * Math.PI)) * 8));
    }
    tilts.sort((a, b) => a - b);
    expect(tilts[tilts.length - 1]!).toBeLessThanOrEqual(MAX_GALACTIC_TILT + 1e-9);
    // Even over the cap (cos θ uniform): the median is acos((1 + cos max) / 2), ~21° for a 30° cap.
    const median = tilts[tilts.length >> 1]!;
    expect(median).toBeCloseTo(Math.acos((1 + Math.cos(MAX_GALACTIC_TILT)) / 2), 1);
    expect(tilts[Math.floor(tilts.length * 0.9)]!).toBeGreaterThan(0.8 * MAX_GALACTIC_TILT);
    expect(headings.size).toBe(8);
  });

  it('is what generated systems get', () => {
    const galaxy = generateGalaxy(1337);
    for (const ref of galaxy.stars.slice(0, 200)) {
      expect(tiltOf(generateSystem(ref).galacticTilt)).toBeLessThanOrEqual(MAX_GALACTIC_TILT + 1e-9);
    }
  });
});

describe('galacticSky', () => {
  it('gives an orthonormal basis pointing at the galactic centre, in system space', () => {
    const tilt = randomRotation(new Rng(11));
    const p = { x: 300, y: 12, z: -400 };
    const sky = galacticSky(p, tilt);
    for (const v of [sky.north, sky.center, sky.east]) expect(len(v)).toBeCloseTo(1, 10);
    expect(dot(sky.north, sky.center)).toBeCloseTo(0, 10);
    expect(dot(sky.north, sky.east)).toBeCloseTo(0, 10);
    expect(dot(sky.center, sky.east)).toBeCloseTo(0, 10);
    // Back in galaxy space: north is +Y, the centre is the way to the origin in the plane.
    const north = rotate(tilt, sky.north, { x: 0, y: 0, z: 0 });
    expect(north.y).toBeCloseTo(1, 10);
    const center = rotate(tilt, sky.center, { x: 0, y: 0, z: 0 });
    const d = Math.hypot(p.x, p.z);
    expect(center.x).toBeCloseTo(-p.x / d, 10);
    expect(center.z).toBeCloseTo(-p.z / d, 10);
    const bulge = rotate(tilt, sky.bulge, { x: 0, y: 0, z: 0 });
    expect(bulge.y).toBeLessThan(0); // the star is above the plane, so the centre is a little below
  });

  it('is brightest towards the centre and faintest towards the rim, symmetric either side', () => {
    const { band } = galacticSky(midDisc, identity);
    const brightness = band.map((s) => s.brightness);
    expect(Math.max(...brightness)).toBe(brightness[0]);
    expect(Math.min(...brightness)).toBe(brightness[half]);
    expect(brightness[0]! / brightness[half]!).toBeGreaterThan(3);
    for (let i = 1; i < half; i++) expect(brightness[i]).toBeCloseTo(brightness[BAND_SAMPLES - i]!, 6);
  });

  it('looks broader towards the rim, where the stars seen are nearer', () => {
    const { band } = galacticSky(midDisc, identity);
    expect(band[half]!.width).toBeGreaterThan(band[0]!.width);
  });

  it('is fainter away from the centre for stars near the rim', () => {
    const inner = galacticSky({ x: 0.3 * GALAXY_RADIUS, y: 0, z: 0 }, identity);
    const outer = galacticSky({ x: 0.9 * GALAXY_RADIUS, y: 0, z: 0 }, identity);
    expect(outer.band[half]!.brightness).toBeLessThan(inner.band[half]!.brightness / 3);
    expect(outer.bulgeSize).toBeLessThan(inner.bulgeSize);
  });

  it('shifts the band below the midline for stars above the plane, and above for stars below', () => {
    const above = galacticSky({ ...midDisc, y: 20 }, identity);
    const below = galacticSky({ ...midDisc, y: -20 }, identity);
    for (let i = 0; i < BAND_SAMPLES; i++) {
      expect(above.band[i]!.offset).toBeLessThan(0);
      expect(below.band[i]!.offset).toBeCloseTo(-above.band[i]!.offset, 10);
    }
  });

  it('interpolates between samples and wraps round', () => {
    const sky = galacticSky(midDisc, identity);
    expect(bandAt(sky, 0).brightness).toBeCloseTo(sky.band[0]!.brightness, 10);
    expect(bandAt(sky, 2 * Math.PI).brightness).toBeCloseTo(sky.band[0]!.brightness, 10);
    expect(bandAt(sky, -Math.PI).brightness).toBeCloseTo(sky.band[half]!.brightness, 10);
    const step = (2 * Math.PI) / BAND_SAMPLES;
    const mid = bandAt(sky, step / 2).brightness;
    expect(mid).toBeCloseTo((sky.band[0]!.brightness + sky.band[1]!.brightness) / 2, 10);
  });

  it('is consistent with the system it is seen from (the tilt comes with the system)', () => {
    const galaxy = generateGalaxy(1337, 50);
    const [a, b] = [generateSystem(galaxy.stars[3]!), generateSystem(galaxy.stars[4]!)];
    expect(generateSystem(galaxy.stars[3]!).galacticTilt).toEqual(a.galacticTilt);
    expect(a.galacticTilt).not.toEqual(b.galacticTilt);
    const q = a.galacticTilt;
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 12);
  });
});

describe('bandStarDirections', () => {
  const tilt = randomRotation(new Rng(5));
  const sky = galacticSky({ ...midDisc, y: 8 }, tilt);
  const dirs = bandStarDirections(sky, new Rng(9), 3000);
  const stars = Array.from({ length: 3000 }, (_, i) => ({ x: dirs[i * 3]!, y: dirs[i * 3 + 1]!, z: dirs[i * 3 + 2]! }));

  it('gives unit directions, deterministically', () => {
    for (const s of stars) expect(len(s)).toBeCloseTo(1, 5);
    expect(bandStarDirections(sky, new Rng(9), 3000)).toEqual(dirs);
  });

  it('crowds them along the band, more towards the centre', () => {
    const nearPlane = stars.filter((s) => Math.abs(dot(s, sky.north)) < 0.35).length;
    expect(nearPlane / stars.length).toBeGreaterThan(0.9);
    const towardsCenter = stars.filter((s) => dot(s, sky.center) > 0).length;
    expect(towardsCenter / stars.length).toBeGreaterThan(0.6);
  });
});
