import { faceGridPoint, type Vec3Like } from '../world/cubeSphereMath';
import { generateAnimalForm, legGirthFor, type AnimalForm, type AnimalSkeleton, type BodyPlan, type Diet } from './animalForm';
import type { Habitability } from './climate';
import { generateName } from './names';
import { MIN_ELEVATION, fertility, localTemperature, type GroundRadius } from './plants';
import { animalGait, type AnimalGait } from './gait';
import { Rng, hashSeed } from './rng';
import { speciesBody } from './speciesBody';

export { EARTH_G, STRIDE_COEFFICIENT, STRIDE_EXPONENT, TROT_FROUDE, WALK_FROUDE, animalGait, type AnimalGait } from './gait';

/*
 * Animals on habitable bodies (the animal lab): which species a planet has
 * (from its seed and habitability tier, so a world terraformed to a higher
 * tier gains more of them) and where their herds roam. Pure data, no THREE:
 * the view is in src/surface/ (SurfaceAnimals). A species is a body length,
 * a diet, a climate window and a herd size plus its `AnimalForm`, the body
 * gen/animalForm.ts grows; the animal lab (animals.html) edits them all.
 *
 * Herds live in cells of the cube-sphere grid, like plants: a cell's herd
 * (or none) depends only on the planet's seed and the cell's address. Where
 * a herd is at any moment is a pure function of the clock, so it's the same
 * whenever and from wherever it's looked at, with nothing simulated while
 * no one watches: the herd walks from waypoint to waypoint on a grid of time
 * slots (a slot's waypoint is hashed from the herd and the slot's number,
 * somewhere on land in its home range), resting (grazing) between walks.
 * Each animal follows the herd's path a little behind or ahead of it, at its
 * own place in the herd.
 *
 * Gaits follow dynamic similarity (Alexander): animals of any size walk at
 * the same Froude number v²/(g·h), h the hip height, and take strides the
 * same number of hip heights long, so a low-gravity world's animals walk
 * slower and a small animal patters. Abundance falls with body mass (Damuth)
 * and carnivores are far rarer than their prey (Carbone & Gittleman).
 * Numbers and sources: docs/research/animals.md. Sizes are in planet-level
 * units, read as metres for the gait (the UFO is ~4 wide, trees 6–11 tall).
 */

/** A species, as the animal lab edits it. */
export interface AnimalSpecies {
  readonly index: number;
  readonly name: string;
  readonly diet: Diet;
  /** Head and body, snout to rump (units). */
  readonly length: number;
  /** Annual mean temperature window (K). */
  readonly minTemperature: number;
  readonly maxTemperature: number;
  /** Relative abundance, before the mass rule. */
  readonly weight: number;
  /** Animals in a herd (or a pack, or alone). */
  readonly herdMin: number;
  readonly herdMax: number;
  readonly form: AnimalForm;
}

/** Herbivore and carnivore species per habitability tier (T0 has none): the higher the tier, the longer the food chain. */
export const HERBIVORES_PER_TIER: readonly number[] = [0, 1, 2, 3];
export const CARNIVORES_PER_TIER: readonly number[] = [0, 0, 1, 2];
/** Chance a herd cell holds a herd, by tier (before fertility and temperature). */
export const HERD_CHANCE_PER_TIER: readonly number[] = [0, 0.35, 0.55, 0.75];

/**
 * Size classes a planet's herbivores are drawn from, smallest first
 * (head-and-body length, units). Stylised up from real animals (a fox to a
 * bison is 0.6–3 m), Spore-like, so they read from the UFO's height next to
 * its 4 units and trees of 6–11; their gait treats a unit as a metre.
 */
export const SIZE_CLASSES: readonly (readonly [number, number])[] = [
  [1.2, 2.2],
  [2.4, 4.0],
  [4.4, 7.0],
];

/**
 * Damuth's rule: mammal herbivores' population density D ≈ 17,000·W^−0.75
 * per km² (W in grams; 307 species, scattered tenfold either way), so a
 * smaller species' herds are commoner by its mass ratio to the −0.75
 * (docs/research/animals.md).
 */
export const DAMUTH_EXPONENT = -0.75;
/**
 * Carnivores' packs come this much less often than herbivores' herds of the
 * same mass. Carbone & Gittleman: 10,000 kg of prey supports about 90 kg of
 * a carnivore, 0.9% of the biomass, which for a herd of eight 100 kg grazers
 * is a fourteenth of a 100 kg hunter: a pack of three per ~40 herds. Stylised
 * up about fivefold so a player meets one (docs/research/animals.md).
 */
