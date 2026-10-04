import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { ROCK_CELL_SIZE, ROCK_SHAPES, generateRockCell, rockGridSize, type RockData, type RockGround, type RockPlan } from '../gen/rocks';
import { faceGridPoint } from '../world/cubeSphereMath';
import { GROUND_DETAIL_LAYER, groundDepthPass } from '../world/groundDepth';
import { viewFreeze } from '../world/viewFreeze';
import { createRockGeometries } from './rockMesh';

/** Tunables of the ground's rocks (debug folder Rocks). */
export const rockParams = {
  /** The menu's Rocks switch. */
  enabled: true,
  /**
   * A rock is drawn while it's at least this big in the view (radians across;
   * 0.006 is ~4 px on a 720 px tall view at a 65° field of view), fading out
   * over the last fifth: small stones show only close by, boulders from further.
   */
  angle: 0.006,
  /** Nothing further than this (units): the rocks load only as the camera comes this close to the ground. */
  range: 110,
  /** Milliseconds a frame may spend making cells. */
  budget: 2,
  /** Thins them out (0–1 of the generated rocks drawn). */
  share: 1,
};

/** The fade starts this share of the way to a rock's farthest. */
const FADE_START = 0.8;
/** The camera must move this far (units) before the rocks drawn are chosen again. */
const SCAN_DISTANCE = 3;
/** A cell stays loaded until it's this much further out than wanted (no flicker at the edge). */
const KEEP_EXTRA = 1.2;
/** Instances a shape's batch starts with; it doubles when full. */
const FIRST_CAPACITY = 256;

interface Cell {
  readonly key: number;
  readonly rocks: RockData[];
}

interface Batch {
  mesh: THREE.InstancedMesh;
  readonly geometry: THREE.BufferGeometry;
}

/**
 * Loose rocks and boulders on a solid body's ground (gen/rocks.ts), loaded
 * as the camera comes near the ground: the cells within reach are made a few
 * per frame within a time budget and far ones dropped. Each rock shape is one
 * `InstancedMesh`; every few units the camera moves, the rocks big enough to
 * see from where it is go into the batches, and in the shader each fades out
 * with a dither as it shrinks below `rockParams.angle` in the view (so stones
 * show only close by, boulders from further, and nothing pops). Static in the
 * planet's body frame, like the globe.
 */
