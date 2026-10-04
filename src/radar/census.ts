import { generateHerd, herdGridSize, type AnimalPlan, type HerdData } from '../gen/animals';
import type { GroundRadius } from '../gen/plants';

/**
 * Every herd on a planet, found by visiting each of its herd cells
 * (gen/animals.ts `generateHerd`, the same herds `SurfaceAnimals` draws near
 * the camera) a few at a time, so the radar knows where a species lives
 * anywhere on the globe and the map's Species tab can count them. A cell is
 * cheap (one spot tested), and an Earth-sized globe has a few hundred. Pure:
 * no THREE, the same herds whenever it runs.
 */
export class HerdCensus {
  /** The herds found so far, in cell order. */
  readonly herds: HerdData[] = [];
  /** Cells per cube face edge, and in all. */
  readonly gridSize: number;
  readonly cells: number;
  private next = 0;
  private readonly herdCounts: number[];
  private readonly animalCounts: number[];

  constructor(
    readonly plan: AnimalPlan,
    private readonly ground: GroundRadius,
  ) {
    const n = (this.gridSize = herdGridSize(plan.radius));
    this.cells = 6 * n * n;
    this.herdCounts = plan.species.map(() => 0);
    this.animalCounts = plan.species.map(() => 0);
  }

  /** True once every cell has been looked at. */
  get done(): boolean {
    return this.next >= this.cells;
  }

  /** Share of the cells looked at, 0–1. */
  get progress(): number {
    return this.next / this.cells;
  }

  /** Looks at cells until `budgetMs` has passed (at least one), or all of them. */
  step(budgetMs: number, now: () => number = () => performance.now()): void {
    const n = this.gridSize;
    const start = now();
    do {
      if (this.done) return;
      const index = this.next++;
      const face = Math.floor(index / (n * n));
      const rest = index - face * n * n;
      const j = Math.floor(rest / n);
      const i = rest - j * n;
      const herd = generateHerd(this.plan, this.ground, face, i, j);
      if (!herd) continue;
      this.herds.push(herd);
      this.herdCounts[herd.species]!++;
      this.animalCounts[herd.species]! += herd.count;
    } while (now() - start < budgetMs);
  }

  /** Looks at every cell left (tests, automation). */
  finish(): this {
    while (!this.done) this.step(Infinity);
    return this;
  }

  /** Herds (or packs) of species `index` found so far, and the animals in them. */
  herdCount(index: number): number {
    return this.herdCounts[index] ?? 0;
  }

  animalCount(index: number): number {
    return this.animalCounts[index] ?? 0;
  }
}
