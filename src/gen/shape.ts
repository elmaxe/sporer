import { terrainNoise } from './noise';
import type { Rng } from './rng';
import type { Vec3Tuple } from './starActivity';

/*
 * Irregular small bodies (step 25: comet nuclei; step 26: asteroids and
 * contact binaries): one shape function for every lumpy body. Pure data and
 * maths, unit-tested in tests/shape.test.ts.
 *
 * A body's surface is still a radius per direction, `radius · shapeRadius(dir)`,
 * so the cube sphere, the LOD, horizon culling, the ground ray and the map
 * keep working. The shape is a smooth union of 1–3 squashed ellipsoids
 * ("lobes"), each containing the centre: a ray from the centre leaves each
 * lobe exactly once, so the union is one connected surface, star-shaped about
 * the centre (no overhangs or arches: accepted), and its radius in a
 * direction is the largest of the lobes', blended where they meet. Then
 * low-frequency noise and a few craters. Normalised so the longest reach is
 * 1, and never below SHAPE_FLOOR, so the mesh never pinches to a point.
 */

/** Shortest a shape's radius gets, relative to its longest reach. */
export const SHAPE_FLOOR = 0.25;
/**
 * A contact binary's neck is at least this share of each lobe's own width:
 * 67P 0.63, Hartley 2 0.79; only Arrokoth's flat neck is thinner (0.32–0.58)
 * (see docs/research/comets.md).
 */
export const MIN_NECK = 0.4;

export interface Lobe {
  /** Centre, relative to the body's centre (which every lobe contains). */
  centre: Vec3Tuple;
  /** Semi-axes along `axes`. */
  radii: Vec3Tuple;
  /** Orthonormal axes of the ellipsoid. */
  axes: [Vec3Tuple, Vec3Tuple, Vec3Tuple];
}

export interface Crater {
  /** Unit direction of the centre. */
  dir: Vec3Tuple;
  /** Cosine of its angular radius. */
  cos: number;
  /** Depth at the centre, relative to the shape's radius. */
  depth: number;
}

export interface ShapeData {
  lobes: Lobe[];
  /** Width of the smooth union where lobes meet, in raw radius units. */
  blend: number;
  /** Low-frequency lumps: relative amplitude, frequency (on the unit sphere) and seed. */
  lumps: { amplitude: number; frequency: number; seed: number };
  craters: Crater[];
  /** Raw radius × scale = normalised radius (longest reach 1). */
  scale: number;
  /** Shortest normalised radius on a coarse grid (about; the shape never goes below SHAPE_FLOOR). */
  min: number;
  /** Lobes along the main axis: 2 or more makes it a contact binary. */
  binary: boolean;
}

/** Smooth maximum of a and b over width k (polynomial, C¹): max(a, b) away from where they meet, a fillet near it. */
function smax(a: number, b: number, k: number): number {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (a - b)) / k));
  return b + (a - b) * h + k * h * (1 - h);
}

/** Where a ray from the centre along unit (x, y, z) leaves `lobe` (the lobe contains the centre, so it always does). */
function lobeRadius(lobe: Lobe, x: number, y: number, z: number): number {
  const [e0, e1, e2] = lobe.axes;
  const [a, b, c] = lobe.radii;
  const [cx, cy, cz] = lobe.centre;
  // Into the lobe's frame, scaled to a unit sphere: |t·d − c| = 1.
  const d0 = (x * e0[0] + y * e0[1] + z * e0[2]) / a;
  const d1 = (x * e1[0] + y * e1[1] + z * e1[2]) / b;
  const d2 = (x * e2[0] + y * e2[1] + z * e2[2]) / c;
  const c0 = (cx * e0[0] + cy * e0[1] + cz * e0[2]) / a;
  const c1 = (cx * e1[0] + cy * e1[1] + cz * e1[2]) / b;
  const c2 = (cx * e2[0] + cy * e2[1] + cz * e2[2]) / c;
  const A = d0 * d0 + d1 * d1 + d2 * d2;
  const B = d0 * c0 + d1 * c1 + d2 * c2;
  const C = c0 * c0 + c1 * c1 + c2 * c2 - 1;
  // C < 0 (the centre is inside), so the far root is real and positive.
  return (B + Math.sqrt(Math.max(0, B * B - A * C))) / A;
}

