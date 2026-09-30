import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { GLOBE_SIZE_FACTOR } from '../gen/planets';
import { faceGridPoint, type FacePoint } from '../world/cubeSphereMath';
import type { SurfaceSampler } from '../world/planetGeometry';
import {
  CHUNK_CELLS,
  beyondHorizon,
  cellAngle,
  cellDiagonal,
  childAt,
  edgeNeighbour,
  parentTarget,
  snapStep,
  snapTo,
  wantsSplit,
  type Edge,
} from './quadtree';

/** Tunables of the globe's level of detail (debug panel: Planet LOD). */
export const lodParams = {
  /**
   * A chunk splits in four when its grid cells look wider than this
   * (radians): 0.05 is ~28 px at 720p, about the facets the fixed globe had
   * under the ship, so the look up close stays the same.
   */
  cellAngle: 0.05,
  /**
   * Deepest split. At the original scale (Earth radius 100) depth 4 gave an
   * Earth-sized globe ~0.6-unit cells, a few per wiggle of detailedTerrain's
   * finest octave (deeper only smooths it); one more level per doubling of
   * the globes keeps the cells that size next to the UFO.
   */
  maxDepth: 4 + Math.max(0, Math.round(Math.log2(GLOBE_SIZE_FACTOR))),
  /** Milliseconds per frame spent building chunks (at least one is built). */
  budgetMs: 4,
  /** Seconds a new chunk takes to blend from its parent's shape to its own (and back before a merge). */
  morphSeconds: 0.4,
  /** Stop splitting and merging (to look around at what was built). */
  freeze: false,
};

export function addLodDebug(debug: Debug): void {
  const f = debug.folder('Planet LOD');
  f?.add(lodParams, 'cellAngle', 0.01, 0.2, 0.005);
  f?.add(lodParams, 'maxDepth', 0, 9, 1);
  f?.add(lodParams, 'budgetMs', 0.5, 16, 0.5);
  f?.add(lodParams, 'morphSeconds', 0, 3, 0.05);
  f?.add(lodParams, 'freeze');
}

const SIDE = CHUNK_CELLS + 1;
const VERTICES = SIDE * SIDE;

interface LodNode {
  readonly parent: LodNode | null;
  readonly face: number;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  /** Unit direction of the node's centre, and how far (radians) its corners reach from it. */
  readonly centre: THREE.Vector3;
  readonly angle: number;
  children: LodNode[] | null;
  /** The children are drawn instead of this node. */
  split: boolean;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material> | null;
  /** Drawn as part of the surface (else covered by its children or its parent's mesh). */
  shown: boolean;
  /** How far it has blended from its parent's shape (0) to its own (1). */
  morph: number;
  /** Build order: how large its parent's cells look (larger first). */
  priority: number;
  /** Per grid cell, 1 if it's split along its a–c diagonal (see cellDiagonal). */
  diagonals: Uint8Array | null;
  /** Positions and colours as sampled, and the parent's surface at the same grid points (see parentTarget). */
  base: Float32Array | null;
  baseColors: Float32Array | null;
  target: Float32Array | null;
  targetColors: Float32Array | null;
  /** The shown node across each edge, and how many levels coarser it is (0 if the same or finer). */
  readonly neighbours: (LodNode | null)[];
  readonly coarser: Int8Array;
  /** What the mesh was last written with (own morph, then each edge's), to skip unchanged chunks. */
  readonly written: Float32Array;
}

const byPriority = (a: LodNode, b: LodNode) => b.priority - a.priority;

/**
 * The low-orbit globe's surface as a quadtree of chunks per cube face (see
 * quadtree.ts): chunks split near the camera and merge far away, so the
 * facets look about the same size on screen everywhere, and those behind the
 * horizon stay coarse and aren't drawn. New chunks are built a few per frame
 * (lodParams.budgetMs), the parent staying on screen until all four children
 * are ready, so there are never holes.
 *
 * Geomorphing: a new chunk starts in its parent's shape and blends into its
 * own over lodParams.morphSeconds, and before a merge the children blend back
 * into the parent's shape, so nothing pops. A chunk only splits once it has
 * finished blending in.
 *
 * Seams: where a chunk meets a coarser one, the edge vertices between the
 * coarser one's collapse onto them, taking their current (blended) positions,
 * so both sides of the seam are the same segments (see snapTo). Two chunks
 * of the same level blend their shared edge at the slower one's pace.
 */
