import { describe, expect, it } from 'vitest';
import { LIGHT_YEARS_PER_UNIT } from '../src/gen/galaxy';
import { describeDistance, KM_PER_AU, KM_PER_LIGHT_YEAR, lightYears } from '../src/galaxy/distance';

describe('galaxy distances', () => {
  it('uses the IAU units', () => {
    // A light year is exactly 9,460,730,472,580.8 km, about 63,241.077 AU (docs/research/distances.md).
    expect(KM_PER_LIGHT_YEAR).toBeCloseTo(9_460_730_472_580.8, 1);
    expect(KM_PER_LIGHT_YEAR / KM_PER_AU).toBeCloseTo(63_241.077, 3);
  });

  it('maps the map onto the Milky Way: its radius is 43,700 ly', () => {
    expect(LIGHT_YEARS_PER_UNIT).toBeCloseTo(43.7, 10);
    expect(lightYears(1000)).toBeCloseTo(43_700, 6);
  });

  it('reads in light years, AU and km', () => {
    // A neighbouring star, ~25 units away.
    expect(describeDistance(25)).toBe('1,093 light years · 69.1 million AU · 1.03 × 10¹⁶ km');
    // Across the whole map.
    expect(describeDistance(2000)).toBe('87,400 light years · 5.53 billion AU · 8.27 × 10¹⁷ km');
    // Nearly there.
    expect(describeDistance(0.1)).toBe('4.4 light years · 276,364 AU · 4.13 × 10¹³ km');
    expect(describeDistance(0)).toBe('0.0 light years · 0.0 AU · 0 km');
  });

  it('carries rounding into the next power or word', () => {
    // 9.996e15 km rounds to 1.00 × 10¹⁶, not 10.00 × 10¹⁵.
    const units = 9.996e15 / KM_PER_LIGHT_YEAR / LIGHT_YEARS_PER_UNIT;
    expect(describeDistance(units)).toMatch(/ 1\.00 × 10¹⁶ km$/);
    // 999.6 million AU reads as 1.00 billion.
    const au = (999.6e6 * KM_PER_AU) / KM_PER_LIGHT_YEAR / LIGHT_YEARS_PER_UNIT;
    expect(describeDistance(au)).toMatch(/ 1\.00 billion AU /);
  });
});
