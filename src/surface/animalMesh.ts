import { hexToRgb } from '../gen/color';
import type { AnimalForm, AnimalSkeleton, BodyPart, Eye, Leg, Mouth, SpineNode, Spike, Vec3 } from '../gen/animalForm';

/*
 * An animal's mesh at each level of detail, from its skeleton
 * (gen/animalForm.ts). Pure (no THREE), so triangle counts are unit-tested;
 * animalLook.ts turns the arrays into geometry and plays the walk.
 *
 * Soft and round, unlike the game's faceted rocks: the body is a skin of
 * rings round the spine (an ellipse at each node) joined into one tube and
 * closed by a dome at the snout and the tail's tip; legs, horns, ears,
 * antennae and crest spines are tapering tubes ending in domes (legs in
 * round paws, antennae in a bobble); eyes are spheres with an iris, a pupil
 * and a highlight. Every vertex has a smooth normal, worked out from the
 * surface it lies on (so lighting rolls round the body instead of showing
 * its rings), and its colour: the coat countershaded by which way the
 * vertex looks (the back's colour over the belly's). The coat's pattern is
 * drawn per pixel by the material from the rest-pose position, where
 * `coat` is 1.
 *
 * Every vertex also carries its rig, read by the vertex shader: which part
 * it belongs to (body, a leg swinging fore and aft or sprawling, the tail,
 * the head and neck), the leg's gait phases, how far along its part it is,
 * and the joint it turns about. Going down a level: fewer sides, rings and
 * dome steps, small spikes and then the eyes go, legs become one straight tube.
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
  /** Rings in each end's dome (0: a single point). */
  readonly domeSteps: number;
  /** Legs keep all their joints, or go straight from the hip to the toe. */
  readonly joints: boolean;
  /** Spikes kept: all, only the big ones (horns, crest, ears), or none. */
  readonly spikes: 'all' | 'big' | 'none';
  /** Eyes: with iris, pupil and highlight, a plain eyeball and pupil, or none. */
  readonly eyes: 'full' | 'simple' | 'none';
}

export function animalLodSpec(lod: number): AnimalLodSpec {
  if (lod <= 0) return { ringSides: 14, legSides: 8, spikeSides: 6, spineStep: 1, domeSteps: 3, joints: true, spikes: 'all', eyes: 'full' };
  if (lod === 1) return { ringSides: 8, legSides: 5, spikeSides: 4, spineStep: 2, domeSteps: 1, joints: true, spikes: 'big', eyes: 'simple' };
  return { ringSides: 5, legSides: 3, spikeSides: 3, spineStep: 3, domeSteps: 0, joints: false, spikes: 'none', eyes: 'none' };
}

/** Vertex arrays of an animal mesh: three vertices per triangle. */
export interface AnimalMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly colors: Float32Array;
  /** Per vertex: part code (RIG), walk phase, trot phase, weight along the part. */
  readonly rig: Float32Array;
  /** Per vertex: the joint it turns about (hip, tail root, neck root). */
  readonly pivots: Float32Array;
  /** Per vertex: 1 where the coat's pattern is drawn (body, neck, tail, upper legs), 0 elsewhere. */
  readonly coat: Float32Array;
  readonly triangles: number;
}

type Rgb = [number, number, number];

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

/** A hex colour's channels in linear light, as the renderer wants vertex colours (so the coat shows the colour picked). */
export function linearRgb(hex: string): Rgb {
  return hexToRgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as Rgb;
}

export function coatOf(form: AnimalForm): Coat {
  return { back: linearRgb(form.color), belly: linearRgb(form.belly), pattern: linearRgb(form.patternColor), accent: linearRgb(form.accentColor), eye: linearRgb(form.eyeColor) };
}

/** The countershaded coat at a vertex looking along `n`: the back's colour looking up, the belly's looking down. */
export function countershade(coat: Coat, n: Vec3): Rgb {
  const up = smoothstep(-0.55, 0.45, n[1]);
  return [
    coat.belly[0] + (coat.back[0] - coat.belly[0]) * up,
    coat.belly[1] + (coat.back[1] - coat.belly[1]) * up,
    coat.belly[2] + (coat.back[2] - coat.belly[2]) * up,
  ];
}

