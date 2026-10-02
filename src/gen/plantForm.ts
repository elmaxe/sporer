import { hslToHex } from './color';
import { Rng } from './rng';

/*
 * How a plant grows (the plant lab, after roadmap step 25): a species' branching
 * structure, from the few numbers in its `PlantForm`, as a skeleton of stems
 * (polylines with radii) and leaf masses. Pure data, no THREE: the meshes, at
 * every level of detail, are built from it by surface/plantMesh.ts.
 *
 * The species' own numbers (height, trunk share, crown radius and crown shape,
 * see gen/plants.ts) are the envelope the plant fills; the form says what's
 * inside it: how many branches, at what angle, how they bend, how thick they
 * are and what the leaves are like. Branch thickness follows Leonardo's rule
 * (a parent's cross-section is shared out among the branches it carries) and
 * successive branches turn by the golden angle, the way most spiral
 * phyllotaxis does (docs/research/plant-forms.md). Everything else is
 * stylised to the game's low-poly look.
 */

/** How the plant is built: a central leader with layers of side branches, a trunk that splits into a round crown, a palm, or a shrub of stems from the ground. */
export type Architecture = 'conifer' | 'broadleaf' | 'palm' | 'shrub';
export const ARCHITECTURES: readonly Architecture[] = ['conifer', 'broadleaf', 'palm', 'shrub'];

/** The envelope a species' crown fills (gen/plants.ts `CrownShape`). */
export type Envelope = 'cone' | 'ball' | 'tiers';

export type Vec3 = [number, number, number];

/** A species' branching structure, as the plant lab edits it. */
export interface PlantForm {
  readonly architecture: Architecture;
  /** The plant's own random stream (bends, angles, where twigs go). */
  readonly seed: number;
  /** Orders of branches below the trunk or stems: 0 is a bare stem, 3 is trunk → branches → twigs → twiglets. */
  readonly depth: number;
  /** Main branches on the trunk (a shrub's stems, a palm's fronds). */
  readonly branches: number;
  /** Side branches on each branch, at every order below. */
  readonly twigs: number;
  /** Main branches' angle from the trunk, degrees (past 90 they point down). */
  readonly angle: number;
  /** Side branches' angle from their parent, degrees. */
  readonly twigAngle: number;
  /** A side branch's length as a share of what is left of its parent beyond it. */
  readonly lengthRatio: number;
  /** −1 to 1: branches bend down under their weight (−) or turn up to the light (+). */
  readonly tropism: number;
  /** 0 to 1: how crooked stems are. */
  readonly gnarl: number;
  /** 0 to 1: how far the trunk leans and curves (palms lean most). */
  readonly lean: number;
  /** Conifers with a tiered crown: how many layers of whorled branches. */
  readonly tiers: number;
  /** A leaf mass's radius as a share of the crown radius (a frond's width as a share of its length). */
  readonly leafSize: number;
  /** Leaf masses per outermost branch, 1 to 3. */
  readonly leafDensity: number;
  /** Second leaf colour: leaf masses mix the two. */
  readonly leafColor2: string;
  /** Flowers or fruit: their colour, and the share of leaf masses that carry some (0 for none). */
  readonly accentColor: string;
  readonly accent: number;
}

/** What a skeleton is grown from: the species' envelope and its form. */
export interface PlantShapeInput {
  readonly height: number;
  readonly trunkShare: number;
  /** Trunk radius as a share of the height. */
  readonly trunkWidth: number;
  readonly crownRadius: number;
  readonly crown: Envelope;
  readonly form: PlantForm;
}

/** A stem: the trunk, a shrub's stem, a branch or a twig, as a polyline with a radius at each point. */
export interface Stem {
  /** 0 for trunks and a shrub's stems, 1 for their branches, and so on. */
  readonly order: number;
  /** The stem it grows from (−1 for order 0). */
  readonly parent: number;
  /** Its order-1 ancestor (itself at order 1, −1 at order 0): what leaves merge by at the middle level of detail. */
  readonly branch: number;
  /** A tiered crown's layer, or a shrub's lobe, it grows in (0 otherwise; children inherit it). */
  readonly tier: number;
  readonly points: Vec3[];
  readonly radii: number[];
}