export const CARNIVORE_SHARE = 0.15;

/**
 * Young per adult in a herd or pack: deer and elk herds count 20–45 calves
 * per 100 cows, about a fifth of the herd (docs/research/animals.md). A lone
 * animal has none; a pair may have one.
 */
export const YOUNG_PER_ADULT: readonly [number, number] = [0.2, 0.45];
/** An adult's own size (times its species' length), from its id. */
export const ADULT_SCALE: readonly [number, number] = [0.85, 1.15];
/** A young one's: its species' body, scaled down (stylised, as Spore's babies: small enough to read as young from the ship). */
export const YOUNG_SCALE: readonly [number, number] = [0.5, 0.67];

/** Cells are about this many units across (planet-level); a herd roams within HOME_RANGE of its home. */
export const HERD_CELL_SIZE = 96;
export const HOME_RANGE = 36;
/** A carnivore pack roams this much further. */
export const PACK_RANGE_FACTOR = 1.8;
/** Steepest ground an animal walks or rests on (rise over run). */
export const MAX_ANIMAL_SLOPE = 0.6;
/** Ground this high (share of the relief above sea level) is too high: snowy peaks. */
export const MAX_ANIMAL_ELEVATION = 0.8;

/** Everything a planet's animals come from. */
export interface AnimalPlan {
  readonly seed: number;
  readonly tier: Habitability;
  readonly species: readonly AnimalSpecies[];
  /** Mean surface temperature, K. */
  readonly temperature: number;
  /** Surface gravity, Earth = 1. */
  readonly gravity: number;
  /** Sea-level radius and the highest terrain's; whether the low ground is sea (animals swim across it, not along its floor). */
  readonly radius: number;
  readonly peak: number;
  readonly sea: boolean;
  /** Chance a herd cell holds a herd. */
  readonly herdChance: number;
}

export interface AnimalInput {
  readonly seed: number;
  readonly tier: Habitability;
  readonly temperature: number;
  readonly gravity: number;
  readonly radius: number;
  readonly peak: number;
  readonly sea: boolean;
}

/** The animals of a body, or null if it has none (tier 0). Plants come first: animals live only where plants grow (see `growsPlants`). */
export function planAnimals(input: AnimalInput): AnimalPlan | null {
  const { tier } = input;
  if (tier < 1) return null;
  const rng = new Rng(input.seed).fork('animals');
  // One palette per planet: earthy coats on Earth-likes, stranger ones elsewhere.
  const hue = tier === 3 ? rng.range(15, 50) : rng.range(0, 360);
  const species: AnimalSpecies[] = [];
  const herbivores = HERBIVORES_PER_TIER[tier]!;
  // Herbivores take the size classes in a planet's own order; carnivores are mid-sized hunters.
  const classes = [0, 1, 2].sort((a, b) => hashSeed(input.seed, 'size', a) - hashSeed(input.seed, 'size', b));
  for (let i = 0; i < herbivores; i++) species.push(generateAnimalSpecies(rng.fork('species', i), species.length, 'herbivore', classes[i % 3]!, hue, input.gravity));
  for (let i = 0; i < CARNIVORES_PER_TIER[tier]!; i++) species.push(generateAnimalSpecies(rng.fork('carnivore', i), species.length, 'carnivore', i === 0 ? 1 : 0, hue, input.gravity));
  return {
    seed: input.seed,
    tier,
    species,
    temperature: input.temperature,
    gravity: input.gravity,
    radius: input.radius,
    peak: input.peak,
    sea: input.sea,
    herdChance: HERD_CHANCE_PER_TIER[tier]!,
  };
}

const HERBIVORE_NOUNS: Record<BodyPlan, string> = { quadruped: 'grazer', hexapod: 'crawler', biped: 'strider' };
const CARNIVORE_NOUNS: Record<BodyPlan, string> = { quadruped: 'stalker', hexapod: 'skitterer', biped: 'raptor' };

