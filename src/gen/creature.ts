import { COAT_PATTERNS, growAnimal, type AnimalForm, type AnimalSkeleton, type CoatPattern, type Eye, type Leg, type SpineNode, type Spike, type Vec3 } from './animalForm';
import { animalGait } from './animals';
import { hslToHex } from './color';
import { REST_POSE, bodyBob, breath, dutyFactor, footPath, legPhase, solveTwoBone, spineSway, type CreaturePose } from './creatureMotion';
import { Rng } from './rng';

/*
 * A creature from the creature editor (creature.html): Spore's creature
 * creator on top of the animal lab's body (docs/research/creature-editor.md).
 * Pure data, no THREE.
 *
 * A `CreatureDesign` is what the player shapes: a spine of vertebrae in the
 * body's middle plane (each with its girth, dragged about and fattened with
 * the wheel, as in Spore), parts stuck on the skin (legs, arms, eyes, horns,
 * ears, spikes, antennae), the coat's paint and brush strokes. Parts and
 * strokes are anchored to the spine, not to space: a part is an (s, θ) on
 * the skin (how far along the spine, which way round it), so when the spine
 * is reshaped every part rides along, as Spore keeps a body's offset in a
 * frame carried along its spine spline.
 *
 * `growCreature` turns a design (and a pose: see gen/creatureMotion.ts)
 * into the animal lab's `AnimalSkeleton`, so the game's own mesh builder
 * (surface/animalMesh.ts) skins it: the spine smoothed by a Catmull-Rom
 * spline into rings, limbs as jointed tubes from IK, spikes and eyes.
 */

export const MIN_VERTEBRAE = 3;
export const MAX_VERTEBRAE = 20;
/** Spine rings per vertebra gap. */
export const SPINE_SUBDIVISIONS = 4;
/** Splats of paint a creature can carry (the material reads them all per pixel). */
export const MAX_SPLATS = 400;
/** How far past either end of the spine (in s) an anchor reaches over the end's dome to its tip. */
export const CAP = 0.06;

/** A vertebra: where it is in the body's middle plane (x = 0), its radius (half the body's height) and width against height. */
export interface Vertebra {
  y: number;
  z: number;
  r: number;
  w: number;
}

export type PartKind = 'leg' | 'arm' | 'eye' | 'horn' | 'ear' | 'spike' | 'antenna';
export const PART_KINDS: readonly PartKind[] = ['leg', 'arm', 'eye', 'horn', 'ear', 'spike', 'antenna'];

/** A part on the skin. */
export interface CreaturePart {
  kind: PartKind;
  /** Along the spine: 0 the tail's tip, 1 the snout (a little past either end is over the end's dome, up to CAP). */
  s: number;
  /** Round the body: 0 on top, π/2 the left side (+x), π underneath. */
  theta: number;
  /** Scale, 1 the usual size for its place on the body. */
  size: number;
  /** −1 to 1: a horn's or spike's lean back or forward, a foot's or hand's place behind or ahead of its hip. */
  tilt: number;
  /** 0 to 1: how far out to the side a foot or hand stands (a sprawl). */
  spread: number;
  /** A pair, mirrored across the middle (parts on the middle line are single anyway). */
  mirror: boolean;
  /**
   * A limb's middle joint (a leg's knee, an arm's elbow) and its end (the
   * foot, the hand), as offsets from where it leaves the body: [out from
   * the body's middle, up, forward] in units, so the mirrored limb mirrors
   * them. A foot always stands on the ground (its `up` is ignored). Unset,
   * the limb stands or hangs as its size, reach and sprawl say
   * (`defaultLimbNodes`).
   */
  joint?: Vec3;
  end?: Vec3;
}

export interface CreaturePaint {
  /** The back's colour, the belly's (countershading), the pattern's, horns' and claws', the eyes'. */
  base: string;
  belly: string;
  pattern: CoatPattern;
  patternColor: string;
  /** Stripes or spots per body length. */
  patternScale: number;
  accent: string;
  eye: string;
}

/** A brush stroke's dab: a soft round of colour, anchored to the spine at `s` and offset in its frame (side, up, along). */
export interface PaintSplat {
  s: number;
  off: Vec3;
  radius: number;
  color: string;
  /** Also painted on the other side. */
  mirror?: boolean;
  /** Share of the radius painted solid before the edge softens (0 soft to 1 hard). */
  hardness?: number;
}

export interface CreatureDesign {
  name: string;
  /** Tail's tip first, snout last; z rises along it. */
  spine: Vertebra[];
  parts: CreaturePart[];
  paint: CreaturePaint;
  splats: PaintSplat[];
  /** The coat pattern's random stream. */
  seed: number;
}

// --- Vectors ---

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// --- The spine ---

/** A point of the smoothed spine: where, its half-width and half-height, and its s. */
export interface SpineSample {
  p: Vec3;
  rx: number;
  ry: number;
  s: number;
}

function catmull(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t2 * t);
}