export class LodSurface {
  readonly object = new THREE.Group();
  private readonly roots: LodNode[] = [];
  private readonly queue: LodNode[] = [];
  private readonly camera = new THREE.Vector3();
  private cameraDistance = 0;
  private morphStep = 0;
  private shownChanged = false;
  private busy = false;
  private _settled = false;
  private readonly dir = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly facePoint: FacePoint = { face: 0, s: 0, t: 0 };
  private readonly edgeMorph = new Float32Array(4);

  constructor(
    /** Sea-level radius, and the lowest and highest the surface goes. */
    private readonly radius: number,
    private readonly floor: number,
    private readonly top: number,
    private readonly sample: SurfaceSampler,
    private readonly material: THREE.Material,
  ) {
    this.object.name = 'Surface';
    for (let face = 0; face < 6; face++) {
      const root = this.createNode(null, face, 0, 0, 0);
      this.build(root);
      root.morph = 1;
      root.shown = true;
      root.mesh!.visible = true;
      this.roots.push(root);
    }
    this.shownChanged = true;
  }

  /** True when the chunks the camera wants are all built, shown and done blending. */
  get settled(): boolean {
    return this._settled;
  }

  /** Chunks drawn now, and the shallowest and deepest of them (for the lab's readout). */
  stats(): { chunks: number; minDepth: number; maxDepth: number } {
    const s = { chunks: 0, minDepth: Infinity, maxDepth: 0 };
    const walk = (node: LodNode) => {
      if (node.shown && node.mesh!.visible) {
        s.chunks++;
        s.minDepth = Math.min(s.minDepth, node.depth);
        s.maxDepth = Math.max(s.maxDepth, node.depth);
      }
      if (node.children) for (const k of node.children) walk(k);
    };
    for (const root of this.roots) walk(root);
    return s;
  }

  /**
   * Picks the chunks for a camera at `camera` (the globe's local space),
   * advances their blending by `dt` seconds and builds some of the missing ones.
   */
  update(camera: THREE.Vector3, dt: number): void {
    if (lodParams.freeze) return;
    this.camera.copy(camera);
    this.cameraDistance = camera.length();
    this.morphStep = lodParams.morphSeconds > 0 ? dt / lodParams.morphSeconds : 1;
    this.queue.length = 0;
    this.busy = false;
    for (const root of this.roots) this.select(root);
    if (this.shownChanged) {
      this.shownChanged = false;
      for (const root of this.roots) this.findNeighbours(root);
    }
    for (const root of this.roots) this.write(root);
    this._settled = this.queue.length === 0 && !this.busy;
    if (this.queue.length === 0) return;
    this.queue.sort(byPriority);
    const start = performance.now();
    for (const node of this.queue) {
      this.build(node);
      if (performance.now() - start > lodParams.budgetMs) break;
    }
  }

  dispose(): void {
    for (const root of this.roots) this.disposeNode(root);
    this.material.dispose();
  }

