import type { Vec3Like } from '../world/cubeSphereMath';
import type { AnimalSpecies } from './animals';
import { slopeAt, tangentBasis } from './animals';
import { HABITABILITY, type ClimateData, type Habitability } from './climate';
import { cloneDesign, creatureForm, isGear, type CreatureDesign } from './creature';
import { generateName } from './names';
import { localTemperature, type GroundRadius } from './plants';
import { Rng, hashSeed } from './rng';

/*
 * Colonies (issue #172, the first slice of #171): what a colony dropped by a
 * Colony Pod is at any moment, as pure functions of its site, its seed, the
 * body's habitability tier and its age. No ticking simulation: like the
 * herds' walks and the climate, any moment can be worked out without
 * replaying the past, so a colony has grown while the player was away.
 *
 * A colony is a hub where the pod landed, then rings of buildings round it,
 * one ring per tier (T1 one, T2 two, T3 three), each ring going up building
 * by building over a minute or two. Buildings keep off steep ground and the
 * sea. Its colonists are the player's own species: the captain from the
 * creature editor (player/captain.ts), suited where the air can't be
 * breathed. The buildings are made of spaceship parts (gen/colonyBuildings.ts).
 * Unit-tested in tests/colony.test.ts.
 */

export const colonyParams = {
  /** Distance between rings (planet units: the UFO is ~4 across, trees 6–11 tall). */
  ringSpacing: 13,
  /** Building slots in each ring, the hub's (ring 0) first. */
  slotsPerRing: [1, 6, 11, 16] as readonly number[],
  /** Seconds after the founding each ring starts going up, and how long it takes. */
  ringStart: [0, 15, 75, 170] as readonly number[],
  ringSpan: [0, 55, 85, 120] as readonly number[],
  /** Seconds a building takes to rise out of the ground (eased like a volcano's rise, combat/volcano.ts `volcanoGrowth`). */
  riseTime: 4,
  /** Steepest ground (rise over run) a building stands on, and the hub. */
  maxSlope: 0.45,
  /** Colony centres keep at least this far apart (planet units). */
  minSeparation: 110,
  /** Most colonies on one body. */
  maxPerBody: 4,
  /** Colonists: per building standing, and at most. */
  colonistsPerBuilding: 1.5,
  maxColonists: 30,
  /** A colonist's length, snout to rump (planet units). */
  colonistLength: 1.3,
};

export type ColonyParams = typeof colonyParams;

/** Where and when a colony was founded, as kept in a body's change list (surface/changes.ts) and on the device. JSON-able. */
export interface ColonySite {
  /** `colony:<n>`, unique on its body. */
  readonly id: string;
  /** Unit direction of its hub from the body's centre (body frame). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Its own stream: name, layout, buildings. */
  readonly seed: number;
  /**
   * When it was founded: milliseconds since 1970 on the device's clock. The
   * systems' clocks start afresh with every visit, so a colony keeps time by
   * the real one and grows while the player is elsewhere, or away.
   */
  readonly founded: number;
}

export type BuildingKind = 'hub' | 'house' | 'tower' | 'farm' | 'power';
export const BUILDING_KINDS: readonly BuildingKind[] = ['hub', 'house', 'tower', 'farm', 'power'];

/** One building of a colony's plan: where it stands and when it goes up. */
export interface ColonyBuilding {
  readonly index: number;
  readonly kind: BuildingKind;
  /** 0 the hub, then 1 outward. */
  readonly ring: number;
  /** Unit direction of its foot (body frame), and the ground's radius there (the lowest under its footprint, so it never floats). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  /** Turn about its up axis (radians), and its size (× its design's). */
  readonly yaw: number;
  readonly scale: number;
  /** Seconds after the founding it starts rising. */
  readonly appear: number;
}

/** A colony's whole plan on its body: every building it will have at the body's tier, in the order they go up. */
export interface ColonyLayout {
  readonly site: ColonySite;
  readonly name: string;
  readonly tier: Habitability;
  /** Rings it grows to (the tier's cap). */
  readonly rings: number;
  readonly buildings: readonly ColonyBuilding[];
  /** How far out its farthest building stands from the hub (planet units). */
  readonly reach: number;
  /** Seconds after the founding its last building has risen. */
  readonly complete: number;
}

