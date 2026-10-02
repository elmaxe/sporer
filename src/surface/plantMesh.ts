import { hexToRgb } from '../gen/color';
import { extent, perpendicular, type Architecture, type LeafMass, type PlantSkeleton, type Vec3 } from '../gen/plantForm';

/*
 * A plant's mesh at each level of detail, from its skeleton (gen/plantForm.ts).
 * Pure (no THREE), so the triangle counts and silhouettes are unit-tested;
 * plantLook.ts turns the arrays into geometry.
 *
 * Every level is built from the same skeleton, so they line up and the
 * dithered crossfade between them doesn't jump. Going down a level:
 *   - thin branches go: only stems up to `maxOrder` are drawn, with fewer
 *     sides and every `nodeStep`-th point;
 *   - leaf masses merge into one per branch (or per stem, for shrubs), then
 *     one per crown layer: a single blob, or a cone per layer for conifers,
 *     sized to cover the leaves they replace (`MERGE_FILL`);
 *   - a palm's fronds keep fewer points along their spine;
 *   - flowers and fruit are left out.
 * Flat-shaded and vertex-coloured, like the rest of the game: non-indexed
 * triangles, one colour per face.
 */

/** How a level of detail is built. */
export interface PlantLodSpec {
  /** Stems above this order are left out (−1: none at all). */
  readonly maxOrder: number;
  /** Sides of a stem's tube, by order (the last applies to higher orders). */
  readonly sides: readonly number[];
  /** Keep every `nodeStep`-th point of a stem (and its tip). */
  readonly nodeStep: number;
  /** Leaf masses as they are, merged per order-1 branch, per order-0 stem, or per crown layer. */
  readonly leaves: 'each' | 'branch' | 'stem' | 'crown';
  /** Leaf masses as icosahedra (20 triangles) or octahedra (8); a conifer's crown cones get 7 or 5 sides. */
  readonly blob: 'ico' | 'octa';
  readonly accents: boolean;
  /** Keep every `frondStep`-th point along a frond's spine. */
  readonly frondStep: number;
  /** Fronds folded along their spine (two strips), or flat (one). */
  readonly frondFold: boolean;
}

/** Levels of detail per plant: 0 is the full plant. */
export const PLANT_LOD_COUNT = 4;

/** The levels for an architecture: the full plant; its trunk and a leaf mass per branch; its trunk and one crown; the crown alone. */
export function plantLodSpec(architecture: Architecture, lod: number): PlantLodSpec {
  const shrub = architecture === 'shrub';
  if (lod <= 0) {
    // Conifers' many branches hide inside their pads, and a shrub's stems inside its leaves: fewer sides for those.
    const sides = architecture === 'conifer' ? [6, 3] : shrub ? [4, 3] : [6, 4, 3];
    return { maxOrder: 3, sides, nodeStep: 1, leaves: 'each', blob: 'ico', accents: true, frondStep: 1, frondFold: true };
  }
  // Further out, branches are under a pixel wide: only trunks are drawn (a shrub's stems not at all).
  const maxOrder = shrub ? -1 : 0;
  if (lod === 1) {
    const leaves = shrub ? 'stem' : architecture === 'conifer' ? 'each' : 'branch';
    return { maxOrder, sides: [4], nodeStep: 2, leaves, blob: architecture === 'conifer' ? 'octa' : 'ico', accents: false, frondStep: 2, frondFold: false };
  }
  if (lod === 2) return { maxOrder, sides: [3], nodeStep: 99, leaves: 'crown', blob: 'ico', accents: false, frondStep: 3, frondFold: false };
  // Farthest: the crown an octahedron (a trunk is still a pixel or two wide).
  return { maxOrder: shrub ? -1 : 0, sides: [3], nodeStep: 99, leaves: 'crown', blob: 'octa', accents: false, frondStep: 3, frondFold: false };
}

