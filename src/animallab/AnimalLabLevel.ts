import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Input } from '../core/Input';
import type { AnimalSkeleton } from '../gen/animalForm';
import { animalGait, type AnimalGait, type AnimalPlan, type AnimalSpecies } from '../gen/animals';
import { EARTH_GLOBE_RADIUS } from '../gen/planets';
import { COVER_PER_TIER, LATITUDE_SWING, planPlants, type PlantPlan } from '../gen/plants';
import { hashSeed } from '../gen/rng';
import { LabSun } from '../lab/LabLevel';
import { DEFAULT_VIEW, type LabView } from '../lab/labPlanet';
import { Level } from '../levels/Level';
import { OrbitCamera, type OrbitParams } from '../player/OrbitCamera';
import { GroveCamera, type GroveCameraState } from '../plantlab/GroveCamera';
import { ANIMAL_LODS, addAnimationAttributes, animCycle, animalMotion, animalSkeleton, createAnimalGeometry, createAnimalMaterial, setAnimalTint, type AnimalMotion, type AnimalUniforms } from '../surface/animalLook';
import { ANIMAL_LOD_COUNT } from '../surface/animalMesh';
import { animalParams } from '../surface/animalParams';
import { SurfaceChanges } from '../surface/changes';
import { SurfaceAnimals } from '../surface/SurfaceAnimals';
import { SurfaceEntities } from '../surface/SurfaceEntities';
import { renderScene } from '../world/wireframe';
import type { AnimalLabState, AnimalLabView } from './labAnimals';

/** The herds roam a whole planet, Earth's size in low orbit, green all over and without seas. */
export const HERD_PLANET_RADIUS = EARTH_GLOBE_RADIUS;
const HERD_EYE = 3;
const HERD_GROUND = 0.5;
const SKY_FADE: readonly [number, number] = [0.08, 0.8];
const SPACE = new THREE.Color('#03050b');

export interface AnimalLabCarry {
  view: AnimalLabView['view'];
  direction: THREE.Vector3;
  /** Camera distance in the selected animal's lengths (herds: units). */
  zoom: number;
  grove?: GroveCameraState;
}

export interface AnimalLodInfo {
  readonly lod: number;
  readonly triangles: number;
  /** Where the game draws it, in units from the animal. */
  readonly from: number;
  readonly to: number;
}

/** One animated instance the level poses itself (the specimen and the line-ups). */
interface Posed {
  readonly mesh: THREE.InstancedMesh;
  readonly anim: THREE.InstancedBufferAttribute;
  readonly idle: THREE.InstancedBufferAttribute;
  readonly position: THREE.Vector3;
  /** Its own idle clock offset, so a line-up doesn't move in step. */
  readonly offset: number;
}

/**
 * One build of the animal lab: the selected species (or all of them) drawn
 * and walked by the game's own animal code, under the lab's sun.
 *  - specimen: one animal on flat ground, standing, grazing, or walking or
 *    trotting round a circle at its gait's speed (the camera follows it);
 *    with the level of detail on 'auto', an instance per level with the
 *    game's fade material, so zooming out crossfades as in low orbit;
 *  - lineup: every level side by side, labelled with its triangles;
 *  - species: the whole set side by side, to compare sizes;
 *  - herds: the set roaming a whole green planet with the game's
 *    `SurfaceAnimals` (and the planet's plants), seen through the plant
 *    lab's grove camera.
 */
