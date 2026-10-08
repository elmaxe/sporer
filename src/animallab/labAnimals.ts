import { BODY_PLANS, COAT_PATTERNS, generateAnimalForm, legGirthFor, type AnimalForm, type BodyPlan, type CoatPattern, type Diet } from '../gen/animalForm';
import { generateAnimalSpecies, planAnimals, type AnimalSpecies } from '../gen/animals';
import type { Habitability } from '../gen/climate';
import { Rng, hashSeed } from '../gen/rng';
import { hueOf } from '../plantlab/labPlants';

/*
 * The animal lab's model (pure, no THREE or DOM): a set of species (a
 * planet's, or generated for a habitability tier), the one being edited,
 * and how they are shown. Encoded into the page's #hash, so any animal is a
 * link.
 */

export type AnimalLabViewKind = 'specimen' | 'lineup' | 'species' | 'herds';
/** A fixed level of detail, or 'auto': the game's own choice and crossfade by distance. */
export type AnimalLabLod = 'auto' | 0 | 1 | 2;
/** What the specimen does: stands, grazes, or walks or trots round a circle. */
export type AnimalLabPace = 'stand' | 'graze' | 'walk' | 'trot';
export const ANIMAL_LAB_PACES: readonly AnimalLabPace[] = ['stand', 'graze', 'walk', 'trot'];

export interface AnimalLabView {
  view: AnimalLabViewKind;
  lod: AnimalLabLod;
  pace: AnimalLabPace;
  /** Playback speed of the animation (1 = real time). */
  speed: number;
  /** Surface gravity the gait is worked out for (Earth = 1). */
  gravity: number;
  showLods: boolean;
  wireframe: boolean;
  /** Draw the spine, legs and joints over the animal. */
  skeleton: boolean;
  sunAzimuth: number;
  sunElevation: number;
  ground: string;
  sky: string;
}

export const DEFAULT_ANIMAL_VIEW: AnimalLabView = {
  view: 'specimen',
  lod: 'auto',
  pace: 'walk',
  speed: 1,
  gravity: 1,
  showLods: false,
  wireframe: false,
  skeleton: false,
  sunAzimuth: 35,
  sunElevation: 40,
  ground: '#4f6b35',
  sky: '#8fb4d9',
};

/** Where a set of species came from: a game planet. */
export interface AnimalSource {
  seed: string;
  star: number;
  planet: number;
  moon?: number;
}

export interface AnimalLabState {
  species: AnimalSpecies[];
  selected: number;
  tier: Habitability;
  seed: number;
  view: AnimalLabView;
  source?: AnimalSource;
}

export interface GenerateAnimalOptions {
  tier?: Habitability;
  /** Select the first species of this diet. */
  diet?: Diet;
  /** Rebuild the selected species with this body plan. */
  plan?: BodyPlan;
}

/** A planet-like set of species for `tier` (1–3) from `seed`, as `planAnimals` makes them, with one selected. */
export function generateLabAnimals(seed: number, options: GenerateAnimalOptions = {}, gravity = 1): Omit<AnimalLabState, 'view'> {
  const tier = Math.max(1, Math.min(3, options.tier ?? 3)) as Habitability;
  const plan = planAnimals({ seed, tier, temperature: 288, gravity, radius: 400, peak: 420, sea: false })!;
  let species = plan.species.map(cloneAnimal);
  if (options.diet === 'carnivore' && !species.some((s) => s.diet === 'carnivore')) {
    // T1 has no hunters: add one so it can be looked at.
    species.push(generateAnimalSpecies(new Rng(seed).fork('lab carnivore'), species.length, 'carnivore', 1, hueOf(species[0]!.form.color), gravity));
  }
  let selected = options.diet ? Math.max(0, species.findIndex((s) => s.diet === options.diet)) : 0;
  if (options.plan) species = species.map((s, i) => (i === selected ? withBodyPlan(s, options.plan!) : s));
  selected = Math.min(selected, species.length - 1);
  return { species, selected, tier, seed };
}

export function cloneAnimal(s: AnimalSpecies): AnimalSpecies {
  return { ...s, form: { ...s.form } };
}

/** The species rebuilt with body plan `plan`: a new body from its seed, its coat colours kept. */
export function withBodyPlan(s: AnimalSpecies, plan: BodyPlan): AnimalSpecies {
  const rng = new Rng(hashSeed(s.form.seed, 'plan', plan));
  return { ...s, form: keepCoat(generateAnimalForm(rng, plan, hueOf(s.form.color)), s, 1) };
}

/** Another random creature of the same body plan (the coat's colours kept). */
export function rerollAnimal(s: AnimalSpecies, roll: number, gravity = 1): AnimalSpecies {
  const rng = new Rng(hashSeed(s.form.seed, 'reroll', roll));
  return { ...s, form: keepCoat(generateAnimalForm(rng, s.form.plan, hueOf(s.form.color)), s, gravity) };
}

function keepCoat(form: AnimalForm, s: AnimalSpecies, gravity: number): AnimalForm {
  const old = s.form;
  return {
    ...form,
    legGirth: legGirthFor(s.length, gravity),
    color: old.color,
    belly: old.belly,
    patternColor: old.patternColor,
    accentColor: old.accentColor,
    eyeColor: old.eyeColor,
  };
}