/** A leaf mass: an ellipsoid with axes `axes` (orthonormal) and radii `radii` (blobs of leaves, or a conifer's flat pad of needles along a branch). */
export interface LeafMass {
  readonly kind: 'blob' | 'pad';
  readonly centre: Vec3;
  readonly axes: readonly [Vec3, Vec3, Vec3];
  readonly radii: Vec3;
  /** The stem it hangs on. */
  readonly stem: number;
  /** A tiered crown's layer (0 at the bottom) or a shrub's lobe: leaves merge by it at the lowest level of detail (0 for other crowns). */
  readonly tier: number;
  /** 0 to 1: the mix of the two leaf colours. */
  readonly shade: number;
}

/** A palm's frond: a spine with a width and a sideways direction at each point; the leaf is folded up along the spine by `fold`. */
export interface Frond {
  readonly points: Vec3[];
  readonly widths: number[];
  readonly sides: Vec3[];
  readonly fold: number;
  readonly shade: number;
}

/** A flower or fruit. */
export interface Accent {
  readonly centre: Vec3;
  readonly radius: number;
  /** The leaf mass it sits on. */
  readonly leaf: number;
}

export interface PlantSkeleton {
  readonly architecture: Architecture;
  readonly stems: Stem[];
  readonly leaves: LeafMass[];
  readonly fronds: Frond[];
  readonly accents: Accent[];
  /** How far below the ground the trunk reaches (planted), the plant's highest point, its crown's radius (about the crown's own centre) and its widest reach from its axis. */
  readonly sink: number;
  readonly top: number;
  readonly crown: number;
  readonly reach: number;
}

/**
 * Leonardo's rule: a parent's radius^Δ equals the sum of its branches'
 * radius^Δ. Measured Δ in real trees is close to 2 (area preserving);
 * docs/research/plant-forms.md.
 */
export const BRANCH_EXPONENT = 2;
/** Successive branches turn by the golden angle, 360° (2 − φ), the divergence of most spiral phyllotaxis. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** How far below the ground a plant's base reaches, as a share of its height: hides gaps where the drawn ground is coarser than the terrain. */
export const SINK = 0.12;
/** Thinnest a stem is drawn, as a share of the plant's height (thinner ones would vanish between pixels anyway). */
const MIN_RADIUS = 0.006;
/** Range the skeleton is stretched over to fill its envelope exactly; growth rules keep it near 1. */
const FIT_RANGE: readonly [number, number] = [0.6, 1.7];

