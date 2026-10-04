import * as THREE from 'three';
import { growAnimal, type AnimalSkeleton } from '../gen/animalForm';
import { animalGait, type AnimalSpecies } from '../gen/animals';
import { groundDepthPass } from '../world/groundDepth';
import { ANIMAL_LOD_COUNT, buildAnimalMesh, type AnimalMeshData } from './animalMesh';
import { FADE_START, LOD_TINTS, TINT_MIX, fadeWindow } from './plantLook';

/*
 * How animals look and move: each species' generated mesh (gen/animalForm.ts
 * grows the skeleton, surface/animalMesh.ts builds it) at its levels of
 * detail, and the material that walks it. The walk is all in the vertex
 * shader, from four numbers per animal (where it is in its stride, how long
 * a stride it takes, walking or trotting, grazing) and its idle clock: legs
 * swing about their hips in their gait's phases and lift as they come
 * forward, the body bobs twice a stride, the tail sways and the head bends
 * down to graze. Levels of detail crossfade with the plants' screen-door
 * dither (plantLook.ts), by the distance in the animal's own lengths.
 */

/**
 * Where each level of detail ends, in multiples of the animal's length:
 * past the last nothing is drawn. At 15 lengths an animal is about 38 px
 * long on a 720 px tall view (65° field of view), where the full level's
 * eyes and ears (a tenth of it) shrink to a few pixels; at 110 it is 5 px.
 */
export const ANIMAL_LODS: readonly number[] = [15, 40, 110];

/** A species' skeleton (grown once per species object). */
const skeletons = new WeakMap<AnimalSpecies, AnimalSkeleton>();

export function animalSkeleton(s: AnimalSpecies): AnimalSkeleton {
  let k = skeletons.get(s);
  if (!k) {
    k = growAnimal(s);
    skeletons.set(s, k);
  }
  return k;
}

/** Drops a species' cached skeleton (after editing it in place, as the animal lab does). */
export function forgetAnimal(s: AnimalSpecies): void {
  skeletons.delete(s);
}

export function animalMeshData(s: AnimalSpecies, lod: number): AnimalMeshData {
  return buildAnimalMesh(animalSkeleton(s), s.form, s.length, Math.min(ANIMAL_LOD_COUNT - 1, Math.max(0, lod)));
}