/** The shape's raw radius (before normalising and the floor) along unit (x, y, z). */
function rawRadius(shape: ShapeData, x: number, y: number, z: number): number {
  const { lobes, blend } = shape;
  let r = lobeRadius(lobes[0]!, x, y, z);
  for (let i = 1; i < lobes.length; i++) r = smax(r, lobeRadius(lobes[i]!, x, y, z), blend);
  const { amplitude, frequency, seed } = shape.lumps;
  r *= 1 + amplitude * terrainNoise(x * frequency, y * frequency, z * frequency, seed);
  for (const crater of shape.craters) {
    const dot = x * crater.dir[0] + y * crater.dir[1] + z * crater.dir[2];
    if (dot <= crater.cos) continue;
    // u = (angle / angular radius)², near enough (1 − cos θ ≈ θ² / 2): a bowl, with a soft raised rim
    // (both flat where they meet the ground outside, so no crease).
    const u = (1 - dot) / (1 - crater.cos);
    const w = 1 - u;
    r *= 1 - crater.depth * w * w + crater.depth * 8 * u * u * u * w * w;
  }
  return r;
}

/**
 * The shape's radius along the unit direction (x, y, z): 1 at its longest
 * reach (as measured, within a fraction of a percent), never below
 * SHAPE_FLOOR. Allocation-free.
 */
export function shapeRadius(shape: ShapeData, x: number, y: number, z: number): number {
  return smax(rawRadius(shape, x, y, z) * shape.scale, SHAPE_FLOOR, 0.05);
}

/** Unit-sphere directions of a cube grid, `n` × `n` per face (for measuring a shape). */
function* gridDirections(n: number): Generator<Vec3Tuple> {
  const out: Vec3Tuple = [0, 0, 0];
  for (let face = 0; face < 6; face++) {
    const axis = face >> 1;
    const sign = face & 1 ? -1 : 1;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = ((i + 0.5) / n) * 2 - 1;
        const v = ((j + 0.5) / n) * 2 - 1;
        const p: Vec3Tuple = axis === 0 ? [sign, u, v] : axis === 1 ? [u, sign, v] : [u, v, sign];
        const l = Math.hypot(p[0], p[1], p[2]);
        out[0] = p[0] / l;
        out[1] = p[1] / l;
        out[2] = p[2] / l;
        yield out;
      }
    }
  }
}

/** Grid cells per cube face edge used to measure a shape (6 · 12² directions, then refined round the farthest). */
const MEASURE_GRID = 12;

/** The farthest grid directions the longest reach is climbed from (the true peak may be by another one). */
const MEASURE_STARTS = 6;

/**
 * The shape's raw longest reach: the farthest few of a coarse grid of
 * directions, each climbed towards its peak in shrinking steps, and the
 * highest of those (cheap enough to run for every comet of every system).
 */
function measureMax(shape: ShapeData): number {
  const starts: { r: number; dir: Vec3Tuple }[] = [];
  for (const [x, y, z] of gridDirections(MEASURE_GRID)) {
    const r = rawRadius(shape, x, y, z);
    if (starts.length < MEASURE_STARTS || r > starts[starts.length - 1]!.r) {
      starts.push({ r, dir: [x, y, z] });
      starts.sort((a, b) => b.r - a.r);
      if (starts.length > MEASURE_STARTS) starts.pop();
    }
  }
  let best = 0;
  const p: Vec3Tuple = [0, 0, 0];
  for (const start of starts) {
    let { r: top, dir: at } = start;
    for (let step = 0.08; step > 0.002; step *= 0.5) {
      for (let improved = true, tries = 0; improved && tries < 8; tries++) {
        improved = false;
        for (let k = 0; k < 6; k++) {
          p[0] = at[0];
          p[1] = at[1];
          p[2] = at[2];
          p[k >> 1] += k & 1 ? -step : step;
          const l = Math.hypot(p[0], p[1], p[2]);
          const r = rawRadius(shape, p[0] / l, p[1] / l, p[2] / l);
          if (r > top) {
            top = r;
            at = [p[0] / l, p[1] / l, p[2] / l];
            improved = true;
          }
        }
      }
    }
    best = Math.max(best, top);
  }
  return best;
}

