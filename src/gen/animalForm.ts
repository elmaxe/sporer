import { hslToHex } from './color';
import { Rng } from './rng';

/*
 * What a planet species is made of (the animal lab), and the skeleton its
 * mesh is built from. A species' `AnimalForm` is only what the game keeps
 * of it beyond its size and diet: its body plan (four legs, six or two),
 * the seed its body is drawn from, how stocky its legs are, and its coat.
 * The body itself is one of the creature editor's creatures
 * (gen/creature.ts `speciesDesign`, grown by gen/speciesBody.ts), which
 * grows the `AnimalSkeleton` below: a spine with a soft body round it
 * (rings of an ellipse along it, the way Spore's creature creator wraps a
 * skin round a spine), legs as jointed tubes, spikes (horns, ears, spines,
 * antennae), eyes and mouths. Pure data, no THREE: the meshes, at every
 * level of detail, are built from it by surface/animalMesh.ts.
 * Real-world rules (countershading, leg scaling) are in docs/research/animals.md.
 */

export type BodyPlan = 'quadruped' | 'hexapod' | 'biped';
export const BODY_PLANS: readonly BodyPlan[] = ['quadruped', 'hexapod', 'biped'];

export type Diet = 'herbivore' | 'carnivore';

/** The coat's pattern over its countershaded base. */
export type CoatPattern = 'plain' | 'stripes' | 'spots' | 'patches';
export const COAT_PATTERNS: readonly CoatPattern[] = ['plain', 'stripes', 'spots', 'patches'];

export type Vec3 = [number, number, number];

/** A species' form, as the animal lab edits it. */
export interface AnimalForm {
  readonly plan: BodyPlan;
  /** The animal's own random stream: its body (a random creature from it), where spots fall. */
  readonly seed: number;
  /** Leg girth against the creature's own (1): stockier for big animals and heavy worlds (`legGirthFor`). */
  readonly legGirth: number;
  readonly pattern: CoatPattern;
  /** Pattern size: stripes or spots per body length. */
  readonly patternScale: number;
  /** Back, belly (countershading), pattern, horn-and-claw and eye colours. */
  readonly color: string;
  readonly belly: string;
  readonly patternColor: string;
  readonly accentColor: string;
  readonly eyeColor: string;
}

/** Which part of the body a piece belongs to: how the vertex shader moves it. */
export type BodyPart = 'body' | 'tail' | 'head';

/** A point of the spine, with the body's half-width and half-height round it there. */
export interface SpineNode {
  readonly p: Vec3;
  readonly rx: number;
  readonly ry: number;
  readonly part: BodyPart;
  /** 0 to 1 along its part from where it joins the torso (the tail's sway and the neck's bend grow with it). */
  readonly w: number;
  /** The ring's sideways axis, when the spine may turn back on itself (the creature editor's); else it's worked out from the world's up. */
  readonly side?: Vec3;
}

/** A leg: a polyline from the hip to the toe, with a radius at each point, and where it is in the gait cycle. */
export interface Leg {
  readonly points: Vec3[];
  readonly radii: number[];
  /** Swings fore and aft about the hip's side-to-side axis (a pendulum: mammals, birds), or about the vertical (a sprawling insect leg). */
  readonly swing: 'pendulum' | 'sprawl';
  /** Phase (0 to 1 of a stride) at which the foot is furthest back, walking and trotting. */
  readonly walk: number;
  readonly trot: number;
  /** An arm: it swings but doesn't carry the body. */
  readonly arm: boolean;
}

/** A horn, ear, crest spine or antenna: a tapering polyline. `flat` ears are wide across and thin through. */
export interface Spike {
  readonly points: Vec3[];
  readonly radii: number[];
  readonly kind: 'horn' | 'ear' | 'crest' | 'antenna';
  readonly part: BodyPart;
  /** The rig weight of its spine attachment (it moves with the body there). */
  readonly w: number;
}

