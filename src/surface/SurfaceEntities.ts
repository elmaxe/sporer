import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { MAX_PLANT_SCALE, PLANT_CELL_SIZE, generateCell, parsePlantId, plantGridSize, type GroundRadius, type PlantData, type PlantPlan, type PlantSpecies } from '../gen/plants';
import { HULL_DEPTH, HULL_RADIUS, obstacleClearance, type Obstacles } from '../planet/ground';
import { faceGridPoint } from '../world/cubeSphereMath';
import { GROUND_DETAIL_LAYER } from '../world/groundDepth';
import type { SurfaceChanges } from './changes';
import { FADE_START, PLANT_LODS, createPlantGeometry, createPlantMaterial, setLodTint, type PlantFadeUniforms } from './plantLook';
import { PLANT_LOD_COUNT } from './plantMesh';
import { addPlantDebug, plantParams } from './plantParams';
import { viewFreeze } from '../world/viewFreeze';

/** A cell stays loaded until it is this much further out than it was wanted (so it doesn't flicker at the edge). */
const KEEP_EXTRA = 1.15;
/** The camera must move this far (units) before cells are looked at again (the per-plant fade is in the shader, so nothing waits on it). */
const SCAN_DISTANCE = 4;
/** Instances a batch starts with; it doubles when full. */
const FIRST_CAPACITY = 64;
/** Per obstacle: unit direction (3), crown radius, radius of its top from the planet's centre. */
const OBSTACLE_STRIDE = 5;
/** The cells near the ship are kept for obstacle queries until it has moved this much further (units). */
const NEAR_SLACK = 24;

/** The plant a ray hit. The same object every time: read it before the next `pick`. */
export interface PlantHit {
  id: string;
  plant: PlantData;
  species: PlantSpecies;
  /** Along the ray. */
  distance: number;
}

/** A plant taken out of the instanced batches as an object of its own (see `SurfaceEntities.promote`). */
export interface LivePlant {
  readonly id: string;
  readonly species: PlantSpecies;
  /** Positioned on the ground where the plant stood, in the level's scene: move it, lift it, hit it. */
  readonly object: THREE.Group;
  /** It is gone for good: recorded as removed, like `remove`. */
  destroy(): void;
  /** Put it back where it grew. */
  restore(): void;
}

/** One species' plants of a cell, as instance matrices (removed and promoted plants left out), with where each stands and its size, to pick its level of detail. */
interface SpeciesGroup {
  matrices: Float32Array;
  /** Position (body frame) and size (the plant's scale) of each. */
  positions: Float32Array;
  sizes: Float32Array;
  count: number;
}

interface Cell {
  readonly key: string;
  readonly face: number;
  readonly i: number;
  readonly j: number;
  /** The cell's centre at sea level, and how far its ground and plants can reach from it. */
  readonly centre: THREE.Vector3;
  readonly bound: number;
  readonly plants: PlantData[];
  groups: (SpeciesGroup | null)[];
  /** Its standing plants as obstacles for the ship (OBSTACLE_STRIDE floats each), and the highest top among them. */
  obstacles: Float32Array;
  top: number;
  /** Per species, per level of detail: in that level's batch now. */
  readonly levels: boolean[][];
}

/** The instances of one species at one level of detail: one draw call. */
interface Batch {
  mesh: THREE.InstancedMesh;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshStandardMaterial;
  readonly uniforms: PlantFadeUniforms;
  /** Level of detail: 0 is the full plant. */
  readonly lod: number;
}

/** What `SurfaceEntities` holds now, for the lab's readout and the tests. */
export interface SurfaceStats {
  cells: number;
  /** Plants in the loaded cells (not removed). */
  plants: number;
  /** Instances in each level of detail's batches (full plants first), and the draw calls they make. */
  lods: number[];
  drawCalls: number;
  /** Triangles in those instances (before culling and the fade's discards). */
  triangles: number;
}

