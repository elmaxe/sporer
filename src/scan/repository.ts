import type { AnimalSpecies } from '../gen/animals';
import type { PlantSpecies } from '../gen/plants';

/*
 * The species repository: every animal and plant species the player has
 * scanned with the scanner (scan/Scanner.ts), in the order they were found,
 * shown by the repository menu (ui/RepositoryDialog.ts). Pure data, kept by
 * the scene manager for the whole game and saved on the device per galaxy
 * (`saveRepository`), so a collection outlives the visit. JSON-able.
 */

/** A species found: an animal's or a plant's, keyed as the cargo hold keys them (cargo/inventory.ts `animalKey`, `speciesKey`). */
export type Discovery = { readonly kind: 'animal'; readonly species: AnimalSpecies } | { readonly kind: 'plant'; readonly species: PlantSpecies };

export type RepositoryEntry = Discovery & {
  /** Which species it is, wherever it lives: its home body's key and its index there. */
  readonly key: string;
  /** The body it lives on (where it was first found: an animal or a plant set down elsewhere keeps its own), and that body's system if known. */
  readonly home: string;
  readonly system: string | null;
  /** The body it was scanned on, if not its home (one the player set down there). */
  readonly seenOn: string | null;
  /** Its number in the repository: 1 for the first species found. */
  readonly number: number;
  /** When it was scanned (ms since 1970, the device's clock). */
  readonly time: number;
};

export interface RepositoryData {
  entries: RepositoryEntry[];
}

/** Where a species was scanned: its home body and system, and where it was seen if it had been moved. */
export interface ScanPlace {
  home: string;
  system: string | null;
  seenOn: string | null;
}

export class SpeciesRepository {
  private readonly list: RepositoryEntry[] = [];
  private readonly byKey = new Map<string, RepositoryEntry>();
  private _version = 0;

  constructor(
    /** Called after every new discovery (saving it on the device), not on `load`. */
    private readonly onChange: (repository: SpeciesRepository) => void = () => {},
  ) {}

  /** Every species found, oldest first. */
  get entries(): readonly RepositoryEntry[] {
    return this.list;
  }

  /** Goes up on every change (views redraw when it does). */
  get version(): number {
    return this._version;
  }

  get size(): number {
    return this.list.length;
  }

  /** How many animal and plant species it holds. */
  count(kind: Discovery['kind']): number {
    let n = 0;
    for (const e of this.list) if (e.kind === kind) n++;
    return n;
  }

  has(key: string): boolean {
    return this.byKey.has(key);
  }

  entry(key: string): RepositoryEntry | null {
    return this.byKey.get(key) ?? null;
  }

  /**
   * Adds species `key` (found as `found`, at `place`, at `time`) if it isn't
   * in yet. Returns its entry and whether it's new.
   */
  add(key: string, found: Discovery, place: ScanPlace, time: number): { entry: RepositoryEntry; added: boolean } {
    const known = this.byKey.get(key);
    if (known) return { entry: known, added: false };
    const entry = { ...discoveryOf(found), key, home: place.home, system: place.system, seenOn: place.seenOn, number: this.list.length + 1, time } as RepositoryEntry;
    this.list.push(entry);
    this.byKey.set(key, entry);
    this._version++;
    this.onChange(this);
    return { entry, added: true };
  }

  toJSON(): RepositoryData {
    return { entries: this.list.map((e) => ({ ...e })) };
  }

  /** Replaces what it holds (a saved collection, or a debug dump's); entries without a kind, key or species are skipped. */
  load(data: RepositoryData | null | undefined): void {
    this.list.length = 0;
    this.byKey.clear();
    for (const e of data?.entries ?? []) {
      if (!e || (e.kind !== 'animal' && e.kind !== 'plant') || typeof e.key !== 'string' || !e.species || this.byKey.has(e.key)) continue;
      const entry = {
        ...discoveryOf(e),
        key: e.key,
        home: String(e.home ?? ''),
        system: e.system ?? null,
        seenOn: e.seenOn ?? null,
        number: this.list.length + 1,
        time: Number(e.time) || 0,
      } as RepositoryEntry;
      this.list.push(entry);
      this.byKey.set(e.key, entry);
    }
    this._version++;
  }
}

/** Just what was found (its kind and species). */
function discoveryOf(d: Discovery): Discovery {
  return d.kind === 'animal' ? { kind: 'animal', species: d.species } : { kind: 'plant', species: d.species };
}

/** Where the repository of galaxy `seed` is kept on the device. */
export function repositoryStorageKey(seed: number): string {
  return `spore2.repository.${seed}`;
}

/** The repository saved on the device for galaxy `seed`, or null (none, unreadable, or storage off). */
export function loadRepository(seed: number): RepositoryData | null {
  try {
    const text = localStorage.getItem(repositoryStorageKey(seed));
    if (!text) return null;
    const data = JSON.parse(text) as RepositoryData;
    return Array.isArray(data?.entries) ? data : null;
  } catch {
    return null;
  }
}

/** Saves the repository on the device for galaxy `seed` (quietly does nothing if it can't). */
export function saveRepository(seed: number, repository: SpeciesRepository): void {
  try {
    localStorage.setItem(repositoryStorageKey(seed), JSON.stringify(repository.toJSON()));
  } catch {
    // Private browsing or a full storage: kept for this visit only.
  }
}
