import * as THREE from 'three';

/*
 * Plants shaking as the ship goes through them. Each shake is a slot: the
 * plant's unit direction (which is where its instance stands, so the shader
 * finds its plant by its own instance matrix and nothing is rewritten in the
 * batches), when it started, which way it was pushed and how hard. The plant
 * material (plantLook.ts) bends every plant that has a slot: a swing along the
 * push that dies away, and a faster flutter across it, more towards the top.
 * A plant touched again while it still swings gets another slot, and the
 * swings add up, so nothing jumps.
 */

/** Shakes going at once, at most (the shader's loop). */
export const SHAKE_SLOTS = 24;

/** Tunables (debug folder `Plant shake`). Strengths are the swing at the top of the plant, in its heights. */
export const plantShakeParams = {
  /** The swing when the ship hangs still in a plant... */
  strength: 0.1,
  /** ...plus this much per unit of the ship's speed... */
  perSpeed: 0.005,
  /** ...up to this. */
  maxStrength: 0.3,
  /** Seconds for a swing to die to 1/e. */
  decay: 0.5,
  /** The swing's and the flutter's angular frequency (rad/s). */
  swayRate: 9,
  flutterRate: 23,
  /** The flutter's size, as a share of the swing. */
  flutter: 0.3,
  /** A plant still swinging from a touch this recent isn't given another. */
  retrigger: 0.35,
};

/** A shake has died away after this many decay times (e⁻⁶ ≈ 0.25%). */
const LIFE_DECAYS = 6;

/**
 * The uniforms every plant material reads (shared, like the ground-depth pass
 * switch: whichever plants are drawn, those standing where a slot says shake).
 * `uShakeAt[i]` = (unit direction, start time), `uShakePush[i]` = (unit push,
 * strength); `uShakeZone` = (unit direction, cosine) bounds them all, so a
 * plant outside it skips the loop.
 */
export const plantShakeUniforms = {
  uShakeTime: { value: 0 },
  uShakeCount: { value: 0 },
  uShakeZone: { value: new THREE.Vector4(0, 1, 0, 2) },
  uShakeAt: { value: Array.from({ length: SHAKE_SLOTS }, () => new THREE.Vector4()) },
  uShakePush: { value: Array.from({ length: SHAKE_SLOTS }, () => new THREE.Vector4()) },
  /** Swing rate, flutter rate, 1 / decay, flutter share. */
  uShakeRates: { value: new THREE.Vector4() },
};

/** The plant shader's shake (after `#include <begin_vertex>`; `uHeight` is the species' height, +Y the plant's up). */
export const SHAKE_VERTEX_PARS = `
uniform float uShakeTime;
uniform int uShakeCount;
uniform vec4 uShakeZone;
uniform vec4 uShakeAt[${SHAKE_SLOTS}];
uniform vec4 uShakePush[${SHAKE_SLOTS}];
uniform vec4 uShakeRates;`;

export const SHAKE_VERTEX = `
if (uShakeCount > 0) {
  // Where this plant stands: its instance's translation, which lies along its unit direction.
  vec3 shakeBase = normalize(instanceMatrix[3].xyz);
  if (dot(shakeBase, uShakeZone.xyz) >= uShakeZone.w) {
    float shakeH = clamp(transformed.y / uHeight, 0.0, 1.5);
    vec3 shakeOffset = vec3(0.0);
    float flutterPhase = dot(transformed, vec3(1.7, 2.3, 1.1)) * 6.0 / uHeight;
    for (int i = 0; i < ${SHAKE_SLOTS}; i++) {
      if (i >= uShakeCount) break;
      vec3 d = shakeBase - uShakeAt[i].xyz;
      if (dot(d, d) > 4e-10) continue;
      float age = max(uShakeTime - uShakeAt[i].w, 0.0);
      // The push in the plant's own frame, along its ground.
      vec3 push = transpose(mat3(instanceMatrix)) * uShakePush[i].xyz;
      push.y = 0.0;
      push /= max(length(push), 1e-6);
      vec3 across = vec3(-push.z, 0.0, push.x);
      float swing = uShakePush[i].w * exp(-age * uShakeRates.z);
      shakeOffset += swing * (push * sin(age * uShakeRates.x) + across * uShakeRates.w * sin(age * uShakeRates.y + flutterPhase));
    }
    // Rooted: nothing at the ground, most at the top.
    transformed += shakeOffset * (shakeH * shakeH * uHeight);
  }
}`;