/** The spine smoothed through its vertebrae (a Catmull-Rom spline, the ends extended straight), `sub` samples per gap. */
export function sampleSpine(spine: readonly Vertebra[], sub = SPINE_SUBDIVISIONS): SpineSample[] {
  const n = spine.length;
  const v = (i: number): Vertebra => {
    if (i < 0) {
      const a = spine[0]!;
      const b = spine[Math.min(1, n - 1)]!;
      return { y: 2 * a.y - b.y, z: 2 * a.z - b.z, r: a.r, w: a.w };
    }
    if (i > n - 1) {
      const a = spine[n - 1]!;
      const b = spine[Math.max(0, n - 2)]!;
      return { y: 2 * a.y - b.y, z: 2 * a.z - b.z, r: a.r, w: a.w };
    }
    return spine[i]!;
  };
  const out: SpineSample[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = v(i - 1);
    const b = v(i);
    const c = v(i + 1);
    const d = v(i + 2);
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      // The radius can overshoot on a spline: keep it near the smaller of its two vertebrae at least.
      const r = Math.max(Math.min(b.r, c.r) * 0.6, catmull(a.r, b.r, c.r, d.r, t));
      const w = Math.max(0.3, catmull(a.w, b.w, c.w, d.w, t));
      out.push({ p: [0, catmull(a.y, b.y, c.y, d.y, t), catmull(a.z, b.z, c.z, d.z, t)], rx: r * w, ry: r, s: (i + t) / (n - 1) });
    }
  }
  const last = spine[n - 1]!;
  out.push({ p: [0, last.y, last.z], rx: last.r * last.w, ry: last.r, s: 1 });
  return out;
}

/** A spine sample with its frame: along the spine, out to the left side, up (as the skin's rings are laid out). */
export interface SpineFrame extends SpineSample {
  t: Vec3;
  side: Vec3;
  up: Vec3;
}

/** Frames along a spine, built exactly as surface/animalMesh.ts lays its rings, so points on them lie on the skin. */
export function spineFrames(samples: readonly SpineSample[]): SpineFrame[] {
  return samples.map((q, i) => {
    const prev = samples[Math.max(0, i - 1)]!.p;
    const next = samples[Math.min(samples.length - 1, i + 1)]!.p;
    const t = normalize(sub(next, prev));
    let side = normalize(cross([0, 1, 0], t));
    if (!Number.isFinite(side[0]) || Math.hypot(...cross([0, 1, 0], t)) < 1e-9) side = [1, 0, 0];
    const up = normalize(cross(t, side));
    return { ...q, t, side, up };
  });
}

/** The frame at `s` (clamped to the spine), between its samples. */
export function frameAt(frames: readonly SpineFrame[], s: number): SpineFrame {
  const f = clamp(s, 0, 1) * (frames.length - 1);
  const i = Math.min(frames.length - 2, Math.floor(f));
  const a = frames[i]!;
  const b = frames[i + 1]!;
  const t = f - i;
  return {
    p: lerp3(a.p, b.p, t),
    rx: lerp(a.rx, b.rx, t),
    ry: lerp(a.ry, b.ry, t),
    s: lerp(a.s, b.s, t),
    t: normalize(lerp3(a.t, b.t, t)),
    side: normalize(lerp3(a.side, b.side, t)),
    up: normalize(lerp3(a.up, b.up, t)),
  };
}

/** The height of the dome closing an end (as animalMesh.ts domes the skin). */
function domeHeight(f: SpineSample): number {
  return Math.min(f.rx, f.ry) * 0.9;
}

/** A point on the skin at (s, θ), with the skin's outward normal and the local body radius there. */
export function skinPoint(frames: readonly SpineFrame[], s: number, theta: number): { p: Vec3; n: Vec3; r: number; t: Vec3 } {
  const f = frameAt(frames, s);
  const over = s > 1 ? s - 1 : s < 0 ? -s : 0;
  const end = s < 0 ? -1 : 1;
  const phi = (clamp(over / CAP, 0, 1) * Math.PI) / 2;
  const h = domeHeight(f);
  const si = Math.sin(theta);
  const co = Math.cos(theta);
  const radial = add(add([0, 0, 0], f.side, si * f.rx), f.up, co * f.ry);
  const p = add(add(f.p, radial, Math.cos(phi)), f.t, end * h * Math.sin(phi));
  const n = normalize(add(add(add([0, 0, 0], f.side, (si / f.rx) * Math.cos(phi)), f.up, (co / f.ry) * Math.cos(phi)), f.t, (end * Math.sin(phi)) / h));
  return { p, n, r: (f.rx + f.ry) / 2, t: f.t };
}

/** The (s, θ) of the skin nearest `point` (a point on or near the skin, e.g. where the pointer hit it). */
export function anchorOf(frames: readonly SpineFrame[], point: Vec3): { s: number; theta: number } {
  let best = 0;
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i + 1 < frames.length; i++) {
    const a = frames[i]!.p;
    const ab = sub(frames[i + 1]!.p, a);
    const l2 = dot(ab, ab) || 1;
    const t = clamp(dot(sub(point, a), ab) / l2, 0, 1);
    const q = add(a, ab, t);
    // Distance measured in the body's radius there, so a fat torso's skin isn't claimed by a thin neck nearby.
    const r = lerp(Math.min(frames[i]!.rx, frames[i]!.ry), Math.min(frames[i + 1]!.rx, frames[i + 1]!.ry), t);
    const d = Math.hypot(...sub(point, q)) / Math.max(1e-3, r);
    if (d < bestD) {
      bestD = d;
      best = i;
      bestT = t;
    }
  }
  let s = lerp(frames[best]!.s, frames[best + 1]!.s, bestT);
  // Slide along to the ring whose plane holds the point (a bent spine's rings fan out from its inside).
  for (let k = 0; k < 4; k++) {
    const g = frameAt(frames, s);
    const i = Math.min(frames.length - 2, Math.floor(clamp(s, 0, 1) * (frames.length - 1)));
    const perS = Math.hypot(...sub(frames[i + 1]!.p, frames[i]!.p)) / Math.max(1e-6, frames[i + 1]!.s - frames[i]!.s);
    s = clamp(s + dot(sub(point, g.p), g.t) / Math.max(1e-6, perS), 0, 1);
  }
  const f = frameAt(frames, s);
  const d = sub(point, f.p);
  const theta = Math.atan2(dot(d, f.side) / f.rx, dot(d, f.up) / f.ry);
  // Past an end: over its dome.
  if (s >= 1 - 1e-6 || s <= 1e-6) {
    const end = s > 0.5 ? 1 : -1;
    const along = dot(d, f.t) * end;
    if (along > 0) {
      const phi = Math.asin(clamp(along / domeHeight(f), 0, 1));
      s = end > 0 ? 1 + (CAP * phi) / (Math.PI / 2) : -(CAP * phi) / (Math.PI / 2);
    }
  }
  return { s, theta };
}