/** Species number `index` of diet `diet` in size class `size` (index into SIZE_CLASSES), its coat near hue `hue`; a planet's are made by `planAnimals`. */
export function generateAnimalSpecies(rng: Rng, index: number, diet: Diet, size: number, hue: number, gravity = 1): AnimalSpecies {
  const range = SIZE_CLASSES[Math.min(SIZE_CLASSES.length - 1, Math.max(0, size))]!;
  const length = rng.range(range[0], range[1]);
  // Small animals are often six-legged, big ones four-legged; two legs anywhere.
  const plan = rng.weighted<BodyPlan>([
    ['quadruped', 3],
    ['hexapod', size === 0 ? 2 : size === 1 ? 0.8 : 0.3],
    ['biped', 1.2],
  ]);
  const name = generateName(rng);
  const formRng = rng.fork('form');
  const form: AnimalForm = { ...generateAnimalForm(formRng, plan, hue), legGirth: legGirthFor(length, gravity) };
  const nouns = diet === 'carnivore' ? CARNIVORE_NOUNS : HERBIVORE_NOUNS;
  // Grazers' herds are tens to thousands and predators' groups about 5–15 (docs/research/animals.md): fewer here, to draw.
  const herd: readonly [number, number] = diet === 'carnivore' ? [rng.int(1, 2), rng.int(3, 6)] : [rng.int(3, 5), rng.int(7, 16)];
  return {
    index,
    name: `${name} ${nouns[plan]}`,
    diet,
    length,
    minTemperature: 258 + rng.range(-8, 8),
    maxTemperature: 318 + rng.range(-8, 8),
    weight: rng.range(0.6, 1.4),
    herdMin: herd[0],
    herdMax: Math.max(herd[0], herd[1]),
    form,
  };
}

/**
 * Body mass in kg from hip height (units ≈ m), inverting mammals' hind limb
 * length 0.163·M^0.36 m (Kilbourne & Hoffman's 44 species, fitted by
 * Mohamed Thangal & Donelan): 0.16 m at 1 kg, 0.86 m at 100 kg
 * (docs/research/animals.md). Used for the abundance rule.
 */
export function animalMass(hipHeight: number): number {
  return (Math.max(0.01, hipHeight) / 0.163) ** (1 / 0.36);
}

const hips = new WeakMap<AnimalSpecies, number>();

/** A species' standing hip height (units), from its body (kept per species object). */
export function hipHeightOf(s: AnimalSpecies): number {
  let h = hips.get(s);
  if (h === undefined) {
    h = speciesBody(s).grown.hipHeight;
    hips.set(s, h);
  }
  return h;
}

// --- Herds ---

/** One herd (or pack), from its cell: who, where it lives and how it keeps time. */
export interface HerdData {
  /** Stable: `face:i:j`; its animals are `<id>:<k>`. */
  readonly id: string;
  readonly species: number;
  /** Its animals, young included: the last `young` of them are young, each keeping beside an adult. */
  readonly count: number;
  readonly young: number;
  /** Home: unit direction (body frame). */
  readonly home: Vec3Like;
  /** How far from home its waypoints fall (units). */
  readonly range: number;
  /** Seconds per time slot (a walk, then a rest), and when its slots start. */
  readonly slot: number;
  readonly offset: number;
  /** Its own stream of waypoints and timings. */
  readonly seed: number;
  /**
   * A herd of one the player set down (issue #166): the clock (seconds) when
   * it landed. Its walk starts then, from home, standing as it landed (facing
   * `facing`), so it doesn't jump to wherever the clock would have it.
   */
  readonly landed?: number;
  /** Which way it faced as it landed: radians from the home's first tangent towards its second (`tangentBasis`). */
  readonly facing?: number;
}

/** Cells per cube face edge. */
export function herdGridSize(radius: number): number {
  return Math.max(1, Math.round((radius * Math.PI * 0.5) / HERD_CELL_SIZE));
}

/** Whether an animal can stand at `dir` (ground radius `r`): on land (or swimming, on a sea world, only on the way between), below the snow, not too steep. */
export function habitable(plan: AnimalPlan, ground: GroundRadius, dir: Vec3Like, r = ground(dir)): boolean {
  const relief = Math.max(1e-6, plan.peak - plan.radius);
  const elevation = (r - plan.radius) / relief;
  if (elevation < MIN_ELEVATION || elevation > MAX_ANIMAL_ELEVATION) return false;
  return slopeAt(ground, dir, r) <= MAX_ANIMAL_SLOPE;
}

