import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { StarRef } from '../gen/galaxy';
import { dimsStars, starTransmittance, type NebulaData } from '../gen/nebulas';
import { conjugate, rotate } from '../gen/quat';
import type { SystemData } from '../gen/system';
import { NebulaSkyBake, addNebulaDebug } from './nebulaLook';

/**
 * A nebula is drawn in a system's sky once its angular radius from the star
 * is over this (radians, ~2.3°); smaller ones are specks, left out of the bake.
 */
const MIN_ANGLE = 0.04;
/** Cube map face size (~0.35° per texel): nebulas are soft, and baking costs a march per texel. */
const BAKE_SIZE = 256;

/**
 * The nebulas round a system in its sky (see NebulaSkyBake): drawn at
 * infinity, after the galaxy band and before the stars. Only made for
 * systems with a nebula close enough to show (`NebulaSky.near`).
 */
export class NebulaSky implements Entity {
  /** The nebulas drawn, nearest first. */
  readonly nebulas: readonly NebulaData[];
  private readonly bake: NebulaSkyBake;
  private readonly sphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private baked = false;

  /** The nebulas that show in the sky of a star at galaxy position `p`: close or big enough. */
  static near(nebulas: readonly NebulaData[], p: { x: number; y: number; z: number }): NebulaData[] {
    const distance = (n: NebulaData) => Math.hypot(n.position.x - p.x, n.position.y - p.y, n.position.z - p.z);
    return nebulas
      .filter((n) => {
        const d = distance(n);
        return d <= n.radius || Math.asin(n.radius / d) >= MIN_ANGLE;
      })
      .sort((a, b) => distance(a) - distance(b));
  }

  constructor(
    private readonly scene: THREE.Scene,
    ref: StarRef,
    system: SystemData,
    nebulas: readonly NebulaData[],
    debug: Debug,
  ) {
    this.nebulas = nebulas;
    const t = conjugate(system.galacticTilt);
    this.bake = new NebulaSkyBake(nebulas, ref.position, new THREE.Quaternion(t.x, t.y, t.z, t.w), BAKE_SIZE);

    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: { map: { value: this.bake.texture } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
          }`,
        fragmentShader: /* glsl */ `
          uniform samplerCube map;
          varying vec3 vDir;
          void main() {
            gl_FragColor = textureCube(map, vDir);
            #include <colorspace_fragment>
          }`,
        side: THREE.BackSide,
        // As on the galaxy map: rgb = light + behind · transmittance.
        blending: THREE.CustomBlending,
        blendEquation: THREE.AddEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.SrcAlphaFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.sphere.onBeforeRender = (renderer) => {
      if (this.baked) return;
      this.baked = true;
      this.bake.bake(renderer);
    };
    this.sphere.name = 'Nebula sky';
    this.sphere.frustumCulled = false;
    // After the galaxy band (-3), before its stars (-2) and the Starfield (-1).
    this.sphere.renderOrder = -2.5;
    scene.add(this.sphere);
    addNebulaDebug(debug, 'System nebulas', () => (this.baked = false));
  }

  /** Shown or hidden (tests compare the view with and without it). */
  get visible(): boolean {
    return this.sphere.visible;
  }

  set visible(v: boolean) {
    this.sphere.visible = v;
  }

  /** Whether the sky has been baked (on its first draw). */
  get ready(): boolean {
    return this.baked;
  }

  /** The baked sky's mean light and transmittance (see NebulaSkyBake.stats). */
  stats(renderer: THREE.WebGLRenderer): { light: number; transmittance: number } {
    return this.bake.stats(renderer);
  }

  dispose(): void {
    this.scene.remove(this.sphere);
    this.sphere.geometry.dispose();
    this.sphere.material.dispose();
    this.bake.dispose();
  }
}

/**
 * How much of a background star's light gets through the dark nebulas, by
 * its direction in system space, as seen from the star at galaxy position
 * `origin` (for the sky's point stars, which the bake can't dim).
 */
export function skyStarDimming(
  nebulas: readonly NebulaData[],
  origin: { x: number; y: number; z: number },
  system: SystemData,
): ((dir: THREE.Vector3) => number) | null {
  const dark = nebulas.filter(dimsStars);
  if (dark.length === 0) return null;
  const g = { x: 0, y: 0, z: 0 };
  return (dir) => starTransmittance(dark, origin, rotate(system.galacticTilt, dir, g));
}
