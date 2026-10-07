import { hslToHex } from './color';
import { Rng } from './rng';

/*
 * How an animal is built (the animal lab): a species' body from the few
 * numbers in its `AnimalForm`, as a skeleton of a spine with a soft body
 * round it (rings of an ellipse along the spine, the way Spore's creature
 * creator wraps a skin round a spine), legs as jointed tubes, and spikes
 * (horns, ears, a crest, antennae) and eyes. Pure data, no THREE: the meshes,
 * at every level of detail, are built from it by surface/animalMesh.ts, and
 * the walk is played in their vertex shader (surface/animalLook.ts) from
 * each leg's gait phase.
 *
 * Three body plans: four-legged (mammals, reptiles), six-legged (insects,
 * with a thorax that carries the legs and an abdomen behind) and two-legged
 * (birds and theropods, the body balanced over the hips by a long tail).
 * Proportions are shares of the body length (snout to rump, without the
 * tail, as zoologists measure "head and body"); gen/animals.ts sets the
 * length and thickens legs with size and gravity. Real-world rules (gait
 * phases, countershading, leg scaling) are in docs/research/animals.md.
 */

export type BodyPlan = 'quadruped' | 'hexapod' | 'biped';
export const BODY_PLANS: readonly BodyPlan[] = ['quadruped', 'hexapod', 'biped'];

export type Diet = 'herbivore' | 'carnivore';

/** The coat's pattern over its countershaded base. */
export type CoatPattern = 'plain' | 'stripes' | 'spots' | 'patches';
export const COAT_PATTERNS: readonly CoatPattern[] = ['plain', 'stripes', 'spots', 'patches'];

export type Vec3 = [number, number, number];

