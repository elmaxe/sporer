import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Input } from '../core/Input';
import { COVER_PER_TIER, LATITUDE_SWING, type PlantPlan, type PlantSpecies } from '../gen/plants';
import type { PlantSkeleton } from '../gen/plantForm';
import { EARTH_GLOBE_RADIUS } from '../gen/planets';
import { hashSeed } from '../gen/rng';
import { LabSun } from '../lab/LabLevel';
import { DEFAULT_VIEW, type LabView } from '../lab/labPlanet';
import { Level } from '../levels/Level';
import { OrbitCamera, type OrbitParams } from '../player/OrbitCamera';
import { SurfaceChanges } from '../surface/changes';
import { PLANT_LODS, createPlantGeometry, createPlantMaterial, createTintedPlantMaterial, lodAt, plantSkeleton, setLodTint, type LodPosition, type PlantFadeUniforms } from '../surface/plantLook';
import { PLANT_LOD_COUNT } from '../surface/plantMesh';
import { plantParams } from '../surface/plantParams';
import { SurfaceEntities } from '../surface/SurfaceEntities';
import { renderScene } from '../world/wireframe';
import { GroveCamera, type GroveCameraState } from './GroveCamera';
import type { PlantLabState, PlantLabView } from './labPlants';

/** The grove is a whole planet, Earth's size in low orbit (planet-level units), green all over and without seas. */
export const GROVE_RADIUS = EARTH_GLOBE_RADIUS;
/** The grove camera's centre: about the UFO's height above the ground in the game. */
const GROVE_EYE = 3;
/** The grove's ground stands this far above its radius (the plants' ground, see plantGrove). */
const GROVE_GROUND = 0.5;
/** The sky fades to space between these heights above the grove's ground, in its radii. */
const SKY_FADE: readonly [number, number] = [0.08, 0.8];
const SPACE = new THREE.Color('#03050b');

/** Where the camera was, for the next build of the same view (see PlantLabLevel.carry). */
export interface PlantLabCarry {
  view: PlantLabView['view'];
  direction: THREE.Vector3;
  /** Camera distance in the selected plant's heights (the grove: in units). */
  zoom: number;
  /** The grove: the spot on the planet and the view round it. */
  grove?: GroveCameraState;
}

/** A level of detail's cost, for the readout. */
export interface LodInfo {
  readonly lod: number;
  readonly triangles: number;
  /** Where the game draws it, in units from the plant (start, end of its far fade). */
  readonly from: number;
  readonly to: number;
}

/**
 * One build of the plant lab: the selected species (or all of them, in the
 * grove) drawn by the game's own plant code, under the lab's sun.
 *  - specimen: one plant on flat ground; with the level of detail on 'auto',
 *    an instance per level with the game's fade material, so zooming out
 *    crossfades between them exactly as in low orbit;
 *  - lineup: every level side by side, labelled with its triangles;
 *  - grove: the whole set planted by the game's `SurfaceEntities` (cells,
 *    placement, levels, fade) on a whole green planet, seen from about the
 *    UFO's height or zoomed out to the globe (see GroveCamera).
 */
export class PlantLabLevel extends Level {
  /** The camera: an orbit round the plant, or over the grove's planet. */
  readonly orbit: OrbitCamera | null = null;
  readonly groveCamera: GroveCamera | null = null;
  readonly sun: LabSun;
  readonly grove: SurfaceEntities | null = null;
  readonly species: PlantSpecies;
  readonly skeleton: PlantSkeleton;
  readonly lods: LodInfo[];
  readonly buildMs: number;
  readonly mode: PlantLabView['view'];
  private readonly pivot = new THREE.Object3D();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly fades: PlantFadeUniforms[] = [];
  private readonly fixed: { tint: Pick<PlantFadeUniforms, 'uTint' | 'uTintMix'>; lod: number }[] = [];
  private readonly instanced: THREE.InstancedMesh[] = [];
  private readonly lodScratch: LodPosition = { lod: 0, fade: 0 };
  private readonly worldPos = new THREE.Vector3();
  private readonly sky = new THREE.Color();