// --- Small vector helpers (allocation is fine: skeletons are built once per species) ---

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
function normalize(a: Vec3): Vec3 {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** A unit vector perpendicular to unit `d`. */
export function perpendicular(d: Vec3): Vec3 {
  const ref: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize(cross(ref, d));
}

/** `d` turned away by `angle` towards azimuth `azimuth` about it (both radians), measured from `ref` (perpendicular to `d`). */
function splay(d: Vec3, ref: Vec3, azimuth: number, angle: number): Vec3 {
  const other = cross(d, ref);
  const side = add(scale(ref, Math.cos(azimuth)), other, Math.sin(azimuth));
  return normalize(add(scale(d, Math.cos(angle)), side, Math.sin(angle)));
}

/** A frame (axis `a`, then two unit vectors across it, the second as near to up as it can be). */
function frame(a: Vec3): [Vec3, Vec3, Vec3] {
  const across = Math.abs(a[1]) > 0.98 ? ([1, 0, 0] as Vec3) : normalize(cross([0, 1, 0], a));
  return [a, across, normalize(cross(a, across))];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** The crown envelope's horizontal reach (share of the crown radius) at height share `t` (0 at its bottom, 1 at its top). */
export function envelopeReach(envelope: Envelope, t: number, tiers = 3): number {
  const u = clamp(t, 0, 1);
  if (envelope === 'cone') return 0.12 + 0.88 * (1 - u);
  if (envelope === 'ball') return Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
  // Tiers: each layer a cone of its own, the layers narrowing towards the top.
  const n = Math.max(1, tiers);
  const layer = Math.min(n - 1, Math.floor(u * n));
  const within = u * n - layer;
  return (1 - (0.55 * layer) / n) * (0.25 + 0.75 * (1 - within));
}

// --- Growing ---

class Grower {
  readonly stems: Stem[] = [];
  readonly leaves: LeafMass[] = [];
  readonly fronds: Frond[] = [];
  readonly accents: Accent[] = [];
  constructor(
    readonly input: PlantShapeInput,
    readonly rng: Rng,
  ) {}

  get form(): PlantForm {
    return this.input.form;
  }

  /**
   * A stem from `start` heading `dir`, `len` long, in `segments` segments,
   * radius `r0` tapering to `r1`. Each segment bends up (tropism > 0) or down
   * by the form's tropism (more the further out, as a branch's weight grows)
   * and by a random crook (gnarl).
   */
  grow(order: number, parent: number, branch: number, start: Vec3, dir: Vec3, len: number, r0: number, r1: number, segments: number, tropism: number, tier = parent >= 0 ? this.stems[parent]!.tier : 0): number {
    const index = this.stems.length;
    const points: Vec3[] = [start];
    const radii: number[] = [r0];
    let d = dir;
    let p = start;
    const step = len / segments;
    const gnarl = this.form.gnarl * 0.5;
    for (let s = 1; s <= segments; s++) {
      p = add(p, d, step);
      points.push(p);
      radii.push(r0 + (r1 - r0) * (s / segments));
      // Bend for the next segment.
      const bend = add([0, tropism * 0.35, 0], [this.rng.range(-1, 1), this.rng.range(-1, 1), this.rng.range(-1, 1)], gnarl);
      d = normalize(add(d, bend));
    }
    this.stems.push({ order, parent, branch: order === 1 ? index : order === 0 ? -1 : branch, tier, points, radii });
    return index;
  }

  /** The point and direction a share `t` (0 to 1) along stem `index`, and its radius there. */
  along(index: number, t: number): { p: Vec3; d: Vec3; r: number } {
    const { points, radii } = this.stems[index]!;
    const f = clamp(t, 0, 1) * (points.length - 1);
    const i = Math.min(points.length - 2, Math.floor(f));
    const u = f - i;
    const a = points[i]!;
    const b = points[i + 1]!;
    return {
      p: add(a, add(b, a, -1), u),
      d: normalize(add(b, a, -1)),
      r: radii[i]! + (radii[i + 1]! - radii[i]!) * u,
    };
  }

  /** Side branches on stem `index` (and theirs, down to the form's depth), between `from` and the tip. */
  sideBranches(index: number, from: number): void {
    const stem = this.stems[index]!;
    const { form } = this;
    if (stem.order >= form.depth) return;
    const n = Math.max(1, Math.round(form.twigs * (stem.order === 0 ? 1 : 0.8 ** (stem.order - 1))));
    const len = stemLength(stem);
    const tipRadius = stem.radii[stem.radii.length - 1]!;
    // Leonardo's rule: what the stem loses in cross-section between `from` and the tip goes to its branches.
    const baseRadius = this.along(index, from).r;
    const share = Math.max(0, baseRadius ** BRANCH_EXPONENT - tipRadius ** BRANCH_EXPONENT) / n;
    const r = Math.max(MIN_RADIUS * this.input.height, share ** (1 / BRANCH_EXPONENT));
    let azimuth = this.rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const t = from + (1 - from) * ((k + this.rng.range(0.25, 0.75)) / n);
      const at = this.along(index, t);
      azimuth += GOLDEN_ANGLE;
      const angle = ((form.twigAngle + this.rng.range(-8, 8)) * Math.PI) / 180;
      const dir = splay(at.d, perpendicular(at.d), azimuth, angle);
      const childLen = len * (1 - t) * form.lengthRatio * this.rng.range(0.8, 1.15) + len * 0.08;
      const child = this.grow(stem.order + 1, index, stem.branch, at.p, dir, childLen, Math.min(r, at.r * 0.9), r * 0.35, stem.order === 0 ? 3 : 2, form.tropism);
      this.sideBranches(child, 0.35);
    }
  }

  /** Leaf blobs on the outermost stems (at their tips and along them), sized for the crown. */
  leafBlobs(size: number, squash: number): void {
    const count = clamp(Math.round(this.form.leafDensity), 1, 3);
    const parents = new Set(this.stems.map((s) => s.parent));
    for (let i = 0; i < this.stems.length; i++) {
      // Only the outermost stems carry leaves.
      if (parents.has(i)) continue;
      const stem = this.stems[i]!;
      for (let k = 0; k < count; k++) {
        const t = count === 1 ? 1 : 1 - (k / count) * 0.6;
        const at = this.along(i, t);
        const r = size * this.rng.range(0.8, 1.2) * (k === 0 ? 1 : 0.85);
        this.addLeaf('blob', add(at.p, at.d, r * 0.35), frame([0, 1, 0]), [r * squash, r, r], i, stem.tier);
      }
    }
  }

  addLeaf(kind: LeafMass['kind'], centre: Vec3, axes: [Vec3, Vec3, Vec3], radii: Vec3, stem: number, tier: number): void {
    const leaf = this.leaves.length;
    this.leaves.push({ kind, centre, axes, radii, stem, tier, shade: this.rng.next() });
    if (this.rng.next() < this.form.accent) {
      // A few flowers or fruit on the leaf mass's outside, mostly the upper half.
      const mass = this.leaves[leaf]!;
      const h = extent(mass, 0);
      const v = extent(mass, 1);
      for (let k = 0; k < 2; k++) {
        const dir = normalize([this.rng.range(-1, 1), this.rng.range(-0.2, 1), this.rng.range(-1, 1)]);
        this.accents.push({ centre: add(centre, [dir[0] * h, dir[1] * v, dir[2] * h], 0.95), radius: Math.max(h, v) * 0.16, leaf });
      }
    }
  }
}

function stemLength(stem: Stem): number {
  let l = 0;
  for (let i = 1; i < stem.points.length; i++) l += length(add(stem.points[i]!, stem.points[i - 1]!, -1));
  return l;
}

/**
 * A conifer: one leader to the top and branches round it in a spiral (turning
 * by the golden angle), as long as the envelope is wide at their height (a
 * cone, or a cone per layer for a tiered crown), each carrying a flat pad of
 * needles along it.
 */
function growConifer(g: Grower): void {
  const { height: H, trunkShare, trunkWidth, crownRadius: R, crown, form } = g.input;
  const r0 = Math.max(MIN_RADIUS * H, H * trunkWidth);
  const crownBase = H * trunkShare;
  const crownH = H - crownBase;
  const leanDir = normalize([g.rng.range(-1, 1), 0, g.rng.range(-1, 1)]);
  const trunkDir = normalize(add([0, 1, 0], leanDir, form.lean * 0.15));
  const trunkLen = H * (1 + SINK) * 0.97;
  const tipRadius = r0 * 0.12;
  const trunk = g.grow(0, -1, -1, [0, -SINK * H, 0], trunkDir, trunkLen, r0, tipRadius, 7, 0);
  const tiers = crown === 'tiers' ? clamp(Math.round(form.tiers), 2, 6) : 1;
  const n = Math.max(3, Math.round(form.branches));
  const crownStart = (crownBase + SINK * H) / trunkLen;
  const share = Math.max(0, g.along(trunk, crownStart).r ** BRANCH_EXPONENT - tipRadius ** BRANCH_EXPONENT) / n;
  const branchRadius = Math.max(MIN_RADIUS * H, share ** (1 / BRANCH_EXPONENT));
  let azimuth = g.rng.range(0, Math.PI * 2);
  const ref = perpendicular(trunkDir);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const y = crownBase + crownH * t * 0.94;
    const at = g.along(trunk, (y + SINK * H) / trunkLen);
    const reach = R * envelopeReach(crown, t, tiers);
    const tier = Math.min(tiers - 1, Math.floor(t * tiers));
    azimuth += GOLDEN_ANGLE;
    // Branches leave nearly level, the upper ones a little steeper (Gil-Moreno 2018: more acute towards the top).
    const angle = ((form.angle - 12 * t + g.rng.range(-6, 6)) * Math.PI) / 180;
    const dir = splay(trunkDir, ref, azimuth + g.rng.range(-0.15, 0.15), angle);
    // Long enough to reach the envelope sideways.
    const horizontal = Math.max(0.35, Math.hypot(dir[0], dir[2]));
    const len = (reach / horizontal) * g.rng.range(0.9, 1.05);
    const branch = g.grow(1, trunk, -1, at.p, dir, len, Math.min(branchRadius, at.r * 0.8), branchRadius * 0.3, 2, form.tropism, tier);
    g.sideBranches(branch, 0.3);
    // Needles: a flat pad along the branch, about half as wide as it is long.
    const stem = g.stems[branch]!;
    const tip = stem.points[stem.points.length - 1]!;
    const mid = scale(add(at.p, tip), 0.5);
    const axis = normalize(add(tip, at.p, -1));
    const half = len * 0.55;
    const width = Math.max(half * (0.6 + form.leafSize), R * 0.15);
    g.addLeaf('pad', add(mid, axis, len * 0.05), frame(axis), [half, width, width * 0.5], branch, tier);
  }
  // The leader's own tuft at the top.
  const top = g.stems[trunk]!.points[g.stems[trunk]!.points.length - 1]!;
  const tuft = Math.max(R * 0.2, crownH / n);
  g.addLeaf('pad', add(top, [0, -tuft * 0.6, 0]), frame([0, 1, 0]), [tuft * 1.6, tuft * 0.8, tuft * 0.8], trunk, tiers - 1);
}