/** The ground a colony stands on: the body's terrain as the globe draws it, its sea level and whether there's a sea. */
export interface ColonyGround {
  readonly ground: GroundRadius;
  /** Sea-level radius (planet units). */
  readonly radius: number;
  readonly sea: boolean;
}

/** A colony's name, from its seed. */
export function colonyName(seed: number): string {
  return generateName(new Rng(seed).fork('name'));
}

/** Rings a colony grows to on a body of tier `tier`: one per tier. */
export function colonyRings(tier: Habitability): number {
  return Math.max(0, Math.min(colonyParams.slotsPerRing.length - 1, tier));
}

/** How far a building has risen (0 → 1) `t` seconds after it starts: fast at first, easing in, as a volcano rises. */
export function buildingRise(t: number, p: ColonyParams = colonyParams): number {
  if (t <= 0) return 0;
  const u = Math.min(1, t / p.riseTime);
  return 1 - (1 - u) ** 3;
}

const KIND_WEIGHTS: readonly (readonly [BuildingKind, number])[] = [
  ['house', 5],
  ['tower', 1.5],
  ['farm', 1.6],
  ['power', 1],
];
const KIND_SCALE: Readonly<Record<BuildingKind, readonly [number, number]>> = {
  hub: [1, 1],
  house: [0.85, 1.15],
  tower: [0.9, 1.15],
  farm: [0.85, 1.1],
  power: [0.9, 1.1],
};
/** Footprint radius of each kind at scale 1 (planet units), sampled for the ground under it. */
export const BUILDING_FOOTPRINT: Readonly<Record<BuildingKind, number>> = { hub: 5.5, house: 3, tower: 2.5, farm: 3.6, power: 2.8 };

const e1: Vec3Like = { x: 0, y: 0, z: 0 };
const e2: Vec3Like = { x: 0, y: 0, z: 0 };
const probe: Vec3Like = { x: 0, y: 0, z: 0 };

/** The unit direction `distance` units from unit `centre` at angle `angle` round it (in `tangentBasis(centre)`), written into `out`. */
function offsetDir(centre: Vec3Like, radius: number, distance: number, angle: number, out: Vec3Like): Vec3Like {
  tangentBasis(centre, e1, e2);
  const a = distance / radius;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  out.x = centre.x * ca + (e1.x * c + e2.x * s) * sa;
  out.y = centre.y * ca + (e1.y * c + e2.y * s) * sa;
  out.z = centre.z * ca + (e1.z * c + e2.z * s) * sa;
  const l = Math.hypot(out.x, out.y, out.z);
  out.x /= l;
  out.y /= l;
  out.z /= l;
  return out;
}

/**
 * Where a building of footprint `foot` can stand at unit `dir`: the lowest
 * ground under it (so it never floats), or null on sea or steep ground.
 */
export function buildingFoot(g: ColonyGround, dir: Vec3Like, foot: number, p: ColonyParams = colonyParams): number | null {
  const r = g.ground(dir);
  if (g.sea && r < g.radius) return null;
  if (slopeAt(g.ground, dir, r) > p.maxSlope) return null;
  let low = r;
  for (let k = 0; k < 4; k++) {
    offsetDir(dir, g.radius, foot, (k / 4) * Math.PI * 2 + 0.4, probe);
    const q = g.ground(probe);
    if (g.sea && q < g.radius) return null;
    low = Math.min(low, q);
  }
  return low;
}

/**
 * A colony's plan: the hub where it was founded, then up to the tier's cap
 * of rings, each a few slots round it jittered from its seed, those on sea
 * or steep ground left out (so a coastal colony grows round the coast). The
 * buildings go up ring by ring, in a shuffled order within each ring.
 */