/**
 * Mean projected area of a polyhedron inscribed in the unit sphere, as a share
 * of the sphere's (π): by Cauchy's formula a convex body's mean shadow is a
 * quarter of its surface area. Icosahedron: 5√3 a²/4 with edge a = 1.0515,
 * 2.394, so 0.762; octahedron: 2√3 a²/4 with a = √2, 1.732, so 0.551. A leaf
 * mass's radii are those of its icosahedron; an octahedron is drawn bigger by
 * √(0.762 / 0.551) so it covers the same area.
 */
export const SHADOW_SHARE = { ico: 0.762, octa: 0.551 } as const;
/** Cells across a merge group's bounds when its coverage is measured. */
const COVERAGE_RES = 40;

/** Vertex arrays of a plant mesh: three floats per vertex, three vertices per triangle. */
export interface PlantMeshData {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  readonly triangles: number;
}

/** Colours a plant is painted with (hex strings). */
export interface PlantColors {
  readonly bark: string;
  readonly leaf: string;
  readonly leaf2: string;
  readonly accent: string;
}

// Unit icosahedron and octahedron (outward winding).
const T = (1 + Math.sqrt(5)) / 2;
const ICO_VERTS = normalizeAll([-1, T, 0, 1, T, 0, -1, -T, 0, 1, -T, 0, 0, -1, T, 0, 1, T, 0, -1, -T, 0, 1, -T, T, 0, -1, T, 0, 1, -T, 0, -1, -T, 0, 1]);
const ICO_FACES = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
const OCTA_VERTS = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
const OCTA_FACES = [0, 2, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 3, 1, 3, 4, 1, 4, 2];

function normalizeAll(v: number[]): number[] {
  for (let i = 0; i < v.length; i += 3) {
    const l = Math.hypot(v[i]!, v[i + 1]!, v[i + 2]!);
    v[i]! /= l;
    v[i + 1]! /= l;
    v[i + 2]! /= l;
  }
  return v;
}

/** 0 to 1 from two integers (deterministic, for per-vertex and per-face variation). */
function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

class MeshWriter {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  private faces = 0;
  constructor(private readonly top: number) {}

  /** One triangle in colour `rgb`, darkened towards the ground (a cheap stand-in for the shade under the crown). */
  tri(a: Vec3, b: Vec3, c: Vec3, rgb: readonly number[], vary = 0.06): void {
    // Strips narrowing to a point (a frond's tip) leave zero-area triangles: nothing to draw.
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < 1e-9) return;
    const y = (a[1] + b[1] + c[1]) / 3;
    const shade = (0.72 + 0.28 * Math.min(1, Math.max(0, y / this.top))) * (1 + vary * (hash01(this.faces++, 7) * 2 - 1));
    this.positions.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) this.colors.push(rgb[0]! * shade, rgb[1]! * shade, rgb[2]! * shade);
  }

  data(): PlantMeshData {
    return { positions: new Float32Array(this.positions), colors: new Float32Array(this.colors), triangles: this.positions.length / 9 };
  }
}

/** A hex colour as linear RGB (vertex colours are linear; THREE's Color.set converts the same way). */
function rgbOf(hex: string): number[] {
  return hexToRgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
}

function mixRgb(a: readonly number[], b: readonly number[], t: number): number[] {
  return a.map((v, i) => v + (b[i]! - v) * t);
}

