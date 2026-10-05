import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { PlantSpecies } from '../gen/plants';
import { obstacleClearance, type Obstacles } from '../planet/ground';
import { GROUND_DETAIL_LAYER } from '../world/groundDepth';
import type { PlantedPlant, SurfaceChanges } from './changes';
import { PLANT_LODS, createPlantGeometry, createPlantMaterial, setLodTint, type PlantFadeUniforms } from './plantLook';
import { PLANT_LOD_COUNT } from './plantMesh';
import { plantParams } from './plantParams';
import { plantMatrix, underDisc, type LivePlant } from './SurfaceEntities';

/** The planted plant a ray hit. The same object every time: read it before the next `pick`. */
export interface PlantedHit {
  id: string;
  plant: PlantedPlant;
  distance: number;
}

/** One species' meshes: its geometry at each level of detail, and the instanced batch of each. */
interface SpeciesBatches {
  readonly species: PlantSpecies;
  readonly geometries: THREE.BufferGeometry[];
  readonly meshes: THREE.InstancedMesh[];
  readonly materials: THREE.MeshStandardMaterial[];
  readonly uniforms: PlantFadeUniforms[];
  /** Its planted plants drawn now (promoted ones left out). */
  ids: string[];
}

/**
 * The plants the player has set down on this body with the cargo beam and
 * that took root (the change list's `planted`, so they're there on every
 * visit). They can be of any species from anywhere, so each species they
 * belong to gets its own geometry and one instanced mesh per level of detail
 * with the game's fade material (as `SurfaceEntities` draws a body's own),
 * rewritten whenever one is planted, picked up or put back. There are only
 * ever a handful, so every one is in every level's batch and the shader picks.
 * Like `SurfaceEntities`, it can `pick` one along a ray and `promote` one to a
 * live object for the beam to lift. Static in the body frame. As `Obstacles`,
 * it says which of them the ship's hull goes through (to shake them).
 */
