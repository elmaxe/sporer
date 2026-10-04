import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { HERD_CELL_SIZE, HOME_RANGE, PACK_RANGE_FACTOR, HerdPath, generateHerd, herdGridSize, type AnimalPlan, type AnimalPose, type AnimalSpecies, type HerdData } from '../gen/animals';
import type { GroundRadius } from '../gen/plants';
import { hashSeed } from '../gen/rng';
import type { RenderClock } from '../planet/PlanetFrame';
import { faceGridPoint } from '../world/cubeSphereMath';
import { GROUND_DETAIL_LAYER } from '../world/groundDepth';
import { viewFreeze } from '../world/viewFreeze';
import { ANIMAL_LODS, FADE_START, addAnimationAttributes, animalMotion, animalSkeleton, createAnimalGeometry, createAnimalMaterial, setAnimalTint, type AnimalUniforms } from './animalLook';
import { ANIMAL_LOD_COUNT } from './animalMesh';
import { addAnimalDebug, animalParams } from './animalParams';
import type { ReleasedAnimal, SurfaceChanges } from './changes';
import { createAnimalObject, type AnimalObject } from './liveAnimal';

/** The camera must move this far (units) before herd cells are looked at again. */
const SCAN_DISTANCE = 6;
/** A cell stays loaded until it is this much further out than it was wanted. */
const KEEP_EXTRA = 1.15;
/** Instances a batch starts with; it doubles when full. */
const FIRST_CAPACITY = 32;
/** An animal's own size: its species' length times this, from its id. */
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.15;
/** An animal set down roams this far round where it landed (units). */
const RELEASED_RANGE = 0.5 * HOME_RANGE;
/** In a cell's `gone`: drawn, removed for good, or out of the batches as an object of its own (`promote`). */
const HERE = 0;
const REMOVED = 1;
const HELD = 2;

/** The animal a ray hit. The same object every time: read it before the next `pick`. */
export interface AnimalHit {
  id: string;
  species: AnimalSpecies;
  /** Its size (times the species' length) and along the ray. */
  scale: number;
  distance: number;
  /** Walking, trotting, grazing or resting, for the tooltip. */
  doing: string;
  /** Where it was brought from, if the player set it down here, and its species' key in the cargo hold; else null. */
  origin: string | null;
  speciesKey: string | null;
  /** Where it stands (body frame, on the ground): its base, drawn this frame. */
  readonly position: THREE.Vector3;
}

/** An animal taken out of the herds' batches as an object of its own (see `SurfaceAnimals.promote`). */
export interface LiveAnimal {
  readonly id: string;
  readonly species: AnimalSpecies;
  /** Where it was brought from, if the player set it down here; else null. */
  readonly origin: string | null;
  /** Its size (times the species' length). */
  readonly scale: number;
  /** Placed, turned and scaled where it stood, walking as it was, in the level's scene: move it, lift it, hit it. Its holder disposes it. */
  readonly look: AnimalObject;
  /** It is gone for good: recorded as removed in the planet's change list. */
  destroy(): void;
  /** Put it back in its herd (where the clock has it now). */
  restore(): void;
}

/** A loaded herd cell (or an animal set down here): its herd (or none) and where its animals were last drawn. */
interface HerdCell {
  readonly key: string;
  readonly herd: HerdData | null;
  readonly path: HerdPath | null;
  /** Its species, and the batches it's drawn in. */
  readonly species: AnimalSpecies | null;
  readonly row: Batch[] | null;
  /** Where its animal was brought from (an animal set down here) and its species' key in the hold, or null. */
  readonly origin: string | null;
  readonly speciesKey: string | null;
  /** Per animal: HERE, REMOVED or HELD. */
  readonly gone: Uint8Array;
  /** The herd's home on the ground and how far its animals can be from it (units). */
  readonly centre: THREE.Vector3;
  readonly bound: number;
  /** Each animal's last drawn position (body frame) and size; NaN when it wasn't drawn. */
  readonly drawn: Float32Array;
  readonly scales: Float32Array;
  readonly poses: AnimalPose[];
}

