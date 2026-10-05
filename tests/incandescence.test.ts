import { describe, expect, it } from 'vitest';
import { blackbodyRgb, blackbodyXyz, crustSurfaceT, fitGlow, glowAt } from '../src/gen/incandescence';

// See docs/research/lava.md.
const chromaticity = (T: number): [number, number] => {
  const [x, y, z] = blackbodyXyz(T);
  return [x / (x + y + z), y / (x + y + z)];
};

describe('black-body glow', () => {
  it('lands on the Planckian locus', () => {
    // Kim et al.'s cubic fit of the locus: (0.5269, 0.4133) at 2000 K; the CIE gives (0.3135, 0.3236) at 6500 K. Within
    // what Wyman et al.'s fit of the observer allows (it is a few thousandths off the tables).
    for (const [T, x, y] of [
      [2000, 0.5269, 0.4133],
      [6500, 0.3135, 0.3236],
    ] as const) {
      const [cx, cy] = chromaticity(T);
      expect(Math.abs(cx - x)).toBeLessThan(0.004);
      expect(Math.abs(cy - y)).toBeLessThan(0.004);
    }
  });

  it('brightens as steeply as Planck says between dull red and the melt', () => {
    // Luminance integrated with the tabulated CIE 1931 functions (CVRL): 1.41 cd/m² at 700 °C, 3230 at 1150 °C.
    const ratio = blackbodyXyz(1150 + 273.15)[1] / blackbodyXyz(700 + 273.15)[1];
    expect(ratio).toBeGreaterThan(3230 / 1.41 * 0.95);
    expect(ratio).toBeLessThan(3230 / 1.41 * 1.05);
  });

  it('is red at a dull glow and orange at the melt, with no blue', () => {
    const dull = blackbodyRgb(1000, 1443);
    const melt = blackbodyRgb(1443, 1443);
    expect(dull[1] / dull[0]).toBeLessThan(0.05);
    expect(melt[1] / melt[0]).toBeGreaterThan(0.1);
    expect(melt[1] / melt[0]).toBeLessThan(0.2);
    expect(melt[2]).toBeLessThan(0);
  });

  it('fits the shader within 1% (red) and 11% (green, which is dim where it errs most) over 1000–1500 K', () => {
    const fit = fitGlow(1443);
    for (let T = 1000; T <= 1500; T += 50) {
      const [r, g] = blackbodyRgb(T, 1443);
      expect(Math.abs(glowAt(fit.r, T) / r - 1)).toBeLessThan(0.01);
      expect(Math.abs(glowAt(fit.g, T) / g - 1)).toBeLessThan(0.11);
    }
  });
});

describe('crust cooling', () => {
  it('follows Hon et al.’s measurements within their scatter', () => {
    // Measured on pāhoehoe: 825 °C after 1 s, 614 °C after 10 s, 563 °C after a minute.
    for (const [age, measured] of [
      [1, 825],
      [10, 614],
      [60, 563],
    ] as const) {
      expect(Math.abs(crustSurfaceT(age, 2000) - 273.15 - measured)).toBeLessThan(50);
    }
  });

  it('never runs hotter than the melt and cools as it ages', () => {
    expect(crustSurfaceT(1e-6, 1443)).toBe(1443);
    expect(crustSurfaceT(10, 1443)).toBeLessThan(crustSurfaceT(1, 1443));
    // Below the Draper point (525 °C), no visible glow, within a few minutes.
    expect(crustSurfaceT(300, 1443) - 273.15).toBeLessThan(525);
  });
});