/** A stem as a tube of `sides` sides along its kept points (rings turned by parallel transport, so they don't twist). */
function tube(w: MeshWriter, points: Vec3[], radii: number[], sides: number, rgb: readonly number[]): void {
  const n = points.length;
  if (n < 2) return;
  let normal: Vec3 | null = null;
  const rings: Vec3[][] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    const t = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    if (!normal) normal = perpendicular(t);
    else {
      const d = normal[0] * t[0] + normal[1] * t[1] + normal[2] * t[2];
      normal = unit([normal[0] - t[0] * d, normal[1] - t[1] * d, normal[2] - t[2] * d]);
    }
    const bi: Vec3 = [t[1] * normal[2] - t[2] * normal[1], t[2] * normal[0] - t[0] * normal[2], t[0] * normal[1] - t[1] * normal[0]];
    const p = points[i]!;
    const r = radii[i]!;
    const ring: Vec3[] = [];
    for (let k = 0; k < sides; k++) {
      const th = (k / sides) * Math.PI * 2;
      const c = Math.cos(th) * r;
      const s = Math.sin(th) * r;
      ring.push([p[0] + normal[0] * c + bi[0] * s, p[1] + normal[1] * c + bi[1] * s, p[2] + normal[2] * c + bi[2] * s]);
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = rings[i]!;
    const b = rings[i + 1]!;
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      w.tri(a[k]!, a[k1]!, b[k1]!, rgb, 0.03);
      w.tri(a[k]!, b[k1]!, b[k]!, rgb, 0.03);
    }
  }
}

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** An ellipsoid leaf mass as a jittered polyhedron (the same jitter on shared corners, so there are no cracks). */
function blob(w: MeshWriter, l: LeafMass, kind: 'ico' | 'octa', rgb: readonly number[], salt: number): void {
  const verts = kind === 'ico' ? ICO_VERTS : OCTA_VERTS;
  const faces = kind === 'ico' ? ICO_FACES : OCTA_FACES;
  const [a, b, c] = l.axes;
  const corners: Vec3[] = [];
  const grow = Math.sqrt(SHADOW_SHARE.ico / SHADOW_SHARE[kind]);
  for (let i = 0; i < verts.length / 3; i++) {
    const j = grow * (1 + 0.22 * (hash01(salt, i) - 0.5));
    const x = verts[i * 3]! * l.radii[1] * j;
    const y = verts[i * 3 + 1]! * l.radii[0] * j;
    const z = verts[i * 3 + 2]! * l.radii[2] * j;
    // Local y is the first axis, local x the second, local z the third.
    corners.push([
      l.centre[0] + a[0] * y + b[0] * x + c[0] * z,
      l.centre[1] + a[1] * y + b[1] * x + c[1] * z,
      l.centre[2] + a[2] * y + b[2] * x + c[2] * z,
    ]);
  }
  // Keep the outward winding when the frame is left-handed.
  const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  const flip = det > 0;
  for (let f = 0; f < faces.length; f += 3) {
    const p = corners[faces[f]!]!;
    const q = corners[faces[f + 1]!]!;
    const r = corners[faces[f + 2]!]!;
    if (flip) w.tri(p, r, q, rgb);
    else w.tri(p, q, r, rgb);
  }
}

/** A cone with its base at `y0` (open: far plants are seen from above), apex at `y1`, about the axis through (x, z). */
function cone(w: MeshWriter, x: number, z: number, y0: number, y1: number, radius: number, sides: number, rgb: readonly number[]): void {
  const apex: Vec3 = [x, y1, z];
  for (let k = 0; k < sides; k++) {
    const t0 = (k / sides) * Math.PI * 2;
    const t1 = ((k + 1) / sides) * Math.PI * 2;
    const p0: Vec3 = [x + Math.cos(t0) * radius, y0, z - Math.sin(t0) * radius];
    const p1: Vec3 = [x + Math.cos(t1) * radius, y0, z - Math.sin(t1) * radius];
    w.tri(p0, p1, apex, rgb);
  }
}

/** A group of leaf masses' shadow seen along one direction: its area and the centre of it (in world space, on the plane through the origin). */
export interface Shadow {
  readonly area: number;
  readonly centre: Vec3;
}

/**
 * The union of the leaf masses' shadows seen along unit direction `dir`, as
 * drawn (radii shrunk to what an icosahedron covers, see SHADOW_SHARE), on a
 * grid over their bounds. A mass's shadow is the exact projection of its
 * ellipsoid: with N its axes × radii projected onto the picture, the shadow
 * is the image of the unit ball, the ellipse qᵀ(N Nᵀ)⁻¹q ≤ 1.
 */
