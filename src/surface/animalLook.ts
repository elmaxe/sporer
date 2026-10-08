import * as THREE from 'three';
import { COAT_PATTERNS, type AnimalSkeleton, type Vec3 } from '../gen/animalForm';
import { animalGait, type AnimalSpecies } from '../gen/animals';
import { growCreature, speciesDesign, type CreatureDesign, type GrownCreature } from '../gen/creature';
import { MAX_RIG_LIMBS, creatureRig, rigVertices, type CreatureRig } from '../gen/creatureRig';
import { DUTY_FACTOR } from '../gen/creatureMotion';
import { groundDepthPass } from '../world/groundDepth';
import { ANIMAL_LOD_COUNT, buildAnimalMesh, linearRgb, type AnimalMeshData } from './animalMesh';
import { FADE_START, LOD_TINTS, TINT_MIX, fadeWindow } from './plantLook';

/*
 * How animals look and move: each species is a creature from the creature
 * editor (gen/creature.ts, made from its form), grown at rest and skinned
 * by surface/animalMesh.ts at its levels of detail, and the material that
 * walks it. The walk is the editor's (gen/creatureMotion.ts), played in the
 * vertex shader from four numbers per animal (strides walked, how far it is
 * moving, walking or trotting, grazing) and its idle clock, with the rig
 * gen/creatureRig.ts tags the mesh with: each foot steps along its path in
 * its leg's phase, the knee is found by two-bone IK from the hip and each
 * bone's vertices follow it, the spine sways in its travelling wave and the
 * body bobs twice a stride, and the head and neck bend down to graze.
 * Levels of detail crossfade with the plants' screen-door dither
 * (plantLook.ts), by the distance in the animal's own lengths.
 */

/**
 * Where each level of detail ends, in multiples of the animal's length:
 * past the last nothing is drawn. At 15 lengths an animal is about 38 px
 * long on a 720 px tall view (65° field of view), where the full level's
 * eyes and ears (a tenth of it) shrink to a few pixels; at 110 it is 5 px.
 */
export const ANIMAL_LODS: readonly number[] = [15, 40, 110];

/** A species as a creature-editor creature: its design, grown at rest, and the rig its walk is played from. */
export interface SpeciesCreature {
  readonly design: CreatureDesign;
  readonly grown: GrownCreature;
  readonly rig: CreatureRig;
}

/** Each species' creature (grown once per species object). */
const creatures = new WeakMap<AnimalSpecies, SpeciesCreature>();

/**
 * A species' body: one of the creature editor's random creatures
 * (gen/creature.ts `speciesDesign`: from the species' seed, with its body
 * plan, coat and size), so the game's animals are the editor's creatures,
 * built and walking exactly as they do there.
 */
export function speciesCreature(s: AnimalSpecies): SpeciesCreature {
  let c = creatures.get(s);
  if (!c) {
    const design = speciesDesign(s.form, s.length, s.name);
    const grown = growCreature(design);
    c = { design, grown, rig: creatureRig(grown) };
    creatures.set(s, c);
  }
  return c;
}

/** A species' skeleton, at rest. */
export function animalSkeleton(s: AnimalSpecies): AnimalSkeleton {
  return speciesCreature(s).grown.skeleton;
}

/** Drops a species' cached body (after editing it in place, as the animal lab does). */
export function forgetAnimal(s: AnimalSpecies): void {
  creatures.delete(s);
}

export function animalMeshData(s: AnimalSpecies, lod: number): AnimalMeshData {
  return buildAnimalMesh(animalSkeleton(s), s.form, s.length, Math.min(ANIMAL_LOD_COUNT - 1, Math.max(0, lod)));
}