/** A brush dab at `point` (rest pose), anchored to the spine. */
export function splatAt(frames: readonly SpineFrame[], point: Vec3, radius: number, color: string, mirror = false, hardness = 0.55): PaintSplat {
  const { s } = anchorOf(frames, point);
  const sc = clamp(s, 0, 1);
  const f = frameAt(frames, sc);
  const d = sub(point, f.p);
  return { s: sc, off: [dot(d, f.side), dot(d, f.up), dot(d, f.t)], radius, color, mirror, hardness };
}

/** Where a dab is on the body (rest pose), and its mirror image. */
export function splatPosition(frames: readonly SpineFrame[], splat: PaintSplat, mirrored = false): Vec3 {
  const f = frameAt(frames, splat.s);
  return add(add(add(f.p, f.side, mirrored ? -splat.off[0] : splat.off[0]), f.up, splat.off[1]), f.t, splat.off[2]);
}

// --- Growing ---

/** A leg or arm, worked out at rest: what the motion moves. */
export interface CreatureLimb {
  /** Index of its part in the design, and whether it is the mirror image (+x is the left). */
  part: number;
  mirrored: boolean;
  arm: boolean;
  /** Its rank along the spine among the legs (0 the hindmost pair) and how many ranks there are. */
  rank: number;
  ranks: number;
  /** Rest pose: the hip (or shoulder) and where the foot stands (or the hand hangs). */
  hip: Vec3;
  rest: Vec3;
  upper: number;
  lower: number;
  radius: number;
  paw: number;
  /** Which way the knee (or elbow) bends, and where it is at rest. */
  pole: Vec3;
  joint: Vec3;
}

export interface GrownCreature {
  /** The skeleton, posed, for surface/animalMesh.ts. */
  skeleton: AnimalSkeleton;
  /** The spine's frames at rest (anchors, paint) and as posed. */
  rest: SpineFrame[];
  frames: SpineFrame[];
  limbs: CreatureLimb[];
  /** Snout to tail tip along the spine, and the legs' mean hip height (the body's radius without legs). */
  length: number;
  hipHeight: number;
}

/** The parts as placed: each part's instances (one, or a mirrored pair). */
function instances(design: CreatureDesign): { part: CreaturePart; index: number; mirrored: boolean }[] {
  const out: { part: CreaturePart; index: number; mirrored: boolean }[] = [];
  design.parts.forEach((part, index) => {
    out.push({ part, index, mirrored: false });
    if (part.mirror && Math.abs(Math.sin(part.theta)) > 0.06) out.push({ part, index, mirrored: true });
  });
  return out;
}

/** The spine at rest: legless creatures lie on the ground. */
function restSamples(design: CreatureDesign): SpineSample[] {
  const samples = sampleSpine(design.spine);
  if (design.parts.some((p) => p.kind === 'leg')) return samples;
  const low = Math.min(...samples.map((q) => q.p[1] - q.ry));
  return samples.map((q) => ({ ...q, p: [q.p[0], q.p[1] - low, q.p[2]] }));
}

function spineLength(samples: readonly SpineSample[]): number {
  let l = 0;
  for (let i = 1; i < samples.length; i++) l += Math.hypot(...sub(samples[i]!.p, samples[i - 1]!.p));
  return l + domeHeight(samples[0]!) + domeHeight(samples[samples.length - 1]!);
}

/** Where a limb leaves the body: on the skin at its anchor, sunk in by a share of its radius. */
function limbRoot(frames: readonly SpineFrame[], part: CreaturePart, mirrored: boolean): { hip: Vec3; r: number } {
  const k = skinPoint(frames, part.s, mirrored ? -part.theta : part.theta);
  const radius = limbRadius(part, k.r);
  return { hip: add(k.p, k.n, -radius * 0.5), r: k.r };
}

function limbRadius(part: CreaturePart, bodyR: number): number {
  return Math.max(0.03, bodyR * (part.kind === 'arm' ? 0.16 : 0.24) * part.size);
}

/**
 * A limb's knee or elbow and its foot or hand, as offsets from its root
 * `hip` (out, up, forward), when they haven't been placed: a leg standing
 * with its foot below the hip (out by its sprawl, ahead or behind by its
 * reach) and its knee bent towards `pole`; an arm hanging down and forward.
 */