export class GroundRocks implements Entity {
  readonly object = new THREE.Group();
  private readonly cells = new Map<number, Cell>();
  private readonly centres: Float32Array;
  private readonly gridSize: number;
  /** A cell's rocks lie within this angle (radians) of its centre. */
  private readonly cellAngle: number;
  private readonly geometries: THREE.BufferGeometry[];
  private readonly material: THREE.MeshStandardMaterial;
  private readonly uniforms = { uRockAngle: { value: rockParams.angle } };
  private readonly batches: Batch[] = [];
  private readonly camera = new THREE.Vector3();
  private readonly cameraDir = new THREE.Vector3();
  private readonly lastScan = new THREE.Vector3(Infinity, 0, 0);
  /** Cells wanted but not made yet, nearest first. */
  private readonly wanted: number[] = [];
  private pending = 0;
  private dirty = false;
  private rescan = true;
  private lastParams = '';
  private buried: ((dir: THREE.Vector3) => boolean) | null = null;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly lean = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly dir = new THREE.Vector3();
  private readonly Y = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly scene: THREE.Scene,
    readonly plan: RockPlan,
    private readonly ground: RockGround,
    private readonly cameraSource: THREE.Camera,
    debug: Debug,
  ) {
    const n = (this.gridSize = rockGridSize(plan.radius));
    this.cellAngle = (ROCK_CELL_SIZE * 0.9) / plan.radius;
    this.centres = new Float32Array(6 * n * n * 3);
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
    this.geometries = createRockGeometries();
    this.material = createRockMaterial(this.uniforms);
    for (const geometry of this.geometries) this.batches.push({ mesh: this.createMesh(geometry, FIRST_CAPACITY), geometry });
    this.object.name = 'Rocks';
    scene.add(this.object);

    const f = debug.folder('Rocks');
    f?.add(rockParams, 'enabled');
    f?.add(rockParams, 'angle', 0.001, 0.05, 0.0005);
    f?.add(rockParams, 'range', 10, 400, 5);
    f?.add(rockParams, 'budget', 0.5, 10, 0.5);
    f?.add(rockParams, 'share', 0, 1, 0.05);
  }

  private createMesh(geometry: THREE.BufferGeometry, capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
    mesh.count = 0;
    mesh.visible = false;
    // Spread over the ground round the camera: culled per rock by the scan instead.
    mesh.frustumCulled = false;
    mesh.layers.enable(GROUND_DETAIL_LAYER);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.name = 'Rocks';
    this.object.add(mesh);
    return mesh;
  }

  /** Cells loaded, rocks in them and rocks drawn now (for the lab's readout and the smoke test). */
  stats(): { cells: number; rocks: number; drawn: number } {
    let rocks = 0;
    for (const cell of this.cells.values()) rocks += cell.rocks.length;
    let drawn = 0;
    for (const b of this.batches) if (b.mesh.visible) drawn += b.mesh.count;
    return { cells: this.cells.size, rocks, drawn };
  }

  /** True when no cell the camera wants is still to be made (for automation). */
  get settled(): boolean {
    return !this.rescan && !this.dirty && this.pending === 0;
  }

  /** Rocks where `test` says something covers the ground (a volcano) are left out from now on; null shows them all again. */
  setBuried(test: ((dir: THREE.Vector3) => boolean) | null): void {
    this.buried = test;
    this.dirty = true;
  }

  update(): void {
    const enabled = rockParams.enabled;
    this.object.visible = enabled;
    if (!enabled) {
      if (this.cells.size > 0) this.clear();
      return;
    }
    this.uniforms.uRockAngle.value = rockParams.angle;
    const params = `${rockParams.angle}/${rockParams.range}/${rockParams.share}`;
    if (params !== this.lastParams) {
      this.lastParams = params;
      this.rescan = true;
    }
    if (viewFreeze.enabled) return;
    this.object.worldToLocal(this.cameraSource.getWorldPosition(this.camera));
    if (this.rescan || this.camera.distanceTo(this.lastScan) > SCAN_DISTANCE) this.scan();
    if (this.pending > 0) this.make();
    if (this.dirty) this.write();
  }

  /** Finds the cells within reach of the camera (nearest first) and drops those well out of it. */
  private scan(): void {
    this.lastScan.copy(this.camera);
    this.rescan = false;
    this.dirty = true;
    const R = this.plan.radius;
    const dist = this.camera.length();
    this.cameraDir.copy(this.camera).divideScalar(Math.max(dist, 1e-6));
    const height = dist - this.ground(this.cameraDir);
    const range = rockParams.range;
    this.wanted.length = 0;
    // Too high: nothing is near enough.
    if (height > range) {
      if (this.cells.size > 0) this.clear();
      this.pending = 0;
      return;
    }
    // Along the ground, as far as the range reaches from the camera's height (and a cell's width).
    const reach = Math.sqrt(Math.max(0, range * range - height * height)) / R + this.cellAngle;
    const keep = Math.cos(Math.min(Math.PI, reach * KEEP_EXTRA));
    const want = Math.cos(Math.min(Math.PI, reach));
    const c = this.centres;
    const { x, y, z } = this.cameraDir;
    for (let k = 0, key = 0; k < c.length; k += 3, key++) {
      const d = c[k]! * x + c[k + 1]! * y + c[k + 2]! * z;
      if (d >= want) {
        if (!this.cells.has(key)) this.wanted.push(key);
      } else if (d < keep && this.cells.has(key)) {
        this.cells.delete(key);
      }
    }
    // Nearest first.
    this.wanted.sort((a, b) => this.dot(b) - this.dot(a));
    this.pending = this.wanted.length;
  }

  private dot(key: number): number {
    const k = key * 3;
    return this.centres[k]! * this.cameraDir.x + this.centres[k + 1]! * this.cameraDir.y + this.centres[k + 2]! * this.cameraDir.z;
  }

  /** Makes wanted cells, nearest first, until the frame's budget runs out. */
  private make(): void {
    const start = performance.now();
    const n = this.gridSize;
    let made = 0;
    while (this.pending > 0) {
      const key = this.wanted[this.wanted.length - this.pending]!;
      this.pending--;
      if (this.cells.has(key)) continue;
      const face = Math.floor(key / (n * n));
      const rest = key - face * n * n;
      const j = Math.floor(rest / n);
      const i = rest - j * n;
      this.cells.set(key, { key, rocks: generateRockCell(this.plan, this.ground, face, i, j) });
      made++;
      if (performance.now() - start > rockParams.budget) break;
    }
    if (made > 0) this.dirty = true;
  }

  /** Writes the rocks big enough to see from about here into their shapes' batches. */
  private write(): void {
    this.dirty = false;
    const counts = new Array<number>(ROCK_SHAPES).fill(0);
    const angle = rockParams.angle;
    const share = rockParams.share;
    const range = rockParams.range;
    const cam = this.camera;
    for (const cell of this.cells.values()) {
      for (let r = 0; r < cell.rocks.length; r++) {
        const rock = cell.rocks[r]!;
        // Thinned evenly by the share (the same rocks stay as it changes).
        if (share < 1 && ((r * 0.618034) % 1) >= share) continue;
        const px = rock.x * rock.radius - cam.x;
        const py = rock.y * rock.radius - cam.y;
        const pz = rock.z * rock.radius - cam.z;
        // Seen from anywhere the camera can get to before the next scan.
        const far = Math.min(range, rock.size / angle) + SCAN_DISTANCE;
        if (px * px + py * py + pz * pz > far * far) continue;
        this.dir.set(rock.x, rock.y, rock.z);
        if (this.buried?.(this.dir)) continue;
        const batch = this.batches[rock.shape]!;
        const index = counts[rock.shape]!++;
        if (index >= batch.mesh.instanceMatrix.count) this.grow(batch, index + 1);
        this.place(rock);
        batch.mesh.setMatrixAt(index, this.matrix);
        this.color.setRGB(rock.r * rock.shade, rock.g * rock.shade, rock.b * rock.shade);
        batch.mesh.setColorAt(index, this.color);
      }
    }
    for (let s = 0; s < ROCK_SHAPES; s++) {
      const mesh = this.batches[s]!.mesh;
      mesh.count = counts[s]!;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.clearUpdateRanges();
        mesh.instanceColor.addUpdateRange(0, mesh.count * 3);
        mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  /** The rock's instance matrix into `matrix`: on the ground, up along the radius, turned and leaning. */
  private place(rock: RockData): void {
    this.up.set(rock.x, rock.y, rock.z);
    this.quaternion.setFromUnitVectors(this.Y, this.up);
    this.lean.setFromAxisAngle(this.Y, rock.yaw);
    this.quaternion.multiply(this.lean);
    this.axis.set(Math.cos(rock.leanAxis), 0, Math.sin(rock.leanAxis));
    this.lean.setFromAxisAngle(this.axis, rock.lean);
    this.quaternion.multiply(this.lean);
    this.position.copy(this.up).multiplyScalar(rock.radius);
    this.scale.set(rock.size, rock.size * rock.flat, rock.size * rock.wide);
    this.matrix.compose(this.position, this.quaternion, this.scale);
  }

  /** Makes a batch's mesh hold at least `need` instances. */
  private grow(batch: Batch, need: number): void {
    let capacity = batch.mesh.instanceMatrix.count;
    while (capacity < need) capacity *= 2;
    const old = batch.mesh;
    const mesh = this.createMesh(batch.geometry, capacity);
    (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    if (old.instanceColor && mesh.instanceColor) (mesh.instanceColor.array as Float32Array).set(old.instanceColor.array as Float32Array);
    this.object.remove(old);
    old.dispose();
    batch.mesh = mesh;
  }

  private clear(): void {
    this.cells.clear();
    this.lastScan.set(Infinity, 0, 0);
    this.rescan = true;
    for (const b of this.batches) {
      b.mesh.count = 0;
      b.mesh.visible = false;
    }
  }

  dispose(): void {
    this.scene.remove(this.object);
    for (const b of this.batches) b.mesh.dispose();
    for (const g of this.geometries) g.dispose();
    this.material.dispose();
  }
}

/**
 * The rocks' material: flat-shaded and rough, each instance's colour, and a
 * dithered fade as a rock shrinks below `uRockAngle` in the view (its size is
 * its instance's x scale). Rocks past it are dropped in the vertex shader.
 */
function createRockMaterial(uniforms: { uRockAngle: { value: number } }): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95, metalness: 0 });
  material.customProgramCacheKey = () => 'ground-rocks';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uDepthPass = groundDepthPass;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uRockAngle;\nvarying float vRockFade;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec3 rockCentre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float rockSize = length(instanceMatrix[0].xyz);
          float seen = rockSize / max(distance(cameraPosition, rockCentre) * uRockAngle, 1e-6);
          vRockFade = smoothstep(1.0, ${(1 / FADE_START).toFixed(4)}, seen);
          if (vRockFade <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRockFade;\nuniform bool uDepthPass;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (dither >= vRockFade) discard;
          if (uDepthPass) {
            gl_FragColor = vec4(0.0);
            return;
          }
        }`,
      );
  };
  return material;
}
