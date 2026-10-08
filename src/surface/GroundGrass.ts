import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import {
  GRASS_B,
  GRASS_CELL_SIZE,
  GRASS_G,
  GRASS_R,
  GRASS_RADIUS,
  GRASS_STRIDE,
  GRASS_TALL,
  GRASS_WIDE,
  GRASS_X,
  GRASS_Y,
  GRASS_YAW,
  GRASS_Z,
  generateGrassCell,
  grassGridSize,
  type GrassGround,
  type GrassPlan,
} from '../gen/grass';
import { Rng } from '../gen/rng';
import { faceGridPoint } from '../world/cubeSphereMath';
import { viewFreeze } from '../world/viewFreeze';
import { plantParams } from './plantParams';

/** Tunables of the grass (debug folder Grass). */
export const grassParams = {
  /** Its own switch, for the debug panel; the menu's Plants switch turns it off too. */
  enabled: true,
  /** Nothing further than this (units): the grass loads only as the camera comes this close to the ground. */
  range: 55,
  /** Every tuft is drawn out to here (units); further out they thin, as the square of the distance, so each covers about as many pixels. */
  full: 26,
  /** Milliseconds a frame may spend making cells. */
  budget: 2,
  /** How far the wind bends the tips (share of a tuft's height), and how fast the gusts go by. */
  sway: 0.22,
  gusts: 1.6,
  /** How hard the ship's downwash flattens the grass under it (0 off), and how far it reaches round it (units). */
  downwash: 1,
  downwashReach: 7,
};

/** The fade at the range's edge starts this share of the way out. */
const FADE_START = 0.75;
/** The camera must move this far (units) before the tufts drawn are chosen again. */
const SCAN_DISTANCE = 3;
/** A cell stays loaded until it's this much further out than wanted (no flicker at the edge). */
const KEEP_EXTRA = 1.2;
/** Instances the batch starts with; it doubles when full. */
const FIRST_CAPACITY = 4096;
/** Blades in a tuft. */
const BLADES = 7;
/** The downwash is felt while the ship is lower than this over the ground (units), fully under the first. */
const DOWNWASH_HEIGHT = [3, 9] as const;

interface Cell {
  readonly key: number;
  readonly tufts: Float32Array;
}

/**
 * Grass on a green world's ground (gen/grass.ts), loaded as the camera
 * comes near the ground: the cells within reach are made a few per frame
 * within a time budget and far ones dropped, as the rocks are
 * (surface/GroundRocks.ts). One `InstancedMesh` of tufts; every few units the
 * camera moves the tufts within reach go into it, and in the shader they thin
 * out with the distance (a dither, so nothing pops), sway in the wind and
 * bend away under the ship's downwash. Static in the planet's body frame,
 * like the globe. Off with the menu's Plants switch.
 */
export class GroundGrass implements Entity {
  readonly object = new THREE.Group();
  private readonly cells = new Map<number, Cell>();
  private readonly centres: Float32Array;
  private readonly gridSize: number;
  /** A cell's tufts lie within this angle (radians) of its centre. */
  private readonly cellAngle: number;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly uniforms = {
    uGrassFar: { value: grassParams.range },
    uGrassFull: { value: grassParams.full },
    uGrassTime: { value: 0 },
    uGrassSway: { value: grassParams.sway },
    uGrassGusts: { value: grassParams.gusts },
    uGrassWind: { value: new THREE.Vector3(1, 0, 0) },
    uGrassShip: { value: new THREE.Vector3(0, 0, 0) },
    uGrassPush: { value: 0 },
    uGrassReach: { value: grassParams.downwashReach },
  };
  private mesh: THREE.InstancedMesh;
  private readonly camera = new THREE.Vector3();
  private readonly cameraDir = new THREE.Vector3();
  private readonly lastScan = new THREE.Vector3(Infinity, 0, 0);
  /** Cells wanted but not made yet, nearest first. */
  private readonly wanted: number[] = [];
  private pending = 0;
  private dirty = false;
  private rescan = true;
  private lastParams = '';
  private time = 0;
  private buried: ((dir: THREE.Vector3) => boolean) | null = null;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly turn = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly shipAt = new THREE.Vector3();
  private readonly Y = new THREE.Vector3(0, 1, 0);

