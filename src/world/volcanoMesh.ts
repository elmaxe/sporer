import * as THREE from 'three';
import { eruptionStrength, lavaFront, volcanoParams, type VolcanoShape } from '../combat/volcano';
import { Rng } from '../gen/rng';

const ROCK = new THREE.Color('#3b322d');
const ASH = new THREE.Color('#5d5651');
const CRATER = new THREE.Color('#221a16');

/** Where a volcano's mesh stands: the ground under it as drawn by the view, and how far the cone rises over it. */
export interface VolcanoGroundView {
  /** The ground's radius in unit direction `dir` as this view draws it, its colour into `color`. */
  ground(dir: THREE.Vector3, color: THREE.Color): number;
  /** How far the full-grown cone rises over that ground at `dir` (`s` and `azimuth` as in VolcanoShape.profile). */
  rise(dir: THREE.Vector3, s: number, azimuth: number): number;
  /** How far the mesh's rim sinks under the ground at the foot, so the ground hides its edge. */
  readonly footSink: number;
}

/**
 * A volcano's cone as a mesh, for both views (low orbit's planet/Volcanoes.ts
 * and the system view's Planet): a polar grid round the summit, draped over
 * the ground as the view draws it and raised by its growth, dark basalt
 * fading into the ground's colour at the foot, with lava glowing in the
 * crater and in channels down the flanks as far as it has run (emissive per
 * vertex, through onBeforeCompile). In the body frame of the view.
 */
export class VolcanoMesh {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly dirs: Float32Array;
  private readonly base: Float32Array;
  private readonly rise: Float32Array;
  private written = -1;
  private readonly uniforms = { uFront: { value: 0 }, uHeat: { value: 0 }, uTime: { value: 0 }, uLava: { value: 1 } };

  constructor(
    readonly shape: VolcanoShape,
    rings: number,
    segments: number,
    view: VolcanoGroundView,
  ) {
    const color = new THREE.Color();
    const terrain = new THREE.Color();
    const dir = new THREE.Vector3();
    const count = 1 + rings * segments;
    this.dirs = new Float32Array(count * 3);
    this.base = new Float32Array(count);
    this.rise = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const glow = new Float32Array(count);
    const along = new Float32Array(count);
    const rng = new Rng(shape.site.seed ^ 0x5bd1);
    const c = volcanoParams.craterShare;
    for (let k = 0; k < count; k++) {
      const ring = k === 0 ? 0 : Math.floor((k - 1) / segments) + 1;
      const seg = k === 0 ? 0 : (k - 1) % segments;
      const s = ring / rings;
      const azimuth = (seg / segments) * Math.PI * 2;
      shape.direction(s, azimuth, dir);
      this.dirs.set([dir.x, dir.y, dir.z], k * 3);
      this.base[k] = view.ground(dir, terrain) - view.footSink * THREE.MathUtils.smoothstep(s, 0.75, 1);
      this.rise[k] = Math.max(0, view.rise(dir, s, azimuth));
      // Dark basalt, ashier up high, the crater darker still, into the ground's own colour at the foot.
      color.copy(ROCK).lerp(ASH, THREE.MathUtils.smoothstep(1 - s, 0.4, 0.85) * 0.7);
      if (s < c) color.lerp(CRATER, 0.8);
      color.multiplyScalar(rng.range(0.85, 1.1)).lerp(terrain, THREE.MathUtils.smoothstep(s, 0.8, 0.98));
      colors.set([color.r, color.g, color.b], k * 3);
      glow[k] = s < c * 0.85 ? 1 : shape.channel(s, azimuth);
      along[k] = s;
    }
    // Triangles facing out of the ground (azimuth turns anticlockwise seen from above).
    const index: number[] = [];
    const at = (ring: number, seg: number) => (ring === 0 ? 0 : 1 + (ring - 1) * segments + (seg % segments));
    for (let seg = 0; seg < segments; seg++) index.push(0, at(1, seg), at(1, seg + 1));
    for (let ring = 1; ring < rings; ring++) {
      for (let seg = 0; seg < segments; seg++) {
        const a = at(ring, seg);
        const b = at(ring, seg + 1);
        const d = at(ring + 1, seg);
        const e = at(ring + 1, seg + 1);
        index.push(a, d, e, a, e, b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
    geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    geometry.setIndex(index);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    const uniforms = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nattribute float aAlong;\nvarying float vGlow;\nvarying float vAlong;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;\nvAlong = aAlong;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uFront;\nuniform float uHeat;\nuniform float uTime;\nuniform float uLava;\nvarying float vGlow;\nvarying float vAlong;',
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          // The lava that has run as far as the front, cooling to a dark crust behind a glowing skin.
          float lava = vGlow * (1.0 - smoothstep(uFront - 0.05, uFront, vAlong));
          diffuseColor.rgb *= 1.0 - 0.7 * lava;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          /* glsl */ `#include <emissivemap_fragment>
          float flicker = 0.8 + 0.12 * sin(uTime * 3.1 + vAlong * 37.0) + 0.08 * sin(uTime * 7.3 - vAlong * 61.0);
          float heat = lava * uHeat * flicker;
          totalEmissiveRadiance += mix(vec3(0.75, 0.09, 0.01), vec3(1.0, 0.45, 0.1), heat) * heat * 1.5 * uLava;`,
        );
    };
    material.customProgramCacheKey = () => 'volcano';
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'Volcano';
    this.setGrowth(shape.growth);
  }

  /** How far the crater floor at the summit rises over the ground at full height. */
  get summitRise(): number {
    return this.rise[0]!;
  }

  /** Raises the mesh to `growth` of its height (rewriting it only when that changed). */
  setGrowth(growth: number): void {
    if (growth === this.written) return;
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const p = pos.array as Float32Array;
    for (let k = 0; k < this.base.length; k++) {
      const r = this.base[k]! + growth * this.rise[k]!;
      p[k * 3] = this.dirs[k * 3]! * r;
      p[k * 3 + 1] = this.dirs[k * 3 + 1]! * r;
      p[k * 3 + 2] = this.dirs[k * 3 + 2]! * r;
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
    this.written = growth;
  }

  /** The lava at clock time `time`, `age` seconds after the volcano's birth (Infinity: long settled); `brightness` scales its glow. */
  animate(time: number, age: number, brightness = 1): void {
    const u = this.uniforms;
    u.uFront.value = Number.isFinite(age) ? lavaFront(age) : volcanoParams.flowReach;
    u.uHeat.value = 0.45 + 0.55 * eruptionStrength(Number.isFinite(age) ? age : 1e9);
    u.uTime.value = time;
    u.uLava.value = brightness;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