  private select(node: LodNode): void {
    const R = this.radius;
    const angle = this.camera.angleTo(node.centre);
    const hidden = beyondHorizon(angle, node.angle, this.cameraDistance, this.floor, this.top);
    // The node's centre on the sea-level sphere, and a sphere around it holding the whole chunk.
    const c = node.centre;
    const distance = Math.hypot(this.camera.x - c.x * R, this.camera.y - c.y * R, this.camera.z - c.z * R);
    const bound = R * node.angle + Math.max(this.top - R, R - this.floor);
    const cells = cellAngle(R, node.depth, distance, bound);
    const wants = !hidden && node.depth < lodParams.maxDepth && wantsSplit(cells, lodParams.cellAngle, node.split);

    if (node.split) {
      const kids = node.children!;
      if (wants) {
        for (const k of kids) this.select(k);
      } else if (this.flatten(kids)) {
        // The children have blended back into this node's shape: swap them for it.
        for (const k of kids) this.disposeNode(k);
        node.children = null;
        node.split = false;
        this.show(node, true, hidden);
      }
      return;
    }

    if (wants && node.morph >= 1) {
      const kids = (node.children ??= [0, 1, 2, 3].map((i) =>
        this.createNode(node, node.face, node.depth + 1, node.x * 2 + (i & 1), node.y * 2 + (i >> 1)),
      ));
      if (allBuilt(kids)) {
        node.split = true;
        this.show(node, false, hidden);
        for (const k of kids) {
          k.morph = 0;
          this.select(k);
        }
        return;
      }
      for (const k of kids) {
        if (k.mesh !== null) continue;
        k.priority = cells;
        this.queue.push(k);
      }
    } else if (!wants && node.children) {
      // Built for a split that isn't wanted any more.
      for (const k of node.children) this.disposeNode(k);
      node.children = null;
    }
    this.show(node, true, hidden);
    if (node.morph < 1) {
      node.morph = Math.min(1, node.morph + this.morphStep);
      this.busy = true;
    }
  }

  /**
   * Blends the shown nodes under `nodes` back towards their parents' shape
   * (merging split ones on the way). True once they're all flat.
   */
  private flatten(nodes: readonly LodNode[]): boolean {
    let flat = true;
    for (const node of nodes) {
      if (node.split) {
        if (this.flatten(node.children!)) {
          for (const k of node.children!) this.disposeNode(k);
          node.children = null;
          node.split = false;
          this.show(node, true, false);
        }
        flat = false;
        continue;
      }
      if (node.morph > 0) {
        node.morph = Math.max(0, node.morph - this.morphStep);
        this.busy = true;
      }
      if (node.morph > 0) flat = false;
    }
    return flat;
  }

  private show(node: LodNode, shown: boolean, hidden: boolean): void {
    if (node.shown !== shown) {
      node.shown = shown;
      this.shownChanged = true;
    }
    node.mesh!.visible = shown && !hidden;
  }

  private createNode(parent: LodNode | null, face: number, depth: number, x: number, y: number): LodNode {
    const n = 2 ** (depth + 1);
    const centre = new THREE.Vector3();
    faceGridPoint(face, 2 * x + 1, 2 * y + 1, n, centre);
    // Corners and edge midpoints: the farthest points from the centre.
    let minDot = 1;
    for (let j = 0; j <= 2; j++) {
      for (let i = 0; i <= 2; i++) {
        if (i === 1 && j === 1) continue;
        faceGridPoint(face, 2 * x + i, 2 * y + j, n, this.dir);
        minDot = Math.min(minDot, this.dir.dot(centre));
      }
    }
    return {
      parent,
      face,
      depth,
      x,
      y,
      centre,
      angle: Math.acos(minDot),
      children: null,
      split: false,
      mesh: null,
      shown: false,
      morph: 0,
      priority: 0,
      diagonals: null,
      base: null,
      baseColors: null,
      target: null,
      targetColors: null,
      neighbours: [null, null, null, null],
      coarser: new Int8Array(4),
      written: new Float32Array(5).fill(-1),
    };
  }

