import * as THREE from 'three';
import type { PlantKind, PlantSpecies } from '../gen/plants';
import { growPlant, type PlantSkeleton } from '../gen/plantForm';
import { groundDepthPass } from '../world/groundDepth';
import { PLANT_LOD_COUNT, buildPlantMesh, type PlantMeshData } from './plantMesh';

/*
 * How plants look: each species' generated mesh (gen/plantForm.ts grows the
 * skeleton, surface/plantMesh.ts builds it) at its levels of detail, and the
 * material that crossfades between the levels with a screen-door dither.
 */

export { SINK } from '../gen/plantForm';

/**
 * Where each level of detail ends, in multiples of the plant's height: level
 * 0 (the full plant) up to the first, and so on; past the last nothing is
 * drawn. Bigger plants show further out, smaller ones sooner (in heights: a
 * tree's 8 units reach further than a bush's 1). The switches are where what a
 * level leaves out gets too small to see: at the first, a single leaf mass
 * (about a tenth of the plant's height) is ~8 px across on a 720 px tall
 * view (65° field of view); at the second, a branch's merged leaves are ~5 px.
 * See docs/research/plant-forms.md.
 */
export const PLANT_LODS: Readonly<Record<PlantKind, readonly number[]>> = {
  tree: [8, 18, 30, 46],
  largeBush: [10, 24, 38, 60],
  smallBush: [12, 30, 46, 70],
};

/** The fade starts this fraction of the way to a range's end. */
export const FADE_START = 0.8;

/** A species' skeleton (grown once per species object). */
const skeletons = new WeakMap<PlantSpecies, PlantSkeleton>();

export function plantSkeleton(s: PlantSpecies): PlantSkeleton {
  let k = skeletons.get(s);
  if (!k) {
    k = growPlant(s);
    skeletons.set(s, k);
  }
  return k;
}

/** Drops a species' cached skeleton (after editing it in place, as the plant lab does). */
export function forgetPlant(s: PlantSpecies): void {
  skeletons.delete(s);
}

/** The species' mesh data at level of detail `lod` (0 = full), as plain arrays. */
export function plantMeshData(s: PlantSpecies, lod: number): PlantMeshData {
  return buildPlantMesh(plantSkeleton(s), { bark: s.trunkColor, leaf: s.leafColor, leaf2: s.form.leafColor2, accent: s.form.accentColor }, lod);
}

/**
 * The species' mesh in body-frame-up units (+Y up, base at the origin, reaching
 * `SINK` below it), vertex-coloured, at level of detail `lod` (0 = full, up to
 * PLANT_LOD_COUNT − 1, a few dozen triangles).
 */
export function createPlantGeometry(s: PlantSpecies, lod: number): THREE.BufferGeometry {
  const data = plantMeshData(s, Math.min(PLANT_LOD_COUNT - 1, Math.max(0, lod)));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The uniforms of a plant material's fade, shared by the level's materials (see createPlantMaterial). */
export interface PlantFadeUniforms {
  uHeight: THREE.IUniform<number>;
  /** Multiplies the view distances (plantParams.range). */
  uRange: THREE.IUniform<number>;
  /** Start and end, in heights, of the fade at this level's near edge (the level before ends there) and at its far edge. */
  uLower: THREE.IUniform<THREE.Vector2>;
  uUpper: THREE.IUniform<THREE.Vector2>;
  /** Debug: blends the level towards a colour (by `uTintMix`, 0 for none), to see which level draws what. */
  uTint: THREE.IUniform<THREE.Color>;
  uTintMix: THREE.IUniform<number>;
}

/** How far a tinted level is blended towards its LOD colour. */
export const TINT_MIX = 0.7;

/** Sets a level's debug tint: its LOD colour, or none. */
export function setLodTint(u: Pick<PlantFadeUniforms, 'uTint' | 'uTintMix'>, lod: number, on: boolean): void {
  u.uTint.value.set(LOD_TINTS[Math.min(lod, LOD_TINTS.length - 1)]!);
  u.uTintMix.value = on ? TINT_MIX : 0;
}

/** A plant material without the fade (a level drawn as it is, as the plant lab's line-up does), with the same debug tint. */
export function createTintedPlantMaterial(lod: number): { material: THREE.MeshStandardMaterial; tint: Pick<PlantFadeUniforms, 'uTint' | 'uTintMix'> } {
  const tint = { uTint: { value: new THREE.Color() }, uTintMix: { value: 0 } };
  setLodTint(tint, lod, false);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  material.customProgramCacheKey = () => 'plant-tinted';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, tint);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform float uTintMix;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintMix);');
  };
  return { material, tint };
}

