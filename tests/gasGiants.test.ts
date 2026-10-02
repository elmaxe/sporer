import { describe, expect, it } from 'vitest';
import { gasBandAt, gasDrift, gasShear, gasTone, generateGasLayout } from '../src/gen/gasGiants';

const DEG = Math.PI / 180;
const seeds = Array.from({ length: 200 }, (_, i) => (i * 2654435761) >>> 0);

describe('gas giant layout', () => {
  it('is the same for the same seed', () => {
    expect(generateGasLayout(42, false)).toEqual(generateGasLayout(42, false));
    expect(generateGasLayout(42, true)).toEqual(generateGasLayout(42, true));
  });

  it('covers pole to pole with bands, no gaps or overlaps', () => {
    for (const seed of seeds) {
      for (const ice of [false, true]) {
        const { bands } = generateGasLayout(seed, ice);
        expect(bands[0]!.south).toBeCloseTo(-Math.PI / 2);
        expect(bands[bands.length - 1]!.north).toBeCloseTo(Math.PI / 2);
        for (let i = 1; i < bands.length; i++) {
          expect(bands[i]!.south).toBeCloseTo(bands[i - 1]!.north);
          expect(bands[i]!.north).toBeGreaterThan(bands[i]!.south);
        }
      }
    }
  });

  it('gives gas giants Jupiter-like jets: prograde on a belt’s equatorward edge, retrograde on its poleward one', () => {
    for (const seed of seeds) {
      const layout = generateGasLayout(seed, false);
      const { bands, jets } = layout;
      for (const jet of jets) {
        if (jet.lat === 0) continue;
        const poleward = gasBandAt(layout, jet.lat + Math.sign(jet.lat) * 0.1 * DEG);
        expect(jet.speed > 0).toBe(!poleward.zone);
      }
      // Belts and zones alternate.
      for (let i = 1; i < bands.length; i++) expect(bands[i]!.zone).not.toBe(bands[i - 1]!.zone);
      // The equator super-rotates, between Jupiter's ~1% and Saturn's ~5% of the spin.
      expect(gasDrift(layout, 0)).toBeGreaterThan(0.005);
      expect(gasDrift(layout, 0)).toBeLessThan(0.07);
      // Banding breaks down into the polar region between Jupiter's 64° and Saturn's ~80°.
      expect(layout.polar).toBeGreaterThanOrEqual(64 * DEG);
      expect(layout.polar).toBeLessThanOrEqual(80 * DEG);
    }
  });

  it('gives ice giants a retrograde equator and prograde jets at higher latitudes', () => {
    for (const seed of seeds) {
      const layout = generateGasLayout(seed, true);
      expect(gasDrift(layout, 0)).toBeLessThan(0);
      expect(gasDrift(layout, 60 * DEG)).toBeGreaterThan(0);
      expect(gasDrift(layout, -60 * DEG)).toBeGreaterThan(0);
      // Calmer than gas giants: low contrast, no polar cyclones.
      expect(layout.contrast).toBeLessThan(0.65);
      expect(layout.polarCyclones).toEqual([0, 0]);
    }
  });

  it('puts great spots in the tropics and keeps storms on the globe', () => {
    let red = 0;
    let dark = 0;
    for (const seed of seeds) {
      for (const ice of [false, true]) {
        for (const s of generateGasLayout(seed, ice).storms) {
          expect(Math.abs(s.lat)).toBeLessThan(80 * DEG);
          expect(s.radius).toBeGreaterThan(0);
          if (s.kind === 'red') {
            red++;
            expect(Math.abs(s.lat)).toBeGreaterThanOrEqual(15 * DEG);
            expect(Math.abs(s.lat)).toBeLessThanOrEqual(27 * DEG);
          }
          if (s.kind === 'dark') dark++;
        }
      }
    }
    // Some, not all.
    expect(red).toBeGreaterThan(40);
    expect(red).toBeLessThan(160);
    expect(dark).toBeGreaterThan(50);
    expect(dark).toBeLessThan(150);
  });

  it('gives tones on the palette and shear that peaks at the jets', () => {
    for (const seed of seeds.slice(0, 20)) {
      const layout = generateGasLayout(seed, false);
      for (let lat = -89; lat <= 89; lat += 1) {
        const t = gasTone(layout, lat * DEG);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
        const s = gasShear(layout, lat * DEG);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
      const edge = layout.jets.find((j) => j.lat !== 0)!;
      expect(gasShear(layout, edge.lat)).toBeCloseTo(1);
    }
  });
});
