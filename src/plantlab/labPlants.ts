import type { Habitability } from '../gen/climate';
import { ARCHITECTURES, generateForm, type Architecture, type PlantForm } from '../gen/plantForm';
import { PLANT_KINDS, TREE_CROWN_WIDTH, planPlants, type CrownShape, type PlantKind, type PlantSpecies } from '../gen/plants';
import { Rng, hashSeed } from '../gen/rng';

/*
 * The plant lab's model (pure, no THREE or DOM): a set of species (a planet's,
 * or generated for a habitability tier), the one being edited, and how they
 * are shown. Encoded into the page's #hash, so any plant is a link.
 */

export type PlantLabViewKind = 'specimen' | 'lineup' | 'grove';
/** A fixed level of detail, or 'auto': the game's own choice and crossfade by distance. */
export type PlantLabLod = 'auto' | 0 | 1 | 2 | 3;

export interface PlantLabView {
  view: PlantLabViewKind;
  lod: PlantLabLod;
  /** Tint each level of detail (the game's plantParams.showLods). */
  showLods: boolean;
  wireframe: boolean;
  /** Draw the stems' centre lines and the leaf masses' centres over the plant. */
  skeleton: boolean;
  sunAzimuth: number;
  sunElevation: number;
  /** Ground and sky colours. */
  ground: string;
  sky: string;
}

export const DEFAULT_PLANT_VIEW: PlantLabView = {
  view: 'specimen',
  lod: 'auto',
  showLods: false,
  wireframe: false,
  skeleton: false,
  sunAzimuth: 35,
  sunElevation: 40,
  ground: '#4f6b35',
  sky: '#8fb4d9',
};

/** Where a set of species came from: a game planet (by galaxy, star, planet and moon). */
export interface PlantSource {
  seed: string;
  star: number;
  planet: number;
  moon?: number;
}

export interface PlantLabState {
  /** The set the grove draws; `selected` is the one shown and edited. */
  species: PlantSpecies[];
  selected: number;
  tier: Habitability;
  /** The seed the set was generated from (for "another one"), when it wasn't loaded. */
  seed: number;
  view: PlantLabView;
  source?: PlantSource;
}

export const PLANT_LAB_KINDS: readonly PlantKind[] = ['tree', 'largeBush', 'smallBush'];
export const PLANT_LAB_CROWNS: readonly CrownShape[] = ['cone', 'ball', 'tiers'];

export interface GeneratePlantOptions {
  tier?: Habitability;
  /** Select the first species of this kind (the set has every kind). */
  kind?: PlantKind;
  /** Grow the selected species this way instead. */
  architecture?: Architecture;
}

/** A planet-like set of species for `tier` (1–3) from `seed`, as `planPlants` makes them, with one selected. */
export function generateLabPlants(seed: number, options: GeneratePlantOptions = {}): Omit<PlantLabState, 'view'> {
  const tier = (options.tier ?? 3) as Habitability;
  const plan = planPlants({ seed, tier: Math.max(1, tier) as Habitability, temperature: 288, water: 0.7, radius: 400, peak: 420 })!;
  let species = plan.species.map(cloneSpecies);
  let selected = options.kind ? Math.max(0, species.findIndex((s) => s.kind === options.kind)) : 0;
  if (options.architecture) {
    const s = species[selected]!;
    if (options.architecture === 'shrub' && s.kind === 'tree') {
      // Shrubs grow from bushes' numbers: pick the set's first bush instead.
      const bush = species.findIndex((x) => x.kind !== 'tree');
      if (bush >= 0) selected = bush;
    }
    species = species.map((x, i) => (i === selected ? withArchitecture(x, options.architecture!) : x));
  }
  return { species, selected, tier: Math.max(1, tier) as Habitability, seed };
}

/** A copy that can be edited (the skeleton cache is per species object, so an edit must make a new one anyway). */
export function cloneSpecies(s: PlantSpecies): PlantSpecies {
  return { ...s, form: { ...s.form } };
}

