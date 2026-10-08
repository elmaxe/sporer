import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { playCall } from '../audio/animalSynth';
import type { SoundEffects } from '../audio/sfx';
import { alarmCalls, gruntAt, herdConversation, talkParams, talkSlot, type PlannedCall } from '../gen/animalTalk';
import { CALL_KINDS, animalVoice, callShape, type CallKind } from '../gen/animalVoice';
import type { AnimalSpecies } from '../gen/animals';
import type { RenderClock } from '../planet/PlanetFrame';
import { animalParams } from './animalParams';
import type { HerdView, SurfaceAnimals } from './SurfaceAnimals';

/** Tunables of the animals' calls (debug panel: Animal calls). */
export const animalSoundParams = {
  /** Overall loudness of the calls. */
  volume: 0.8,
  /**
   * Distance (units) at which a 100 kg animal's call has dropped to half
   * its power; bigger animals carry further (× M^0.3, half Fletcher's M^0.6
   * range scaling: stylised so a mouse is still heard from the ship).
   */
  reach: 22,
  /** Calls quieter than this aren't played. */
  quietest: 0.02,
  /** At most this many calls at once. */
  voices: 8,
};

/** A scream rises by this share of its pitch as the animal is carried up the beam (stylised: terror mounting). */
const SCREAM_RISE = 0.35;

/** Calls of a herd for a conversation slot, and each animal's next grunt (kept until the slot moves on). */
interface HerdTalk {
  slot: number;
  calls: PlannedCall[];
  gruntSlot: number;
  grunts: Float64Array;
}

/** A call waiting for its moment: the alarms of a panic. */
interface Pending {
  at: number;
  cell: HerdView;
  call: PlannedCall;
}

/**
 * The animals heard from the camera: each herd near enough talks (its
 * animals call and answer each other, gen/animalTalk.ts), grazers grunt,
 * a herd that spots the ship snorts, one that bolts gives the alarm as it
 * runs, and an animal grabbed by the beam or hit by the laser cries out.
 * Every call is synthesised from its species' voice (gen/animalVoice.ts,
 * audio/animalSynth.ts), as loud as it is near and panned to where it is.
 * Silent while the level isn't the active one (`mute`) or the animals are
 * off. Visual-only: runs in `update`, after the animals and the camera.
 */
export class AnimalSounds implements Entity {
  /** Calls played so far, and the last (for the smoke test and debugging). */
  calls = 0;
  last: { kind: CallKind; species: string; gain: number } | null = null;
  /** Calls played so far, by kind. */
  readonly heard = Object.fromEntries(CALL_KINDS.map((k) => [k, 0])) as Record<CallKind, number>;
  private muted = false;
  private lastTime = Number.NaN;
  private readonly talks = new Map<string, HerdTalk>();
  private readonly pending: Pending[] = [];
  private readonly ends: number[] = [];
  private readonly eye = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly toBody = new THREE.Matrix4();
  private readonly at = new THREE.Vector3();
  private readonly where = new THREE.Vector3();
  private readonly scratch: PlannedCall[] = [];

  constructor(
    private readonly animals: SurfaceAnimals,
    private readonly camera: THREE.Camera,
    private readonly clock: RenderClock,
    private readonly sfx: SoundEffects,
    debug: Debug,
  ) {
    const f = debug.folder('Animal calls');
    f?.add(animalSoundParams, 'volume', 0, 2);
    f?.add(animalSoundParams, 'reach', 2, 100);
    f?.add(animalSoundParams, 'voices', 1, 24, 1);
    f?.add(talkParams, 'slot', 1, 30).name('talk slot (s at 1 kg)');
    f?.add(talkParams, 'chance', 0, 1);
    f?.add(talkParams, 'gruntChance', 0, 1);
  }

  /** Silences them (`true`, the level being left) or lets them be heard again. */
  mute(muted: boolean): void {
    this.muted = muted;
    this.pending.length = 0;
    this.lastTime = Number.NaN;
  }

  update(): void {
    const t = this.clock.renderTime;
    const last = this.lastTime;
    this.lastTime = t;
    const step = t - last;
    // A clock jump (or the first frame) starts nothing: the calls of the skipped time are past.
    if (this.muted || !animalParams.enabled || !(step > 0 && step < 1)) {
      if (!(step > 0 && step < 1)) this.pending.length = 0;
      this.animals.events.length = 0;
      return;
    }
    this.camera.updateMatrixWorld();
    this.toBody.copy(this.animals.object.matrixWorld).invert();
    this.eye.setFromMatrixPosition(this.camera.matrixWorld).applyMatrix4(this.toBody);
    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0).transformDirection(this.toBody);

