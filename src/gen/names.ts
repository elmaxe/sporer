import type { Rng } from './rng';

const ONSETS = ['', '', 'b', 'br', 'c', 'ch', 'd', 'dr', 'f', 'g', 'gl', 'h', 'j', 'k', 'kr', 'l', 'm', 'n', 'p', 'pr', 'qu', 'r', 's', 'sh', 'st', 't', 'th', 'tr', 'v', 'x', 'z', 'zh'];
const VOWELS = ['a', 'a', 'e', 'e', 'i', 'o', 'o', 'u', 'y', 'ae', 'ai', 'ia', 'io', 'ou'];
const CODAS = ['', '', '', '', 'n', 'r', 's', 'x', 'l', 'th', 'm', 'k', 'nd', 'rn'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Pronounceable alien name, e.g. "Zhoranix". */
export function generateName(rng: Rng): string {
  let name = '';
  while (name.length < 3) {
    name = '';
    const syllables = rng.weighted([
      [2, 5],
      [3, 4],
      [1, 1],
    ] as const);
    for (let i = 0; i < syllables; i++) {
      name += rng.pick(ONSETS) + rng.pick(VOWELS) + (i === syllables - 1 || rng.chance(0.3) ? rng.pick(CODAS) : '');
    }
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** 1 → "I", 4 → "IV", … Falls back to digits past the table. */
export function romanNumeral(n: number): string {
  return ROMAN[n - 1] ?? String(n);
}