/** The species grown as `architecture`: a new form of that kind from the old one's seed, the leaf colours kept; the envelope follows (conifers are cones, palms and broadleaves round). */
export function withArchitecture(s: PlantSpecies, architecture: Architecture): PlantSpecies {
  const rng = new Rng(hashSeed(s.form.seed, 'architecture', architecture));
  const hue = hueOf(s.leafColor);
  const form: PlantForm = { ...generateForm(rng, architecture, hue, s.kind === 'smallBush'), leafColor2: s.form.leafColor2, accentColor: s.form.accentColor };
  let crown = s.crown;
  if (architecture === 'conifer' && crown === 'ball') crown = 'cone';
  if ((architecture === 'broadleaf' || architecture === 'palm') && crown !== 'ball') crown = 'ball';
  // A tree's crown is as wide as its new architecture's usually are (the same share of their range as before).
  let crownRadius = s.crownRadius;
  if (s.kind === 'tree' && architecture !== 'shrub') {
    const from = s.form.architecture === 'shrub' ? TREE_CROWN_WIDTH.broadleaf : TREE_CROWN_WIDTH[s.form.architecture];
    const to = TREE_CROWN_WIDTH[architecture];
    const u = Math.min(1, Math.max(0, ((2 * s.crownRadius) / s.height - from[0]) / (from[1] - from[0])));
    crownRadius = (s.height * (to[0] + (to[1] - to[0]) * u)) / 2;
  }
  return { ...s, crown, crownRadius, form };
}

/** A different random form of the same architecture (a new seed and new numbers). */
export function rerollForm(s: PlantSpecies, roll: number): PlantSpecies {
  const rng = new Rng(hashSeed(s.form.seed, 'reroll', roll));
  const form: PlantForm = { ...generateForm(rng, s.form.architecture, hueOf(s.leafColor), s.kind === 'smallBush'), leafColor2: s.form.leafColor2, accentColor: s.form.accentColor };
  return { ...s, form };
}

/** Hue in degrees of a #rrggbb colour. */
export function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

/** Base64url of the state's JSON (the page's #hash). */
export function encodePlantLab(state: PlantLabState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/**
 * The state from `encodePlantLab`'s text, or null if it isn't one. Every
 * species is checked field by field against a generated one of the same set,
 * so a damaged or older link still gives plants that grow.
 */
export function decodePlantLab(text: string): PlantLabState | null {
  try {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))) as Partial<PlantLabState>;
    if (!raw || !Array.isArray(raw.species) || raw.species.length === 0) return null;
    const tier = (isNum(raw.tier) ? Math.min(3, Math.max(1, Math.round(raw.tier))) : 3) as Habitability;
    const seed = isNum(raw.seed) ? raw.seed : 1;
    const base = generateLabPlants(seed, { tier }).species;
    const species = raw.species.map((s, i) => sanitizeSpecies(s as Partial<PlantSpecies>, base[i % base.length]!, i));
    const selected = isNum(raw.selected) ? Math.min(species.length - 1, Math.max(0, Math.round(raw.selected))) : 0;
    const state: PlantLabState = { species, selected, tier, seed, view: { ...DEFAULT_PLANT_VIEW, ...sanitizeView(raw.view) } };
    if (raw.source && typeof raw.source.seed === 'string' && isNum(raw.source.star) && isNum(raw.source.planet)) state.source = raw.source;
    return state;
  } catch {
    return null;
  }
}

