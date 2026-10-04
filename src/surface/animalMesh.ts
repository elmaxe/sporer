import { hexToRgb } from '../gen/color';
import type { AnimalForm, AnimalSkeleton, BodyPart, Leg, SpineNode, Spike, Vec3 } from '../gen/animalForm';

/*
 * An animal's mesh at each level of detail, from its skeleton
 * (gen/animalForm.ts). Pure (no THREE), so triangle counts are unit-tested;
 * animalLook.ts turns the arrays into geometry and plays the walk.
 *
 * The body is a skin of rings round the spine (an ellipse at each node,
 * joined into a tube and closed at the snout and the tail tip); legs, horns,
 * ears, antennae and crest spines are tapering tubes; eyes are small
 * polyhedra. Flat-shaded and vertex-coloured like the rest of the game:
 * non-indexed triangles, one colour per face. The coat is countershaded
 * (the back's colour over the belly's, by which way the face looks) with its
 * pattern on top.
 *
 * Every vertex also carries its rig, read by the vertex shader: which part
 * it belongs to (body, a leg swinging fore and aft or sprawling, the tail,
 * the head and neck), the leg's gait phases, how far along its part it is,
 * and the joint it turns about. Going down a level: fewer sides and rings,
 * small spikes and the eyes go, legs become one straight tube.
 */

/** Levels of detail per animal: 0 is the full animal. */
export const ANIMAL_LOD_COUNT = 3;

/** Rig part codes (the shader's `aRig.x`). */
export const RIG = { body: 0, pendulum: 1, sprawl: 2, tail: 3, head: 4 } as const;

export interface AnimalLodSpec {
  /** Sides of the body's rings, of a leg's tube and of a spike's. */
  readonly ringSides: number;
  readonly legSides: number;
  readonly spikeSides: number;
  /** Keep every `spineStep`-th spine node of the torso and tail (the head's are always kept, its shape is in them). */
  readonly spineStep: number;
  /** Legs keep all their joints, or go straight from the hip to the toe. */
  readonly joints: boolean;
  /** Spikes kept: all, only the big ones (horns, crest), or none. */
  readonly spikes: 'all' | 'big' | 'none';
  readonly eyes: boolean;
}

export function animalLodSpec(lod: number): AnimalLodSpec {
  if (lod <= 0) return { ringSides: 10, legSides: 6, spikeSides: 5, spineStep: 1, joints: true, spikes: 'all', eyes: true };
  if (lod === 1) return { ringSides: 6, legSides: 4, spikeSides: 3, spineStep: 2, joints: true, spikes: 'big', eyes: true };
  return { ringSides: 4, legSides: 3, spikeSides: 3, spineStep: 3, joints: false, spikes: 'none', eyes: false };
}

/** Vertex arrays of an animal mesh: three vertices per triangle. */
export interface AnimalMeshData {
  readonly positions: Float32Array;
  readonly colors: Float32Array;
  /** Per vertex: part code (RIG), walk phase, trot phase, weight along the part. */
  readonly rig: Float32Array;
  /** Per vertex: the joint it turns about (hip, tail root, neck root). */
  readonly pivots: Float32Array;
  readonly triangles: number;
}

type Rgb = [number, number, number];

/** Small deterministic hash noise for the coat, from a point and the animal's seed (0 to 1). */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x8da6b343) ^ Math.imul(y | 0, 0xd8163841) ^ Math.imul(z | 0, 0xcb1ab31f) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise for patches (0 to 1). */
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const sz = fz * fz * (3 - 2 * fz);
  let v = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1;
    const dy = (c >> 1) & 1;
    const dz = (c >> 2) & 1;
    v += hash3(xi + dx, yi + dy, zi + dz, seed) * (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
  }
  return v;
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The coat's colours, as RGB. */
export interface Coat {
  readonly back: Rgb;
  readonly belly: Rgb;
  readonly pattern: Rgb;
  readonly accent: Rgb;
  readonly eye: Rgb;
}

export function coatOf(form: AnimalForm): Coat {
  return { back: hexToRgb(form.color), belly: hexToRgb(form.belly), pattern: hexToRgb(form.patternColor), accent: hexToRgb(form.accentColor), eye: hexToRgb(form.eyeColor) };
}