/** The instances of one species at one level of detail: one draw call. */
interface Batch {
  mesh: THREE.InstancedMesh;
  anim: THREE.InstancedBufferAttribute;
  idle: THREE.InstancedBufferAttribute;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshStandardMaterial;
  readonly uniforms: AnimalUniforms;
  readonly lod: number;
  count: number;
}

/** What `SurfaceAnimals` holds now, for the lab's readout and the tests. */
export interface AnimalStats {
  herds: number;
  /** Animals in the loaded herds, those drawn this frame (by level of detail) and the draw calls. */
  animals: number;
  drawn: number;
  lods: number[];
  drawCalls: number;
  triangles: number;
  /** Of those drawn: walking now, and grazing. */
  walking: number;
  grazing: number;
}

/**
 * The animals of a planet (gen/animals.ts): the herd cells around the camera
 * are generated as it moves (a herd's cell is cheap: one spot tested), and
 * every frame each animal close enough to be seen is posed from the clock
 * (its herd's path through time, a ground sample under it) and written into
 * its species' instanced batch for the levels of detail its distance needs,
 * with its stride and grazing as instance attributes for the shader to walk
 * it (animalLook.ts). Herds behind the horizon or out of the view are
 * skipped. Static in the planet's body frame, like the globe; nothing is
 * simulated, so the animals are where the clock says whenever you look.
 */
export class SurfaceAnimals implements Entity {
  readonly object = new THREE.Group();
  private readonly cells = new Map<string, HerdCell>();
  private readonly centres: Float32Array;
  private readonly gridSize: number;
  private readonly cellCount: number;
  private readonly geometries: THREE.BufferGeometry[][];
  private readonly batches: Batch[][] = [];
  private readonly maxReach: number;
  private readonly maxBound: number;
  /** The tallest an animal stands (units, a generous two lengths of the longest). */
  private readonly tallest: number;
  private readonly camera = new THREE.Vector3();
  private readonly lastScan = new THREE.Vector3(Infinity, 0, 0);
  private readonly pose: AnimalPose = { x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 1, cycle: 0, stride: 0, trot: 0, graze: 0, idle: 0 };
  private readonly frustum = new THREE.Frustum();
  private readonly viewProjection = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly hit: AnimalHit;
  private readonly entry = new THREE.Vector3();
  private rescan = true;
  private pending = 0;
  private lastRange = 1;
  private readonly counts = { walking: 0, grazing: 0, drawn: 0 };
  /** Animals set down here, by their record's id (always loaded: there are few). */
  private readonly released = new Map<string, HerdCell>();
  /** The batches of species brought from elsewhere, by species key, with their geometries. */
  private readonly foreign = new Map<string, { row: Batch[]; geometries: THREE.BufferGeometry[] }>();
  /** Animals out of the batches as objects of their own (`promote`). */
  private readonly held = new Set<string>();
  private readonly basis = new THREE.Matrix4();
  private readonly xAxis = new THREE.Vector3();
  private readonly yAxis = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3();
  /** `pick`'s nearest so far: its cell, index and distance along the ray. */
  private best = Infinity;
  private found: HerdCell | null = null;
  private foundIndex = 0;