/** The species' mesh (+Z forward, +Y up, standing on y = 0) with its rig attributes, at level of detail `lod`. */
export function createAnimalGeometry(s: AnimalSpecies, lod: number): THREE.BufferGeometry {
  const data = animalMeshData(s, lod);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  geometry.setAttribute('aRig', new THREE.BufferAttribute(data.rig, 4));
  geometry.setAttribute('aPivot', new THREE.BufferAttribute(data.pivots, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

/** How a species' body moves (the shader's uniforms), from its skeleton and gait. */
export interface AnimalMotion {
  /** Leg swing either side of straight down at full stride, radians, walking and trotting. */
  readonly swing: number;
  readonly swingTrot: number;
  /** How high a foot lifts coming forward, and how far the body bobs, at full stride (units). */
  readonly lift: number;
  readonly bob: number;
  /** How far the head and neck bend down to bring the mouth to the ground, radians. */
  readonly graze: number;
}

/**
 * A species' motion on a world of gravity `gravity`. The legs swing so a
 * foot sweeps back by the share of a stride it spends on the ground (half,
 * for a sinusoidal swing): 2·A·r = λ/2 for a leg reaching r from its joint
 * (the hip's height, or a sprawling leg's reach to the side), so the feet
 * keep pace with the ground on average. Stylised: real feet stand still
 * through the stance.
 */
export function animalMotion(s: AnimalSpecies, gravity = 1): AnimalMotion {
  const k = animalSkeleton(s);
  const gait = animalGait(k, gravity);
  const walking = k.legs.filter((l) => !l.arm);
  const sprawl = walking.length > 0 && walking[0]!.swing === 'sprawl';
  const reach = sprawl
    ? walking.reduce((m, l) => m + Math.abs(l.points[l.points.length - 1]![0] - l.points[0]![0]), 0) / walking.length
    : k.hipHeight;
  const amplitude = (stride: number) => Math.min(0.7, Math.asin(Math.min(0.95, stride / (4 * Math.max(1e-3, reach)))));
  return {
    swing: amplitude(gait.walkStride),
    swingTrot: amplitude(gait.trotStride),
    lift: k.hipHeight * 0.14,
    bob: k.hipHeight * 0.025,
    graze: grazeAngle(k, s.length),
  };
}

/** The bend about the neck's root that brings the snout down to just above the ground (at most 110°). */
export function grazeAngle(k: AnimalSkeleton, length: number): number {
  const tip = k.spine[k.spine.length - 1]!;
  const y = tip.p[1] - tip.ry - k.neckBase[1];
  const z = tip.p[2] - k.neckBase[2];
  const target = length * 0.04 - k.neckBase[1];
  for (let a = 0; a <= 110; a += 2) {
    const r = (a * Math.PI) / 180;
    if (Math.cos(r) * y - Math.sin(r) * z <= target) return r;
  }
  return (110 * Math.PI) / 180;
}

/** The uniforms of an animal material, shared by its levels' materials where they agree. */
export interface AnimalUniforms {
  uLength: THREE.IUniform<number>;
  uRange: THREE.IUniform<number>;
  uLower: THREE.IUniform<THREE.Vector2>;
  uUpper: THREE.IUniform<THREE.Vector2>;
  uSwing: THREE.IUniform<THREE.Vector2>;
  uLift: THREE.IUniform<number>;
  uBob: THREE.IUniform<number>;
  uGraze: THREE.IUniform<number>;
  uTint: THREE.IUniform<THREE.Color>;
  uTintMix: THREE.IUniform<number>;
}

export function setAnimalTint(u: Pick<AnimalUniforms, 'uTint' | 'uTintMix'>, lod: number, on: boolean): void {
  u.uTint.value.set(LOD_TINTS[Math.min(lod, LOD_TINTS.length - 1)]!);
  u.uTintMix.value = on ? TINT_MIX : 0;
}

/** Per-instance animation attributes a mesh drawn with an animal material needs (see `createAnimalMaterial`). */
export function addAnimationAttributes(mesh: THREE.InstancedMesh, capacity: number): { anim: THREE.InstancedBufferAttribute; idle: THREE.InstancedBufferAttribute } {
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
  const idle = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  anim.setUsage(THREE.DynamicDrawUsage);
  idle.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aAnim', anim);
  mesh.geometry.setAttribute('aIdle', idle);
  return { anim, idle };
}

const RIG_GLSL = /* glsl */ `
attribute vec4 aRig;
attribute vec3 aPivot;
attribute vec4 aAnim;
attribute float aIdle;
uniform vec2 uSwing;
uniform float uLift;
uniform float uBob;
uniform float uGraze;
uniform float uLength;
uniform float uRange;
varying float vAnimalDistance;
vec3 animalRotX(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(d.x, c * d.y - s * d.z, s * d.y + c * d.z); }
vec3 animalRotY(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z); }
`;

const POSE_GLSL = /* glsl */ `
{
  float part = aRig.x;
  float w = aRig.w;
  float cycle = 6.2831853 * aAnim.x;
  float stride = aAnim.y;
  float trot = aAnim.z;
  float graze = aAnim.w;
  float bob = uBob * stride * cos(2.0 * cycle);
  vec3 d = transformed - aPivot;
  if (part > 0.5 && part < 2.5) {
    // A leg: swinging about its hip in its phase, the foot lifting as it comes forward.
    float ph = cycle + 6.2831853 * mix(aRig.y, aRig.z, trot);
    float swing = mix(uSwing.x, uSwing.y, trot) * stride * sin(ph);
    d = part < 1.5 ? animalRotX(d, swing) : animalRotY(d, swing * sign(aPivot.x));
    d.y += uLift * stride * max(0.0, -cos(ph)) * w;
    transformed = aPivot + d;
    // The hip bobs with the body; the foot stays down.
    transformed.y += bob * (1.0 - w);
  } else if (part > 2.5 && part < 3.5) {
    // The tail sways with the stride and idly.
    float sway = (0.22 * stride * sin(cycle) + 0.14 * sin(aIdle * 1.3) + 0.06 * sin(aIdle * 3.1)) * w;
    transformed = aPivot + animalRotY(d, sway);
    transformed.y += bob;
  } else if (part > 3.5) {
    // The neck and head: bent down to graze, nodding as it walks.
    float bend = uGraze * graze + 0.07 * stride * sin(2.0 * cycle) + 0.03 * sin(aIdle * 0.9) * (1.0 - graze);
    transformed = aPivot + animalRotX(d, bend * w);
    transformed.y += bob;
  } else {
    transformed.y += bob;
  }
  // Distance to the camera in this animal's lengths (an instance's up axis is scaled by its size).
  vec3 animalCentre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float animalSize = length(instanceMatrix[1].xyz);
  vAnimalDistance = distance(cameraPosition, animalCentre) / (uLength * animalSize * uRange);
}
`;

/**
 * A lit, vertex-coloured, flat-shaded material that poses each instance from
 * its animation attributes (see the shader above) and fades it in and out
 * by its distance like the plants (a dither, nothing sorted). With `fade`
 * off (the lab's fixed levels) every distance draws. Flat shading takes its
 * normals from the posed triangles, so a swinging leg is lit as it stands.
 */
export function createAnimalMaterial(lod: number, s: AnimalSpecies, motion: AnimalMotion, fade = true): { material: THREE.MeshStandardMaterial; uniforms: AnimalUniforms } {
  const uniforms: AnimalUniforms = {
    uLength: { value: s.length },
    uRange: { value: 1 },
    uLower: { value: new THREE.Vector2(...(fade ? fadeWindow(ANIMAL_LODS, lod - 1) : [-2, -1])) },
    uUpper: { value: new THREE.Vector2(...(fade ? fadeWindow(ANIMAL_LODS, lod) : [1e9, 2e9])) },
    uSwing: { value: new THREE.Vector2(motion.swing, motion.swingTrot) },
    uLift: { value: motion.lift },
    uBob: { value: motion.bob },
    uGraze: { value: motion.graze },
    uTint: { value: new THREE.Color() },
    uTintMix: { value: 0 },
  };
  setAnimalTint(uniforms, lod, false);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  material.customProgramCacheKey = () => 'animal';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uDepthPass = groundDepthPass;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${RIG_GLSL}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${POSE_GLSL}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vAnimalDistance;\nuniform vec2 uLower;\nuniform vec2 uUpper;\nuniform vec3 uTint;\nuniform float uTintMix;\nuniform bool uDepthPass;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        {
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          float wLower = 1.0 - smoothstep(uLower.x, uLower.y, vAnimalDistance);
          float wUpper = 1.0 - smoothstep(uUpper.x, uUpper.y, vAnimalDistance);
          if (dither < wLower || dither >= wUpper) discard;
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

export { FADE_START };
