import { describe, expect, it } from 'vitest';
import {
  STANDARD_GRAVITY,
  WAVES_PER_SET,
  WAVE_SETS,
  coxMunkSlope,
  drawnVariance,
  peakOmega,
  seaWaves,
  significantHeight,
  slopeVariance,
  waveOmega,
  wavePhase,
  wavelength,
} from '../src/gen/waves';

// See docs/research/sea-waves.md.
describe('sea waves', () => {
  it('reproduces the Beaufort scale’s probable wave heights within 15%', () => {
    // Met Office: force 3 (5 m/s) 0.6 m, force 4 (7 m/s) 1.0 m, force 5 (10 m/s) 2.0 m.
    for (const [wind, height] of [
      [5, 0.6],
      [7, 1.0],
      [10, 2.0],
    ] as const) {
      expect(significantHeight(wind) / height).toBeGreaterThan(0.85);
      expect(significantHeight(wind) / height).toBeLessThan(1.15);
    }
  });

  it('puts the Pierson–Moskowitz peak where its spectrum peaks, at deep-water lengths', () => {
    // dS/dω = 0 at ω = (4β/5)^¼ g / U₁₉.₅.
    const w = peakOmega(7);
    const s = (x: number) => x ** -5 * Math.exp(-0.74 * (STANDARD_GRAVITY / (7 * Math.sqrt(0.22 / 0.21)) / x) ** 4);
    expect(s(w)).toBeGreaterThan(s(w * 0.98));
    expect(s(w)).toBeGreaterThan(s(w * 1.02));
    // A 7 m/s sea's peak is ~43 m long with a ~5.2 s period.
    expect(wavelength(w)).toBeCloseTo(42.8, 0);
    expect(waveOmega(wavelength(w))).toBeCloseTo(w, 6);
  });

  it('integrates to about Cox & Munk’s slope down to capillary waves', () => {
    // From half the peak frequency to the 1.7 cm capillary–gravity crossover: within 25% at 5–7 m/s.
    const capillary = waveOmega(0.0171);
    for (const wind of [5, 7]) {
      const ratio = slopeVariance(wind, peakOmega(wind) * 0.5, capillary) / coxMunkSlope(wind);
      expect(ratio).toBeGreaterThan(0.75);
      expect(ratio).toBeLessThan(1.25);
    }
  });

  it('makes deterministic sets of waves, longest first, steeper ones shorter, never steeper than the sea', () => {
    const a = seaWaves(42, 7, STANDARD_GRAVITY, 0.5);
    expect(seaWaves(42, 7, STANDARD_GRAVITY, 0.5)).toEqual(a);
    expect(seaWaves(43, 7, STANDARD_GRAVITY, 0.5)).not.toEqual(a);
    expect(a.sets).toHaveLength(WAVE_SETS);
    for (const set of a.sets) {
      expect(set).toHaveLength(WAVES_PER_SET);
      for (let i = 1; i < set.length; i++) expect(set[i]!.length).toBeLessThan(set[i - 1]!.length);
      expect(set[0]!.length).toBeGreaterThan(wavelength(a.peakOmega));
      expect(set[set.length - 1]!.length).toBeGreaterThanOrEqual(0.5);
      for (const w of set) {
        expect(Math.abs(w.angle)).toBeLessThan(Math.PI / 2);
        expect(w.omega * w.omega).toBeCloseTo((STANDARD_GRAVITY * 2 * Math.PI) / w.length, 6);
      }
      expect(drawnVariance(set)).toBeGreaterThan(0);
      expect(drawnVariance(set)).toBeLessThan(a.meanSquareSlope);
    }
  });

  it('is calm without wind, and longer and slower under weaker gravity', () => {
    const calm = seaWaves(1, 0, STANDARD_GRAVITY, 0.5);
    expect(calm.sets).toHaveLength(0);
    expect(calm.meanSquareSlope).toBeCloseTo(0.003, 6);
    const earth = seaWaves(1, 7, STANDARD_GRAVITY, 0.5);
    const low = seaWaves(1, 7, STANDARD_GRAVITY * 0.14, 0.5);
    expect(wavelength(low.peakOmega, low.gravity)).toBeGreaterThan(wavelength(earth.peakOmega, earth.gravity) * 5);
    expect(low.peakOmega).toBeLessThan(earth.peakOmega);
  });

  it('wraps phases to [0, 2π) and keeps them continuous at huge times', () => {
    const [w] = seaWaves(3, 7, STANDARD_GRAVITY, 0.5).sets[0]!;
    for (const t of [0, 1, 1e3, 1e7]) {
      const p = wavePhase(w!, t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(Math.PI * 2);
      // A small step moves the phase by -ω dt (mod 2π).
      const step = (((p - wavePhase(w!, t + 0.01)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      expect(step).toBeCloseTo(w!.omega * 0.01, 5);
    }
  });
});