export function defaultLimbNodes(part: CreaturePart, bodyR: number, hip: Vec3, pole: Vec3): { joint: Vec3; end: Vec3 } {
  const radius = limbRadius(part, bodyR);
  if (part.kind === 'leg') {
    const paw = radius * 0.9;
    const h = Math.max(paw * 2, hip[1]);
    const end: Vec3 = [radius * 0.4 + part.spread * h * 0.8, paw - hip[1], part.tilt * h * 0.5];
    // A little longer than the reach, so the knee is bent standing.
    const len = Math.hypot(...end) * 1.12;
    const { knee } = solveTwoBone([0, 0, 0], end, len / 2, len / 2, [Math.abs(pole[0]), pole[1], pole[2]]);
    return { joint: knee, end };
  }
  const len = Math.max(0.2, bodyR * 2.2 * part.size);
  const end: Vec3 = [(0.15 + part.spread * 0.6) * len, -0.6 * len, (0.4 + part.tilt * 0.4) * len];
  // Never through the floor.
  end[1] = Math.max(radius * 1.15 - hip[1], end[1]);
  const l = Math.max(Math.hypot(...end) * 1.1, len * 0.9);
  const { knee } = solveTwoBone([0, 0, 0], end, l / 2, l / 2, normalize([0.5, 0, -1]));
  return { joint: knee, end };
}

/** The offset of a rest-pose point from a limb's root, as `joint` and `end` keep it. */
export function limbOffset(hip: Vec3, point: Vec3): Vec3 {
  const out = hip[0] >= 0 ? 1 : -1;
  return [(point[0] - hip[0]) * out, point[1] - hip[1], point[2] - hip[2]];
}

/** The limbs at rest, from the rest frames. */
function growLimbs(design: CreatureDesign, rest: readonly SpineFrame[]): CreatureLimb[] {
  const legRanks = [...new Set(design.parts.filter((p) => p.kind === 'leg').map((p) => p.s))].sort((a, b) => a - b);
  const limbs: CreatureLimb[] = [];
  for (const { part, index, mirrored } of instances(design)) {
    if (part.kind !== 'leg' && part.kind !== 'arm') continue;
    const { hip, r: bodyR } = limbRoot(rest, part, mirrored);
    const radius = limbRadius(part, bodyR);
    const paw = radius * (part.kind === 'arm' ? 1.15 : 0.9);
    const out = hip[0] >= 0 ? 1 : -1;
    const outward: Vec3 = [out, 0, 0];
    const leg = part.kind === 'leg';
    const rank = leg ? legRanks.indexOf(part.s) : 0;
    const front = legRanks.length > 1 && rank === legRanks.length - 1;
    // Unposed, a hind knee bends forward, a front one back (an elbow), both out as the leg sprawls; an arm's elbow back.
    const defaultPole = leg ? normalize(add(add(add([0, 0, 0], outward, 0.15 + part.spread * 1.2), [0, 0, 1], front ? -0.8 : 0.8), [0, 1, 0], part.spread * 0.6)) : normalize(add(add([0, 0, 0], outward, 0.5), [0, 0, -1], 1));
    const o = part.joint && part.end ? { joint: part.joint, end: part.end } : defaultLimbNodes(part, bodyR, hip, defaultPole);
    const at = (v: Vec3): Vec3 => [hip[0] + out * v[0], hip[1] + v[1], hip[2] + v[2]];
    const joint = at(o.joint);
    const end = at(o.end);
    // A foot stands on the ground; a hand stays above it.
    end[1] = leg ? paw : Math.max(paw, end[1]);
    let upper = Math.max(0.02, Math.hypot(...sub(joint, hip)));
    let lower = Math.max(0.02, Math.hypot(...sub(end, joint)));
    // A leg too short to reach its foot (the body raised since it was posed) grows to reach it.
    const reach = Math.hypot(...sub(end, hip));
    if (leg && upper + lower < reach * 1.01) {
      const k = (reach * 1.01) / (upper + lower);
      upper *= k;
      lower *= k;
    }
    // The joint bends the way it sticks out of the root-to-end line.
    const line = normalize(sub(end, hip));
    const rel = sub(joint, hip);
    const offLine = add(rel, line, -dot(rel, line));
    const pole = Math.hypot(...offLine) > 1e-4 ? normalize(offLine) : defaultPole;
    limbs.push({ part: index, mirrored, arm: !leg, rank, ranks: leg ? legRanks.length : 0, hip, rest: end, upper, lower, radius, paw, pole, joint });
  }
  return limbs;
}

/**
 * A creature grown from its design, in `pose` (the rest pose by default):
 * the skeleton surface/animalMesh.ts skins, with the frames and limbs the
 * editor and the motion use.
 */