/** A broadleaf tree: a trunk to the crown, then branches spread up and out to points on the crown's ellipsoid, twigs, and blobs of leaves at their ends. */
function growBroadleaf(g: Grower): void {
  const { height: H, trunkShare, trunkWidth, crownRadius: R, form } = g.input;
  const r0 = Math.max(MIN_RADIUS * H, H * trunkWidth);
  const crownBase = H * trunkShare;
  const crownH = H - crownBase;
  const centre: Vec3 = [0, crownBase + crownH * 0.5, 0];
  const leaf = R * form.leafSize;
  // The trunk carries on into the crown as a leader, up to just under the leaves at the top.
  const leaderTop = crownBase + crownH * 0.55;
  const leanDir = normalize([g.rng.range(-1, 1), 0, g.rng.range(-1, 1)]);
  const trunkDir = normalize(add([0, 1, 0], leanDir, form.lean * 0.25));
  const trunkLen = leaderTop + SINK * H;
  const trunk = g.grow(0, -1, -1, [0, -SINK * H, 0], trunkDir, trunkLen, r0, r0 * 0.45, 5, 0);
  const n = Math.max(2, Math.round(form.branches));
  const tipRadius = r0 * 0.45;
  const share = Math.max(0, r0 ** BRANCH_EXPONENT - tipRadius ** BRANCH_EXPONENT) / n;
  const branchRadius = Math.max(MIN_RADIUS * H, share ** (1 / BRANCH_EXPONENT));
  let azimuth = g.rng.range(0, Math.PI * 2);
  const crownStart = (crownBase + SINK * H) / trunkLen;
  for (let k = 0; k < n; k++) {
    azimuth += GOLDEN_ANGLE;
    // Branches leave the trunk spread over the lower half of the crown, the first ones lowest.
    const t = crownStart * 0.92 + (1 - crownStart * 0.92) * ((k + g.rng.range(0.2, 0.8)) / n) * 0.85;
    const at = g.along(trunk, t);
    // Aim at a point on the crown: higher the steeper the form's angle (a narrow angle points up).
    const up = Math.cos((form.angle * Math.PI) / 180);
    const elevation = clamp(up * 0.9 + g.rng.range(-0.35, 0.35) + (at.p[1] - centre[1]) / crownH, -0.6, 0.85);
    const ring = Math.sqrt(1 - elevation * elevation);
    // Stop a leaf's radius inside the envelope, so the leaves fill it out to its edge.
    const target: Vec3 = [
      centre[0] + Math.cos(azimuth) * ring * (R - leaf * 0.8),
      centre[1] + elevation * (crownH * 0.5 - leaf * 0.7),
      centre[2] + Math.sin(azimuth) * ring * (R - leaf * 0.8),
    ];
    const toward = add(target, at.p, -1);
    const len = length(toward) * (form.depth > 1 ? 0.92 : 1);
    const branch = g.grow(1, trunk, -1, at.p, normalize(toward), len, Math.min(branchRadius, at.r * 0.85), branchRadius * 0.3, 4, form.tropism * 0.5);
    g.sideBranches(branch, 0.4);
  }
  g.leafBlobs(leaf, 0.8);
  // A cap over the leader's top, so the crown isn't hollow there.
  const top = g.stems[trunk]!.points[g.stems[trunk]!.points.length - 1]!;
  g.addLeaf('blob', add(top, [0, leaf * 0.6, 0]), frame([0, 1, 0]), [leaf, leaf * 1.3, leaf * 1.3], trunk, 0);
}