export interface ShapeOptions {
  /** How many lobes (1–3); drawn when not given. */
  lobes?: number;
  /** Two similar lobes end to end, joined by a neck (a contact binary); drawn when not given. */
  binary?: boolean;
  /** Longest over shortest axis of a lobe, range (see docs/research/comets.md). */
  elongation?: readonly [number, number];
  /** Craters, range. */
  craters?: readonly [number, number];
}

/**
 * Lobe-count weights for comet nuclei: single, contact binary, and a body
 * with a third, smaller lobe. Two of the six visited nuclei are bilobed (67P,
 * Hartley 2); three lobes is a gameplay choice with no real case behind it
 * (see docs/research/comets.md).
 */
export const COMET_LOBES: readonly (readonly [number, number])[] = [
  [1, 6],
  [2, 3],
  [3, 1],
];

/** A single lobe's longest over shortest axis: the visited nuclei span 1.46–2.99, median ~1.8 (docs/research/comets.md). */
export const COMET_ELONGATION = [1.4, 2.6] as const;

/** A random rotation as three orthonormal axes (uniform over orientations). */
function randomAxes(rng: Rng): [Vec3Tuple, Vec3Tuple, Vec3Tuple] {
  // Uniform quaternion (Shoemake).
  const u1 = rng.next();
  const u2 = rng.next() * Math.PI * 2;
  const u3 = rng.next() * Math.PI * 2;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return quatAxes(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
}

/** A small tilt (about `angle` radians at most) as three axes. */
function tiltedAxes(rng: Rng, angle: number): [Vec3Tuple, Vec3Tuple, Vec3Tuple] {
  const dir = randomUnit(rng);
  const half = (rng.range(-1, 1) * angle) / 2;
  const s = Math.sin(half);
  return quatAxes(dir[0] * s, dir[1] * s, dir[2] * s, Math.cos(half));
}

function quatAxes(x: number, y: number, z: number, w: number): [Vec3Tuple, Vec3Tuple, Vec3Tuple] {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
  ];
}

function randomUnit(rng: Rng): Vec3Tuple {
  const z = rng.range(-1, 1);
  const a = rng.range(0, Math.PI * 2);
  const s = Math.sqrt(1 - z * z);
  return [s * Math.cos(a), s * Math.sin(a), z];
}

/** Rotates v by the axes (columns of the rotation are the axes). */
function rotate(axes: [Vec3Tuple, Vec3Tuple, Vec3Tuple], v: Vec3Tuple): Vec3Tuple {
  const [e0, e1, e2] = axes;
  return [
    e0[0] * v[0] + e1[0] * v[1] + e2[0] * v[2],
    e0[1] * v[0] + e1[1] * v[1] + e2[1] * v[2],
    e0[2] * v[0] + e1[2] * v[1] + e2[2] * v[2],
  ];
}

function compose(outer: [Vec3Tuple, Vec3Tuple, Vec3Tuple], inner: [Vec3Tuple, Vec3Tuple, Vec3Tuple]): [Vec3Tuple, Vec3Tuple, Vec3Tuple] {
  return [rotate(outer, inner[0]), rotate(outer, inner[1]), rotate(outer, inner[2])];
}

/** Semi-axes a ≥ b ≥ c with a / c drawn from `elongation`, scaled by `size`. */
function lobeRadii(rng: Rng, size: number, elongation: readonly [number, number]): Vec3Tuple {
  const ratio = rng.range(elongation[0], elongation[1]);
  const c = 1 / ratio;
  const b = c + (1 - c) * rng.range(0.3, 0.8);
  return [size, size * b, size * c];
}

/** Semi-axes with the longest (60%) or the middle one first: the one a contact binary's lobe lies along its axis by. */
function alongAxis(rng: Rng, [a, b, c]: Vec3Tuple): Vec3Tuple {
  return rng.chance(0.6) ? [a, b, c] : [b, a, c];
}