  constructor(
    private readonly scene: THREE.Scene,
    readonly plan: AnimalPlan,
    private readonly ground: GroundRadius,
    private readonly cameraSource: THREE.Camera,
    private readonly clock: RenderClock,
    debug: Debug,
    /** The planet's change list: removed animals stay gone, and those set down here roam it (none in the labs). */
    private readonly changes: SurfaceChanges | null = null,
  ) {
    const R = plan.radius;
    const n = (this.gridSize = herdGridSize(R));
    this.cellCount = 6 * n * n;
    this.centres = new Float32Array(this.cellCount * 3);
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
    const longest = Math.max(...plan.species.map((s) => s.length)) * MAX_SCALE;
    this.maxReach = ANIMAL_LODS[ANIMAL_LODS.length - 1]! * longest;
    this.tallest = longest * 2;
    // A herd strays from its cell's centre by the cell, its range and its spread.
    this.maxBound = HERD_CELL_SIZE * 0.8 + Math.max(...plan.species.map((s) => s.length * 1.7 * Math.sqrt(s.herdMax + 1))) + HOME_RANGE * PACK_RANGE_FACTOR;
    this.geometries = plan.species.map((s) => Array.from({ length: ANIMAL_LOD_COUNT }, (_, lod) => createAnimalGeometry(s, lod)));
    for (const s of plan.species) {
      const motion = animalMotion(s, plan.gravity);
      const row: Batch[] = [];
      for (let lod = 0; lod < ANIMAL_LOD_COUNT; lod++) {
        const { material, uniforms } = createAnimalMaterial(lod, s, motion);
        const geometry = this.geometries[s.index]![lod]!;
        row.push({ ...this.createMesh(geometry, material, FIRST_CAPACITY), geometry, material, uniforms, lod, count: 0 });
      }
      this.batches.push(row);
    }
    this.hit = { id: '', species: plan.species[0]!, scale: 1, distance: 0, doing: '', origin: null, speciesKey: null, position: new THREE.Vector3() };
    this.object.name = 'Animals';
    scene.add(this.object);
    addAnimalDebug(debug);
    if (changes) for (const a of changes.releasedAnimals) this.release(a);
  }

  /** An animal set down here that lives here now: recorded in the planet's change list and drawn roaming round where it landed. */
  settle(a: Omit<ReleasedAnimal, 'id' | 'seed'>): ReleasedAnimal | null {
    if (!this.changes) return null;
    const record = this.changes.release({ ...a, seed: hashSeed(this.plan.seed, 'released', this.changes.releasedCount, a.x, a.y) & 0x7fffffff });
    this.release(record);
    return record;
  }

  /** Draws an animal set down here (recorded in the change list as `record`), roaming round where it landed. */
  private release(record: ReleasedAnimal): void {
    const species = record.species;
    let foreign = this.foreign.get(record.speciesKey);
    if (!foreign) {
      const motion = animalMotion(species, this.plan.gravity);
      const geometries = Array.from({ length: ANIMAL_LOD_COUNT }, (_, lod) => createAnimalGeometry(species, lod));
      const row = geometries.map((geometry, lod) => {
        const { material, uniforms } = createAnimalMaterial(lod, species, motion);
        return { ...this.createMesh(geometry, material, 4), geometry, material, uniforms, lod, count: 0 };
      });
      this.foreign.set(record.speciesKey, (foreign = { row, geometries }));
    }
    // A herd of one, of a plan whose only species is its own, on this body's ground and gravity.
    const plan: AnimalPlan = { ...this.plan, species: [species] };
    const herd: HerdData = {
      id: record.id,
      species: 0,
      count: 1,
      home: { x: record.x, y: record.y, z: record.z },
      range: RELEASED_RANGE,
      slot: 30 + (record.seed % 40),
      offset: record.seed % 1000,
      seed: record.seed,
    };
    this.released.set(record.id, {
      key: record.id,
      herd,
      path: new HerdPath(plan, this.ground, herd, animalSkeleton(species)),
      species,
      row: foreign.row,
      origin: record.origin,
      speciesKey: record.speciesKey,
      gone: new Uint8Array([this.held.has(`${record.id}:0`) ? HELD : HERE]),
      centre: new THREE.Vector3(record.x, record.y, record.z).multiplyScalar(this.plan.radius),
      bound: RELEASED_RANGE + species.length * 2,
      drawn: new Float32Array(3).fill(NaN),
      scales: new Float32Array([record.scale]),
      poses: [{ x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 1, cycle: 0, stride: 0, trot: 0, graze: 0, idle: 0 }],
    });
  }

  private createMesh(geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): Pick<Batch, 'mesh' | 'anim' | 'idle'> {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0;
    mesh.visible = false;
    mesh.frustumCulled = false;
    mesh.layers.enable(GROUND_DETAIL_LAYER);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const { anim, idle } = addAnimationAttributes(mesh, capacity);
    this.object.add(mesh);
    return { mesh, anim, idle };
  }

