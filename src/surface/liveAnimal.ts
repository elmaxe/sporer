import * as THREE from 'three';
import type { AnimalSpecies } from '../gen/animals';
import { GROUND_DETAIL_LAYER } from '../world/groundDepth';
import { addAnimationAttributes, animCycle, animalMotion, createAnimalGeometry, createAnimalMaterial, type AnimalUniforms } from './animalLook';

/**
 * One animal drawn on its own, out of the herds' batches: lifted by the cargo
 * beam, set down from the hold, or killed by the laser. Its own mesh (the
 * nearest level of detail, one instance at the group's origin) and material
 * (no level-of-detail fade, a tint for what becomes of it), walked by the
 * same shader as the herds (surface/animalLook.ts). The holder disposes it.
 */
export interface AnimalObject {
  /** Stands on y = 0, facing +Z, up +Y: place, turn and scale it as a whole (its scale multiplies the species' length). */
  readonly object: THREE.Group;
  readonly material: THREE.MeshStandardMaterial;
  readonly tint: Pick<AnimalUniforms, 'uTint' | 'uTintMix'>;
  /** Sets its walk as the shader takes it: where it is in its stride (cycles), how long a stride (0–1), walking to trotting, grazing, and its idle clock (s). */
  move(cycle: number, stride: number, trot: number, graze: number, idle: number): void;
  dispose(): void;
}

/** An animal of `species` on a world of surface gravity `gravity` (g), for a scene in the planet's body frame. */
export function createAnimalObject(species: AnimalSpecies, gravity: number): AnimalObject {
  const geometry = createAnimalGeometry(species, 0);
  const { material, uniforms } = createAnimalMaterial(0, species, animalMotion(species, gravity), false);
  const mesh = new THREE.InstancedMesh(geometry, material, 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.frustumCulled = false;
  mesh.layers.enable(GROUND_DETAIL_LAYER);
  const { anim, idle } = addAnimationAttributes(mesh, 1);
  const object = new THREE.Group();
  object.name = species.name;
  object.add(mesh);
  return {
    object,
    material,
    tint: uniforms,
    move(cycle, stride, trot, graze, idleTime) {
      const a = anim.array as Float32Array;
      a[0] = animCycle(cycle);
      a[1] = stride;
      a[2] = trot;
      a[3] = graze;
      anim.needsUpdate = true;
      (idle.array as Float32Array)[0] = idleTime % 10000;
      idle.needsUpdate = true;
    },
    dispose() {
      object.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