/**
 * A lobe of semi-axes `radii` whose first axis points along `along` (unit,
 * body frame), placed so a ray from the centre at right angles to `along`
 * leaves it at `neck` × its own half-width there: the centre sits inside it,
 * at the neck.
 */
function neckLobe(rng: Rng, radii: Vec3Tuple, along: Vec3Tuple, neck: number, frame: [Vec3Tuple, Vec3Tuple, Vec3Tuple]): Lobe {
  // Along the lobe's first axis, the ellipse x²/a² + y²/b² = 1 has y = neck·b at x = a·√(1 − neck²).
  const offset = radii[0] * Math.sqrt(1 - neck * neck);
  const sign = along[0] * frame[0][0] + along[1] * frame[0][1] + along[2] * frame[0][2] >= 0 ? 1 : -1;
  // The lobe's own axes: the body's frame (its first axis along the binary's axis), tilted a little about its own centre.
  const axes = compose(frame, tiltedAxes(rng, 0.25));
  const long = axes[0];
  return {
    centre: [long[0] * offset * sign, long[1] * offset * sign, long[2] * offset * sign],
    radii,
    axes,
  };
}

/**
 * A new shape from `rng` (its own stream: `rng.fork('shape')`). Single-lobed
 * bodies are one elongated ellipsoid round the centre, maybe with a knob;
 * contact binaries two similar lobes end to end joined by a neck at least
 * MIN_NECK of each lobe's width; three-lobed ones add a smaller lobe off to
 * the side. Then lumps and craters.
 */
export function generateShape(rng: Rng, options: ShapeOptions = {}): ShapeData {
  const lobeCount = Math.max(1, Math.min(3, options.lobes ?? rng.weighted(COMET_LOBES)));
  const binary = options.binary ?? lobeCount >= 2;
  const elongation = options.elongation ?? COMET_ELONGATION;
  const frame = randomAxes(rng);
  const lobes: Lobe[] = [];

  if (!binary) {
    const radii = lobeRadii(rng, 1, elongation);
    // Off-centre by up to a fifth of the shortest axis, so the body isn't symmetric about its centre.
    const shift = rng.range(0, 0.2) * radii[2];
    const dir = randomUnit(rng);
    lobes.push({ centre: [dir[0] * shift, dir[1] * shift, dir[2] * shift], radii, axes: frame });
  } else {
    // Two lobes end to end along the frame's first axis, the second 65–95% the size of the first (67P, Hartley 2 and
    // Arrokoth: 0.73–0.80). Rounder lobes than a single body's, each lying along the axis by its longest or middle semi-axis.
    const lobeShape: readonly [number, number] = [1.15, Math.max(1.3, (elongation[0] + elongation[1]) / 2)];
    const big = alongAxis(rng, lobeRadii(rng, 1, lobeShape));
    const small = alongAxis(rng, lobeRadii(rng, rng.range(0.65, 0.95), lobeShape));
    const axis = frame[0];
    const back: Vec3Tuple = [-axis[0], -axis[1], -axis[2]];
    // Necks of 50–80% of each lobe's width (67P 0.63, Hartley 2 0.79), never below MIN_NECK once lumps dent them.
    lobes.push(neckLobe(rng, big, axis, rng.range(MIN_NECK + 0.1, 0.8), frame));
    // The second lobe's frame is the first's turned half round its short axis, so its first axis points the other way.
    const flipped: [Vec3Tuple, Vec3Tuple, Vec3Tuple] = [back, [-frame[1][0], -frame[1][1], -frame[1][2]], frame[2]];
    lobes.push(neckLobe(rng, small, back, rng.range(MIN_NECK + 0.1, 0.8), flipped));
  }
  if (lobeCount === 3 || (!binary && lobeCount > 1)) {
    // A smaller lobe (or a knob on a single body) sideways off the main axis.
    const side = frame[1];
    const s = rng.sign();
    const dir: Vec3Tuple = [side[0] * s, side[1] * s, side[2] * s];
    const size = binary ? rng.range(0.35, 0.55) : rng.range(0.4, 0.6);
    const radii = lobeRadii(rng, size, elongation);
    const sideways: [Vec3Tuple, Vec3Tuple, Vec3Tuple] = [dir, frame[0], frame[2]];
    lobes.push(neckLobe(rng, radii, dir, rng.range(MIN_NECK + 0.1, 0.8), sideways));
  }

  const craterCount = rng.int(...(options.craters ?? [2, 6]));
  const craters: Crater[] = [];
  for (let i = 0; i < craterCount; i++) {
    const angle = rng.range(0.12, 0.45);
    craters.push({ dir: randomUnit(rng), cos: Math.cos(angle), depth: rng.range(0.03, 0.08) });
  }

  return normaliseShape({
    lobes,
    blend: rng.range(0.15, 0.3),
    lumps: { amplitude: rng.range(0.06, 0.12), frequency: rng.range(0.8, 1.4), seed: rng.int(0, 10_000) },
    craters,
    scale: 1,
    min: 1,
    binary,
  });
}

