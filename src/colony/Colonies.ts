import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { now as nowJob, type Defer } from '../core/jobs';
import { tangentBasis, type AnimalPlan } from '../gen/animals';
import { buildingDesign } from '../gen/colonyBuildings';
import {
  BUILDING_FOOTPRINT,
  BUILDING_KINDS,
  buildingGrowth,
  colonistCount,
  colonistSpecies,
  colonistsSuited,
  colonyAge,
  colonyParams,
  planColony,
  standingCount,
  type BuildingKind,
  type ColonyLayout,
  type ColonySite,
} from '../gen/colony';
import type { CreatureDesign } from '../gen/creature';
import type { RenderClock } from '../planet/PlanetFrame';
import { SurfaceAnimals } from '../surface/SurfaceAnimals';
import { lodAt, setLodTint, type LodPosition, type PlantFadeUniforms } from '../surface/plantLook';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import { createGlowTexture } from '../world/glowTexture';
import { GROUND_DETAIL_LAYER } from '../world/groundDepth';
import { ParticlePool } from '../cargo/CargoFx';
import { BUILDING_LODS, BUILDING_LOD_COUNT, buildingGeometry, buildingLodHeight, createBuildingMaterial, type BuildingLight } from './buildingMesh';
import type { ColonySetup } from './colonySetup';

export const colonyLookParams = {
  /** How bright the windows are on the night side. */
  windows: 0.85,
  /** Seconds the landing's flash lasts. */
  flash: 1,
};

/** A colony's kind of building: its geometry and one instanced batch per level of detail. */
interface KindBatch {
  readonly kind: BuildingKind;
  readonly geometries: THREE.BufferGeometry[];
  readonly materials: THREE.MeshStandardMaterial[];
  readonly uniforms: PlantFadeUniforms[];
  readonly meshes: THREE.InstancedMesh[];
  readonly height: number;
  /** The height its levels of detail are measured in (buildingLodHeight). */
  readonly lodHeight: number;
  /** Its buildings in the layout, in the order they go up. */
  readonly buildings: number[];
  /** Where its standing buildings are (the first `standing`), written as they rise; each level draws those in its range. */
  readonly matrices: THREE.Matrix4[];
  standing: number;
}

/** One colony drawn: its plan, its buildings' batches, how far it had grown when last drawn. */
interface ColonyView {
  readonly layout: ColonyLayout;
  readonly batches: Map<BuildingKind, KindBatch>;
  /** Buildings up (rising or risen) when last written, and whether one was still rising. */
  standing: number;
  rising: boolean;
  colonists: number;
  /** Seconds old when added here: a fresh one (its pod just landed) gets the landing's flash and dust. */
  readonly bornAge: number;
}

/** A colony as the map and the tooltips show it. */
export interface ColonyMark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly name: string;
  readonly layout: ColonyLayout;
}

/**
 * The colonies on a body in low orbit (and on the planet lab's globe): each
 * one's buildings standing at its age (gen/colony.ts: worked out from the
 * device's clock, so it has grown while the player was away), every kind of
 * building one instanced mesh per level of detail (colony/buildingMesh.ts),
 * those going up rising out of the ground; and its colonists, the captain's
 * species walking about between them as a herd of the animals' code
 * (`SurfaceAnimals.addHerd`), more of them as it grows. A colony whose pod
 * has just landed gets a flash and a burst of dust as its hub rises.
 */