// --- Vector helpers ---

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function centroidOf(pts: readonly Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const p of pts) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
}

/** What a ring of a surface carries to its vertices. */
interface RingInfo {
  readonly rig: readonly number[];
  readonly pivot: Vec3;
  readonly coat: number;
}

/** One vertex as written. */
interface Vertex {
  p: Vec3;
  n: Vec3;
  c: Rgb;
  rig: readonly number[];
  pivot: Vec3;
  coat: number;
}

class Builder {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly rig: number[] = [];
  readonly pivots: number[] = [];
  readonly coats: number[] = [];
  constructor(
    readonly form: AnimalForm,
    readonly coat: Coat,
    readonly length: number,
  ) {}

  /** A triangle, wound so its face looks the way its vertices' normals do. */
  tri(a: Vertex, b: Vertex, c: Vertex): void {
    const face = cross(sub(b.p, a.p), sub(c.p, a.p));
    const avg = add(add(a.n, b.n), c.n);
    const verts = dot(face, avg) >= 0 ? [a, b, c] : [a, c, b];
    for (const v of verts) {
      this.positions.push(v.p[0], v.p[1], v.p[2]);
      this.normals.push(v.n[0], v.n[1], v.n[2]);
      this.colors.push(v.c[0], v.c[1], v.c[2]);
      this.rig.push(v.rig[0]!, v.rig[1]!, v.rig[2]!, v.rig[3]!);
      this.pivots.push(v.pivot[0], v.pivot[1], v.pivot[2]);
      this.coats.push(v.coat);
    }
  }

  /**
   * A smooth surface through `rings` (each the same number of points, in
   * order round it), closed at each end by a dome of `domeSteps` rings
   * bulging `domes[i]` beyond it (0: left open). Normals come from the grid
   * (along the rings and round them), turned to look away from each ring's
   * centre; colours from `color` at each vertex.
   */
  surface(rings: Vec3[][], info: RingInfo[], domes: readonly [number, number], domeSteps: number, color: (p: Vec3, n: Vec3, ring: number) => Rgb): void {
    const all: Vec3[][] = [];
    const allInfo: RingInfo[] = [];
    const tips: (Vec3 | null)[] = [null, null];
    // The start's dome, from its tip in to the first ring.
    const domeOf = (end: 0 | 1): Vec3[][] => {
      const h = domes[end];
      if (h <= 0) return [];
      const ring = end === 0 ? rings[0]! : rings[rings.length - 1]!;
      const next = end === 0 ? rings[1] ?? ring : rings[rings.length - 2] ?? ring;
      const c = centroidOf(ring);
      const axis = normalize(sub(c, centroidOf(next)));
      tips[end] = add(c, axis, h);
      const out: Vec3[][] = [];
      for (let j = 1; j <= domeSteps; j++) {
        const th = (j / (domeSteps + 1)) * (Math.PI / 2);
        out.push(ring.map((p) => add(add(c, sub(p, c), Math.cos(th)), axis, h * Math.sin(th))));
      }
      return out;
    };
    const startDome = domeOf(0).reverse();
    const endDome = domeOf(1);
    for (const r of startDome) {
      all.push(r);
      allInfo.push(info[0]!);
    }
    rings.forEach((r, i) => {
      all.push(r);
      allInfo.push(info[i]!);
    });
    for (const r of endDome) {
      all.push(r);
      allInfo.push(info[info.length - 1]!);
    }
    const n = all[0]!.length;
    const centres = all.map(centroidOf);
    const verts: Vertex[][] = all.map((ring, i) =>
      ring.map((p, k) => {
        const along = sub(all[Math.min(all.length - 1, i + 1)]![k]!, all[Math.max(0, i - 1)]![k]!);
        const around = sub(ring[(k + 1) % n]!, ring[(k + n - 1) % n]!);
        let nn = normalize(cross(along, around));
        if (dot(nn, sub(p, centres[i]!)) < 0) nn = [-nn[0], -nn[1], -nn[2]];
        // Where the rings shrink to nothing (a dome's last ring), lean on the axis.
        if (!Number.isFinite(nn[0]) || Math.hypot(...around) < 1e-9) nn = normalize(sub(p, centres[i]!));
        const ri = allInfo[i]!;
        return { p, n: nn, c: color(p, nn, i - startDome.length), rig: ri.rig, pivot: ri.pivot, coat: ri.coat };
      }),
    );
    for (let i = 0; i + 1 < verts.length; i++) {
      for (let k = 0; k < n; k++) {
        const k1 = (k + 1) % n;
        this.tri(verts[i]![k]!, verts[i + 1]![k]!, verts[i + 1]![k1]!);
        this.tri(verts[i]![k]!, verts[i + 1]![k1]!, verts[i]![k1]!);
      }
    }
    // The tips: a fan from each dome's last ring (or the end ring, flat, when it has no dome).
    for (const end of [0, 1] as const) {
      const ringVerts = end === 0 ? verts[0]! : verts[verts.length - 1]!;
      const c = centroidOf(ringVerts.map((v) => v.p));
      const tip = tips[end];
      const inner = end === 0 ? centres[Math.min(1, centres.length - 1)]! : centres[Math.max(0, centres.length - 2)]!;
      const axis = normalize(sub(c, inner));
      const at = tip ?? c;
      const ri = end === 0 ? allInfo[0]! : allInfo[allInfo.length - 1]!;
      const tv: Vertex = { p: at, n: axis, c: color(at, axis, end === 0 ? -1 : rings.length), rig: ri.rig, pivot: ri.pivot, coat: ri.coat };
      for (let k = 0; k < n; k++) this.tri(ringVerts[k]!, ringVerts[(k + 1) % n]!, tv);
    }
  }

