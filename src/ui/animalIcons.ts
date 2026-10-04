import * as THREE from 'three';
import type { AnimalSpecies } from '../gen/animals';
import { addAnimationAttributes, animalMotion, createAnimalGeometry, createAnimalMaterial } from '../surface/animalLook';
import { snapshotIcon } from './plantIcons';

/**
 * Pictures of animal species for the planet map's Species tab: the species'
 * nearest level of detail with the game's own coat and shader
 * (surface/animalLook.ts), standing, seen from the side and a little in front
 * and above, facing right, drawn once into a small transparent image and kept
 * as a data URL per species key.
 */
export class AnimalIcons {
  private readonly cache = new Map<string, string>();

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  /** The icon of species `species` (cached by `key`), as an image URL. */
  url(key: string, species: AnimalSpecies): string {
    const cached = this.cache.get(key);
    if (cached) return cached;
    const url = this.draw(species);
    this.cache.set(key, url);
    return url;
  }

  private draw(species: AnimalSpecies): string {
    const geometry = createAnimalGeometry(species, 0);
    const { material } = createAnimalMaterial(0, species, animalMotion(species), false);
    // One instance, standing still where it was built (its rest pose).
    const mesh = new THREE.InstancedMesh(geometry, material, 1);
    mesh.setMatrixAt(0, new THREE.Matrix4());
    mesh.frustumCulled = false;
    addAnimationAttributes(mesh, 1);
    const scene = new THREE.Scene();
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x3a3020, 1.4));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sun.position.set(-2, 3, 2.5);
    scene.add(sun);

    // Framed whole: it faces +z, so from -x it looks to the right.
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const extent = Math.max(size.y, size.z, size.x) * 0.6;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    const distance = extent / Math.tan(THREE.MathUtils.degToRad(15));
    camera.position.set(-distance * 0.85, distance * 0.25, distance * 0.45).add(centre);
    camera.lookAt(centre);

    const url = snapshotIcon(this.renderer, scene, camera);
    mesh.dispose();
    geometry.dispose();
    material.dispose();
    return url;
  }
}
