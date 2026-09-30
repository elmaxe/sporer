import { cubeFacePoint, faceCubePoint, type FacePoint, type Vec3Like } from '../world/cubeSphereMath';

/*
 * Level of detail for the low-orbit globe (pure maths, no THREE): each face of
 * the cube sphere is a quadtree of square chunks, `CHUNK_CELLS` grid cells a
 * side, that split in four near the camera and merge back far away (chunked
 * LOD, after Ulrich; see docs/research/planet-lod.md). A node at `depth` covers
 * face coordinates [x, x + 1] × [y, y + 1] / 2^depth.
 */

/** Grid cells along a chunk's edge (17 × 17 vertices). */
export const CHUNK_CELLS = 16;

/** A chunk splits back out of its children only once they'd be this much smaller than the split threshold (no flicker at the boundary). */
export const MERGE_HYSTERESIS = 0.8;

/** Angle along a cube edge that a node at `depth` spans: the face's quarter turn halved per level. */
export function nodeArc(depth: number): number {
  return Math.PI / 2 / 2 ** depth;
}

/**
 * True when every point of a node lies behind the planet, seen from the
 * camera: the node's centre is `angle` radians from the camera's direction,
 * it spans `nodeAngle` around its centre, the camera is `cameraDistance` from
 * the planet's centre, nothing is lower than `floor` (the ground that hides)
 * nor higher than `top` (the peaks that can peek over the horizon).
 */
export function beyondHorizon(angle: number, nodeAngle: number, cameraDistance: number, floor: number, top: number): boolean {
  if (cameraDistance <= floor) return false;
  // The camera sees the floor out to acos(floor / d) from straight below; a
  // peak of height `top` shows up to acos(floor / top) further round.
  return angle - nodeAngle > Math.acos(floor / cameraDistance) + Math.acos(Math.min(1, floor / top));
}

/**
 * About how large (radians) one grid cell of a node looks from the camera:
 * the cell's width over the distance to the nearest point of the node's
 * bounding sphere (`distance` to its centre point on the sea-level sphere,
 * minus `bound`).
 */
export function cellAngle(radius: number, depth: number, distance: number, bound: number): number {
  const cell = (radius * nodeArc(depth)) / CHUNK_CELLS;
  return cell / Math.max(distance - bound, radius * 1e-4);
}

/**
 * Whether a node whose cells look `angle` radians wide should be split,
 * against the threshold `maxAngle`. `split` says it is split now: then it
 * stays split down to MERGE_HYSTERESIS × the threshold.
 */
export function wantsSplit(angle: number, maxAngle: number, split: boolean): boolean {
  return angle > maxAngle * (split ? MERGE_HYSTERESIS : 1);
}

/** Which child (0–3, y-major) of a node at `depth`, (x, y), holds face point (s, t). */
export function childAt(depth: number, x: number, y: number, s: number, t: number): number {
  const n = 2 ** (depth + 1);
  const cx = Math.min(1, Math.max(0, Math.floor(s * n) - 2 * x));
  const cy = Math.min(1, Math.max(0, Math.floor(t * n) - 2 * y));
  return cy * 2 + cx;
}

/** A chunk's edges: 0 at s = min, 1 at s = max, 2 at t = min, 3 at t = max. */
export type Edge = 0 | 1 | 2 | 3;

/** How far past an edge `edgeNeighbour` looks, as a fraction of the node's size. */
const STEP_OUT = 1e-3;
const cube: Vec3Like = { x: 0, y: 0, z: 0 };

/**
 * A point just past the middle of `edge` of the node (face, depth, x, y), on
 * whichever face it lands (the next face over for nodes at the cube's edges):
 * the node on the other side of that edge contains it.
 */
export function edgeNeighbour(face: number, depth: number, x: number, y: number, edge: Edge, out: FacePoint): FacePoint {
  const size = 1 / 2 ** depth;
  const step = size * STEP_OUT;
  let s = (x + 0.5) * size;
  let t = (y + 0.5) * size;
  if (edge === 0) s = x * size - step;
  else if (edge === 1) s = (x + 1) * size + step;
  else if (edge === 2) t = y * size - step;
  else t = (y + 1) * size + step;
  faceCubePoint(face, s, t, cube);
  return cubeFacePoint(cube.x, cube.y, cube.z, out);
}

/**
 * Every `step`-th vertex of a chunk's edge is also a vertex of a neighbour
 * `levels` levels coarser. The ones between must go (see snapTo).
 */
export function snapStep(levels: number): number {
  return Math.min(2 ** Math.max(0, levels), CHUNK_CELLS);
}

/**
 * Where edge vertex `e` goes when the neighbour's vertices are every `step`:
 * onto the nearest of them. Moving them onto the neighbour's straight edges
 * instead would close the seam in theory, but leave T-junctions (a vertex
 * on one side in the middle of an edge on the other) that the rasteriser
 * leaks single pixels through. Collapsed onto the neighbour's vertices, the
 * edge is made of exactly the neighbour's segments (the rest shrink to
 * nothing), with the same endpoints to the bit, so it's watertight. The
 * vertices only slide along the edge, in order, so no triangle turns over.
 */
export function snapTo(e: number, step: number): number {
  const off = e % step;
  return off * 2 <= step ? e - off : e - off + step;
}
