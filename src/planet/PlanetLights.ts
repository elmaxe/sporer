import * as THREE from 'three';
import { onGroundLayers } from '../world/groundDepth';
import type { Entity } from '../core/Entity';
import { starLightColor } from '../gen/stars';
import { starLightIntensity, type Star } from '../world/Star';
import { galacticLightParams } from '../world/galacticLight';
import { lightDirection } from './frame';
import type { PlanetFrame } from './PlanetFrame';

/** Sunlight comes from this far out along its direction (directional lights only use the direction). */
const LIGHT_DISTANCE = 1000;

/**
 * Sunlight for the planet level: one directional light per star, pointing
 * from where that star is in the sky (so the day side and the terminator
 * match the sky), plus a faint ambient so the night side isn't pitch black.
 * With no star (a rogue planet), one dim light from the galactic centre
 * instead (see world/galacticLight.ts).
 */
export class PlanetLights implements Entity {
  private readonly lights: THREE.DirectionalLight[];
  private readonly ambient = onGroundLayers(new THREE.AmbientLight('#9bb8ff', 0.4));
  private readonly starPosition = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly frame: PlanetFrame,
    private readonly stars: readonly Star[],
    /** Written with the direction to the first star each frame. */
    private readonly sun: THREE.Vector3,
    /** Written with the first star's light (colour × intensity) and the ambient light, for unlit shaders that shade by hand. */
    private readonly sunLight?: THREE.Color,
    ambientLight?: THREE.Color,
    /** System-space unit direction of the galactic centre: the light of a system with no star. */
    private readonly galacticCentre: THREE.Vector3 | null = null,
  ) {
    // Same intensity as the star's point light in the system view.
    this.lights = stars.map((s) => onGroundLayers(new THREE.DirectionalLight(starLightColor(s.data), starLightIntensity(s.data))));
    if (this.lights.length === 0) this.lights.push(onGroundLayers(new THREE.DirectionalLight(galacticLightParams.color, galacticLightParams.intensity)));
    scene.add(this.ambient, ...this.lights);
    ambientLight?.copy(this.ambient.color).multiplyScalar(this.ambient.intensity);
    this.update();
  }

  update(): void {
    if (this.stars.length === 0) {
      // Fixed in the sky, like the far galaxy it comes from; the debug panel may change it.
      const light = this.lights[0]!;
      light.color.set(galacticLightParams.color);
      light.intensity = galacticLightParams.intensity;
      if (this.galacticCentre) this.frame.toLocalDirection(this.galacticCentre, light.position);
      this.sun.copy(light.position);
      light.position.multiplyScalar(LIGHT_DISTANCE);
    }
    this.sunLight?.copy(this.lights[0]!.color).multiplyScalar(this.lights[0]!.intensity);
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
