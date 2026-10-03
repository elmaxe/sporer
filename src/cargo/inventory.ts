import type { PlantSpecies } from '../gen/plants';

/*
 * The ship's cargo hold: what the abduction beam has brought up, kept as
 * stacks, one per species, in the item bar's Inventory tab. Pure data, kept by
 * the scene manager for the whole game (JSON-able for save/load), so a plant
 * taken on one planet can be set down on another.
 */

/** Stacks the hold has room for (the Inventory tab's slots after the beam's). */
export const CARGO_STACKS = 5;
/** Plants a stack holds. */
export const STACK_SIZE = 10;

/** One species of plant in the hold, and how many. */
export interface CargoStack {
  /** Which species it is, wherever it grew: the body's key and the species' index there (`speciesKey`). */
  readonly key: string;
  readonly species: PlantSpecies;
  /** The body it was taken from, for the tooltip. */
  readonly origin: string;
  count: number;
}

export interface InventoryData {
  stacks: { key: string; species: PlantSpecies; origin: string; count: number }[];
}

/** A species' key: the same species from the same body stacks together. */
export function speciesKey(bodyKey: string, index: number): string {
  return `${bodyKey}#${index}`;
}

export class Inventory {
  private readonly list: CargoStack[] = [];
  private _version = 0;

  /** The stacks, in the order they were first filled. */
  get stacks(): readonly CargoStack[] {
    return this.list;
  }

  /** Goes up on every change (the item bar redraws its slots when it does). */
  get version(): number {
    return this._version;
  }

  stack(key: string): CargoStack | null {
    return this.list.find((s) => s.key === key) ?? null;
  }

  /** Plants in the hold. */
  get total(): number {
    return this.list.reduce((n, s) => n + s.count, 0);
  }

  /** True when nothing more fits: every stack is full and there's no room for another. */
  get full(): boolean {
    return this.list.length >= CARGO_STACKS && this.list.every((s) => s.count >= STACK_SIZE);
  }

  /** Whether one more of species `key` fits: its stack has room, or there's a free stack for it. */
  canAdd(key: string): boolean {
    const s = this.stack(key);
    return s ? s.count < STACK_SIZE : this.list.length < CARGO_STACKS;
  }

  /**
   * Whether one more of species `key` fits once the plants already on their
   * way up (`pending`, one key per plant) are in: the beam can lift several
   * at once, and stops catching when the hold would overflow.
   */
  canAddAfter(key: string, pending: readonly string[]): boolean {
    let same = 0;
    let fresh = 0;
    for (let i = 0; i < pending.length; i++) {
      const k = pending[i]!;
      if (k === key) same++;
      // Each new species on the way takes a stack (counted once).
      if (!this.stack(k) && pending.indexOf(k) === i) fresh++;
    }
    const s = this.stack(key);
    if (s) return s.count + same < STACK_SIZE;
    if (same > 0) return same < STACK_SIZE;
    return this.list.length + fresh < CARGO_STACKS;
  }

  /** Puts one plant of `species` (key `key`) in the hold; null if it doesn't fit. */
  add(key: string, species: PlantSpecies, origin: string): CargoStack | null {
    if (!this.canAdd(key)) return null;
    let s = this.stack(key);
    if (s) s.count++;
    else this.list.push((s = { key, species, origin, count: 1 }));
    this._version++;
    return s;
  }

  /** Takes one plant of stack `key` out of the hold (the stack goes when it's empty); null if there's none. */
  take(key: string): CargoStack | null {
    const i = this.list.findIndex((s) => s.key === key);
    if (i < 0) return null;
    const s = this.list[i]!;
    s.count--;
    if (s.count <= 0) this.list.splice(i, 1);
    this._version++;
    return s;
  }

  toJSON(): InventoryData {
    return { stacks: this.list.map(({ key, species, origin, count }) => ({ key, species, origin, count })) };
  }

  /** Replaces what's in the hold (restoring a saved game or a debug dump). */
  load(data: InventoryData): void {
    this.list.length = 0;
    for (const s of data.stacks.slice(0, CARGO_STACKS)) {
      if (s.count > 0) this.list.push({ key: s.key, species: s.species, origin: s.origin, count: Math.min(STACK_SIZE, s.count) });
    }
    this._version++;
  }
}
