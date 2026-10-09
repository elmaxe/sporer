import { animalMass, hipHeightOf, type AnimalSpecies } from './animals';
import { Rng } from './rng';
import { speciesBody } from './speciesBody';

/*
 * Animal voices, as data for a synthesiser (audio/animalSynth.ts): a source
 * (the larynx's buzz, a sawtooth to a first approximation, plus breath
 * noise) through the vocal tract's resonances, the formants, shaped by an
 * envelope. A species' voice comes from its body (docs/research/animal-panic-and-calls.md):
 *
 * - Pitch: Fletcher's scaling of the frequency animals call at, f ∝ M^−0.4,
 *   fitted across mice to elephants; Moore & Mitchinson's generic land
 *   mammal takes F = M^−0.4 kHz (M in kg), which also fits the cats, dogs,
 *   people and elephants of Fletcher's Fig. 3.
 * - Formants: the vocal tract as a uniform tube closed at the larynx,
 *   resonating at Rn = (2n − (m + 1))·c / 4L with m the mouth's closure
 *   (0 open, 1 shut), c = 350 m/s (Reby's red deer: ΔF 228.15 Hz with a
 *   767 mm tract); L = 3.15 + 11.53·log₁₀ M cm (Moore & Mitchinson's fit).
 * - Length: an utterance lasts as long as the lungs' air does, which scales
 *   with the breathing period, ∝ M^0.26.
 * - What a call says (Morton's motivation-structural rules): hostile calls
 *   are low and harsh, frightened or friendly ones high and tonal; so a
 *   hunter's growl is low and rough and an alarm or a distress cry high.
 *
 * Within that, each species gets its own character from its seed (how
 * breathy, how rough, its contour and syllables), its mouth from the body
 * the creature editor gave it (how wide it opens, teeth for a rasp), and
 * six-legged species stridulate, a buzz of pulses, as insects do instead
 * of calling with air.
 */

/** Speed of sound in a vocal tract, m/s: 2 × 0.767 m × 228.15 Hz (Reby's red deer). */
export const TRACT_SOUND_SPEED = 350;
/** Fundamental at 1 kg (Hz) and its exponent on mass (Fletcher; Moore & Mitchinson's F = M^−0.4 kHz). */
export const PITCH_AT_1KG = 1000;
export const PITCH_EXPONENT = -0.4;
/** How much higher an animal `size` times its species' size calls (its mass goes as the cube): a young one half the size squeals 2.3× higher. */
export function sizePitch(size: number): number {
  return Math.max(0.1, size) ** (3 * PITCH_EXPONENT);
}
/** Vocal tract length, cm, at 1 kg and per decade of mass (Moore & Mitchinson's eq. 7). */
export const TRACT_AT_1KG = 3.15;
export const TRACT_PER_DECADE = 11.53;
/** An utterance's breath scales with the breathing period, B = 0.84·M^−0.26 Hz (Moore & Mitchinson's eq. 2). */
export const BREATH_EXPONENT = 0.26;
/**
 * The longest utterance a breath allows at 1 kg, seconds: 42% of the lungs'
 * air at Moore & Mitchinson's flow Q = 0.32·C·B lasts 0.42 / (0.32 × 0.84)
 * = 1.56·M^0.26 s. A syllable takes `SYLLABLE_SHARE` of it (stylised: calls
 * are short, a few to a breath).
 */
export const LONGEST_UTTERANCE = 1.56;
export const SYLLABLE_SHARE = 0.15;
/** No syllable longer than this, seconds: a 10 t giant's would be 2.6 s (stylised, so it still talks). */
export const LONGEST_SYLLABLE = 1.2;
/**
 * Pitches a laptop or phone speaker carries: a big animal's real fundamental
 * (an elephant's ~20 Hz) is lifted to this, its formants and harmonics
 * still telling its size (stylised).
 */
export const MIN_PITCH = 70;
export const MAX_PITCH = 1600;

/** What a call is for. */
export type CallKind = 'contact' | 'answer' | 'grunt' | 'alert' | 'alarm' | 'distress' | 'growl' | 'scream';
export const CALL_KINDS: readonly CallKind[] = ['contact', 'answer', 'grunt', 'alert', 'alarm', 'distress', 'growl', 'scream'];

/**
 * A scream's rasp: its loudness shaken at 30–150 Hz, the modulation rates
 * Arnal et al. (2015) found screams (and alarms) fill and speech leaves
 * empty, heard as roughness; each scream picks a rate in it.
 */
export const SCREAM_RASP_MIN = 30;
export const SCREAM_RASP_MAX = 150;