  /** Samples the node's grid and makes its (hidden) mesh. */
  private build(node: LodNode): void {
    const n = CHUNK_CELLS * 2 ** node.depth;
    const positions = new Float32Array(VERTICES * 3);
    const normals = new Float32Array(VERTICES * 3);
    const colors = new Float32Array(VERTICES * 3);
    const { dir, color } = this;
    for (let j = 0; j < SIDE; j++) {
      for (let i = 0; i < SIDE; i++) {
        const v = (j * SIDE + i) * 3;
        faceGridPoint(node.face, node.x * CHUNK_CELLS + i, node.y * CHUNK_CELLS + j, n, dir);
        const r = this.sample(dir, color);
        dir.toArray(normals, v);
        positions[v] = dir.x * r;
        positions[v + 1] = dir.y * r;
        positions[v + 2] = dir.z * r;
        color.toArray(colors, v);
      }
    }
    node.base = positions.slice();
    node.baseColors = colors.slice();
    // This chunk is one quarter of its parent: the parent's cells it covers start here.
    const parent = node.parent;
    const half = CHUNK_CELLS / 2;
    const px = (node.x & 1) * half;
    const py = (node.y & 1) * half;
    const parentAC = (i: number, j: number) => parent!.diagonals![(py + (j >> 1)) * CHUNK_CELLS + px + (i >> 1)] === 1;
    const diagonals = (node.diagonals = new Uint8Array(CHUNK_CELLS * CHUNK_CELLS));
    for (let j = 0; j < CHUNK_CELLS; j++) {
      for (let i = 0; i < CHUNK_CELLS; i++) {
        const a = j * SIDE + i;
        const shorter = distanceSq(positions, a, a + SIDE + 1) <= distanceSq(positions, a + 1, a + SIDE);
        diagonals[j * CHUNK_CELLS + i] = cellDiagonal(i, j, shorter, parent ? parentAC(i, j) : null) ? 1 : 0;
      }
    }
    if (parent) {
      node.target = new Float32Array(VERTICES * 3);
      node.targetColors = new Float32Array(VERTICES * 3);
      parentTarget(node.base, node.target, SIDE, parentAC);
      parentTarget(node.baseColors, node.targetColors, SIDE, parentAC);
    } else {
      node.target = node.base;
      node.targetColors = node.baseColors;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(chunkIndices(diagonals), 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    node.mesh = mesh;
    this.object.add(mesh);
  }

  private disposeNode(node: LodNode): void {
    if (node.children) for (const k of node.children) this.disposeNode(k);
    node.children = null;
    node.split = false;
    if (node.shown) this.shownChanged = true;
    node.shown = false;
    if (node.mesh) {
      this.object.remove(node.mesh);
      node.mesh.geometry.dispose();
      node.mesh = null;
    }
  }

  /** Finds each shown chunk's neighbours across its edges. */
  private findNeighbours(node: LodNode): void {
    if (!node.shown) {
      if (node.children) for (const k of node.children) this.findNeighbours(k);
      return;
    }
    for (let edge = 0 as Edge; edge < 4; edge++) {
      edgeNeighbour(node.face, node.depth, node.x, node.y, edge, this.facePoint);
      const other = this.shownAt(this.facePoint);
      node.neighbours[edge] = other;
      node.coarser[edge] = Math.max(0, node.depth - other.depth);
    }
  }

  /** The shown node covering a face point. */
  private shownAt(p: FacePoint): LodNode {
    let node = this.roots[p.face]!;
    while (!node.shown && node.children) node = node.children[childAt(node.depth, node.x, node.y, p.s, p.t)]!;
    return node;
  }

  /**
   * Writes every shown chunk's vertices whose blend changed: its own morph
   * inside, and along each edge the morph both sides agree on (see edgeMorph).
   */
  private write(node: LodNode): void {
    if (!node.shown) {
      if (node.children) for (const k of node.children) this.write(k);
      return;
    }
    const m = this.edgeMorph;
    let changed = node.written[0] !== node.morph;
    for (let edge = 0 as Edge; edge < 4; edge++) {
      const other = node.neighbours[edge]!;
      // Coarser: follow it. Same level: the slower of the two. Finer: it follows this one.
      m[edge] = node.coarser[edge]! > 0 ? other.morph : other.depth === node.depth ? Math.min(node.morph, other.morph) : node.morph;
      // The coarser count goes in the sign, so a change of neighbour level rewrites too.
      const key = m[edge]! + node.coarser[edge]! * 2;
      if (node.written[edge + 1] !== key) changed = true;
      node.written[edge + 1] = key;
    }
    node.written[0] = node.morph;
    if (!changed) return;

    const geometry = node.mesh!.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colour = geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = position.array as Float32Array;
    const colors = colour.array as Float32Array;
    const base = node.base!;
    const baseColors = node.baseColors!;
    const target = node.target!;
    const targetColors = node.targetColors!;
    const t = node.morph;
    for (let v = 0; v < VERTICES * 3; v++) {
      positions[v] = blend(target[v]!, base[v]!, t);
      colors[v] = blend(targetColors[v]!, baseColors[v]!, t);
    }
    for (let edge = 0 as Edge; edge < 4; edge++) {
      const levels = node.coarser[edge]!;
      const te = m[edge]!;
      if (levels === 0) {
        for (let e = 0; e <= CHUNK_CELLS; e++) {
          const v = edgeVertex(edge, e) * 3;
          for (let k = 0; k < 3; k++) {
            positions[v + k] = blend(target[v + k]!, base[v + k]!, te);
            colors[v + k] = blend(targetColors[v + k]!, baseColors[v + k]!, te);
          }
        }
        continue;
      }
      // Onto the coarser neighbour's vertices, where it has them now: its own
      // sampled point blended from its parent's edge, which runs through this
      // edge's vertices a step either side (the same bits it has).
      const step = snapStep(levels);
      const along = (edge < 2 ? node.y : node.x) * CHUNK_CELLS;
      for (let e = 0; e <= CHUNK_CELLS; e++) {
        const v = edgeVertex(edge, e) * 3;
        const to = snapTo(e, step);
        const p = edgeVertex(edge, to) * 3;
        const odd = ((along + to) / step) % 2 === 1 && to - step >= 0 && to + step <= CHUNK_CELLS;
        const a = odd ? edgeVertex(edge, to - step) * 3 : p;
        const b = odd ? edgeVertex(edge, to + step) * 3 : p;
        for (let k = 0; k < 3; k++) {
          positions[v + k] = blend(Math.fround(midpoint(base[a + k]!, base[b + k]!)), base[p + k]!, te);
          colors[v + k] = blend(Math.fround(midpoint(baseColors[a + k]!, baseColors[b + k]!)), baseColors[p + k]!, te);
        }
      }
    }
    position.needsUpdate = true;
    colour.needsUpdate = true;
  }
}

/** From the parent's shape `from` to the own `to` by `t`; exact at both ends, and the same bits for the same inputs on both sides of a seam. */
function blend(from: number, to: number, t: number): number {
  return t >= 1 ? to : t <= 0 ? from : from + (to - from) * t;
}

function midpoint(a: number, b: number): number {
  return (a + b) * 0.5;
}

function allBuilt(nodes: readonly LodNode[]): boolean {
  for (const node of nodes) if (node.mesh === null) return false;
  return true;
}

/** Index of the `e`-th vertex along a chunk's edge. */
function edgeVertex(edge: Edge, e: number): number {
  if (edge === 0) return e * SIDE;
  if (edge === 1) return e * SIDE + CHUNK_CELLS;
  if (edge === 2) return e;
  return CHUNK_CELLS * SIDE + e;
}

/** Two triangles per grid cell, split along the diagonal `diagonals` says (1: a–c), wound outward (u × v points out). */
function chunkIndices(diagonals: Uint8Array): Uint16Array {
  const indices = new Uint16Array(CHUNK_CELLS * CHUNK_CELLS * 6);
  let k = 0;
  for (let j = 0; j < CHUNK_CELLS; j++) {
    for (let i = 0; i < CHUNK_CELLS; i++) {
      const a = j * SIDE + i;
      const b = a + 1;
      const c = a + SIDE + 1;
      const d = a + SIDE;
      if (diagonals[j * CHUNK_CELLS + i] === 1) {
        indices[k++] = a;
        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = a;
        indices[k++] = c;
        indices[k++] = d;
      } else {
        indices[k++] = a;
        indices[k++] = b;
        indices[k++] = d;
        indices[k++] = b;
        indices[k++] = c;
        indices[k++] = d;
      }
    }
  }
  return indices;
}

function distanceSq(p: Float32Array, a: number, b: number): number {
  const dx = p[a * 3]! - p[b * 3]!;
  const dy = p[a * 3 + 1]! - p[b * 3 + 1]!;
  const dz = p[a * 3 + 2]! - p[b * 3 + 2]!;
  return dx * dx + dy * dy + dz * dz;
}
