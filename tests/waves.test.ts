import { describe, expect, it } from 'vitest';
import {
  BREAKER_INDEX,
  STANDARD_GRAVITY,
  CASCADES,
  WAVES_PER_CASCADE,
  coxMunkSlope,
  peakOmega,
  seaVariance,
  seaWaves,
  shoalWavenumber,
  shoalingCoefficient,
  shorePhase,
  shoreSwells,
  significantHeight,
  slopeVariance,
  spreadPower,
  stormWind,
  waveOmega,
  whitecapCover,
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

  it('makes deterministic cascades of waves on repeating tiles, longest first, never steeper than the sea', () => {
    const a = seaWaves(42, 7, STANDARD_GRAVITY, 0.5);
    expect(seaWaves(42, 7, STANDARD_GRAVITY, 0.5)).toEqual(a);
    expect(seaWaves(43, 7, STANDARD_GRAVITY, 0.5)).not.toEqual(a);
    expect(a.cascades).toHaveLength(CASCADES);
    for (const { size, waves } of a.cascades) {
      expect(waves).toHaveLength(WAVES_PER_CASCADE);
      for (let i = 1; i < waves.length; i++) expect(waves[i]!.length).toBeLessThanOrEqual(waves[i - 1]!.length);
      for (const w of waves) {
        // A whole number of waves across the tile both ways, so it repeats: its wavevector is the lattice's.
        expect(Number.isInteger(w.nx) && Number.isInteger(w.nz)).toBe(true);
        expect(w.nx !== 0 || w.nz !== 0).toBe(true);
        expect(w.length).toBeCloseTo(size / Math.hypot(w.nx, w.nz), 9);
        expect(w.angle).toBeCloseTo(Math.atan2(w.nz, w.nx), 9);
        expect(w.omega * w.omega).toBeCloseTo((STANDARD_GRAVITY * 2 * Math.PI) / w.length, 6);
      }
    }
    // Longest first across the cascades, from below the peak down to about the shortest asked for.
    expect(a.cascades[0]!.waves[0]!.length).toBeGreaterThan(wavelength(a.peakOmega));
    expect(a.cascades[CASCADES - 1]!.waves[WAVES_PER_CASCADE - 1]!.length).toBeGreaterThan(0.4);
    for (let c = 1; c < CASCADES; c++) {
      expect(a.cascades[c]!.size).toBeLessThan(a.cascades[c - 1]!.size);
      // Tiles in no simple ratio, so their repeats never line up: not within 2% of p/q for q up to 8.
      const r = a.cascades[c - 1]!.size / a.cascades[c]!.size;
      for (let q = 1; q <= 8; q++) expect(Math.abs(r * q - Math.round(r * q)) / q).toBeGreaterThan(0.02 / q);
    }
    // The drawn waves carry the spectrum's slope from the lowest wave down to the shortest, under the whole sea's.
    expect(seaVariance(a)).toBeCloseTo(slopeVariance(7, 0.75 * a.peakOmega, Math.sqrt((STANDARD_GRAVITY * 2 * Math.PI) / 0.5)), 6);
    expect(seaVariance(a)).toBeLessThan(a.meanSquareSlope);
  });

  it('spreads the waves about the wind as Hasselmann et al. do: narrowest at the peak, wider either side', () => {
    // WAFO: s = 6.97 (ω/ω_p)^4.06 below the peak, 9.77 (ω/ω_p)^−2.52 above.
    expect(spreadPower(1)).toBeCloseTo(9.77, 6);
    expect(spreadPower(0.999)).toBeCloseTo(6.97, 1);
    expect(spreadPower(2)).toBeCloseTo(9.77 * 2 ** -2.52, 6);
    expect(spreadPower(0.5)).toBeLessThan(spreadPower(0.9));
    expect(spreadPower(4)).toBeLessThan(spreadPower(2));
    // So the longest cascade runs with the wind and the shortest goes every way.
    const a = seaWaves(5, 7, STANDARD_GRAVITY, 0.5);
    const meanAngle = (c: number) => a.cascades[c]!.waves.reduce((sum, w) => sum + Math.abs(w.angle), 0) / WAVES_PER_CASCADE;
    expect(meanAngle(0)).toBeLessThan(Math.PI / 4);
    expect(meanAngle(CASCADES - 1)).toBeGreaterThan(Math.PI / 3);
  });

  it('is calm without wind, and longer and slower under weaker gravity', () => {
    const calm = seaWaves(1, 0, STANDARD_GRAVITY, 0.5);
    expect(calm.cascades).toHaveLength(0);
    expect(calm.meanSquareSlope).toBeCloseTo(0.003, 6);
    const earth = seaWaves(1, 7, STANDARD_GRAVITY, 0.5);
    const low = seaWaves(1, 7, STANDARD_GRAVITY * 0.14, 0.5);
    expect(wavelength(low.peakOmega, low.gravity)).toBeGreaterThan(wavelength(earth.peakOmega, earth.gravity) * 5);
    expect(low.peakOmega).toBeLessThan(earth.peakOmega);
  });

  it('wraps phases to [0, 2π) and keeps them continuous at huge times', () => {
    const [w] = seaWaves(3, 7, STANDARD_GRAVITY, 0.5).cascades[0]!.waves;
    for (const t of [0, 1, 1e3, 1e7]) {
      const p = wavePhase(w!, t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(Math.PI * 2);
      // A small step moves the phase by -ω dt (mod 2π).
      const step = (((p - wavePhase(w!, t + 0.01)) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      expect(step).toBeCloseTo(w!.omega * 0.01, 5);
    }
  });

  it('covers about 1% of the sea in whitecaps at 10 m/s, more with the wind, all of it at most', () => {
    // Monahan & O'Muircheartaigh's fit as a fraction; the two other fits in Albert et al. (2016) give 0.8% at 10 m/s.
    expect(whitecapCover(10)).toBeGreaterThan(0.008);
    expect(whitecapCover(10)).toBeLessThan(0.012);
    expect(whitecapCover(7)).toBeLessThan(whitecapCover(15));
    expect(whitecapCover(0)).toBe(0);
    expect(whitecapCover(60)).toBe(1);
  });

  it('blows a severe thunderstorm’s and a hurricane’s wind under storms, none under the others', () => {
    expect(stormWind('cell', 1)).toBeCloseTo(25.9, 1);
    expect(stormWind('cyclone', 1)).toBe(33);
    expect(stormWind('cyclone', 0.5)).toBe(16.5);
    expect(stormWind('dust', 1)).toBe(0);
  });
});

describe('shore waves', () => {
  /** k from ω² = g k tanh(k h) by Newton's method, the exact answer the approximation is checked against. */
  const exactK = (omega: number, h: number, g = STANDARD_GRAVITY) => {
    let k = (omega * omega) / g / Math.sqrt(Math.tanh((omega * omega * h) / g));
    for (let i = 0; i < 50; i++) {
      const t = Math.tanh(k * h);
      const f = g * k * t - omega * omega;
      const df = g * t + g * k * h * (1 - t * t);
      k -= f / df;
    }
    return k;
  };

  it("follow the dispersion relation within Fenton & McKee's 1.5% (1.7% measured)", () => {
    const omega = 2 * Math.PI / 8;
    for (const h of [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100, 400]) {
      const k = shoalWavenumber(omega, h);
      expect(Math.abs(k / exactK(omega, h) - 1)).toBeLessThan(0.017);
    }
    // Deep water: the deep-water wavenumber; shallow: ω / √(g h).
    expect(shoalWavenumber(omega, 1e4)).toBeCloseTo((omega * omega) / STANDARD_GRAVITY, 8);
    expect(shoalWavenumber(omega, 0.01) / (omega / Math.sqrt(STANDARD_GRAVITY * 0.01))).toBeCloseTo(1, 2);
  });

  it("dip, then grow, as Fenton's shoaling coefficient does (Green's law in the shallows)", () => {
    const omega = 2 * Math.PI / 8;
    const L0 = wavelength(omega);
    // Deep: 1; the minimum ~0.913 near d/λ0 = 0.16; then up.
    expect(shoalingCoefficient(omega, L0)).toBeCloseTo(1, 2);
    let min = Infinity;
    let at = 0;
    for (let d = 0.05; d < 0.5; d += 0.001) {
      const ks = shoalingCoefficient(omega, d * L0);
      if (ks < min) [min, at] = [ks, d];
    }
    expect(min).toBeGreaterThan(0.9);
    expect(min).toBeLessThan(0.93);
    expect(at).toBeGreaterThan(0.13);
    expect(at).toBeLessThan(0.19);
    // Green's law: H ∝ h^−¼ in the shallowest water.
    const a = shoalingCoefficient(omega, 0.002 * L0);
    const b = shoalingCoefficient(omega, 0.001 * L0);
    expect(b / a).toBeCloseTo(2 ** 0.25, 1);
  });

  it('gain phase running out from the shore, as fast as their wavenumber over the slope', () => {
    const omega = 1.2;
    expect(shorePhase(omega, 0, 0.05)).toBe(0);
    let last = 0;
    for (const d of [0.5, 1, 2, 5, 10, 20]) {
      const p = shorePhase(omega, d, 0.05);
      expect(p).toBeGreaterThan(last);
      last = p;
    }
    // d(phase)/d(depth) = k / slope.
    const h = 3;
    const dp = (shorePhase(omega, h + 0.01, 0.05) - shorePhase(omega, h - 0.01, 0.05)) / 0.02;
    expect(dp / (shoalWavenumber(omega, h) / 0.05)).toBeCloseTo(1, 2);
    // Shallow-water limit: 2ω√(d/g) / slope.
    const shallow = shorePhase(0.05, 0.5, 1);
    expect(shallow / (2 * 0.05 * Math.sqrt(0.5 / STANDARD_GRAVITY))).toBeCloseTo(1, 2);
  });

  it('come in two swells sharing a significant height, none when calm', () => {
    expect(shoreSwells(seaWaves(1, 0, STANDARD_GRAVITY, 0.5))).toEqual([]);
    const waves = seaWaves(1, 10, STANDARD_GRAVITY, 0.5);
    const swells = shoreSwells(waves);
    expect(swells).toHaveLength(2);
    expect(swells[0]!.omega).toBeCloseTo(waves.peakOmega, 10);
    const energy = swells.reduce((e, s) => e + s.height * s.height, 0);
    expect(Math.sqrt(energy)).toBeCloseTo(significantHeight(10), 8);
    expect(BREAKER_INDEX).toBe(0.78);
  });
});