/** A species' body, as the animal lab edits it. Lengths are shares of the body length unless said otherwise. */
export interface AnimalForm {
  readonly plan: BodyPlan;
  /** The animal's own random stream (where spots fall, small asymmetries). */
  readonly seed: number;
  /** Torso depth (belly to back). */
  readonly bodyDepth: number;
  /** Torso width as a share of its depth. */
  readonly bodyWidth: number;
  /** Chest against hips: over 1 a deep chest (a bison), under 1 heavy hindquarters (a kangaroo). */
  readonly chest: number;
  /** 0 to 1: a hump over the shoulders. */
  readonly hump: number;
  /** Leg length: hip to ground, standing (a six-legged animal's legs are this long along their joints). */
  readonly legLength: number;
  /** Leg radius at the hip, as a share of the leg's length. */
  readonly legThickness: number;
  /** Neck length, and how steeply it rises from the shoulders (degrees above level). */
  readonly neckLength: number;
  readonly neckAngle: number;
  /** Head length (skull and snout), and the share of it that is snout. */
  readonly headSize: number;
  readonly snout: number;
  /** Tail length, its radius at the base as a share of the torso's, and how far it's raised (degrees, − droops). */
  readonly tailLength: number;
  readonly tailThickness: number;
  readonly tailRaise: number;
  /** Pairs of horns (0 to 2), their length as a share of the head's, and their curve (− back, + forward). */
  readonly horns: number;
  readonly hornLength: number;
  readonly hornCurve: number;
  /** 0 to 1: ear size (a six-legged animal grows antennae instead). */
  readonly ears: number;
  /** 0 to 1: spines or plates along the back. */
  readonly crest: number;
  /** Eye radius as a share of the skull's radius, and 0 (on the sides, prey) to 1 (facing forward, predators). */
  readonly eyeSize: number;
  readonly eyesForward: number;
  /** A two-legged animal's arms, as a share of its legs (0: none). */
  readonly arms: number;
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

/** What a skeleton is grown from: the body length (units) and the form. */
export interface AnimalShapeInput {
  readonly length: number;
  readonly form: AnimalForm;
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

/**
 * Leg phases (when each foot is furthest back, as a share of a stride),
 * from the gait diagrams of real animals (docs/research/animals.md):
 *  - four legs walk in the lateral sequence, left hind, left fore, right
 *    hind, right fore, a quarter of a stride apart, and trot in diagonal
 *    pairs half a stride apart;
 *  - six legs walk in alternating tripods (front and back of one side with
 *    the middle of the other);
 *  - two legs alternate, and arms swing against the leg on their side.
 */
export const GAIT_PHASES = {
  quadruped: {
    walk: { leftHind: 0, leftFore: 0.25, rightHind: 0.5, rightFore: 0.75 },
    trot: { leftHind: 0.5, leftFore: 0, rightHind: 0, rightFore: 0.5 },
  },
  hexapod: { tripodA: 0, tripodB: 0.5 },
  biped: { left: 0, right: 0.5 },
} as const;

// --- Small vector helpers (allocation is fine: skeletons are built once per species) ---

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mirror = (a: Vec3): Vec3 => [-a[0], a[1], a[2]];
const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** A torso's girth along it, 0 at the rump to 1 at the shoulders: round at both ends, `chest` the front against the back. */
function girth(u: number, chest: number): number {
  const ends = Math.sin(Math.PI * clamp(0.08 + 0.84 * u, 0, 1)) ** 0.42;
  const k = Math.sqrt(chest);
  return ends * (u < 0.5 ? 1 / k + (1 - 1 / k) * (u / 0.5) : 1 + (k - 1) * ((u - 0.5) / 0.5));
}

/** Grows the skeleton of an animal `length` long (snout to rump) with form `form`. */
export function growAnimal(input: AnimalShapeInput): AnimalSkeleton {
  const { length: L, form } = input;
  const plan = form.plan;
  const rng = new Rng(form.seed).fork('grow');
  const head = form.headSize * L;
  const neckLen = form.neckLength * L;
  const neckAngle = (clamp(form.neckAngle, -10, 85) * Math.PI) / 180;
  // The torso is what the head and neck leave of the body length, never under a third of it.
  const neckRun = neckLen * Math.cos(neckAngle);
  const torso = Math.max(L * 0.34, L - head * 0.85 - neckRun);
  const depth = form.bodyDepth * L;
  const ry = depth / 2;
  const rx = ry * form.bodyWidth;
  const leg = form.legLength * L;
  // A sprawling six-legged animal hangs between its knees, a third of its leg length up; the rest stand on theirs.
  const hip = plan === 'hexapod' ? leg * 0.38 : leg;
  const bodyY = hip + ry * (plan === 'hexapod' ? 0.2 : 0.35);
  const rear = -torso / 2;
  const frontZ = torso / 2;

  const spine: SpineNode[] = [];
  const legs: Leg[] = [];
  const spikes: Spike[] = [];
  const eyes: Eye[] = [];

  // --- The tail, tip first, rising or drooping from the rump ---
  const tailLen = form.tailLength * L * (plan === 'hexapod' ? 0 : 1);
  const tailBase: Vec3 = [0, bodyY + ry * 0.25, rear - ry * 0.15];
  const tailR = ry * form.tailThickness;
  if (tailLen > 0.02 * L) {
    const raise = (form.tailRaise * Math.PI) / 180;
    const n = 6;
    const pts: { p: Vec3; r: number; w: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // It leaves the body at its raise and droops towards the tip (a biped's stays level, a counterweight).
      const droop = plan === 'biped' ? 0.15 : 0.55;
      const a = raise - droop * t * t;
      const s = tailLen * t;
      const r = Math.max(tailR * (1 - 0.6 * t), L * 0.01);
      // A long drooping tail lies along the ground rather than through it.
      pts.push({ p: [0, Math.max(r * 1.2, tailBase[1] + Math.sin(a) * s), tailBase[2] - Math.cos(a) * s], r, w: t });
    }
    for (let i = n; i >= 1; i--) {
      const q = pts[i]!;
      spine.push({ p: q.p, rx: q.r, ry: q.r, part: 'tail', w: q.w });
    }
  }

  if (plan === 'hexapod') growInsectBody();
  else growTorso();

  function growTorso(): void {
    // Rump to shoulders: rings of the torso, the back rising into a hump over the shoulders.
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const g = girth(u, form.chest);
      const hump = form.hump * ry * 0.7 * Math.exp(-(((u - 0.78) / 0.18) ** 2));
      spine.push({
        p: [0, bodyY + hump * 0.5 + (plan === 'biped' ? (u - 0.5) * ry * 0.3 : 0), rear + torso * u],
        rx: Math.max(rx * g, L * 0.02),
        ry: Math.max(ry * g + hump * 0.5, L * 0.02),
        part: 'body',
        w: 0,
      });
    }
  }