  /** True when no herd cell the camera wants is still to be made (for automation). */
  get settled(): boolean {
    return !this.rescan && this.pending === 0;
  }

  stats(): AnimalStats {
    const s: AnimalStats = { herds: 0, animals: 0, drawn: this.counts.drawn, lods: new Array<number>(ANIMAL_LOD_COUNT).fill(0), drawCalls: 0, triangles: 0, walking: this.counts.walking, grazing: this.counts.grazing };
    for (const cell of this.cells.values()) {
      if (!cell.herd) continue;
      s.herds++;
      s.animals += cell.herd.count;
    }
    for (const row of this.batches) {
      for (const b of row) {
        s.lods[b.lod]! += b.count;
        if (b.count > 0) {
          s.drawCalls++;
          s.triangles += (b.count * b.geometry.getAttribute('position').count) / 3;
        }
      }
    }
    return s;
  }

  update(): void {
    const enabled = animalParams.enabled;
    this.object.visible = enabled;
    if (!enabled) {
      if (this.cells.size > 0) this.clear();
      return;
    }
    for (const row of this.batches) {
      for (const b of row) {
        b.uniforms.uRange.value = animalParams.range;
        setAnimalTint(b.uniforms, b.lod, animalParams.showLods);
      }
    }
    this.object.updateMatrixWorld();
    this.object.worldToLocal(this.cameraSource.getWorldPosition(this.camera));
    if (animalParams.range !== this.lastRange) {
      this.lastRange = animalParams.range;
      this.rescan = true;
    }
    if (!viewFreeze.enabled && (this.rescan || this.camera.distanceTo(this.lastScan) > SCAN_DISTANCE)) this.scan();
    this.draw();
  }

  /** The herd cells in reach of the camera, made a few per frame; far ones dropped. */
  private scan(): void {
    this.lastScan.copy(this.camera);
    this.rescan = false;
    const { plan, camera } = this;
    const R = plan.radius;
    const n = this.gridSize;
    const camLen = camera.length();
    const limit = this.maxReach * animalParams.range + this.maxBound;
    const horizon = Math.acos(Math.min(1, R / Math.max(camLen, R))) + Math.acos(R / plan.peak) + this.maxBound / R;
    const cosHorizon = Math.cos(Math.min(Math.PI, horizon));
    const cx = camera.x / camLen;
    const cy = camera.y / camLen;
    const cz = camera.z / camLen;
    const keep = limit * KEEP_EXTRA;
    for (const [key, cell] of this.cells) {
      const d = camera.distanceTo(cell.centre);
      if (d > keep || (cell.centre.x * cx + cell.centre.y * cy + cell.centre.z * cz) / R < cosHorizon) this.cells.delete(key);
    }
    const start = performance.now();
    this.pending = 0;
    for (let index = 0, k = 0; index < this.cellCount; index++, k += 3) {
      const x = this.centres[k]!;
      const y = this.centres[k + 1]!;
      const z = this.centres[k + 2]!;
      if (x * cx + y * cy + z * cz < cosHorizon) continue;
      if (Math.hypot(camera.x - x * R, camera.y - y * R, camera.z - z * R) > limit) continue;
      const face = Math.floor(index / (n * n));
      const rest = index - face * n * n;
      const j = Math.floor(rest / n);
      const i = rest - j * n;
      const key = `${face}:${i}:${j}`;
      if (this.cells.has(key)) continue;
      if (performance.now() - start > animalParams.budgetMs) {
        this.pending++;
        continue;
      }
      this.cells.set(key, this.createCell(key, face, i, j, x, y, z));
    }
    if (this.pending > 0) this.rescan = true;
  }