export function shadow(group: readonly LeafMass[], dir: Vec3): Shadow {
  const shrink = Math.sqrt(SHADOW_SHARE.ico);
  // The picture's axes: across (horizontal where it can be) and up.
  const u = Math.abs(dir[1]) > 0.999 ? ([1, 0, 0] as Vec3) : unit([dir[2], 0, -dir[0]]);
  const v: Vec3 = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]];
  const dotp = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  const shapes = group.map((l) => {
    const n = l.axes.map((a, i) => [dotp(a, u) * l.radii[i]! * shrink, dotp(a, v) * l.radii[i]! * shrink]);
    const s00 = n[0]![0]! ** 2 + n[1]![0]! ** 2 + n[2]![0]! ** 2;
    const s01 = n[0]![0]! * n[0]![1]! + n[1]![0]! * n[1]![1]! + n[2]![0]! * n[2]![1]!;
    const s11 = n[0]![1]! ** 2 + n[1]![1]! ** 2 + n[2]![1]! ** 2;
    const cu = dotp(l.centre, u);
    const cv = dotp(l.centre, v);
    minU = Math.min(minU, cu - Math.sqrt(s00));
    maxU = Math.max(maxU, cu + Math.sqrt(s00));
    minV = Math.min(minV, cv - Math.sqrt(s11));
    maxV = Math.max(maxV, cv + Math.sqrt(s11));
    const det = s00 * s11 - s01 * s01 || 1e-12;
    return { cu, cv, i00: s11 / det, i01: -s01 / det, i11: s00 / det };
  });
  const su = (maxU - minU) / COVERAGE_RES;
  const sv = (maxV - minV) / COVERAGE_RES;
  let count = 0;
  let mu = 0;
  let mv = 0;
  for (let y = 0; y < COVERAGE_RES; y++) {
    const pv = minV + (y + 0.5) * sv;
    for (let x = 0; x < COVERAGE_RES; x++) {
      const pu = minU + (x + 0.5) * su;
      for (const e of shapes) {
        const du = pu - e.cu;
        const dv = pv - e.cv;
        if (du * du * e.i00 + 2 * du * dv * e.i01 + dv * dv * e.i11 <= 1) {
          count++;
          mu += pu;
          mv += pv;
          break;
        }
      }
    }
  }
  mu = count ? mu / count : (minU + maxU) / 2;
  mv = count ? mv / count : (minV + maxV) / 2;
  return { area: count * su * sv, centre: [u[0] * mu + v[0] * mv, u[1] * mu + v[1] * mv, u[2] * mu + v[2] * mv] };
}

/** The lowest and highest points of a group of leaf masses. */
function heightSpan(group: readonly LeafMass[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const l of group) {
    const e = extent(l, 1) * Math.sqrt(SHADOW_SHARE.ico);
    lo = Math.min(lo, l.centre[1] - e);
    hi = Math.max(hi, l.centre[1] + e);
  }
  return [lo, hi];
}

/**
 * Merges leaf masses into one blob that covers what they did: as much area
 * seen from above (its horizontal radius) and, on average, from two sides
 * (its height), centred where their shadows were.
 */
export function mergeLeaves(group: readonly LeafMass[]): LeafMass {
  if (group.length === 1) return group[0]!;
  const top = shadow(group, [0, -1, 0]);
  const front = shadow(group, [0, 0, -1]);
  const side = shadow(group, [-1, 0, 0]);
  const share = SHADOW_SHARE.ico;
  const rh = Math.sqrt(top.area / (Math.PI * share));
  const rv = (front.area + side.area) / 2 / (Math.PI * share * rh);
  return {
    kind: 'blob',
    centre: [top.centre[0], (front.centre[1] + side.centre[1]) / 2, top.centre[2]],
    axes: [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, -1],
    ],
    radii: [rv, rh, rh],
    stem: group[0]!.stem,
    tier: group[0]!.tier,
    shade: group.reduce((s, l) => s + l.shade, 0) / group.length,
  };
}

/**
 * Elevation (radians) the far crowns are sized for. In low orbit the camera
 * hangs some 20 units over the ground behind the UFO, so a plant 60 to 300
 * units off (where crowns are cones) is seen from 4° to 20° above its horizon.
 */
export const FAR_VIEW_ELEVATION = (20 * Math.PI) / 180;

