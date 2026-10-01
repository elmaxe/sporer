import type * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Star } from '../world/Star';
import type { AmbientSound, SoundEffects } from './sfx';
import { starPitch, starsMix, starSoundParams, type StarMix } from './starMix';

/**
 * A system's stars as heard from the camera: the far loop from across the
 * system, giving way to the near loop as the camera closes on a star (see
 * `starMix`). One pair of loops for the whole system, pitched by the
 * primary's kind. Silent while the level isn't the active one (`mute`) and
 * in a starless system. Visual-only: runs in `update`, after the camera.
 */
export class StarSounds implements Entity {
  private readonly near: AmbientSound | null;
  private readonly far: AmbientSound | null;
  private readonly distances: Float64Array;
  private readonly radii: Float64Array;
  private readonly mix: StarMix = { near: 0, far: 0 };
  private muted = true;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly stars: readonly Star[],
    sfx: SoundEffects,
    debug: Debug,
  ) {
    this.distances = new Float64Array(stars.length);
    this.radii = Float64Array.from(stars, (s) => s.radius);
    const rate = stars[0] ? starPitch[stars[0].data.kind] : 1;
    this.near = stars.length ? sfx.ambient('starNear') : null;
    this.far = stars.length ? sfx.ambient('starFar') : null;
    this.near?.setRate(rate);
    this.far?.setRate(rate);

    const f = debug.folder('Star sound');
    f?.add(starSoundParams, 'scale', 0, 200);
    f?.add(starSoundParams, 'reach', 0.5, 30);
    f?.add(starSoundParams, 'nearFrom', 0, 5);
    f?.add(starSoundParams, 'nearTo', 0.5, 15);
    const pitch = f?.addFolder('Pitch per kind').close();
    for (const kind of Object.keys(starPitch) as (keyof typeof starPitch)[]) {
      pitch?.add(starPitch, kind, 0.5, 2).onChange(() => {
        const r = stars[0] ? starPitch[stars[0].data.kind] : 1;
        this.near?.setRate(r);
        this.far?.setRate(r);
      });
    }
  }

  /** Fades the stars out (`true`, the level being left) or lets them sound again. */
  mute(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.near?.setLevel(0);
      this.far?.setLevel(0);
    }
  }

  update(): void {
    if (this.muted || !this.near || !this.far) return;
    const eye = this.camera.position;
    for (let i = 0; i < this.stars.length; i++) this.distances[i] = eye.distanceTo(this.stars[i]!.renderPosition);
    starsMix(this.distances, this.radii, this.mix);
    this.near.setLevel(this.mix.near);
    this.far.setLevel(this.mix.far);
  }

  dispose(): void {
    this.near?.stop();
    this.far?.stop();
  }
}
