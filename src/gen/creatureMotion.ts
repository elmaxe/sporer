import type { Vec3 } from './animalForm';

/*
 * How a creature from the creature editor moves (gen/creature.ts), whatever
 * its body: pure functions of a pose clock, no THREE.
 *
 * Spore's way (Hecker et al. 2008, docs/research/creature-editor.md): the
 * animation is written once in terms that mean the same on any body (a
 * foot's place in its stride, a share of the leg's length, the ground), and
 * an IK solver turns it into each creature's joints. Here:
 *  - every leg gets a phase from where it sits along the spine, a wave of
 *    steps running from the back legs to the front ones with the two sides
 *    half a stride apart (Wilson's rules for insects, which give the
 *    four-legged walk and the trot, and the six-legged wave gait and tripod,
 *    from one spacing that grows with speed);
 *  - a foot spends the duty factor of each stride planted on the ground,
 *    sliding back under the body as fast as the body moves, then lifts and
 *    swings forward on an arc;
 *  - each leg's knee is found by two-bone IK from its hip (wherever the
 *    body has moved it) to its foot, bending towards a pole;
 *  - the spine sways in a travelling wave, a snake's slither when there are
 *    no legs, a small sway with them; the body bobs twice a stride.
 */

/** Where a creature is in its motion. */
export interface CreaturePose {
  /** Seconds, for idle motion (breathing, the tail). */
  readonly time: number;
  /** Strides walked so far (a foot's phase is this plus its own, mod 1). */
  readonly cycle: number;
  /** 0 walking to 1 trotting (the duty factor, stride and leg spacing follow it). */
  readonly run: number;
  /** 0 standing to 1 moving (fades the stepping in and out). */
  readonly moving: number;
}

export const REST_POSE: CreaturePose = { time: 0, cycle: 0, run: 0, moving: 0 };

/**
 * Share of a stride a foot is on the ground, walking and trotting: over a
 * half is a walk, under a half a run (docs/research/animals.md, "Duty
 * factor"). Stylised values either side of the line.
 */
export const DUTY_FACTOR = { walk: 0.65, trot: 0.42 } as const;

const TAU = Math.PI * 2;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function frac(v: number): number {
  return v - Math.floor(v);
}

export function dutyFactor(run: number): number {
  return DUTY_FACTOR.walk + (DUTY_FACTOR.trot - DUTY_FACTOR.walk) * clamp(run, 0, 1);
}

/**
 * A leg's phase (share of a stride, when its foot touches down) from its
 * rank along the spine (0 the hindmost of `ranks` pairs) and side. The step
 * runs forward rank by rank `spacing` of a stride apart, and the right side
 * is half a stride behind the left. The spacing grows from 1/(2·ranks)
 * walking (one foot lifting at a time: a quadruped's lateral-sequence walk,
 * LH 0, LF ¼, RH ½, RF ¾, an insect's wave gait) to a half trotting
 * (diagonal pairs; an insect's alternating tripods).
 */
export function legPhase(rank: number, ranks: number, right: boolean, run: number): number {
  const n = Math.max(1, ranks);
  const spacing = 1 / (2 * n) + (0.5 - 1 / (2 * n)) * clamp(run, 0, 1);
  return frac(rank * spacing + (right ? 0.5 : 0));
}

/**
 * Where a foot is against its standing place, at stride phase `phase`
 * (0: touching down): through the stance it slides back from +step/2 to
 * −step/2 on the ground, through the swing it comes forward on an arc
 * `lift` high. Returns [forward, up] offsets.
 */
export function footPath(phase: number, duty: number, step: number, lift: number): [number, number] {
  const c = frac(phase);
  if (c < duty) return [step * (0.5 - c / duty), 0];
  const u = (c - duty) / (1 - duty);
  const e = u * u * (3 - 2 * u);
  return [step * (-0.5 + e), lift * Math.sin(Math.PI * u)];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const addScaled = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/**
 * Two-bone IK: the knee and foot of a limb `upper` + `lower` long from
 * `hip` reaching for `target`, bending towards `pole`. A target out of
 * reach is reached for (the limb straight, pointing at it); one too close
 * is held at the shortest the limb can fold to.
 */
export function solveTwoBone(hip: Vec3, target: Vec3, upper: number, lower: number, pole: Vec3): { knee: Vec3; end: Vec3 } {
  const d = sub(target, hip);
  const len = Math.hypot(d[0], d[1], d[2]);
  const dir: Vec3 = len > 1e-9 ? [d[0] / len, d[1] / len, d[2] / len] : [0, -1, 0];
  const dist = clamp(len, Math.abs(upper - lower) + 1e-4, upper + lower - 1e-4);
  // Law of cosines: how far along the hip-to-foot line the knee sits, and how far off it.
  const along = (upper * upper - lower * lower + dist * dist) / (2 * dist);
  const off = Math.sqrt(Math.max(0, upper * upper - along * along));
  let bend = addScaled(pole, dir, -dot(pole, dir));
  let bl = Math.hypot(bend[0], bend[1], bend[2]);
  if (bl < 1e-6) {
    // The pole lies along the limb: bend forward (or up, for a limb pointing forward).
    bend = Math.abs(dir[2]) < 0.9 ? addScaled([0, 0, 1], dir, -dir[2]) : addScaled([0, 1, 0], dir, -dir[1]);
    bl = Math.hypot(bend[0], bend[1], bend[2]);
  }
  bend = [bend[0] / bl, bend[1] / bl, bend[2] / bl];
  return { knee: addScaled(addScaled(hip, dir, along), bend, off), end: addScaled(hip, dir, dist) };
}

/**
 * The spine's sideways sway at `s` (0 the tail's tip, 1 the snout) for a
 * body `length` long: a wave travelling back down the body as it moves (a
 * slither, big without legs), the head held steadier than the tail, and an
 * idle sway of the tail standing.
 */
export function spineSway(s: number, pose: CreaturePose, legs: number, length: number): number {
  const legless = legs === 0;
  const amplitude = length * (legless ? 0.075 : 0.012 + 0.004 * Math.min(legs, 8));
  const waves = legless ? 1.3 : 0.6;
  const steady = 1 - 0.75 * smoothstep(0.7, 1, s);
  const walk = amplitude * pose.moving * Math.sin(TAU * (waves * s - (legless ? 1 : 0.5) * pose.cycle)) * steady;
  const tail = (1 - s) ** 2;
  const idle = length * 0.02 * tail * (Math.sin(pose.time * 1.3) * 0.7 + Math.sin(pose.time * 3.1) * 0.3) * (1 - pose.moving * 0.6);
  return walk + idle;
}

/** The body's rise and fall: twice a stride, a share of the hip height. */
export function bodyBob(pose: CreaturePose, hipHeight: number): number {
  return -hipHeight * 0.03 * pose.moving * Math.cos(TAU * 2 * pose.cycle);
}

/** The body's girth breathing in and out (a factor round 1). */
export function breath(pose: CreaturePose): number {
  return 1 + 0.02 * Math.sin(pose.time * 1.9);
}