/**
 * Area of a cone's shadow seen from `elevation` above its base's plane:
 * the convex hull of its base (an ellipse r × r·sin e) and its apex (h·cos e
 * above the base's centre). Squashing the ellipse to a circle of radius r, the
 * apex sits D away; with cos θ = r/D the hull is the circle less the sector
 * 2θ plus the kite r·√(D² − r²), then stretched back.
 */
export function coneShadow(radius: number, height: number, elevation: number): number {
  const b = radius * Math.sin(elevation);
  if (b <= 1e-9) return radius * height * Math.cos(elevation);
  const d = (height * Math.cos(elevation) * radius) / b;
  if (d <= radius) return Math.PI * radius * b;
  const theta = Math.acos(radius / d);
  return (b / radius) * (radius * radius * (Math.PI - theta) + radius * Math.sqrt(d * d - radius * radius));
}

/**
 * A crown layer's cone, from its lowest needles to its highest, as wide as
 * covers the area its needles did seen from FAR_VIEW_ELEVATION (averaged over
 * four headings; an n-sided cone covers (n/2π)·sin(2π/n) of its circle).
 */
export function layerCone(group: readonly LeafMass[], sides: number): { x: number; z: number; lo: number; hi: number; radius: number } {
  const [lo, hi] = heightSpan(group);
  // Centred where the needles are seen from above (a leaning trunk carries them off the plant's axis).
  const { centre } = shadow(group, [0, -1, 0]);
  const e = FAR_VIEW_ELEVATION;
  let target = 0;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + 0.4;
    target += shadow(group, [-Math.cos(e) * Math.cos(a), -Math.sin(e), -Math.cos(e) * Math.sin(a)]).area / 4;
  }
  const polygon = (sides / (2 * Math.PI)) * Math.sin((2 * Math.PI) / sides);
  // The shadow grows with the radius: bisect for the one that matches.
  let a = 0;
  let b = Math.max(1e-3, hi - lo) * 4 + 1;
  for (let i = 0; i < 40; i++) {
    const r = (a + b) / 2;
    if (coneShadow(r * Math.sqrt(polygon), hi - lo, e) < target) a = r;
    else b = r;
  }
  return { x: centre[0], z: centre[2], lo, hi, radius: (a + b) / 2 };
}

/** Groups leaf masses by `key`, in order of first appearance. */
function groupBy(leaves: readonly LeafMass[], key: (l: LeafMass) => number): LeafMass[][] {
  const groups = new Map<number, LeafMass[]>();
  for (const l of leaves) {
    const k = key(l);
    const g = groups.get(k);
    if (g) g.push(l);
    else groups.set(k, [l]);
  }
  return [...groups.values()];
}

/** The stem's ancestor at order 0. */
function rootOf(skeleton: PlantSkeleton, stem: number): number {
  let s = stem;
  while (s >= 0 && skeleton.stems[s]!.parent >= 0) s = skeleton.stems[s]!.parent;
  return s;
}

