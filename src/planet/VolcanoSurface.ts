import * as THREE from 'three';
import type { VolcanoShape } from '../combat/volcano';
import { GROUND_LAYER } from '../world/groundDepth';
import { viewFreeze } from '../world/viewFreeze';
import { VolcanoLava, volcanoPoint, type VolcanoGroundView, type VolcanoPoint } from '../world/volcanoMesh';
import { lodParams } from './LodSurface';
import { CHUNK_CELLS, childAt, chunkBounds, nodeArc, parentTarget, snapStep, snapTo, wantsSplit, type ChunkBounds, type Edge } from './quadtree';
import {
  VOLCANO_CELLS,
  VOLCANO_MAX_DEPTH,
  concentricDisc,
  volcanoDiagonal,
  volcanoGridPoint,
  volcanoMaxDepth,
  type DiscPoint,
} from './volcanoGrid';

const SIDE = VOLCANO_CELLS + 1;
const VERTICES = SIDE * SIDE;
/** How far past an edge the neighbour search looks, as a fraction of the node's size. */
const STEP_OUT = 1e-3;

interface VolcanoNode {
  readonly parent: VolcanoNode | null;
  readonly depth: number;
  readonly x: number;
  readonly y: number;
  children: VolcanoNode[] | null;
  /** The children are drawn instead of this node. */
  split: boolean;
  /** Drawn as part of the cone (else covered by its children or its parent's mesh). */
  shown: boolean;
  /** How far it has blended from its parent's shape (0) to its own (1). */
  morph: number;
  /** Build order: how large its parent's cells look (larger first). */
  priority: number;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null;
  /** How wide its grid cells are at full height (planet units). */
  cell: number;
  /** Where its vertices can be (flat or full-grown, its own shape or its parent's). */
  readonly bounds: ChunkBounds;
  /** Per grid point: the ground it stands on and the full-grown cone's rise over it (as vectors), its colour, its lava (glow, s, 0). */
  ground: Float32Array | null;
  rise: Float32Array | null;
  colors: Float32Array | null;
  lava: Float32Array | null;
  /** The same for the parent's surface at its grid points (see quadtree.ts's parentTarget); the node's own at the root. */
  groundTarget: Float32Array | null;
  riseTarget: Float32Array | null;
  colorsTarget: Float32Array | null;
  lavaTarget: Float32Array | null;
  /** The shown node across each edge (null at the footprint's rim), and how many levels coarser it is (0 if the same or finer). */
  readonly neighbours: (VolcanoNode | null)[];
  readonly coarser: Int8Array;
  /** What the mesh was last written with: growth, own blend, then each edge's. */
  readonly written: Float64Array;
}

const byPriority = (a: VolcanoNode, b: VolcanoNode) => b.priority - a.priority;

/**
 * One volcano's cone in low orbit, refined where the camera is, as the
 * terrain round it is (LodSurface): a quadtree of chunks over its footprint
 * (volcanoGrid.ts) that split while their cells look wider than the terrain's
 * (lodParams.cellAngle), down to about the terrain's finest cells; far away
 * the whole cone is one chunk of 16 × 16 cells, up close its flanks are as
 * fine as the ground. The points are volcanoPoint's, draped over the ground
 * as drawn and raised by the growth, with VolcanoLava's glow (one material
 * for every chunk).
 *
 * As on the terrain, new chunks are built a few per frame and blend in from
 * their parent's shape (geomorphing), and blend back before a merge, so
 * nothing pops; where a chunk meets a coarser one its edge vertices collapse
 * onto the coarser one's (quadtree.ts's snapTo), so the seams are watertight.
 * In the body frame.
 */
export class VolcanoSurface {
  readonly object = new THREE.Group();
  private readonly lava = new VolcanoLava();
  private readonly root: VolcanoNode;
  private readonly queue: VolcanoNode[] = [];
  private readonly camera = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly square: [number, number] = [0, 0];
  private readonly disc: DiscPoint = { s: 0, azimuth: 0 };
  private readonly point: VolcanoPoint = { base: 0, rise: 0, glow: 0 };
  private readonly edgeMorph = new Float64Array(4);
  private growth: number;
  private morphStep = 0;
  private shownChanged = true;
  private busy = false;
  private _settled = false;