export function planColony(site: ColonySite, tier: Habitability, g: ColonyGround, p: ColonyParams = colonyParams): ColonyLayout {
  const rng = new Rng(site.seed).fork('layout');
  const rings = colonyRings(tier);
  const centre = { x: site.x, y: site.y, z: site.z };
  const buildings: ColonyBuilding[] = [];
  const dir: Vec3Like = { x: 0, y: 0, z: 0 };
  let reach = 0;
  let complete = 0;
  for (let ring = 0; ring <= rings; ring++) {
    const slots = p.slotsPerRing[ring]!;
    const ringRng = rng.fork('ring', ring);
    const turn = ringRng.range(0, Math.PI * 2);
    // The order they go up in: a shuffle of the slots.
    const order = Array.from({ length: slots }, (_, i) => i);
    for (let i = slots - 1; i > 0; i--) {
      const j = ringRng.int(0, i);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    for (let i = 0; i < slots; i++) {
      const slot = ringRng.fork('slot', i);
      const kind: BuildingKind = ring === 0 ? 'hub' : slot.weighted(KIND_WEIGHTS);
      const [lo, hi] = KIND_SCALE[kind];
      const scale = slot.range(lo, hi);
      const yaw = slot.range(0, Math.PI * 2);
      const distance = ring === 0 ? 0 : ring * p.ringSpacing * slot.range(0.9, 1.1);
      const angle = turn + ((i + slot.range(-0.25, 0.25)) / slots) * Math.PI * 2;
      if (ring === 0) {
        dir.x = centre.x;
        dir.y = centre.y;
        dir.z = centre.z;
      } else offsetDir(centre, g.radius, distance, angle, dir);
      const foot = buildingFoot(g, dir, BUILDING_FOOTPRINT[kind] * scale, p);
      // The hub stands where the pod landed whatever the ground (the pod only lands where it can).
      const radius = foot ?? (ring === 0 ? g.ground(dir) : null);
      if (radius === null) continue;
      const appear = ring === 0 ? 0 : p.ringStart[ring]! + (p.ringSpan[ring]! * (order[i]! + 0.5)) / slots;
      buildings.push({ index: buildings.length, kind, ring, x: dir.x, y: dir.y, z: dir.z, radius, yaw, scale, appear });
      reach = Math.max(reach, distance + BUILDING_FOOTPRINT[kind] * scale);
      complete = Math.max(complete, appear + p.riseTime);
    }
  }
  buildings.sort((a, b) => a.appear - b.appear || a.index - b.index);
  return { site, name: colonyName(site.seed), tier, rings, buildings: buildings.map((b, index) => ({ ...b, index })), reach, complete };
}

/** How many of a layout's buildings have started rising by `age` seconds (they're in the order they go up). */
export function standingCount(layout: ColonyLayout, age: number): number {
  let n = 0;
  for (const b of layout.buildings) if (b.appear <= age) n++;
  return n;
}

/** How far building `b` has risen (0 → 1) at `age`. */
export function buildingGrowth(b: Pick<ColonyBuilding, 'appear'>, age: number, p: ColonyParams = colonyParams): number {
  return buildingRise(age - b.appear, p);
}

/** How many rings of a layout have all their buildings up at `age` (the hub counts as none). */
export function ringsComplete(layout: ColonyLayout, age: number, p: ColonyParams = colonyParams): number {
  let done = 0;
  for (let ring = 1; ring <= layout.rings; ring++) {
    if (layout.buildings.some((b) => b.ring === ring && b.appear + p.riseTime > age)) break;
    done = ring;
  }
  return done;
}

/** How many colonists live in a colony with `standing` buildings up. */
export function colonistCount(standing: number, p: ColonyParams = colonyParams): number {
  return standing <= 0 ? 0 : Math.min(p.maxColonists, Math.max(2, Math.round(standing * p.colonistsPerBuilding)));
}

/** A line about a colony at `age`: its size and whether it's still growing. */
export function describeColony(layout: ColonyLayout, age: number): string {
  const n = standingCount(layout, age);
  const growing = age < layout.complete;
  const people = colonistCount(n);
  return `${n} building${n === 1 ? '' : 's'} · ${people} colonist${people === 1 ? '' : 's'} · ${growing ? 'growing' : `${layout.rings} ring${layout.rings === 1 ? '' : 's'}, full size`}`;
}

/** The body a colony would be founded on, as far as whether it can be. */
export interface ColonyWorld {
  /** Solid ground (not a giant, not blown apart). */
  readonly solid: boolean;
  /** A lava world: its seas and plains are molten. */
  readonly lava: boolean;
  readonly climate: Pick<ClimateData, 'temperature' | 'pressure' | 'composition' | 'habitability'> | null;
}

/** An existing colony, as far as keeping new ones apart goes. */
export interface ColonyNeighbour {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly name: string;
}

/**
 * Why a colony can't be founded at unit direction `dir` of world `w`, or
 * null if it can: T1 to T3 solid bodies only, not on lava, sea or steep
 * ground, nor where the local climate (the latitude's temperature, as the
 * plants feel it) is too hot or cold, nor too near another colony.
 */
export function colonyBlock(
  w: ColonyWorld,
  g: ColonyGround | null,
  dir: Vec3Like,
  others: readonly ColonyNeighbour[] = [],
  p: ColonyParams = colonyParams,
): string | null {
  if (!w.solid || !g) return 'No ground here to build on';
  if (w.lava) return 'Lava: nothing can live here';
  const c = w.climate;
  const { survivable } = HABITABILITY;
  if (!c || c.composition === 'none' || c.pressure < survivable.minPressure) return 'No air here';
  const lat = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  const local = localTemperature(c.temperature, lat);
  if (c.habitability === 0) {
    if (c.temperature > survivable.max || local > survivable.max) return 'Too hot here';
    if (c.temperature < survivable.min || local < survivable.min) return 'Too cold here';
    return 'Too harsh here: terraform it first';
  }
  const r = g.ground(dir);
  if (g.sea && r < g.radius) return 'Sea: a colony needs dry land';
  if (local > survivable.max) return 'Too hot here';
  if (local < survivable.min) return 'Too cold here';
  if (slopeAt(g.ground, dir, r) > p.maxSlope) return 'Too steep here';
  if (others.length >= p.maxPerBody) return 'No room here for another colony';
  for (const o of others) {
    const d = Math.acos(Math.max(-1, Math.min(1, o.x * dir.x + o.y * dir.y + o.z * dir.z))) * g.radius;
    if (d < p.minSeparation) return `Too close to ${o.name}`;
  }
  return null;
}

/** A new colony's site at unit direction `dir` (normalised here), the `n`th on its body of seed `bodySeed`, founded at `founded` (ms since 1970). */
export function colonySite(bodySeed: number, n: number, dir: Vec3Like, founded: number): ColonySite {
  const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
  return { id: `colony:${n}`, x: dir.x / l, y: dir.y / l, z: dir.z / l, seed: hashSeed(bodySeed, 'colony', n) & 0x7fffffff, founded };
}

/** A site read back from storage, or null if it isn't one. */
export function parseColonySite(s: unknown): ColonySite | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const x = num(o.x);
  const y = num(o.y);
  const z = num(o.z);
  const seed = num(o.seed);
  const founded = num(o.founded);
  if (typeof o.id !== 'string' || x === null || y === null || z === null || seed === null || founded === null) return null;
  const l = Math.hypot(x, y, z);
  if (l < 1e-6) return null;
  return { id: o.id, x: x / l, y: y / l, z: z / l, seed, founded };
}

