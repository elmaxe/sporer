import * as THREE from 'three';
import type { PlantSpecies } from '../gen/plants';
import { createPlantGeometry } from '../surface/plantLook';

/** The icon's size in pixels (drawn at twice it, then down, which smooths its edges); the repository's pictures are bigger. */
export const ICON_SIZE = 80;

/**
 * Pictures of plant species for the item bar's cargo slots and the planet
 * map's Species tab: the species' full mesh (the game's own,
 * surface/plantLook.ts) drawn once with the game's renderer into a small
 * transparent image, lit from the upper left, and kept as a data URL per
 * species key.
 */
export class PlantIcons {
  private readonly cache = new Map<string, string>();

  constructor(private readonly renderer: THREE.WebGLRenderer) {}

  /** The icon of species `species` (cached by `key`), `size` pixels square, as an image URL. */
  url(key: string, species: PlantSpecies, size = ICON_SIZE): string {
    const id = size === ICON_SIZE ? key : `${key}@${size}`;
    const cached = this.cache.get(id);
    if (cached) return cached;
    const url = this.draw(species, size);
    this.cache.set(id, url);
    return url;
  }

  private draw(species: PlantSpecies, pixels: number): string {
    const { renderer } = this;
    const geometry = createPlantGeometry(species, 0);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(geometry, material);
    // Turned a little, so a flat crown shows some depth.
    mesh.rotation.y = 0.6;
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight(0xdfeaff, 0x3a3020, 1.4));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
    sun.position.set(-2, 3, 2.5);
    scene.add(sun);

    // Framed whole, from a little above.
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const extent = Math.max(size.y, size.x, size.z) * 0.62;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
    const distance = extent / Math.tan(THREE.MathUtils.degToRad(15));
    camera.position.set(0, centre.y + distance * 0.2, distance).add(new THREE.Vector3(centre.x, 0, centre.z));
    camera.lookAt(centre);

    const url = snapshotIcon(renderer, scene, camera, pixels);
    geometry.dispose();
    material.dispose();
    return url;
  }
}

/**
 * Draws `scene` from `camera` into a small transparent square image, `size`
 * pixels, with the game's renderer (leaving its target and clear colour as
 * they were), as a PNG data URL: the item bar's, the map's and the
 * repository's species pictures.
 */
export function snapshotIcon(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, size = ICON_SIZE): string {
  const drawn = size * 2;
  const target = new THREE.WebGLRenderTarget(drawn, drawn);
  const previous = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const pixels = new Uint8Array(drawn * drawn * 4);
  renderer.readRenderTargetPixels(target, 0, 0, drawn, drawn, pixels);
  renderer.setRenderTarget(previous);
  renderer.setClearColor(clear, clearAlpha);
  target.dispose();

  // A render target holds linear colour, bottom row first: encode as sRGB, flipped, then draw down to the icon's size.
  const full = document.createElement('canvas');
  full.width = full.height = drawn;
  const image = full.getContext('2d')!.createImageData(drawn, drawn);
  for (let y = 0; y < drawn; y++) {
    for (let x = 0; x < drawn; x++) {
      const from = ((drawn - 1 - y) * drawn + x) * 4;
      const to = (y * drawn + x) * 4;
      for (let c = 0; c < 3; c++) image.data[to + c] = SRGB[pixels[from + c]!]!;
      image.data[to + 3] = pixels[from + 3]!;
    }
  }
  full.getContext('2d')!.putImageData(image, 0, 0);
  const icon = document.createElement('canvas');
  icon.width = icon.height = size;
  const ctx = icon.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, size, size);
  return icon.toDataURL('image/png');
}

/** Linear 8-bit → sRGB 8-bit. */
const SRGB = Uint8Array.from({ length: 256 }, (_, i) => {
  const l = i / 255;
  const s = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(s * 255);
});
