import type { VolcanoSite } from '../combat/volcano';

/**
 * What the player has done to a planet's surface entities, kept outside the
 * planet level (which is built afresh on each visit): a removed plant stays
 * gone after leaving and coming back. Generated plants are the same every
 * time (see gen/plants.ts), so this list is all that save/load will need.
 */
export interface SurfaceChangesData {
  /** Ids of removed plants. */
  removed: string[];
  /** Volcanoes raised by volcano bombs, in the order they were (older saves have none). */
  volcanoes?: VolcanoSite[];
}

export class SurfaceChanges {
  private readonly removed = new Set<string>();
  private readonly _volcanoes: VolcanoSite[] = [];

  isRemoved(id: string): boolean {
    return this.removed.has(id);
  }

  /** Records a removal; false if it already was. */
  remove(id: string): boolean {
    if (this.removed.has(id)) return false;
    this.removed.add(id);
    return true;
  }

  get removedCount(): number {
    return this.removed.size;
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
    return { removed: [...this.removed], volcanoes: this._volcanoes.map((v) => ({ ...v })) };
  }

  static fromJSON(data: SurfaceChangesData): SurfaceChanges {
    const changes = new SurfaceChanges();
    for (const id of data.removed) changes.removed.add(id);
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

  /** The planet's list if anything was ever done there, without making one. */
  find(key: string): SurfaceChanges | null {
    return this.lists.get(key) ?? null;
  }
}
