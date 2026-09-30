import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlantKind, PlantSpecies } from '../gen/plants';

/*
 * How placeholder plants look: a few primitives per species (a cone, ball or
 * stacked cones on a cylinder for a tree, one or two icosahedra for a bush),
 * in two levels of detail, and the material that fades them in and out with a
 * screen-door dither. Not a plant generator: the plant designer comes later.
 */

/** Distances in multiples of a plant's height: fully drawn up to `near`, then fading to the cheap mesh, which fades out by `far`. */
export interface PlantRanges {
  readonly near: number;
  readonly far: number;
}

/** Bigger plants show further out, smaller ones sooner (in heights: a tree's 8 units reach further than a bush's 1). */
export const PLANT_RANGES: Readonly<Record<PlantKind, PlantRanges>> = {
  tree: { near: 22, far: 46 },
  largeBush: { near: 30, far: 60 },
  smallBush: { near: 36, far: 70 },
};

/** The fade starts this fraction of the way to a range's end. */
export const FADE_START = 0.8;

/** How far below the ground a plant's base reaches, as a share of its height: hides gaps where the drawn ground is coarser than the terrain. */
export const SINK = 0.12;

export type PlantDetail = 'full' | 'simple';

const color = new THREE.Color();

/** A part of a plant: geometry coloured `hex`, made non-indexed so parts merge. */
function part(geometry: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (g !== geometry) geometry.dispose();
  g.deleteAttribute('uv');
  color.set(hex);
  const colors = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** An ellipsoid (an icosahedron stretched to `rx`, `ry`, `rx`) centred at `y`. */
function ball(rx: number, ry: number, y: number, detail: number, hex: string, x = 0): THREE.BufferGeometry {
  return part(new THREE.IcosahedronGeometry(1, detail).scale(rx, ry, rx).translate(x, y, 0), hex);
}

/** A cone with its base at `y0`. */
function cone(radius: number, height: number, y0: number, segments: number, hex: string): THREE.BufferGeometry {
  return part(new THREE.ConeGeometry(radius, height, segments).translate(0, y0 + height / 2, 0), hex);
}

/**
 * The species' mesh in body-frame-up units (+Y up, base at the origin, reaching
 * `SINK` below it), vertex-coloured. `simple` is a few dozen triangles for the
 * middle distance.
 */
export function createPlantGeometry(s: PlantSpecies, detail: PlantDetail): THREE.BufferGeometry {
  const full = detail === 'full';
  const H = s.height;
  const trunkH = H * s.trunkShare;
  const crownH = H - trunkH;
  const R = s.crownRadius;
  const parts: THREE.BufferGeometry[] = [];
  if (s.kind === 'tree') {
    const w = Math.max(0.12, H * s.trunkWidth);
    const base = -SINK * H;
    const length = trunkH + crownH * 0.3 - base;
    parts.push(part(new THREE.CylinderGeometry(w * 0.6, w, length, full ? 8 : 3, 1, true).translate(0, base + length / 2, 0), s.trunkColor));
    if (s.crown === 'cone') {
      parts.push(cone(R, crownH, trunkH, full ? 9 : 4, s.leafColor));
    } else if (s.crown === 'tiers') {
      parts.push(cone(R, crownH * 0.6, trunkH, full ? 9 : 4, s.leafColor));
      parts.push(cone(R * 0.65, crownH * 0.6, trunkH + crownH * 0.4, full ? 9 : 4, s.leafColor));
    } else {
      parts.push(ball(R, crownH / 2, trunkH + crownH / 2, full ? 1 : 0, s.leafColor));
    }
  } else {
    // Bushes: a ball of leaves on the ground, a second one beside it for the 'tiers' shape.
    const y = crownH / 2 - SINK * H * 0.5;
    parts.push(ball(R, crownH / 2, y, full ? 1 : 0, s.leafColor));
    if (s.crown === 'tiers') parts.push(ball(R * 0.65, crownH * 0.35, crownH * 0.35, full ? 1 : 0, s.leafColor, R * 0.7));
  }
  const geometry = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  geometry.computeBoundingSphere();
  return geometry;
}

/** The uniforms of a plant material's fade, shared by the level's materials (see createPlantMaterial). */
export interface PlantFadeUniforms {
  uHeight: THREE.IUniform<number>;
  /** Multiplies the view distances (plantParams.range). */
  uRange: THREE.IUniform<number>;
  /** Start and end of each fade, in heights. */
  uNear: THREE.IUniform<THREE.Vector2>;
  uFar: THREE.IUniform<THREE.Vector2>;
}

export type PlantLevel = 'near' | 'mid';

/**
 * A lit, vertex-coloured, flat-shaded material whose instances fade by their
 * distance to the camera, worked out in the shader (so nothing is rebuilt as
 * the camera moves). Dithered, not blended: a pixel is drawn or discarded by a
 * screen-space pattern, so nothing needs sorting and the two levels
 * exchange pixels without a pop. The near level keeps pixels where the dither
 * is below its weight (1 up to the near fade, then falling to 0), the mid level the complement
 * of that, also under the far weight, which fades the plant out entirely.
 */
export function createPlantMaterial(
  level: PlantLevel,
  height: number,
  ranges: PlantRanges,
): { material: THREE.MeshStandardMaterial; uniforms: PlantFadeUniforms } {
  const uniforms: PlantFadeUniforms = {
    uHeight: { value: height },
    uRange: { value: 1 },
    uNear: { value: new THREE.Vector2(ranges.near * FADE_START, ranges.near) },
    uFar: { value: new THREE.Vector2(ranges.far * FADE_START, ranges.far) },
  };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  if (level === 'near') material.defines = { PLANT_NEAR: '' };
  material.customProgramCacheKey = () => `plant-${level}`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
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
      .replace('#include <common>', '#include <common>\nvarying float vPlantDistance;\nuniform vec2 uNear;\nuniform vec2 uFar;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float wNear = 1.0 - smoothstep(uNear.x, uNear.y, vPlantDistance);
          #ifdef PLANT_NEAR
          if (dither >= wNear) discard;
          #else
          float wFar = 1.0 - smoothstep(uFar.x, uFar.y, vPlantDistance);
          if (dither < wNear || dither >= wFar) discard;
          #endif
        }`,
      );
  };
  return { material, uniforms };
}
