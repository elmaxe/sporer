import type { Rng } from './rng';

/** HSL colour: hue in degrees [0, 360), saturation and lightness in [0, 1]. */
export type Hsl = readonly [h: number, s: number, l: number];

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = clamp01(s);
  l = clamp01(l);
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** An HSL base colour with random variation, as hex. */
export function jitterHsl(rng: Rng, [h, s, l]: Hsl, hue = 8, sat = 0.08, light = 0.06): string {
  return hslToHex(h + rng.range(-hue, hue), s + rng.range(-sat, sat), l + rng.range(-light, light));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