/**
 * The herd of cell (`face`, `i`, `j`) on a grid of `herdGridSize`, or null:
 * a spot drawn in the cell must be habitable ground, warm enough for the
 * species it draws, and win against the herd chance (herbivores like the
 * lush patches plants like). Deterministic from the plan's seed and the
 * cell's address.
 */
export function generateHerd(plan: AnimalPlan, ground: GroundRadius, face: number, i: number, j: number): HerdData | null {
  if (plan.species.length === 0) return null;
  const n = herdGridSize(plan.radius);
  const rng = new Rng(plan.seed).fork('herd', face, i, j);
  const u = 0.15 + 0.7 * rng.next();
  const v = 0.15 + 0.7 * rng.next();
  const keepRoll = rng.next();
  const speciesRoll = rng.next();
  const countRoll = rng.next();
  const seed = rng.int(0, 0x7fffffff);
  const slotRoll = rng.next();
  const offsetRoll = rng.next();
  const home = faceGridPoint(face, i + u, j + v, n, { x: 0, y: 0, z: 0 });
  if (!habitable(plan, ground, home)) return null;
  const f = fertility(home.x, home.y, home.z, plan.seed);
  const temperature = localTemperature(plan.temperature, Math.asin(Math.max(-1, Math.min(1, home.y))));
  // Each herbivore's share: abundance, Damuth's mass rule, its climate window, and lush ground; the hunters
  // together take CARNIVORE_SHARE of the herbivores' (Carbone & Gittleman), split by their abundance and climate.
  const climates = plan.species.map((s) => {
    const out = Math.max(s.minTemperature - temperature, temperature - s.maxTemperature, 0);
    return Math.max(0, 1 - out / 8);
  });
  let grazing = 0;
  let hunting = 0;
  let suits = 0;
  const weights = plan.species.map((s, k) => {
    if (s.diet === 'carnivore') {
      hunting += s.weight * climates[k]!;
      return s.weight * climates[k]!;
    }
    const lush = 0.4 + 0.6 * f;
    suits = Math.max(suits, climates[k]! * lush);
    const mass = Math.min(8, (animalMass(hipHeightOf(s)) / animalMass(0.5)) ** DAMUTH_EXPONENT);
    const w = s.weight * mass * climates[k]! * lush;
    grazing += w;
    return w;
  });
  const hunterScale = hunting > 0 ? (CARNIVORE_SHARE * grazing) / hunting : 0;
  let total = 0;
  plan.species.forEach((s, k) => {
    if (s.diet === 'carnivore') weights[k] = weights[k]! * hunterScale;
    total += weights[k]!;
  });
  // A cell holds a herd at the tier's chance, less where no species likes it (too cold, barren).
  if (total <= 0 || keepRoll >= plan.herdChance * suits) return null;
  let pick = speciesRoll * total;
  let chosen = plan.species.length - 1;
  for (let k = 0; k < weights.length; k++) {
    pick -= weights[k]!;
    if (pick < 0) {
      chosen = k;
      break;
    }
  }
  const s = plan.species[chosen]!;
  const carnivore = s.diet === 'carnivore';
  const adults = s.herdMin + Math.floor(countRoll * (s.herdMax - s.herdMin + 1));
  // Hashed, not drawn: the stream above is the herd's as it always was.
  const share = YOUNG_PER_ADULT[0] + ((hashSeed(seed, 'young') & 0xffff) / 0x10000) * (YOUNG_PER_ADULT[1] - YOUNG_PER_ADULT[0]);
  const young = Math.round(adults * share);
  return {
    id: `${face}:${i}:${j}`,
    species: chosen,
    count: adults + young,
    young,
    home: { x: home.x, y: home.y, z: home.z },
    range: HOME_RANGE * (carnivore ? PACK_RANGE_FACTOR : 1),
    slot: (carnivore ? 50 : 30) + slotRoll * (carnivore ? 60 : 40),
    offset: offsetRoll * 1000,
    seed,
  };
}

/** Whether member `k` of a herd is young. */
export function isYoung(herd: Pick<HerdData, 'count' | 'young'>, k: number): boolean {
  return k >= herd.count - herd.young;
}

