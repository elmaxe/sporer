import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { starLightIntensity, type Star } from '../world/Star';
import { lightDirection } from './frame';
import type { PlanetFrame } from './PlanetFrame';

/** Sunlight comes from this far out along its direction (directional lights only use the direction). */
const LIGHT_DISTANCE = 1000;

/**
 * Sunlight for the planet level: one directional light per star, pointing
 * from where that star is in the sky (so the day side and the terminator
 * match the sky), plus a faint ambient so the night side isn't pitch black.
 */
export class PlanetLights implements Entity {
  private readonly lights: THREE.DirectionalLight[];
  private readonly ambient = new THREE.AmbientLight('#9bb8ff', 0.4);
  private readonly starPosition = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly frame: PlanetFrame,
    private readonly stars: readonly Star[],
    /** Written with the direction to the first star each frame. */
    private readonly sun: THREE.Vector3,
    /** Written with the first star's light (colour × intensity) and the ambient light, for unlit shaders that shade by hand. */
    sunLight?: THREE.Color,
    ambientLight?: THREE.Color,
  ) {
    // Same intensity as the star's point light in the system view.
    this.lights = stars.map((s) => new THREE.DirectionalLight(s.data.color, starLightIntensity(s.data)));
    scene.add(this.ambient, ...this.lights);
    sunLight?.copy(this.lights[0]!.color).multiplyScalar(this.lights[0]!.intensity);
    ambientLight?.copy(this.ambient.color).multiplyScalar(this.ambient.intensity);
    this.update();
  }

  update(): void {
    for (let i = 0; i < this.stars.length; i++) {
      const light = this.lights[i]!;
      this.stars[i]!.positionAt(this.frame.renderTime, this.starPosition);
      lightDirection(this.starPosition, this.frame.center, this.frame.inverse, light.position);
      if (i === 0) this.sun.copy(light.position);
      light.position.multiplyScalar(LIGHT_DISTANCE);
    }
  }

  dispose(): void {
    this.scene.remove(this.ambient, ...this.lights);
    this.ambient.dispose();
    for (const light of this.lights) light.dispose();
  }
}