/**
 * A mouth (the creature editor's; generated animals have none): lips round
 * a dark opening on the skin, `across` its width and `up` in the skin's
 * plane, `out` away from the body.
 */
export interface Mouth {
  readonly centre: Vec3;
  readonly across: Vec3;
  readonly up: Vec3;
  readonly out: Vec3;
  readonly width: number;
  /** −1 a frown to 1 a smile (the corners' rise). */
  readonly smile: number;
  /** 0 shut to 1 wide open. */
  readonly open: number;
  readonly teeth: boolean;
}

export interface Eye {
  readonly centre: Vec3;
  readonly radius: number;
  /** Unit direction the eye looks (its iris and pupil face this way). */
  readonly look: Vec3;
}

/**
 * A grown animal, in units: +Z forward (where it looks), +Y up, standing on
 * the ground at y = 0 with the middle of its torso over the origin.
 */
export interface AnimalSkeleton {
  readonly plan: BodyPlan;
  readonly spine: SpineNode[];
  readonly legs: Leg[];
  readonly spikes: Spike[];
  readonly eyes: Eye[];
  /** Mouths, if any (only the creature editor's creatures have them). */
  readonly mouths?: Mouth[];
  /** Where the neck leaves the torso (the head bends down about it to graze) and the tail's root (it sways about it). */
  readonly neckBase: Vec3;
  readonly tailBase: Vec3;
  /** Hip height of the walking legs (what the gait scales with), the highest point, and the reach from nose to tail tip. */
  readonly hipHeight: number;
  readonly legLength: number;
  readonly top: number;
  readonly front: number;
  readonly back: number;
  /** Widest reach to either side (sprawling legs). */
  readonly width: number;
}

// --- Generation ---

/**
 * Elastic similarity (McMahon): a leg bone keeps from buckling under the
 * body's weight M·g when its diameter d ∝ g^½·l^1.5 (M ∝ d²·l, buckling load
 * ∝ d⁴/l²), so a leg's radius as a share of its length grows as √(g·l):
 * bigger animals and heavier worlds have stockier legs. Relative to a
 * 2-unit animal on Earth, kept within what still looks like a leg
 * (docs/research/animals.md).
 */
export function legGirthFor(length: number, gravity: number): number {
  return Math.min(1.6, Math.max(0.7, Math.sqrt((Math.max(0.05, gravity) * length) / 2)));
}

/**
 * A random form of body plan `plan`, its coat near hue `hue` (degrees):
 * bright and countershaded, a darker back over a pale belly. Its legs are
 * the creature's own until the species sets their girth for its size.
 */
export function generateAnimalForm(rng: Rng, plan: BodyPlan, hue: number): AnimalForm {
  const pattern = rng.weighted<CoatPattern>([
    ['plain', 3],
    ['stripes', 2],
    ['spots', 2.5],
    ['patches', 1.5],
  ]);
  const h = hue + rng.range(-25, 25);
  const sat = rng.range(0.45, 0.75);
  const light = rng.range(0.45, 0.6);
  const patternHue = rng.chance(0.6) ? h + rng.range(-15, 15) : h + 180 + rng.range(-40, 40);
  return {
    plan,
    seed: rng.int(0, 0xffffff),
    legGirth: 1,
    pattern,
    patternScale: rng.range(1, 2.5),
    color: hslToHex(h, sat, light),
    belly: hslToHex(h + rng.range(-10, 10), sat * 0.45, Math.min(0.9, light + rng.range(0.25, 0.35))),
    patternColor: hslToHex(patternHue, Math.min(0.85, sat + 0.1), rng.chance(0.5) ? light * 0.55 : Math.min(0.9, light + 0.28)),
    accentColor: hslToHex(rng.range(20, 45), rng.range(0.15, 0.4), rng.range(0.6, 0.82)),
    eyeColor: hslToHex(rng.range(0, 360), rng.range(0.55, 0.9), rng.range(0.3, 0.5)),
  };
}