    for (const e of this.animals.events) {
      const herd = e.cell.herd;
      if (!herd) continue;
      if (e.kind === 'distress') this.play(e.cell.species, 'distress', herd.seed ^ Math.floor(e.time * 1000), e.x, e.y, e.z);
      else if (e.kind === 'alert') this.pending.push({ at: t + 0.15, cell: e.cell, call: { at: t + 0.15, member: e.member, kind: 'alert', variant: herd.seed ^ Math.floor(t) } });
      else {
        // Bolting: the alarm, not the snort it was about to give.
        for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i]!.cell === e.cell && this.pending[i]!.call.kind === 'alert') this.pending.splice(i, 1);
        this.scratch.length = 0;
        for (const call of alarmCalls(herd.seed, e.startle, t, herd.count, e.member, this.scratch)) this.pending.push({ at: call.at, cell: e.cell, call });
      }
    }
    this.animals.events.length = 0;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i]!;
      if (p.at > t) continue;
      this.pending.splice(i, 1);
      this.playMember(p.cell, p.call);
    }

    this.animals.forEachHerd((cell) => this.listen(cell, last, t));
    // Forget the talk of herds no longer loaded (they're made again from their seed if they come back).
    if (this.talks.size > 256) this.talks.clear();
  }

  /** A herd's calls due between `from` and `to` (seconds, the clock's): conversations, and grazers' grunts. */
  private listen(cell: HerdView, from: number, to: number): void {
    const { herd, species } = cell;
    if (!herd || !species) return;
    if (this.eye.distanceTo(cell.centre) - cell.bound > this.audible(species)) return;
    const voice = animalVoice(species);
    const length = talkSlot(voice);
    const slot = Math.floor(to / length);
    let talk = this.talks.get(cell.key);
    if (!talk || talk.grunts.length !== herd.count) {
      talk = { slot: Number.NaN, calls: [], gruntSlot: Number.NaN, grunts: new Float64Array(herd.count) };
      this.talks.set(cell.key, talk);
    }
    if (talk.slot !== slot) {
      talk.slot = slot;
      talk.calls.length = 0;
      // The last slot's conversation may run on into this one.
      herdConversation(herd.seed, slot - 1, herd.count, voice, talk.calls);
      herdConversation(herd.seed, slot, herd.count, voice, talk.calls);
    }
    for (const call of talk.calls) if (call.at > from && call.at <= to && cell.panic[call.member] !== 1) this.playMember(cell, call);
    const gruntSlot = Math.floor(to / talkParams.gruntSlot);
    if (talk.gruntSlot !== gruntSlot) {
      talk.gruntSlot = gruntSlot;
      for (let k = 0; k < herd.count; k++) talk.grunts[k] = gruntAt(herd.seed, k, gruntSlot) ?? Number.NaN;
    }
    if (voice.hunter) return;
    for (let k = 0; k < herd.count; k++) {
      const at = talk.grunts[k]!;
      if (at > from && at <= to && cell.poses[k]!.graze > 0.5) this.playMember(cell, { at, member: k, kind: 'grunt', variant: herd.seed ^ (gruntSlot * 31 + k) });
    }
  }

  /** How far (units) a species' calls are worth playing: where even its loudest is too quiet. */
  private audible(species: AnimalSpecies): number {
    const p = animalSoundParams;
    const ref = this.reachOf(species);
    return ref * Math.sqrt(1 / p.quietest - 1);
  }

  private reachOf(species: AnimalSpecies): number {
    return animalSoundParams.reach * (Math.max(0.5, animalVoice(species).mass) / 100) ** 0.3;
  }

  /** Plays a planned call by an animal of `cell` where it is (on screen or not), if it's still there. */
  private playMember(cell: HerdView, call: PlannedCall): void {
    const p = this.where;
    if (this.animals.whereIs(cell, call.member, p)) this.play(cell.species, call.kind, call.variant, p.x, p.y, p.z);
  }

  /** Synthesises a call by animal `k` of `cell` at (x, y, z) (body frame), as loud as it is near the camera, panned to its side. */
  /**
   * An animal off the ground screams: carried up the beam (higher the higher
   * it's carried, `frenzy` 0 to 1) or falling. `at` is where it is (body
   * frame). Returns how long the scream lasts, seconds (0 when nothing was
   * heard, as when audio is locked or the animals are off).
   */
  scream(species: AnimalSpecies, at: THREE.Vector3, variant: number, frenzy: number): number {
    if (this.muted || !animalParams.enabled) return 0;
    return this.play(species, 'scream', variant, at.x, at.y, at.z, 1 + SCREAM_RISE * Math.min(1, Math.max(0, frenzy)));
  }

  /** Synthesises a call by an animal of `species` at (x, y, z) (body frame), as loud as it is near the camera, panned to its side, its pitch × `pitch`; returns how long it lasts (0: not played). */
  private play(species: AnimalSpecies | null, kind: CallKind, variant: number, x: number, y: number, z: number, pitch = 1): number {
    const out = this.sfx.synth();
    if (!species || !out) return 0;
    const p = animalSoundParams;
    const d = this.at.set(x, y, z).sub(this.eye).length();
    const ref = this.reachOf(species);
    const gain = p.volume / (1 + (d / ref) ** 2);
    if (gain < p.quietest) return 0;
    // Room for it? Screams, distress and alarms are always heard.
    const now = out.ctx.currentTime;
    for (let i = this.ends.length - 1; i >= 0; i--) if (this.ends[i]! <= now) this.ends.splice(i, 1);
    if (this.ends.length >= p.voices && kind !== 'distress' && kind !== 'alarm' && kind !== 'scream') return 0;
    const pan = d > 1e-3 ? (this.at.dot(this.right) / d) * 0.85 : 0;
    const voice = animalVoice(species);
    const end = playCall(out, voice, callShape(voice, kind, variant, pitch), gain, pan);
    this.ends.push(end);
    this.calls++;
    this.heard[kind]++;
    this.last = { kind, species: species.name, gain };
    return end - now;
  }

  dispose(): void {
    this.pending.length = 0;
    this.talks.clear();
  }
}