/** A palm: a bare, leaning, curving trunk and a rosette of arching fronds at its top. */
function growPalm(g: Grower): void {
  const { height: H, trunkWidth, crownRadius: R, form } = g.input;
  const r0 = Math.max(MIN_RADIUS * H, H * trunkWidth * 0.8);
  // The fronds rise a little above the trunk's top, then arch down to about its height.
  const trunkH = H - R * 0.35;
  const leanDir = normalize([g.rng.range(-1, 1), 0, g.rng.range(-1, 1)]);
  const segments = 7;
  // A curving trunk: leaning at the base, straightening towards the top.
  const points: Vec3[] = [];
  const radii: number[] = [];
  const lean = form.lean * 0.35 * trunkH;
  for (let s = 0; s <= segments; s++) {
    const u = s / segments;
    const y = -SINK * H + (trunkH + SINK * H) * u;
    const off = lean * Math.sin(u * Math.PI * 0.5);
    points.push([leanDir[0] * off, y, leanDir[2] * off]);
    // Palm trunks barely taper, with a slight swelling at the base.
    radii.push(r0 * (1 - 0.3 * u + 0.25 * Math.max(0, 0.15 - u) / 0.15));
  }
  g.stems.push({ order: 0, parent: -1, branch: -1, tier: 0, points, radii });
  const top = points[segments]!;
  const n = Math.max(4, Math.round(form.branches));
  let azimuth = g.rng.range(0, Math.PI * 2);
  for (let k = 0; k < n; k++) {
    azimuth += GOLDEN_ANGLE;
    // Young fronds stand up in the middle, old ones droop: the rise falls off round the rosette.
    const rise = (((form.angle - 90) * -1 + g.rng.range(-15, 15) - 25 * (k / n)) * Math.PI) / 180;
    const len = R * g.rng.range(0.95, 1.1);
    const heading: Vec3 = [Math.cos(azimuth), 0, Math.sin(azimuth)];
    const side = normalize(cross([0, 1, 0], heading));
    const fp: Vec3[] = [];
    const widths: number[] = [];
    const sides: Vec3[] = [];
    const steps = 6;
    let p: Vec3 = add(top, [0, r0 * 0.5, 0]);
    let angle = rise;
    // Total bend along the frond, radians: heavier (more negative tropism) fronds arch further down.
    const droop = 0.6 + Math.max(0, -form.tropism) * 0.6 + g.rng.range(0, 0.2);
    for (let s = 0; s <= steps; s++) {
      fp.push(p);
      const u = s / steps;
      // Narrow at the stalk, widest past the middle, to a point at the tip.
      widths.push(len * form.leafSize * Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.95)) ** 0.7);
      sides.push(side);
      const d: Vec3 = [heading[0] * Math.cos(angle), Math.sin(angle), heading[2] * Math.cos(angle)];
      p = add(p, d, len / steps);
      angle -= (droop * (0.4 + u)) / (steps * 0.9);
    }
    g.fronds.push({ points: fp, widths, sides, fold: 0.35, shade: g.rng.next() });
  }
  // Fruit (or flowers) under the fronds.
  if (form.accent > 0) {
    const count = Math.max(1, Math.round(form.accent * 6));
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + g.rng.range(-0.3, 0.3);
      g.accents.push({ centre: add(top, [Math.cos(a) * r0 * 1.4, -r0 * g.rng.range(0.2, 1.2), Math.sin(a) * r0 * 1.4]), radius: r0 * 0.6, leaf: -1 });
    }
  }
}

