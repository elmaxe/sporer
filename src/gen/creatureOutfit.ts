import type { Vec3 } from './animalForm';
import { CAP, cloneDesign, frameAt, isGear, sampleSpine, skinPoint, type CreatureDesign, type CreatureOutfit, type CreaturePart, type SpineFrame } from './creature';
import { hslToHex } from './color';
import { Rng } from './rng';

/*
 * Space clothes for editor creatures (creature.html's Outfit mode), as pure
 * data: where the suit's shell runs over the body, where the bubble helmet
 * sits on the head, and the frame each piece of gear (jetpack, beacon,
 * badge, shoulder pad) is built in on the skin. creaturelab/outfitLook.ts
 * draws them over the posed body every frame, so they walk with it.
 */

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** How far the suit stands off the skin, as a share of the body's radius. */
export const SUIT_PUFF = 1.08;

/** The torso, where the suit goes by default: the run of spine round its thickest point at least 55% as thick, a little past it either way. */
export function suitSpan(design: CreatureDesign): { from: number; to: number } {
  const samples = sampleSpine(design.spine);
  const r = samples.map((q) => Math.max(q.rx, q.ry));
  const max = Math.max(...r);
  let lo = r.indexOf(max);
  let hi = lo;
  while (lo > 0 && r[lo - 1]! >= max * 0.55) lo--;
  while (hi < r.length - 1 && r[hi + 1]! >= max * 0.55) hi++;
  return { from: clamp(samples[lo]!.s - 0.06, 0.02, 0.9), to: clamp(samples[hi]!.s + 0.06, 0.1, 0.92) };
}

/** A white suit with orange trim and cyan lights, as worn on the Moon, covering the torso. */
export function defaultOutfit(design: CreatureDesign): CreatureOutfit {
  const { from, to } = suitSpan(design);
  return { suit: true, suitFrom: from, suitTo: to, sleeves: true, helmet: true, helmetSize: 1, boots: true, gloves: true, color: '#e9eef3', trim: '#ff8a2a', glow: '#4fe3ff' };
}

/** Another colour scheme: a pale or dark suit, a bold trim, bright lights. */
export function randomOutfitColors(rng: Rng): Pick<CreatureOutfit, 'color' | 'trim' | 'glow'> {
  const h = rng.range(0, 360);
  const dark = rng.chance(0.3);
  return {
    color: hslToHex(h, rng.range(0.05, 0.35), dark ? rng.range(0.16, 0.26) : rng.range(0.72, 0.9)),
    trim: hslToHex(h + rng.range(120, 240), rng.range(0.6, 0.9), rng.range(0.45, 0.58)),
    glow: hslToHex(rng.range(0, 360), 0.95, 0.62),
  };
}

/**
 * The design dressed for space: the whole outfit, and a jetpack on the
 * middle of its back, shoulder pads and a badge on its flank where it has
 * none yet.
 */
export function suitUp(design: CreatureDesign): CreatureDesign {
  const d = cloneDesign(design);
  const o = d.outfit ?? defaultOutfit(d);
  d.outfit = { ...o, suit: true, helmet: true, boots: true, gloves: true };
  const mid = (o.suitFrom + o.suitTo) / 2;
  if (!d.parts.some((p) => p.kind === 'jetpack')) d.parts.push({ kind: 'jetpack', s: mid, theta: 0, size: 1, tilt: 0, spread: 0, mirror: false });
  // Shoulder pads over the frontmost limbs (the arms, else the front legs).
  const arms = d.parts.filter((p) => p.kind === 'arm');
  const shoulder = (arms.length > 0 ? arms : d.parts.filter((p) => p.kind === 'leg')).reduce<CreaturePart | null>((best, p) => (!best || p.s > best.s ? p : best), null);
  if (shoulder && !d.parts.some((p) => p.kind === 'pad')) d.parts.push({ kind: 'pad', s: shoulder.s, theta: Math.max(0.9, Math.abs(shoulder.theta) * 0.78), size: 0.9, tilt: 0, spread: 0, mirror: true });
  if (!d.parts.some((p) => p.kind === 'badge')) d.parts.push({ kind: 'badge', s: o.suitFrom + (o.suitTo - o.suitFrom) * 0.7, theta: 1.25, size: 0.8, tilt: 0, spread: 0, mirror: false });
  return d;
}

/** The design with its outfit and gear taken off. */
export function undress(design: CreatureDesign): CreatureDesign {
  const d = cloneDesign(design);
  delete d.outfit;
  d.parts = d.parts.filter((p) => !isGear(p.kind));
  return d;
}

/** A ring of the suit's shell at `s`, `segments` points round it (θ from the top, as the skin's rings), puffed off the skin. */
export function suitRing(frames: readonly SpineFrame[], s: number, segments: number, puff = SUIT_PUFF): Vec3[] {
  const f = frameAt(frames, s);
  const out: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const th = (i / segments) * Math.PI * 2;
    out.push(add(add(f.p, f.side, Math.sin(th) * f.rx * puff), f.up, Math.cos(th) * f.ry * puff));
  }
  return out;
}

/** The bubble helmet over the head: its centre, radius, and the neck's direction (into the collar, from the centre). */
export interface HelmetFit {
  centre: Vec3;
  radius: number;
  /** Along the spine at the head, pointing to the snout. */
  axis: Vec3;
  /** Where the collar ring sits (behind the centre, round the neck) and its radius. */
  collar: Vec3;
  collarRadius: number;
}

export function helmetFit(frames: readonly SpineFrame[], size = 1): HelmetFit {
  const head = frames[frames.length - 1]!;
  const dome = Math.min(head.rx, head.ry) * 0.9;
  const centre = add(head.p, head.t, dome * 0.3);
  const tip = skinPoint(frames, 1 + CAP, 0).p;
  // Round the head's widest ring with room for eyes, and past the snout's tip.
  const radius = Math.max(Math.max(head.rx, head.ry) * 1.4, Math.hypot(...tip.map((v, i) => v - centre[i]!)) * 1.3) * clamp(size, 0.5, 2);
  const back = 0.82;
  return { centre, radius, axis: head.t, collar: add(centre, head.t, -radius * back), collarRadius: radius * Math.sqrt(1 - back * back) };
}

/** A piece of gear's frame on the skin: `y` out of the skin, `z` along the spine towards the head, `x` across; `scale` the body's radius there times the part's size. */
export interface GearFrame {
  p: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
  scale: number;
  /** The body's radius there. */
  r: number;
}

/** `onSuit`: the gear sits on the suit's shell there, not the skin. */
export function gearFrame(frames: readonly SpineFrame[], part: CreaturePart, mirrored: boolean, onSuit = false): GearFrame {
  const k = skinPoint(frames, part.s, mirrored ? -part.theta : part.theta);
  if (onSuit) k.p = add(k.p, k.n, k.r * (SUIT_PUFF - 1));
  const y = k.n;
  let z = add(k.t, y, -dot(k.t, y));
  if (Math.hypot(...z) < 1e-3) z = [0, 0, 1];
  z = normalize(z);
  // A lean tips it forward or back about its own x.
  const lean = clamp(part.tilt, -1, 1) * 0.6;
  const x = normalize(cross(y, z));
  const y2 = normalize(add(y.map((v) => v * Math.cos(lean)) as Vec3, z, Math.sin(lean)));
  const z2 = normalize(cross(x, y2));
  return { p: k.p, x, y: y2, z: z2, scale: k.r * part.size, r: k.r };
}