  constructor(
    private readonly scene: THREE.Scene,
    readonly plan: GrassPlan,
    private readonly ground: GrassGround,
    private readonly cameraSource: THREE.Camera,
    /** The ship whose downwash flattens the grass under it, if any. */
    private readonly ship: THREE.Object3D | null,
    debug: Debug,
  ) {
    const n = (this.gridSize = grassGridSize(plan.radius));
    this.cellAngle = (GRASS_CELL_SIZE * 0.9) / plan.radius;
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
    // The planet's prevailing wind: a fixed direction in its frame, each tuft bending along the ground under it.
    const wind = new Rng(plan.seed).fork('wind');
    this.uniforms.uGrassWind.value.set(wind.range(-1, 1), wind.range(-1, 1), wind.range(-1, 1)).normalize();
    this.geometry = createTuftGeometry();
    this.material = createGrassMaterial(this.uniforms);
    this.mesh = this.createMesh(FIRST_CAPACITY);
    this.object.name = 'Grass';
    scene.add(this.object);

    const f = debug.folder('Grass');
    f?.add(grassParams, 'enabled');
    f?.add(grassParams, 'range', 10, 150, 1);
    f?.add(grassParams, 'full', 2, 60, 1);
    f?.add(grassParams, 'budget', 0.5, 10, 0.5);
    f?.add(grassParams, 'sway', 0, 1, 0.01);
    f?.add(grassParams, 'gusts', 0, 5, 0.05);
    f?.add(grassParams, 'downwash', 0, 2, 0.05);
    f?.add(grassParams, 'downwashReach', 1, 20, 0.5);
  }

  private createMesh(capacity: number): THREE.InstancedMesh {
    // Its own copy of the tuft, to carry the per-tuft keep numbers at this capacity.
    const geometry = this.geometry.clone();
    const keep = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    keep.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aGrassKeep', keep);
    const mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
    mesh.count = 0;
    mesh.visible = false;
    // Spread over the ground round the camera: culled per tuft by the scan instead.
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.name = 'Grass';
    this.object.add(mesh);
    return mesh;
  }

  /** Cells loaded, tufts in them and tufts drawn now (for the lab's readout and the smoke test). */
  stats(): { cells: number; tufts: number; drawn: number } {
    let tufts = 0;
    for (const cell of this.cells.values()) tufts += cell.tufts.length / GRASS_STRIDE;
    return { cells: this.cells.size, tufts, drawn: this.mesh.visible ? this.mesh.count : 0 };
  }

  /** True when no cell the camera wants is still to be made (for automation). */
  get settled(): boolean {
    return !this.rescan && !this.dirty && this.pending === 0;
  }

  /** Grass where `test` says something covers the ground (a volcano) is left out from now on; null shows it all again. */
  setBuried(test: ((dir: THREE.Vector3) => boolean) | null): void {
    this.buried = test;
    this.dirty = true;
  }

  update(frameDt: number): void {
    const enabled = grassParams.enabled && plantParams.enabled;
    this.object.visible = enabled;
    if (!enabled) {
      if (this.cells.size > 0) this.clear();
      return;
    }
    this.time += frameDt;
    const u = this.uniforms;
    u.uGrassTime.value = this.time;
    u.uGrassFar.value = grassParams.range;
    u.uGrassFull.value = grassParams.full;
    u.uGrassSway.value = grassParams.sway;
    u.uGrassGusts.value = grassParams.gusts;
    u.uGrassReach.value = grassParams.downwashReach;
    this.downwash();
    const params = `${grassParams.range}`;
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

  /** Where the ship is (this frame, in the body frame) and how hard its downwash pushes: the lower it flies, the harder. */
  private downwash(): void {
    const u = this.uniforms;
    if (!this.ship || !this.ship.visible || grassParams.downwash <= 0) {
      u.uGrassPush.value = 0;
      return;
    }
    const at = this.object.worldToLocal(this.ship.getWorldPosition(this.shipAt));
    const dist = at.length();
    const height = dist - this.ground(this.up.copy(at).divideScalar(Math.max(dist, 1e-6)));
    const t = Math.min(1, Math.max(0, (DOWNWASH_HEIGHT[1] - height) / (DOWNWASH_HEIGHT[1] - DOWNWASH_HEIGHT[0])));
    u.uGrassShip.value.copy(at);
    u.uGrassPush.value = grassParams.downwash * t * t * (3 - 2 * t);
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
    const range = grassParams.range;
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
      this.cells.set(key, { key, tufts: generateGrassCell(this.plan, this.ground, face, i, j) });
      made++;
      if (performance.now() - start > grassParams.budget) break;
    }
    if (made > 0) this.dirty = true;
  }