// --- Colonists ---

/**
 * The colonists' body: the captain's creature (gen/creature.ts design) with
 * its gear off, scaled to `length` the way the planets' species are
 * (`speciesDesign`), in a space suit's colours where `suited` (the air
 * can't be breathed): the herds' shader draws a coat, not the outfit's
 * pieces, so the suit is its colours over the whole body.
 */
export function colonistDesign(captain: CreatureDesign, suited: boolean, length = colonyParams.colonistLength): CreatureDesign {
  const d = cloneDesign(captain);
  d.parts = d.parts.filter((part) => !isGear(part.kind));
  let along = 0;
  for (let i = 1; i < d.spine.length; i++) along += Math.hypot(d.spine[i]!.y - d.spine[i - 1]!.y, d.spine[i]!.z - d.spine[i - 1]!.z);
  const k = (length * 1.5) / Math.max(1e-3, along);
  for (const v of d.spine) {
    v.y *= k;
    v.z *= k;
    v.r *= k;
    v.y = Math.max(v.y, v.r * 1.08);
  }
  if (suited) {
    const suit = captain.outfit ?? { color: '#e9eef3', trim: '#ff8a2a', glow: '#4fe3ff' };
    d.paint = { ...d.paint, base: suit.color, belly: suit.color, pattern: 'stripes', patternColor: suit.trim, patternScale: 1, accent: suit.trim };
    d.splats = [];
  }
  delete d.outfit;
  return d;
}

/** The colonists as a species the animals' code walks (surface/SurfaceAnimals.ts): the captain's body, tame. */
export function colonistSpecies(captain: CreatureDesign, suited: boolean, length = colonyParams.colonistLength): AnimalSpecies {
  const design = colonistDesign(captain, suited, length);
  return {
    index: 0,
    name: captain.name || 'Colonist',
    diet: 'herbivore',
    length,
    minTemperature: 0,
    maxTemperature: 1000,
    weight: 1,
    herdMin: 1,
    herdMax: colonyParams.maxColonists,
    form: creatureForm(design),
    design,
  };
}