/** The plant's mesh at level of detail `lod` (0 = full), in its own frame (+Y up, base at the origin). */
export function buildPlantMesh(skeleton: PlantSkeleton, colors: PlantColors, lod: number): PlantMeshData {
  const spec = plantLodSpec(skeleton.architecture, lod);
  const w = new MeshWriter(Math.max(1e-6, skeleton.top));
  const bark = rgbOf(colors.bark);
  const leaf = rgbOf(colors.leaf);
  const leaf2 = rgbOf(colors.leaf2);
  const accent = rgbOf(colors.accent);

  for (const stem of skeleton.stems) {
    if (stem.order > spec.maxOrder) continue;
    const keep: number[] = [];
    for (let i = 0; i < stem.points.length - 1; i += spec.nodeStep) keep.push(i);
    keep.push(stem.points.length - 1);
    const sides = spec.sides[Math.min(stem.order, spec.sides.length - 1)]!;
    tube(
      w,
      keep.map((i) => stem.points[i]!),
      keep.map((i) => stem.radii[i]!),
      sides,
      bark,
    );
  }

  const leafColor = (l: LeafMass) => mixRgb(leaf, leaf2, l.shade);
  if (spec.leaves === 'crown' && skeleton.architecture === 'conifer') {
    // A cone per crown layer, covering what its needles did.
    const sides = spec.blob === 'ico' ? 7 : 5;
    for (const layer of groupBy(skeleton.leaves, (l) => l.tier)) {
      const { x, z, lo, hi, radius } = layerCone(layer, sides);
      const shade = layer.reduce((s, l) => s + l.shade, 0) / layer.length;
      cone(w, x, z, lo, hi, radius, sides, mixRgb(leaf, leaf2, shade));
    }
  } else {
    let masses: readonly LeafMass[] = skeleton.leaves;
    if (spec.leaves === 'branch') masses = groupBy(masses, (l) => skeleton.stems[l.stem]!.branch >= 0 ? skeleton.stems[l.stem]!.branch : -1 - l.stem).map(mergeLeaves);
    else if (spec.leaves === 'stem') masses = groupBy(masses, (l) => rootOf(skeleton, l.stem)).map(mergeLeaves);
    else if (spec.leaves === 'crown') masses = groupBy(masses, (l) => l.tier).map(mergeLeaves);
    masses.forEach((l, i) => blob(w, l, spec.blob, leafColor(l), i * 31 + lod));
  }

  for (const f of skeleton.fronds) frond(w, f, spec.frondStep, spec.frondFold, mixRgb(leaf, leaf2, f.shade));

  if (spec.accents) {
    skeleton.accents.forEach((a, i) => {
      blob(
        w,
        { kind: 'blob', centre: a.centre, axes: [[0, 1, 0], [1, 0, 0], [0, 0, -1]], radii: [a.radius, a.radius, a.radius], stem: -1, tier: 0, shade: 0 },
        'octa',
        accent,
        1000 + i,
      );
    });
  }
  return w.data();
}

/** A frond: a strip either side of its spine, folded down at the edges (or one flat strip), drawn from both sides (it's a sheet, not a solid). */
function frond(w: MeshWriter, f: PlantSkeleton['fronds'][number], step: number, fold: boolean, rgb: readonly number[]): void {
  const keep: number[] = [];
  for (let i = 0; i < f.points.length - 1; i += step) keep.push(i);
  keep.push(f.points.length - 1);
  const spine: Vec3[] = [];
  const left: Vec3[] = [];
  const right: Vec3[] = [];
  for (let k = 0; k < keep.length; k++) {
    const i = keep[k]!;
    const p = f.points[i]!;
    const a = f.points[Math.max(0, i - 1)]!;
    const b = f.points[Math.min(f.points.length - 1, i + 1)]!;
    const t = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const s = f.sides[i]!;
    const up = unit([t[1] * s[2] - t[2] * s[1], t[2] * s[0] - t[0] * s[2], t[0] * s[1] - t[1] * s[0]]);
    const half = f.widths[i]! / 2;
    const drop = f.fold * half;
    spine.push(p);
    left.push([p[0] + s[0] * half - up[0] * drop, p[1] + s[1] * half - up[1] * drop, p[2] + s[2] * half - up[2] * drop]);
    right.push([p[0] - s[0] * half - up[0] * drop, p[1] - s[1] * half - up[1] * drop, p[2] - s[2] * half - up[2] * drop]);
  }
  // Flat: the two edges are the strip (the fold's drop is kept, so it lines up with the folded one).
  const strips: [Vec3[], Vec3[]][] = fold ? [[spine, left], [spine, right]] : [[right, left]];
  for (let k = 0; k < spine.length - 1; k++) {
    for (const [from, edge] of strips) {
      const a = from[k]!;
      const b = from[k + 1]!;
      const c = edge[k + 1]!;
      const d = edge[k]!;
      // Both windings: one face shows from above, the other from below.
      w.tri(a, b, c, rgb);
      w.tri(a, c, d, rgb);
      w.tri(a, c, b, rgb);
      w.tri(a, d, c, rgb);
    }
  }
}