/** Tints that show the levels of detail apart (plantParams.showLods), from the full plant out. */
export const LOD_TINTS: readonly string[] = ['#ff5a5a', '#ffd34d', '#5ce07a', '#4da6ff'];

/** The fade window (start, end) at the far edge of level `lod` in `ranges`, in heights; before level 0, a window that is always passed. */
export function fadeWindow(ranges: readonly number[], lod: number): [number, number] {
  if (lod < 0) return [-2, -1];
  const end = ranges[Math.min(lod, ranges.length - 1)]!;
  return [end * FADE_START, end];
}

/** Which level of detail a plant is drawn at, and how far through the fade to the next (0 to 1); `lod` is the number of levels past the last. */
export interface LodPosition {
  lod: number;
  fade: number;
}

/** The level of detail at `distance` (in the plant's heights) with ranges `ranges`, as the material draws it. Writes and returns `out`. */
export function lodAt(ranges: readonly number[], distance: number, out: LodPosition): LodPosition {
  for (let lod = 0; lod < ranges.length; lod++) {
    const [start, end] = fadeWindow(ranges, lod);
    if (distance < end) {
      out.lod = lod;
      out.fade = Math.max(0, (distance - start) / (end - start));
      return out;
    }
  }
  out.lod = ranges.length;
  out.fade = 0;
  return out;
}

/**
 * A lit, vertex-coloured, flat-shaded material whose instances fade by their
 * distance to the camera, worked out in the shader (so nothing is rebuilt as
 * the camera moves). Dithered, not blended: a pixel is drawn or discarded by a
 * screen-space pattern, so nothing needs sorting and neighbouring levels
 * exchange pixels without a pop. With w(d) = 1 − smoothstep over a level's far
 * fade, level k keeps the pixels whose dither is in [w_(k−1), w_k): level 0
 * those below its weight (1 up to its fade, then falling to 0), each next
 * level the band the one before gave up, and past the last level's fade
 * nothing. The meshes are also drawn into the atmosphere's ground-depth texture
 * (GROUND_DETAIL_LAYER, see SurfaceEntities), so the haze stops at a tree
 * and doesn't wash it over with the haze of the ground behind it.
 */
export function createPlantMaterial(lod: number, height: number, ranges: readonly number[]): { material: THREE.MeshStandardMaterial; uniforms: PlantFadeUniforms } {
  const uniforms: PlantFadeUniforms = {
    uHeight: { value: height },
    uRange: { value: 1 },
    uLower: { value: new THREE.Vector2(...fadeWindow(ranges, lod - 1)) },
    uUpper: { value: new THREE.Vector2(...fadeWindow(ranges, lod)) },
    uTint: { value: new THREE.Color() },
    uTintMix: { value: 0 },
  };
  setLodTint(uniforms, lod, false);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  material.customProgramCacheKey = () => 'plant-lod';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uDepthPass = groundDepthPass;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vPlantDistance;\nuniform float uHeight;\nuniform float uRange;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // Distance to the camera in this plant's heights (an instance's up axis is scaled by the plant's size).
          vec3 plantCentre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float plantSize = length(instanceMatrix[1].xyz);
          vPlantDistance = distance(cameraPosition, plantCentre) / (uHeight * plantSize * uRange);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vPlantDistance;\nuniform vec2 uLower;\nuniform vec2 uUpper;\nuniform vec3 uTint;\nuniform float uTintMix;\nuniform bool uDepthPass;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float wLower = 1.0 - smoothstep(uLower.x, uLower.y, vPlantDistance);
          float wUpper = 1.0 - smoothstep(uUpper.x, uUpper.y, vPlantDistance);
          if (dither < wLower || dither >= wUpper) discard;
          // The atmosphere's ground-depth pass only needs what is left after the discard.
          if (uDepthPass) {
            gl_FragColor = vec4(0.0);
            return;
          }
        }`,
      )
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintMix);');
  };
  return { material, uniforms };
}