export function growCreature(design: CreatureDesign, pose: CreaturePose = REST_POSE, gravity = 1): GrownCreature {
  const restS = restSamples(design);
  const rest = spineFrames(restS);
  const limbs = growLimbs(design, rest);
  const legs = limbs.filter((l) => !l.arm);
  const length = spineLength(restS);
  const hipHeight = legs.length > 0 ? legs.reduce((m, l) => m + l.hip[1], 0) / legs.length : Math.max(...restS.map((q) => q.ry));
  const gait = animalGait({ hipHeight }, gravity);
  const run = clamp(pose.run, 0, 1);
  const stride = lerp(gait.walkStride, gait.trotStride, run);
  const duty = dutyFactor(run);

  // The spine posed: swaying side to side, bobbing, breathing.
  const bob = legs.length > 0 ? bodyBob(pose, hipHeight) : 0;
  const swell = breath(pose);
  const posedS: SpineSample[] = restS.map((q) => ({
    p: [q.p[0] + spineSway(q.s, pose, legs.length, length), q.p[1] + bob, q.p[2]],
    rx: q.rx * (q.s > 0.15 && q.s < 0.85 ? swell : 1),
    ry: q.ry * (q.s > 0.15 && q.s < 0.85 ? swell : 1),
    s: q.s,
  }));
  const frames = spineFrames(posedS);

  const spine: SpineNode[] = frames.map((f) => ({ p: f.p, rx: f.rx, ry: f.ry, part: 'body', w: 0 }));
  const spikes: Spike[] = [];
  const eyes: Eye[] = [];
  for (const { part, mirrored } of instances(design)) {
    const theta = mirrored ? -part.theta : part.theta;
    if (part.kind === 'eye') {
      const k = skinPoint(frames, part.s, theta);
      const er = Math.max(0.025, k.r * 0.3 * part.size);
      eyes.push({ centre: add(k.p, k.n, -er * 0.35), radius: er, look: normalize(add(k.n, k.t, 0.35)) });
    } else if (part.kind === 'horn' || part.kind === 'ear' || part.kind === 'spike' || part.kind === 'antenna') {
      spikes.push(growSpike(frames, part, theta));
    }
  }

  const legsOut: Leg[] = limbs.map((l) => {
    const part = design.parts[l.part]!;
    const { hip } = limbRoot(frames, part, l.mirrored);
    let target: Vec3;
    let phase = 0;
    if (!l.arm) {
      phase = legPhase(l.rank, l.ranks, l.mirrored, run);
      const [fwd, up] = footPath(pose.cycle + phase, duty, stride * duty, Math.max(l.paw, hipHeight * 0.18));
      target = [l.rest[0], l.rest[1] + up * pose.moving, l.rest[2] + fwd * pose.moving];
    } else {
      // Arms swing against the stride, and idly.
      phase = l.mirrored ? 0.5 : 0;
      const swing = Math.sin(2 * Math.PI * (pose.cycle + phase)) * pose.moving * (l.upper + l.lower) * 0.25 + Math.sin(pose.time * 1.7 + (l.mirrored ? 1 : 0)) * (l.upper + l.lower) * 0.04;
      target = add(l.rest, [0, 0, 1], swing);
      target = add(target, sub(hip, l.hip));
    }
    const { knee, end } = solveTwoBone(hip, target, l.upper, l.lower, l.pole);
    return { points: [hip, knee, end], radii: [l.radius, l.radius * 0.78, l.paw], swing: 'pendulum', walk: phase, trot: phase, arm: l.arm };
  });

  // --- Extents, as gen/animalForm.ts gives them ---
  let top = 0;
  let front = -Infinity;
  let back = Infinity;
  let width = 0;
  for (const f of frames) {
    top = Math.max(top, f.p[1] + f.ry);
    front = Math.max(front, f.p[2] + f.rx * 0.5);
    back = Math.min(back, f.p[2] - f.rx * 0.5);
    width = Math.max(width, Math.abs(f.p[0]) + f.rx);
  }
  for (const k of [...spikes, ...legsOut]) {
    for (const q of k.points) {
      top = Math.max(top, q[1]);
      front = Math.max(front, q[2]);
      back = Math.min(back, q[2]);
      width = Math.max(width, Math.abs(q[0]));
    }
  }
  const head = frames[frames.length - 1]!;
  const tail = frames[0]!;
  const skeleton: AnimalSkeleton = {
    plan: legs.length === 2 ? 'biped' : legs.length >= 6 ? 'hexapod' : 'quadruped',
    spine,
    legs: legsOut,
    spikes,
    eyes,
    neckBase: head.p,
    tailBase: tail.p,
    hipHeight,
    legLength: legs.length > 0 ? legs[0]!.upper + legs[0]!.lower : 0,
    top,
    front,
    back,
    width,
  };
  return { skeleton, rest, frames, limbs, length, hipHeight };
}

/** A horn, ear, spike or antenna standing out of the skin at its anchor, leaning with its tilt. */
function growSpike(frames: readonly SpineFrame[], part: CreaturePart, theta: number): Spike {
  const k = skinPoint(frames, part.s, theta);
  const n = k.n;
  const t = k.t;
  const r = k.r * part.size;
  const tilt = part.tilt;
  if (part.kind === 'ear') {
    const len = r * 0.9;
    const base = add(k.p, n, -len * 0.15);
    const pts: Vec3[] = [base, add(add(base, n, len * 0.5), t, len * (tilt * 0.3 - 0.1)), add(add(base, n, len * 0.9), t, len * (tilt * 0.6 - 0.2))];
    return { points: pts, radii: [len * 0.28, len * 0.36, len * 0.24], kind: 'ear', part: 'head', w: 1 };
  }
  if (part.kind === 'spike') {
    const len = r * 0.75;
    const base = add(k.p, n, -len * 0.15);
    return { points: [base, add(add(base, n, len), t, len * (tilt * 0.6 - 0.25))], radii: [len * 0.42, len * 0.16], kind: 'crest', part: 'body', w: 0 };
  }
  const antenna = part.kind === 'antenna';
  const len = r * (antenna ? 2.2 : 1.2);
  const base = add(k.p, n, -len * 0.08);
  const pts: Vec3[] = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    // Out along the normal, curling over towards the lean (antennae arch forward).
    const lean = antenna ? 0.5 + tilt * 0.5 : tilt;
    pts.push(add(add(base, n, len * (u - 0.25 * Math.abs(lean) * u * u)), t, len * lean * 0.7 * u * u));
  }
  const radii = pts.map((_, i) => (antenna ? Math.max(0.012, len * 0.05 * (1 - i / 6)) : Math.max(0.015, len * (0.22 - 0.15 * (i / steps)))));
  return { points: pts, radii, kind: antenna ? 'antenna' : 'horn', part: 'head', w: 1 };
}

/**
 * The `AnimalForm` the mesh builder and material read (its colours and
 * pattern; the body numbers are unused, the skeleton is already grown).
 */
