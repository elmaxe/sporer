import { growAnimal } from '../gen/animalForm';
import type { AnimalSpecies } from '../gen/animals';
import type { PlantSpecies } from '../gen/plants';

/*
 * The ship's cargo hold: what the abduction beam has brought up, kept as
 * stacks, one per species, in the item bar's Inventory tab. Pure data, kept by
 * the scene manager for the whole game (JSON-able for save/load), so an
 * animal or a plant taken on one planet can be set down on another.
 */

/** Stacks the hold has room for (the Inventory tab's slots after the beam's). */
export const CARGO_STACKS = 5;
/** Animals or plants a stack holds. */
export const STACK_SIZE = 10;

/** What a stack holds: a species of animal or of plant. */
export type Cargo = { readonly kind: 'plant'; readonly species: PlantSpecies } | { readonly kind: 'animal'; readonly species: AnimalSpecies };
export type CargoKind = Cargo['kind'];

/** One species in the hold, and how many. */
export type CargoStack = Cargo & {
  /** Which species it is, wherever it lived: the body's key and the species' index there (`speciesKey`, `animalKey`). */
  readonly key: string;
  /** The body it was taken from, for the tooltip. */
  readonly origin: string;
  count: number;
};

export interface InventoryData {
  /** `kind` is missing in older saves, which held plants only. */
  stacks: ({ key: string; origin: string; count: number } & ({ kind?: 'plant'; species: PlantSpecies } | { kind: 'animal'; species: AnimalSpecies }))[];
}

/** A plant species' key: the same species from the same body stacks together. */
export function speciesKey(bodyKey: string, index: number): string {
  return `${bodyKey}#${index}`;
}

/** An animal species' key, the same way (never the same as a plant's). */
export function animalKey(bodyKey: string, index: number): string {
  return `${bodyKey}#a${index}`;
}

export interface CargoSize {
  /** How tall it stands, and its reach across from its middle (a crown's radius; an animal's longest reach), units. */
  readonly height: number;
  readonly radius: number;
}

const animalSizes = new WeakMap<AnimalSpecies, CargoSize>();

/** The species' size at scale 1, for the beam and its effects. */
export function cargoSize(c: Cargo): CargoSize {
  if (c.kind === 'plant') return { height: c.species.height, radius: c.species.crownRadius };
  let size = animalSizes.get(c.species);
  if (!size) {
    const k = growAnimal(c.species);
    size = { height: k.top, radius: Math.max(k.front, k.back, k.width) };
    animalSizes.set(c.species, size);
  }
  return size;
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

  /** Animals and plants in the hold. */
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

  /** Puts one animal or plant of `cargo`'s species (key `key`) in the hold; null if it doesn't fit. */
  add(key: string, cargo: Cargo, origin: string): CargoStack | null {
    if (!this.canAdd(key)) return null;
    let s = this.stack(key);
    if (s) s.count++;
    else this.list.push((s = { ...cargo, key, origin, count: 1 }));
    this._version++;
    return s;
  }

  /** Takes one of stack `key` out of the hold (the stack goes when it's empty); null if there's none. */
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
    return { stacks: this.list.map((s) => ({ ...cargoOf(s), key: s.key, origin: s.origin, count: s.count })) };
  }

  /** Replaces what's in the hold (restoring a saved game or a debug dump). */
  load(data: InventoryData): void {
    this.list.length = 0;
    for (const s of data.stacks.slice(0, CARGO_STACKS)) {
      if (s.count <= 0) continue;
      const cargo: Cargo = s.kind === 'animal' ? { kind: 'animal', species: s.species } : { kind: 'plant', species: s.species };
      this.list.push({ ...cargo, key: s.key, origin: s.origin, count: Math.min(STACK_SIZE, s.count) });
    }
    this._version++;
  }
}

/** Just what a stack holds (its kind and species). */
export function cargoOf(s: Cargo): Cargo {
  return s.kind === 'animal' ? { kind: 'animal', species: s.species } : { kind: 'plant', species: s.species };
}
