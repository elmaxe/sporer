import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { GLOBE_SIZE_FACTOR } from '../gen/planets';
import { craterParams } from '../gen/craters';
import { cubeFacePoint, faceCubePoint, faceGridPoint, type FacePoint, type Vec3Like } from '../world/cubeSphereMath';
import { GROUND_LAYER } from '../world/groundDepth';
import type { SurfaceSampler } from '../world/planetGeometry';
import { viewFreeze } from '../world/viewFreeze';
import {
  CHUNK_CELLS,
  beyondHorizon,
  cellAngle,
  cellDiagonal,
  chordError,
  chunkBounds,
  childAt,
  edgeNeighbour,
  parentTarget,
  snapStep,
  snapTo,
  wantsSplit,
  type ChunkBounds,
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
   * Smooth surfaces split instead when their flat cells look this far inside
   * the sphere (radians, see chordError). A giant's cloud tops only show it in
   * their outline: 0.0018 is ~1 px at 720p, by the same measure as cellAngle.
   */
  outlineError: 0.0018,
  /**
   * The sea shows it at every coast too, where the sea floor rises through
   * it: a sag of 1 px moved the coastlines by about that much, a quarter
   * pixel matched the fixed 46-segment sphere the sea used to be.
   */
  coastError: 0.00045,
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
  /** Stop splitting and merging (to look around at what was built; the menu's Freeze does this too, see world/viewFreeze.ts). */
  freeze: false,
};

/** The craters' tunables (gen/craters.ts), next to the LOD's: they take effect on the next globe built. */
export function addCraterDebug(debug: Debug): void {
  const f = debug.folder('Craters');
  f?.add(craterParams, 'largest', 0.02, 0.2, 0.005);
  f?.add(craterParams, 'coarseOctaves', 0, 4, 1);
  f?.add(craterParams, 'smallest', 0.5, 10, 0.1);
  f?.add(craterParams, 'maxOctaves', 1, 8, 1);
  f?.add(craterParams, 'hills', 0, 1, 0.01);
}

export function addLodDebug(debug: Debug): void {
  const f = debug.folder('Planet LOD');
  f?.add(lodParams, 'cellAngle', 0.01, 0.2, 0.005);
  f?.add(lodParams, 'outlineError', 0.0001, 0.01, 0.0001);
  f?.add(lodParams, 'coastError', 0.0001, 0.01, 0.0001);
  f?.add(lodParams, 'maxDepth', 0, 9, 1);
  f?.add(lodParams, 'budgetMs', 0.5, 16, 0.5);
  f?.add(lodParams, 'morphSeconds', 0, 3, 0.05);
  f?.add(lodParams, 'freeze');
}

const SIDE = CHUNK_CELLS + 1;
const VERTICES = SIDE * SIDE;
/** A chunk's grid with a ring of points one cell outside it. */
const RING_SIDE = SIDE + 2;

interface LodNode {
  readonly parent: LodNode | null;
  readonly face: number;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  /** Unit direction of the node's centre, and how far (radians) its corners reach from it. */
  readonly centre: THREE.Vector3;
  readonly angle: number;
  /** Where its vertices are, once built (see chunkBounds). */
  readonly bounds: ChunkBounds;
  /** Wholly below LodSurfaceOptions.hiddenBelow, so never drawn. */
  submerged: boolean;
  /** Its water is shallower than LodSurfaceOptions.shallow somewhere: it splits like the terrain. */
  shallow: boolean;
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
  /** Unit directions of its grid points (the same bits on every grid and face: see sharedVertex). */
  dirs: Float32Array | null;
  /** Terrain only (smooth surfaces' normals point straight out): normals as sampled, and the parent's at the same grid points. */
  baseNormals: Float32Array | null;
  targetNormals: Float32Array | null;
  /** The shown node across each edge, and how many levels coarser it is (0 if the same or finer). */
  readonly neighbours: (LodNode | null)[];
  readonly coarser: Int8Array;
  /**
   * Per edge with a coarser neighbour: for each point along the edge, the
   * neighbour's vertex at the same place (found once per neighbour), whose
   * position the edge's vertices snap onto.
   */
  readonly snap: (Int32Array | null)[];
  /**
   * Per corner (0: s and t at their least, 1: s at its most, 2: t at its
   * most, 3: both), the coarsest shown chunks touching it (`group`, all one
   * level) and the vertex there of one of them (`holder`, `at`); null where
   * it has none (see write).
   */
  readonly corners: ({ group: LodNode[]; holder: LodNode; at: number } | null)[];
  /** What the mesh was last written with (own morph, then each edge's), to skip unchanged chunks. */
  readonly written: Float32Array;
}