/** A shrub: stems from the ground fanning out to the crown's ellipsoid (two lobes for 'tiers'), twigs, and big blobs of leaves. */
function growShrub(g: Grower): void {
  const { height: H, trunkShare, crownRadius: R, crown, form } = g.input;
  const crownH = H * (1 - trunkShare);
  const leaf = R * form.leafSize;
  const n = Math.max(1, Math.round(form.branches));
  const r0 = Math.max(MIN_RADIUS * H, H * 0.03);
  const lobes: { centre: Vec3; rx: number; ry: number }[] = [{ centre: [0, H - crownH * 0.5, 0], rx: R, ry: crownH * 0.5 }];
  if (crown === 'tiers') {
    // A lower lobe off to one side, the main one a little the other way: together as wide as the crown.
    const a = g.rng.range(0, Math.PI * 2);
    lobes[0] = { centre: [-Math.cos(a) * R * 0.2, H - crownH * 0.5, -Math.sin(a) * R * 0.2], rx: R * 0.8, ry: crownH * 0.5 };
    lobes.push({ centre: [Math.cos(a) * R * 0.45, crownH * 0.32, Math.sin(a) * R * 0.45], rx: R * 0.55, ry: crownH * 0.35 });
  }
  let azimuth = g.rng.range(0, Math.PI * 2);
  for (let k = 0; k < n; k++) {
    azimuth += GOLDEN_ANGLE;
    const lobe = lobes[k % lobes.length]!;
    const spread = Math.sin((form.angle * Math.PI) / 180);
    const ring = clamp(spread * g.rng.range(0.7, 1.1), 0.1, 0.95);
    const elevation = Math.sqrt(1 - ring * ring) * 0.8;
    const target: Vec3 = [
      lobe.centre[0] + Math.cos(azimuth) * ring * (lobe.rx - leaf * 0.7),
      lobe.centre[1] + elevation * (lobe.ry - leaf * 0.6),
      lobe.centre[2] + Math.sin(azimuth) * ring * (lobe.rx - leaf * 0.7),
    ];
    const base: Vec3 = [g.rng.range(-0.08, 0.08) * R, -SINK * H, g.rng.range(-0.08, 0.08) * R];
    const toward = add(target, base, -1);
    const stem = g.grow(0, -1, -1, base, normalize(toward), length(toward), r0, r0 * 0.4, 3, form.tropism * 0.4, k % lobes.length);
    g.sideBranches(stem, 0.35);
  }
  g.leafBlobs(leaf, 0.8);
}