class Builder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  readonly rig: number[] = [];
  readonly pivots: number[] = [];
  constructor(
    readonly form: AnimalForm,
    readonly coat: Coat,
    readonly length: number,
  ) {}

  /** One triangle, its vertices' rigs given per vertex. */
  tri(a: Vec3, b: Vec3, c: Vec3, color: Rgb, rigs: readonly (readonly number[])[], pivots: readonly Vec3[]): void {
    for (const [i, p] of [a, b, c].entries()) {
      this.positions.push(p[0], p[1], p[2]);
      this.colors.push(color[0], color[1], color[2]);
      const r = rigs[i]!;
      this.rig.push(r[0]!, r[1]!, r[2]!, r[3]!);
      const q = pivots[i]!;
      this.pivots.push(q[0], q[1], q[2]);
    }
  }

  /** The coat's colour for a face at centroid `c` with normal `n`, on the body (patterned) or elsewhere (plain countershading). */
  coatColor(c: Vec3, n: Vec3, patterned: boolean): Rgb {
    const { coat, form, length: L } = this;
    // Countershading: the back's colour on faces looking up, the belly's on those looking down.
    const up = smoothstep(-0.45, 0.35, n[1]);
    const col: Rgb = [
      coat.belly[0] + (coat.back[0] - coat.belly[0]) * up,
      coat.belly[1] + (coat.back[1] - coat.belly[1]) * up,
      coat.belly[2] + (coat.back[2] - coat.belly[2]) * up,
    ];
    if (!patterned || form.pattern === 'plain' || n[1] < -0.35) return col;
    const k = form.patternScale / L;
    let mark = 0;
    if (form.pattern === 'stripes') {
      // Bands across the body, a little wavy.
      const s = Math.sin((c[2] * k * 2 + 0.25 * Math.sin(c[1] * k * 6)) * Math.PI * 2);
      mark = s > 0.35 ? 1 : 0;
    } else if (form.pattern === 'spots') {
      const q = k * 3;
      const x = c[0] * q;
      const y = c[1] * q;
      const z = c[2] * q;
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      const cz = Math.floor(z);
      const h = hash3(cx, cy, cz, form.seed);
      // A spot in about half the cells, somewhere in it.
      if (h < 0.55) {
        const ox = cx + 0.5 + (hash3(cx, cy, cz, form.seed ^ 0x51) - 0.5) * 0.4;
        const oy = cy + 0.5 + (hash3(cx, cy, cz, form.seed ^ 0x93) - 0.5) * 0.4;
        const oz = cz + 0.5 + (hash3(cx, cy, cz, form.seed ^ 0x27) - 0.5) * 0.4;
        mark = Math.hypot(x - ox, y - oy, z - oz) < 0.38 ? 1 : 0;
      }
    } else {
      mark = valueNoise(c[0] * k * 1.5, c[1] * k * 1.5, c[2] * k * 1.5, form.seed) > 0.55 ? 1 : 0;
    }
    if (!mark) return col;
    return [coat.pattern[0], coat.pattern[1], coat.pattern[2]];
  }

  build(): AnimalMeshData {
    const n = this.positions.length / 3;
    return {
      positions: new Float32Array(this.positions),
      colors: new Float32Array(this.colors),
      rig: new Float32Array(this.rig),
      pivots: new Float32Array(this.pivots),
      triangles: n / 3,
    };
  }
}