export class Plantings implements Entity, Obstacles {
  readonly object = new THREE.Group();
  private readonly bySpecies = new Map<string, SpeciesBatches>();
  private readonly promoted = new Set<string>();
  private readonly live = new Map<string, LivePlant>();
  private liveMaterial: THREE.MeshStandardMaterial | null = null;
  private readonly hit: PlantedHit = { id: '', plant: null as unknown as PlantedPlant, distance: 0 };
  private readonly sphere = new THREE.Sphere();
  private readonly middle = new THREE.Vector3();
  private readonly entry = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly changes: SurfaceChanges,
  ) {
    this.object.name = 'Planted plants';
    scene.add(this.object);
    for (const p of changes.plantedPlants) this.batchesFor(p.speciesKey, p.species);
    this.rebuild();
  }

  /** How many are standing (not lifted). */
  get count(): number {
    return this.changes.plantedCount - this.promoted.size;
  }

  /** The species' geometry at level of detail `lod`, made once per species key (the beam draws its cargo with it too). */
  geometry(key: string, species: PlantSpecies, lod = 0): THREE.BufferGeometry {
    return this.batchesFor(key, species).geometries[lod]!;
  }

  /** Records a plant taking root here, and draws it. */
  plant(p: Omit<PlantedPlant, 'id'>): PlantedPlant {
    const record = this.changes.plant(p);
    this.batchesFor(record.speciesKey, record.species);
    this.rebuild();
    return record;
  }

  /** Removes for good the standing plants where `under(dir)` (a plant's unit direction) says the ground was covered over, e.g. by a volcano rising. */
  bury(under: (dir: THREE.Vector3) => boolean): void {
    const dir = new THREE.Vector3();
    const buried = [...this.changes.plantedPlants].filter((p) => !this.promoted.has(p.id) && under(dir.set(p.x, p.y, p.z)));
    for (const p of buried) this.changes.remove(p.id);
    if (buried.length > 0) this.rebuild();
  }

  update(): void {
    this.object.visible = plantParams.enabled;
    for (const b of this.bySpecies.values()) {
      b.uniforms.forEach((u, lod) => {
        u.uRange.value = plantParams.range;
        setLodTint(u, lod, plantParams.showLods);
      });
    }
  }

  /** The nearest planted plant a ray passes through, within `maxDistance` (as `SurfaceEntities.pick`). */
  pick(ray: THREE.Ray, maxDistance = Infinity): PlantedHit | null {
    if (!plantParams.enabled) return null;
    let best = maxDistance;
    let found = false;
    const { sphere, middle, entry, hit } = this;
    for (const p of this.changes.plantedPlants) {
      if (this.promoted.has(p.id)) continue;
      const size = p.species.height * p.scale;
      middle.set(p.x, p.y, p.z).multiplyScalar(p.radius + size * 0.5);
      sphere.set(middle, Math.max(p.species.crownRadius * p.scale, size * 0.3));
      const at = ray.intersectSphere(sphere, entry);
      if (!at) continue;
      const distance = at.distanceTo(ray.origin);
      if (distance >= best) continue;
      best = distance;
      found = true;
      hit.id = p.id;
      hit.plant = p;
      hit.distance = distance;
    }
    return found ? hit : null;
  }

  /** As `SurfaceEntities.within`: each standing planted plant under a disc `radius` wide round `point` (`hit` reused; `visit` may promote it). */
  within(point: THREE.Vector3, radius: number, visit: (hit: PlantedHit) => void): void {
    if (!plantParams.enabled) return;
    const { middle, hit } = this;
    for (const p of this.changes.plantedPlants) {
      if (this.promoted.has(p.id)) continue;
      const distance = middle.set(p.x, p.y, p.z).multiplyScalar(p.radius).distanceTo(point);
      if (!underDisc(distance, p.species.crownRadius * p.scale, radius)) continue;
      hit.id = p.id;
      hit.plant = p;
      hit.distance = distance;
      visit(hit);
    }
  }

  /** As `SurfaceEntities.touchAlong`: visits every standing planted plant the ship's hull, its centre at `radius`, goes through on the arc `from` → `to`. */
  touchAlong(from: THREE.Vector3, to: THREE.Vector3, radius: number, visit: (x: number, y: number, z: number) => void): void {
    if (!plantParams.enabled) return;
    for (const p of this.changes.plantedPlants) {
      if (this.promoted.has(p.id)) continue;
      const top = p.radius + p.species.height * p.scale;
      if (radius < obstacleClearance(p.x, p.y, p.z, p.species.crownRadius * p.scale, top, from, to)) visit(p.x, p.y, p.z);
    }
  }

  /** A planted plant by id (null if there's none, or it's gone). */
  find(id: string): PlantedPlant | null {
    for (const p of this.changes.plantedPlants) if (p.id === id) return p;
    return null;
  }

  /** As `SurfaceEntities.promote`: the plant as an object of its own, out of the batches; `destroy` forgets it, `restore` puts it back. */
  promote(id: string): LivePlant | null {
    if (this.promoted.has(id)) return null;
    const plant = this.find(id);
    if (!plant) return null;
    const material = (this.liveMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
    const object = new THREE.Group();
    object.name = plant.species.name;
    plantMatrix(plant, this.matrix).decompose(object.position, object.quaternion, object.scale);
    const mesh = new THREE.Mesh(this.geometry(plant.speciesKey, plant.species), material);
    mesh.layers.enable(GROUND_DETAIL_LAYER);
    object.add(mesh);
    this.scene.add(object);
    this.promoted.add(id);
    this.rebuild();
    const done = (): void => {
      if (this.live.get(id) !== handle) return;
      this.live.delete(id);
      this.scene.remove(object);
      this.promoted.delete(id);
    };
    const handle: LivePlant = {
      id,
      species: plant.species,
      object,
      destroy: () => {
        if (this.live.get(id) !== handle) return;
        done();
        this.changes.remove(id);
        this.rebuild();
      },
      restore: () => {
        if (this.live.get(id) !== handle) return;
        done();
        this.rebuild();
      },
    };
    this.live.set(id, handle);
    return handle;
  }

  private batchesFor(key: string, species: PlantSpecies): SpeciesBatches {
    let b = this.bySpecies.get(key);
    if (b) return b;
    const geometries: THREE.BufferGeometry[] = [];
    const meshes: THREE.InstancedMesh[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const uniforms: PlantFadeUniforms[] = [];
    for (let lod = 0; lod < PLANT_LOD_COUNT; lod++) {
      const geometry = createPlantGeometry(species, lod);
      const { material, uniforms: u } = createPlantMaterial(lod, species.height, PLANT_LODS[species.kind]);
      geometries.push(geometry);
      materials.push(material);
      uniforms.push(u);
    }
    b = { species, geometries, meshes, materials, uniforms, ids: [] };
    this.bySpecies.set(key, b);
    return b;
  }

  /** Rewrites every species' batches from the change list (rare: a plant set down, lifted or put back). */
  private rebuild(): void {
    for (const b of this.bySpecies.values()) b.ids = [];
    for (const p of this.changes.plantedPlants) {
      if (this.promoted.has(p.id)) continue;
      this.bySpecies.get(p.speciesKey)?.ids.push(p.id);
    }
    for (const b of this.bySpecies.values()) {
      const n = b.ids.length;
      for (let lod = 0; lod < PLANT_LOD_COUNT; lod++) {
        let mesh = b.meshes[lod];
        if (!mesh || mesh.instanceMatrix.count < n) {
          if (mesh) {
            this.object.remove(mesh);
            mesh.dispose();
          }
          mesh = new THREE.InstancedMesh(b.geometries[lod]!, b.materials[lod]!, Math.max(4, n * 2));
          // A handful spread over the planet: no useful bounding sphere.
          mesh.frustumCulled = false;
          mesh.layers.enable(GROUND_DETAIL_LAYER);
          b.meshes[lod] = mesh;
          this.object.add(mesh);
        }
        b.ids.forEach((id, i) => mesh.setMatrixAt(i, plantMatrix(this.find(id)!, this.matrix)));
        mesh.count = n;
        mesh.visible = n > 0;
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const handle of [...this.live.values()]) handle.restore();
    this.scene.remove(this.object);
    for (const b of this.bySpecies.values()) {
      for (const m of b.meshes) m.dispose();
      for (const m of b.materials) m.dispose();
      for (const g of b.geometries) g.dispose();
    }
    this.liveMaterial?.dispose();
  }
}
