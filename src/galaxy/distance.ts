import { LIGHT_YEARS_PER_UNIT } from '../gen/galaxy';

/**
 * Kilometres in a light year: light's speed (299,792.458 km/s, exact) over a
 * Julian year (365.25 days of 86,400 s), as the IAU defines it
 * (docs/research/distances.md).
 */
export const KM_PER_LIGHT_YEAR = 299_792.458 * 365.25 * 86_400;
/** Kilometres in an astronomical unit, exact since IAU 2012 Resolution B2. */
export const KM_PER_AU = 149_597_870.7;

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const LARGE = [
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
] as const;

/** A galaxy-map distance in light years. */
export function lightYears(units: number): number {
  return units * LIGHT_YEARS_PER_UNIT;
}

/** "0.4", "12.5", "1,093": a decimal under 100, whole numbers grouped by thousands above. */
function grouped(x: number): string {
  if (x < 100) return x.toFixed(1);
  return Math.round(x).toLocaleString('en-US');
}

/** "69.1 million", "5.53 billion", or "48,200" below a million: three significant figures. */
function words(x: number): string {
  for (const [size, name] of LARGE) {
    if (x >= size * 0.9995) return `${(x / size).toPrecision(3)} ${name}`;
  }
  return grouped(x);
}

/** "1.03 × 10¹⁶": three significant figures in scientific notation. */
function scientific(x: number): string {
  if (x <= 0) return '0';
  let exp = Math.floor(Math.log10(x));
  let mantissa = (x / 10 ** exp).toFixed(2);
  // 9.996 rounds up to 10.00: carry it into the exponent.
  if (mantissa.startsWith('10')) {
    exp += 1;
    mantissa = (x / 10 ** exp).toFixed(2);
  }
  const power = String(exp)
    .split('')
    .map((d) => (d === '-' ? '⁻' : SUPERSCRIPT[Number(d)]))
    .join('');
  return `${mantissa} × 10${power}`;
}

/**
 * A galaxy-map distance as the player reads it: light years, astronomical
 * units and kilometres, e.g. "1,093 light years · 69.1 million AU · 1.03 × 10¹⁶ km".
 */
export function describeDistance(units: number): string {
  const ly = lightYears(units);
  const km = ly * KM_PER_LIGHT_YEAR;
  return `${grouped(ly)} light years · ${words(km / KM_PER_AU)} AU · ${scientific(km)} km`;
}
