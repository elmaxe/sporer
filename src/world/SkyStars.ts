import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { skyStars } from '../gen/galactic';
import type { StarRef } from '../gen/galaxy';
import { hashSeed, Rng } from '../gen/rng';
import type { SystemData } from '../gen/system';

export const skyStarParams = {
  /** Brightness of a star with flux `referenceFlux` (a Sun-like star ~30 galaxy units away). */
  brightness: 1.4,
  /**
   * How much the brightness range is squeezed: displayed brightness goes as
   * flux^contrast. 1 would be true to the light (most stars invisible next to
   * the brightest); eyes and cameras see a much flatter range.
   */
  contrast: 0.4,
};

/** The flux drawn at `brightness` 1: a Sun-like star 30 galaxy units away. */
const REFERENCE_FLUX = 1 / 30 ** 2;
/** Stars dimmer than this on screen (after the contrast) are left out. */
const MIN_BRIGHTNESS = 0.05;
/** Point size (CSS px) of a faint star, and how much a bright one grows by. */
const BASE_SIZE = 2.5;
const GROWTH = 5;
/** How far towards white the (stylised, saturated) star colours are drawn: points of light look paler. */
const WHITEN = 0.5;
/**
 * The galaxy's stars lie in a thin disc, so they crowd the band and leave
 * the sky away from it empty. Each one stands for many more too small for
 * the map, and the nearest of those are all round: this many faint field
 * stars, in every direction...
 */
const FIELD_COUNT = 1400;
/** ...no brighter than this on screen (brightness before `brightness`). */
const FIELD_MAX_BRIGHTNESS = 0.7;

/**
 * The galaxy's other stars in a system's sky, each where it really lies and
 * as bright as its luminosity over its distance squared (gen/galactic.ts
 * `skyStars`), the range squeezed the way eyes see it, plus a sparse field of
 * faint ones all round (FIELD_COUNT). Bright ones are bigger, with a soft
 * glow round a sharp core. Drawn at infinity (the view rotation only) with
 * the rest of the sky, dimmed behind dark nebulas.
 */
export class SkyStars implements Entity {
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(
    private readonly scene: THREE.Scene,
    stars: readonly StarRef[],
    ref: StarRef,
    system: SystemData,
    debug: Debug,
    /** Share of a star's light that reaches the system from direction `dir` (dark nebulas), if any are in the way. */
    dim?: ((dir: THREE.Vector3) => number) | null,
  ) {
    const sky = skyStars(stars, ref, system.galacticTilt);
    const minFlux = REFERENCE_FLUX * MIN_BRIGHTNESS ** (1 / skyStarParams.contrast);
    const shown = sky.filter((s) => s.flux >= minFlux);
    shown.push(...fieldStars(new Rng(hashSeed(system.seed, 'fieldStars')), stars, minFlux));
    const positions = new Float32Array(shown.length * 3);
    const colors = new Float32Array(shown.length * 3);
    const fluxes = new Float32Array(shown.length);
    const c = new THREE.Color();
    const dir = new THREE.Vector3();
    shown.forEach((s, i) => {
      dir.set(s.dir.x, s.dir.y, s.dir.z).toArray(positions, i * 3);
      c.set(s.color).lerp(WHITE, WHITEN);
      if (dim) c.multiplyScalar(dim(dir));
      c.toArray(colors, i * 3);
      fluxes[i] = s.flux / REFERENCE_FLUX;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('flux', new THREE.BufferAttribute(fluxes, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        pixelRatio: { value: 1 },
        brightness: { value: skyStarParams.brightness },
        contrast: { value: skyStarParams.contrast },
        baseSize: { value: BASE_SIZE },
        growth: { value: GROWTH },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'Sky stars';
    this.points.frustumCulled = false;
    // With the band's own stars, after the band and nebulas, before everything in the system.
    this.points.renderOrder = -2;
    this.points.onBeforeRender = (renderer) => {
      material.uniforms.pixelRatio!.value = renderer.getPixelRatio();
      material.uniforms.brightness!.value = skyStarParams.brightness;
      material.uniforms.contrast!.value = skyStarParams.contrast;
    };
    scene.add(this.points);

    const f = debug.folder('Sky stars');
    f?.add(skyStarParams, 'brightness', 0, 3);
    f?.add(skyStarParams, 'contrast', 0.1, 1);
  }

  /** Stars drawn (tests). */
  get count(): number {
    return this.points.geometry.getAttribute('position').count;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

const WHITE = new THREE.Color(1, 1, 1);

/**
 * The faint field stars (see FIELD_COUNT): uniform directions, colours of
 * random galaxy stars, and fluxes as stars spread evenly through space are
 * counted, N(>f) ∝ f^(−3/2) (each tenfold of distance has 1000× the stars at
 * 1/100 the flux), from `minFlux` up to FIELD_MAX_BRIGHTNESS.
 */
function fieldStars(rng: Rng, stars: readonly StarRef[], minFlux: number): ReturnType<typeof skyStars> {
  const maxFlux = REFERENCE_FLUX * FIELD_MAX_BRIGHTNESS ** (1 / skyStarParams.contrast);
  const out: ReturnType<typeof skyStars> = [];
  for (let i = 0; i < FIELD_COUNT; i++) {
    const z = rng.range(-1, 1);
    const t = rng.range(0, 2 * Math.PI);
    const r = Math.sqrt(1 - z * z);
    const flux = Math.min(maxFlux, minFlux * Math.pow(1 - rng.next(), -2 / 3));
    const color = stars[rng.int(0, stars.length - 1)]?.stars[0]?.color ?? '#ffffff';
    out.push({ dir: { x: r * Math.cos(t), y: r * Math.sin(t), z }, flux, color });
  }
  return out;
}

const VERTEX = /* glsl */ `
  attribute vec3 color;
  attribute float flux;     // relative to the reference flux
  uniform float pixelRatio;
  uniform float brightness;
  uniform float contrast;
  uniform float baseSize;
  uniform float growth;
  varying vec3 vColor;
  varying float vSize;
  varying float vGlow;
  void main() {
    float b = brightness * pow(flux, contrast);
    // Past full brightness a star grows instead (its glow spreads, as in a photo).
    vGlow = clamp(b - 1.0, 0.0, 2.0);
    vColor = color * min(b, 1.0);
    vSize = (baseSize + growth * vGlow) * pixelRatio;
    gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
    gl_PointSize = vSize;
  }`;

const FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vSize;
  varying float vGlow;
  void main() {
    // Distance from the centre in device pixels.
    float px = length(gl_PointCoord - 0.5) * vSize;
    float edge = 0.5 * vSize;
    if (px > edge) discard;
    // A sharp core about a pixel wide, and round bright stars a glow fading to nothing at the point's edge.
    float core = exp(-px * px * 1.4);
    float glow = vGlow * 0.35 * exp(-px / (0.18 * edge + 0.5)) * (1.0 - px / edge);
    // The core of a bright star saturates to white.
    vec3 col = vColor * (core + glow) + vec3(core * vGlow * 0.3);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