/**
 * The species' skeleton: stems and leaf masses in its own frame (+Y up, base
 * at the origin, `SINK` × height below it), filling the envelope (its height
 * and crown radius) exactly. Deterministic in the form's seed.
 */
export function growPlant(input: PlantShapeInput): PlantSkeleton {
  const g = new Grower(input, new Rng(input.form.seed).fork('grow'));
  const arch = input.form.architecture;
  if (arch === 'conifer') growConifer(g);
  else if (arch === 'broadleaf') growBroadleaf(g);
  else if (arch === 'palm') growPalm(g);
  else growShrub(g);
  return fit(g, input);
}

/**
 * Stretches the plant (above the ground) and its width so its top is the
 * species' height and its crown as wide as the crown radius. The crown's
 * width is measured about its own centre (a leaning trunk carries it off the
 * plant's axis), from its leaves and fronds (or its stems, when it has none).
 */
function fit(g: Grower, input: PlantShapeInput): PlantSkeleton {
  const H = input.height;
  let top = 0;
  const visitTop = (p: Vec3, ry: number) => (top = Math.max(top, p[1] + ry));
  for (const s of g.stems) s.points.forEach((p) => visitTop(p, 0));
  for (const l of g.leaves) visitTop(l.centre, extent(l, 1));
  for (const f of g.fronds) f.points.forEach((p) => visitTop(p, 0));
  // The crown's parts: centre and horizontal half-extent of each.
  const parts: [Vec3, number][] = [];
  for (const l of g.leaves) parts.push([l.centre, extent(l, 0)]);
  for (const f of g.fronds) f.points.forEach((p, i) => parts.push([p, f.widths[i]! * 0.5]));
  if (parts.length === 0) for (const s of g.stems) s.points.forEach((p, i) => parts.push([p, s.radii[i]!]));
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [p, e] of parts) {
    minX = Math.min(minX, p[0] - e);
    maxX = Math.max(maxX, p[0] + e);
    minZ = Math.min(minZ, p[2] - e);
    maxZ = Math.max(maxZ, p[2] + e);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  let crown = 0;
  for (const [p, e] of parts) crown = Math.max(crown, Math.hypot(p[0] - cx, p[2] - cz) + e);
  const sy = clamp(H / Math.max(1e-6, top), FIT_RANGE[0], FIT_RANGE[1]);
  const sx = clamp(input.crownRadius / Math.max(1e-6, crown), FIT_RANGE[0], FIT_RANGE[1]);
  // Only what is above the ground stretches up; the stretch across is about the plant's axis.
  const map = (p: Vec3): Vec3 => [p[0] * sx, p[1] > 0 ? p[1] * sy : p[1], p[2] * sx];
  const stems = g.stems.map((s) => ({ ...s, points: s.points.map(map) }));
  const leaves = g.leaves.map((l) => ({ ...l, centre: map(l.centre), radii: stretchRadii(l, sx, sy) }));
  const fronds = g.fronds.map((f) => ({ ...f, points: f.points.map(map), widths: f.widths.map((w) => w * Math.sqrt(sx * sy)) }));
  const accents = g.accents.map((a) => ({ ...a, centre: map(a.centre) }));
  let reach = 0;
  for (const s of stems) s.points.forEach((p, i) => (reach = Math.max(reach, Math.hypot(p[0], p[2]) + s.radii[i]!)));
  for (const l of leaves) reach = Math.max(reach, Math.hypot(l.centre[0], l.centre[2]) + extent(l, 0));
  for (const f of fronds) f.points.forEach((p, i) => (reach = Math.max(reach, Math.hypot(p[0], p[2]) + f.widths[i]! * 0.5)));
  return { architecture: input.form.architecture, stems, leaves, fronds, accents, sink: SINK * H, top: top * sy, crown: crown * sx, reach };
}

