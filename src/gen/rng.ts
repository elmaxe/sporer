/**
 * Deterministic 32-bit hash of any mix of numbers and strings. Use it to
 * derive seeds: `hashSeed(galaxySeed, 'star', id)`.
 */
export function hashSeed(...parts: (number | string)[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    // Separator, so ('ab', 'c') and ('a', 'bc') hash differently.
    h ^= 0xff;
    h = Math.imul(h, 0x01000193);
  }
  // murmur3 finaliser for good avalanche.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Seeded PRNG (mulberry32). All procedural generation must use this, never
 * `Math.random`, so the same seed always produces the same universe.
 */
export class Rng {
  private state: number;

  constructor(readonly seed: number) {
    this.state = seed >>> 0;
  }

  /**
   * An independent child stream. It depends only on this Rng's seed and the
   * label, not on how many numbers have been drawn, so generation order
   * never shifts results elsewhere.
   */
  fork(...label: (number | string)[]): Rng {
    return new Rng(hashSeed(this.seed, ...label));
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** -1 or 1. */
  sign(): number {
    return this.next() < 0.5 ? -1 : 1;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() from empty array');
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Picks a value with probability proportional to its weight. */
  weighted<T>(entries: readonly (readonly [value: T, weight: number])[]): T {
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = this.next() * total;
    for (const [value, w] of entries) {
      r -= w;
      if (r < 0) return value;
    }
    return entries[entries.length - 1]![0];
  }

  /** Normally distributed value (Box–Muller). */
  gaussian(mean = 0, stdDev = 1): number {
    const u = 1 - this.next(); // (0, 1], avoids log(0)
    const v = this.next();
    return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/** Turns a URL/user-provided seed into a number: integers pass through, text is hashed. */
export function parseSeed(input: string): number {
  const trimmed = input.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) >>> 0 : hashSeed(trimmed);
}