export class Colonies implements Entity {
  readonly object = new THREE.Group();
  private readonly views: ColonyView[] = [];
  /** The colonists: a SurfaceAnimals of their species alone (no wild herds), walking from the level's clock. */
  readonly colonists: SurfaceAnimals;
  private readonly light: BuildingLight;
  private readonly basis = new THREE.Matrix4();
  private readonly up = new THREE.Vector3();
  private readonly e1 = new THREE.Vector3();
  private readonly e2 = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly spin = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly flashTexture = createGlowTexture();
  private readonly flash: THREE.Sprite;
  private readonly dust: ParticlePool;
  private flashing: ColonyView | null = null;
  private readonly speciesKey: string;
  private readonly eye = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly lod: LodPosition = { lod: 0, fade: 0 };
  private readonly counts = new Array<number>(BUILDING_LOD_COUNT).fill(0);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly setup: ColonySetup,
    private readonly camera: THREE.PerspectiveCamera,
    clock: RenderClock,
    /** The sun's direction in the body frame (the globe's; updated in place). */
    sun: THREE.Vector3,
    /** The captain, whose species the colonists are. */
    captain: CreatureDesign,
    /** The device's clock, ms since 1970 (`Date.now`; the lab winds it to show a colony at any age). */
    private readonly now: () => number,
    debug: Debug,
    defer: Defer = nowJob,
  ) {
    this.object.name = 'Colonies';
    scene.add(this.object);
    this.light = { uSun: { value: sun }, uWindows: { value: colonyLookParams.windows } };
    const species = colonistSpecies(captain, colonistsSuited(setup.world.climate));
    this.speciesKey = `colonists:${species.name}`;
    const g = setup.ground;
    const plan: AnimalPlan = {
      seed: setup.seed,
      tier: setup.tier,
      species: [species],
      temperature: setup.temperature,
      gravity: setup.gravity,
      radius: g?.radius ?? 1,
      peak: setup.peak,
      sea: g?.sea ?? false,
      herdChance: 0,
    };
    // Its own herds only: none of the body's wild ones (those are the level's).
    this.colonists = new SurfaceAnimals(scene, plan, g?.ground ?? (() => plan.radius), camera, clock, debug, null, defer);
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.flashTexture, color: '#fff3d6', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    );
    this.flash.renderOrder = CLOUD_RENDER_ORDER + 0.7;
    this.flash.visible = false;
    scene.add(this.flash);
    this.dust = new ParticlePool(scene, false, CLOUD_RENDER_ORDER + 0.6);
    const f = debug.folder('Colonies');
    f?.add(colonyLookParams, 'windows', 0, 4).onChange((v: number) => (this.light.uWindows.value = v));
    f?.add(colonyParams, 'riseTime', 0.5, 15);
  }

  /** The colonies here. */
  get count(): number {
    return this.views.length;
  }

  /** Their plans, oldest first. */
  get layouts(): readonly ColonyLayout[] {
    return this.views.map((v) => v.layout);
  }

  /** Where each colony is and what it's called (the planet map's marks). */
  marks(): ColonyMark[] {
    return this.views.map((v) => ({ x: v.layout.site.x, y: v.layout.site.y, z: v.layout.site.z, name: v.layout.name, layout: v.layout }));
  }

  /** How old colony `layout` is now (seconds). */
  age(layout: ColonyLayout): number {
    return colonyAge(layout.site, this.now());
  }

  /**
   * Draws the colony founded at `site` (from the body's change list, or just
   * landed). Its plan follows the body's tier now.
   */
  add(site: ColonySite): ColonyLayout | null {
    const g = this.setup.ground;
    if (!g) return null;
    const layout = planColony(site, this.setup.tier, g);
    const batches = new Map<BuildingKind, KindBatch>();
    for (const kind of BUILDING_KINDS) {
      const buildings = layout.buildings.filter((b) => b.kind === kind).map((b) => b.index);
      if (buildings.length === 0) continue;
      const { lods, height } = buildingGeometry(buildingDesign(kind, site.seed));
      const lodHeight = buildingLodHeight(height);
      const materials: THREE.MeshStandardMaterial[] = [];
      const uniforms: PlantFadeUniforms[] = [];
      const meshes: THREE.InstancedMesh[] = [];
      for (let lod = 0; lod < BUILDING_LOD_COUNT; lod++) {
        const { material, uniforms: u } = createBuildingMaterial(lod, lodHeight, this.light);
        const mesh = new THREE.InstancedMesh(lods[lod]!, material, buildings.length);
        mesh.count = 0;
        mesh.visible = false;
        // A few spread over the planet: no useful bounding sphere.
        mesh.frustumCulled = false;
        mesh.layers.enable(GROUND_DETAIL_LAYER);
        mesh.name = `Colony ${layout.name}: ${kind} (level ${lod})`;
        this.object.add(mesh);
        materials.push(material);
        uniforms.push(u);
        meshes.push(mesh);
      }
      const matrices = buildings.map(() => new THREE.Matrix4());
      batches.set(kind, { kind, geometries: lods, materials, uniforms, meshes, height, lodHeight, buildings, matrices, standing: 0 });
    }
    const view: ColonyView = { layout, batches, standing: -1, rising: true, colonists: 0, bornAge: this.age(layout) };
    this.views.push(view);
    this.write(view, this.age(layout));
    if (view.bornAge < colonyLookParams.flash) this.landed(view);
    return layout;
  }

  /** True where a colony's buildings stand or will (the plants and rocks there are cleared). */
  covers(dir: THREE.Vector3): boolean {
    const g = this.setup.ground;
    if (!g) return false;
    for (const v of this.views) {
      const s = v.layout.site;
      if (dir.x * s.x + dir.y * s.y + dir.z * s.z < Math.cos((v.layout.reach + 4) / g.radius)) continue;
      for (const b of v.layout.buildings) {
        const d = Math.acos(Math.min(1, dir.x * b.x + dir.y * b.y + dir.z * b.z)) * g.radius;
        if (d < BUILDING_FOOTPRINT[b.kind] * b.scale + 1.5) return true;
      }
    }
    return false;
  }

  /** True within a colony's grounds: its land is cleared of trees and bushes (the grass and stones stay but under its buildings). */
  clears(dir: THREE.Vector3): boolean {
    const g = this.setup.ground;
    if (!g) return false;
    for (const v of this.views) {
      const s = v.layout.site;
      if (dir.x * s.x + dir.y * s.y + dir.z * s.z > Math.cos((v.layout.reach + 2) / g.radius)) return true;
    }
    return false;
  }

  /** What's here now, for the tests and the lab's readout. */
  stats(): { colonies: number; buildings: number; standing: number; rising: number; colonists: number; drawn: number } {
    let buildings = 0;
    let standing = 0;
    let rising = 0;
    let colonists = 0;
    for (const v of this.views) {
      const age = this.age(v.layout);
      buildings += v.layout.buildings.length;
      standing += standingCount(v.layout, age);
      for (const b of v.layout.buildings) {
        const g = buildingGrowth(b, age);
        if (g > 0 && g < 1) rising++;
      }
      colonists += v.colonists;
    }
    return { colonies: this.views.length, buildings, standing, rising, colonists, drawn: this.colonists.stats().drawn };
  }

  update(frameDt: number): void {
    for (const v of this.views) {
      const age = this.age(v.layout);
      const standing = standingCount(v.layout, age);
      if (standing !== v.standing || v.rising) this.write(v, age);
    }
    this.place();
    for (const v of this.views) for (const b of v.batches.values()) b.uniforms.forEach((u, lod) => setLodTint(u, lod, false));
    this.colonists.update();
    this.dust.setView(window.innerHeight * Math.min(2, window.devicePixelRatio), this.camera.fov);
    this.dust.update(frameDt);
    const f = this.flashing;
    if (f) {
      const t = this.age(f.layout) - f.bornAge;
      const k = 1 - t / colonyLookParams.flash;
      if (k <= 0) {
        this.flash.visible = false;
        this.flashing = null;
      } else {
        this.flash.material.opacity = k;
        this.flash.scale.setScalar(14 * (0.5 + (1 - k)));
      }
    }
  }

  /** Writes a colony's standing buildings into its batches (rising ones out of the ground), and its colonists. */
  private write(v: ColonyView, age: number): void {
    const standing = standingCount(v.layout, age);
    let rising = false;
    for (const batch of v.batches.values()) {
      let n = 0;
      for (const index of batch.buildings) {
        const b = v.layout.buildings[index]!;
        const growth = buildingGrowth(b, age);
        if (growth <= 0) continue;
        if (growth < 1) rising = true;
        // Up out of the globe; the building's own +z turned by its yaw about it.
        this.up.set(b.x, b.y, b.z);
        tangentBasis(this.up, this.e1, this.e2);
        // Right-handed: e2 × up = e1.
        this.basis.makeBasis(this.e2, this.up, this.e1);
        this.turn.setFromRotationMatrix(this.basis);
        this.spin.setFromAxisAngle(Y_AXIS, b.yaw);
        this.turn.multiply(this.spin);
        // Rising: pushed up out of the ground, as a volcano rises.
        this.position.copy(this.up).multiplyScalar(b.radius - (1 - growth) * batch.height * b.scale * 1.05);
        this.scale.setScalar(b.scale);
        batch.matrices[n++]!.compose(this.position, this.turn, this.scale);
      }
      batch.standing = n;
    }
    v.standing = standing;
    v.rising = rising;
    const people = colonistCount(standing);
    if (people !== v.colonists) {
      v.colonists = people;
      const s = v.layout.site;
      this.colonists.addHerd({
        id: s.id,
        species: this.colonists.plan.species[0]!,
        speciesKey: this.speciesKey,
        origin: v.layout.name,
        home: s,
        count: people,
        range: Math.max(8, v.layout.reach * 0.7),
        seed: s.seed,
      });
    }
  }

  /**
   * Each level of detail draws the standing buildings in its range of the
   * camera (and those fading to or from it), so a building far off costs
   * only its far level's few triangles; the material dithers between them.
   */
  private place(): void {
    this.object.updateWorldMatrix(true, false);
    this.object.worldToLocal(this.eye.copy(this.camera.position));
    for (const v of this.views) {
      for (const batch of v.batches.values()) {
        this.counts.fill(0);
        for (let i = 0; i < batch.standing; i++) {
          const m = batch.matrices[i]!;
          const e = m.elements;
          const size = Math.hypot(e[4]!, e[5]!, e[6]!);
          const d = this.at.set(e[12]!, e[13]!, e[14]!).distanceTo(this.eye) / (batch.lodHeight * size);
          const { lod, fade } = lodAt(BUILDING_LODS, d, this.lod);
          if (lod < BUILDING_LOD_COUNT) batch.meshes[lod]!.setMatrixAt(this.counts[lod]!++, m);
          // Fading out to the next level: drawn at both.
          if (fade > 0 && lod + 1 < BUILDING_LOD_COUNT) batch.meshes[lod + 1]!.setMatrixAt(this.counts[lod + 1]!++, m);
        }
        batch.meshes.forEach((mesh, lod) => {
          const n = this.counts[lod]!;
          mesh.visible = n > 0;
          if (n === 0 && mesh.count === 0) return;
          mesh.count = n;
          mesh.instanceMatrix.needsUpdate = true;
        });
      }
    }
  }

  /** The pod has landed: a flash and a ring of dust where the hub rises. */
  private landed(v: ColonyView): void {
    const s = v.layout.site;
    const hub = v.layout.buildings[0];
    const r = hub?.radius ?? this.setup.ground?.radius ?? 1;
    this.up.set(s.x, s.y, s.z);
    this.flash.position.copy(this.up).multiplyScalar(r + 2);
    this.flash.visible = true;
    this.flashing = v;
    tangentBasis(this.up, this.e1, this.e2);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const out = this.position.copy(this.e1).multiplyScalar(Math.cos(a)).addScaledVector(this.e2, Math.sin(a));
      this.dust.emit({
        position: this.up.clone().multiplyScalar(r + 0.6).addScaledVector(out, 2),
        velocity: out.clone().multiplyScalar(9 + (i % 3) * 2).addScaledVector(this.up, 1.5),
        life: 2.2,
        size: 2.2,
        endSize: 6,
        color: '#b9a88e',
        alpha: 0.55,
        lift: 0.4,
        up: this.up.clone(),
        drag: 1.6,
      });
    }
  }

  dispose(): void {
    this.scene.remove(this.object, this.flash);
    for (const v of this.views) {
      for (const b of v.batches.values()) {
        for (const m of b.meshes) m.dispose();
        for (const m of b.materials) m.dispose();
        for (const g of b.geometries) g.dispose();
      }
    }
    this.flash.material.dispose();
    this.flashTexture.dispose();
    this.dust.dispose();
    this.colonists.dispose();
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