/**
 * Things standing on a planet's ground, for now plants (gen/plants.ts): the
 * cells around the camera are generated a few per frame within a time budget,
 * far ones dropped, and each species is drawn as one `InstancedMesh` per level
 * of detail: the full generated plant near the camera (surface/plantMesh.ts),
 * simpler ones further out down to a few dozen triangles, and nothing beyond,
 * with distances in the plant's own heights so trees show further than bushes.
 * The levels change per pixel in the shader with a dithered (screen-door)
 * fade, so nothing pops and nothing is sorted. Each time the camera has moved
 * a few units the batches are rewritten: a plant goes into the batch of every
 * level whose distances (its fade included) it could be at before the next
 * rewrite, so the costly full meshes are only drawn for the plants close
 * enough to show them (choosing by whole cells, 32 units across, put about
 * three times as many plants in the full batch).
 *
 * The API later steps need: `pick(ray)` (nearest plant along a ray), `remove(id)`
 * (recorded in the planet's change list, which outlives the level) and
 * `promote(id)` (a plant as an object of its own, for a beam to lift or a
 * weapon to hit). Static in the planet's body frame, like the globe. As
 * `Obstacles`, it says which plants the ship's hull goes through (to shake them).
 */
export class SurfaceEntities implements Entity, Obstacles {
  readonly object = new THREE.Group();
  private readonly cells = new Map<string, Cell>();
  /** Every cell's centre, unit direction: face by face, row by row. */
  private readonly centres: Float32Array;
  private readonly gridSize: number;
  private readonly cellBound: number;
  private readonly cellCount: number;
  /** Per species, per level of detail. */
  private readonly geometries: THREE.BufferGeometry[][];
  private readonly batches: Batch[][] = [];
  private readonly liveMaterials: (THREE.MeshStandardMaterial | null)[];
  private readonly live = new Map<string, LivePlant>();
  private readonly promoted = new Set<string>();
  /** The farthest any species is drawn (units, before plantParams.range). */
  private readonly maxReach: number;
  /** The widest crown of any species at the largest plant scale (units). */
  private readonly widestCrown: number;
  private readonly camera = new THREE.Vector3();
  private readonly lastScan = new THREE.Vector3(Infinity, 0, 0);
  /** Cell indices in range, nearest first, and every cell's distance from the last scan (scratch, so a scan allocates nothing). */
  private readonly wanted: number[] = [];
  private readonly distances: Float32Array;
  /** Cells wanted but not made yet (over the frame's time budget). */
  private pending = 0;
  private dirty = false;
  private rescan = true;
  private readonly hit: PlantHit;
  private readonly sphere = new THREE.Sphere();
  private readonly middle = new THREE.Vector3();
  private readonly entry = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private lastRange = 1;
  /** Under something raised on the ground since (a volcano): left out of the batches and picking. */
  private buried: ((dir: THREE.Vector3) => boolean) | null = null;
  private readonly plantDir = new THREE.Vector3();
  /** The loaded cells within `nearReach` of `nearCentre`, for obstacle queries; stale when cells come or go. */
  private readonly nearCells: Cell[] = [];
  private readonly nearCentre = new THREE.Vector3();
  private nearReach = -1;
  private readonly queryMiddle = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    readonly plan: PlantPlan,
    private readonly ground: GroundRadius,
    private readonly cameraSource: THREE.Camera,
    private readonly changes: SurfaceChanges,
    debug: Debug,
  ) {
    const R = plan.radius;
    const n = (this.gridSize = plantGridSize(R));
    this.cellCount = 6 * n * n;
    // A cell's ground and plants stay within its corners' reach (a cell is ~PLANT_CELL_SIZE wide) and the terrain's relief.
    this.cellBound = PLANT_CELL_SIZE * 0.9 + (plan.peak - R);
    this.centres = new Float32Array(this.cellCount * 3);
    this.distances = new Float32Array(this.cellCount);
    const c = { x: 0, y: 0, z: 0 };
    for (let face = 0, k = 0; face < 6; face++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++, k += 3) {
          faceGridPoint(face, i + 0.5, j + 0.5, n, c);
          this.centres[k] = c.x;
          this.centres[k + 1] = c.y;
          this.centres[k + 2] = c.z;
        }
      }
    }
    this.geometries = plan.species.map((s) => Array.from({ length: PLANT_LOD_COUNT }, (_, lod) => createPlantGeometry(s, lod)));
    this.liveMaterials = plan.species.map(() => null);
    this.widestCrown = Math.max(...plan.species.map((s) => s.crownRadius)) * MAX_PLANT_SCALE;
    this.maxReach = Math.max(...plan.species.map((s) => s.height * 1.25 * farthest(s)));
    for (const s of plan.species) {
      const ranges = PLANT_LODS[s.kind];
      const row: Batch[] = [];
      for (let lod = 0; lod < PLANT_LOD_COUNT; lod++) {
        const { material, uniforms } = createPlantMaterial(lod, s.height, ranges);
        const geometry = this.geometries[s.index]![lod]!;
        const mesh = this.createMesh(geometry, material, FIRST_CAPACITY);
        row.push({ mesh, geometry, material, uniforms, lod });
      }
      this.batches.push(row);
    }
    this.hit = { id: '', plant: null as unknown as PlantData, species: plan.species[0]!, distance: 0 };
    this.object.name = 'Plants';
    scene.add(this.object);
    addPlantDebug(debug);
  }

  private createMesh(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0;
    mesh.visible = false;
    // Instances are spread over the whole planet: the bounding sphere would be the planet's anyway.
    mesh.frustumCulled = false;
    mesh.layers.enable(GROUND_DETAIL_LAYER);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.object.add(mesh);
    return mesh;
  }

  /** Counts of what is loaded and drawn. */
  stats(): SurfaceStats {
    const s: SurfaceStats = { cells: this.cells.size, plants: 0, lods: new Array<number>(PLANT_LOD_COUNT).fill(0), drawCalls: 0, triangles: 0 };
    for (const cell of this.cells.values()) for (const g of cell.groups) if (g) s.plants += g.count;
    for (const row of this.batches) {
      for (const b of row) {
        const count = b.mesh.count;
        s.lods[b.lod]! += count;
        if (count > 0 && b.mesh.visible) {
          s.drawCalls++;
          s.triangles += count * trianglesOf(b.geometry);
        }
      }
    }
    return s;
  }

  /** True when no cell the camera wants is still to be made (for automation). */
  get settled(): boolean {
    return !this.rescan && !this.dirty && this.pending === 0;
  }

  update(): void {
    const enabled = plantParams.enabled;
    this.object.visible = enabled;
    if (!enabled) {
      if (this.cells.size > 0) this.clear();
      return;
    }
    for (const row of this.batches) {
      for (const b of row) {
        b.uniforms.uRange.value = plantParams.range;
        setLodTint(b.uniforms, b.lod, plantParams.showLods);
      }
    }
    this.object.worldToLocal(this.cameraSource.getWorldPosition(this.camera));
    if (plantParams.range !== this.lastRange) {
      this.lastRange = plantParams.range;
      this.rescan = true;
    }
    if (!plantParams.freeze && !viewFreeze.enabled && (this.rescan || this.camera.distanceTo(this.lastScan) > SCAN_DISTANCE)) this.scan();
    if (this.dirty) this.rebuild();
  }

  /** The cells near the camera, loaded nearest first within the frame's time budget; far ones dropped; each cell's levels updated. */
  private scan(): void {
    this.lastScan.copy(this.camera);
    this.rescan = false;
    const { plan, camera } = this;
    const R = plan.radius;
    const n = this.gridSize;
    const camLen = camera.length();
    const reach = this.maxReach * plantParams.range;
    const limit = reach + this.cellBound;
    // Cells past the horizon (to the lowest and highest ground) can't be seen.
    const horizon = Math.acos(Math.min(1, R / Math.max(camLen, R))) + Math.acos(R / plan.peak) + (PLANT_CELL_SIZE * 0.9) / R;
    const cosHorizon = Math.cos(Math.min(Math.PI, horizon));
    const cx = camera.x / camLen;
    const cy = camera.y / camLen;
    const cz = camera.z / camLen;
    const wanted = this.wanted;
    wanted.length = 0;
    for (let index = 0, k = 0; index < this.cellCount; index++, k += 3) {
      const x = this.centres[k]!;
      const y = this.centres[k + 1]!;
      const z = this.centres[k + 2]!;
      if (x * cx + y * cy + z * cz < cosHorizon) continue;
      const distance = Math.hypot(camera.x - x * R, camera.y - y * R, camera.z - z * R);
      if (distance > limit) continue;
      this.distances[index] = distance;
      wanted.push(index);
    }
    wanted.sort(this.byDistance);
    // Drop the cells that fell out of range, update the levels of those that stay.
    const keep = limit * KEEP_EXTRA;
    for (const [key, cell] of this.cells) {
      const distance = camera.distanceTo(cell.centre);
      if (distance > keep || !this.facesCamera(cell, cx, cy, cz, cosHorizon)) {
        this.cells.delete(key);
        this.nearReach = -1;
        this.dirty = true;
      } else this.setLevels(cell, distance);
    }
    // The plants' levels follow the camera: rewrite the batches from where it is now.
    this.dirty = true;
    // Load the missing ones nearest first, until the time budget is spent.
    const start = performance.now();
    this.pending = 0;
    let budgetSpent = false;
    for (const index of wanted) {
      const face = Math.floor(index / (n * n));
      const rest = index - face * n * n;
      const j = Math.floor(rest / n);
      const i = rest - j * n;
      const key = `${face}:${i}:${j}`;
      if (this.cells.has(key)) continue;
      if (budgetSpent) {
        this.pending++;
        continue;
      }
      const cell = this.createCell(key, face, i, j, index);
      this.cells.set(key, cell);
      this.nearReach = -1;
      this.setLevels(cell, this.distances[index]!);
      this.dirty = true;
      if (performance.now() - start > plantParams.budgetMs) budgetSpent = true;
    }
    // Something is still to load: look again next frame, wherever the camera goes.
    if (this.pending > 0) this.rescan = true;
  }

  private readonly byDistance = (a: number, b: number): number => this.distances[a]! - this.distances[b]!;

  private facesCamera(cell: Cell, cx: number, cy: number, cz: number, cosHorizon: number): boolean {
    const r = this.plan.radius;
    return (cell.centre.x * cx + cell.centre.y * cy + cell.centre.z * cz) / r >= cosHorizon;
  }

  private createCell(key: string, face: number, i: number, j: number, index: number): Cell {
    const R = this.plan.radius;
    const k = index * 3;
    const plants = generateCell(this.plan, this.ground, face, i, j);
    const cell: Cell = {
      key,
      face,
      i,
      j,
      centre: new THREE.Vector3(this.centres[k]! * R, this.centres[k + 1]! * R, this.centres[k + 2]! * R),
      bound: this.cellBound,
      plants,
      groups: [],
      obstacles: EMPTY,
      top: -Infinity,
      levels: this.plan.species.map(() => new Array<boolean>(PLANT_LOD_COUNT).fill(false)),
    };
    this.fillGroups(cell);
    return cell;
  }

  /** Writes a cell's instance matrices per species, leaving out the removed and promoted plants. */
  private fillGroups(cell: Cell): void {
    const counts = new Int32Array(this.plan.species.length);
    const live: PlantData[] = [];
    for (const p of cell.plants) {
      if (this.changes.isRemoved(p.id) || this.promoted.has(p.id) || this.isBuried(p)) continue;
      live.push(p);
      counts[p.species]!++;
    }
    cell.groups = this.plan.species.map((s) => {
      const n = counts[s.index]!;
      return n > 0 ? { matrices: new Float32Array(n * 16), positions: new Float32Array(n * 3), sizes: new Float32Array(n), count: 0 } : null;
    });
    const obstacles = (cell.obstacles = live.length > 0 ? new Float32Array(live.length * OBSTACLE_STRIDE) : EMPTY);
    cell.top = -Infinity;
    live.forEach((p, k) => {
      const s = this.plan.species[p.species]!;
      const top = p.radius + s.height * p.scale;
      const at = k * OBSTACLE_STRIDE;
      obstacles[at] = p.x;
      obstacles[at + 1] = p.y;
      obstacles[at + 2] = p.z;
      obstacles[at + 3] = s.crownRadius * p.scale;
      obstacles[at + 4] = top;
      cell.top = Math.max(cell.top, top);
    });
    // A cell that had no plants standing may have some now.
    this.nearReach = -1;
    for (const p of live) {
      const g = cell.groups[p.species]!;
      writeMatrix(g.matrices, g.count * 16, p);
      g.positions[g.count * 3] = p.x * p.radius;
      g.positions[g.count * 3 + 1] = p.y * p.radius;
      g.positions[g.count * 3 + 2] = p.z * p.radius;
      g.sizes[g.count] = p.scale;
      g.count++;
    }
  }

  /** Which batches a cell's species belong in at `distance` from the camera (the fade itself is per pixel). */
  private setLevels(cell: Cell, distance: number): void {
    const range = plantParams.range;
    const slack = SCAN_DISTANCE * 2;
    const closest = distance - cell.bound - slack;
    const farthest = distance + cell.bound + slack;
    for (const s of this.plan.species) {
      const ranges = PLANT_LODS[s.kind];
      const unit = s.height * 1.25 * range;
      const levels = cell.levels[s.index]!;
      for (let lod = 0; lod < PLANT_LOD_COUNT; lod++) {
        // A level is drawn from where the one before starts fading out to where it has faded out itself.
        const start = lod === 0 ? -Infinity : ranges[lod - 1]! * FADE_START * unit;
        const end = ranges[lod]! * unit;
        const wanted = farthest > start && closest < end;
        if (levels[lod] !== wanted) this.dirty = true;
        levels[lod] = wanted;
      }
    }
  }

  /**
   * Writes every batch from the cells in it: each plant of a cell that may
   * hold that level goes in if its distance from the camera (at the last
   * scan, in its own heights) is within the level's span, widened by how far
   * the camera can move before the next scan.
   */
  private rebuild(): void {
    this.dirty = false;
    const range = plantParams.range;
    const { x: cx, y: cy, z: cz } = this.lastScan;
    const slack = SCAN_DISTANCE * 1.5;
    for (const s of this.plan.species) {
      const ranges = PLANT_LODS[s.kind];
      for (const batch of this.batches[s.index]!) {
        const lod = batch.lod;
        // The level's span in heights: from where the level before starts fading out to where this one has faded out.
        const from = lod === 0 ? -Infinity : ranges[lod - 1]! * FADE_START;
        const to = ranges[lod]!;
        let upper = 0;
        for (const cell of this.cells.values()) if (cell.levels[s.index]![lod]) upper += cell.groups[s.index]?.count ?? 0;
        if (upper > batch.mesh.instanceMatrix.count) this.grow(batch, upper);
        const array = batch.mesh.instanceMatrix.array as Float32Array;
        let total = 0;
        for (const cell of this.cells.values()) {
          if (!cell.levels[s.index]![lod]) continue;
          const g = cell.groups[s.index];
          if (!g) continue;
          for (let k = 0; k < g.count; k++) {
            const unit = s.height * g.sizes[k]! * range;
            const d = Math.hypot(g.positions[k * 3]! - cx, g.positions[k * 3 + 1]! - cy, g.positions[k * 3 + 2]! - cz);
            if (d + slack < from * unit || d - slack > to * unit) continue;
            array.set(g.matrices.subarray(k * 16, k * 16 + 16), total * 16);
            total++;
          }
        }
        batch.mesh.count = total;
        batch.mesh.visible = total > 0;
        batch.mesh.instanceMatrix.clearUpdateRanges();
        if (total > 0) batch.mesh.instanceMatrix.addUpdateRange(0, total * 16);
        batch.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** A bigger mesh for the batch (the instance buffer of a built mesh can't be resized). */
  private grow(batch: Batch, needed: number): void {
    let capacity = batch.mesh.instanceMatrix.count;
    while (capacity < needed) capacity *= 2;
    this.object.remove(batch.mesh);
    batch.mesh.dispose();
    batch.mesh = this.createMesh(batch.geometry, batch.material, capacity);
  }

  private clear(): void {
    this.cells.clear();
    this.nearReach = -1;
    this.nearCells.length = 0;
    this.rescan = true;
    this.pending = 0;
    this.dirty = false;
    for (const row of this.batches) {
      for (const b of row) {
        b.mesh.count = 0;
        b.mesh.visible = false;
      }
    }
  }

  /** Nothing is drawn or picked from plants that aren't loaded or are beyond their view distance. */
  private visibleAt(plant: PlantData, distance: number): boolean {
    const s = this.plan.species[plant.species]!;
    return distance <= farthest(s) * s.height * plant.scale * plantParams.range;
  }

  /**
   * The nearest plant a ray passes through, within `maxDistance`: the ray is
   * tested against each loaded cell's bounding sphere, then against a sphere
   * round each plant in it (a rough stand-in for its body, like the system
   * view's picking of bodies). Only plants that are drawn count. The returned
   * object is reused: read it before calling again. Points in the planet's body frame.
   */
  pick(ray: THREE.Ray, maxDistance = Infinity): PlantHit | null {
    if (!plantParams.enabled) return null;
    let best = maxDistance;
    let found = false;
    const { sphere, middle, entry, hit } = this;
    for (const cell of this.cells.values()) {
      if (cell.plants.length === 0) continue;
      sphere.set(cell.centre, cell.bound);
      if (!ray.intersectsSphere(sphere)) continue;
      for (const p of cell.plants) {
        if (this.changes.isRemoved(p.id) || this.promoted.has(p.id) || this.isBuried(p)) continue;
        const s = this.plan.species[p.species]!;
        // A sphere about the middle of the plant, as wide as its crown (at least a third of its height).
        const size = s.height * p.scale;
        middle.set(p.x, p.y, p.z).multiplyScalar(p.radius + size * 0.5);
        sphere.set(middle, Math.max(s.crownRadius * p.scale, size * 0.3));
        const at = ray.intersectSphere(sphere, entry);
        if (!at) continue;
        const distance = at.distanceTo(ray.origin);
        if (distance >= best || !this.visibleAt(p, distance)) continue;
        best = distance;
        found = true;
        hit.id = p.id;
        hit.plant = p;
        hit.species = s;
        hit.distance = distance;
      }
    }
    return found ? hit : null;
  }

  /**
   * Calls `visit` for each plant drawn now that stands under a disc `radius`
   * wide round `point` on the ground (`underDisc`), e.g. a beam's foot; in the
   * planet's body frame. `hit.distance` is its base's distance from `point`;
   * `hit` is reused, so read it in `visit`. `visit` may promote the plant.
   */
  within(point: THREE.Vector3, radius: number, visit: (hit: PlantHit) => void): void {
    if (!plantParams.enabled) return;
    const { middle, hit } = this;
    const most = radius + this.widestCrown;
    for (const cell of this.cells.values()) {
      if (cell.plants.length === 0 || cell.centre.distanceTo(point) > cell.bound + most) continue;
      for (const p of cell.plants) {
        if (this.changes.isRemoved(p.id) || this.promoted.has(p.id)) continue;
        const s = this.plan.species[p.species]!;
        middle.set(p.x, p.y, p.z).multiplyScalar(p.radius);
        const distance = middle.distanceTo(point);
        if (!underDisc(distance, s.crownRadius * p.scale, radius) || !this.visibleAt(p, middle.distanceTo(this.camera))) continue;
        hit.id = p.id;
        hit.plant = p;
        hit.species = s;
        hit.distance = distance;
        visit(hit);
      }
    }
  }

  /**
   * The ship's obstacles (`Obstacles`): calls `visit` with the unit direction
   * of every standing plant loaded that the hull, its centre at `radius`, goes
   * through on the arc from unit direction `from` to `to`. Each plant is an
   * upright cylinder as wide as its crown and as tall as the plant. Cheap
   * enough for every frame: only the cells near the arc are looked at (the
   * cells round the ship are listed once and kept until it moves on), and a
   * cell whose highest plant can't reach the hull is skipped whole. Plants
   * switched off aren't loaded, so nothing is touched.
   */
  touchAlong(from: THREE.Vector3, to: THREE.Vector3, radius: number, visit: (x: number, y: number, z: number) => void): void {
    if (this.cells.size === 0) return;
    const R = this.plan.radius;
    const middle = this.queryMiddle.addVectors(from, to).normalize().multiplyScalar(R);
    // A plant whose base is further than this from the arc's middle can't be under the hull anywhere along it.
    const need = (from.distanceTo(to) / 2) * R + HULL_RADIUS + this.widestCrown;
    if (this.nearReach < 0 || middle.distanceTo(this.nearCentre) + need > this.nearReach) this.listNear(middle, need + NEAR_SLACK);
    for (const cell of this.nearCells) {
      // The hull's underside reaches at most its depth below its centre.
      if (cell.top + HULL_DEPTH <= radius || cell.centre.distanceTo(middle) > cell.bound + need) continue;
      const o = cell.obstacles;
      for (let k = 0; k < o.length; k += OBSTACLE_STRIDE) {
        if (o[k + 4]! + HULL_DEPTH <= radius) continue;
        if (radius < obstacleClearance(o[k]!, o[k + 1]!, o[k + 2]!, o[k + 3]!, o[k + 4]!, from, to)) visit(o[k]!, o[k + 1]!, o[k + 2]!);
      }
    }
  }

  /** Lists the loaded cells that reach within `reach` of `centre`. */
  private listNear(centre: THREE.Vector3, reach: number): void {
    this.nearCentre.copy(centre);
    this.nearReach = reach;
    this.nearCells.length = 0;
    for (const cell of this.cells.values()) if (cell.obstacles.length > 0 && cell.centre.distanceTo(centre) <= cell.bound + reach) this.nearCells.push(cell);
  }

  /** A generated plant by id, from the loaded cells or made afresh (null if there's none). */
  find(id: string): PlantData | null {
    const address = parsePlantId(id);
    if (!address) return null;
    const { face, i, j } = address;
    const n = this.gridSize;
    if (i >= n || j >= n) return null;
    const loaded = this.cells.get(`${face}:${i}:${j}`);
    const plants = loaded ? loaded.plants : generateCell(this.plan, this.ground, face, i, j);
    return plants.find((p) => p.id === id) ?? null;
  }

  isRemoved(id: string): boolean {
    return this.changes.isRemoved(id);
  }

  /**
   * Hides the plants standing where `test` (a plant's unit direction) says
   * the ground has been covered over, e.g. by a volcano, from now on; call
   * again when it changes. Nothing is recorded: the test is made from what
   * the planet's change list already keeps.
   */
  setBuried(test: ((dir: THREE.Vector3) => boolean) | null): void {
    this.buried = test;
    for (const cell of this.cells.values()) this.fillGroups(cell);
    this.dirty = true;
  }

  private isBuried(p: PlantData): boolean {
    return this.buried !== null && this.buried(this.plantDir.set(p.x, p.y, p.z));
  }

  /** Removes a plant for good (it stays gone when the planet is left and visited again). False if there is no such plant or it is gone already. */
  remove(id: string): boolean {
    if (this.promoted.has(id) || this.changes.isRemoved(id) || !this.find(id)) return false;
    this.changes.remove(id);
    this.refreshCell(id);
    return true;
  }

  /**
   * Takes a plant out of the instanced batches and gives it back as an object
   * of its own (its full mesh, where it stood) for a beam to
   * lift or a weapon to hit. `destroy()` removes it for good, `restore()`
   * puts it back. Null if there is no such plant or it is gone or promoted already.
   */
  promote(id: string): LivePlant | null {
    if (this.promoted.has(id) || this.changes.isRemoved(id)) return null;
    const plant = this.find(id);
    if (!plant) return null;
    const species = this.plan.species[plant.species]!;
    const material = (this.liveMaterials[species.index] ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
    // The plant's own transform on the group, so it can be moved, turned and scaled as a whole.
    const object = new THREE.Group();
    object.name = species.name;
    plantMatrix(plant, this.matrix).decompose(object.position, object.quaternion, object.scale);
    const mesh = new THREE.Mesh(this.geometries[species.index]![0]!, material);
    mesh.layers.enable(GROUND_DETAIL_LAYER);
    object.add(mesh);
    this.scene.add(object);
    this.promoted.add(id);
    this.refreshCell(id);
    const done = (): void => {
      if (this.live.get(id) !== handle) return;
      this.live.delete(id);
      this.scene.remove(object);
    };
    const handle: LivePlant = {
      id,
      species,
      object,
      destroy: () => {
        if (this.live.get(id) !== handle) return;
        done();
        this.changes.remove(id);
        this.promoted.delete(id);
        this.refreshCell(id);
      },
      restore: () => {
        if (this.live.get(id) !== handle) return;
        done();
        this.promoted.delete(id);
        this.refreshCell(id);
      },
    };
    this.live.set(id, handle);
    return handle;
  }

  /** Rewrites the instances of the loaded cell a plant belongs to. */
  private refreshCell(id: string): void {
    const a = parsePlantId(id);
    if (!a) return;
    const cell = this.cells.get(`${a.face}:${a.i}:${a.j}`);
    if (!cell) return;
    this.fillGroups(cell);
    this.dirty = true;
  }

  dispose(): void {
    for (const handle of [...this.live.values()]) handle.restore();
    this.scene.remove(this.object);
    for (const row of this.batches) {
      for (const b of row) {
        b.mesh.dispose();
        b.material.dispose();
      }
    }
    for (const row of this.geometries) for (const g of row) g.dispose();
    for (const m of this.liveMaterials) m?.dispose();
  }
}

/**
 * Whether a plant whose base is `distance` from the centre of a disc `radius`
 * wide on the ground, with a crown `crown` wide (radius), stands under it: its
 * trunk does, or at least half its crown.
 */
export function underDisc(distance: number, crown: number, radius: number): boolean {
  return distance <= radius + crown * 0.5;
}

const EMPTY = new Float32Array(0);

/** How far out a species is drawn at all, in its heights. */
function farthest(s: PlantSpecies): number {
  const ranges = PLANT_LODS[s.kind];
  return ranges[ranges.length - 1]!;
}

function trianglesOf(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

/**
 * Writes the instance matrix of a plant into `out` at `at`: up along the
 * direction from the planet's centre, turned by the plant's yaw, scaled by its
 * size, at the ground. (Column-major, as THREE's matrices.)
 */
function writeMatrix(out: Float32Array, at: number, p: PlantPlace): void {
  // Any direction across the surface: cross the up axis with the world axis it is least aligned with.
  const ax = Math.abs(p.x);
  const ay = Math.abs(p.y);
  const az = Math.abs(p.z);
  let rx = 0;
  let ry = 0;
  let rz = 0;
  if (ax <= ay && ax <= az) rx = 1;
  else if (ay <= az) ry = 1;
  else rz = 1;
  // e1 = normalize(up × ref), e2 = up × e1.
  let e1x = p.y * rz - p.z * ry;
  let e1y = p.z * rx - p.x * rz;
  let e1z = p.x * ry - p.y * rx;
  const l = Math.hypot(e1x, e1y, e1z);
  e1x /= l;
  e1y /= l;
  e1z /= l;
  const e2x = p.y * e1z - p.z * e1y;
  const e2y = p.z * e1x - p.x * e1z;
  const e2z = p.x * e1y - p.y * e1x;
  const c = Math.cos(p.yaw) * p.scale;
  const s = Math.sin(p.yaw) * p.scale;
  // x axis: turned by the yaw in the tangent plane; z = x × up.
  const xx = e1x * c + e2x * s;
  const xy = e1y * c + e2y * s;
  const xz = e1z * c + e2z * s;
  const zx = xy * p.z - xz * p.y;
  const zy = xz * p.x - xx * p.z;
  const zz = xx * p.y - xy * p.x;
  out[at] = xx;
  out[at + 1] = xy;
  out[at + 2] = xz;
  out[at + 3] = 0;
  out[at + 4] = p.x * p.scale;
  out[at + 5] = p.y * p.scale;
  out[at + 6] = p.z * p.scale;
  out[at + 7] = 0;
  out[at + 8] = zx;
  out[at + 9] = zy;
  out[at + 10] = zz;
  out[at + 11] = 0;
  out[at + 12] = p.x * p.radius;
  out[at + 13] = p.y * p.radius;
  out[at + 14] = p.z * p.radius;
  out[at + 15] = 1;
}

/** Where a plant stands and how big and turned it is (a generated plant, or one set down by the player). */
export type PlantPlace = Pick<PlantData, 'x' | 'y' | 'z' | 'radius' | 'scale' | 'yaw'>;

/** The matrix of a plant as the instance batches and its live object use it. */
export function plantMatrix(p: PlantPlace, out: THREE.Matrix4): THREE.Matrix4 {
  const m = new Float32Array(16);
  writeMatrix(m, 0, p);
  return out.fromArray(m);
}

/**
 * The yaw `writeMatrix` would need to turn a plant standing at unit direction
 * `up` so its x axis points along `xAxis` (projected onto the ground's plane):
 * the same tangent basis, so a plant set down keeps the turn it fell with.
 */
export function plantYaw(up: THREE.Vector3, xAxis: THREE.Vector3): number {
  const ax = Math.abs(up.x);
  const ay = Math.abs(up.y);
  const az = Math.abs(up.z);
  const ref = ax <= ay && ax <= az ? X_AXIS : ay <= az ? Y_AXIS : Z_AXIS;
  const e1 = yawE1.crossVectors(up, ref).normalize();
  const e2 = yawE2.crossVectors(up, e1);
  return Math.atan2(xAxis.dot(e2), xAxis.dot(e1));
}

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const yawE1 = new THREE.Vector3();
const yawE2 = new THREE.Vector3();