export function creatureForm(design: CreatureDesign): AnimalForm {
  const p = design.paint;
  return {
    plan: 'quadruped',
    seed: design.seed,
    bodyDepth: 0.4,
    bodyWidth: 1,
    chest: 1,
    hump: 0,
    legLength: 0.4,
    legThickness: 0.12,
    neckLength: 0.1,
    neckAngle: 30,
    headSize: 0.35,
    snout: 0.2,
    tailLength: 0.4,
    tailThickness: 0.3,
    tailRaise: 0,
    horns: 0,
    hornLength: 0.4,
    hornCurve: 0,
    ears: 0,
    crest: 0,
    eyeSize: 0.3,
    eyesForward: 0.5,
    arms: 0,
    pattern: p.pattern,
    patternScale: p.patternScale,
    color: p.base,
    belly: p.belly,
    patternColor: p.patternColor,
    accentColor: p.accent,
    eyeColor: p.eye,
  };
}

// --- Editing helpers ---

/** The spine kept in order (z rising by at least a little) and above the ground. */
export function tidySpine(spine: Vertebra[]): void {
  for (let i = 0; i < spine.length; i++) {
    const v = spine[i]!;
    v.r = clamp(v.r, 0.04, 2.5);
    v.w = clamp(v.w, 0.4, 2.5);
    v.y = clamp(v.y, v.r * 0.35, 12);
    if (i > 0) v.z = Math.max(v.z, spine[i - 1]!.z + 0.08);
  }
}

/** Puts a vertebra halfway between `i` and the next one (or past the end, for the last). Parts and paint keep their place on the body. */
export function insertVertebra(design: CreatureDesign, i: number): number {
  const sp = design.spine;
  const n = sp.length;
  if (n >= MAX_VERTEBRAE) return i;
  let index: number;
  let map: (s: number) => number;
  if (i >= n - 1) {
    const a = sp[n - 1]!;
    const b = sp[n - 2]!;
    sp.push({ y: a.y + (a.y - b.y) * 0.8, z: a.z + Math.max(0.1, a.z - b.z) * 0.8, r: a.r * 0.9, w: a.w });
    index = n;
    map = (s) => (s * (n - 1)) / n;
  } else {
    const a = sp[i]!;
    const b = sp[i + 1]!;
    sp.splice(i + 1, 0, { y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, r: (a.r + b.r) / 2, w: (a.w + b.w) / 2 });
    index = i + 1;
    // The gap from i to i + 1 becomes two gaps.
    map = (s) => {
      const f = s * (n - 1);
      const g = f <= i ? f : f >= i + 1 ? f + 1 : i + (f - i) * 2;
      return g / n;
    };
  }
  remapAnchors(design, map);
  return index;
}

/** Takes vertebra `i` out (never below MIN_VERTEBRAE). Parts and paint keep their place along the body. */
export function removeVertebra(design: CreatureDesign, i: number): void {
  const sp = design.spine;
  const n = sp.length;
  if (n <= MIN_VERTEBRAE) return;
  // The two gaps either side of it become one (an end vertebra's gap goes).
  const map = (s: number) => {
    const f = s * (n - 1);
    let g: number;
    if (i === 0) g = Math.max(0, f - 1);
    else if (i === n - 1) g = Math.min(f, n - 2);
    else g = f <= i - 1 ? f : f >= i + 1 ? f - 1 : i - 1 + (f - (i - 1)) / 2;
    return g / (n - 2);
  };
  sp.splice(i, 1);
  remapAnchors(design, map);
}

/** Moves every anchor's s through `f` (on [0, 1]; how far past an end it is stays). */
function remapAnchors(design: CreatureDesign, f: (s: number) => number): void {
  const remap = (s: number) => (s > 1 ? f(1) + (s - 1) : s < 0 ? f(0) + s : f(s));
  for (const p of design.parts) p.s = remap(p.s);
  for (const k of design.splats) k.s = clamp(remap(k.s), 0, 1);
}

export function cloneDesign(d: CreatureDesign): CreatureDesign {
  return structuredClone(d);
}

/** A part of kind `kind` at (s, θ) with its usual settings. */
export function newPart(kind: PartKind, s: number, theta: number): CreaturePart {
  return { kind, s, theta, size: 1, tilt: kind === 'horn' ? -0.4 : 0, spread: kind === 'leg' ? 0.15 : 0.2, mirror: true };
}

// --- Ready-made creatures ---

const v = (y: number, z: number, r: number, w = 1): Vertebra => ({ y, z, r, w });

/** The editor's first creature: a round four-legged grazer with a long neck, as in Spore's starting blob. */
export function defaultCreature(): CreatureDesign {
  return {
    name: 'Blorbo',
    seed: 7,
    spine: [v(0.85, -2.3, 0.1), v(1.0, -1.75, 0.22), v(1.15, -1.15, 0.48, 1.1), v(1.25, -0.45, 0.62, 1.15), v(1.3, 0.25, 0.6, 1.1), v(1.5, 0.85, 0.42, 1.05), v(1.95, 1.2, 0.3), v(2.3, 1.6, 0.48, 1.1), v(2.32, 2.15, 0.4, 1.05)],
    parts: [
      { kind: 'leg', s: 0.3, theta: 2.15, size: 1.05, tilt: 0, spread: 0.12, mirror: true },
      { kind: 'leg', s: 0.53, theta: 2.15, size: 1, tilt: 0.05, spread: 0.12, mirror: true },
      { kind: 'eye', s: 0.97, theta: 0.8, size: 1.15, tilt: 0, spread: 0, mirror: true },
      { kind: 'ear', s: 0.88, theta: 0.55, size: 0.9, tilt: -0.3, spread: 0, mirror: true },
      { kind: 'horn', s: 0.92, theta: 0.12, size: 0.6, tilt: -0.6, spread: 0, mirror: true },
      { kind: 'spike', s: 0.36, theta: 0, size: 0.7, tilt: 0, spread: 0, mirror: false },
      { kind: 'spike', s: 0.44, theta: 0, size: 0.85, tilt: 0, spread: 0, mirror: false },
      { kind: 'spike', s: 0.52, theta: 0, size: 0.7, tilt: 0, spread: 0, mirror: false },
    ],
    paint: { base: '#3f8fd0', belly: '#d8ecf2', pattern: 'spots', patternColor: '#1f4f86', patternScale: 1.6, accent: '#f2d9a6', eye: '#e08a1e' },
    splats: [],
  };
}