/** Member `k`'s size, times its species' length: adults vary a little about it, the young are scaled down. */
export function memberScale(herd: Pick<HerdData, 'count' | 'young' | 'seed'>, k: number): number {
  const [lo, hi] = isYoung(herd, k) ? YOUNG_SCALE : ADULT_SCALE;
  return lo + ((hashSeed(herd.seed, 'size', k) & 0xffff) / 0x10000) * (hi - lo);
}

/** The adult a young member keeps beside (its mother; twins share one), or -1 for an adult. */
export function motherOf(herd: Pick<HerdData, 'count' | 'young' | 'seed'>, k: number): number {
  if (!isYoung(herd, k)) return -1;
  return hashSeed(herd.seed, 'mother', k) % (herd.count - herd.young);
}

// --- Where a herd is ---

/** A herd's two waypoints for a slot (kept by `HerdPath` so they aren't searched for again every frame). */
interface SlotPath {
  slot: number;
  from: Vec3Like;
  to: Vec3Like;
  /** Angle between them (radians on the unit sphere) and the walk's distance (units). */
  angle: number;
  distance: number;
}

/** An animal's pose at a moment: where it stands, which way it faces, and how its body moves. */
export interface AnimalPose {
  /** Unit direction from the planet's centre (body frame). */
  x: number;
  y: number;
  z: number;
  /** Unit heading, along the ground. */
  hx: number;
  hy: number;
  hz: number;
  /** Stride cycles walked so far in this walk (the legs' phase is its fraction). */
  cycle: number;
  /** 0 standing to 1 at full stride (speed over the gait's walking speed, capped). */
  stride: number;
  /** 0 walking to 1 trotting (which leg phases). */
  trot: number;
  /** 0 to 1: head down, grazing. */
  graze: number;
  /** Seconds, for idle motions (the tail's sway, ears). */
  idle: number;
}

/** Extra time each animal of a herd lags (or leads) its path, at most, seconds: they start and stop a little apart. */
const MEMBER_LAG = 3;
/** Animals of a herd stand about this many body lengths apart. */
const MEMBER_SPACING = 1.7;
/** A young one keeps about this many of its species' lengths from its mother, and lags her by at most this (s). */
const YOUNG_SPACING = 0.75;
const YOUNG_LAG = 0.6;
/** Slots' waypoints a herd keeps (its animals' lags span a few). */
const SLOT_CACHE = 6;
/** Seconds a herd takes to turn towards its next waypoint before setting off. */
const TURN_TIME = 3;
/** Seconds an animal set down takes to start looking about and grazing. */
const SETTLE_TIME = 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * One herd's path through time, with the waypoints of the slot it is in
 * kept, so posing its animals every frame costs a few multiplications and
 * a ground sample each. Pure in what it returns: the same moment gives the
 * same pose whatever was asked before.
 */
export class HerdPath {
  private readonly cache: SlotPath[] = [];
  /** Two unit vectors across the ground at the herd's home: the members' places (and a panic's flight, gen/panic.ts) are offsets along them. */
  readonly e1: Vec3Like = { x: 0, y: 0, z: 0 };
  readonly e2: Vec3Like = { x: 0, y: 0, z: 0 };
  /** The last `pose`d member's speed along the ground (units/s). */
  speed = 0;
  /** Each member's offset from the herd's centre (units, in the home's tangent basis), lag (s) and grazing phase. */
  private readonly offsets: Float64Array;
  private readonly lags: Float64Array;
  private readonly phases: Float64Array;
  /** Each member's size (times its species' length: `memberScale`, or as given) and the adult each young one keeps beside (-1: an adult). */
  readonly scales: Float32Array;
  readonly mothers: Int32Array;
  readonly gait: AnimalGait;
  readonly species: AnimalSpecies;
  /** Added to the clock for its slots: the herd's offset, or for one set down, whatever starts its first slot (0) as it lands. */
  private readonly shift: number;