export class AnimalLabLevel extends Level {
  readonly orbit: OrbitCamera | null = null;
  readonly groveCamera: GroveCamera | null = null;
  readonly sun: LabSun;
  readonly herds: SurfaceAnimals | null = null;
  readonly plants: SurfaceEntities | null = null;
  readonly species: AnimalSpecies;
  readonly skeleton: AnimalSkeleton;
  readonly gait: AnimalGait;
  readonly motion: AnimalMotion;
  readonly lods: AnimalLodInfo[];
  readonly buildMs: number;
  readonly mode: AnimalLabView['view'];
  /** The lab's clock (seconds, at the view's speed): the herds' time, the specimen's walk. */
  readonly clock = { renderTime: 0 };
  private readonly pivot = new THREE.Object3D();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly uniforms: { u: AnimalUniforms; lod: number }[] = [];
  private readonly posed: Posed[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scaleOne = new THREE.Vector3(1, 1, 1);
  private readonly worldPos = new THREE.Vector3();
  private readonly sky = new THREE.Color();
  /** The specimen's walk: distance along its circle (units) and the circle's radius. */
  private walked = 0;
  private readonly circle: number;
  private skeletonGroup: THREE.Object3D | null = null;
  private readonly specimenAt = new THREE.Vector3();
  private heading = 0;
  /** What the specimen is doing now (eased between paces). */
  private stride = 0;
  private trot = 0;
  private graze = 0;
  /** Herds: jump to the nearest herd once they're loaded (not when the camera was carried over from the last build). */
  private findHerd: boolean;

  constructor(
    readonly state: AnimalLabState,
    private readonly camera: THREE.PerspectiveCamera,
    input: Input,
    debug: Debug,
    carry: AnimalLabCarry | null,
  ) {
    super(null);
    const start = performance.now();
    const view = state.view;
    this.mode = view.view;
    const s = (this.species = state.species[state.selected]!);
    this.skeleton = animalSkeleton(s);
    this.gait = animalGait(this.skeleton, view.gravity);
    this.motion = animalMotion(s, view.gravity);
    const L = s.length;
    this.circle = Math.max(2.5, L * 2.5);
    this.scene.background = new THREE.Color(view.sky);
    const sunView: LabView = { ...DEFAULT_VIEW, star: 'G', sunAzimuth: view.sunAzimuth, sunElevation: view.sunElevation, dayCycle: false };
    this.sun = this.add(new LabSun(this.scene, { renderTime: 0 }, sunView, 0, true));

    const geometries = Array.from({ length: ANIMAL_LOD_COUNT }, (_, lod) => createAnimalGeometry(s, lod));
    this.geometries.push(...geometries);
    this.lods = geometries.map((g, lod) => ({
      lod,
      triangles: g.getAttribute('position').count / 3,
      from: lod === 0 ? 0 : ANIMAL_LODS[lod - 1]! * 0.8 * L,
      to: ANIMAL_LODS[lod]! * L,
    }));

    if (view.view === 'herds') {
      const centre = new THREE.Vector3(0, -HERD_PLANET_RADIUS, 0);
      const cam = (this.groveCamera = this.add(
        new GroveCamera(camera, input, {
          centre,
          radius: HERD_PLANET_RADIUS + HERD_GROUND,
          eye: HERD_EYE - HERD_GROUND,
          minDistance: 2,
          maxDistance: HERD_PLANET_RADIUS * 2.2,
          distance: 40,
          pitch: THREE.MathUtils.degToRad(30),
        }),
      ));
      if (carry?.view === 'herds' && carry.grove) cam.restore(carry.grove);
      this.findHerd = !(carry?.view === 'herds' && carry.grove);
      const { animals, plants } = this.herdPlanet(debug);
      this.herds = this.add(animals);
      this.plants = this.add(plants);
      this.planetGround(view.ground, centre);
    } else {
      this.findHerd = false;
      const orbit = this.specimenOrbit(view, geometries, input, debug);
      this.orbit = this.add(orbit.camera);
      if (carry && carry.view === view.view) {
        orbit.camera.lookFrom(carry.direction);
        orbit.camera.setDistance(THREE.MathUtils.clamp(carry.zoom * L, orbit.params.minDistance, orbit.params.maxDistance));
      }
    }
    this.applyLive();
    this.buildMs = performance.now() - start;
  }

  private specimenOrbit(view: AnimalLabView, geometries: THREE.BufferGeometry[], input: Input, debug: Debug): { camera: OrbitCamera; params: OrbitParams } {
    const s = this.species;
    const L = s.length;
    const H = Math.max(this.skeleton.top, L * 0.4);
    this.flatGround(view.ground, L);
    const floor = H * 0.08;
    const keepOut = (p: THREE.Vector3) => {
      if (p.y < floor) p.y = floor;
    };
    let params: OrbitParams;
    let distance: number;
    let pitch = THREE.MathUtils.degToRad(15);
    if (view.view === 'lineup') {
      const gap = Math.max(this.skeleton.width * 2, L) * 1.5;
      geometries.forEach((g, lod) => {
        const x = (lod - (ANIMAL_LOD_COUNT - 1) / 2) * gap;
        this.addPosed(g, this.material(lod, s, this.motion, false), new THREE.Vector3(x, 0, 0), lod * 7);
        this.label(`LOD ${lod} · ${this.lods[lod]!.triangles} ▲`, x, H * 1.25, H * 0.12);
      });
      params = { minDistance: L * 0.4, maxDistance: L * 40, zoomSpeed: 0.0025, rotateSpeed: 0.005, damping: 0.1 };
      distance = Math.max(L * 1.6, gap * ANIMAL_LOD_COUNT * 0.75);
      this.pivot.position.set(0, H * 0.5, 0);
    } else if (view.view === 'species') {
      // The whole set side by side, biggest in the middle, each turned three-quarters to the camera.
      const set = this.state.species;
      const widths = set.map((x) => Math.max(animalSkeleton(x).width * 2, x.length * 0.8) * 1.25);
      const span = widths.reduce((a, b) => a + b, 0);
      let at = -span / 2;
      let tallest = 0;
      set.forEach((x, i) => {
        const k = animalSkeleton(x);
        const motion = animalMotion(x, view.gravity);
        const g = createAnimalGeometry(x, 0);
        this.geometries.push(g);
        const px = at + widths[i]! / 2;
        at += widths[i]!;
        this.addPosed(g, this.material(0, x, motion, false), new THREE.Vector3(px, 0, 0), i * 3.7);
        this.label(x.name, px, k.top + Math.max(0.3, x.length * 0.2), Math.max(0.18, x.length * 0.09));
        tallest = Math.max(tallest, k.top);
      });
      params = { minDistance: L * 0.4, maxDistance: span * 8 + 20, zoomSpeed: 0.0025, rotateSpeed: 0.005, damping: 0.1 };
      distance = Math.max(4, span * 0.75);
      pitch = THREE.MathUtils.degToRad(12);
      this.pivot.position.set(0, tallest * 0.5, 0);
    } else {
      if (view.lod === 'auto') {
        // One instance per level with the game's fade material: the camera's distance picks and blends them.
        geometries.forEach((g, lod) => this.addPosed(g, this.material(lod, s, this.motion, true), new THREE.Vector3(), 0));
      } else {
        this.addPosed(geometries[view.lod]!, this.material(view.lod, s, this.motion, false), new THREE.Vector3(), 0);
      }
      params = { minDistance: L * 0.35, maxDistance: L * ANIMAL_LODS[ANIMAL_LODS.length - 1]! * 1.4, zoomSpeed: 0.0025, rotateSpeed: 0.005, damping: 0.1 };
      distance = L * 2.6;
      this.pivot.position.set(0, H * 0.5, 0);
      if (view.skeleton) {
        this.skeletonGroup = this.skeletonOverlay();
        this.scene.add(this.skeletonGroup);
      }
    }
    this.scene.add(this.pivot);
    const orbit = new OrbitCamera(this.camera, this.pivot, input, params, { distance, pitch, minPitch: THREE.MathUtils.degToRad(-60), keepOut }, debug, 'Animal lab camera');
    return { camera: orbit, params };
  }

  private material(lod: number, s: AnimalSpecies, motion: AnimalMotion, fade: boolean): THREE.MeshStandardMaterial {
    const { material, uniforms } = createAnimalMaterial(lod, s, motion, fade);
    this.materials.push(material);
    this.uniforms.push({ u: uniforms, lod });
    return material;
  }

  private addPosed(g: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, offset: number): void {
    // Each posed instance draws through its own geometry (its animation attributes are per mesh).
    const own = g.clone();
    this.geometries.push(own);
    const mesh = new THREE.InstancedMesh(own, material, 1);
    mesh.frustumCulled = false;
    const { anim, idle } = addAnimationAttributes(mesh, 1);
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(position.x, position.y, position.z));
    this.scene.add(mesh);
    this.posed.push({ mesh, anim, idle, position: position.clone(), offset });
  }