  function growInsectBody(): void {
    // Abdomen (a big bulb behind), a waist, the thorax that carries the legs.
    const abdomen = torso * 0.55;
    const thorax = torso * 0.4;
    const a0 = rear;
    const nA = 5;
    for (let i = 0; i <= nA; i++) {
      const u = i / nA;
      const g = Math.sin(Math.PI * clamp(0.06 + 0.88 * u, 0, 1)) ** 0.5;
      spine.push({ p: [0, bodyY + ry * 0.25 * (1 - u), a0 + abdomen * u], rx: Math.max(rx * 1.05 * g, L * 0.02), ry: Math.max(ry * 1.05 * g, L * 0.02), part: 'body', w: 0 });
    }
    const t0 = a0 + abdomen + torso * 0.05;
    const nT = 3;
    for (let i = 0; i <= nT; i++) {
      const u = i / nT;
      const g = 0.45 + 0.55 * Math.sin(Math.PI * clamp(0.1 + 0.8 * u, 0, 1));
      spine.push({ p: [0, bodyY, t0 + thorax * u], rx: rx * 0.7 * g, ry: ry * 0.7 * g, part: 'body', w: 0 });
    }
  }

  // --- Neck and head ---
  // The head is a round skull with a short snout ahead of it, the baby schema's big round head (see docs/research/animals.md).
  const last = spine[spine.length - 1]!;
  const neckBase: Vec3 = [0, last.p[1] + last.ry * 0.25, last.p[2]];
  const neckR0 = Math.min(last.rx, last.ry) * 0.6;
  const snoutLen = head * clamp(form.snout, 0, 0.8);
  const skullR = Math.max(L * 0.04, (head - snoutLen * 0.7) / 2);
  const nNeck = Math.max(1, Math.round((neckLen / L) * 6));
  let p = neckBase;
  for (let i = 1; i <= nNeck; i++) {
    const t = i / nNeck;
    p = [0, neckBase[1] + Math.sin(neckAngle) * neckLen * t, neckBase[2] + Math.cos(neckAngle) * neckLen * t];
    const r = neckR0 + (skullR * 0.6 - neckR0) * t;
    spine.push({ p, rx: r * (rx / ry) ** 0.3, ry: r, part: 'head', w: t });
  }
  // Looking ahead, tipped down a little; the skull sits up on the neck's end (a high forehead).
  const tip = Math.max(-0.7, -0.12 - 0.25 * Math.sin(neckAngle));
  const hd: Vec3 = [0, Math.sin(tip), Math.cos(tip)];
  const hu: Vec3 = [0, Math.cos(tip), -Math.sin(tip)];
  const skull = add(add(p, hd, skullR * 0.55), hu, skullR * 0.25);
  // Along the head in skull radii: the round skull's rings (a little wider than tall: round cheeks), then the snout.
  const skullRings: [number, number][] = [
    [-0.72, 0.68],
    [-0.38, 0.93],
    [0, 1],
    [0.38, 0.93],
    [0.68, 0.74],
  ];
  for (const [x, f] of skullRings) spine.push({ p: add(skull, hd, x * skullR), rx: skullR * f * 1.06, ry: skullR * f, part: 'head', w: 1 });
  if (snoutLen > head * 0.06) {
    // The snout sits low on the face, under the eyes, and narrows a little to a round nose.
    const snoutR = skullR * (0.42 + 0.18 * (1 - form.snout));
    const base = add(add(skull, hd, skullR * 0.86), hu, -skullR * 0.22);
    spine.push({ p: base, rx: snoutR * 1.1, ry: snoutR, part: 'head', w: 1 });
    spine.push({ p: add(add(base, hd, snoutLen * 0.75), hu, -snoutLen * 0.08), rx: snoutR * 0.92, ry: snoutR * 0.82, part: 'head', w: 1 });
  }

  // Eyes: big and low on the face, on its sides (prey see round them) or turned to face forward (predators).
  {
    const fwd = clamp(form.eyesForward, 0, 1);
    const er = Math.max(skullR * form.eyeSize, L * 0.01);
    const around = ((70 - 38 * fwd) * Math.PI) / 180;
    const d = add(add([Math.sin(around), 0, 0], hd, Math.cos(around)), hu, -0.1);
    const dir = normalize(d);
    // Sunk into the skull by a third of its radius, looking out and a little ahead.
    const centre = add(skull, dir, skullR * 1.02 - er * 0.35);
    const look = normalize(add(dir, hd, 0.35));
    eyes.push({ centre, radius: er, look }, { centre: mirror(centre), radius: er, look: mirror(look) });
  }