function sanitizeView(v: unknown): Partial<PlantLabView> {
  if (!v || typeof v !== 'object') return {};
  const raw = v as Partial<PlantLabView>;
  const out: Partial<PlantLabView> = {};
  if (raw.view === 'specimen' || raw.view === 'lineup' || raw.view === 'grove') out.view = raw.view;
  if (raw.lod === 'auto' || raw.lod === 0 || raw.lod === 1 || raw.lod === 2 || raw.lod === 3) out.lod = raw.lod;
  for (const k of ['showLods', 'wireframe', 'skeleton'] as const) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  for (const k of ['sunAzimuth', 'sunElevation'] as const) if (isNum(raw[k])) out[k] = raw[k];
  for (const k of ['ground', 'sky'] as const) if (isHex(raw[k])) out[k] = raw[k];
  return out;
}

/** `raw`'s valid fields over `base` (numbers kept in the ranges the panel allows). */
export function sanitizeSpecies(raw: Partial<PlantSpecies>, base: PlantSpecies, index: number): PlantSpecies {
  const num = (v: unknown, fallback: number, lo: number, hi: number) => (isNum(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
  const kind = PLANT_LAB_KINDS.includes(raw.kind as PlantKind) ? (raw.kind as PlantKind) : base.kind;
  const crown = PLANT_LAB_CROWNS.includes(raw.crown as CrownShape) ? (raw.crown as CrownShape) : base.crown;
  const f = (raw.form ?? {}) as Partial<PlantForm>;
  const b = base.form;
  const architecture = ARCHITECTURES.includes(f.architecture as Architecture) ? (f.architecture as Architecture) : b.architecture;
  const form: PlantForm = {
    architecture,
    seed: num(f.seed, b.seed, 0, 0xffffffff),
    depth: Math.round(num(f.depth, b.depth, 0, 3)),
    branches: Math.round(num(f.branches, b.branches, 1, 40)),
    twigs: Math.round(num(f.twigs, b.twigs, 0, 8)),
    angle: num(f.angle, b.angle, 0, 140),
    twigAngle: num(f.twigAngle, b.twigAngle, 0, 120),
    lengthRatio: num(f.lengthRatio, b.lengthRatio, 0, 1.5),
    tropism: num(f.tropism, b.tropism, -1, 1),
    gnarl: num(f.gnarl, b.gnarl, 0, 1),
    lean: num(f.lean, b.lean, 0, 1),
    tiers: Math.round(num(f.tiers, b.tiers, 2, 6)),
    leafSize: num(f.leafSize, b.leafSize, 0.05, 1),
    leafDensity: Math.round(num(f.leafDensity, b.leafDensity, 1, 3)),
    leafColor2: isHex(f.leafColor2) ? f.leafColor2 : b.leafColor2,
    accentColor: isHex(f.accentColor) ? f.accentColor : b.accentColor,
    accent: num(f.accent, b.accent, 0, 1),
  };
  const info = PLANT_KINDS[kind];
  return {
    index,
    kind,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 60) : base.name,
    height: num(raw.height, base.height, 0.2, 40),
    trunkShare: num(raw.trunkShare, base.trunkShare, 0, 0.9),
    trunkWidth: num(raw.trunkWidth, base.trunkWidth, 0.005, 0.15),
    crownRadius: num(raw.crownRadius, base.crownRadius, 0.1, 20),
    crown,
    trunkColor: isHex(raw.trunkColor) ? raw.trunkColor : base.trunkColor,
    leafColor: isHex(raw.leafColor) ? raw.leafColor : base.leafColor,
    minTemperature: num(raw.minTemperature, info.temperature[0], 150, 450),
    maxTemperature: num(raw.maxTemperature, info.temperature[1], 150, 450),
    weight: num(raw.weight, base.weight, 0, 10),
    form,
  };
}

/** The plant lab showing `species` (e.g. the planet lab's planet's), as a link. */
export function plantLabLink(species: readonly PlantSpecies[], tier: Habitability, seed: number, source: PlantSource | null, base: string): string {
  const state: PlantLabState = { species: species.map(cloneSpecies), selected: 0, tier, seed, view: { ...DEFAULT_PLANT_VIEW } };
  if (source) state.source = source;
  return new URL(`plants.html#${encodePlantLab(state)}`, base).href;
}
