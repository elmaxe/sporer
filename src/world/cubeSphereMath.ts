/*
 * The maths of the cube sphere (see cubeSphere.ts), without THREE, so the
 * planet level's quadtree (planet/quadtree.ts) and the tests can share it.
 */

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * The cube's faces: outward axis, and the grid's u and v axes with
 * u × v = outward, so triangles wind counter-clockwise seen from outside.
 * Each axis is [index (0 = x, 1 = y, 2 = z), sign]; u and v always run along +.
 */
export const CUBE_FACES: readonly (readonly [readonly [number, number], readonly [number, number], readonly [number, number]])[] = [
  [[0, 1], [1, 1], [2, 1]], // +X: y × z
  [[0, -1], [2, 1], [1, 1]], // -X: z × y
  [[1, 1], [2, 1], [0, 1]], // +Y: z × x
  [[1, -1], [0, 1], [2, 1]], // -Y: x × z
  [[2, 1], [0, 1], [1, 1]], // +Z: x × y
  [[2, -1], [1, 1], [0, 1]], // -Z: y × x
];

/**
 * Pushes the cube point (x, y, z) (each in [-1, 1], one of them ±1) out onto
 * the unit sphere with Catlike Coding's mapping
 * (https://catlikecoding.com/unity/tutorials/procedural-meshes/cube-sphere/):
 * x' = x·√(1 − y²/2 − z²/2 + y²z²/3), and the same for y' and z'.
 */
export function spherify(x: number, y: number, z: number, out: Vec3Like): Vec3Like {
  const x2 = x * x;
  const y2 = y * y;
  const z2 = z * z;
  const px = x * Math.sqrt(1 - y2 / 2 - z2 / 2 + (y2 * z2) / 3);
  const py = y * Math.sqrt(1 - x2 / 2 - z2 / 2 + (x2 * z2) / 3);
  const pz = z * Math.sqrt(1 - x2 / 2 - y2 / 2 + (x2 * y2) / 3);
  // The mapping lands on the sphere; normalising removes rounding.
  const inv = 1 / Math.hypot(px, py, pz);
  out.x = px * inv;
  out.y = py * inv;
  out.z = pz * inv;
  return out;
}

/**
 * The cube point of face `face` at grid point (i, j) of an `n` × `n` grid,
 * pushed onto the unit sphere. The cube coordinates are (2i − n) / n, which
 * gives the same bits for the same point whatever the grid (scaling i and n by
 * a power of two doesn't change the quotient), so neighbouring grids of any
 * size, on this face or the next, agree exactly on the points they share.
 *
 * A point a little off the face (i or j outside [0, n], by less than n) folds
 * over the cube's edge onto the next face, as if the cube were unfolded flat,
 * and lands on that face's grid point to the bit (off in i or in j, not both:
 * past a corner there's no single next face).
 */
export function faceGridPoint(face: number, i: number, j: number, n: number, out: Vec3Like): Vec3Like {
  const [o, u] = CUBE_FACES[face]!;
  let co: number = o[1];
  let cu = (2 * i - n) / n;
  let cv = (2 * j - n) / n;
  // Past the edge by `over`: back onto the edge, and as far again down the next face.
  const overU = Math.abs(cu) - 1;
  if (overU > 0) {
    cu = Math.sign(cu);
    co = o[1] * (1 - overU);
  }
  const overV = Math.abs(cv) - 1;
  if (overV > 0) {
    cv = Math.sign(cv);
    co = o[1] * (1 - overV);
  }
  return spherify(
    o[0] === 0 ? co : u[0] === 0 ? cu : cv,
    o[0] === 1 ? co : u[0] === 1 ? cu : cv,
    o[0] === 2 ? co : u[0] === 2 ? cu : cv,
    out,
  );
}

/** A point on a cube face: the face and where on it, s and t in [0, 1] along its u and v axes. */
export interface FacePoint {
  face: number;
  s: number;
  t: number;
}

/**
 * The face point where the ray from the centre through (x, y, z) leaves the
 * cube (the cube's own coordinates, not the sphere's: use it with points built
 * on the cube, like `faceGridPoint`'s before spherify).
 */
export function cubeFacePoint(x: number, y: number, z: number, out: FacePoint): FacePoint {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  let axis: number;
  let m: number;
  if (ax >= ay && ax >= az) {
    axis = 0;
    m = x;
  } else if (ay >= az) {
    axis = 1;
    m = y;
  } else {
    axis = 2;
    m = z;
  }
  out.face = axis * 2 + (m > 0 ? 0 : 1);
  const [, u, v] = CUBE_FACES[out.face]!;
  const inv = 1 / Math.abs(m);
  out.s = (component(x, y, z, u[0]) * inv + 1) / 2;
  out.t = (component(x, y, z, v[0]) * inv + 1) / 2;
  return out;
}

/**
 * The cube point of face `face` at face coordinates (s, t) (in [0, 1] on the
 * face, beyond it to step off an edge onto the next face).
 */
export function faceCubePoint(face: number, s: number, t: number, out: Vec3Like): Vec3Like {
  const [o, u] = CUBE_FACES[face]!;
  const cu = 2 * s - 1;
  const cv = 2 * t - 1;
  out.x = o[0] === 0 ? o[1] : u[0] === 0 ? cu : cv;
  out.y = o[0] === 1 ? o[1] : u[0] === 1 ? cu : cv;
  out.z = o[0] === 2 ? o[1] : u[0] === 2 ? cu : cv;
  return out;
}

function component(x: number, y: number, z: number, axis: number): number {
  return axis === 0 ? x : axis === 1 ? y : z;
}