  /** The set roaming a whole planet: its animals in herds (every herd cell with one, to see plenty) and its plants. */
  private herdPlanet(debug: Debug): { animals: SurfaceAnimals; plants: SurfaceEntities } {
    const { species, tier, seed } = this.state;
    const R = HERD_PLANET_RADIUS;
    const mid = species.reduce((t, s) => t + (s.minTemperature + s.maxTemperature) / 2, 0) / species.length;
    const temperature = mid - (2 / 3) * LATITUDE_SWING;
    const plan: AnimalPlan = { seed: hashSeed(seed, 'herds'), tier, species, temperature, gravity: this.state.view.gravity, radius: R, peak: R + 1, sea: false, herdChance: 1 };
    const ground = () => R + HERD_GROUND;
    const animals = new SurfaceAnimals(this.scene, plan, ground, this.camera, this.clock, debug);
    const plantsPlan = planPlants({ seed: hashSeed(seed, 'herd plants'), tier, temperature, water: 0.7, radius: R, peak: R + 1 })!;
    const plants = new SurfaceEntities(this.scene, { ...plantsPlan, cover: COVER_PER_TIER[tier]! * 0.6 } satisfies PlantPlan, ground, this.camera, new SurfaceChanges(), debug);
    for (const o of [animals.object, plants.object]) {
      o.rotation.x = -Math.PI / 2;
      o.position.set(0, -R, 0);
      o.updateMatrixWorld(true);
    }
    return { animals, plants };
  }

