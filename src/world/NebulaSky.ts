import * as THREE from 'three';
import { markSky } from './skyCapture';
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
/**
 * Nebulas this big in the sky (angular radius, radians, ~29°) or round the
 * star are baked at WIDE_BAKE_SIZE (~0.35° per texel): they're soft at that
 * size, and they cover so much of the sky that baking them finer would cost
 * a march per texel over most of it.
 */
const WIDE_ANGLE = 0.5;
const WIDE_BAKE_SIZE = 256;
/**
 * Smaller ones (often the sharpest: remnants' filaments, planetary rings) get
 * a bake of their own, with about this many texels across the smallest one's
 * radius, from MIN to MAX face size (1024 is ~0.09° per texel, about a pixel
 * of a 720p view). They cover little of the sky, so it stays cheap.
 */
const DETAIL_TEXELS = 48;
const MIN_DETAIL_BAKE_SIZE = 256;
const MAX_DETAIL_BAKE_SIZE = 1024;

/**
 * The nebulas round a system in its sky (see NebulaSkyBake): drawn at
 * infinity, after the galaxy band and before the stars. Only made for
 * systems with a nebula close enough to show (`NebulaSky.near`). Big ones and
 * small ones are baked apart, the small ones finer (see WIDE_ANGLE), and
 * drawn as one: the small ones behind the big.
 */
export class NebulaSky implements Entity {
  /** The nebulas drawn, nearest first. */
  readonly nebulas: readonly NebulaData[];
  /** The big (or surrounding) nebulas and the small ones, either possibly absent. */
  private readonly wide: NebulaSkyBake | null;
  private readonly detail: NebulaSkyBake | null;
  private readonly sphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private baked = false;

  /** The nebulas that show in the sky of a star at galaxy position `p`: close or big enough. */
  static near(nebulas: readonly NebulaData[], p: { x: number; y: number; z: number }): NebulaData[] {
    const distance = (n: NebulaData) => Math.hypot(n.position.x - p.x, n.position.y - p.y, n.position.z - p.z);
    return nebulas.filter((n) => angularRadius(n, p) >= MIN_ANGLE).sort((a, b) => distance(a) - distance(b));
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
    const toSystem = new THREE.Quaternion(t.x, t.y, t.z, t.w);
    const angle = (n: NebulaData) => angularRadius(n, ref.position);
    const wide = nebulas.filter((n) => angle(n) >= WIDE_ANGLE);
    const small = nebulas.filter((n) => angle(n) < WIDE_ANGLE);
    this.wide = wide.length > 0 ? new NebulaSkyBake(wide, ref.position, toSystem, WIDE_BAKE_SIZE) : null;
    this.detail = small.length > 0 ? new NebulaSkyBake(small, ref.position, toSystem, detailBakeSize(Math.min(...small.map(angle)))) : null;
    const defines: Record<string, number> = {};
    if (this.wide) defines.WIDE = 1;
    if (this.detail) defines.DETAIL = 1;

    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.ShaderMaterial({
        defines,
        uniforms: { wide: { value: this.wide?.texture ?? null }, detail: { value: this.detail?.texture ?? null } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
          }`,
        fragmentShader: /* glsl */ `
          uniform samplerCube wide;
          uniform samplerCube detail;
          varying vec3 vDir;
          void main() {
            // Each is light (sRGB) and transmittance; the small ones are seen through the big.
            vec4 sky = vec4(0.0, 0.0, 0.0, 1.0);
            #ifdef DETAIL
              sky = textureCube(detail, vDir);
            #endif
            #ifdef WIDE
              vec4 front = textureCube(wide, vDir);
              sky = vec4(front.rgb + sky.rgb * front.a, sky.a * front.a);
            #endif
            gl_FragColor = sky;
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
        // Not 'transparent': that queue is drawn after every solid object, so with no depth test the sky would
        // cover the planets and stars. In the opaque queue, its render order puts it with the rest of the sky.
        transparent: false,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.sphere.onBeforeRender = (renderer) => {
      if (this.baked) return;
      this.baked = true;
      this.wide?.bake(renderer);
      this.detail?.bake(renderer);
    };
    this.sphere.name = 'Nebula sky';
    this.sphere.frustumCulled = false;
    // After the galaxy band (-3), before the sky stars (-2) and everything in the system (all opaque-queue sky).
    this.sphere.renderOrder = -2.5;
    markSky(this.sphere);
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

  /** The baked sky's mean light and transmittance (see NebulaSkyBake.stats; both bakes together, roughly). */
  stats(renderer: THREE.WebGLRenderer): { light: number; transmittance: number } {
    const a = this.wide?.stats(renderer) ?? { light: 0, transmittance: 1 };
    const b = this.detail?.stats(renderer) ?? { light: 0, transmittance: 1 };
    return { light: a.light + b.light, transmittance: a.transmittance * b.transmittance };
  }

  /** The face sizes of the two bakes (0: none), for tests. */
  get bakeSizes(): { wide: number; detail: number } {
    return { wide: this.wide?.size ?? 0, detail: this.detail?.size ?? 0 };
  }

  dispose(): void {
    this.scene.remove(this.sphere);
    this.sphere.geometry.dispose();
    this.sphere.material.dispose();
    this.wide?.dispose();
    this.detail?.dispose();
  }
}

/** A nebula's angular radius (radians) seen from galaxy position `p`: π/2 from inside it. */
function angularRadius(n: NebulaData, p: { x: number; y: number; z: number }): number {
  const d = Math.hypot(n.position.x - p.x, n.position.y - p.y, n.position.z - p.z);
  return d <= n.radius ? Math.PI / 2 : Math.asin(n.radius / d);
}

/** Face size for the small nebulas' bake: DETAIL_TEXELS across the smallest one's radius, a power of two. */
export function detailBakeSize(smallestAngle: number): number {
  const texel = smallestAngle / DETAIL_TEXELS;
  const size = 2 ** Math.ceil(Math.log2(Math.PI / 2 / texel));
  return Math.min(MAX_DETAIL_BAKE_SIZE, Math.max(MIN_DETAIL_BAKE_SIZE, size));
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
