import * as THREE from 'three';
import type { StarActivity } from '../gen/starActivity';
import { isBlackHole } from '../gen/blackHoles';
import type { StarData } from '../gen/stars';
import { BlackHoleLook, blackHoleShape } from './BlackHoleLook';
import type { SkyCapture } from './skyCapture';
import {
  animateStarMaterials,
  createCoronaGeometry,
  createCoronaMaterial,
  createStarSurfaceMaterial,
} from './starMaterials';

/**
 * How a star looks: the animated surface (in `spin`, which turns with the
 * star's rotation) and the corona billboard, in the star's own units (its
 * radius). Shared by the system's `Star` and the galaxy's close-up of the
 * system being entered or left, so both draw the same thing. A pure function
 * of the system clock (`animate`).
 */
export class StarLook {
  readonly object = new THREE.Group();
  /** Turns with the star's rotation: the surface (and whatever else is added to it). */
  readonly spin = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly glow: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(
    data: StarData,
    private readonly activity: StarActivity,
    /** Seeds the surface pattern. */
    seed: number,
  ) {
    const giant = data.kind === 'redGiant' || data.kind === 'blueGiant';
    // Not tone mapped (the shaders skip it): ACES would wash the colour out towards beige.
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(data.radius, 64, 32), createStarSurfaceMaterial(data.color, activity, seed));
    // The glare reaches this many star radii: further round small stars, so white dwarfs still read as
    // stars, less far round giants (already big), whose glare is fainter too.
    const extent = data.radius < 12 ? 5 : giant ? 3.5 : 4;
    this.glow = new THREE.Mesh(createCoronaGeometry(), createCoronaMaterial(data.color, giant ? 0.6 : 1, seed, extent));
    this.glow.scale.setScalar(data.radius * 2 * extent);
    // Face the camera's position (a Sprite faces its view plane, which lets the glow
    // poke out in front of the star when it's off-centre). Runs after the scene's
    // matrix update, so refresh the matrix here.
    this.glow.onBeforeRender = (_renderer, _scene, camera) => {
      this.glow.lookAt(camera.position);
      this.glow.updateMatrixWorld();
    };
    this.spin.add(this.mesh);
    this.object.add(this.spin, this.glow);
  }

  /** Shows the surface and corona as they are at system time `time`. */
  animate(time: number): void {
    this.spin.rotation.y = ((2 * Math.PI * time) / this.activity.rotationPeriod) % (2 * Math.PI);
    animateStarMaterials(this.mesh.material, this.glow.material, this.activity, time);
  }

  /** Disposes the meshes. */
  dispose(): void {
    this.object.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.glow.geometry.dispose();
    this.glow.material.dispose();
  }
}

/** What a system's star looks like, whatever its kind: a star's surface and corona or a black hole. */
export type StarView = StarLook | BlackHoleLook;

/**
 * The look for `data`: a `StarLook`, or for a black hole a `BlackHoleLook`
 * bending `sky` (null: drawn over whatever is behind, as in the galaxy's
 * close-up). Seeded alike wherever it is drawn, so every view matches.
 */
export function createStarView(data: StarData, activity: StarActivity, seed: number, sky: SkyCapture | null): StarView {
  return isBlackHole(data) ? new BlackHoleLook(blackHoleShape(data, seed), sky) : new StarLook(data, activity, seed);
}