// --- Vector helpers ---

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
const centroid = (a: Vec3, b: Vec3, c: Vec3): Vec3 => [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
const faceNormal = (a: Vec3, b: Vec3, c: Vec3): Vec3 => normalize(cross(sub(b, a), sub(c, a)));

function rigOf(part: BodyPart, w: number): number[] {
  return [part === 'tail' ? RIG.tail : part === 'head' ? RIG.head : RIG.body, 0, 0, w];
}

/** The animal's mesh at level of detail `lod` (0 = full). */
export function buildAnimalMesh(skeleton: AnimalSkeleton, form: AnimalForm, length: number, lod: number): AnimalMeshData {
  const spec = animalLodSpec(lod);
  const b = new Builder(form, coatOf(form), length);
  const pivotOf = (part: BodyPart): Vec3 => (part === 'tail' ? skeleton.tailBase : part === 'head' ? skeleton.neckBase : [0, 0, 0]);
  skin(b, thinSpine(skeleton.spine, spec.spineStep), spec.ringSides, pivotOf);
  for (const leg of skeleton.legs) legTube(b, leg, spec, length);
  for (const spike of skeleton.spikes) {
    if (spec.spikes === 'none' || (spec.spikes === 'big' && (spike.kind === 'ear' || spike.kind === 'antenna'))) continue;
    spikeTube(b, spike, spec.spikeSides, pivotOf(spike.part));
  }
  if (spec.eyes) for (const e of skeleton.eyes) eye(b, e.centre, e.radius, lod === 0, skeleton.neckBase);
  return b.build();
}

/** Every `step`-th node of the torso and tail, keeping the ends and every node of the head. */
function thinSpine(spine: readonly SpineNode[], step: number): SpineNode[] {
  if (step <= 1) return [...spine];
  return spine.filter((s, i) => i === 0 || i === spine.length - 1 || s.part === 'head' || i % step === 0);
}

/** The body's skin: a ring round each spine node, joined into a tube and closed at both ends. */
function skin(b: Builder, spine: readonly SpineNode[], sides: number, pivotOf: (part: BodyPart) => Vec3): void {
  const rings: Vec3[][] = [];
  let side: Vec3 = [1, 0, 0];
  for (let i = 0; i < spine.length; i++) {
    const s = spine[i]!;
    const prev = spine[Math.max(0, i - 1)]!.p;
    const next = spine[Math.min(spine.length - 1, i + 1)]!.p;
    const t = normalize(sub(next, prev));
    // The ring's up is the world's up made square to the spine (the spine never points straight up).
    const upRaw: Vec3 = [0, 1, 0];
    side = normalize(cross(upRaw, t));
    if (!Number.isFinite(side[0])) side = [1, 0, 0];
    const up = normalize(cross(t, side));
    const ring: Vec3[] = [];
    for (let k = 0; k < sides; k++) {
      // Start at the top so the flat-shaded facets sit symmetrically.
      const a = (k / sides) * Math.PI * 2 + Math.PI / sides;
      const cx = Math.sin(a) * s.rx;
      const cy = Math.cos(a) * s.ry;
      ring.push(add(add(s.p, side, cx), up, cy));
    }
    rings.push(ring);
  }
  const rigs = spine.map((s) => rigOf(s.part, s.w));
  const pivots = spine.map((s) => pivotOf(s.part));
  for (let i = 0; i + 1 < rings.length; i++) {
    const r0 = rings[i]!;
    const r1 = rings[i + 1]!;
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      const a = r0[k]!;
      const c = r1[k]!;
      const d = r1[k1]!;
      const e = r0[k1]!;
      const patterned = spine[i]!.part !== 'head' || spine[i + 1]!.part !== 'head';
      b.tri(a, c, d, b.coatColor(centroid(a, c, d), faceNormal(a, c, d), patterned), [rigs[i]!, rigs[i + 1]!, rigs[i + 1]!], [pivots[i]!, pivots[i + 1]!, pivots[i + 1]!]);
      b.tri(a, d, e, b.coatColor(centroid(a, d, e), faceNormal(a, d, e), patterned), [rigs[i]!, rigs[i + 1]!, rigs[i]!], [pivots[i]!, pivots[i + 1]!, pivots[i]!]);
    }
  }
  // Caps: a point a little beyond each end.
  for (const end of [0, rings.length - 1]) {
    const s = spine[end]!;
    const inner = spine[end === 0 ? 1 : end - 1]!.p;
    const tip = add(s.p, normalize(sub(s.p, inner)), Math.min(s.rx, s.ry) * 0.6);
    const ring = rings[end]!;
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      const [a, c] = end === 0 ? [ring[k]!, ring[k1]!] : [ring[k1]!, ring[k]!];
      b.tri(a, c, tip, b.coatColor(centroid(a, c, tip), faceNormal(a, c, tip), false), [rigs[end]!, rigs[end]!, rigs[end]!], [pivots[end]!, pivots[end]!, pivots[end]!]);
    }
  }
}

/** A tapering tube along `points` (radius `radii` at each), `sides` round, closed at its far end; `color` per face from its share along it. */
function tube(
  b: Builder,
  points: readonly Vec3[],
  radii: readonly number[],
  sides: number,
  color: (t: number, c: Vec3, n: Vec3) => Rgb,
  rig: (p: Vec3, t: number) => number[],
  pivot: Vec3,
  flat = 1,
): void {
  const rings: Vec3[][] = [];
  const ts: number[] = [];
  let total = 0;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(...sub(points[i]!, points[i - 1]!));
    lengths.push(total);
  }
  let ref: Vec3 = [0, 1, 0];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const t = normalize(sub(next, prev));
    if (Math.abs(t[1]) > 0.9) ref = [0, 0, 1];
    const u = normalize(cross(ref, t));
    const v = normalize(cross(t, u));
    const ring: Vec3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      ring.push(add(add(points[i]!, u, Math.cos(a) * radii[i]!), v, Math.sin(a) * radii[i]! * flat));
    }
    rings.push(ring);
    ts.push(total > 0 ? lengths[i]! / total : 0);
  }
  const rigs = rings.map((r, i) => r.map((p) => rig(p, ts[i]!)));
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      const a = rings[i]![k]!;
      const c = rings[i + 1]![k]!;
      const d = rings[i + 1]![k1]!;
      const e = rings[i]![k1]!;
      const tm = (ts[i]! + ts[i + 1]!) / 2;
      b.tri(a, d, c, color(tm, centroid(a, d, c), faceNormal(a, d, c)), [rigs[i]![k]!, rigs[i + 1]![k1]!, rigs[i + 1]![k]!], [pivot, pivot, pivot]);
      b.tri(a, e, d, color(tm, centroid(a, e, d), faceNormal(a, e, d)), [rigs[i]![k]!, rigs[i]![k1]!, rigs[i + 1]![k1]!], [pivot, pivot, pivot]);
    }
  }
  // The far end closed with a fan to its centre.
  const last = rings.length - 1;
  const tip = points[last]!;
  const tipRig = rig(tip, 1);
  for (let k = 0; k < sides; k++) {
    const k1 = (k + 1) % sides;
    const a = rings[last]![k]!;
    const c = rings[last]![k1]!;
    b.tri(a, c, tip, color(1, centroid(a, c, tip), faceNormal(a, c, tip)), [rigs[last]![k]!, rigs[last]![k1]!, tipRig], [pivot, pivot, pivot]);
  }
}

