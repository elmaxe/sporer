import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { faceGridPoint, type FacePoint } from '../world/cubeSphereMath';
import type { SurfaceSampler } from '../world/planetGeometry';
import {
  CHUNK_CELLS,
  beyondHorizon,
  cellAngle,
  childAt,
  edgeNeighbour,
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
   * Deepest split. At 4 an Earth-sized globe's cells are ~0.6 units, a few
   * per wiggle of detailedTerrain's finest octave; deeper only smooths it.
   */
  maxDepth: 4,
  /** Milliseconds per frame spent building chunks (at least one is built). */
  budgetMs: 4,
  /** Stop splitting and merging (to look around at what was built). */
  freeze: false,
};

export function addLodDebug(debug: Debug): void {
  const f = debug.folder('Planet LOD');
  f?.add(lodParams, 'cellAngle', 0.01, 0.2, 0.005);
  f?.add(lodParams, 'maxDepth', 0, 7, 1);
  f?.add(lodParams, 'budgetMs', 0.5, 16, 0.5);
  f?.add(lodParams, 'freeze');
}

const SIDE = CHUNK_CELLS + 1;
const VERTICES = SIDE * SIDE;

interface LodNode {
  readonly face: number;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  /** Unit direction of the node's centre, and how far (radians) its corners reach from it. */
  readonly centre: THREE.Vector3;
  readonly angle: number;
  children: LodNode[] | null;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material> | null;
  /** Drawn as part of the surface (else covered by its children or its parent's mesh). */
  shown: boolean;
  /** Build order: how large its parent's cells look (larger first). */
  priority: number;
  /** Positions and colours as sampled, before the edges are snapped to coarser neighbours. */
  base: Float32Array | null;
  baseColors: Float32Array | null;
  /** Per edge, how many levels coarser the neighbour its vertices are snapped to is. */
  readonly snapped: Int8Array;
}

const byPriority = (a: LodNode, b: LodNode) => b.priority - a.priority;

/**
 * The low-orbit globe's surface as a quadtree of chunks per cube face (see
 * quadtree.ts): chunks split near the camera and merge far away, so the
 * facets look about the same size on screen everywhere, and those behind the
 * horizon stay coarse and aren't drawn. New chunks are built a few per frame
 * (lodParams.budgetMs), the parent staying on screen until all four children
 * are ready, so there are never holes. Where a chunk meets a coarser one, the
 * edge vertices between the coarser one's are moved onto them, so both sides
 * of the seam are the same segments and it can't crack (see snapTo).
 */