/** The species' mesh (+Z forward, +Y up, standing on y = 0) with its rig attribute (gen/creatureRig.ts), at level of detail `lod`. */
export function createAnimalGeometry(s: AnimalSpecies, lod: number): THREE.BufferGeometry {
  const data = animalMeshData(s, lod);
  const { grown, rig } = speciesCreature(s);
  // The builder's rig says which vertices are a limb's (its parts 1 and 2), and whose (the limb's hip).
  const limbHip = (i: number): Vec3 | null => {
    const part = data.rig[i * 4]!;
    return part > 0.5 && part < 2.5 ? [data.pivots[i * 3]!, data.pivots[i * 3 + 1]!, data.pivots[i * 3 + 2]!] : null;
  };
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  geometry.setAttribute('aCoat', new THREE.BufferAttribute(data.coat, 1));
  geometry.setAttribute('aRig', new THREE.BufferAttribute(rigVertices(rig, grown.rest, data.positions, limbHip), 4));
  geometry.computeBoundingSphere();
  return geometry;
}

/** How a species' body moves (the shader's uniforms): its rig and its strides. */
export interface AnimalMotion {
  /** The limbs, spine and neck to move (none: the mesh stays as built, as the editor's posed creature does). */
  readonly rig: CreatureRig | null;
  /** One full cycle of every leg, walking and trotting (units). */
  readonly walkStride: number;
  readonly trotStride: number;
}

/** A body that keeps still. */
export const STILL_MOTION: AnimalMotion = { rig: null, walkStride: 0, trotStride: 0 };

/** A species' motion on a world of gravity `gravity`: its gait's strides (gen/animals.ts), as the herds walk them. */
export function animalMotion(s: AnimalSpecies, gravity = 1): AnimalMotion {
  const { rig } = speciesCreature(s);
  const gait = animalGait(rig, gravity);
  return { rig, walkStride: gait.walkStride, trotStride: gait.trotStride };
}

/**
 * The stride clock an animation attribute carries: strides walked, over
 * two strides (the spine's sway takes two strides to come round).
 */
export function animCycle(cycle: number): number {
  return cycle - 2 * Math.floor(cycle / 2);
}

