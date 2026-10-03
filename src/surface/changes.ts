import type { VolcanoSite } from '../combat/volcano';
import type { PlantSpecies } from '../gen/plants';

/**
 * What the player has done to a planet's surface entities, kept outside the
 * planet level (which is built afresh on each visit): a removed plant stays
 * gone after leaving and coming back, a plant set down by the cargo beam
 * stays where it took root, and a volcano raised by a volcano bomb stands. Generated plants are the same every time (see
 * gen/plants.ts), so these lists are all that save/load will need.
 */
export interface SurfaceChangesData {
  /** Ids of removed plants (generated or planted). */
  removed: string[];
  /** Plants set down here that took root (removed ones left out). */
  planted?: PlantedPlant[];
  /** Volcanoes raised by volcano bombs, in the order they were (older saves have none). */
  volcanoes?: VolcanoSite[];
}

/** A plant the player set down that took root: its species (from wherever it grew) and where it stands. */
export interface PlantedPlant {
  /** `planted:<n>`, unique on its body. */
  readonly id: string;
  /** The species' key in the cargo hold (cargo/inventory.ts `speciesKey`), so it stacks with its kind when beamed up again. */
  readonly speciesKey: string;
  readonly species: PlantSpecies;
  /** The body it came from (for the tooltip). */
  readonly origin: string;
  /** Unit direction from the body's centre (body frame), and the ground's radius there. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  /** Multiplies the species' size. */
  readonly scale: number;
  /** Turn about the up axis, radians. */
  readonly yaw: number;
}

export const PLANTED_PREFIX = 'planted:';

export class SurfaceChanges {
  private readonly removed = new Set<string>();
  private readonly planted = new Map<string, PlantedPlant>();
  private nextPlanted = 0;
  private readonly _volcanoes: VolcanoSite[] = [];

  isRemoved(id: string): boolean {
    return this.removed.has(id);
  }

  /** Records a removal; false if it already was. A planted plant is forgotten altogether. */
  remove(id: string): boolean {
    if (this.planted.delete(id)) return true;
    if (this.removed.has(id)) return false;
    this.removed.add(id);
    return true;
  }

  get removedCount(): number {
    return this.removed.size;
  }

  /** The plants set down here that took root. */
  get plantedPlants(): IterableIterator<PlantedPlant> {
    return this.planted.values();
  }

  get plantedCount(): number {
    return this.planted.size;
  }

  /** Records a plant that took root here (its id is given here) and returns it. */
  plant(p: Omit<PlantedPlant, 'id'>): PlantedPlant {
    const record: PlantedPlant = { ...p, id: `${PLANTED_PREFIX}${this.nextPlanted++}` };
    this.planted.set(record.id, record);
    return record;
  }

  /** The volcanoes raised on the planet, oldest first. */
  get volcanoes(): readonly VolcanoSite[] {
    return this._volcanoes;
  }

  /** Records a volcano raised at `site`. */
  addVolcano(site: VolcanoSite): void {
    this._volcanoes.push({ ...site });
  }

  toJSON(): SurfaceChangesData {
    return { removed: [...this.removed], planted: [...this.planted.values()], volcanoes: this._volcanoes.map((v) => ({ ...v })) };
  }

  static fromJSON(data: SurfaceChangesData): SurfaceChanges {
    const changes = new SurfaceChanges();
    for (const id of data.removed) changes.removed.add(id);
    for (const p of data.planted ?? []) {
      changes.planted.set(p.id, p);
      const n = Number(p.id.slice(PLANTED_PREFIX.length));
      if (Number.isInteger(n)) changes.nextPlanted = Math.max(changes.nextPlanted, n + 1);
    }
    for (const v of data.volcanoes ?? []) changes.addVolcano(v);
    return changes;
  }
}

/** The change lists of every planet visited, by planet key. Owned by the scene manager. */
export class SurfaceChangeStore {
  private readonly lists = new Map<string, SurfaceChanges>();

  forPlanet(key: string): SurfaceChanges {
    let list = this.lists.get(key);
    if (!list) this.lists.set(key, (list = new SurfaceChanges()));
    return list;
  }

  /** Replaces a body's list (restoring a saved game or a debug dump; takes effect the next time its level is built). */
  set(key: string, changes: SurfaceChanges): void {
    this.lists.set(key, changes);
  }

  /** The planet's list if anything was ever done there, without making one. */
  find(key: string): SurfaceChanges | null {
    return this.lists.get(key) ?? null;
  }
}