/**
 * Measures `shape` again after an edit (its lobes, lumps or craters): its
 * scale, so the longest reach is 1, and its shortest radius. Returns it.
 */
export function normaliseShape(shape: ShapeData): ShapeData {
  shape.scale = 1 / measureMax(shape);
  let min = Infinity;
  for (const [x, y, z] of gridDirections(MEASURE_GRID)) min = Math.min(min, shapeRadius(shape, x, y, z));
  shape.min = min;
  return shape;
}

/**
 * The shape's outward surface normal at unit direction `dir` (smooth: the
 * lobes, lumps and craters, no finer detail), by finite differences of the
 * radius. Writes into `out` and returns it.
 */
export function shapeNormal(shape: ShapeData, dir: Vec3Tuple, out: Vec3Tuple): Vec3Tuple {
  const [x, y, z] = dir;
  // Two tangents at dir.
  const ref: Vec3Tuple = Math.abs(x) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let tx = ref[1] * z - ref[2] * y;
  let ty = ref[2] * x - ref[0] * z;
  let tz = ref[0] * y - ref[1] * x;
  const tl = Math.hypot(tx, ty, tz);
  tx /= tl;
  ty /= tl;
  tz /= tl;
  const bx = y * tz - z * ty;
  const by = z * tx - x * tz;
  const bz = x * ty - y * tx;
  const h = 1e-3;
  const point = (u: number, v: number): Vec3Tuple => {
    let px = x + tx * u + bx * v;
    let py = y + ty * u + by * v;
    let pz = z + tz * u + bz * v;
    const l = Math.hypot(px, py, pz);
    px /= l;
    py /= l;
    pz /= l;
    const r = shapeRadius(shape, px, py, pz);
    return [px * r, py * r, pz * r];
  };
  const a = point(h, 0);
  const b = point(-h, 0);
  const c = point(0, h);
  const d = point(0, -h);
  const ux = a[0] - b[0];
  const uy = a[1] - b[1];
  const uz = a[2] - b[2];
  const vx = c[0] - d[0];
  const vy = c[1] - d[1];
  const vz = c[2] - d[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  // Outward: the same side as the direction.
  if (nx * x + ny * y + nz * z < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  const nl = Math.hypot(nx, ny, nz);
  out[0] = nx / nl;
  out[1] = ny / nl;
  out[2] = nz / nl;
  return out;
}

/**
 * The shape's half-widths along its three main directions (the first lobe's
 * axes; for a contact binary the first is along its length), normalised:
 * e.g. [0.9, 0.55, 0.45]. Measured on a grid; for descriptions and the lab.
 */
export function shapeExtents(shape: ShapeData): Vec3Tuple {
  const axes = shape.lobes[0]!.axes;
  const lo: Vec3Tuple = [Infinity, Infinity, Infinity];
  const hi: Vec3Tuple = [-Infinity, -Infinity, -Infinity];
  for (const [x, y, z] of gridDirections(24)) {
    const r = shapeRadius(shape, x, y, z);
    for (let k = 0; k < 3; k++) {
      const e = axes[k]!;
      const p = r * (x * e[0] + y * e[1] + z * e[2]);
      lo[k] = Math.min(lo[k]!, p);
      hi[k] = Math.max(hi[k]!, p);
    }
  }
  return [(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, (hi[2] - lo[2]) / 2];
}