  // Ears, or a six-legged animal's antennae (each ending in a bobble).
  if (plan === 'hexapod') {
    const len = skullR * (1.4 + form.ears * 1.8);
    const base = add(add(skull, hu, skullR * 0.75), hd, skullR * 0.35);
    const pts: Vec3[] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      pts.push(add(add([skullR * 0.28 + len * 0.3 * t, 0, 0], base), add(scale3(hu, len * (0.7 * t - 0.2 * t * t)), scale3(hd, len * 0.55 * t))));
    }
    const radii = pts.map((_, i) => Math.max(L * 0.006, skullR * 0.09 * (1 - i / 6)));
    spikes.push({ points: pts, radii, kind: 'antenna', part: 'head', w: 1 }, { points: pts.map(mirror), radii, kind: 'antenna', part: 'head', w: 1 });
  } else if (form.ears > 0.05) {
    // Round lobes on top of the skull, set back a little, leaning out.
    const len = skullR * (0.55 + form.ears * 0.9);
    const base = add(add(skull, hu, skullR * 0.72), hd, -skullR * 0.15);
    const b0: Vec3 = [skullR * 0.5, base[1], base[2]];
    const pts: Vec3[] = [b0, add(b0, add([len * 0.25, 0, 0], add(scale3(hu, len * 0.5), scale3(hd, -len * 0.1)))), add(b0, add([len * 0.38, 0, 0], add(scale3(hu, len * 0.85), scale3(hd, -len * 0.18))))];
    const radii = [len * 0.28, len * 0.36, len * 0.26];
    spikes.push({ points: pts, radii, kind: 'ear', part: 'head', w: 1 }, { points: pts.map(mirror), radii, kind: 'ear', part: 'head', w: 1 });
  }

