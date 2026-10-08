import type { Vec3 } from './animalForm';
import { frameAt, type GrownCreature, type SpineFrame } from './creature';

/*
 * A creature's walk as numbers a vertex shader can play (surface/animalLook.ts),
 * so a herd of hundreds moves by the creature editor's rules
 * (gen/creatureMotion.ts) without growing a mesh per animal per frame.
 * Pure data, no THREE.
 *
 * The mesh is grown once at rest. Each vertex is tagged with what moves it:
 *  - the body's (and everything stuck on it: eyes, horns, a mouth) by its s
 *    along the spine, which sets how far the spine's travelling sway and
 *    the body's bob carry it, and how much of the head and neck bends down
 *    to graze;
 *  - a leg's or arm's by which limb it is on and how much it belongs to the
 *    lower bone (blended round the knee). The shader puts the limb's foot
 *    where `footPath` says, solves the same two-bone IK as `solveTwoBone`
 *    from the swayed hip, and carries each bone's vertices from the rest
 *    bone to the posed one.
 */

/** Limbs a rig carries (the shader's uniform array). */
export const MAX_RIG_LIMBS = 8;

/** A leg or arm as the shader moves it, at rest. */
export interface RigLimb {
  readonly hip: Vec3;
  readonly joint: Vec3;
  readonly foot: Vec3;
  readonly upper: number;
  readonly lower: number;
  /** Which way the knee or elbow bends. */
  readonly pole: Vec3;
  /** How high the foot lifts coming forward (the same as growCreature's). */
  readonly lift: number;
  readonly arm: boolean;
  /** Its rank among the legs (0 the hindmost) and how many there are, and which side (true: the mirrored, right one). */
  readonly rank: number;
  readonly ranks: number;
  readonly right: boolean;
  /** The hip's place along the spine (0 the tail's tip, 1 the snout). */
  readonly s: number;
}