  /**
   * A sphere (an icosahedron, subdivided `detail` times) of colour `color`,
   * all of it moving with `rig`, squashed along unit `axis` to `squash` of
   * its radius (a lens, for an iris or pupil).
   */
  sphere(centre: Vec3, radius: number, detail: number, color: Rgb, rig: readonly number[], pivot: Vec3, axis: Vec3 = [0, 1, 0], squash = 1): void {
    for (const [a, b, c] of icosphere(detail)) {
      const vert = (d: Vec3): Vertex => {
        const along = dot(d, axis);
        const p = add(add(centre, d, radius), axis, along * radius * (squash - 1));
        const n = normalize(add(d, axis, along * (1 / squash - 1)));
        return { p, n, c: color, rig, pivot, coat: 0 };
      };
      this.tri(vert(a), vert(b), vert(c));
    }
  }

  /** An ellipsoid: the unit sphere stretched to `radii` along the three unit axes. */
  ellipsoid(centre: Vec3, axes: readonly [Vec3, Vec3, Vec3], radii: readonly [number, number, number], detail: number, color: Rgb, rig: readonly number[], pivot: Vec3): void {
    for (const [a, b, c] of icosphere(detail)) {
      const vert = (d: Vec3): Vertex => {
        let p = centre;
        let n: Vec3 = [0, 0, 0];
        for (let i = 0; i < 3; i++) {
          p = add(p, axes[i]!, d[i]! * radii[i]!);
          n = add(n, axes[i]!, d[i]! / radii[i]!);
        }
        return { p, n: normalize(n), c: color, rig, pivot, coat: 0 };
      };
      this.tri(vert(a), vert(b), vert(c));
    }
  }

  build(): AnimalMeshData {
    const n = this.positions.length / 3;
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      rig: new Float32Array(this.rig),
      pivots: new Float32Array(this.pivots),
      coat: new Float32Array(this.coats),
      triangles: n / 3,
    };
  }
}

function rigOf(part: BodyPart, w: number): number[] {
  return [part === 'tail' ? RIG.tail : part === 'head' ? RIG.head : RIG.body, 0, 0, w];
}