  // Horns: stubby rounded pairs on the crown, curving back or forward.
  const pairs = Math.round(clamp(form.horns, 0, 2));
  for (let k = 0; k < pairs; k++) {
    const len = skullR * form.hornLength * 1.4 * (k === 0 ? 1 : 0.65);
    const base = add(add(skull, hu, skullR * 0.82), hd, skullR * (0.15 - 0.45 * k));
    const b0: Vec3 = [skullR * (0.38 + 0.12 * k), base[1], base[2]];
    const pts: Vec3[] = [];
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const curve = form.hornCurve * t * t;
      pts.push(add(b0, add([len * 0.3 * t, 0, 0], add(scale3(hu, len * (0.85 * t - 0.25 * Math.abs(curve) * t)), scale3(hd, len * (0.8 * curve - 0.1 * t))))));
    }
    const radii = pts.map((_, i) => Math.max(L * 0.006, len * (0.24 - 0.12 * (i / n))));
    spikes.push({ points: pts, radii, kind: 'horn', part: 'head', w: 1 }, { points: pts.map(mirror), radii, kind: 'horn', part: 'head', w: 1 });
  }

  // A crest of spines or plates along the back, tallest over the middle.
  if (form.crest > 0.05) {
    const body = spine.filter((s) => s.part === 'body');
    const count = Math.max(3, Math.round(4 + form.crest * 6));
    for (let k = 0; k < count; k++) {
      const u = (k + 0.5) / count;
      const f = u * (body.length - 1);
      const i = Math.min(body.length - 2, Math.floor(f));
      const a = body[i]!;
      const b = body[i + 1]!;
      const t = f - i;
      const top: Vec3 = [0, a.p[1] + (b.p[1] - a.p[1]) * t + (a.ry + (b.ry - a.ry) * t) * 0.9, a.p[2] + (b.p[2] - a.p[2]) * t];
      const h = depth * form.crest * 0.55 * Math.sin(Math.PI * (0.15 + 0.7 * u));
      spikes.push({ points: [top, add(top, [0, h, -h * 0.25])], radii: [h * 0.45, h * 0.26], kind: 'crest', part: 'body', w: 0 });
    }
  }

  // --- Legs ---
  // A six-legged animal's legs are struts (an insect's), thinner than a quadruped's and biped's pillars.
  const legR = Math.max(leg * form.legThickness * (plan === 'hexapod' ? 0.42 : 1), L * 0.01);
  if (plan === 'quadruped') {
    const body = spine.filter((s) => s.part === 'body');
    const hindZ = rear + torso * 0.14;
    const foreZ = frontZ - torso * 0.12;
    const width = (z: number) => {
      const node = body.reduce((best, s) => (Math.abs(s.p[2] - z) < Math.abs(best.p[2] - z) ? s : best));
      return node.rx * 0.62;
    };
    const { walk, trot } = GAIT_PHASES.quadruped;
    legs.push(
      pillarLeg([width(hindZ), hip, hindZ], hip, legR, true, walk.leftHind, trot.leftHind),
      pillarLeg([width(foreZ), hip, foreZ], hip, legR * Math.sqrt(form.chest), false, walk.leftFore, trot.leftFore),
    );
    legs.push(mirrorLeg(legs[0]!, walk.rightHind, trot.rightHind), mirrorLeg(legs[1]!, walk.rightFore, trot.rightFore));
  } else if (plan === 'biped') {
    // The hips under the body's balance point; the torso's front tips up a little over them.
    const hipZ = rear + torso * 0.42;
    const { left, right } = GAIT_PHASES.biped;
    const l = pillarLeg([rx * 0.55, hip, hipZ], hip, legR, true, left, left);
    legs.push(l, mirrorLeg(l, right, right));
    if (form.arms > 0.05) {
      const armLen = leg * form.arms;
      const shoulder: Vec3 = [rx * 0.7, bodyY - ry * 0.2, frontZ - torso * 0.1];
      const pts: Vec3[] = [shoulder, add(shoulder, [rx * 0.1, -armLen * 0.5, -armLen * 0.1]), add(shoulder, [rx * 0.12, -armLen * 0.85, armLen * 0.25])];
      const radii = [legR * 0.45, legR * 0.35, legR * 0.22];
      // Arms swing against the leg on their side.
      const a: Leg = { points: pts, radii, swing: 'pendulum', walk: right, trot: right, arm: true };
      legs.push(a, { points: pts.map(mirror), radii, swing: 'pendulum', walk: left, trot: left, arm: true });
    }
  } else {
    // Six legs from the thorax, fanned forward, out and back, the knees above the body's side.
    const thorax = spine.filter((s) => s.part === 'body').slice(-4);
    const zs = [thorax[0]!.p[2], (thorax[1]!.p[2] + thorax[2]!.p[2]) / 2, thorax[3]!.p[2]];
    const { tripodA, tripodB } = GAIT_PHASES.hexapod;
    const phases = [tripodA, tripodB, tripodA];
    for (let k = 0; k < 3; k++) {
      const fan = (k - 1) * 0.55;
      const outward = leg * 0.62;
      const hipP: Vec3 = [thorax[1]!.rx * 0.8, bodyY - ry * 0.15, zs[k]!];
      const knee: Vec3 = [hipP[0] + outward * 0.45 * Math.cos(fan), hipP[1] + leg * 0.28, hipP[2] + outward * 0.45 * Math.sin(fan)];
      // A round foot resting on the ground.
      const footR = legR * 0.6;
      const foot: Vec3 = [hipP[0] + outward * Math.cos(fan), footR, hipP[2] + outward * Math.sin(fan) * 1.3];
      const ankle: Vec3 = lerp3(knee, foot, 0.75);
      const l: Leg = { points: [hipP, knee, ankle, foot], radii: [legR, legR * 0.8, legR * 0.6, footR], swing: 'sprawl', walk: phases[k]!, trot: phases[k]!, arm: false };
      const other = phases[k] === tripodA ? tripodB : tripodA;
      legs.push(l, mirrorLeg(l, other, other));
    }
  }

  /** A standing leg from `hipP` to the ground: the hind leg's knee forward and hock back (digitigrade), the foreleg's elbow back. */
  function pillarLeg(hipP: Vec3, h: number, r: number, hind: boolean, walk: number, trot: number): Leg {
    const sign = hind ? 1 : -1;
    const bend = 0.12 + 0.1 * rng.next();
    const knee: Vec3 = [hipP[0], hipP[1] - h * 0.45, hipP[2] + sign * h * bend];
    const ankle: Vec3 = [hipP[0], Math.max(r * 1.4, h * (hind ? 0.2 : 0.15)), hipP[2] - sign * h * bend * 0.6];
    // A round paw resting on the ground: its centre a paw's radius up.
    const paw = r * 0.82;
    const toe: Vec3 = [hipP[0], paw, ankle[2] + h * 0.08];
    return { points: [hipP, knee, ankle, toe], radii: [r, r * 0.8, r * 0.66, paw], swing: 'pendulum', walk, trot, arm: false };
  }

  function mirrorLeg(l: Leg, walk: number, trot: number): Leg {
    return { ...l, points: l.points.map(mirror), walk, trot };
  }

  // --- Extents ---
  let top = 0;
  let front = -Infinity;
  let backZ = Infinity;
  let width = 0;
  for (const s of spine) {
    top = Math.max(top, s.p[1] + s.ry);
    front = Math.max(front, s.p[2] + s.rx * 0.5);
    backZ = Math.min(backZ, s.p[2] - s.rx * 0.5);
    width = Math.max(width, s.rx);
  }
  for (const k of [...spikes, ...legs]) {
    for (const q of k.points) {
      top = Math.max(top, q[1]);
      front = Math.max(front, q[2]);
      backZ = Math.min(backZ, q[2]);
      width = Math.max(width, Math.abs(q[0]));
    }
  }
  return {
    plan,
    spine,
    legs,
    spikes,
    eyes,
    neckBase,
    tailBase,
    hipHeight: hip,
    legLength: leg,
    top,
    front,
    back: backZ,
    width,
  };
}