/** Base64url of the state's JSON (the page's #hash). */
export function encodeAnimalLab(state: AnimalLabState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** The state from `encodeAnimalLab`'s text, or null: every species is checked field by field against a generated one. */
export function decodeAnimalLab(text: string): AnimalLabState | null {
  try {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))) as Partial<AnimalLabState>;
    if (!raw || !Array.isArray(raw.species) || raw.species.length === 0) return null;
    const tier = (isNum(raw.tier) ? Math.min(3, Math.max(1, Math.round(raw.tier))) : 3) as Habitability;
    const seed = isNum(raw.seed) ? raw.seed : 1;
    const base = generateLabAnimals(seed, { tier }).species;
    const species = raw.species.map((s, i) => sanitizeAnimal(s as Partial<AnimalSpecies>, base[i % base.length]!, i));
    const selected = isNum(raw.selected) ? Math.min(species.length - 1, Math.max(0, Math.round(raw.selected))) : 0;
    const state: AnimalLabState = { species, selected, tier, seed, view: { ...DEFAULT_ANIMAL_VIEW, ...sanitizeView(raw.view) } };
    if (raw.source && typeof raw.source.seed === 'string' && isNum(raw.source.star) && isNum(raw.source.planet)) state.source = raw.source;
    return state;
  } catch {
    return null;
  }
}

function sanitizeView(v: unknown): Partial<AnimalLabView> {
  if (!v || typeof v !== 'object') return {};
  const raw = v as Partial<AnimalLabView>;
  const out: Partial<AnimalLabView> = {};
  if (raw.view === 'specimen' || raw.view === 'lineup' || raw.view === 'species' || raw.view === 'herds') out.view = raw.view;
  if (raw.lod === 'auto' || raw.lod === 0 || raw.lod === 1 || raw.lod === 2) out.lod = raw.lod;
  if (ANIMAL_LAB_PACES.includes(raw.pace as AnimalLabPace)) out.pace = raw.pace;
  for (const k of ['showLods', 'wireframe', 'skeleton'] as const) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  for (const k of ['sunAzimuth', 'sunElevation'] as const) if (isNum(raw[k])) out[k] = raw[k];
  if (isNum(raw.speed)) out.speed = Math.min(4, Math.max(0, raw.speed));
  if (isNum(raw.gravity)) out.gravity = Math.min(4, Math.max(0.05, raw.gravity));
  for (const k of ['ground', 'sky'] as const) if (isHex(raw[k])) out[k] = raw[k];
  return out;
}

/** `raw`'s valid fields over `base` (numbers kept in the ranges the panel allows). */
export function sanitizeAnimal(raw: Partial<AnimalSpecies>, base: AnimalSpecies, index: number): AnimalSpecies {
  const num = (v: unknown, fallback: number, lo: number, hi: number) => (isNum(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
  const f = (raw.form ?? {}) as Partial<AnimalForm>;
  const b = base.form;
  const plan = BODY_PLANS.includes(f.plan as BodyPlan) ? (f.plan as BodyPlan) : b.plan;
  const form: AnimalForm = {
    plan,
    seed: Math.round(num(f.seed, b.seed, 0, 0xffffffff)),
    legGirth: num(f.legGirth, b.legGirth, 0.5, 2),
    pattern: COAT_PATTERNS.includes(f.pattern as CoatPattern) ? (f.pattern as CoatPattern) : b.pattern,
    patternScale: num(f.patternScale, b.patternScale, 0.2, 6),
    color: isHex(f.color) ? f.color : b.color,
    belly: isHex(f.belly) ? f.belly : b.belly,
    patternColor: isHex(f.patternColor) ? f.patternColor : b.patternColor,
    accentColor: isHex(f.accentColor) ? f.accentColor : b.accentColor,
    eyeColor: isHex(f.eyeColor) ? f.eyeColor : b.eyeColor,
  };
  const herdMin = Math.round(num(raw.herdMin, base.herdMin, 1, 40));
  return {
    index,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 60) : base.name,
    diet: raw.diet === 'herbivore' || raw.diet === 'carnivore' ? raw.diet : base.diet,
    length: num(raw.length, base.length, 0.2, 12),
    minTemperature: num(raw.minTemperature, base.minTemperature, 150, 450),
    maxTemperature: num(raw.maxTemperature, base.maxTemperature, 150, 450),
    weight: num(raw.weight, base.weight, 0, 10),
    herdMin,
    herdMax: Math.max(herdMin, Math.round(num(raw.herdMax, base.herdMax, 1, 40))),
    form,
  };
}

/** The animal lab showing `species` (e.g. the planet lab's planet's), as a link. */
export function animalLabLink(species: readonly AnimalSpecies[], tier: Habitability, seed: number, gravity: number, source: AnimalSource | null, base: string): string {
  const state: AnimalLabState = { species: species.map(cloneAnimal), selected: 0, tier, seed, view: { ...DEFAULT_ANIMAL_VIEW, gravity } };
  if (source) state.source = source;
  return new URL(`animals.html#${encodeAnimalLab(state)}`, base).href;
}