  constructor(
    readonly plan: AnimalPlan,
    readonly ground: GroundRadius,
    readonly herd: HerdData,
    skeleton: Pick<AnimalSkeleton, 'hipHeight'>,
    scales?: Float32Array,
  ) {
    this.species = plan.species[herd.species]!;
    this.gait = animalGait(skeleton, plan.gravity);
    tangentBasis(herd.home, this.e1, this.e2);
    const n = herd.count;
    this.offsets = new Float64Array(n * 2);
    this.lags = new Float64Array(n);
    this.phases = new Float64Array(n);
    this.scales = scales ?? Float32Array.from({ length: n }, (_, k) => memberScale(herd, k));
    this.mothers = Int32Array.from({ length: n }, (_, k) => motherOf(herd, k));
    const rng = new Rng(herd.seed).fork('members');
    const spacing = MEMBER_SPACING * this.species.length;
    const adults = n - herd.young;
    for (let k = 0; k < adults; k++) {
      // A sunflower: evenly packed, round, jittered.
      const r = k === 0 ? 0 : spacing * Math.sqrt(k + 0.3) * rng.range(0.75, 1.15);
      const a = k * GOLDEN_ANGLE + rng.range(-0.4, 0.4);
      this.offsets[k * 2] = Math.cos(a) * r;
      this.offsets[k * 2 + 1] = Math.sin(a) * r;
      this.lags[k] = rng.range(-1, 1) * MEMBER_LAG;
      this.phases[k] = rng.range(0, 1000);
    }
    // The young keep at their mothers' sides, starting and stopping with them.
    for (let k = adults; k < n; k++) {
      const m = this.mothers[k]!;
      const r = YOUNG_SPACING * this.species.length * rng.range(0.8, 1.2);
      const a = rng.range(0, Math.PI * 2);
      this.offsets[k * 2] = this.offsets[m * 2]! + Math.cos(a) * r;
      this.offsets[k * 2 + 1] = this.offsets[m * 2 + 1]! + Math.sin(a) * r;
      this.lags[k] = this.lags[m]! + rng.range(-1, 1) * YOUNG_LAG;
      this.phases[k] = rng.range(0, 1000);
    }
    this.shift = herd.landed === undefined ? herd.offset : -herd.landed - this.lags[0]!;
  }

  /** The waypoint at the start of slot `k`: somewhere habitable in the home range, else home (always, up to the slot one set down lands in). */
  waypoint(k: number, out: Vec3Like): Vec3Like {
    const { herd, plan, ground } = this;
    const R = plan.radius;
    const roams = herd.landed === undefined || k > 0;
    for (let attempt = 0; roams && attempt < 3; attempt++) {
      const h = hashSeed(herd.seed, 'waypoint', k, attempt);
      const a = ((h & 0xffff) / 0x10000) * Math.PI * 2;
      const r = Math.sqrt((h >>> 16) / 0x10000) * herd.range;
      const ox = (Math.cos(a) * r) / R;
      const oy = (Math.sin(a) * r) / R;
      const x = herd.home.x + this.e1.x * ox + this.e2.x * oy;
      const y = herd.home.y + this.e1.y * ox + this.e2.y * oy;
      const z = herd.home.z + this.e1.z * ox + this.e2.z * oy;
      const l = Math.hypot(x, y, z);
      out.x = x / l;
      out.y = y / l;
      out.z = z / l;
      if (habitable(plan, ground, out)) return out;
    }
    out.x = herd.home.x;
    out.y = herd.home.y;
    out.z = herd.home.z;
    return out;
  }

  private slotPath(k: number): SlotPath {
    for (const c of this.cache) if (c.slot === k) return c;
    let path: SlotPath;
    if (this.cache.length < SLOT_CACHE) {
      path = { slot: k, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, angle: 0, distance: 0 };
      this.cache.push(path);
    } else {
      // Reuse the slot furthest from this one (never one just asked for: they're all near each other in time).
      path = this.cache.reduce((far, c) => (Math.abs(c.slot - k) > Math.abs(far.slot - k) ? c : far));
    }
    path.slot = k;
    this.waypoint(k, path.from);
    this.waypoint(k + 1, path.to);
    const dot = Math.max(-1, Math.min(1, path.from.x * path.to.x + path.from.y * path.to.y + path.from.z * path.to.z));
    path.angle = Math.acos(dot);
    path.distance = path.angle * this.plan.radius;
    return path;
  }

  /** Seconds after slot `k`'s start that its walk begins, and how long it takes (0: nowhere to go). */
  private walkTiming(path: SlotPath): { start: number; duration: number; pace: number } {
    const { herd, gait } = this;
    // The walking pace, or a trot when the slot is too short for it; the walk starts after a hashed wait (time to turn first).
    const pace = Math.max(gait.walkSpeed, path.distance / (herd.slot * 0.75));
    const duration = path.distance / pace;
    const start = TURN_TIME + ((hashSeed(herd.seed, 'start', path.slot) & 0xffff) / 0x10000) * Math.max(0, herd.slot - duration - TURN_TIME) * 0.6;
    this.timing.start = start;
    this.timing.duration = duration;
    this.timing.pace = pace;
    return this.timing;
  }

