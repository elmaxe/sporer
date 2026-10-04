import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { AmbientSound, SoundEffects } from '../audio/sfx';
import { VENT_CUE, eruptionLoudness, ventLevel, ventPitch, ventSoundParams, ventsLevel } from '../audio/ventMix';
import type { Geysers } from './Geysers';
import type { RenderClock } from './PlanetFrame';

/**
 * A body's geysers, plumes and fumaroles as heard from the camera: their
 * kind's loop (audio/ventMix.ts) as loud as the vents erupting near it are,
 * each by its distance and how far into its eruption it is, and a burst
 * when one nearby starts. Silent while the level isn't the active one
 * (`mute`). Visual-only: runs in `update`, after the camera.
 */
export class VentSounds implements Entity {
  private readonly loop: AmbientSound;
  private readonly rate: number;
  private readonly cameraPosition = new THREE.Vector3();
  private readonly vent = new THREE.Vector3();
  private muted = false;
  private last = Number.NaN;
  private lastBurst = -Infinity;
  /** The loop's level now (for debugging and the smoke test). */
  level = 0;

  constructor(
    private readonly geysers: Geysers,
    private readonly camera: THREE.Camera,
    private readonly frame: RenderClock,
    private readonly sfx: SoundEffects,
    debug: Debug,
  ) {
    const kind = geysers.activity.kind;
    this.loop = sfx.ambient(VENT_CUE[kind]);
    this.rate = ventPitch[kind];
    this.loop.setRate(this.rate);
    const f = debug.folder('Vent sound');
    f?.add(ventSoundParams, 'reach', 0.2, 10);
    f?.add(ventSoundParams, 'minReach', 1, 60);
    f?.add(ventSoundParams, 'burst', 0, 1);
    f?.add(ventSoundParams, 'gap', 0, 10);
  }

  /** Fades the vents out (`true`, the level being left) or lets them sound again. */
  mute(muted: boolean): void {
    this.muted = muted;
    if (muted) this.loop.setLevel((this.level = 0));
  }

  update(): void {
    if (this.muted) return;
    const time = this.frame.renderTime;
    const eye = this.camera.getWorldPosition(this.cameraPosition);
    const { vents } = this.geysers.activity;
    // A clock jump (the lab's) starts nothing audibly.
    const stepped = time - this.last;
    const fresh = stepped > 0 && stepped < 1;
    let sum = 0;
    let burst = 0;
    for (const e of this.geysers.events) {
      const v = vents[e.vent]!;
      // Heard from about a third of the way up the plume.
      this.vent.set(v.dir[0], v.dir[1], v.dir[2]).multiplyScalar(v.base + v.peak * 0.3);
      const d = eye.distanceTo(this.vent);
      sum += ventLevel(d, v.peak, eruptionLoudness(time - e.start, e.duration));
      if (fresh && this.last < e.start && time >= e.start) burst = Math.max(burst, ventLevel(d, v.peak, 1));
    }
    this.last = time;
    this.level = ventsLevel(sum);
    this.loop.setLevel(this.level);
    if (burst >= ventSoundParams.burst && time - this.lastBurst >= ventSoundParams.gap) {
      this.lastBurst = time;
      this.sfx.play('ventBurst', { rate: this.rate });
    }
  }

  dispose(): void {
    this.loop.stop();
  }
}
