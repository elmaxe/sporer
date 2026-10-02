/**
 * Which planets and moons have been blown apart by a planet buster, and
 * when, kept by the scene manager for the whole game (levels are rebuilt on
 * each visit): a busted body stays a debris field in the system view and in
 * low orbit, however often you leave and come back. The blast's system time
 * is all its debris needs (gen/debris.ts is a function of the time since).
 * JSON-able for save/load.
 */
export interface BustedBodiesData {
  /** Body key (see bodyKey) → the system time of the blast, seconds. */
  blasts: Record<string, number>;
}

/** A body's key in the change lists: its name and seed (unique in a galaxy). */
export function bodyKey(config: { readonly name: string; readonly seed: number }): string {
  return `${config.name}:${config.seed}`;
}

export class BustedBodies {
  private readonly blasts = new Map<string, number>();

  /** The system time of the body's blast, or null if it's whole. */
  blastTime(key: string): number | null {
    return this.blasts.get(key) ?? null;
  }

  isBusted(key: string): boolean {
    return this.blasts.has(key);
  }

  /** Records a blast at system time `time`; false (and nothing changes) if the body was busted already. */
  bust(key: string, time: number): boolean {
    if (this.blasts.has(key)) return false;
    this.blasts.set(key, time);
    return true;
  }

  get count(): number {
    return this.blasts.size;
  }

  toJSON(): BustedBodiesData {
    return { blasts: Object.fromEntries(this.blasts) };
  }

  static fromJSON(data: BustedBodiesData): BustedBodies {
    const busted = new BustedBodies();
    for (const [key, time] of Object.entries(data.blasts)) busted.blasts.set(key, time);
    return busted;
  }
}