  private readonly timing = { start: 0, duration: 0, pace: 0 };
  private readonly heading: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly arrival: Vec3Like = { x: 0, y: 0, z: 0 };

  /** The direction of travel along a slot's path at share `s` (unit-ish, not yet made tangent), or the herd's resting direction if it goes nowhere. */
  private headingAt(path: SlotPath, s: number, out: Vec3Like): Vec3Like {
    const { from, to, angle } = path;
    if (angle < 1e-7) {
      const a = this.herd.facing ?? (this.herd.seed % 628) / 100;
      out.x = this.e1.x * Math.cos(a) + this.e2.x * Math.sin(a);
      out.y = this.e1.y * Math.cos(a) + this.e2.y * Math.sin(a);
      out.z = this.e1.z * Math.cos(a) + this.e2.z * Math.sin(a);
      return out;
    }
    // d/ds of the slerp.
    const sin = Math.sin(angle);
    const da = -Math.cos((1 - s) * angle) / sin;
    const db = Math.cos(s * angle) / sin;
    out.x = from.x * da + to.x * db;
    out.y = from.y * da + to.y * db;
    out.z = from.z * da + to.z * db;
    const l = Math.hypot(out.x, out.y, out.z) || 1;
    out.x /= l;
    out.y /= l;
    out.z /= l;
    return out;
  }