/** A species' voice. */
export interface AnimalVoice {
  /** Body mass, kg, and the fundamental it gives (Hz, within MIN_PITCH–MAX_PITCH). */
  readonly mass: number;
  readonly pitch: number;
  /** Vocal tract length, cm, and its formants with the mouth open (Hz). */
  readonly tract: number;
  readonly formants: readonly [number, number, number];
  /** A syllable's length, seconds (∝ M^0.26). */
  readonly syllable: number;
  /** 0–1: breath noise in the source, and roughness (a rasp: the source's level shaken at a low rate). */
  readonly breath: number;
  readonly rough: number;
  /** Vibrato, Hz, and its depth (share of the pitch). */
  readonly vibrato: number;
  readonly vibratoDepth: number;
  /** How the pitch moves through a syllable. */
  readonly contour: 'arch' | 'fall' | 'rise' | 'warble';
  /** Syllables in a contact call. */
  readonly syllables: number;
  /** 0–1: how far the mouth opens on a call (closed: formants low, a hum). */
  readonly mouth: number;
  /** Stridulating, as six-legged species do: pulses at this rate (Hz), else 0. */
  readonly buzz: number;
  /** Hunters' voices are rougher and lower when they call (Morton). */
  readonly hunter: boolean;
}

/** Body mass (kg) of a species, from its hip height (gen/animals.ts `animalMass`). */
export function speciesMass(s: AnimalSpecies): number {
  return animalMass(hipHeightOf(s));
}

/** The fundamental (Hz) an animal of `mass` kg calls at, unclamped. */
export function callPitch(mass: number): number {
  return PITCH_AT_1KG * Math.max(1e-3, mass) ** PITCH_EXPONENT;
}

/** Vocal tract length (cm) of an animal of `mass` kg (never under 2 cm). */
export function tractLength(mass: number): number {
  return Math.max(2, TRACT_AT_1KG + TRACT_PER_DECADE * Math.log10(Math.max(1e-3, mass)));
}

/** Formant `n` (1, 2, 3...) of a tract `tract` cm long with the mouth `closure` shut (0 open, 1 shut), Hz. */
export function formant(n: number, tract: number, closure = 0): number {
  return ((2 * n - (closure + 1)) * TRACT_SOUND_SPEED * 100) / (4 * tract);
}

const voices = new WeakMap<AnimalSpecies, AnimalVoice>();

/** A species' voice (kept per species object). */
export function animalVoice(s: AnimalSpecies): AnimalVoice {
  let v = voices.get(s);
  if (!v) {
    v = makeVoice(s);
    voices.set(s, v);
  }
  return v;
}

/** A species' voice worked out afresh (the animal lab, whose species change in place). */
export function makeVoice(s: AnimalSpecies): AnimalVoice {
  const rng = new Rng(s.form.seed).fork('voice');
  const mass = speciesMass(s);
  const hunter = s.diet === 'carnivore';
  // Within a species' size the pitch varies about a third either way (Fletcher's Fig. 3 spreads about so).
  const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, callPitch(mass) * rng.range(0.75, 1.35)));
  const tract = tractLength(mass) * rng.range(0.9, 1.1);
  const formants: [number, number, number] = [formant(1, tract), formant(2, tract), formant(3, tract)];
  const mouthPart = speciesMouth(s);
  const mouth = mouthPart ? Math.min(1, 0.35 + 0.35 * mouthPart.size + mouthPart.spread) : 0.15;
  const teeth = mouthPart?.teeth !== false && !!mouthPart;
  const buzz = s.form.plan === 'hexapod' ? rng.range(25, 60) : 0;
  return {
    mass,
    pitch,
    tract,
    formants,
    syllable: Math.min(LONGEST_SYLLABLE, SYLLABLE_SHARE * LONGEST_UTTERANCE * mass ** BREATH_EXPONENT * rng.range(0.8, 1.2)),
    breath: rng.range(0.05, 0.35) + (buzz ? 0.15 : 0),
    rough: Math.min(1, rng.range(0, 0.3) + (hunter ? 0.35 : 0) + (teeth ? 0.1 : 0)),
    vibrato: rng.range(4, 9),
    vibratoDepth: rng.range(0, 0.04),
    contour: rng.weighted<AnimalVoice['contour']>([
      ['arch', 3],
      ['fall', 2],
      ['rise', 1.5],
      ['warble', 1],
    ]),
    syllables: rng.int(1, 3),
    mouth,
    buzz,
    hunter,
  };
}

/** The species' mouth from its body (the creature editor's parts), the widest if it has several; null without one. */
function speciesMouth(s: AnimalSpecies): { size: number; spread: number; teeth?: boolean } | null {
  let best: { size: number; spread: number; teeth?: boolean } | null = null;
  for (const p of speciesBody(s).design.parts) if (p.kind === 'mouth' && (!best || p.size > best.size)) best = p;
  return best;
}

/** One syllable of a call: when, how long, its pitch at start, middle and end (Hz), the mouth's closure from and to, loudness, noise and roughness. */
export interface Syllable {
  start: number;
  duration: number;
  pitch: readonly [number, number, number];
  closure: readonly [number, number];
  loudness: number;
  breath: number;
  rough: number;
  /** The rasp's rate, Hz (a scream's roughness); unset, the voice's own. */
  rasp?: number;
}