export class LodSurface {
  readonly object = new THREE.Group();
  private readonly roots: LodNode[] = [];
  private readonly queue: LodNode[] = [];
  private readonly camera = new THREE.Vector3();
  private cameraDistance = 0;
  private shownChanged = false;
  private _settled = false;
  private readonly dir = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly facePoint: FacePoint = { face: 0, s: 0, t: 0 };

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
      const root = this.createNode(face, 0, 0, 0);
      this.build(root);
      root.shown = true;
      root.mesh!.visible = true;
      this.roots.push(root);
    }
  }

  /** True when the chunks the camera wants are all built and shown. */
  get settled(): boolean {
    return this._settled;
  }

  /** Picks the chunks for a camera at `camera` (the globe's local space) and builds some of the missing ones. */
  update(camera: THREE.Vector3): void {
    if (lodParams.freeze) return;
    this.camera.copy(camera);
    this.cameraDistance = camera.length();
    this.queue.length = 0;
    for (const root of this.roots) this.select(root);
    if (this.shownChanged) {
      this.shownChanged = false;
      for (const root of this.roots) this.stitch(root);
    }
    this._settled = this.queue.length === 0;
    if (this._settled) return;
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
    const children = node.children;
    const split = children !== null && allBuilt(children);
    // The node's centre on the sea-level sphere, and a sphere around it holding the whole chunk.
    const c = node.centre;
    const distance = Math.hypot(this.camera.x - c.x * R, this.camera.y - c.y * R, this.camera.z - c.z * R);
    const bound = R * node.angle + Math.max(this.top - R, R - this.floor);
    const cells = cellAngle(R, node.depth, distance, bound);
    if (!hidden && node.depth < lodParams.maxDepth && wantsSplit(cells, lodParams.cellAngle, split)) {
      const kids = (node.children ??= [0, 1, 2, 3].map((i) =>
        this.createNode(node.face, node.depth + 1, node.x * 2 + (i & 1), node.y * 2 + (i >> 1)),
      ));
      if (allBuilt(kids)) {
        this.show(node, false, hidden);
        for (const k of kids) this.select(k);
        return;
      }
      for (const k of kids) {
        if (k.mesh !== null) continue;
        k.priority = cells;
        this.queue.push(k);
      }
    } else if (children) {
      for (const k of children) this.disposeNode(k);
      node.children = null;
    }
    this.show(node, true, hidden);
  }

  private show(node: LodNode, shown: boolean, hidden: boolean): void {
    if (node.shown !== shown) {
      node.shown = shown;
      this.shownChanged = true;
    }
    node.mesh!.visible = shown && !hidden;
  }

  private createNode(face: number, depth: number, x: number, y: number): LodNode {
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
      face,
      depth,
      x,
      y,
      centre,
      angle: Math.acos(minDot),
      children: null,
      mesh: null,
      shown: false,
      priority: 0,
      base: null,
      baseColors: null,
      snapped: new Int8Array(4),
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
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(chunkIndices(positions), 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeBoundingSphere();
    node.base = positions.slice();
    node.baseColors = colors.slice();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    node.mesh = mesh;
    this.object.add(mesh);
  }

  private disposeNode(node: LodNode): void {
    if (node.children) for (const k of node.children) this.disposeNode(k);
    node.children = null;
    if (node.shown) this.shownChanged = true;
    node.shown = false;
    if (node.mesh) {
      this.object.remove(node.mesh);
      node.mesh.geometry.dispose();
      node.mesh = null;
    }
  }

  /** Moves the edge vertices of every shown chunk that borders a coarser one onto that one's vertices. */
  private stitch(node: LodNode): void {
    if (!node.shown) {
      if (node.children) for (const k of node.children) this.stitch(k);
      return;
    }
    for (let edge = 0 as Edge; edge < 4; edge++) {
      edgeNeighbour(node.face, node.depth, node.x, node.y, edge, this.facePoint);
      const levels = Math.max(0, node.depth - this.shownAt(this.facePoint).depth);
      if (levels !== node.snapped[edge]) this.snapEdge(node, edge, levels);
    }
  }

  /** The shown node covering a face point. */
  private shownAt(p: FacePoint): LodNode {
    let node = this.roots[p.face]!;
    while (!node.shown && node.children) node = node.children[childAt(node.depth, node.x, node.y, p.s, p.t)]!;
    return node;
  }

  private snapEdge(node: LodNode, edge: Edge, levels: number): void {
    node.snapped[edge] = levels;
    const geometry = node.mesh!.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colour = geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = position.array as Float32Array;
    const colors = colour.array as Float32Array;
    const base = node.base!;
    const baseColors = node.baseColors!;
    const step = snapStep(levels);
    for (let e = 0; e <= CHUNK_CELLS; e++) {
      const v = edgeVertex(edge, e) * 3;
      const from = edgeVertex(edge, snapTo(e, step)) * 3;
      for (let k = 0; k < 3; k++) {
        positions[v + k] = base[from + k]!;
        colors[v + k] = baseColors[from + k]!;
      }
    }
    position.needsUpdate = true;
    colour.needsUpdate = true;
  }
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

/** Two triangles per grid cell, split along the shorter diagonal, wound outward (u × v points out). */
function chunkIndices(p: Float32Array): Uint16Array {
  const indices = new Uint16Array(CHUNK_CELLS * CHUNK_CELLS * 6);
  let k = 0;
  for (let j = 0; j < CHUNK_CELLS; j++) {
    for (let i = 0; i < CHUNK_CELLS; i++) {
      const a = j * SIDE + i;
      const b = a + 1;
      const c = a + SIDE + 1;
      const d = a + SIDE;
      if (distanceSq(p, a, c) <= distanceSq(p, b, d)) {
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