/**
 * A random creature from `seed`: a spine of 6 to 12 vertebrae (a tail
 * thinning to its tip, a round torso, a neck and a head), none to four
 * pairs of legs, sometimes arms, one to three pairs of eyes (or one in the
 * middle), and horns, ears, spikes or antennae, with a random coat.
 */
export function randomCreature(seed: number): CreatureDesign {
  const rng = new Rng(seed).fork('creature');
  const n = rng.int(6, 12);
  const torso = rng.range(0.45, 0.8);
  const neckRise = rng.range(-0.1, 1.1);
  const tailShare = rng.range(0.2, 0.4);
  const neckShare = rng.range(0.12, 0.3);
  const legPairs = rng.weighted<number>([
    [0, 0.6],
    [1, 2],
    [2, 4],
    [3, 2],
    [4, 0.8],
  ]);
  const height = legPairs === 0 ? torso : rng.range(0.9, 1.6) * (legPairs === 1 ? 1.4 : 1);
  const spine: Vertebra[] = [];
  const length = rng.range(3.5, 6);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const z = (u - 0.5) * length;
    let r: number;
    let y: number;
    if (u < tailShare) {
      const t = u / tailShare;
      r = torso * (0.15 + 0.75 * t ** 1.3);
      y = height - torso * 0.3 * (1 - t) * rng.range(0.5, 1.5);
    } else if (u > 1 - neckShare) {
      const t = (u - (1 - neckShare)) / neckShare;
      const head = t > 0.7;
      r = head ? torso * rng.range(0.6, 0.85) : torso * rng.range(0.4, 0.6);
      y = height + neckRise * t * torso * 2;
    } else {
      const t = (u - tailShare) / (1 - tailShare - neckShare);
      r = torso * (0.85 + 0.25 * Math.sin(Math.PI * t)) * rng.range(0.9, 1.1);
      y = height + rng.range(-0.08, 0.08);
    }
    spine.push({ y: Math.max(r * 0.4, y), z, r, w: rng.range(0.9, 1.25) });
  }
  tidySpine(spine);
  const parts: CreaturePart[] = [];
  const bodyStart = tailShare + 0.05;
  const bodyEnd = 1 - neckShare - 0.02;
  for (let k = 0; k < legPairs; k++) {
    const s = legPairs === 1 ? (bodyStart + bodyEnd) / 2 : bodyStart + ((bodyEnd - bodyStart) * k) / (legPairs - 1);
    parts.push({ kind: 'leg', s, theta: rng.range(1.9, 2.4), size: rng.range(0.85, 1.25), tilt: rng.range(-0.15, 0.15), spread: legPairs >= 3 ? rng.range(0.4, 0.9) : rng.range(0.05, 0.3), mirror: true });
  }
  if (rng.chance(legPairs <= 1 ? 0.6 : 0.2)) parts.push({ kind: 'arm', s: bodyEnd - 0.03, theta: rng.range(1.5, 1.9), size: rng.range(0.8, 1.2), tilt: 0, spread: rng.range(0.1, 0.4), mirror: true });
  const eyePairs = rng.weighted<number>([
    [0, 0.6],
    [1, 5],
    [2, 1],
    [3, 0.4],
  ]);
  if (eyePairs === 0) parts.push({ kind: 'eye', s: 1 + CAP * 0.5, theta: 0.5, size: rng.range(1.6, 2.2), tilt: 0, spread: 0, mirror: false });
  for (let k = 0; k < eyePairs; k++) parts.push({ kind: 'eye', s: 0.97 - k * 0.04, theta: rng.range(0.6, 1.0) - k * 0.15, size: rng.range(0.8, 1.4) * (1 - k * 0.2), tilt: 0, spread: 0, mirror: true });
  if (rng.chance(0.5)) parts.push({ kind: 'ear', s: rng.range(0.85, 0.93), theta: rng.range(0.35, 0.8), size: rng.range(0.6, 1.3), tilt: rng.range(-0.5, 0.3), spread: 0, mirror: true });
  if (rng.chance(0.4)) parts.push({ kind: 'horn', s: rng.range(0.9, 0.98), theta: rng.range(0.1, 0.5), size: rng.range(0.4, 1.1), tilt: rng.range(-0.8, 0.6), spread: 0, mirror: true });
  if (rng.chance(0.2)) parts.push({ kind: 'antenna', s: 0.97, theta: rng.range(0.2, 0.5), size: rng.range(0.6, 1.1), tilt: rng.range(-0.3, 0.5), spread: 0, mirror: true });
  if (rng.chance(0.45)) {
    const count = rng.int(2, 6);
    const size = rng.range(0.5, 1);
    for (let k = 0; k < count; k++) parts.push({ kind: 'spike', s: bodyStart - 0.1 + ((bodyEnd - bodyStart + 0.1) * (k + 0.5)) / count, theta: 0, size: size * (0.8 + 0.4 * Math.sin((Math.PI * (k + 0.5)) / count)), tilt: -0.2, spread: 0, mirror: false });
  }
  return { name: 'Creature', seed: rng.int(0, 0xffffff), spine, parts, paint: randomPaint(rng), splats: [] };
}