/** A leg: a tube from the hip to the toe (or straight, at the far level), the coat on the upper leg, darker below and the accent at the foot. */
function legTube(b: Builder, leg: Leg, spec: AnimalLodSpec, length: number): void {
  const hip = leg.points[0]!;
  const points = spec.joints ? leg.points : [hip, leg.points[leg.points.length - 1]!];
  const radii = spec.joints ? leg.radii : [leg.radii[0]!, leg.radii[leg.radii.length - 1]!];
  // The foot sits a little into the ground so it never shows a gap, and carries the hoof or claws.
  const foot = points[points.length - 1]!;
  const pts = [...points.slice(0, -1), [foot[0], Math.max(0, foot[1] - length * 0.005), foot[2]] as Vec3];
  const part = leg.swing === 'sprawl' ? RIG.sprawl : RIG.pendulum;
  const hipY = Math.max(1e-4, hip[1]);
  const coat = b.coat;
  tube(
    b,
    pts,
    radii,
    spec.legSides,
    (t, c, n) => {
      if (t > 0.85) return coat.accent;
      const col = b.coatColor(c, n, t < 0.35);
      const dark = 1 - 0.25 * smoothstep(0.3, 0.8, t);
      return [col[0] * dark, col[1] * dark, col[2] * dark];
    },
    // Weight: how far down the leg (the foot lifts most), from its height under the hip.
    (p) => [part, leg.walk, leg.trot, leg.arm ? 0.5 : Math.min(1, Math.max(0, (hip[1] - p[1]) / hipY))],
    hip,
  );
}

/** A horn, ear, crest spine or antenna (ears flattened across). */
function spikeTube(b: Builder, spike: Spike, sides: number, pivot: Vec3): void {
  const coat = b.coat;
  const color = (t: number, c: Vec3, n: Vec3): Rgb => {
    if (spike.kind === 'horn') return [coat.accent[0] * (1 - 0.25 * t), coat.accent[1] * (1 - 0.25 * t), coat.accent[2] * (1 - 0.25 * t)];
    if (spike.kind === 'crest') return t > 0.5 ? coat.pattern : coat.back;
    if (spike.kind === 'ear') return n[2] > 0.3 ? coat.belly : coat.back;
    return b.coatColor(c, n, false);
  };
  const part = spike.part;
  tube(b, spike.points, spike.radii, sides, color, () => rigOf(part, spike.w), pivot, spike.kind === 'ear' ? 0.3 : 1);
}

/** An eye: an icosahedron (an octahedron further out), dark with the eye's colour on the faces looking out. */
function eye(b: Builder, centre: Vec3, radius: number, fine: boolean, neckBase: Vec3): void {
  const verts: Vec3[] = fine
    ? icosahedron()
    : [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
  const faces = fine ? ICO_FACES : OCTA_FACES;
  const rig = rigOf('head', 1);
  const out = normalize([centre[0], 0, 0.6]);
  for (const [i, j, k] of faces) {
    const a = add(centre, verts[i]!, radius);
    const c = add(centre, verts[j]!, radius);
    const d = add(centre, verts[k]!, radius);
    const n = faceNormal(a, c, d);
    const lookingOut = n[0] * out[0] + n[2] * out[2] > 0.55;
    const col: Rgb = lookingOut ? b.coat.eye : [0.04, 0.04, 0.05];
    b.tri(a, c, d, col, [rig, rig, rig], [neckBase, neckBase, neckBase]);
  }
}

const OCTA_FACES: readonly (readonly [number, number, number])[] = [
  [0, 2, 4],
  [2, 1, 4],
  [1, 3, 4],
  [3, 0, 4],
  [2, 0, 5],
  [1, 2, 5],
  [3, 1, 5],
  [0, 3, 5],
];

function icosahedron(): Vec3[] {
  const t = (1 + Math.sqrt(5)) / 2;
  const v: Vec3[] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1],
  ];
  return v.map(normalize);
}

const ICO_FACES: readonly (readonly [number, number, number])[] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];