/** How each kind of call differs from a contact call: pitch, length, loudness, breath and rasp (Morton: fear and alarm high and tonal, hostility low and harsh). */
const KINDS: Record<CallKind, { pitch: number; length: number; loudness: number; breath: number; rough: number; syllables: (v: AnimalVoice, r: Rng) => number }> = {
  contact: { pitch: 1, length: 1, loudness: 0.7, breath: 1, rough: 1, syllables: (v) => v.syllables },
  answer: { pitch: 0.95, length: 0.85, loudness: 0.6, breath: 1, rough: 1, syllables: (v, r) => Math.max(1, v.syllables - r.int(0, 1)) },
  grunt: { pitch: 0.75, length: 0.45, loudness: 0.45, breath: 1.6, rough: 1.4, syllables: (_, r) => r.int(1, 2) },
  alert: { pitch: 1.1, length: 0.35, loudness: 0.8, breath: 2.5, rough: 0.5, syllables: () => 1 },
  alarm: { pitch: 1.6, length: 0.55, loudness: 1, breath: 0.5, rough: 0.3, syllables: (_, r) => r.int(2, 4) },
  distress: { pitch: 1.9, length: 1.6, loudness: 1, breath: 0.8, rough: 1.8, syllables: () => 1 },
  growl: { pitch: 0.55, length: 1.4, loudness: 0.75, breath: 1.4, rough: 2.5, syllables: () => 1 },
  // Carried off by the beam: as high as it goes, as harsh as it goes (Morton; Arnal's roughness), short and over and over;
  // louder, as the deep rasp takes a third of its power (measured: peaks as the distress cry's).
  scream: { pitch: 2.2, length: 0.9, loudness: 1.25, breath: 0.7, rough: 3, syllables: (_, r) => r.int(1, 2) },
};

/** Gap between a call's syllables, as a share of a syllable. */
const SYLLABLE_GAP = 0.35;

/**
 * The syllables of one call of `kind` by `voice`; `variant` picks one of
 * its endless variations (the same variant is the same call). `pitch`
 * raises or lowers it all (a scream rising as the animal is carried up).
 */
export function callShape(voice: AnimalVoice, kind: CallKind, variant: number, pitch = 1): Syllable[] {
  const r = new Rng(variant >>> 0).fork('call', kind);
  const k = KINDS[kind];
  const n = k.syllables(voice, r);
  const out: Syllable[] = [];
  let at = 0;
  const base = voice.pitch * k.pitch * pitch * r.range(0.94, 1.06);
  const length = voice.syllable * k.length;
  const open = 1 - voice.mouth;
  for (let i = 0; i < n; i++) {
    const duration = length * r.range(0.8, 1.2) * (kind === 'alarm' && i > 0 ? 0.8 : 1);
    // The contour, with alarms sharp and falling at the end, distress falling, growls flat, grunts dropping.
    let shape: AnimalVoice['contour'] = voice.contour;
    if (kind === 'alarm' || kind === 'scream') shape = 'arch';
    else if (kind === 'distress' || kind === 'grunt') shape = 'fall';
    else if (kind === 'growl') shape = 'warble';
    else if (kind === 'answer' && r.chance(0.5)) shape = shape === 'rise' ? 'fall' : 'rise';
    const p = base * (1 - 0.06 * i);
    const contour: [number, number, number] =
      shape === 'arch' ? [p * 0.85, p * 1.12, p * 0.8] : shape === 'fall' ? [p * 1.12, p, p * 0.72] : shape === 'rise' ? [p * 0.8, p * 0.95, p * 1.18] : [p, p * 1.08, p * 0.95];
    // Grunts and growls with the mouth nearly shut; the rest open to the voice's width and close again.
    const shut = kind === 'grunt' || kind === 'alert' ? 0.75 : kind === 'growl' ? Math.max(open, 0.4) : open;
    out.push({
      start: at,
      duration,
      pitch: contour,
      closure: [Math.min(0.9, shut + 0.3), shut],
      loudness: k.loudness * (i === 0 ? 1 : r.range(0.75, 0.95)),
      breath: Math.min(1, voice.breath * k.breath),
      rough: Math.min(1, voice.rough * k.rough + (voice.hunter && kind !== 'alarm' ? 0.1 : 0) + (kind === 'scream' ? 0.6 : 0)),
      ...(kind === 'scream' ? { rasp: SCREAM_RASP_MIN * (SCREAM_RASP_MAX / SCREAM_RASP_MIN) ** r.next() } : {}),
    });
    at += duration * (1 + SYLLABLE_GAP * r.range(0.6, 1.4));
  }
  return out;
}

/** How long a call lasts, seconds. */
export function callLength(syllables: readonly Syllable[]): number {
  let end = 0;
  for (const s of syllables) end = Math.max(end, s.start + s.duration);
  return end;
}
