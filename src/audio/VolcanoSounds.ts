import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Volcanoes } from '../planet/Volcanoes';
import type { AmbientSound, SoundEffects } from './sfx';
import { volcanoMix, volcanoSoundParams, type VolcanoMix } from './volcanoMix';

/**
 * The visited body's volcanoes as heard from the camera: the far loop from
 * across the globe, giving way to the near loop as the camera closes on one
 * (see `volcanoMix`), louder while they erupt hard. One pair of loops for
 * them all: their powers add, capped at 1. Silent while the level isn't the
 * active one (`mute`) and with no volcano risen. Visual-only: runs in
 * `update`, after the volcanoes (which shake the camera).
 */
export class VolcanoSounds implements Entity {
  private readonly near: AmbientSound;
  private readonly far: AmbientSound;
  private readonly one: VolcanoMix = { near: 0, far: 0 };
  private readonly eye = new THREE.Vector3();
  private readonly toEye = new THREE.Vector3();
  private muted = true;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly volcanoes: Volcanoes,
    sfx: SoundEffects,
    debug: Debug,
  ) {
    this.near = sfx.ambient('volcanoNear');
    this.far = sfx.ambient('volcanoFar');

    const f = debug.folder('Volcano sound');
    f?.add(volcanoSoundParams, 'reach', 0.5, 40);
    f?.add(volcanoSoundParams, 'nearFrom', 0, 5);
    f?.add(volcanoSoundParams, 'nearTo', 0.5, 15);
    f?.add(volcanoSoundParams, 'quiet', 0, 1);
    f?.add(volcanoSoundParams, 'belowHorizon', 0, 1);
  }

  /** Fades the volcanoes out (`true`, the level being left) or lets them sound again. */
  mute(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.near.setLevel(0);
      this.far.setLevel(0);
    }
  }

  update(): void {
    if (this.muted) return;
    // In the body frame, like the vents.
    const eye = this.camera.getWorldPosition(this.eye);
    let near = 0;
    let far = 0;
    for (const v of this.volcanoes.vents) {
      const toEye = this.toEye.copy(eye).sub(v.vent.position);
      const distance = toEye.length();
      const elevation = distance > 0 ? toEye.dot(v.shape.centre) / distance : 1;
      volcanoMix(distance, v.shape.baseRadius, elevation, v.activity, this.one);
      near += this.one.near * this.one.near;
      far += this.one.far * this.one.far;
    }
    this.near.setLevel(Math.min(1, Math.sqrt(near)));
    this.far.setLevel(Math.min(1, Math.sqrt(far)));
  }

  dispose(): void {
    this.near.stop();
    this.far.stop();
  }
}
