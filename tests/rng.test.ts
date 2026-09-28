import { describe, expect, it } from 'vitest';
import { hashSeed, parseSeed, Rng } from '../src/gen/rng';
import { hslToHex } from '../src/gen/color';
import { generateName, romanNumeral } from '../src/gen/names';

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different sequences for different seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('next() stays in [0, 1) and is roughly uniform', () => {
    const rng = new Rng(7);
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 10_000).toBeCloseTo(0.5, 1);
  });

  it('int() is inclusive at both ends', () => {
    const rng = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('weighted() follows the weights', () => {
    const rng = new Rng(11);
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 10_000; i++) counts[rng.weighted<'a' | 'b'>([['a', 3], ['b', 1]])]++;
    expect(counts.a / 10_000).toBeCloseTo(0.75, 1);
  });

  it('gaussian() has the requested mean and spread', () => {
    const rng = new Rng(5);
    const values = Array.from({ length: 10_000 }, () => rng.gaussian(10, 2));
    const mean = values.reduce((a, b) => a + b) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
    expect(mean).toBeCloseTo(10, 0);
    expect(sd).toBeCloseTo(2, 0);
  });

  it('fork() depends only on seed and label, not on draws so far', () => {
    const a = new Rng(9);
    const b = new Rng(9);
    b.next();
    b.next();
    expect(a.fork('planet', 3).next()).toBe(b.fork('planet', 3).next());
    expect(a.fork('planet', 3).next()).not.toBe(a.fork('planet', 4).next());
  });
});

describe('hashSeed / parseSeed', () => {
  it('distinguishes part boundaries', () => {
    expect(hashSeed('ab', 'c')).not.toBe(hashSeed('a', 'bc'));
  });

  it('passes integers through and hashes text', () => {
    expect(parseSeed('1337')).toBe(1337);
    expect(parseSeed('andromeda')).toBe(parseSeed('andromeda'));
    expect(parseSeed('andromeda')).not.toBe(parseSeed('milkyway'));
  });
});

describe('colour and names', () => {
  it('converts HSL to hex', () => {
    expect(hslToHex(0, 1, 0.5)).toBe('#ff0000');
    expect(hslToHex(120, 1, 0.5)).toBe('#00ff00');
    expect(hslToHex(240, 1, 0.5)).toBe('#0000ff');
    expect(hslToHex(0, 0, 1)).toBe('#ffffff');
    expect(hslToHex(-120, 1, 0.5)).toBe('#0000ff');
  });

  it('generates capitalised, deterministic names of reasonable length', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 200; i++) {
      const name = generateName(rng);
      expect(name).toMatch(/^[A-Z][a-z]{2,}$/);
      expect(name.length).toBeLessThanOrEqual(16);
    }
    expect(generateName(new Rng(8))).toBe(generateName(new Rng(8)));
  });

  it('formats roman numerals', () => {
    expect(romanNumeral(1)).toBe('I');
    expect(romanNumeral(4)).toBe('IV');
    expect(romanNumeral(20)).toBe('20');
  });
});