  private planetGround(color: string, centre: THREE.Vector3): void {
    const g = new THREE.IcosahedronGeometry(HERD_PLANET_RADIUS + HERD_GROUND, 40);
    const pos = g.getAttribute('position');
    const normal = g.getAttribute('normal');
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      normal.setXYZ(i, v.x, v.y, v.z);
    }
    g.translate(centre.x, centre.y, centre.z);
    this.addGround(g, color, false);
  }

  private flatGround(color: string, length: number): void {
    this.addGround(new THREE.CircleGeometry(Math.max(200, length * 150), 64).rotateX(-Math.PI / 2), color);
    // A ring where the specimen walks, and spokes, so its feet can be seen to keep pace with the ground.
    const positions: number[] = [];
    const n = 96;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      positions.push(Math.cos(a0) * this.circle, 0.01, Math.sin(a0) * this.circle, Math.cos(a1) * this.circle, 0.01, Math.sin(a1) * this.circle);
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      positions.push(Math.cos(a) * this.circle * 0.85, 0.01, Math.sin(a) * this.circle * 0.85, Math.cos(a) * this.circle * 1.15, 0.01, Math.sin(a) * this.circle * 1.15);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const m = new THREE.LineBasicMaterial({ color: '#2d3f1f', transparent: true, opacity: 0.6 });
    this.geometries.push(g);
    this.materials.push(m);
    this.scene.add(new THREE.LineSegments(g, m));
  }

  private addGround(g: THREE.BufferGeometry, color: string, flatShading = true): void {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading });
    this.geometries.push(g);
    this.materials.push(m);
    this.scene.add(new THREE.Mesh(g, m));
  }

  private label(text: string, x: number, y: number, size: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '600 48px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(8, 14, 28, 0.85)';
    ctx.strokeText(text, 384, 48);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 384, 48);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(size * 8, size, 1);
    sprite.position.set(x, y, 0);
    sprite.renderOrder = 10;
    this.textures.push(texture);
    this.materials.push(material);
    this.scene.add(sprite);
  }

  /** The spine (white), legs (yellow) and spikes (orange) as lines, joints as dots, drawn over the animal. */
  private skeletonOverlay(): THREE.Object3D {
    const k = this.skeleton;
    const positions: number[] = [];
    const colors: number[] = [];
    const line = (pts: readonly (readonly number[])[], c: THREE.Color) => {
      for (let i = 0; i + 1 < pts.length; i++) {
        positions.push(...pts[i]!, ...pts[i + 1]!);
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    };
    line(
      k.spine.map((n) => n.p),
      new THREE.Color('#ffffff'),
    );
    for (const l of k.legs) line(l.points, new THREE.Color(l.arm ? '#7dffb0' : '#ffe066'));
    for (const sp of k.spikes) line(sp.points, new THREE.Color('#ff9f43'));
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    lines.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 });
    const dots = new THREE.BufferGeometry();
    dots.setAttribute('position', new THREE.Float32BufferAttribute([...k.neckBase, ...k.tailBase, ...k.legs.map((l) => l.points[0]!).flat()], 3));
    const dotMaterial = new THREE.PointsMaterial({ color: '#ff5a5a', size: 7, sizeAttenuation: false, depthTest: false, transparent: true });
    this.geometries.push(lines, dots);
    this.materials.push(lineMaterial, dotMaterial);
    const group = new THREE.Group();
    const a = new THREE.LineSegments(lines, lineMaterial);
    const b = new THREE.Points(dots, dotMaterial);
    a.renderOrder = b.renderOrder = 5;
    group.add(a, b);
    return group;
  }

  applyLive(): void {
    const view = this.state.view;
    animalParams.showLods = view.showLods;
    for (const { u, lod } of this.uniforms) setAnimalTint(u, lod, view.showLods);
    this.sky.set(view.sky);
    if (this.scene.background instanceof THREE.Color) this.scene.background.copy(this.sky);
  }

  override update(frameDt: number, alpha: number): void {
    const view = this.state.view;
    const dt = frameDt * view.speed;
    this.clock.renderTime += dt;
    for (const { u } of this.uniforms) u.uRange.value = animalParams.range;
    this.poseSpecimens(dt);
    super.update(frameDt, alpha);
    if (this.findHerd && this.herds?.settled) {
      this.findHerd = false;
      this.lookAtHerd();
    }
    const cam = this.groveCamera;
    if (cam && this.scene.background instanceof THREE.Color) {
      const height = this.camera.position.distanceTo(cam.params.centre) / cam.params.radius - 1;
      this.scene.background.copy(this.sky).lerp(SPACE, THREE.MathUtils.smoothstep(height, SKY_FADE[0], SKY_FADE[1]));
    }
  }

  /** Poses the level's own instances: the specimen walking its circle (or standing, grazing), the line-ups idling. */
  private poseSpecimens(dt: number): void {
    if (this.posed.length === 0) return;
    const view = this.state.view;
    const t = this.clock.renderTime;
    const specimen = this.mode === 'specimen';
    const pace = specimen ? view.pace : 'stand';
    // Ease into the pace, as an animal speeds up and slows down (half a second).
    const k = 1 - Math.exp(-dt / 0.5);
    const moving = pace === 'walk' || pace === 'trot';
    this.stride += ((moving ? 1 : 0) - this.stride) * k;
    this.trot += ((pace === 'trot' ? 1 : 0) - this.trot) * k;
    const grazing = pace === 'graze' ? THREE.MathUtils.smoothstep(Math.sin(t * 0.35), -0.3, 0.3) : 0;
    this.graze += (grazing - this.graze) * k;
    const speed = (this.gait.walkSpeed + (this.gait.trotSpeed - this.gait.walkSpeed) * this.trot) * this.stride;
    const strideLength = this.gait.walkStride + (this.gait.trotStride - this.gait.walkStride) * this.trot;
    this.walked += speed * dt;
    if (specimen) {
      // Round the circle anticlockwise seen from above, facing along it.
      const a = this.walked / this.circle;
      this.specimenAt.set(Math.cos(a) * this.circle, 0, -Math.sin(a) * this.circle);
      this.heading = a + Math.PI;
    }
    const cycle = this.walked / strideLength;
    for (const p of this.posed) {
      if (specimen) {
        this.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading);
        this.matrix.compose(this.specimenAt, this.quaternion, this.scaleOne);
        p.mesh.setMatrixAt(0, this.matrix);
        p.mesh.instanceMatrix.needsUpdate = true;
      }
      const a = p.anim.array as Float32Array;
      a[0] = animCycle(cycle);
      a[1] = specimen ? this.stride : 0;
      a[2] = this.trot;
      a[3] = specimen ? this.graze : 0;
      p.anim.needsUpdate = true;
      (p.idle.array as Float32Array)[0] = t + p.offset;
      p.idle.needsUpdate = true;
    }
    if (specimen) {
      // The camera follows the animal round, looking at its middle.
      this.pivot.position.set(this.specimenAt.x, Math.max(this.skeleton.top, this.species.length * 0.4) * 0.5, this.specimenAt.z);
      if (this.skeletonGroup) {
        this.skeletonGroup.position.copy(this.specimenAt);
        this.skeletonGroup.rotation.set(0, this.heading, 0);
      }
    }
  }

  /** Herds: moves the view over the `index`-th nearest herd (false if there's none loaded). */
  lookAtHerd(index = 0): boolean {
    const herds = this.herds;
    const cam = this.groveCamera;
    if (!herds || !cam) return false;
    const at = herds.herdPositions()[index];
    if (!at) return false;
    // The herd's spot from the planet's centre, in the world: the camera's focus turns +Y (the starting spot) onto it.
    const world = herds.object.localToWorld(at.clone()).sub(cam.params.centre).normalize();
    const state = cam.state();
    cam.restore({ ...state, focus: new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, world) });
    return true;
  }

  /** The specimen's level of detail at the camera's distance, as the game picks it. */
  lodNow(): { lod: number; fade: number } {
    const d = this.distanceInLengths / animalParams.range;
    for (let lod = 0; lod < ANIMAL_LODS.length; lod++) {
      const end = ANIMAL_LODS[lod]!;
      if (d < end) return { lod, fade: Math.max(0, (d - end * 0.8) / (end * 0.2)) };
    }
    return { lod: ANIMAL_LODS.length, fade: 0 };
  }

  /** The camera's distance to the specimen, in its lengths. */
  get distanceInLengths(): number {
    return this.camera.getWorldPosition(this.worldPos).distanceTo(this.specimenAt) / this.species.length;
  }

  /** Camera from azimuth `yaw` and elevation `pitch` (degrees), `distance` away (in the animal's lengths; herds: units). */
  look(yaw: number, pitch: number, distance?: number): void {
    const y = THREE.MathUtils.degToRad(yaw);
    const p = THREE.MathUtils.degToRad(pitch);
    if (this.groveCamera) this.groveCamera.look(y, p, distance);
    else {
      this.orbit!.lookFrom(new THREE.Vector3(Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)));
      // The set side by side goes by its longest animal, so a link frames the same on any set.
      const unit = this.mode === 'species' ? Math.max(...this.state.species.map((x) => x.length)) : this.species.length;
      if (distance !== undefined) this.orbit!.setDistance(distance * unit);
    }
  }

  carry(): AnimalLabCarry {
    const offset = this.camera.position.clone().sub(this.pivot.position);
    const length = offset.length();
    if (this.groveCamera) return { view: this.mode, direction: offset.normalize(), zoom: length, grove: this.groveCamera.state() };
    return { view: this.mode, direction: offset.normalize(), zoom: length / this.species.length };
  }

  override render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    renderScene(renderer, this.scene, camera, this.state.view.wireframe);
  }

  override dispose(): void {
    super.dispose();
    this.scene.clear();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    for (const p of this.posed) p.mesh.dispose();
  }
}