const byPriority = (a: LodNode, b: LodNode) => b.priority - a.priority;

/** How a surface differs from the terrain's (the defaults). */
export interface LodSurfaceOptions {
  /**
   * A smooth sphere: no facets to keep the size of, so chunks split by how
   * far their cells sag inside the sphere rather than by their size, up to
   * lodParams.outlineError (a giant's cloud tops: only the outline shows it)
   * or coastError (the sea: its coasts show it too). Up close that's far
   * coarser than the terrain.
   */
  smooth?: 'outline' | 'coast' | null;
  /** The chunks' render order (the sea draws first, see SEA_RENDER_ORDER). */
  renderOrder?: number;
  /**
   * Chunks lying wholly below this radius aren't drawn: the sea floor under
   * an opaque sea. They still split and merge as usual, so an islet too small
   * for a coarse chunk to catch comes up when its finer chunks are built.
   */
  hiddenBelow?: number;
  /**
   * The sea: chunks whose water (the depth its sampler writes in the colour's
   * red) is shallower than this anywhere split like the terrain, by
   * lodParams.cellAngle, rather than by their sag: the shallows' look and
   * the shore swells follow the seabed's depth, so their triangles must be as
   * fine as the ground's or the swells' crests kink at every edge.
   */
  shallow?: number;
  name?: string;
}

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
  private readonly cube: Vec3Like = { x: 0, y: 0, z: 0 };
  /** A chunk's points and the ring around it, while it's built (see build). */
  private readonly ring = new Float32Array(RING_SIDE * RING_SIDE * 3);
  private readonly edgeMorph = new Float32Array(4);
  private readonly cornerMorph = new Float32Array(4);
  private readonly smooth: 'outlineError' | 'coastError' | null;
  private readonly renderOrder: number;
  private hiddenBelow: number;
  private readonly shallow: number;

  constructor(
    /** The lowest and highest the surface goes (for the horizon). */
    private readonly floor: number,
    private readonly top: number,
    private readonly sample: SurfaceSampler,
    readonly material: THREE.Material,
    { smooth = null, renderOrder = 0, hiddenBelow = -Infinity, shallow = -Infinity, name = 'Surface' }: LodSurfaceOptions = {},
  ) {
    this.smooth = smooth && `${smooth}Error`;
    this.renderOrder = renderOrder;
    this.hiddenBelow = hiddenBelow;
    this.shallow = shallow;
    this.object.name = name;
    for (let face = 0; face < 6; face++) {
      const root = this.createNode(null, face, 0, 0, 0);
      this.build(root);
      root.morph = 1;
      root.shown = true;
      root.mesh!.visible = !root.submerged;
      this.roots.push(root);
    }
    this.shownChanged = true;
  }

  /**
   * Chunks wholly below `radius` aren't drawn from now on (a sea that rose or
   * fell: terraforming); every built chunk is checked again, and the next
   * update shows or hides them.
   */
  setHiddenBelow(radius: number): void {
    if (radius === this.hiddenBelow) return;
    this.hiddenBelow = radius;
    const walk = (node: LodNode) => {
      node.submerged = node.bounds.top < radius;
      if (node.children) for (const k of node.children) walk(k);
    };
    for (const root of this.roots) walk(root);
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
    if (lodParams.freeze || viewFreeze.enabled) return;
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
    const angle = this.camera.angleTo(node.centre);
    const hidden = beyondHorizon(angle, node.angle, this.cameraDistance, this.floor, this.top);
    // Selected nodes are built, so their bounds are known.
    const b = node.bounds;
    const distance = Math.hypot(this.camera.x - b.x, this.camera.y - b.y, this.camera.z - b.z);
    const cells = cellAngle(b.reach, node.depth, distance, b.radius);
    const looks = this.smooth && !node.shallow
      ? wantsSplit(chordError(cells, node.depth), lodParams[this.smooth], node.split)
      : wantsSplit(cells, lodParams.cellAngle, node.split);
    const wants = !hidden && node.depth < lodParams.maxDepth && looks;

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
    node.mesh!.visible = shown && !hidden && !node.submerged;
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
      bounds: { x: 0, y: 0, z: 0, radius: 0, reach: 0, top: 0 },
      submerged: false,
      shallow: false,
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
      dirs: null,
      baseNormals: null,
      targetNormals: null,
      neighbours: [null, null, null, null],
      coarser: new Int8Array(4),
      snap: [null, null, null, null],
      corners: [null, null, null, null],
      written: new Float32Array(9).fill(-1),
    };
  }

  /** Samples the node's grid and makes its (hidden) mesh. */
  private build(node: LodNode): void {
    const n = CHUNK_CELLS * 2 ** node.depth;
    // How far apart its samples are (radians, about): the sampler leaves out detail too small for them to catch.
    const spacing = Math.PI / 2 / n;
    const positions = new Float32Array(VERTICES * 3);
    const normals = new Float32Array(VERTICES * 3);
    const colors = new Float32Array(VERTICES * 3);
    const { dir, color, ring } = this;
    // Terrain samples a ring of points one cell outside the chunk too (the neighbours' own), for the normals.
    const from = this.smooth ? 0 : -1;
    for (let j = from; j < SIDE - from; j++) {
      for (let i = from; i < SIDE - from; i++) {
        const inside = i >= 0 && j >= 0 && i < SIDE && j < SIDE;
        // The ring's corners aren't needed (and past a cube corner have no grid point to land on).
        if (!inside && (i < 0 || i >= SIDE) && (j < 0 || j >= SIDE)) continue;
        faceGridPoint(node.face, node.x * CHUNK_CELLS + i, node.y * CHUNK_CELLS + j, n, dir);
        const r = this.sample(dir, color, spacing);
        const e = ((j + 1) * RING_SIDE + i + 1) * 3;
        ring[e] = dir.x * r;
        ring[e + 1] = dir.y * r;
        ring[e + 2] = dir.z * r;
        if (!inside) continue;
        const v = (j * SIDE + i) * 3;
        dir.toArray(normals, v);
        positions[v] = ring[e]!;
        positions[v + 1] = ring[e + 1]!;
        positions[v + 2] = ring[e + 2]!;
        color.toArray(colors, v);
      }
    }
    node.dirs = normals.slice();
    if (!this.smooth) ringNormals(ring, normals);
    node.base = positions.slice();
    node.baseColors = colors.slice();
    node.baseNormals = this.smooth ? null : normals.slice();
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
      // The parent's own samples at the points it shares (its finer-detail
      // child may sample them differently), so blended back it's the parent's surface exactly.
      node.target = new Float32Array(VERTICES * 3);
      node.targetColors = new Float32Array(VERTICES * 3);
      parentTarget(parentPoints(node.base, parent.base!, px, py), node.target, SIDE, parentAC);
      parentTarget(parentPoints(node.baseColors, parent.baseColors!, px, py), node.targetColors, SIDE, parentAC);
      if (node.baseNormals) {
        node.targetNormals = new Float32Array(VERTICES * 3);
        parentTarget(parentPoints(node.baseNormals, parent.baseNormals!, px, py), node.targetNormals, SIDE, parentAC);
      }
    } else {
      node.target = node.base;
      node.targetColors = node.baseColors;
      node.targetNormals = node.baseNormals;
    }
    chunkBounds([node.base, node.target], node.bounds);
    // Blending and the seams only ever move a vertex between these, so it stays under too.
    node.submerged = node.bounds.top < this.hiddenBelow;
    node.shallow = false;
    for (let v = 0; v < colors.length && !node.shallow; v += 3) node.shallow = colors[v]! < this.shallow;
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(chunkIndices(diagonals), 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Where each vertex is on the cube sphere, as the tests (and a debugger) can find it.
    geometry.userData.directions = node.dirs;
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = this.renderOrder;
    mesh.layers.enable(GROUND_LAYER);
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
      if (node.neighbours[edge] !== other) node.snap[edge] = null;
      node.neighbours[edge] = other;
      node.coarser[edge] = Math.max(0, node.depth - other.depth);
    }
    for (let corner = 0; corner < 4; corner++) node.corners[corner] = this.cornerOf(node, corner);
    // The chunks round it may have changed: write it all again.
    node.written.fill(-1);
  }

  /**
   * The coarsest shown chunks touching `node`'s `corner` (it among them, if
   * none is coarser), from points just off the corner all round it (on
   * whichever face they land), and one of their vertices there.
   */
  private cornerOf(node: LodNode, corner: number): LodNode['corners'][number] {
    const size = 1 / 2 ** node.depth;
    const s = (node.x + (corner & 1)) * size;
    const t = (node.y + (corner >> 1)) * size;
    const step = size * 1e-3;
    let group: LodNode[] = [node];
    for (let k = 0; k < 4; k++) {
      faceCubePoint(node.face, s + (k & 1 ? step : -step), t + (k & 2 ? step : -step), this.cube);
      const other = this.shownAt(cubeFacePoint(this.cube.x, this.cube.y, this.cube.z, this.facePoint));
      if (other.depth < group[0]!.depth) group = [other];
      else if (other.depth === group[0]!.depth && !group.includes(other)) group.push(other);
    }
    const own = cornerVertex(corner);
    if (group.length === 1 && group[0] === node) return null;
    const holder = group[0]!;
    const at = holder === node ? own : sharedVertex(node, own, holder);
    return at < 0 ? null : { group, holder, at };
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
    for (let corner = 0; corner < 4; corner++) {
      const c = node.corners[corner];
      if (!c) continue;
      let slowest = 1;
      for (const g of c.group) slowest = Math.min(slowest, g.morph);
      this.cornerMorph[corner] = slowest;
      if (node.written[5 + corner] !== Math.fround(slowest)) changed = true;
      node.written[5 + corner] = slowest;
    }
    if (!changed) return;

    const geometry = node.mesh!.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colour = geometry.getAttribute('color') as THREE.BufferAttribute;
    const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
    const positions = position.array as Float32Array;
    const colors = colour.array as Float32Array;
    const normals = normal.array as Float32Array;
    const base = node.base!;
    const baseColors = node.baseColors!;
    const target = node.target!;
    const targetColors = node.targetColors!;
    // Smooth surfaces' normals point straight out whatever the blend.
    const baseNormals = node.baseNormals;
    const targetNormals = node.targetNormals!;
    const t = node.morph;
    for (let v = 0; v < VERTICES * 3; v++) {
      positions[v] = blend(target[v]!, base[v]!, t);
      colors[v] = blend(targetColors[v]!, baseColors[v]!, t);
    }
    if (baseNormals) for (let v = 0; v < VERTICES * 3; v++) normals[v] = blend(targetNormals[v]!, baseNormals[v]!, t);
    for (let edge = 0 as Edge; edge < 4; edge++) {
      const levels = node.coarser[edge]!;
      const te = m[edge]!;
      if (levels === 0) {
        for (let e = 0; e <= CHUNK_CELLS; e++) {
          const v = edgeVertex(edge, e) * 3;
          for (let k = 0; k < 3; k++) {
            positions[v + k] = blend(target[v + k]!, base[v + k]!, te);
            colors[v + k] = blend(targetColors[v + k]!, baseColors[v + k]!, te);
            if (baseNormals) normals[v + k] = blend(targetNormals[v + k]!, baseNormals[v + k]!, te);
          }
        }
        continue;
      }
      // Onto the coarser neighbour's vertices, where it has them now: the
      // same blend of its parent's surface and its own samples that it
      // writes there (the same bits). Its samples, not this chunk's at the
      // same points: a finer chunk's sampler may add detail there.
      // (Many levels coarser, its vertices may be further apart than this
      // chunk: then the edge's ends lie between them, and take this chunk's
      // own blend of its parent's edge there.)
      const step = snapStep(levels);
      const other = node.neighbours[edge]!;
      const at = (node.snap[edge] ??= sharedVertices(node, edge, other));
      const along = (edge < 2 ? node.y : node.x) * CHUNK_CELLS;
      for (let e = 0; e <= CHUNK_CELLS; e++) {
        const v = edgeVertex(edge, e) * 3;
        const to = snapTo(e, step);
        const shared = at[to]!;
        if (shared >= 0) {
          const p = shared * 3;
          for (let k = 0; k < 3; k++) {
            positions[v + k] = blend(other.target![p + k]!, other.base![p + k]!, te);
            colors[v + k] = blend(other.targetColors![p + k]!, other.baseColors![p + k]!, te);
            if (baseNormals) normals[v + k] = blend(other.targetNormals![p + k]!, other.baseNormals![p + k]!, te);
          }
          continue;
        }
        const p = edgeVertex(edge, to) * 3;
        const odd = ((along + to) / step) % 2 === 1 && to - step >= 0 && to + step <= CHUNK_CELLS;
        const a = odd ? edgeVertex(edge, to - step) * 3 : p;
        const b = odd ? edgeVertex(edge, to + step) * 3 : p;
        for (let k = 0; k < 3; k++) {
          positions[v + k] = blend(Math.fround(midpoint(base[a + k]!, base[b + k]!)), base[p + k]!, te);
          colors[v + k] = blend(Math.fround(midpoint(baseColors[a + k]!, baseColors[b + k]!)), baseColors[p + k]!, te);
          if (baseNormals) normals[v + k] = blend(Math.fround(midpoint(baseNormals[a + k]!, baseNormals[b + k]!)), baseNormals[p + k]!, te);
        }
      }
    }
    // Each corner: what the coarsest chunks there write, at the slowest of their blends (a seam's rule, for every chunk round it).
    for (let corner = 0; corner < 4; corner++) {
      const c = node.corners[corner];
      if (!c) continue;
      const v = cornerVertex(corner) * 3;
      const p = c.at * 3;
      const h = c.holder;
      const tc = this.cornerMorph[corner]!;
      for (let k = 0; k < 3; k++) {
        positions[v + k] = blend(h.target![p + k]!, h.base![p + k]!, tc);
        colors[v + k] = blend(h.targetColors![p + k]!, h.baseColors![p + k]!, tc);
        if (baseNormals) normals[v + k] = blend(h.targetNormals![p + k]!, h.baseNormals![p + k]!, tc);
      }
    }
    // Edge vertices collapsed onto a corner go wherever it went.
    for (let edge = 0 as Edge; edge < 4; edge++) {
      const levels = node.coarser[edge]!;
      if (levels === 0) continue;
      const step = snapStep(levels);
      for (let e = 1; e < CHUNK_CELLS; e++) {
        const to = snapTo(e, step);
        if (to !== 0 && to !== CHUNK_CELLS) continue;
        const v = edgeVertex(edge, e) * 3;
        const c = edgeVertex(edge, to) * 3;
        for (let k = 0; k < 3; k++) {
          positions[v + k] = positions[c + k]!;
          colors[v + k] = colors[c + k]!;
          normals[v + k] = normals[c + k]!;
        }
      }
    }
    position.needsUpdate = true;
    colour.needsUpdate = true;
    if (baseNormals) normal.needsUpdate = true;
  }
}