/**
 * The shakes going on, written into `plantShakeUniforms`. `shake` starts one,
 * `update` moves the clock on and lets the old ones go; `clear` stops them all.
 * One at a time is the planet level's (`PlantBrush`).
 */
export class PlantShaker {
  private time = 0;
  private count = 0;
  private readonly zone = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor(private readonly u = plantShakeUniforms) {
    this.clear();
  }

  /** Shakes going now. */
  get active(): number {
    return this.count;
  }

  /**
   * Shakes the plant standing at unit direction (`x`, `y`, `z`), pushed along
   * `push` (tangent there; any length) with `strength` (its top swings this
   * many of its heights). Not again while a shake of it this recent goes on.
   * With every slot taken, the one that has died down most makes way.
   */
  shake(x: number, y: number, z: number, push: THREE.Vector3, strength: number): void {
    const at = this.u.uShakeAt.value;
    const pushes = this.u.uShakePush.value;
    let slot = -1;
    let weakest = Infinity;
    for (let i = 0; i < this.count; i++) {
      const a = at[i]!;
      const age = this.time - a.w;
      const dx = a.x - x;
      const dy = a.y - y;
      const dz = a.z - z;
      if (dx * dx + dy * dy + dz * dz < 1e-12 && age < plantShakeParams.retrigger) return;
      const left = pushes[i]!.w * Math.exp(-age / plantShakeParams.decay);
      if (left < weakest) {
        weakest = left;
        slot = i;
      }
    }
    if (this.count < SHAKE_SLOTS) slot = this.count++;
    const length = push.length();
    at[slot]!.set(x, y, z, this.time);
    if (length > 1e-9) pushes[slot]!.set(push.x / length, push.y / length, push.z / length, strength);
    else pushes[slot]!.set(0, 0, 0, 0);
    this.fitZone();
  }

  /** Moves the clock on by `dt` seconds and lets the shakes that have died away go. */
  update(dt: number): void {
    this.time += dt;
    const life = plantShakeParams.decay * LIFE_DECAYS;
    const at = this.u.uShakeAt.value;
    const pushes = this.u.uShakePush.value;
    const before = this.count;
    for (let i = 0; i < this.count; ) {
      if (this.time - at[i]!.w <= life) {
        i++;
        continue;
      }
      // The last one takes its place.
      const last = --this.count;
      at[i]!.copy(at[last]!);
      pushes[i]!.copy(pushes[last]!);
    }
    if (this.count !== before) this.fitZone();
    const p = plantShakeParams;
    this.u.uShakeTime.value = this.time;
    this.u.uShakeCount.value = this.count;
    this.u.uShakeRates.value.set(p.swayRate, p.flutterRate, 1 / p.decay, p.flutter);
  }

  /** Stops every shake (plants stand still). */
  clear(): void {
    this.count = 0;
    this.u.uShakeCount.value = 0;
    this.u.uShakeZone.value.set(0, 1, 0, 2);
  }

  /** The cone round the slots' directions, a little wider, so plants outside it skip the shader's loop. */
  private fitZone(): void {
    this.u.uShakeCount.value = this.count;
    const at = this.u.uShakeAt.value;
    const zone = this.zone.set(0, 0, 0);
    for (let i = 0; i < this.count; i++) zone.add(this.dir.set(at[i]!.x, at[i]!.y, at[i]!.z));
    if (this.count === 0 || zone.lengthSq() < 1e-12) {
      this.u.uShakeZone.value.set(0, 1, 0, this.count === 0 ? 2 : -2);
      return;
    }
    zone.normalize();
    let cos = 1;
    for (let i = 0; i < this.count; i++) cos = Math.min(cos, zone.x * at[i]!.x + zone.y * at[i]!.y + zone.z * at[i]!.z);
    this.u.uShakeZone.value.set(zone.x, zone.y, zone.z, cos - 1e-6);
  }
}