  constructor(
    readonly state: PlantLabState,
    private readonly camera: THREE.PerspectiveCamera,
    input: Input,
    debug: Debug,
    carry: PlantLabCarry | null,
  ) {
    super(null);
    const start = performance.now();
    const view = state.view;
    this.mode = view.view;
    const s = (this.species = state.species[state.selected]!);
    this.skeleton = plantSkeleton(s);
    const H = s.height;
    const ranges = PLANT_LODS[s.kind];
    this.scene.background = new THREE.Color(view.sky);

    // The lab's sun: the game's light and ambient for a G star, from the view's azimuth and elevation.
    const sunView: LabView = { ...DEFAULT_VIEW, star: 'G', sunAzimuth: view.sunAzimuth, sunElevation: view.sunElevation, dayCycle: false };
    this.sun = this.add(new LabSun(this.scene, { renderTime: 0 }, sunView, 0, true));

    // Each level of detail of the selected species, built once (the lineup and fixed views draw them as they are).
    const geometries = Array.from({ length: PLANT_LOD_COUNT }, (_, lod) => createPlantGeometry(s, lod));
    this.geometries.push(...geometries);
    this.lods = geometries.map((g, lod) => ({
      lod,
      triangles: g.getAttribute('position').count / 3,
      from: lod === 0 ? 0 : ranges[lod - 1]! * 0.8 * H,
      to: ranges[lod]! * H,
    }));

    if (view.view === 'grove') {
      // The planet's centre is below the origin, so the grove starts round it, under the sun as set.
      const centre = new THREE.Vector3(0, -GROVE_RADIUS, 0);
      const cam = (this.groveCamera = this.add(
        new GroveCamera(camera, input, {
          centre,
          radius: GROVE_RADIUS + GROVE_GROUND,
          eye: GROVE_EYE - GROVE_GROUND,
          minDistance: 2,
          // The globe whole, about half the view's height.
          maxDistance: GROVE_RADIUS * 2.2,
          distance: 28,
          pitch: THREE.MathUtils.degToRad(30),
        }),
      ));
      if (carry?.view === 'grove' && carry.grove) cam.restore(carry.grove);
      this.grove = this.add(this.plantGrove(debug));
      this.groveGround(view.ground, centre);
    } else {
      const orbit = this.plantOrbit(view, H, ranges, geometries, camera, input, debug);
      this.orbit = this.add(orbit.camera);
      if (carry && carry.view === view.view) {
        orbit.camera.lookFrom(carry.direction);
        orbit.camera.setDistance(THREE.MathUtils.clamp(carry.zoom * H, orbit.params.minDistance, orbit.params.maxDistance));
      }
    }
    this.applyLive();
    this.buildMs = performance.now() - start;
  }

  /** The specimen or line-up of the selected species on flat ground, and the camera orbiting it. */
  private plantOrbit(
    view: PlantLabView,
    H: number,
    ranges: readonly number[],
    geometries: THREE.BufferGeometry[],
    camera: THREE.PerspectiveCamera,
    input: Input,
    debug: Debug,
  ): { camera: OrbitCamera; params: OrbitParams } {
    const s = this.species;
    this.flatGround(view.ground, H);
    const floor = H * 0.08;
    const keepOut = (p: THREE.Vector3) => {
      if (p.y < floor) p.y = floor;
    };
    let params: OrbitParams;
    let distance: number;
    let pitch = THREE.MathUtils.degToRad(18);
    if (view.view === 'lineup') {
      const gap = Math.max(2 * s.crownRadius, H * 0.6) * 1.5;
      geometries.forEach((g, lod) => {
        const mesh = this.fixedMesh(g, lod);
        mesh.position.x = (lod - (PLANT_LOD_COUNT - 1) / 2) * gap;
        this.scene.add(mesh);
        this.label(`LOD ${lod} · ${this.lods[lod]!.triangles} ▲`, mesh.position.x, H * 1.12, H * 0.09);
      });
      params = { minDistance: H * 0.4, maxDistance: H * 40, zoomSpeed: 0.0025, rotateSpeed: 0.005, damping: 0.1 };
      // The row fills about the width of a 16:9 view (65° tall field of view, so about 98° wide).
      distance = Math.max(H * 1.6, (gap * (PLANT_LOD_COUNT - 1) + 2 * s.crownRadius) * 0.62);
      pitch = THREE.MathUtils.degToRad(12);
    } else {
      if (view.lod === 'auto') {
        // One instance per level with the game's fade material: the camera's distance picks and blends them.
        geometries.forEach((g, lod) => {
          const { material, uniforms } = createPlantMaterial(lod, H, ranges);
          this.materials.push(material);
          this.fades.push(uniforms);
          const mesh = new THREE.InstancedMesh(g, material, 1);
          mesh.setMatrixAt(0, new THREE.Matrix4());
          mesh.frustumCulled = false;
          this.instanced.push(mesh);
          this.scene.add(mesh);
        });
      } else {
        this.scene.add(this.fixedMesh(geometries[view.lod]!, view.lod));
      }
      // Out past the last fade, to watch the plant go.
      params = { minDistance: H * 0.35, maxDistance: H * ranges[ranges.length - 1]! * 1.4, zoomSpeed: 0.0025, rotateSpeed: 0.005, damping: 0.1 };
      distance = H * 2.4;
    }
    if (view.skeleton) this.scene.add(this.skeletonOverlay());
    this.pivot.position.set(0, H * 0.5, 0);
    this.scene.add(this.pivot);
    const orbit = new OrbitCamera(camera, this.pivot, input, params, { distance, pitch, minPitch: THREE.MathUtils.degToRad(-60), keepOut }, debug, 'Plant lab camera');
    return { camera: orbit, params };
  }