/** Whether the colonists need suits on a body with this climate: unless its air is breathable (T3's oxygen and nitrogen). */
export function colonistsSuited(climate: Pick<ClimateData, 'composition'> | null): boolean {
  return climate?.composition !== 'oxygenNitrogen';
}

// --- Keeping them ---

/** One colony as the device keeps it: its body (key, name, star) and its site. */
export interface ColonyRecord {
  /** The body's key (combat/busted.ts `bodyKey`) and name, and the id of its star system (`StarRef.id`). */
  readonly body: string;
  readonly name: string;
  readonly star: number;
  readonly site: ColonySite;
}

export interface ColonyLedgerData {
  colonies: ColonyRecord[];
}

/**
 * Every colony founded in a galaxy (kept by the scene manager, saved on the
 * device per galaxy, `spore2.colonies.<seed>`). Which stars have colonies
 * comes from here (the galaxy map); each body's change list holds its own.
 */
export class ColonyLedger {
  private readonly list: ColonyRecord[] = [];
  private _version = 0;

  constructor(
    /** Called after every new colony (saving them), not on `load`. */
    private readonly onChange: (ledger: ColonyLedger) => void = () => {},
  ) {}

  get records(): readonly ColonyRecord[] {
    return this.list;
  }

  /** Goes up on every change. */
  get version(): number {
    return this._version;
  }

  get size(): number {
    return this.list.length;
  }

  /** The colonies on body `key`. */
  on(body: string): ColonyRecord[] {
    return this.list.filter((r) => r.body === body);
  }

  /** The ids of the star systems with colonies. */
  stars(): Set<number> {
    return new Set(this.list.map((r) => r.star));
  }

  add(record: ColonyRecord): void {
    if (this.list.some((r) => r.body === record.body && r.site.id === record.site.id)) return;
    this.list.push({ ...record, site: { ...record.site } });
    this._version++;
    this.onChange(this);
  }

  /** Forgets the colonies on body `key` (blown apart). */
  removeBody(body: string): void {
    const before = this.list.length;
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i]!.body === body) this.list.splice(i, 1);
    if (this.list.length !== before) {
      this._version++;
      this.onChange(this);
    }
  }

  toJSON(): ColonyLedgerData {
    return { colonies: this.list.map((r) => ({ ...r, site: { ...r.site } })) };
  }

  /** Replaces what it holds (a saved galaxy's, or a debug dump's); records that don't parse are skipped. */
  load(data: ColonyLedgerData | null | undefined): void {
    this.list.length = 0;
    for (const r of data?.colonies ?? []) {
      const site = parseColonySite(r?.site);
      if (!site || typeof r.body !== 'string' || typeof r.star !== 'number') continue;
      if (this.list.some((q) => q.body === r.body && q.site.id === site.id)) continue;
      this.list.push({ body: r.body, name: String(r.name ?? ''), star: r.star, site });
    }
    this._version++;
  }
}

/** Where galaxy `seed`'s colonies are kept on the device. */
export function colonyStorageKey(seed: number): string {
  return `spore2.colonies.${seed}`;
}

/** The colonies saved on the device for galaxy `seed`, or null (none, unreadable, or storage off). */
export function loadColonies(seed: number): ColonyLedgerData | null {
  try {
    const text = localStorage.getItem(colonyStorageKey(seed));
    if (!text) return null;
    const data = JSON.parse(text) as ColonyLedgerData;
    return Array.isArray(data?.colonies) ? data : null;
  } catch {
    return null;
  }
}

/** Saves the colonies on the device for galaxy `seed` (quietly does nothing if it can't). */
export function saveColonies(seed: number, ledger: ColonyLedger): void {
  try {
    localStorage.setItem(colonyStorageKey(seed), JSON.stringify(ledger.toJSON()));
  } catch {
    // Private browsing or a full storage: kept for this visit only.
  }
}

/** Seconds since a colony was founded, by the device's clock `now` (ms; `Date.now()` in the game). */
export function colonyAge(site: Pick<ColonySite, 'founded'>, now: number): number {
  return Math.max(0, (now - site.founded) / 1000);
}