/** The animal's mesh at level of detail `lod` (0 = full). */
export function buildAnimalMesh(skeleton: AnimalSkeleton, form: AnimalForm, length: number, lod: number): AnimalMeshData {
  const spec = animalLodSpec(lod);
  const b = new Builder(form, coatOf(form), length);
  const pivotOf = (part: BodyPart): Vec3 => (part === 'tail' ? skeleton.tailBase : part === 'head' ? skeleton.neckBase : [0, 0, 0]);
  skin(b, thinSpine(skeleton.spine, spec.spineStep), spec, pivotOf);
  for (const leg of skeleton.legs) legTube(b, leg, spec);
  for (const spike of skeleton.spikes) {
    if (spec.spikes === 'none' || (spec.spikes === 'big' && spike.kind === 'antenna')) continue;
    spikeTube(b, spike, spec, pivotOf(spike.part));
  }
  if (spec.eyes !== 'none') for (const e of skeleton.eyes) eye(b, e, spec.eyes === 'full', skeleton.neckBase);
  for (const m of skeleton.mouths ?? []) mouth(b, m, spec, skeleton.neckBase);
  return b.build();
}

/** Every `step`-th node of the torso and tail, keeping the ends and every node of the head. */
function thinSpine(spine: readonly SpineNode[], step: number): SpineNode[] {
  if (step <= 1) return [...spine];
  return spine.filter((s, i) => i === 0 || i === spine.length - 1 || s.part === 'head' || i % step === 0);
}

/** The body's skin: a ring round each spine node, one smooth tube domed at both ends. */
function skin(b: Builder, spine: readonly SpineNode[], spec: AnimalLodSpec, pivotOf: (part: BodyPart) => Vec3): void {
  const sides = spec.ringSides;
  const rings: Vec3[][] = [];
  for (let i = 0; i < spine.length; i++) {
    const s = spine[i]!;
    const prev = spine[Math.max(0, i - 1)]!.p;
    const next = spine[Math.min(spine.length - 1, i + 1)]!.p;
    const t = normalize(sub(next, prev));
    // The ring's up is the world's up made square to the spine (a generated spine never points straight up);
    // a spine that may curl over itself carries its own sideways axis instead.
    let side = s.side ? normalize(add(s.side, t, -dot(s.side, t))) : normalize(cross([0, 1, 0], t));
    if (!Number.isFinite(side[0])) side = [1, 0, 0];
    const up = normalize(cross(t, side));
    const ring: Vec3[] = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      ring.push(add(add(s.p, side, Math.sin(a) * s.rx), up, Math.cos(a) * s.ry));
    }
    rings.push(ring);
  }
  const info = spine.map((s) => ({ rig: rigOf(s.part, s.w), pivot: pivotOf(s.part), coat: 1 }));
  const first = spine[0]!;
  const last = spine[spine.length - 1]!;
  b.surface(rings, info, [Math.min(first.rx, first.ry) * 0.9, Math.min(last.rx, last.ry) * 0.9], spec.domeSteps, (_p, n) => countershade(b.coat, n));
}

/** Rings of a tube along `points` with radii `radii`, `sides` round (squashed across by `flat`). */
function tubeRings(points: readonly Vec3[], radii: readonly number[], sides: number, flat = 1): Vec3[][] {
  const rings: Vec3[][] = [];
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
  }
  return rings;
}

/** Shares along a polyline, 0 at its start to 1 at its end. */
function along(points: readonly Vec3[]): number[] {
  const d = [0];
  for (let i = 1; i < points.length; i++) d.push(d[i - 1]! + Math.hypot(...sub(points[i]!, points[i - 1]!)));
  const total = d[d.length - 1]! || 1;
  return d.map((x) => x / total);
}

/** A leg: a tube from the hip to a round paw, the coat on the upper leg, darker below, the accent on the paw. */
function legTube(b: Builder, leg: Leg, spec: AnimalLodSpec): void {
  const hip = leg.points[0]!;
  const points = spec.joints ? leg.points : [hip, leg.points[leg.points.length - 1]!];
  const radii = spec.joints ? leg.radii : [leg.radii[0]!, leg.radii[leg.radii.length - 1]!];
  const part = leg.swing === 'sprawl' ? RIG.sprawl : RIG.pendulum;
  const hipY = Math.max(1e-4, hip[1]);
  const shares = along(points);
  const info = points.map((p, i) => ({
    // Weight: how far down the leg (the foot lifts most), from its height under the hip.
    rig: [part, leg.walk, leg.trot, leg.arm ? 0.5 : Math.min(1, Math.max(0, (hip[1] - p[1]) / hipY))],
    pivot: hip,
    coat: shares[i]! < 0.4 ? 1 : 0,
  }));
  const coat = b.coat;
  const paw = radii[radii.length - 1]!;
  b.surface(tubeRings(points, radii, spec.legSides), info, [0, paw], spec.domeSteps, (_p, n, ring) => {
    if (ring >= points.length - 1) return coat.accent;
    const t = shares[Math.max(0, Math.min(points.length - 1, ring))]!;
    const col = countershade(coat, n);
    const dark = 1 - 0.18 * smoothstep(0.35, 0.85, t);
    return [col[0] * dark, col[1] * dark, col[2] * dark];
  });
}