  /** The species set planted on a sphere, its equator (where the grove is) as warm as the species like. */
  private plantGrove(debug: Debug): SurfaceEntities {
    const { species, tier, seed } = this.state;
    const R = GROVE_RADIUS;
    // The plan's mean temperature puts the equator (mean + 2/3 of the swing) at the middle of the species' windows.
    const mid = species.reduce((t, s) => t + (s.minTemperature + s.maxTemperature) / 2, 0) / species.length;
    const plan: PlantPlan = {
      seed: hashSeed(seed, 'grove'),
      tier,
      species,
      temperature: mid - (2 / 3) * LATITUDE_SWING,
      radius: R,
      // A gentle 1-unit relief, all of it at half height: every kind is below its tree line and nothing is too steep.
      peak: R + 1,
      cover: COVER_PER_TIER[tier]!,
    };
    const grove = new SurfaceEntities(this.scene, plan, () => R + GROVE_GROUND, this.camera, new SurfaceChanges(), debug);
    // The body frame's equator at longitude 0 (+Z) is the world's up, at the origin.
    grove.object.rotation.x = -Math.PI / 2;
    grove.object.position.set(0, -R, 0);
    grove.object.updateMatrixWorld(true);
    return grove;
  }

  /** The grove's whole planet round `centre`, the plants' ground (GROVE_GROUND up, where they stand): plain, no seas. */
  private groveGround(color: string, centre: THREE.Vector3): void {
    // Edges of about 10 units: the faces sag less than 0.04 below the plants' ground.
    const g = new THREE.IcosahedronGeometry(GROVE_RADIUS + GROVE_GROUND, 40);
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

  private flatGround(color: string, height: number): void {
    this.addGround(new THREE.CircleGeometry(Math.max(200, height * 110), 64).rotateX(-Math.PI / 2), color);
  }

  private addGround(g: THREE.BufferGeometry, color: string, flatShading = true): void {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading });
    this.geometries.push(g);
    this.materials.push(m);
    this.scene.add(new THREE.Mesh(g, m));
  }

  /** A level of detail drawn as it is (tinted with its LOD colour when asked, see applyLive). */
  private fixedMesh(g: THREE.BufferGeometry, lod: number): THREE.Mesh {
    const { material, tint } = createTintedPlantMaterial(lod);
    this.materials.push(material);
    this.fixed.push({ tint, lod });
    return new THREE.Mesh(g, material);
  }

  /** A text label facing the camera at (x, y), `size` high. */
  private label(text: string, x: number, y: number, size: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '600 52px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(8, 14, 28, 0.85)';
    ctx.strokeText(text, 256, 48);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 256, 48);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(size * (512 / 96), size, 1);
    sprite.position.set(x, y, 0);
    sprite.renderOrder = 10;
    this.textures.push(texture);
    this.materials.push(material);
    this.scene.add(sprite);
  }

  /** The stems' centre lines (white trunk, then yellow, orange, red by order) and a dot at each leaf mass, drawn over the plant. */
  private skeletonOverlay(): THREE.Object3D {
    const colors = ['#ffffff', '#ffe066', '#ff9f43', '#ff5a5a'].map((c) => new THREE.Color(c));
    const positions: number[] = [];
    const lineColors: number[] = [];
    for (const stem of this.skeleton.stems) {
      const c = colors[Math.min(stem.order, colors.length - 1)]!;
      for (let i = 0; i + 1 < stem.points.length; i++) {
        positions.push(...stem.points[i]!, ...stem.points[i + 1]!);
        lineColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    for (const f of this.skeleton.fronds) {
      for (let i = 0; i + 1 < f.points.length; i++) {
        positions.push(...f.points[i]!, ...f.points[i + 1]!);
        lineColors.push(0.6, 1, 0.6, 0.6, 1, 0.6);
      }
    }
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    lines.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 });
    const dots = new THREE.BufferGeometry();
    dots.setAttribute('position', new THREE.Float32BufferAttribute(this.skeleton.leaves.flatMap((l) => l.centre), 3));
    const dotMaterial = new THREE.PointsMaterial({ color: '#7dffb0', size: 6, sizeAttenuation: false, depthTest: false, transparent: true });
    this.geometries.push(lines, dots);
    this.materials.push(lineMaterial, dotMaterial);
    const group = new THREE.Group();
    const lineObject = new THREE.LineSegments(lines, lineMaterial);
    const dotObject = new THREE.Points(dots, dotMaterial);
    lineObject.renderOrder = dotObject.renderOrder = 5;
    group.add(lineObject, dotObject);
    return group;
  }

  /** View options that apply without a rebuild: the tint and the sun. */
  applyLive(): void {
    const view = this.state.view;
    plantParams.showLods = view.showLods;
    this.fades.forEach((u, lod) => setLodTint(u, lod, view.showLods));
    for (const f of this.fixed) setLodTint(f.tint, f.lod, view.showLods);
    this.sky.set(view.sky);
    if (this.scene.background instanceof THREE.Color) this.scene.background.copy(this.sky);
  }

  override update(frameDt: number, alpha: number): void {
    for (const u of this.fades) u.uRange.value = plantParams.range;
    super.update(frameDt, alpha);
    const cam = this.groveCamera;
    if (cam && this.scene.background instanceof THREE.Color) {
      // Out of the grove's sky into space, rising over its planet.
      const height = this.camera.position.distanceTo(cam.params.centre) / cam.params.radius - 1;
      this.scene.background.copy(this.sky).lerp(SPACE, THREE.MathUtils.smoothstep(height, SKY_FADE[0], SKY_FADE[1]));
    }
  }

  /** The specimen's level of detail at the camera's distance, as the game picks it (the base of the plant to the camera, in heights). */
  lodNow(): LodPosition {
    const d = this.camera.getWorldPosition(this.worldPos).length() / (this.species.height * plantParams.range);
    return lodAt(PLANT_LODS[this.species.kind], d, this.lodScratch);
  }

  /** The camera's distance to the specimen, in its heights. */
  get distanceInHeights(): number {
    return this.camera.getWorldPosition(this.worldPos).length() / this.species.height;
  }

  /**
   * Camera from azimuth `yaw` and elevation `pitch` (degrees), `distance` away (in the plant's heights; the grove:
   * units, round the spot it's over, straight down and as far as the whole planet at 90° and 880).
   */
  look(yaw: number, pitch: number, distance?: number): void {
    const y = THREE.MathUtils.degToRad(yaw);
    const p = THREE.MathUtils.degToRad(pitch);
    if (this.groveCamera) this.groveCamera.look(y, p, distance);
    else {
      this.orbit!.lookFrom(new THREE.Vector3(Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)));
      if (distance !== undefined) this.orbit!.setDistance(distance * this.species.height);
    }
  }

  carry(): PlantLabCarry {
    const offset = this.camera.position.clone().sub(this.pivot.position);
    const length = offset.length();
    if (this.groveCamera) return { view: this.mode, direction: offset.normalize(), zoom: length, grove: this.groveCamera.state() };
    return { view: this.mode, direction: offset.normalize(), zoom: length / this.species.height };
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
    for (const m of this.instanced) m.dispose();
  }
}