  constructor(
    readonly shape: VolcanoShape,
    private readonly view: VolcanoGroundView,
    /** The globe's radius, for the terrain's finest cells (see LodSurface). */
    private readonly globeRadius: number,
  ) {
    this.object.name = 'Volcano';
    this.growth = shape.growth;
    this.root = this.createNode(null, 0, 0, 0);
    this.build(this.root);
    this.root.morph = 1;
    this.show(this.root, true);
    this.write(this.root);
  }

  /** True when the chunks the camera wants are all built, shown and done blending. */
  get settled(): boolean {
    return this._settled;
  }

  /** How deep its chunks may split now: to about the terrain's finest cells (which follow lodParams.maxDepth). */
  get maxDepth(): number {
    return volcanoMaxDepth(this.root.cell, (this.globeRadius * nodeArc(lodParams.maxDepth)) / CHUNK_CELLS);
  }

  /** Chunks drawn now, the shallowest and deepest of them, and their triangles. */
  stats(): { chunks: number; minDepth: number; maxDepth: number; triangles: number } {
    const s = { chunks: 0, minDepth: Infinity, maxDepth: 0, triangles: 0 };
    const walk = (node: VolcanoNode) => {
      if (node.shown) {
        s.chunks++;
        s.minDepth = Math.min(s.minDepth, node.depth);
        s.maxDepth = Math.max(s.maxDepth, node.depth);
        s.triangles += node.mesh!.geometry.index!.count / 3;
      } else if (node.children) for (const k of node.children) walk(k);
    };
    walk(this.root);
    return s;
  }

  /** Raises it to `growth` of its height (the chunks are rewritten at the next update). */
  setGrowth(growth: number): void {
    this.growth = growth;
  }

  /** The lava at clock time `time`, `age` seconds after the volcano's birth (Infinity: long settled); `brightness` scales its glow. */
  animate(time: number, age: number, brightness = 1): void {
    this.lava.animate(time, age, brightness);
  }

  /**
   * Picks the chunks for a camera at `camera` (body frame), advances their
   * blending by `dt` seconds, builds missing ones until `deadline`
   * (performance.now(); at least one) and writes the shown ones' vertices.
   */
  update(camera: THREE.Vector3, dt: number, deadline: number): void {
    if (!lodParams.freeze && !viewFreeze.enabled) {
      this.camera.copy(camera);
      this.morphStep = lodParams.morphSeconds > 0 ? dt / lodParams.morphSeconds : 1;
      this.queue.length = 0;
      this.busy = false;
      this.select(this.root, this.maxDepth);
      this.queue.sort(byPriority);
      for (const node of this.queue) {
        this.build(node);
        if (performance.now() > deadline) break;
      }
      this._settled = this.queue.length === 0 && !this.busy;
    }
    if (this.shownChanged) {
      this.shownChanged = false;
      this.findNeighbours(this.root);
    }
    this.writeShown(this.root);
  }

  dispose(): void {
    this.disposeNode(this.root);
    this.object.removeFromParent();
    this.lava.dispose();
  }