export interface CreatureRig {
  /** Snout to tail tip along the spine, and the walking legs' mean hip height. */
  readonly length: number;
  readonly hipHeight: number;
  /** Walking legs (not arms). */
  readonly legs: number;
  readonly limbs: readonly RigLimb[];
  /** The head and neck (and any arms on them) bend down about `pivot`, the bend growing from `from` to `to` along the spine, by `graze` radians at most. */
  readonly neck: { readonly pivot: Vec3; readonly from: number; readonly to: number; readonly graze: number };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The s of the spine nearest `p` (the rest spine's polyline). Run for every vertex of every mesh, so kept to plain arithmetic. */
export function spineS(frames: readonly SpineFrame[], p: Vec3): number {
  let best = Infinity;
  let bestS = 0;
  const [px, py, pz] = p;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!;
    const b = frames[i]!;
    const ax = a.p[0];
    const ay = a.p[1];
    const az = a.p[2];
    const ux = b.p[0] - ax;
    const uy = b.p[1] - ay;
    const uz = b.p[2] - az;
    const l2 = ux * ux + uy * uy + uz * uz;
    const t = l2 > 1e-12 ? Math.min(1, Math.max(0, ((px - ax) * ux + (py - ay) * uy + (pz - az) * uz) / l2)) : 0;
    const dx = px - ax - ux * t;
    const dy = py - ay - uy * t;
    const dz = pz - az - uz * t;
    // Measured against the body's girth there, so a fat belly isn't claimed by a thin neck nearby.
    const r = Math.max(1e-3, a.ry + (b.ry - a.ry) * t);
    const d = (dx * dx + dy * dy + dz * dz) / (r * r);
    if (d < best) {
      best = d;
      bestS = a.s + (b.s - a.s) * t;
    }
  }
  return bestS;
}

function segmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 1e-12 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0;
  const x = p[0] - a[0] - ab[0] * t;
  const y = p[1] - a[1] - ab[1] * t;
  const z = p[2] - a[2] - ab[2] * t;
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * The bend about `pivot` that brings the snout's underside down to just
 * above the ground (at most 110°), the head turning forward and down.
 */
function grazeBend(frames: readonly SpineFrame[], pivot: Vec3, length: number): number {
  const tip = frames[frames.length - 1]!;
  const y = tip.p[1] - tip.ry - pivot[1];
  const z = tip.p[2] - pivot[2];
  const target = length * 0.03 - pivot[1];
  for (let a = 0; a <= 110; a += 2) {
    const r = (a * Math.PI) / 180;
    if (Math.cos(r) * y - Math.sin(r) * z <= target) return r;
  }
  return (110 * Math.PI) / 180;
}

/** A grown creature's rig (from its rest pose). */
export function creatureRig(grown: GrownCreature): CreatureRig {
  const frames = grown.rest;
  // The rest bones as the rest mesh was skinned (its knees from the IK, as posed).
  const limbs: RigLimb[] = grown.limbs.slice(0, MAX_RIG_LIMBS).map((l, i) => ({
    hip: grown.skeleton.legs[i]!.points[0]!,
    joint: grown.skeleton.legs[i]!.points[1]!,
    foot: grown.skeleton.legs[i]!.points[2]!,
    upper: l.upper,
    lower: l.lower,
    pole: l.pole,
    lift: Math.max(l.paw, grown.hipHeight * 0.18),
    arm: l.arm,
    rank: l.rank,
    ranks: l.ranks,
    right: l.mirrored,
    s: spineS(frames, l.hip),
  }));
  // The neck starts a little ahead of the frontmost legs (the shoulders, or a biped's hips); arms ride along with it.
  const legRoots = limbs.filter((l) => !l.arm).map((l) => l.s);
  const shoulders = legRoots.length > 0 ? Math.max(...legRoots) : 0.6;
  const from = Math.min(0.9, shoulders + 0.06);
  const to = Math.min(0.98, from + 0.22);
  const pivot = frameAt(frames, from).p;
  return {
    length: grown.length,
    hipHeight: grown.hipHeight,
    legs: grown.limbs.filter((l) => !l.arm).length,
    limbs,
    neck: { pivot, from, to, graze: grazeBend(frames, pivot, grown.length) },
  };
}

/**
 * Each vertex's rig for the shader, four numbers: its limb's index + 1 (0
 * on the body), how much it belongs to the limb's lower bone, its s along
 * the spine, and how much of the neck's bend it takes. `limbOf(i)` is the
 * mesh's own word on which vertices are a limb's (its hip, from the
 * builder's rig), so a paw resting against the belly isn't taken for it.
 */
export function rigVertices(rig: CreatureRig, frames: readonly SpineFrame[], positions: Float32Array, limbHip: (i: number) => Vec3 | null): Float32Array {
  const n = positions.length / 3;
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p: Vec3 = [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!];
    const hip = limbHip(i);
    let limb = -1;
    if (hip) {
      let best = Infinity;
      rig.limbs.forEach((l, j) => {
        const d = Math.hypot(...sub(l.hip, hip));
        if (d < best) {
          best = d;
          limb = j;
        }
      });
    }
    if (limb >= 0) {
      const l = rig.limbs[limb]!;
      const dUpper = segmentDistance(p, l.hip, l.joint);
      const dLower = segmentDistance(p, l.joint, l.foot);
      const soft = Math.max(1e-3, Math.min(l.upper, l.lower) * 0.12);
      out[i * 4] = limb + 1;
      out[i * 4 + 1] = smoothstep(-soft, soft, dUpper - dLower);
      out[i * 4 + 2] = l.s;
      out[i * 4 + 3] = 0;
    } else {
      const s = spineS(frames, p);
      out[i * 4 + 2] = s;
      out[i * 4 + 3] = smoothstep(rig.neck.from, rig.neck.to, s);
    }
  }
  return out;
}
