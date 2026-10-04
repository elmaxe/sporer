import { CHUNK_CELLS } from './quadtree';

/*
 * Level of detail for a volcano's cone in low orbit (pure maths, no THREE;
 * planet/VolcanoSurface.ts draws it). The cone's footprint is a disc round
 * the summit; a square grid is laid over it by Shirley and Chiu's concentric
 * map (square rings onto circles, equal areas), so its cells are about the
 * same size everywhere, with no pole at the summit as a polar grid has. The
 * square is a quadtree of chunks like the globe's cube faces (quadtree.ts):
 * `VOLCANO_CELLS` grid cells a side, splitting near the camera. A node at
 * `depth` covers [x, x + 1] × [y, y + 1] / 2^depth of the unit square.
 */

/** Grid cells along a chunk's edge (17 × 17 vertices), as on the globe (its seams' maths, snapStep, works in them). */
export const VOLCANO_CELLS = CHUNK_CELLS;

/** Deepest a volcano's chunks ever split (16 · 2^5 = 512 cells across). */
export const VOLCANO_MAX_DEPTH = 5;

/** Where a point of the square lands on the disc: `s` out from the centre (0–1), at `azimuth` (radians). */
export interface DiscPoint {
  s: number;
  azimuth: number;
}

/**
 * Shirley and Chiu's concentric map: square point (a, b) ∈ [−1, 1]² onto the
 * unit disc, as the distance `s` from its centre and the azimuth. The square's
 * rings land on circles (its edge on the disc's rim) and equal areas on
 * equal areas, so a regular grid becomes cells of about one size.
 */
export function concentricDisc(a: number, b: number, out: DiscPoint): DiscPoint {
  if (a === 0 && b === 0) {
    out.s = 0;
    out.azimuth = 0;
    return out;
  }
  let r: number;
  let phi: number;
  if (Math.abs(a) > Math.abs(b)) {
    r = a;
    phi = (Math.PI / 4) * (b / a);
  } else {
    r = b;
    phi = Math.PI / 2 - (Math.PI / 4) * (a / b);
  }
  // A negative r is the opposite half of the disc.
  out.s = Math.abs(r);
  out.azimuth = r < 0 ? phi + Math.PI : phi;
  return out;
}

/**
 * Grid point (i, j) of the node at `depth`, (x, y): its square coordinates
 * in [−1, 1], into `out` as [a, b]. The same bits for a point whatever node
 * and depth it's built from (the grid sizes are powers of two).
 */
export function volcanoGridPoint(depth: number, x: number, y: number, i: number, j: number, out: [number, number]): [number, number] {
  const n = VOLCANO_CELLS * 2 ** depth;
  out[0] = ((x * VOLCANO_CELLS + i) / n) * 2 - 1;
  out[1] = ((y * VOLCANO_CELLS + j) / n) * 2 - 1;
  return out;
}

/**
 * Whether the grid cell whose centre is at square point (a, b) splits along
 * its a–c diagonal (from (i, j) to (i + 1, j + 1)) rather than b–d: the one
 * running out from the summit, so the four quadrants mirror each other. It
 * depends only on the quadrant, which a child cell shares with its parent's,
 * so every level's triangles lie in the coarser ones' (see quadtree.ts's
 * parentTarget, which blends a new chunk in from its parent's shape).
 */
export function volcanoDiagonal(a: number, b: number): boolean {
  return a > 0 === b > 0;
}

/**
 * How deep a volcano's chunks may split: until their cells are no wider than
 * the terrain's finest round them (`finest`), from the root chunk's `rootCell`
 * (both in planet units), so its flanks look as fine as the ground they rise
 * from; never past VOLCANO_MAX_DEPTH.
 */
export function volcanoMaxDepth(rootCell: number, finest: number): number {
  if (!(finest > 0) || !(rootCell > finest)) return 0;
  return Math.min(VOLCANO_MAX_DEPTH, Math.ceil(Math.log2(rootCell / finest) - 1e-9));
}