/** A horn, ear, crest spine or antenna (ears flattened across), domed at the tip; an antenna ends in a bobble. */
function spikeTube(b: Builder, spike: Spike, spec: AnimalLodSpec, pivot: Vec3): void {
  const coat = b.coat;
  const shares = along(spike.points);
  const color = (_p: Vec3, n: Vec3, ring: number): Rgb => {
    const t = shares[Math.max(0, Math.min(shares.length - 1, ring))] ?? 1;
    if (spike.kind === 'horn') return [coat.accent[0] * (1 - 0.2 * t), coat.accent[1] * (1 - 0.2 * t), coat.accent[2] * (1 - 0.2 * t)];
    if (spike.kind === 'crest') return t > 0.4 ? coat.pattern : coat.back;
    // An ear's inside (facing forward) is the belly's colour.
    if (spike.kind === 'ear') return n[2] > 0.25 ? coat.belly : countershade(coat, n);
    return countershade(coat, n);
  };
  const rig = rigOf(spike.part, spike.w);
  const info = spike.points.map(() => ({ rig, pivot, coat: 0 }));
  const tipR = spike.radii[spike.radii.length - 1]!;
  b.surface(tubeRings(spike.points, spike.radii, spec.spikeSides, spike.kind === 'ear' ? 0.35 : 1), info, [0, tipR], spec.domeSteps, color);
  if (spike.kind === 'antenna') b.sphere(spike.points[spike.points.length - 1]!, tipR * 3, spec.domeSteps > 1 ? 1 : 0, coat.pattern, rig, pivot);
}

/**
 * An eye: a white eyeball sunk into the head, with an iris of the eye's
 * colour, a dark pupil and a highlight looking out of it (the big, bright
 * eyes that read as cute); further out a dark eyeball with a light pupil dot.
 */
function eye(b: Builder, e: Eye, full: boolean, neckBase: Vec3): void {
  const rig = rigOf('head', 1);
  const r = e.radius;
  const out = e.look;
  if (!full) {
    b.sphere(e.centre, r, 0, [0.9, 0.9, 0.86], rig, neckBase);
    b.sphere(add(e.centre, out, r * 0.9), r * 0.5, 0, [0.01, 0.01, 0.012], rig, neckBase, out, 0.35);
    return;
  }
  b.sphere(e.centre, r, 1, [0.9, 0.9, 0.86], rig, neckBase);
  // Iris and pupil: lenses on the eyeball's front, each just proud of the one behind.
  b.sphere(add(e.centre, out, r * 0.86), r * 0.64, 1, b.coat.eye, rig, neckBase, out, 0.3);
  b.sphere(add(e.centre, out, r * 0.97), r * 0.36, 1, [0.01, 0.01, 0.012], rig, neckBase, out, 0.3);
  // A highlight up and to the side of the pupil.
  const up = normalize(sub([0, 1, 0], [out[0] * out[1], out[1] * out[1], out[2] * out[1]]));
  b.sphere(add(add(e.centre, out, r * 1.04), up, r * 0.24), r * 0.13, 0, [1, 1, 1], rig, neckBase);
}

/**
 * A mouth: a dark opening (an ellipsoid sunk into the skin) between two
 * lips (tubes along the mouth's curve, in the coat's colour, a little
 * darker), the lower lip dropping as it opens, and a row of small teeth
 * along each lip. Further out, just the opening and the lips, thinner.
 */