/** A random coat: bright and countershaded, like the generated animals' (gen/animalForm.ts). */
export function randomPaint(rng: Rng): CreaturePaint {
  const h = rng.range(0, 360);
  const sat = rng.range(0.45, 0.8);
  const light = rng.range(0.42, 0.6);
  const patternHue = rng.chance(0.6) ? h + rng.range(-20, 20) : h + 180 + rng.range(-40, 40);
  return {
    base: hslToHex(h, sat, light),
    belly: hslToHex(h + rng.range(-10, 10), sat * 0.45, Math.min(0.9, light + rng.range(0.25, 0.35))),
    pattern: rng.weighted<CoatPattern>(COAT_PATTERNS.map((p) => [p, p === 'plain' ? 1.5 : 2] as [CoatPattern, number])),
    patternColor: hslToHex(patternHue, Math.min(0.85, sat + 0.1), rng.chance(0.5) ? light * 0.55 : Math.min(0.9, light + 0.28)),
    patternScale: rng.range(1, 2.5),
    accent: hslToHex(rng.range(20, 45), rng.range(0.15, 0.4), rng.range(0.6, 0.82)),
    eye: hslToHex(rng.range(0, 360), rng.range(0.55, 0.9), rng.range(0.3, 0.5)),
  };
}

/**
 * A creature made from one of the game's generated animals (gen/animalForm.ts):
 * its spine thinned to vertebrae, its legs, eyes, horns, ears and crest
 * turned into parts at the same places, its coat as paint. A way into the
 * editor from any species on any planet.
 */
export function designFromAnimal(form: AnimalForm, length: number, name = 'Creature'): CreatureDesign {
  const k: AnimalSkeleton = growAnimal({ length, form });
  const nodes = k.spine;
  const count = Math.min(MAX_VERTEBRAE - 2, Math.max(MIN_VERTEBRAE + 3, Math.round(nodes.length / 2)));
  const spine: Vertebra[] = [];
  for (let i = 0; i < count; i++) {
    const q = nodes[Math.round((i / (count - 1)) * (nodes.length - 1))]!;
    spine.push({ y: q.p[1], z: q.p[2], r: q.ry, w: q.rx / q.ry });
  }
  tidySpine(spine);
  const frames = spineFrames(sampleSpine(spine));
  const parts: CreaturePart[] = [];
  const at = (p: Vec3) => anchorOf(frames, p);
  for (const leg of k.legs) {
    const hip = leg.points[0]!;
    if (hip[0] < 0) continue;
    const foot = leg.points[leg.points.length - 1]!;
    const a = at(hip);
    const h = Math.max(0.05, hip[1]);
    parts.push({ kind: leg.arm ? 'arm' : 'leg', s: a.s, theta: Math.max(1.4, Math.abs(a.theta)), size: 1, tilt: leg.arm ? 0 : clamp((foot[2] - hip[2]) / (h * 0.5), -1, 1), spread: leg.arm ? 0.2 : clamp((foot[0] - hip[0]) / (h * 0.8), 0, 1), mirror: true });
  }
  for (const e of k.eyes) {
    if (e.centre[0] < 0) continue;
    const a = at(add(e.centre, e.look, e.radius));
    parts.push({ kind: 'eye', s: a.s, theta: a.theta, size: 1.1, tilt: 0, spread: 0, mirror: true });
  }
  for (const sp of k.spikes) {
    const base = sp.points[0]!;
    if (base[0] < -1e-6) continue;
    const kind: PartKind = sp.kind === 'crest' ? 'spike' : sp.kind;
    const a = at(base);
    parts.push({ kind, s: a.s, theta: Math.abs(a.theta), size: 0.8, tilt: kind === 'horn' ? -0.4 : 0, spread: 0, mirror: Math.abs(base[0]) > 1e-6 });
  }
  return {
    name,
    seed: form.seed,
    spine,
    parts,
    paint: { base: form.color, belly: form.belly, pattern: form.pattern, patternColor: form.patternColor, patternScale: form.patternScale, accent: form.accentColor, eye: form.eyeColor },
    splats: [],
  };
}

/** A design packed for a URL's #hash or a file. */
export function encodeDesign(d: CreatureDesign): string {
  const json = JSON.stringify(d, (_k, val: unknown) => (typeof val === 'number' ? Math.round(val * 1000) / 1000 : val));
  let bin = '';
  for (const b of new TextEncoder().encode(json)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeDesign(text: string): CreatureDesign | null {
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const d = JSON.parse(new TextDecoder().decode(bytes)) as CreatureDesign;
    // Earlier links kept an arm's nodes as elbow and hand.
    for (const p of d.parts ?? []) {
      const old = p as CreaturePart & { elbow?: Vec3; hand?: Vec3 };
      if (old.elbow && old.hand && !p.joint) {
        p.joint = old.elbow;
        p.end = old.hand;
        delete old.elbow;
        delete old.hand;
      }
    }
    if (!Array.isArray(d.spine) || d.spine.length < MIN_VERTEBRAE || !Array.isArray(d.parts) || !d.paint) return null;
    d.splats ??= [];
    d.name ??= 'Creature';
    d.seed ??= 1;
    return d;
  } catch {
    return null;
  }
}
