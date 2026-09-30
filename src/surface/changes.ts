/**
 * What the player has done to a planet's surface entities, kept outside the
 * planet level (which is built afresh on each visit): a removed plant stays
 * gone after leaving and coming back. Generated plants are the same every
 * time (see gen/plants.ts), so this list is all that save/load will need.
 */
export interface SurfaceChangesData {
  /** Ids of removed plants. */
  removed: string[];
}

export class SurfaceChanges {
  private readonly removed = new Set<string>();

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

  toJSON(): SurfaceChangesData {
    return { removed: [...this.removed] };
  }

  static fromJSON(data: SurfaceChangesData): SurfaceChanges {
    const changes = new SurfaceChanges();
    for (const id of data.removed) changes.removed.add(id);
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
}