function mouth(b: Builder, m: Mouth, spec: AnimalLodSpec, pivot: Vec3): void {
  const rig = rigOf('head', 1);
  const w = m.width;
  const half = w / 2;
  const curve = (u: number) => m.smile * w * 0.2 * u * u;
  const gap = m.open * w * 0.45;
  const lipR = w * 0.07;
  const steps = spec.ringSides >= 14 ? 8 : 4;
  const lip = (upper: boolean): Vec3[] => {
    const pts: Vec3[] = [];
    for (let i = 0; i <= steps; i++) {
      const u = (i / steps) * 2 - 1;
      // The lips part in the middle and meet at the corners.
      const y = curve(u) + (upper ? gap * 0.15 : -gap * 0.85) * (1 - u * u);
      pts.push(add(add(add(m.centre, m.across, u * half), m.up, y), m.out, lipR * 0.4));
    }
    return pts;
  };
  // The opening: dark, as deep as the mouth is open, a sliver when shut.
  const mid = add(add(m.centre, m.up, -gap * 0.35), m.out, -w * 0.17);
  b.ellipsoid(mid, [m.across, m.up, m.out], [half * 0.92, Math.max(lipR * 0.8, gap * 0.55 + lipR * 0.5), w * 0.2], spec.domeSteps > 1 ? 1 : 0, [0.09, 0.015, 0.025], rig, pivot);
  const coat = b.coat;
  for (const upper of [true, false]) {
    const pts = lip(upper);
    const radii = pts.map((_, i) => lipR * (0.55 + 0.45 * Math.sin((Math.PI * i) / steps)));
    const info = pts.map(() => ({ rig, pivot, coat: 0 }));
    b.surface(tubeRings(pts, radii, Math.max(4, spec.spikeSides)), info, [lipR * 0.5, lipR * 0.5], spec.domeSteps, (_p, n) => {
      const c = countershade(coat, n);
      return [c[0] * 0.78, c[1] * 0.72, c[2] * 0.75];
    });
    // (Teeth whatever the opening, so the mesh's topology stays the same as the mouth opens and shuts.)
    if (m.teeth && spec.spikes !== 'none') {
      // Small pointed teeth along the lip, pointing into the mouth.
      const n = Math.max(2, Math.round(steps * 0.75));
      for (let k = 0; k < n; k++) {
        const u = ((k + 0.5) / n) * 1.4 - 0.7;
        const at = Math.min(steps, Math.max(0, Math.round(((u + 1) / 2) * steps)));
        // From the lip's inner edge, so they show below it.
        const base = add(add(pts[at]!, m.up, upper ? -lipR * 0.6 : lipR * 0.6), m.out, lipR * 0.85);
        const len = Math.max(w * 0.06, Math.min(gap * 0.5, w * 0.15)) * (1 - 0.35 * Math.abs(u));
        const tip = add(base, m.up, upper ? -len : len);
        const tr = w * 0.045;
        b.surface(tubeRings([base, tip], [tr, tr * 0.15], 4), [{ rig, pivot, coat: 0 }, { rig, pivot, coat: 0 }], [0, tr * 0.15], 1, () => [0.93, 0.9, 0.8]);
      }
    }
  }
}

// --- Icospheres ---

const icoCache = new Map<number, [Vec3, Vec3, Vec3][]>();

/** The unit icosahedron's faces, each split into four `detail` times and pushed out onto the sphere. */
export function icosphere(detail: number): [Vec3, Vec3, Vec3][] {
  const cached = icoCache.get(detail);
  if (cached) return cached;
  const t = (1 + Math.sqrt(5)) / 2;
  const v: Vec3[] = (
    [
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
    ] as Vec3[]
  ).map(normalize);
  let faces: [Vec3, Vec3, Vec3][] = ICO_FACES.map(([a, b, c]) => [v[a]!, v[b]!, v[c]!]);
  for (let d = 0; d < detail; d++) {
    const next: [Vec3, Vec3, Vec3][] = [];
    for (const [a, b, c] of faces) {
      const ab = normalize(add(a, b));
      const bc = normalize(add(b, c));
      const ca = normalize(add(c, a));
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    faces = next;
  }
  icoCache.set(detail, faces);
  return faces;
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