  private select(node: VolcanoNode, maxDepth: number): void {
    // Selected nodes are built, so their bounds are known.
    const b = node.bounds;
    const distance = Math.hypot(this.camera.x - b.x, this.camera.y - b.y, this.camera.z - b.z) - b.radius;
    const cells = node.cell / Math.max(distance, node.cell * 1e-3);
    const wants = node.depth < maxDepth && wantsSplit(cells, lodParams.cellAngle, node.split);

    if (node.split) {
      const kids = node.children!;
      if (wants) {
        for (const k of kids) this.select(k, maxDepth);
      } else if (this.flatten(kids)) {
        // The children have blended back into this node's shape: swap them for it.
        for (const k of kids) this.disposeNode(k);
        node.children = null;
        node.split = false;
        this.show(node, true);
      }
      return;
    }

    if (wants && node.morph >= 1) {
      const kids = (node.children ??= [0, 1, 2, 3].map((i) => this.createNode(node, node.depth + 1, node.x * 2 + (i & 1), node.y * 2 + (i >> 1))));
      if (kids.every((k) => k.mesh !== null)) {
        node.split = true;
        this.show(node, false);
        for (const k of kids) {
          k.morph = 0;
          this.show(k, true);
          this.select(k, maxDepth);
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
    if (node.morph < 1) {
      node.morph = Math.min(1, node.morph + this.morphStep);
      this.busy = true;
    }
  }

  /** Blends the shown nodes under `nodes` back towards their parents' shape (merging split ones on the way). True once they're all flat. */
  private flatten(nodes: readonly VolcanoNode[]): boolean {
    let flat = true;
    for (const node of nodes) {
      if (node.split) {
        if (this.flatten(node.children!)) {
          for (const k of node.children!) this.disposeNode(k);
          node.children = null;
          node.split = false;
          this.show(node, true);
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

  private show(node: VolcanoNode, shown: boolean): void {
    if (node.shown !== shown) this.shownChanged = true;
    node.shown = shown;
    node.mesh!.visible = shown;
  }

  private createNode(parent: VolcanoNode | null, depth: number, x: number, y: number): VolcanoNode {
    return {
      parent,
      depth,
      x,
      y,
      children: null,
      split: false,
      shown: false,
      morph: 0,
      priority: 0,
      mesh: null,
      cell: 0,
      bounds: { x: 0, y: 0, z: 0, radius: 0, reach: 0, top: 0 },
      ground: null,
      rise: null,
      colors: null,
      lava: null,
      groundTarget: null,
      riseTarget: null,
      colorsTarget: null,
      lavaTarget: null,
      neighbours: [null, null, null, null],
      coarser: new Int8Array(4),
      written: new Float64Array(6).fill(-1),
    };
  }

  /** Samples the node's grid and makes its (hidden) mesh. */
  private build(node: VolcanoNode): void {
    const { dir, color, square, disc, point, shape } = this;
    const ground = (node.ground = new Float32Array(VERTICES * 3));
    const rise = (node.rise = new Float32Array(VERTICES * 3));
    const colors = (node.colors = new Float32Array(VERTICES * 3));
    const lava = (node.lava = new Float32Array(VERTICES * 3));
    // Jitter from the point's place on the finest grid, so it's the same at every depth.
    const scale = 2 ** (VOLCANO_MAX_DEPTH - node.depth);
    for (let j = 0; j < SIDE; j++) {
      for (let i = 0; i < SIDE; i++) {
        const v = (j * SIDE + i) * 3;
        volcanoGridPoint(node.depth, node.x, node.y, i, j, square);
        concentricDisc(square[0], square[1], disc);
        const jitter = 0.85 + 0.25 * hash01(shape.site.seed, (node.x * VOLCANO_CELLS + i) * scale, (node.y * VOLCANO_CELLS + j) * scale);
        volcanoPoint(shape, this.view, disc.s, disc.azimuth, jitter, dir, color, point);
        ground[v] = dir.x * point.base;
        ground[v + 1] = dir.y * point.base;
        ground[v + 2] = dir.z * point.base;
        rise[v] = dir.x * point.rise;
        rise[v + 1] = dir.y * point.rise;
        rise[v + 2] = dir.z * point.rise;
        color.toArray(colors, v);
        lava[v] = point.glow;
        lava[v + 1] = disc.s;
      }
    }
    if (node.parent) {
      // The parent's cell holding a child's odd-odd point is centred on it.
      const parentDiagonal = (i: number, j: number) => {
        volcanoGridPoint(node.depth, node.x, node.y, i, j, square);
        return volcanoDiagonal(square[0], square[1]);
      };
      parentTarget(ground, (node.groundTarget = new Float32Array(VERTICES * 3)), SIDE, parentDiagonal);
      parentTarget(rise, (node.riseTarget = new Float32Array(VERTICES * 3)), SIDE, parentDiagonal);
      parentTarget(colors, (node.colorsTarget = new Float32Array(VERTICES * 3)), SIDE, parentDiagonal);
      parentTarget(lava, (node.lavaTarget = new Float32Array(VERTICES * 3)), SIDE, parentDiagonal);
    } else {
      node.groundTarget = ground;
      node.riseTarget = rise;
      node.colorsTarget = colors;
      node.lavaTarget = lava;
    }

    const full = sum(ground, rise);
    let cells = 0;
    for (let j = 0; j < SIDE; j++) {
      for (let i = 0; i < SIDE; i++) {
        const v = j * SIDE + i;
        if (i < VOLCANO_CELLS) cells += distance(full, v, v + 1);
        if (j < VOLCANO_CELLS) cells += distance(full, v, v + SIDE);
      }
    }
    node.cell = cells / (2 * VOLCANO_CELLS * SIDE);
    // Blending, growth and the seams only ever move a vertex between these.
    chunkBounds([full, sum(node.groundTarget, node.riseTarget), ground, node.groundTarget], node.bounds);

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(new THREE.BufferAttribute(chunkIndices(node), 1));
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(VERTICES * 3), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(VERTICES * 3), 3));
    geometry.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(VERTICES), 1));
    geometry.setAttribute('aAlong', new THREE.BufferAttribute(new Float32Array(VERTICES), 1));
    const b = node.bounds;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(b.x, b.y, b.z), b.radius);
    const mesh = new THREE.Mesh(geometry, this.lava.material);
    mesh.name = 'Volcano';
    mesh.visible = false;
    mesh.matrixAutoUpdate = false;
    // The air's haze stops at it, as at the ground.
    mesh.layers.enable(GROUND_LAYER);
    node.mesh = mesh;
    this.object.add(mesh);
  }

  private disposeNode(node: VolcanoNode): void {
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
  private findNeighbours(node: VolcanoNode): void {
    if (!node.shown) {
      if (node.children) for (const k of node.children) this.findNeighbours(k);
      return;
    }
    const size = 1 / 2 ** node.depth;
    for (let edge = 0 as Edge; edge < 4; edge++) {
      let s = (node.x + 0.5) * size;
      let t = (node.y + 0.5) * size;
      if (edge === 0) s = node.x * size - size * STEP_OUT;
      else if (edge === 1) s = (node.x + 1) * size + size * STEP_OUT;
      else if (edge === 2) t = node.y * size - size * STEP_OUT;
      else t = (node.y + 1) * size + size * STEP_OUT;
      const other = s < 0 || s > 1 || t < 0 || t > 1 ? null : this.shownAt(s, t);
      node.neighbours[edge] = other;
      node.coarser[edge] = other ? Math.max(0, node.depth - other.depth) : 0;
    }
  }

  /** The shown node covering point (s, t) of the unit square. */
  private shownAt(s: number, t: number): VolcanoNode {
    let node = this.root;
    while (!node.shown && node.children) node = node.children[childAt(node.depth, node.x, node.y, s, t)]!;
    return node;
  }

  private writeShown(node: VolcanoNode): void {
    if (node.shown) this.write(node);
    else if (node.children) for (const k of node.children) this.writeShown(k);
  }

  /**
   * Writes a shown chunk's vertices if its growth or any blend changed: its
   * own blend inside, and along each edge the blend both sides agree on, the
   * vertices collapsed onto a coarser neighbour's (as LodSurface's write).
   */
  private write(node: VolcanoNode): void {
    const g = this.growth;
    const t = node.morph;
    const m = this.edgeMorph;
    const w = node.written;
    let blended = w[1] !== t;
    for (let edge = 0 as Edge; edge < 4; edge++) {
      const other = node.neighbours[edge];
      // Coarser: follow it. Same level: the slower of the two. Finer (or none): it follows this one.
      m[edge] = !other ? t : node.coarser[edge]! > 0 ? other.morph : other.depth === node.depth ? Math.min(t, other.morph) : t;
      // The coarser count goes in too, so a change of neighbour level rewrites.
      const key = m[edge]! + node.coarser[edge]! * 2;
      if (w[edge + 2] !== key) blended = true;
      w[edge + 2] = key;
    }
    if (w[0] === g && !blended) return;
    w[0] = g;
    w[1] = t;

    const geometry = node.mesh!.geometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colour = geometry.getAttribute('color') as THREE.BufferAttribute;
    const glow = geometry.getAttribute('aGlow') as THREE.BufferAttribute;
    const along = geometry.getAttribute('aAlong') as THREE.BufferAttribute;
    const p = position.array as Float32Array;
    const c = colour.array as Float32Array;
    const gl = glow.array as Float32Array;
    const al = along.array as Float32Array;
    const ground = node.ground!;
    const rise = node.rise!;
    const groundTarget = node.groundTarget!;
    const riseTarget = node.riseTarget!;
    const colors = node.colors!;
    const colorsTarget = node.colorsTarget!;
    const lava = node.lava!;
    const lavaTarget = node.lavaTarget!;
    const vertex = (v: number, morph: number) => {
      const o = v * 3;
      for (let k = 0; k < 3; k++) {
        p[o + k] = blend(groundTarget[o + k]! + g * riseTarget[o + k]!, ground[o + k]! + g * rise[o + k]!, morph);
        c[o + k] = blend(colorsTarget[o + k]!, colors[o + k]!, morph);
      }
      gl[v] = blend(lavaTarget[o]!, lava[o]!, morph);
      al[v] = blend(lavaTarget[o + 1]!, lava[o + 1]!, morph);
    };
    for (let v = 0; v < VERTICES; v++) vertex(v, t);
    for (let edge = 0 as Edge; edge < 4; edge++) {
      const levels = node.coarser[edge]!;
      const te = m[edge]!;
      if (levels === 0) {
        for (let e = 0; e <= VOLCANO_CELLS; e++) vertex(edgeVertex(edge, e), te);
        continue;
      }
      // Onto the coarser neighbour's vertices, where it has them now: its own
      // point blended from its parent's edge, which runs through this edge's
      // vertices a step either side (computed as it computes them).
      const step = snapStep(levels);
      const alongEdge = (edge < 2 ? node.y : node.x) * VOLCANO_CELLS;
      for (let e = 0; e <= VOLCANO_CELLS; e++) {
        const v = edgeVertex(edge, e) * 3;
        const to = snapTo(e, step);
        const q = edgeVertex(edge, to) * 3;
        const odd = ((alongEdge + to) / step) % 2 === 1 && to - step >= 0 && to + step <= VOLCANO_CELLS;
        const a = odd ? edgeVertex(edge, to - step) * 3 : q;
        const b = odd ? edgeVertex(edge, to + step) * 3 : q;
        for (let k = 0; k < 3; k++) {
          const from = odd
            ? Math.fround(midpoint(ground[a + k]!, ground[b + k]!)) + g * Math.fround(midpoint(rise[a + k]!, rise[b + k]!))
            : ground[q + k]! + g * rise[q + k]!;
          p[v + k] = blend(from, ground[q + k]! + g * rise[q + k]!, te);
          c[v + k] = blend(odd ? Math.fround(midpoint(colors[a + k]!, colors[b + k]!)) : colors[q + k]!, colors[q + k]!, te);
        }
        gl[v / 3] = blend(odd ? Math.fround(midpoint(lava[a]!, lava[b]!)) : lava[q]!, lava[q]!, te);
        al[v / 3] = blend(odd ? Math.fround(midpoint(lava[a + 1]!, lava[b + 1]!)) : lava[q + 1]!, lava[q + 1]!, te);
      }
    }
    position.needsUpdate = true;
    colour.needsUpdate = true;
    glow.needsUpdate = true;
    along.needsUpdate = true;
  }
}

/** From the parent's shape `from` to the own `to` by `t`; exact at both ends, and the same bits for the same inputs on both sides of a seam. */
function blend(from: number, to: number, t: number): number {
  return t >= 1 ? to : t <= 0 ? from : from + (to - from) * t;
}

function midpoint(a: number, b: number): number {
  return (a + b) * 0.5;
}

function sum(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length);
  for (let v = 0; v < a.length; v++) out[v] = a[v]! + b[v]!;
  return out;
}

/** Distance between points `a` and `b` of `p` (3 floats each). */
function distance(p: Float32Array, a: number, b: number): number {
  return Math.hypot(p[a * 3]! - p[b * 3]!, p[a * 3 + 1]! - p[b * 3 + 1]!, p[a * 3 + 2]! - p[b * 3 + 2]!);
}

/** A hash of a grid point to [0, 1). */
function hash01(seed: number, i: number, j: number): number {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Index of the `e`-th vertex along a chunk's edge (edges as in quadtree.ts: 0 at i = 0, 1 at i = max, 2 at j = 0, 3 at j = max). */
function edgeVertex(edge: Edge, e: number): number {
  if (edge === 0) return e * SIDE;
  if (edge === 1) return e * SIDE + VOLCANO_CELLS;
  if (edge === 2) return e;
  return VOLCANO_CELLS * SIDE + e;
}

/** Two triangles per grid cell, split along the diagonal volcanoDiagonal says, wound outward (the square's a and b turn anticlockwise seen from above). */
function chunkIndices(node: VolcanoNode): Uint16Array {
  const indices = new Uint16Array(VOLCANO_CELLS * VOLCANO_CELLS * 6);
  const centre: [number, number] = [0, 0];
  let k = 0;
  for (let j = 0; j < VOLCANO_CELLS; j++) {
    for (let i = 0; i < VOLCANO_CELLS; i++) {
      const a = j * SIDE + i;
      const b = a + 1;
      const c = a + SIDE + 1;
      const d = a + SIDE;
      volcanoGridPoint(node.depth, node.x, node.y, i + 0.5, j + 0.5, centre);
      if (volcanoDiagonal(centre[0], centre[1])) indices.set([a, b, c, a, c, d], k);
      else indices.set([a, b, d, b, c, d], k);
      k += 6;
    }
  }
  return indices;
}