  /**
   * Member `k`'s pose at time `t` (seconds): where the herd's centre is on
   * its walk between this slot's waypoints at the member's own lagged time,
   * plus its place in the herd, facing the way the herd goes (turning
   * towards the next waypoint in the seconds before it sets off). Writes `out`.
   */
  pose(k: number, t: number, out: AnimalPose): AnimalPose {
    const { herd, gait, species } = this;
    const time = t + this.shift + this.lags[k]!;
    const slotIndex = Math.floor(time / herd.slot);
    const within = time - slotIndex * herd.slot;
    const path = this.slotPath(slotIndex);
    const distance = path.distance;
    const { start, duration } = this.walkTiming(path);
    const u = duration > 0 ? Math.max(0, Math.min(1, (within - start) / duration)) : 1;
    // Smoothstep: accelerating, walking, slowing; speed = ds/du / duration.
    const s = u * u * (3 - 2 * u);
    const speed = duration > 0 && u > 0 && u < 1 ? (distance * 6 * u * (1 - u)) / duration : 0;
    // The centre along the great circle from `from` to `to`.
    const { from, to, angle } = path;
    let cx = from.x;
    let cy = from.y;
    let cz = from.z;
    if (angle >= 1e-7) {
      const sin = Math.sin(angle);
      const a = Math.sin((1 - s) * angle) / sin;
      const b = Math.sin(s * angle) / sin;
      cx = from.x * a + to.x * b;
      cy = from.y * a + to.y * b;
      cz = from.z * a + to.z * b;
    }
    // Heading: the path's; before the walk, turning from the way the last walk arrived.
    const h = this.headingAt(path, s, this.heading);
    let hx = h.x;
    let hy = h.y;
    let hz = h.z;
    if (within < start) {
      const prev = this.slotPath(slotIndex - 1);
      const arrived = this.headingAt(prev, 1, this.arrival);
      const turn = smoothstep(start - TURN_TIME, start, within);
      hx = arrived.x + (hx - arrived.x) * turn;
      hy = arrived.y + (hy - arrived.y) * turn;
      hz = arrived.z + (hz - arrived.z) * turn;
      // Turning right round: through the side, not through nothing.
      if (Math.hypot(hx, hy, hz) < 0.2) {
        hx += (cy * arrived.z - cz * arrived.y) * 0.5;
        hy += (cz * arrived.x - cx * arrived.z) * 0.5;
        hz += (cx * arrived.y - cy * arrived.x) * 0.5;
      }
    }
    // The member's place in the herd (the offset is tangent at home: close enough over a home range).
    const R = this.plan.radius;
    const ox = this.offsets[k * 2]! / R;
    const oy = this.offsets[k * 2 + 1]! / R;
    let x = cx + this.e1.x * ox + this.e2.x * oy;
    let y = cy + this.e1.y * ox + this.e2.y * oy;
    let z = cz + this.e1.z * ox + this.e2.z * oy;
    const l = Math.hypot(x, y, z);
    x /= l;
    y /= l;
    z /= l;
    // Seconds since the last walk ended or until the next starts: resting animals look about, more the longer they rest.
    const restFor = u >= 1 ? within - start - duration : u <= 0 ? start - within : 0;
    // One set down stands as it landed, then eases into looking about.
    const settling = herd.landed === undefined ? 1 : smoothstep(0, SETTLE_TIME, t - herd.landed);
    const rest = Math.min(1, restFor / TURN_TIME) * settling;
    const idle = this.phases[k]! + t;
    if (rest > 0) {
      const turn = rest * (0.5 * Math.sin(idle * 0.07) + 0.3 * Math.sin(idle * 0.19 + k));
      const px = y * hz - z * hy;
      const py = z * hx - x * hz;
      const pz = x * hy - y * hx;
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      hx = hx * c + px * sn;
      hy = hy * c + py * sn;
      hz = hz * c + pz * sn;
    }
    const dot = hx * x + hy * y + hz * z;
    hx -= dot * x;
    hy -= dot * y;
    hz -= dot * z;
    const hl = Math.hypot(hx, hy, hz) || 1;
    out.x = x;
    out.y = y;
    out.z = z;
    out.hx = hx / hl;
    out.hy = hy / hl;
    out.hz = hz / hl;
    // Its own size's gait (dynamic similarity: speeds as the root of its size, strides as its size), so a young one keeping up trots.
    const size = this.scales[k]!;
    const root = Math.sqrt(size);
    const trot = smoothstep(gait.walkSpeed * root, gait.trotSpeed * root, speed);
    const stride = (gait.walkStride + (gait.trotStride - gait.walkStride) * trot) * size;
    out.trot = trot;
    out.stride = Math.min(1, speed / (gait.walkSpeed * root * 0.6));
    this.speed = speed;
    out.cycle = (s * distance) / stride;
    // Herbivores graze in bouts while resting: head down, then up to look round.
    out.graze = species.diet === 'herbivore' ? rest * smoothstep(-0.3, 0.3, Math.sin(idle * 0.35)) : 0;
    out.idle = idle;
    return out;
  }
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Two unit vectors across the surface at unit `up` (the same basis the plants' instance matrices use). */
export function tangentBasis(up: Vec3Like, e1: Vec3Like, e2: Vec3Like): void {
  const ax = Math.abs(up.x);
  const ay = Math.abs(up.y);
  const az = Math.abs(up.z);
  let rx = 0;
  let ry = 0;
  let rz = 0;
  if (ax <= ay && ax <= az) rx = 1;
  else if (ay <= az) ry = 1;
  else rz = 1;
  let x = up.y * rz - up.z * ry;
  let y = up.z * rx - up.x * rz;
  let z = up.x * ry - up.y * rx;
  const l = Math.hypot(x, y, z);
  x /= l;
  y /= l;
  z /= l;
  e1.x = x;
  e1.y = y;
  e1.z = z;
  e2.x = up.y * z - up.z * y;
  e2.y = up.z * x - up.x * z;
  e2.z = up.x * y - up.y * x;
}

const slopeA: Vec3Like = { x: 0, y: 0, z: 0 };
const slopeB: Vec3Like = { x: 0, y: 0, z: 0 };
const slopeP: Vec3Like = { x: 0, y: 0, z: 0 };
/** Gap, in units, the slope is measured over. */
const SLOPE_STEP = 2;

/** The ground's steepness at `dir` (radius `r`): the larger rise over run along two directions across it. */
export function slopeAt(ground: GroundRadius, dir: Vec3Like, r: number): number {
  tangentBasis(dir, slopeA, slopeB);
  const step = SLOPE_STEP / r;
  let rise = 0;
  for (const t of [slopeA, slopeB]) {
    const x = dir.x + t.x * step;
    const y = dir.y + t.y * step;
    const z = dir.z + t.z * step;
    const l = Math.hypot(x, y, z);
    slopeP.x = x / l;
    slopeP.y = y / l;
    slopeP.z = z / l;
    rise = Math.max(rise, Math.abs(ground(slopeP) - r));
  }
  return rise / SLOPE_STEP;
}