  private createCell(key: string, face: number, i: number, j: number, x: number, y: number, z: number): HerdCell {
    const herd = generateHerd(this.plan, this.ground, face, i, j);
    const R = this.plan.radius;
    const count = herd?.count ?? 0;
    const scales = new Float32Array(count);
    for (let k = 0; k < count; k++) scales[k] = MIN_SCALE + ((hashSeed(herd!.seed, 'size', k) & 0xffff) / 0x10000) * (MAX_SCALE - MIN_SCALE);
    const species = herd ? this.plan.species[herd.species]! : null;
    const gone = new Uint8Array(count);
    for (let k = 0; k < count; k++) {
      const id = `${herd!.id}:${k}`;
      gone[k] = this.held.has(id) ? HELD : this.changes?.isAnimalRemoved(id) ? REMOVED : HERE;
    }
    return {
      key,
      herd,
      path: herd && species ? new HerdPath(this.plan, this.ground, herd, animalSkeleton(species)) : null,
      species,
      row: species ? this.batches[species.index]! : null,
      origin: null,
      speciesKey: null,
      gone,
      centre: herd ? new THREE.Vector3(herd.home.x, herd.home.y, herd.home.z).multiplyScalar(R) : new THREE.Vector3(x, y, z).multiplyScalar(R),
      bound: herd ? herd.range + (species!.length * 1.7 * Math.sqrt(count + 1) + species!.length) : 0,
      drawn: new Float32Array(count * 3).fill(NaN),
      scales,
      poses: Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 1, cycle: 0, stride: 0, trot: 0, graze: 0, idle: 0 })),
    };
  }

  /** Poses every animal in view now and rewrites the batches. */
  private draw(): void {
    const { plan, camera } = this;
    const R = plan.radius;
    for (const row of this.batches) for (const b of row) b.count = 0;
    for (const { row } of this.foreign.values()) for (const b of row) b.count = 0;
    this.counts.walking = this.counts.grazing = this.counts.drawn = 0;
    // The view's frustum in the body frame (none while the view is frozen: everything in reach is posed, to see from outside).
    const cam = this.cameraSource;
    this.viewProjection.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(this.object.matrixWorld);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    const t = this.clock.renderTime;
    const camLen = camera.length();
    // Past the horizon: further round than the sea-level horizon plus the highest ground's and an animal's height.
    const horizon = Math.acos(Math.min(1, R / Math.max(camLen, R))) + Math.acos(Math.min(1, R / (plan.peak + this.tallest)));
    const cosHorizon = Math.cos(Math.min(Math.PI, horizon)) * camLen;
    for (const cell of this.cells.values()) this.drawCell(cell, t, cosHorizon);
    for (const cell of this.released.values()) this.drawCell(cell, t, cosHorizon);
    for (const row of this.batches) this.upload(row);
    for (const { row } of this.foreign.values()) this.upload(row);
  }

  /** Poses a cell's animals in view now into their batches, and keeps where each was drawn. */
  private drawCell(cell: HerdCell, t: number, cosHorizon: number): void {
    const { plan, camera, pose } = this;
    const R = plan.radius;
    const range = animalParams.range;
    const { herd, path, species: s, row } = cell;
    if (!herd || !path || !s || !row) return;
    cell.drawn.fill(NaN);
    const reach = ANIMAL_LODS[ANIMAL_LODS.length - 1]! * s.length * MAX_SCALE * range;
    const d = camera.distanceTo(cell.centre);
    if (d - cell.bound > reach) return;
    this.sphere.set(cell.centre, cell.bound + s.length * 2);
    if (!viewFreeze.enabled && !this.frustum.intersectsSphere(this.sphere)) return;
    for (let k = 0; k < herd.count; k++) {
      if (cell.gone[k] !== HERE) continue;
      path.pose(k, t, pose);
      if (pose.x * camera.x + pose.y * camera.y + pose.z * camera.z < cosHorizon) continue;
      let r = this.ground(pose);
      if (plan.sea && r < R) r = R;
      const scale = cell.scales[k]!;
      const px = pose.x * r;
      const py = pose.y * r;
      const pz = pose.z * r;
      const dist = Math.hypot(px - camera.x, py - camera.y, pz - camera.z) / (s.length * scale * range);
      if (dist > ANIMAL_LODS[ANIMAL_LODS.length - 1]!) continue;
      Object.assign(cell.poses[k]!, pose);
      cell.drawn[k * 3] = px;
      cell.drawn[k * 3 + 1] = py;
      cell.drawn[k * 3 + 2] = pz;
      this.counts.drawn++;
      if (pose.stride > 0.05) this.counts.walking++;
      if (pose.graze > 0.5) this.counts.grazing++;
      for (let lod = 0; lod < ANIMAL_LOD_COUNT; lod++) {
        // A level draws from where the one before starts fading to where it has faded out itself.
        const from = lod === 0 ? -Infinity : ANIMAL_LODS[lod - 1]! * FADE_START;
        if (dist < from || dist > ANIMAL_LODS[lod]!) continue;
        this.write(row[lod]!, pose, px, py, pz, scale);
      }
    }
  }

  /** Hands a row's batches, as written this frame, to the GPU. */
  private upload(row: Batch[]): void {
    for (const b of row) {
      b.mesh.count = b.count;
      b.mesh.visible = b.count > 0;
      if (b.count === 0) continue;
      b.mesh.instanceMatrix.clearUpdateRanges();
      b.mesh.instanceMatrix.addUpdateRange(0, b.count * 16);
      b.mesh.instanceMatrix.needsUpdate = true;
      b.anim.clearUpdateRanges();
      b.anim.addUpdateRange(0, b.count * 4);
      b.anim.needsUpdate = true;
      b.idle.clearUpdateRanges();
      b.idle.addUpdateRange(0, b.count);
      b.idle.needsUpdate = true;
    }
  }

  /** Appends an animal to a batch: its matrix (up from the planet's centre, facing its heading, scaled by its size) and its animation. */
  private write(b: Batch, p: AnimalPose, px: number, py: number, pz: number, scale: number): void {
    if (b.count >= b.mesh.instanceMatrix.count) this.grow(b);
    const m = b.mesh.instanceMatrix.array as Float32Array;
    const at = b.count * 16;
    // x = up × forward, y = up, z = forward.
    const xx = p.y * p.hz - p.z * p.hy;
    const xy = p.z * p.hx - p.x * p.hz;
    const xz = p.x * p.hy - p.y * p.hx;
    m[at] = xx * scale;
    m[at + 1] = xy * scale;
    m[at + 2] = xz * scale;
    m[at + 3] = 0;
    m[at + 4] = p.x * scale;
    m[at + 5] = p.y * scale;
    m[at + 6] = p.z * scale;
    m[at + 7] = 0;
    m[at + 8] = p.hx * scale;
    m[at + 9] = p.hy * scale;
    m[at + 10] = p.hz * scale;
    m[at + 11] = 0;
    m[at + 12] = px;
    m[at + 13] = py;
    m[at + 14] = pz;
    m[at + 15] = 1;
    const a = b.anim.array as Float32Array;
    a[b.count * 4] = p.cycle - Math.floor(p.cycle);
    a[b.count * 4 + 1] = p.stride;
    a[b.count * 4 + 2] = p.trot;
    a[b.count * 4 + 3] = p.graze;
    (b.idle.array as Float32Array)[b.count] = p.idle % 10000;
    b.count++;
  }

  /** A bigger mesh for the batch, keeping what is written so far. */
  private grow(b: Batch): void {
    const capacity = b.mesh.instanceMatrix.count * 2;
    const old = b.mesh;
    const oldAnim = b.anim.array as Float32Array;
    const oldIdle = b.idle.array as Float32Array;
    const oldMatrices = old.instanceMatrix.array as Float32Array;
    this.object.remove(old);
    old.dispose();
    const made = this.createMesh(b.geometry, b.material, capacity);
    (made.mesh.instanceMatrix.array as Float32Array).set(oldMatrices);
    (made.anim.array as Float32Array).set(oldAnim);
    (made.idle.array as Float32Array).set(oldIdle);
    b.mesh = made.mesh;
    b.anim = made.anim;
    b.idle = made.idle;
  }

  private clear(): void {
    this.cells.clear();
    this.rescan = true;
    this.pending = 0;
    for (const row of this.batches) {
      for (const b of row) {
        b.count = 0;
        b.mesh.count = 0;
        b.mesh.visible = false;
      }
    }
    for (const cell of this.released.values()) cell.drawn.fill(NaN);
  }

  /** Where each loaded herd's first animal still there is now (body frame, on the ground), nearest the camera first. */
  herdPositions(): THREE.Vector3[] {
    const out: { p: THREE.Vector3; d: number }[] = [];
    const t = this.clock.renderTime;
    for (const cell of this.cells.values()) {
      const k = cell.gone.indexOf(HERE);
      if (!cell.path || k < 0) continue;
      const pose = cell.path.pose(k, t, this.pose);
      let r = this.ground(pose);
      if (this.plan.sea && r < this.plan.radius) r = this.plan.radius;
      const p = new THREE.Vector3(pose.x, pose.y, pose.z).multiplyScalar(r);
      out.push({ p, d: p.distanceTo(this.camera) });
    }
    return out.sort((a, b) => a.d - b.d).map((x) => x.p);
  }

  /**
   * The nearest animal drawn this frame that a ray passes through, within
   * `maxDistance` (a sphere round its body, about half its length). The
   * returned object is reused. Points in the planet's body frame.
   */
  pick(ray: THREE.Ray, maxDistance = Infinity): AnimalHit | null {
    if (!animalParams.enabled) return null;
    this.best = maxDistance;
    this.found = null;
    for (const cell of this.cells.values()) this.pickIn(cell, ray);
    for (const cell of this.released.values()) this.pickIn(cell, ray);
    const found = this.found;
    if (!found) return null;
    this.fill(found, this.foundIndex, this.best);
    return this.hit;
  }

  private pickIn(cell: HerdCell, ray: THREE.Ray): void {
    const { herd, species: s } = cell;
    if (!herd || !s) return;
    const { sphere, entry } = this;
    for (let k = 0; k < herd.count; k++) {
      const x = cell.drawn[k * 3]!;
      if (Number.isNaN(x) || cell.gone[k] !== HERE) continue;
      const p = cell.poses[k]!;
      const size = s.length * cell.scales[k]!;
      // About the middle of the body, half its length up.
      sphere.center.set(x, cell.drawn[k * 3 + 1]!, cell.drawn[k * 3 + 2]!).addScaledVector(entry.set(p.x, p.y, p.z), size * 0.4);
      sphere.radius = size * 0.6;
      const at = ray.intersectSphere(sphere, entry);
      if (!at) continue;
      const distance = at.distanceTo(ray.origin);
      if (distance >= this.best) continue;
      this.best = distance;
      this.found = cell;
      this.foundIndex = k;
    }
  }

  /** Writes animal `k` of `cell` (drawn this frame) into the reused hit. */
  private fill(cell: HerdCell, k: number, distance: number): AnimalHit {
    const { hit } = this;
    const p = cell.poses[k]!;
    hit.id = `${cell.herd!.id}:${k}`;
    hit.species = cell.species!;
    hit.scale = cell.scales[k]!;
    hit.distance = distance;
    hit.doing = p.stride > 0.05 ? (p.trot > 0.5 ? 'trotting' : 'walking') : p.graze > 0.3 ? 'grazing' : 'resting';
    hit.origin = cell.origin;
    hit.speciesKey = cell.speciesKey;
    hit.position.set(cell.drawn[k * 3]!, cell.drawn[k * 3 + 1]!, cell.drawn[k * 3 + 2]!);
    return hit;
  }

  /**
   * Calls `visit` for each animal drawn this frame whose body is under a disc
   * `radius` wide round `point` on the ground (a beam's foot), in the
   * planet's body frame. `hit.distance` is its base's distance from `point`;
   * `hit` is reused, so read it in `visit`. `visit` may promote the animal.
   */
  within(point: THREE.Vector3, radius: number, visit: (hit: AnimalHit) => void): void {
    if (!animalParams.enabled) return;
    for (const cell of this.cells.values()) this.withinIn(cell, point, radius, visit);
    for (const cell of this.released.values()) this.withinIn(cell, point, radius, visit);
  }

  private withinIn(cell: HerdCell, point: THREE.Vector3, radius: number, visit: (hit: AnimalHit) => void): void {
    const { herd, species: s } = cell;
    if (!herd || !s || cell.centre.distanceTo(point) > cell.bound + radius + s.length * MAX_SCALE) return;
    for (let k = 0; k < herd.count; k++) {
      const x = cell.drawn[k * 3]!;
      if (Number.isNaN(x) || cell.gone[k] !== HERE) continue;
      const d = this.entry.set(x, cell.drawn[k * 3 + 1]!, cell.drawn[k * 3 + 2]!).distanceTo(point);
      // Under it if its middle is, or half its body.
      if (d > radius + 0.25 * s.length * cell.scales[k]!) continue;
      visit(this.fill(cell, k, d));
    }
  }

  /**
   * Takes an animal drawn this frame out of the herds' batches and gives it
   * back as an object of its own, standing and walking as it was, for a beam
   * to lift or a weapon to hit. `destroy()` removes it for good (recorded in
   * the planet's change list), `restore()` puts it back in its herd. Null if
   * there's no such animal drawn now, or it's held already.
   */
  promote(id: string): LiveAnimal | null {
    const cut = id.lastIndexOf(':');
    const herdId = id.slice(0, cut);
    const k = Number(id.slice(cut + 1));
    const cell = this.released.get(herdId) ?? this.cells.get(herdId);
    if (!cell || !cell.herd || !cell.species || !(k >= 0 && k < cell.herd.count) || cell.gone[k] !== HERE) return null;
    const x = cell.drawn[k * 3]!;
    if (Number.isNaN(x)) return null;
    const p = cell.poses[k]!;
    const scale = cell.scales[k]!;
    const look = createAnimalObject(cell.species, this.plan.gravity);
    const o = look.object;
    o.position.set(x, cell.drawn[k * 3 + 1]!, cell.drawn[k * 3 + 2]!);
    // x = up × forward, y = up, z = forward, as the batches have it.
    this.yAxis.set(p.x, p.y, p.z);
    this.zAxis.set(p.hx, p.hy, p.hz);
    this.xAxis.crossVectors(this.yAxis, this.zAxis);
    o.quaternion.setFromRotationMatrix(this.basis.makeBasis(this.xAxis, this.yAxis, this.zAxis));
    o.scale.setScalar(scale);
    look.move(p.cycle, p.stride, p.trot, p.graze, p.idle);
    this.scene.add(o);
    this.held.add(id);
    cell.gone[k] = HELD;
    const changes = this.changes;
    let live = true;
    // The cell may have been dropped and made again since: find it afresh.
    const mark = (state: number): void => {
      const now = this.released.get(herdId) ?? this.cells.get(herdId);
      if (now && k < now.gone.length) now.gone[k] = state;
    };
    return {
      id,
      species: cell.species,
      origin: cell.origin,
      scale,
      look,
      destroy: () => {
        if (!live) return;
        live = false;
        this.held.delete(id);
        changes?.removeAnimal(id);
        if (this.released.has(herdId)) this.released.delete(herdId);
        else mark(REMOVED);
      },
      restore: () => {
        if (!live) return;
        live = false;
        this.held.delete(id);
        mark(HERE);
      },
    };
  }

  dispose(): void {
    this.scene.remove(this.object);
    for (const row of [...this.batches, ...[...this.foreign.values()].map((f) => f.row)]) {
      for (const b of row) {
        b.mesh.dispose();
        b.material.dispose();
      }
    }
    for (const row of this.geometries) for (const g of row) g.dispose();
    for (const f of this.foreign.values()) for (const g of f.geometries) g.dispose();
  }
}