/** From the parent's shape `from` to the own `to` by `t`; exact at both ends, and the same bits for the same inputs on both sides of a seam. */
function blend(from: number, to: number, t: number): number {
  return t >= 1 ? to : t <= 0 ? from : from + (to - from) * t;
}

function midpoint(a: number, b: number): number {
  return (a + b) * 0.5;
}

/**
 * Smooth normals for a chunk's grid from `ring` (its points and a ring one
 * cell outside, RING_SIDE wide): each across the points either side of it,
 * on the grid and across it. Neighbouring chunks of the same level work
 * them out from the same points, so they agree on their shared edges to the
 * bit, and a smooth surface has no seams.
 */
function ringNormals(ring: Float32Array, out: Float32Array): void {
  const at = (i: number, j: number) => ((j + 1) * RING_SIDE + i + 1) * 3;
  for (let j = 0; j < SIDE; j++) {
    for (let i = 0; i < SIDE; i++) {
      const l = at(i - 1, j);
      const r = at(i + 1, j);
      const d = at(i, j - 1);
      const u = at(i, j + 1);
      const ux = ring[r]! - ring[l]!;
      const uy = ring[r + 1]! - ring[l + 1]!;
      const uz = ring[r + 2]! - ring[l + 2]!;
      const vx = ring[u]! - ring[d]!;
      const vy = ring[u + 1]! - ring[d + 1]!;
      const vz = ring[u + 2]! - ring[d + 2]!;
      // u × v points out (see CUBE_FACES); the chunk across a face edge may have it the other way round, so check.
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const c = at(i, j);
      if (nx * ring[c]! + ny * ring[c + 1]! + nz * ring[c + 2]! < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const length = Math.hypot(nx, ny, nz) || 1;
      const v = (j * SIDE + i) * 3;
      out[v] = nx / length;
      out[v + 1] = ny / length;
      out[v + 2] = nz / length;
    }
  }
}

/** Index of a chunk's corner vertex (see LodNode.corners). */
function cornerVertex(corner: number): number {
  return (corner >> 1) * CHUNK_CELLS * SIDE + (corner & 1) * CHUNK_CELLS;
}

/**
 * A child chunk's `own` values (3 per grid point) with the points it shares
 * with its parent (the even ones) taken from the parent's `parent` values;
 * the child covers the parent's cells from (px, py). What parentTarget reads.
 */
function parentPoints(own: Float32Array, parent: Float32Array, px: number, py: number): Float32Array {
  const out = own.slice();
  for (let j = 0; j < SIDE; j += 2) {
    for (let i = 0; i < SIDE; i += 2) {
      const v = (j * SIDE + i) * 3;
      const p = ((py + j / 2) * SIDE + px + i / 2) * 3;
      out[v] = parent[p]!;
      out[v + 1] = parent[p + 1]!;
      out[v + 2] = parent[p + 2]!;
    }
  }
  return out;
}

/**
 * For each point along `node`'s `edge` (0 to CHUNK_CELLS), the vertex of the
 * coarser chunk `other` at the same place, or of the nearest point that has
 * one: grid points have the same bits on every grid and face
 * (cubeSphereMath.faceGridPoint), so they're matched by their directions
 * (LodNode.dirs).
 */
function sharedVertices(node: LodNode, edge: Edge, other: LodNode): Int32Array {
  const out = new Int32Array(SIDE);
  for (let e = 0; e <= CHUNK_CELLS; e++) out[e] = sharedVertex(node, edgeVertex(edge, e), other);
  return out;
}

/** The vertex of `other` on its border at the place of `node`'s vertex `v`, or -1 if it has none there. */
function sharedVertex(node: LodNode, v: number, other: LodNode): number {
  const own = node.dirs!;
  const theirs = other.dirs!;
  const x = own[v * 3]!;
  const y = own[v * 3 + 1]!;
  const z = own[v * 3 + 2]!;
  for (let edge = 0 as Edge; edge < 4; edge++) {
    for (let f = 0; f <= CHUNK_CELLS; f++) {
      const w = edgeVertex(edge, f);
      if (theirs[w * 3] === x && theirs[w * 3 + 1] === y && theirs[w * 3 + 2] === z) return w;
    }
  }
  return -1;
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