  /** Writes the tufts within reach of about here into the batch (the shader thins the far ones). */
  private write(): void {
    this.dirty = false;
    const cam = this.camera;
    const far = grassParams.range + SCAN_DISTANCE;
    const full = grassParams.full;
    let count = 0;
    for (const cell of this.cells.values()) {
      const t = cell.tufts;
      for (let o = 0; o < t.length; o += GRASS_STRIDE) {
        const r = t[o + GRASS_RADIUS]!;
        const px = t[o + GRASS_X]! * r - cam.x;
        const py = t[o + GRASS_Y]! * r - cam.y;
        const pz = t[o + GRASS_Z]! * r - cam.z;
        const d2 = px * px + py * py + pz * pz;
        if (d2 > far * far) continue;
        // Past `full` only the share the shader keeps at the nearest this tuft can be before the next scan.
        const near = Math.max(full, Math.sqrt(d2) - SCAN_DISTANCE);
        const keep = tuftKeep(cell.key, o / GRASS_STRIDE);
        if (keep > (full / near) ** 2) continue;
        this.up.set(t[o + GRASS_X]!, t[o + GRASS_Y]!, t[o + GRASS_Z]!);
        if (this.buried?.(this.up)) continue;
        if (count >= this.mesh.instanceMatrix.count) this.grow(count + 1);
        this.quaternion.setFromUnitVectors(this.Y, this.up);
        this.turn.setFromAxisAngle(this.Y, t[o + GRASS_YAW]!);
        this.quaternion.multiply(this.turn);
        this.position.copy(this.up).multiplyScalar(r);
        const wide = t[o + GRASS_WIDE]!;
        this.scale.set(wide, t[o + GRASS_TALL]!, wide);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.mesh.setMatrixAt(count, this.matrix);
        this.color.setRGB(t[o + GRASS_R]!, t[o + GRASS_G]!, t[o + GRASS_B]!);
        this.mesh.setColorAt(count, this.color);
        this.keep(this.mesh).setX(count, keep);
        count++;
      }
    }
    const mesh = this.mesh;
    mesh.count = count;
    mesh.visible = count > 0;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.clearUpdateRanges();
      mesh.instanceColor.addUpdateRange(0, count * 3);
      mesh.instanceColor.needsUpdate = true;
    }
    const keep = this.keep(mesh);
    keep.clearUpdateRanges();
    keep.addUpdateRange(0, count);
    keep.needsUpdate = true;
  }

  /** A batch's per-tuft keep numbers (`tuftKeep`), for the shader's thinning. */
  private keep(mesh: THREE.InstancedMesh): THREE.InstancedBufferAttribute {
    return mesh.geometry.getAttribute('aGrassKeep') as THREE.InstancedBufferAttribute;
  }

  /** Makes the batch hold at least `need` instances. */
  private grow(need: number): void {
    let capacity = this.mesh.instanceMatrix.count;
    while (capacity < need) capacity *= 2;
    const old = this.mesh;
    const mesh = this.createMesh(capacity);
    (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    if (old.instanceColor && mesh.instanceColor) (mesh.instanceColor.array as Float32Array).set(old.instanceColor.array as Float32Array);
    (this.keep(mesh).array as Float32Array).set(this.keep(old).array as Float32Array);
    this.object.remove(old);
    old.geometry.dispose();
    old.dispose();
    this.mesh = mesh;
  }

  private clear(): void {
    this.cells.clear();
    this.lastScan.set(Infinity, 0, 0);
    this.rescan = true;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.object);
    this.mesh.geometry.dispose();
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** 0 to 1, fixed per tuft (from its place in its cell's array): which tufts stay as they thin out with the distance. */
function tuftKeep(key: number, k: number): number {
  const v = Math.sin(key * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * One tuft: BLADES blades round its foot, each a tapering strip of two
 * segments curving outwards, 1 across (x, z from −0.5 to 0.5 at most) and 1
 * tall, its foot a little below the origin so it never floats where the
 * drawn ground is coarser than the sampled one. A vertex colour darkens the
 * blades towards their feet; the normals point up the tuft (the grass is lit
 * like the ground it covers, from whichever side it's seen).
 */
function createTuftGeometry(): THREE.BufferGeometry {
  const rng = new Rng(0x6a55);
  const positions: number[] = [];
  const colours: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  const SINK = 0.12;
  for (let b = 0; b < BLADES; b++) {
    const around = ((b + rng.range(-0.3, 0.3)) / BLADES) * Math.PI * 2;
    const foot = rng.range(0, 0.16);
    const fx = Math.cos(around) * foot;
    const fz = Math.sin(around) * foot;
    // Leaning outwards (and a little round), as a tuft's blades fan out.
    const lean = rng.range(0.12, 0.34);
    const swirl = around + rng.range(-0.5, 0.5);
    const lx = Math.cos(swirl) * lean;
    const lz = Math.sin(swirl) * lean;
    const tall = rng.range(0.6, 1);
    const width = rng.range(0.15, 0.22);
    // The blade's face turns across its lean.
    const sx = -Math.sin(swirl) * width;
    const sz = Math.cos(swirl) * width;
    const base = positions.length / 3;
    const rows: [number, number, number][] = [
      // [height share, outward share of the lean (it curves), width share]
      [0, 0, 1],
      [0.55, 0.3, 0.75],
    ];
    for (const [h, out, w] of rows) {
      const y = h * tall * (1 + SINK) - SINK;
      for (const side of [-1, 1]) {
        positions.push(fx + lx * out + side * sx * w, y, fz + lz * out + side * sz * w);
      }
    }
    positions.push(fx + lx, tall * (1 + SINK) - SINK, fz + lz);
    for (let v = base; v < positions.length / 3; v++) {
      const y = Math.max(0, positions[v * 3 + 1]!);
      const k = 0.5 + 0.42 * y;
      colours.push(k, k, k);
      // Up, tipped a little along the blade's lean, so the light varies a touch across the tuft.
      const nx = lx * 0.6;
      const nz = lz * 0.6;
      const l = Math.hypot(nx, 1, nz);
      normals.push(nx / l, 1 / l, nz / l);
    }
    index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The grass's material: each tuft's colour times its blades' darkening
 * towards the foot, double-sided but lit with the tuft's up-pointing normals
 * from both sides. In the vertex shader the tips bend in the wind (gusts
 * rolling over the ground along the planet's wind) and away from under the
 * ship's downwash; tufts thin out past `uGrassFull` as the square of the
 * distance and fade out towards `uGrassFar`, with a dither.
 */
function createGrassMaterial(uniforms: Record<string, THREE.IUniform>): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  material.customProgramCacheKey = () => 'ground-grass';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uGrassFar, uGrassFull, uGrassTime, uGrassSway, uGrassGusts, uGrassPush, uGrassReach;
        uniform vec3 uGrassWind, uGrassShip;
        attribute float aGrassKeep;
        varying float vGrassFade;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition;
        {
          vec3 centre = instanceMatrix[3].xyz;
          vec3 up = normalize(centre);
          float tall = length(instanceMatrix[1].xyz);
          float dist = distance(cameraPosition, (modelMatrix * vec4(centre, 1.0)).xyz);
          // Thinned past uGrassFull (the same tufts as the CPU keeps), the rest a little bigger to cover the ground as well.
          float share = min(1.0, pow(uGrassFull / max(dist, 1e-3), 2.0));
          vec3 p = (instanceMatrix * vec4(transformed * min(1.6, inversesqrt(share)), 1.0)).xyz;
          // How far up the blade (0 at the foot): the tip bends most.
          float h = clamp(position.y, 0.0, 1.0);
          float bend = h * h * tall;
          // Wind: along the ground, gusts rolling over it.
          vec3 wind = uGrassWind - up * dot(uGrassWind, up);
          float wl = length(wind);
          wind = wl > 1e-4 ? wind / wl : vec3(0.0);
          float along = dot(centre, wind);
          float gust = 0.55 + 0.45 * sin(uGrassTime * uGrassGusts - along * 0.35) * sin(uGrassTime * uGrassGusts * 0.37 - along * 0.11 + 1.3);
          float flutter = 0.25 * sin(uGrassTime * 5.3 + aGrassKeep * 40.0);
          vec3 offset = wind * uGrassSway * bend * (gust + flutter);
          // The ship's downwash: flattened out from under it.
          if (uGrassPush > 0.0) {
            vec3 away = centre - uGrassShip;
            away -= up * dot(away, up);
            float d = length(away);
            float push = uGrassPush * (1.0 - smoothstep(uGrassReach * 0.25, uGrassReach, d)) * (0.85 + 0.15 * sin(uGrassTime * 13.0 + d * 2.0));
            if (d > 1e-4) offset += away / d * push * bend * 0.9;
            offset -= up * push * bend * 0.45;
          }
          p += offset;
          mvPosition = viewMatrix * modelMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          vGrassFade = clamp((share - aGrassKeep) / max(0.15 * share, 1e-3), 0.0, 1.0);
          vGrassFade *= 1.0 - smoothstep(uGrassFar * ${FADE_START.toFixed(3)}, uGrassFar, dist);
          if (vGrassFade <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGrassFade;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (dither >= vGrassFade) discard;
        }`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        // Lit like the ground from either side: the back faces keep the up-pointing normal.
        normal = normalize(vNormal);`,
      );
  };
  return material;
}
