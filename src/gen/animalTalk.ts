import { callLength, callShape, type AnimalVoice, type CallKind } from './animalVoice';
import { hashSeed } from './rng';

/*
 * When a herd's animals call (audio: surface/AnimalSounds.ts): who talks
 * to whom and when, as pure functions of the herd's seed and the clock,
 * like the herds' walks, so the same moment always holds the same
 * exchange. A herd's time is cut into slots; in a slot one animal may call
 * and others answer it in turn, each a moment after the last call ended
 * (contact calls keep a herd together, so they go back and forth). Grazing
 * animals grunt now and then, on slots of their own. When a herd panics,
 * the animals nearest the threat give the alarm first and others take it
 * up as they run (`alarmCalls`). The timings are stylised.
 */

export const talkParams = {
  /** Seconds per conversation slot, for a 1 kg animal; bigger ones talk slower (× M^`slotExponent`: half the breathing period's 0.26, stylised so giants still talk). */
  slot: 4,
  slotExponent: 0.13,
  /** Chance a slot holds a conversation. */
  chance: 0.6,
  /** At most this many answers. */
  maxAnswers: 3,
  /** Seconds from the end of one call to the start of its answer. */
  gapMin: 0.15,
  gapMax: 0.7,
  /** A grazing animal's grunt slot (seconds) and the chance it grunts in one. */
  gruntSlot: 5,
  gruntChance: 0.3,
  /** Alarm calls in a panic after the first, at most, spread over this many seconds. */
  alarms: 3,
  alarmSpread: 2.5,
};

/** A call in a herd's schedule: when (seconds, the clock's), which animal, what kind, and which variation (`callShape`'s). */
export interface PlannedCall {
  at: number;
  member: number;
  kind: CallKind;
  variant: number;
}

function unit(h: number): number {
  return (h >>> 0) / 0x100000000;
}

/** Seconds per conversation slot for `voice`'s species. */
export function talkSlot(voice: AnimalVoice, p = talkParams): number {
  return p.slot * Math.max(1, voice.mass) ** p.slotExponent;
}

/**
 * The conversation in slot `slot` of a herd (seed `seed`, `count` animals)
 * with `voice`, appended to `out` in time order (nothing if the slot is
 * quiet). Hunters growl to each other; grazers call and answer.
 */
export function herdConversation(seed: number, slot: number, count: number, voice: AnimalVoice, out: PlannedCall[] = [], p = talkParams): PlannedCall[] {
  if (count <= 0 || unit(hashSeed(seed, 'talk', slot)) >= p.chance) return out;
  const length = talkSlot(voice, p);
  let at = slot * length + unit(hashSeed(seed, 'talk-at', slot)) * length * 0.5;
  let member = Math.floor(unit(hashSeed(seed, 'talk-who', slot)) * count);
  const answers = count > 1 ? Math.floor(unit(hashSeed(seed, 'talk-answers', slot)) * (p.maxAnswers + 1)) : 0;
  for (let i = 0; i <= answers; i++) {
    const kind: CallKind = voice.hunter ? (i === 0 ? 'growl' : 'answer') : i === 0 ? 'contact' : 'answer';
    const variant = hashSeed(seed, 'talk-variant', slot, i);
    out.push({ at, member, kind, variant });
    const gap = p.gapMin + unit(hashSeed(seed, 'talk-gap', slot, i)) * (p.gapMax - p.gapMin);
    at += callLength(callShape(voice, kind, variant)) + gap;
    // Someone else answers (two of them may go back and forth).
    const next = Math.floor(unit(hashSeed(seed, 'talk-next', slot, i)) * (count - 1));
    member = next >= member ? next + 1 : next;
  }
  return out;
}

/** When animal `member` grunts in grunt slot `slot` (seconds, the clock's), or null if it doesn't; it's heard only if it is grazing then. */
export function gruntAt(seed: number, member: number, slot: number, p = talkParams): number | null {
  if (unit(hashSeed(seed, 'grunt', member, slot)) >= p.gruntChance) return null;
  return (slot + unit(hashSeed(seed, 'grunt-at', member, slot))) * p.gruntSlot;
}

/**
 * The alarm calls of a herd's `startle`th panic, startled at `start` with
 * animal `first` nearest the threat: it gives the alarm at once, and up to
 * `alarms` others take it up as they run. Appended to `out`.
 */
export function alarmCalls(seed: number, startle: number, start: number, count: number, first: number, out: PlannedCall[] = [], p = talkParams): PlannedCall[] {
  out.push({ at: start + 0.05, member: first, kind: 'alarm', variant: hashSeed(seed, 'alarm', startle, 0) });
  const more = Math.min(count - 1, Math.floor(unit(hashSeed(seed, 'alarms', startle)) * (p.alarms + 1)));
  for (let i = 1; i <= more; i++) {
    const at = start + 0.3 + unit(hashSeed(seed, 'alarm-at', startle, i)) * p.alarmSpread;
    const k = Math.floor(unit(hashSeed(seed, 'alarm-who', startle, i)) * (count - 1));
    out.push({ at, member: k >= first ? k + 1 : k, kind: 'alarm', variant: hashSeed(seed, 'alarm', startle, i) });
  }
  return out.sort((a, b) => a.at - b.at);
}