// --- Generation ---

/** Ranges the generator draws each number from, by body plan (the lab's sliders go wider). */
const RANGES: Record<BodyPlan, { legLength: readonly [number, number]; neckLength: readonly [number, number]; tailLength: readonly [number, number] }> = {
  quadruped: { legLength: [0.24, 0.5], neckLength: [0.04, 0.28], tailLength: [0.15, 0.7] },
  hexapod: { legLength: [0.4, 0.65], neckLength: [0, 0.04], tailLength: [0, 0] },
  biped: { legLength: [0.38, 0.68], neckLength: [0.08, 0.32], tailLength: [0.4, 0.8] },
};

/**
 * A random form of body plan `plan` and diet `diet`, its coat near hue
 * `hue` (degrees). Cute by the baby schema (Lorenz's Kindchenschema: a big
 * round head, big eyes set low, a short snout, a plump round body, short
 * thick limbs; docs/research/animals.md). Herbivores have eyes on the sides
 * of their heads and often horns (stubby ones); carnivores' eyes face
 * forward. Coats are bright and countershaded: a darker back over a pale belly.
 */
export function generateAnimalForm(rng: Rng, plan: BodyPlan, diet: Diet, hue: number): AnimalForm {
  const r = RANGES[plan];
  const predator = diet === 'carnivore';
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
    bodyDepth: rng.range(0.34, 0.48) * (plan === 'hexapod' ? 0.85 : 1),
    bodyWidth: rng.range(0.88, 1.2),
    chest: rng.range(0.88, 1.2),
    hump: rng.chance(0.2) ? rng.range(0.2, 0.7) : 0,
    legLength: rng.range(r.legLength[0], r.legLength[1]),
    legThickness: rng.range(0.1, 0.15),
    neckLength: rng.range(r.neckLength[0], r.neckLength[1]),
    neckAngle: plan === 'hexapod' ? 0 : rng.range(25, 60),
    headSize: rng.range(0.32, 0.44),
    snout: predator ? rng.range(0.08, 0.3) : rng.range(0.05, 0.32),
    tailLength: rng.range(r.tailLength[0], r.tailLength[1]),
    tailThickness: plan === 'biped' ? rng.range(0.4, 0.6) : rng.range(0.2, 0.45),
    tailRaise: plan === 'biped' ? rng.range(-5, 15) : rng.range(-20, 45),
    horns: !predator && plan !== 'hexapod' && rng.chance(0.45) ? (rng.chance(0.2) ? 2 : 1) : 0,
    hornLength: rng.range(0.25, 0.7),
    hornCurve: rng.range(-1, 1),
    ears: plan === 'hexapod' ? rng.range(0.2, 0.9) : rng.chance(0.85) ? rng.range(0.35, 1.1) : 0,
    crest: rng.chance(predator ? 0.15 : 0.2) ? rng.range(0.2, 0.6) : 0,
    eyeSize: rng.range(0.27, 0.38),
    eyesForward: predator ? rng.range(0.65, 1) : rng.range(0, 0.25),
    arms: plan === 'biped' && rng.chance(0.6) ? rng.range(0.25, 0.5) : 0,
    pattern,
    patternScale: rng.range(1, 2.5),
    color: hslToHex(h, sat, light),
    belly: hslToHex(h + rng.range(-10, 10), sat * 0.45, Math.min(0.9, light + rng.range(0.25, 0.35))),
    patternColor: hslToHex(patternHue, Math.min(0.85, sat + 0.1), rng.chance(0.5) ? light * 0.55 : Math.min(0.9, light + 0.28)),
    accentColor: hslToHex(rng.range(20, 45), rng.range(0.15, 0.4), rng.range(0.6, 0.82)),
    eyeColor: hslToHex(rng.range(0, 360), rng.range(0.55, 0.9), rng.range(0.3, 0.5)),
  };
}
