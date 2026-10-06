import * as THREE from 'three';
import { groundDensity, type AtmosphereLook } from '../gen/atmosphere';
import { hazeDepth } from '../terraform/light';
import { createAtmosphere, type AtmosphereSun } from './atmosphereShell';
import type { GroundDepth } from './groundDepth';

/*
 * An aerosol haze (the Terraform tab's aerosol spray): a pale shell laid
 * over a body's air in both views, drawn by the atmosphere's own shader,
 * as thick as the haze's optical depth (terraform/light.ts hazeDepth:
 * Pinatubo's haze was 0.15 straight down), with deep red dusks (sulphate
 * hazes redden sunsets). Made with the first haze and thinned in place as
 * it rains out (`setHaze`), so nothing is rebuilt.
 */

/** Its shape, in planet radii: a stratospheric layer, stylised as the atmospheres are (gen/atmosphere.ts). */
const HAZE_SHAPE = { scaleHeight: 0.04, top: 1.16 };

export const hazeParams = {
  color: '#ebe6dc',
  dusk: '#ff3d1a',
  /** Below this optical depth it isn't drawn. */
  minDepth: 0.003,
};

/** A haze shell round a body of `radius` (local units), thin until `setHaze` thickens it. */
export function createHaze(radius: number, sun: AtmosphereSun, segments: number, ground: GroundDepth | null = null): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const look: AtmosphereLook = { ...HAZE_SHAPE, depth: 0 };
  const mesh = createAtmosphere(radius, hazeParams.color, look, sun, segments, ground);
  mesh.name = 'Haze';
  mesh.material.uniforms.duskColor!.value.set(hazeParams.dusk);
  mesh.userData.radius = radius;
  mesh.visible = false;
  return mesh;
}

/** Thickens or thins `mesh` (from createHaze) to a haze of reflectance `aerosol`. */
export function setHaze(mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>, aerosol: number): void {
  const depth = hazeDepth(aerosol);
  mesh.visible = depth >= hazeParams.minDepth;
  mesh.material.uniforms.density!.value = groundDensity({ ...HAZE_SHAPE, depth }) / (mesh.userData.radius as number);
}