/** Half-extent of a leaf mass along world axis `axis` (0 = horizontal, as the larger of x and z; 1 = y). */
export function extent(l: LeafMass, axis: 0 | 1): number {
  const [a, b, c] = l.axes;
  const [ra, rb, rc] = l.radii;
  if (axis === 1) return Math.hypot(ra * a[1], rb * b[1], rc * c[1]);
  return Math.max(Math.hypot(ra * a[0], rb * b[0], rc * c[0]), Math.hypot(ra * a[2], rb * b[2], rc * c[2]));
}

/** A leaf mass's radii after stretching the plant by `sx` across and `sy` up (each axis by how much it points that way). */
function stretchRadii(l: LeafMass, sx: number, sy: number): Vec3 {
  return l.axes.map((a, i) => l.radii[i]! * Math.hypot(sx * Math.hypot(a[0], a[2]), sy * a[1])) as Vec3;
}

// --- Generating a form ---

/** Ranges a form is drawn from, per architecture: [min, max]. */
const FORM_RANGES: Record<Architecture, { depth: [number, number]; branches: [number, number]; twigs: [number, number]; angle: [number, number]; twigAngle: [number, number]; lengthRatio: [number, number]; tropism: [number, number]; leafSize: [number, number] }> = {
  conifer: { depth: [1, 1], branches: [14, 22], twigs: [2, 4], angle: [75, 100], twigAngle: [40, 60], lengthRatio: [0.35, 0.55], tropism: [-0.5, 0.1], leafSize: [0.2, 0.45] },
  broadleaf: { depth: [1, 2], branches: [4, 7], twigs: [2, 3], angle: [30, 55], twigAngle: [30, 50], lengthRatio: [0.45, 0.65], tropism: [-0.2, 0.5], leafSize: [0.24, 0.36] },
  palm: { depth: [0, 0], branches: [7, 12], twigs: [0, 0], angle: [50, 80], twigAngle: [0, 0], lengthRatio: [0, 0], tropism: [-0.6, 0], leafSize: [0.25, 0.42] },
  shrub: { depth: [1, 1], branches: [3, 6], twigs: [1, 3], angle: [25, 55], twigAngle: [30, 55], lengthRatio: [0.4, 0.6], tropism: [-0.1, 0.4], leafSize: [0.38, 0.52] },
};

/** Which architecture suits a species of kind `tree` / bush with envelope `crown` (palms are some of the round-crowned trees). */
export function architectureFor(tree: boolean, crown: Envelope, rng: Rng): Architecture {
  if (!tree) return 'shrub';
  if (crown === 'ball') return rng.chance(0.25) ? 'palm' : 'broadleaf';
  return 'conifer';
}

/**
 * A form drawn from `rng` for `architecture`, with the leaf hue `leafHue`
 * (degrees) for its second leaf colour and flowers or fruit on some. Small
 * plants (`small`) get fewer, simpler stems.
 */
export function generateForm(rng: Rng, architecture: Architecture, leafHue: number, small = false): PlantForm {
  const r = FORM_RANGES[architecture];
  const int = (range: [number, number]) => rng.int(range[0], range[1]);
  const num = (range: [number, number]) => rng.range(range[0], range[1]);
  const depth = int(r.depth);
  const branches = int(r.branches);
  const twigs = int(r.twigs);
  const flowering = rng.chance(0.35);
  return {
    architecture,
    seed: rng.int(0, 0xffffff),
    // Small bushes: a few leafy stems, no twigs.
    depth: small ? 0 : depth,
    branches: small ? rng.int(3, 5) : branches,
    twigs,
    angle: num(r.angle),
    twigAngle: num(r.twigAngle),
    lengthRatio: num(r.lengthRatio),
    tropism: num(r.tropism),
    gnarl: rng.range(0.05, architecture === 'conifer' ? 0.2 : 0.45),
    lean: architecture === 'palm' ? rng.range(0.2, 0.8) : rng.range(0, 0.25),
    tiers: rng.int(3, 5),
    leafSize: num(r.leafSize),
    // Plenty of twig ends already (shrubs, broadleaves branching twice): one leaf mass each.
    leafDensity: architecture === 'conifer' || (architecture === 'shrub' && !small) || (architecture === 'broadleaf' && depth > 1) ? 1 : rng.int(1, 2),
    leafColor2: hslToHex(leafHue + rng.range(-25, 25), rng.range(0.35, 0.7), rng.range(0.22, 0.4)),
    accentColor: hslToHex(rng.range(0, 360), rng.range(0.6, 0.9), rng.range(0.5, 0.65)),
    accent: flowering ? rng.range(0.15, 0.5) : 0,
  };
}