/** The uniforms of an animal material, shared by its levels' materials where they agree. */
export interface AnimalUniforms {
  uLength: THREE.IUniform<number>;
  uRange: THREE.IUniform<number>;
  uLower: THREE.IUniform<THREE.Vector2>;
  uUpper: THREE.IUniform<THREE.Vector2>;
  /** The rig (gen/creatureRig.ts): RIG_VEC4S per limb, the gait (walk stride, trot stride, hip height, length), walking legs, the neck (pivot, bend). */
  uLimbs: THREE.IUniform<THREE.Vector4[]>;
  uGait: THREE.IUniform<THREE.Vector4>;
  uLegs: THREE.IUniform<number>;
  uNeck: THREE.IUniform<THREE.Vector4>;
  uNeckSpan: THREE.IUniform<THREE.Vector2>;
  uTint: THREE.IUniform<THREE.Color>;
  uTintMix: THREE.IUniform<number>;
  /** The coat's pattern (index in COAT_PATTERNS), per unit, colour and seed. */
  uPattern: THREE.IUniform<number>;
  uPatternK: THREE.IUniform<number>;
  uPatternColor: THREE.IUniform<THREE.Color>;
  uSeed: THREE.IUniform<number>;
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

/** vec4s per limb in the shader's `uLimbs`. */
const RIG_VEC4S = 5;

const RIG_GLSL = /* glsl */ `
attribute vec4 aRig;
attribute vec4 aAnim;
attribute float aIdle;
uniform vec4 uLimbs[${MAX_RIG_LIMBS * RIG_VEC4S}];
uniform vec4 uGait;
uniform float uLegs;
uniform vec4 uNeck;
uniform vec2 uNeckSpan;
uniform float uLength;
uniform float uRange;
varying float vAnimalDistance;
attribute float aCoat;
varying vec3 vAnimalRest;
varying vec3 vAnimalRestNormal;
varying float vAnimalCoat;
vec3 animalRotX(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(d.x, c * d.y - s * d.z, s * d.y + c * d.z); }
// creatureMotion.ts spineSway: the spine's travelling sway at s, and the tail's idle one.
float creatureSway(float s, float cycle, float moving, float time) {
  bool legless = uLegs < 0.5;
  float amplitude = uGait.w * (legless ? 0.075 : 0.012 + 0.004 * min(uLegs, 8.0));
  float waves = legless ? 1.3 : 0.6;
  float steady = 1.0 - 0.75 * smoothstep(0.7, 1.0, s);
  float walk = amplitude * moving * sin(6.2831853 * (waves * s - (legless ? 1.0 : 0.5) * cycle)) * steady;
  float tail = (1.0 - s) * (1.0 - s);
  float idle = uGait.w * 0.02 * tail * (sin(time * 1.3) * 0.7 + sin(time * 3.1) * 0.3) * (1.0 - moving * 0.6);
  return walk + idle;
}
// creatureMotion.ts footPath: [forward, up] against the foot's standing place.
vec2 creatureFoot(float phase, float duty, float step, float lift) {
  float c = fract(phase);
  if (c < duty) return vec2(step * (0.5 - c / duty), 0.0);
  float u = (c - duty) / (1.0 - duty);
  float e = u * u * (3.0 - 2.0 * u);
  return vec2(step * (-0.5 + e), lift * sin(3.14159265 * u));
}
// creatureMotion.ts solveTwoBone: the knee (returned) and the foot (end) reaching for target, bending towards pole.
vec3 creatureIK(vec3 hip, vec3 target, float upper, float lower, vec3 pole, out vec3 end) {
  vec3 d = target - hip;
  float len = length(d);
  vec3 dir = len > 1e-6 ? d / len : vec3(0.0, -1.0, 0.0);
  float dist = clamp(len, abs(upper - lower) + 1e-4, upper + lower - 1e-4);
  float along = (upper * upper - lower * lower + dist * dist) / (2.0 * dist);
  float off = sqrt(max(0.0, upper * upper - along * along));
  vec3 bend = pole - dir * dot(pole, dir);
  bend = length(bend) > 1e-5 ? normalize(bend) : vec3(0.0, 0.0, 1.0);
  end = hip + dir * dist;
  return hip + dir * along + bend * off;
}
// A bone's frame: along it, towards the pole, and across.
mat3 creatureBone(vec3 a, vec3 b, vec3 pole) {
  vec3 x = normalize(b - a);
  vec3 y = pole - x * dot(pole, x);
  y = length(y) > 1e-5 ? normalize(y) : normalize(abs(x.z) < 0.9 ? vec3(0.0, 0.0, 1.0) - x * x.z : vec3(0.0, 1.0, 0.0) - x * x.y);
  return mat3(x, y, cross(x, y));
}
`;

const POSE_GLSL = /* glsl */ `
vec3 animalPos = position;
{
  vAnimalRest = position;
  vAnimalRestNormal = normal;
  vAnimalCoat = aCoat;
  float cycle = aAnim.x;
  float moving = aAnim.y;
  float run = aAnim.z;
  float graze = aAnim.w;
  float bob = uLegs > 0.5 ? -uGait.z * 0.03 * moving * cos(12.5663706 * cycle) : 0.0;
  int limb = int(aRig.x + 0.5) - 1;
  if (limb >= 0) {
    // A leg or arm: its foot placed, its knee found by IK from the swayed hip, each bone's vertices carried along.
    int k = limb * ${RIG_VEC4S};
    vec4 l0 = uLimbs[k];
    vec4 l1 = uLimbs[k + 1];
    vec4 l2 = uLimbs[k + 2];
    vec4 l3 = uLimbs[k + 3];
    vec4 l4 = uLimbs[k + 4];
    vec3 hip = l0.xyz;
    vec3 joint = l1.xyz;
    vec3 foot = l2.xyz;
    vec3 pole = l3.xyz;
    float right = l3.w;
    vec3 shift = vec3(creatureSway(l4.x, cycle, moving, aIdle), bob, 0.0);
    vec3 target;
    if (l4.w < 0.5) {
      float n = max(1.0, l4.z);
      float spacing = 1.0 / (2.0 * n) + (0.5 - 1.0 / (2.0 * n)) * run;
      float duty = mix(${DUTY_FACTOR.walk.toFixed(3)}, ${DUTY_FACTOR.trot.toFixed(3)}, run);
      float stride = mix(uGait.x, uGait.y, run);
      vec2 f = creatureFoot(cycle + l4.y * spacing + right * 0.5, duty, stride * duty, l2.w);
      target = foot + vec3(0.0, f.y, f.x) * moving;
    } else {
      // Arms swing against the stride, and idly.
      float reach = l0.w + l1.w;
      float swing = sin(6.2831853 * (cycle + right * 0.5)) * moving * reach * 0.25 + sin(aIdle * 1.7 + right) * reach * 0.04;
      target = foot + shift + vec3(0.0, 0.0, swing);
    }
    vec3 hip1 = hip + shift;
    vec3 end;
    vec3 knee = creatureIK(hip1, target, l0.w, l1.w, pole, end);
    mat3 upperTurn = creatureBone(hip1, knee, pole) * transpose(creatureBone(hip, joint, pole));
    mat3 lowerTurn = creatureBone(knee, end, pole) * transpose(creatureBone(joint, foot, pole));
    animalPos = mix(hip1 + upperTurn * (position - hip), knee + lowerTurn * (position - joint), aRig.y);
    objectNormal = normalize(mix(upperTurn * objectNormal, lowerTurn * objectNormal, aRig.y));
    // An arm on the neck goes down with it to graze.
    float bend = l4.w > 0.5 ? uNeck.w * graze * smoothstep(uNeckSpan.x, uNeckSpan.y, l4.x) : 0.0;
    if (bend > 0.0) {
      animalPos = uNeck.xyz + shift + animalRotX(animalPos - uNeck.xyz - shift, bend);
      objectNormal = animalRotX(objectNormal, bend);
    }
  } else {
    // The body and everything on it: the head and neck bent down to graze, the spine swaying, bobbing.
    float bend = uNeck.w * graze * aRig.w;
    if (bend > 0.0) {
      animalPos = uNeck.xyz + animalRotX(animalPos - uNeck.xyz, bend);
      objectNormal = animalRotX(objectNormal, bend);
    }
    animalPos.x += creatureSway(aRig.z, cycle, moving, aIdle);
    animalPos.y += bob;
  }
  // Distance to the camera in this animal's lengths (an instance's up axis is scaled by its size).
  vec3 animalCentre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float animalSize = length(instanceMatrix[1].xyz);
  vAnimalDistance = distance(cameraPosition, animalCentre) / (uLength * animalSize * uRange);
}
`;

/**
 * The coat's pattern, per pixel from the rest-pose position (so it moves
 * with the body), where the mesh's `coat` is 1 and not on the belly:
 * soft-edged stripes across the body, round spots one to a cell of a 3D
 * grid, or patches where a smooth noise is high. `uPatternK` is the pattern
 * per unit (patternScale over the length).
 */
const PATTERN_GLSL = /* glsl */ `
float animalHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973) + uSeed);
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float animalNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(animalHash(i), animalHash(i + vec3(1, 0, 0)), f.x), mix(animalHash(i + vec3(0, 1, 0)), animalHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(animalHash(i + vec3(0, 0, 1)), animalHash(i + vec3(1, 0, 1)), f.x), mix(animalHash(i + vec3(0, 1, 1)), animalHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float animalPattern(vec3 p) {
  vec3 q = p * uPatternK;
  if (uPattern == 1) {
    float s = sin((q.z * 2.0 + 0.25 * sin(q.y * 6.0)) * 6.2831853);
    return smoothstep(0.2, 0.45, s);
  }
  if (uPattern == 2) {
    vec3 g = q * 3.0;
    vec3 c = floor(g);
    if (animalHash(c) > 0.6) return 0.0;
    vec3 o = 0.4 + 0.2 * vec3(animalHash(c + 11.0), animalHash(c + 23.0), animalHash(c + 37.0));
    return 1.0 - smoothstep(0.26, 0.33, length(fract(g) - o));
  }
  if (uPattern == 3) return smoothstep(0.5, 0.58, animalNoise(q * 1.5));
  return 0.0;
}
`;

/** The rig's limbs packed for `uLimbs`: hip and upper bone, joint and lower bone, foot and lift, pole and side, s, rank, ranks and arm. */
function rigUniform(rig: CreatureRig | null): THREE.Vector4[] {
  const out = Array.from({ length: MAX_RIG_LIMBS * RIG_VEC4S }, () => new THREE.Vector4());
  rig?.limbs.forEach((l, i) => {
    const k = i * RIG_VEC4S;
    out[k]!.set(...l.hip, l.upper);
    out[k + 1]!.set(...l.joint, l.lower);
    out[k + 2]!.set(...l.foot, l.lift);
    out[k + 3]!.set(...l.pole, l.right ? 1 : 0);
    out[k + 4]!.set(l.s, l.rank, l.ranks, l.arm ? 1 : 0);
  });
  return out;
}

/**
 * A lit, vertex-coloured, smooth-shaded material that poses each instance
 * from its animation attributes (see the shader above: positions and
 * normals turn together, so a swinging leg is lit as it stands), draws the
 * coat's pattern, and fades it in and out by its distance like the plants
 * (a dither, nothing sorted). With `fade` off (the lab's fixed levels)
 * every distance draws.
 */
export function createAnimalMaterial(lod: number, s: AnimalSpecies, motion: AnimalMotion, fade = true): { material: THREE.MeshStandardMaterial; uniforms: AnimalUniforms } {
  const uniforms: AnimalUniforms = {
    uLength: { value: s.length },
    uRange: { value: 1 },
    uLower: { value: new THREE.Vector2(...(fade ? fadeWindow(ANIMAL_LODS, lod - 1) : [-2, -1])) },
    uUpper: { value: new THREE.Vector2(...(fade ? fadeWindow(ANIMAL_LODS, lod) : [1e9, 2e9])) },
    uLimbs: { value: rigUniform(motion.rig) },
    uGait: { value: new THREE.Vector4(motion.walkStride, motion.trotStride, motion.rig?.hipHeight ?? 0, motion.rig?.length ?? 0) },
    uLegs: { value: motion.rig?.legs ?? 0 },
    uNeck: { value: motion.rig ? new THREE.Vector4(...motion.rig.neck.pivot, motion.rig.neck.graze) : new THREE.Vector4() },
    uNeckSpan: { value: new THREE.Vector2(motion.rig?.neck.from ?? 1, motion.rig?.neck.to ?? 2) },
    uTint: { value: new THREE.Color() },
    uTintMix: { value: 0 },
    uPattern: { value: COAT_PATTERNS.indexOf(s.form.pattern) },
    uPatternK: { value: s.form.patternScale / s.length },
    // In linear light, as the vertex colours are (animalMesh.ts linearRgb).
    uPatternColor: { value: new THREE.Color().setRGB(...linearRgb(s.form.patternColor), THREE.LinearSRGBColorSpace) },
    uSeed: { value: (s.form.seed % 997) / 997 },
  };
  setAnimalTint(uniforms, lod, false);
  // Soft fur, a little sheen.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
  material.customProgramCacheKey = () => 'animal';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uDepthPass = groundDepthPass;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${RIG_GLSL}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${POSE_GLSL}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = animalPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying float vAnimalDistance;\nvarying vec3 vAnimalRest;\nvarying vec3 vAnimalRestNormal;\nvarying float vAnimalCoat;\nuniform vec2 uLower;\nuniform vec2 uUpper;\nuniform vec3 uTint;\nuniform float uTintMix;\nuniform bool uDepthPass;\nuniform int uPattern;\nuniform float uPatternK;\nuniform vec3 uPatternColor;\nuniform float uSeed;\n${PATTERN_GLSL}`,
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
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // The pattern on the coat, fading out down the flanks before the belly.
          float mark = vAnimalCoat > 0.5 ? animalPattern(vAnimalRest) * smoothstep(-0.5, -0.15, normalize(vAnimalRestNormal).y) : 0.0;
          diffuseColor.rgb = mix(diffuseColor.rgb, uPatternColor, mark);
          diffuseColor.rgb = mix(diffuseColor.rgb, uTint, uTintMix);
        }`,
      );
  };
  return { material, uniforms };
}

export { FADE_START };
