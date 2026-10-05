import { describe, expect, it } from 'vitest';
import { hexToRgb } from '../src/gen/color';
import { generateGalaxy, solRef } from '../src/gen/galaxy';
import { iceSurface, lineaeIndex, LINEAE_INDEX_SIZE, LINEAE_PER_TEXEL, MAX_LINEAE } from '../src/gen/ice';
import { ICE_CLASSES, iceHex, iceLinear, iceTransmission, luminance } from '../src/gen/iceColor';
import { planetStyle } from '../src/gen/planets';
import { Rng } from '../src/gen/rng';
import { generateSystem } from '../src/gen/system';

// See docs/research/ice.md.
const sol = generateSystem(solRef(generateGalaxy(1337))!);
const moon = (name: string) => sol.planets.flatMap((p) => p.moons).find((m) => m.name === name)!;

describe('ice colour', () => {
  it('matches daylight through Warren & Brandt’s ice within 0.02 over 1–5 m', () => {
    // Linear sRGB of a 6504 K black body through `path` metres of ice, white-normalised (the note's script).
    for (const [path, r, g] of [
      [1, 0.816, 0.956],
      [2, 0.663, 0.914],
      [5, 0.339, 0.798],
    ] as const) {
      const t = iceTransmission(path);
      expect(Math.abs(t[0] - r)).toBeLessThan(0.02);
      expect(Math.abs(t[1] - g)).toBeLessThan(0.02);
      expect(t[2]).toBeCloseTo(1, 2);
    }
  });

  it('gives each class its albedo, bluer the deeper light goes', () => {
    const classes = [ICE_CLASSES.snow, ICE_CLASSES.firn, ICE_CLASSES.seaIce, ICE_CLASSES.blueIce, ICE_CLASSES.lead];
    for (const c of classes) expect(luminance(iceLinear(c))).toBeCloseTo(c.albedo, 5);
    const blueness = classes.map((c) => {
      const [r, , b] = iceLinear(c);
      return b / r;
    });
    for (let i = 1; i < blueness.length; i++) expect(blueness[i]).toBeGreaterThan(blueness[i - 1]!);
    // Blue ice is darker than snow (Bintanja 1999: 0.56 against 0.80).
    expect(ICE_CLASSES.blueIce.albedo).toBeLessThan(ICE_CLASSES.snow.albedo);
  });

  it('turns to a world’s own hue without changing its lightness much', () => {
    for (const hue of [185, 200, 215]) {
      const hex = iceHex(ICE_CLASSES.blueIce, hue);
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(hex).not.toBe(iceHex(ICE_CLASSES.blueIce, hue + 20));
    }
  });

  it('paints ice worlds from the same draws as before', () => {
    // Five draws (hue, sea, sea level, low, relief), so nothing generated after the style moves.
    for (let seed = 0; seed < 20; seed++) {
      const rng = new Rng(seed);
      const style = planetStyle(rng, 'ice');
      const ref = new Rng(seed);
      for (let i = 0; i < 5; i++) ref.next();
      expect(rng.next()).toBe(ref.next());
      for (const c of [style.sea!, style.low, style.high]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      // Snow above firn above the sea ice, in lightness.
      const lum = (hex: string) => luminance(hexToRgb(hex));
      expect(lum(style.high)).toBeGreaterThan(lum(style.low));
    }
  });
});

describe('ice surfaces', () => {
  it('is only for icy bodies', () => {
    expect(iceSurface({ type: 'barren', seed: 1, style: planetStyle(new Rng(1), 'barren') })).toBeNull();
    expect(iceSurface({ type: 'ice', seed: 1, style: planetStyle(new Rng(1), 'ice') })).not.toBeNull();
  });

  it('is deterministic', () => {
    const body = { type: 'ice' as const, seed: 77, style: planetStyle(new Rng(77), 'ice'), climate: moon('Europa').climate };
    expect(iceSurface(body)).toEqual(iceSurface(body));
  });

  it('is clean on Europa and Enceladus, dirty on Callisto, with Ganymede between', () => {
    const clean = (name: string) => iceSurface(moon(name))!.clean;
    expect(clean('Europa')).toBeGreaterThan(0.95);
    expect(clean('Enceladus')).toBeGreaterThan(0.95);
    expect(clean('Callisto')).toBeLessThan(0.05);
    expect(clean('Ganymede')).toBeGreaterThan(clean('Callisto'));
    expect(clean('Ganymede')).toBeLessThan(clean('Europa'));
  });

  it('cracks Europa all over, Ganymede a little and Callisto not at all', () => {
    const lines = (name: string) => iceSurface(moon(name))!.lines.length;
    expect(lines('Europa')).toBe(MAX_LINEAE);
    expect(lines('Ganymede')).toBeGreaterThan(0);
    expect(lines('Ganymede')).toBeLessThan(lines('Enceladus'));
    expect(lines('Callisto')).toBe(0);
  });

  it('lays each linea on a circle of the sphere, as wide as Europa’s bands at most', () => {
    const { lines } = iceSurface(moon('Europa'))!;
    for (const l of lines) {
      expect(Math.hypot(...l.pole)).toBeCloseTo(1, 6);
      expect(Math.hypot(...l.ref)).toBeCloseTo(1, 6);
      expect(l.pole[0] * l.ref[0] + l.pole[1] * l.ref[1] + l.pole[2] * l.ref[2]).toBeCloseTo(0, 6);
      expect(Math.abs(l.offset)).toBeLessThanOrEqual(0.3);
      // Half-widths up to 0.02 rad: Europa's widest bands (25 km on a 1561 km moon, 0.016 rad), a little widened.
      expect(l.width).toBeGreaterThan(0);
      expect(l.width).toBeLessThanOrEqual(0.02);
    }
  });

  it('keeps reddish-brown lineae, as Galileo saw on Europa', () => {
    const [r, g, b] = hexToRgb(iceSurface(moon('Europa'))!.lineaeColor);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it('freezes water seas, not Titan’s methane', () => {
    expect(iceSurface(moon('Titan'))!.frozenSea).toBe(false);
    const style = planetStyle(new Rng(3), 'ice');
    expect(iceSurface({ type: 'ice', seed: 3, style })!.frozenSea).toBe(true);
  });

  it('indexes every linea wherever it runs, and none far from them all', () => {
    const { lines } = iceSurface(moon('Europa'))!;
    const index = lineaeIndex(lines);
    const [w, h] = LINEAE_INDEX_SIZE;
    // The texel a direction falls in, as the shader looks it up.
    const texel = (p: readonly number[]) => {
      const u = Math.atan2(p[0]!, p[2]!) / (2 * Math.PI) + 0.5;
      const v = Math.asin(Math.max(-1, Math.min(1, p[1]!))) / Math.PI + 0.5;
      const x = Math.min(w - 1, Math.floor(u * w));
      const y = Math.min(h - 1, Math.floor(v * h));
      return Array.from(index.subarray((y * w + x) * 4, (y * w + x) * 4 + LINEAE_PER_TEXEL));
    };
    lines.forEach((l, i) => {
      // Points along the arc, at its centre line and at its edge.
      const ring = Math.acos(l.offset);
      const v = [l.pole[1] * l.ref[2] - l.pole[2] * l.ref[1], l.pole[2] * l.ref[0] - l.pole[0] * l.ref[2], l.pole[0] * l.ref[1] - l.pole[1] * l.ref[0]];
      for (let k = -0.95; k <= 0.95; k += 0.05) {
        const a = l.centre + k * l.half;
        for (const edge of [0, l.width]) {
          const r = ring + edge;
          const p = [0, 1, 2].map((j) => Math.cos(r) * l.pole[j]! + Math.sin(r) * (Math.cos(a) * l.ref[j]! + Math.sin(a) * v[j]!));
          expect(texel(p)).toContain(i + 1);
        }
      }
    });
    // A body with no lineae lists none.
    expect(lineaeIndex([]).every((b) => b === 0)).toBe(true);
    // Most of Europa is far from any linea.
    let empty = 0;
    for (let t = 0; t < w * h; t++) if (index[t * 4] === 0) empty++;
    expect(empty / (w * h)).toBeGreaterThan(0.5);
  });
});
