import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { VolcanoShape, eruptionStrength, volcanoGrowth, volcanoParams, type VolcanoSite } from '../combat/volcano';
import { GLOBE_SIZE_FACTOR } from '../gen/planets';
import { Rng } from '../gen/rng';
import { MarkerRing } from '../player/MarkerRing';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import { createGlowTexture } from '../world/glowTexture';
import type { GroundRelief } from './PlanetGlobe';
import type { RenderClock } from './PlanetFrame';
import { VolcanoSurface } from './VolcanoSurface';

export const volcanoLookParams = {
  /** Lava blob size, planet units (grows with the globes). */
  blobSize: 0.45 * GLOBE_SIZE_FACTOR,
  /** Brightness of the lava on the flanks and in the crater, and of the glow over it. */
  lava: 1,
  glow: 1,
  /** The ash column: how high it rises (× the volcano's height) and how dark it is (0–1). */
  ashHeight: 3.2,
  ashOpacity: 0.75,
  /** How hard the camera shakes as one rises (planet units at its foot). */
  shake: 0.5,
};

/** Milliseconds per frame spent building the volcanoes' chunks (each builds at least one it wants). */
const BUILD_BUDGET_MS = 2;
/** Lava blobs and ash puffs per volcano. */
const BLOBS = 220;
const PUFFS = 110;
/** The mesh's rim sinks this far below the ground at the foot, so the terrain hides its edge (planet units). */
const FOOT_SINK = 0.25 * GLOBE_SIZE_FACTOR;
/** Seconds an ash puff takes to rise. */
const ASH_PERIOD = 7;
/** The most the sunlight brightens the ash's own colour. */
const ASH_MAX_LIGHT = 1.4;
/** Scratch for the particles' pixel sizes. */
const drawingSize = new THREE.Vector2();


/** What the volcanoes need from the globe they stand on (see PlanetGlobe). */
export interface VolcanoGround {
  /** Sea level (a small body's longest reach): the terrain's cells are sized on it. */
  readonly radius: number;
  readonly seaRadius: number | null;
  terrainRadius(dir: THREE.Vector3, color: THREE.Color): number;
  addRelief(relief: GroundRelief, peak: number): void;
}

const BLOB_VERTEX = /* glsl */ `
  attribute vec4 aSeed;    // phase, speed share, azimuth, size
  attribute vec2 aStart;   // where in the crater it leaves (local x, z)
  uniform float uTime;
  uniform float uStrength;
  uniform float uSpeed;
  uniform float uGravity;
  uniform float uFloor;    // how far below the vent it lands (on the flanks)
  uniform float uSize;
  uniform float uScale;
  varying float vHeat;
  varying float vAlpha;

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    // Each blob loops: thrown, falls, waits, thrown again; how many fly goes with the strength.
    float most = uSpeed * aSeed.y;
    float period = (2.0 * most / uGravity) * 1.6 + 0.3;
    float cycle = uTime / period + aSeed.x;
    float age = fract(cycle) * period;
    float v = most * mix(0.55, 1.0, uStrength);
    float y = v * age - 0.5 * uGravity * age * age;
    float show = step(hash(floor(cycle) * 17.31 + aSeed.x * 911.0), uStrength);
    if (show < 0.5 || y < -uFloor) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }
    float side = v * 0.32 * (0.3 + aSeed.w);
    vec3 p = vec3(aStart.x + cos(aSeed.z) * side * age, y, aStart.y + sin(aSeed.z) * side * age);
    float flight = 2.0 * v / uGravity;
    vHeat = clamp(1.0 - 0.8 * age / flight, 0.0, 1.0);
    vAlpha = smoothstep(0.0, 0.05, age);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * (0.5 + aSeed.w) * uScale / -mv.z, 1.0, 48.0);
  }
`;

const BLOB_FRAGMENT = /* glsl */ `
  uniform float uBrightness;
  varying float vHeat;
  varying float vAlpha;

  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    float h = vHeat;
    vec3 col = mix(vec3(0.07, 0.025, 0.015), vec3(0.45, 0.05, 0.01), smoothstep(0.0, 0.3, h));
    col = mix(col, vec3(1.0, 0.35, 0.05) * 1.6, smoothstep(0.25, 0.6, h));
    col = mix(col, vec3(1.0, 0.85, 0.5) * 2.6, smoothstep(0.7, 1.0, h));
    col *= mix(1.0, uBrightness, smoothstep(0.2, 0.5, h)) * (1.0 - 0.35 * d);
    gl_FragColor = vec4(col, vAlpha * (1.0 - smoothstep(0.6, 1.0, d)));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const ASH_VERTEX = /* glsl */ `
  attribute vec4 aSeed;    // phase, azimuth, spread, size
  uniform float uTime;
  uniform float uPeriod;
  uniform float uStrength;
  uniform float uHeight;
  uniform float uWidth;
  uniform vec2 uWind;
  uniform float uSize;
  uniform float uScale;
  varying float vAlpha;
  varying float vLow;
  varying float vShade;

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    float cycle = uTime / uPeriod + aSeed.x;
    float a = fract(cycle);
    float show = step(hash(floor(cycle) * 7.13 + aSeed.x * 577.0), 0.25 + 0.75 * uStrength);
    // Shooting up out of the crater, slowing, spreading and drifting downwind at the top.
    float rise = uHeight * (1.0 - pow(1.0 - a, 1.7)) * (0.75 + 0.5 * aSeed.z) * mix(0.5, 1.0, uStrength);
    float spread = uWidth * (0.15 + 1.4 * a * a) * aSeed.z;
    vec3 p = vec3(cos(aSeed.y) * spread + uWind.x * a * a, rise, sin(aSeed.y) * spread + uWind.y * a * a);
    vAlpha = show * smoothstep(0.0, 0.06, a) * (1.0 - smoothstep(0.55, 1.0, a)) * clamp(uStrength * 1.5, 0.0, 1.0);
    vLow = 1.0 - smoothstep(0.0, 0.18, a);
    vShade = aSeed.w;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * (0.35 + 1.4 * a) * (0.6 + 0.8 * aSeed.w) * uScale / -mv.z, 1.0, 512.0);
  }
`;

const ASH_FRAGMENT = /* glsl */ `
  uniform vec3 uLight;
  uniform float uHeat;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vLow;
  varying float vShade;

  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    // Dark ash, lit by the sun, glowing from the lava at its foot.
    vec3 col = mix(vec3(0.16, 0.15, 0.145), vec3(0.32, 0.3, 0.29), vShade) * uLight;
    col += vec3(1.0, 0.35, 0.08) * vLow * uHeat * 1.5;
    float alpha = vAlpha * uOpacity * (1.0 - smoothstep(0.15, 1.0, d));
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** One volcano's meshes and particles, in the body frame. */
class VolcanoView {
  readonly vent = new THREE.Group();
  private readonly blobs: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly ash: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly glow: THREE.Sprite;
  private readonly flash: THREE.Sprite;
  private readonly ring: MarkerRing;
  readonly cone: VolcanoSurface;
  /** The ground's radius at the summit. */
  private readonly summit: number;
  private readonly ringPoint = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    readonly shape: VolcanoShape,
    /** The level's clock time of the impact; -Infinity for one standing since before the visit. */
    readonly bornAt: number,
    ground: VolcanoGround,
    glowTexture: THREE.Texture,
  ) {
    const terrain = new THREE.Color();
    this.summit = ground.terrainRadius(shape.centre, terrain);
    this.cone = new VolcanoSurface(
      shape,
      {
        ground: (dir, color) => ground.terrainRadius(dir, color),
        rise: (_dir, s, azimuth) => shape.height * shape.profile(s, azimuth),
        footSink: FOOT_SINK,
      },
      ground.radius,
    );
    const rng = new Rng(shape.site.seed ^ 0x3c6e);
    const c = volcanoParams.craterShare;

    // The vent: its frame has y up out of the summit (the particles work in it).
    this.vent.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shape.centre);
    const H = shape.height;
    const blobs = new THREE.BufferGeometry();
    const seeds = new Float32Array(BLOBS * 4);
    const starts = new Float32Array(BLOBS * 2);
    const craterRadius = shape.baseRadius * c * 0.5;
    for (let i = 0; i < BLOBS; i++) {
      seeds.set([rng.next(), rng.range(0.35, 1), rng.range(0, Math.PI * 2), rng.next()], i * 4);
      const a = rng.range(0, Math.PI * 2);
      const r = craterRadius * Math.sqrt(rng.next());
      starts.set([Math.cos(a) * r, Math.sin(a) * r], i * 2);
    }
    blobs.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BLOBS * 3), 3));
    blobs.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    blobs.setAttribute('aStart', new THREE.BufferAttribute(starts, 2));
    // Fountains reach about the volcano's own height over the vent at their strongest.
    const gravity = 2 * H;
    this.blobs = new THREE.Points(
      blobs,
      new THREE.ShaderMaterial({
        vertexShader: BLOB_VERTEX,
        fragmentShader: BLOB_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uStrength: { value: 0 },
          uSpeed: { value: Math.sqrt(2 * gravity * 1.1 * H) },
          uGravity: { value: gravity },
          uFloor: { value: 0.5 * H },
          uSize: { value: volcanoLookParams.blobSize },
          uScale: { value: 1 },
          uBrightness: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
      }),
    );
    const puffs = new THREE.BufferGeometry();
    const puffSeeds = new Float32Array(PUFFS * 4);
    for (let i = 0; i < PUFFS; i++) puffSeeds.set([rng.next(), rng.range(0, Math.PI * 2), rng.range(0.2, 1), rng.next()], i * 4);
    puffs.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PUFFS * 3), 3));
    puffs.setAttribute('aSeed', new THREE.BufferAttribute(puffSeeds, 4));
    const windAngle = rng.range(0, Math.PI * 2);
    this.ash = new THREE.Points(
      puffs,
      new THREE.ShaderMaterial({
        vertexShader: ASH_VERTEX,
        fragmentShader: ASH_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uPeriod: { value: ASH_PERIOD },
          uStrength: { value: 0 },
          uHeight: { value: H * volcanoLookParams.ashHeight },
          uWidth: { value: shape.baseRadius * 0.35 },
          uWind: { value: new THREE.Vector2(Math.cos(windAngle), Math.sin(windAngle)).multiplyScalar(shape.baseRadius * 0.9) },
          uSize: { value: shape.baseRadius * 0.28 },
          uScale: { value: 1 },
          uLight: { value: new THREE.Color(1, 1, 1) },
          uHeat: { value: 0 },
          uOpacity: { value: volcanoLookParams.ashOpacity },
        },
        transparent: true,
        depthWrite: false,
      }),
    );
    for (const points of [this.blobs, this.ash]) {
      // Positions come from the shader, so the bounding sphere can't be known.
      points.frustumCulled = false;
      // Sizes in pixels per unit at distance 1, for the drawing buffer.
      points.onBeforeRender = (renderer, _scene, camera) => {
        renderer.getDrawingBufferSize(drawingSize);
        points.material.uniforms.uScale!.value = drawingSize.y * 0.5 * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5]!;
      };
      // Over the air and the clouds: an eruption punches up through the cloud deck, and shows where it is.
      points.renderOrder = CLOUD_RENDER_ORDER + 0.5;
    }
    // Ash over the blobs.
    this.ash.renderOrder = CLOUD_RENDER_ORDER + 0.6;
    const sprite = (tint: string, depthTest: boolean) =>
      new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color: tint,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest,
          transparent: true,
          toneMapped: false,
        }),
      );
    this.glow = sprite('#ff6a1e', true);
    this.glow.renderOrder = CLOUD_RENDER_ORDER + 0.5;
    this.flash = sprite('#fff0c8', false);
    this.flash.renderOrder = CLOUD_RENDER_ORDER + 0.7;
    this.flash.visible = false;
    this.vent.add(this.blobs, this.ash, this.glow);
    this.ring = new MarkerRing(scene, '#ffb070', 0, 0.12);
    scene.add(this.cone.object, this.vent, this.flash);
  }

  /**
   * Poses it at the level's clock `time` for a camera at `camera` (its cone's
   * chunks built until `deadline`, see VolcanoSurface); `sun` is the light on
   * the ash (colour × strength).
   */
  update(time: number, sun: THREE.Color, frameDt: number, camera: THREE.Vector3, deadline: number): void {
    const age = time - this.bornAt;
    const shape = this.shape;
    shape.growth = volcanoGrowth(age);
    this.cone.setGrowth(shape.growth);
    this.cone.animate(time, age, volcanoLookParams.lava);
    this.cone.update(camera, frameDt, deadline);
    const strength = eruptionStrength(Number.isFinite(age) ? age : 1e9);
    const H = shape.height;
    // The vent sits on the crater floor, rising with the cone.
    this.vent.position.copy(shape.centre).multiplyScalar(this.summit + shape.growth * H * (1 - volcanoParams.craterDepth));

    const blobs = this.blobs.material.uniforms;
    blobs.uTime!.value = time;
    blobs.uStrength!.value = strength * Math.min(1, shape.growth * 3);
    blobs.uSize!.value = volcanoLookParams.blobSize;
    const ash = this.ash.material.uniforms;
    ash.uTime!.value = time;
    ash.uStrength!.value = strength * Math.min(1, shape.growth * 2);
    ash.uHeight!.value = H * volcanoLookParams.ashHeight;
    ash.uHeat!.value = strength;
    ash.uOpacity!.value = volcanoLookParams.ashOpacity;
    (ash.uLight!.value as THREE.Color).copy(sun);

    const flicker = 0.85 + 0.1 * Math.sin(time * 11.3) + 0.05 * Math.sin(time * 23.9 + 0.7);
    this.glow.position.set(0, H * 0.25, 0);
    this.glow.scale.setScalar(shape.baseRadius * (0.35 + 0.45 * strength));
    this.glow.material.opacity = Math.min(1, (0.25 + 0.75 * strength) * flicker * volcanoLookParams.glow);

    // The impact: a flash where it hit, and a ring of dust racing out over the ground.
    const fresh = age >= 0 && age < 2.5;
    this.flash.visible = fresh && age < 1.2;
    if (this.flash.visible) {
      const k = Math.exp(-age / 0.3);
      this.flash.position.copy(shape.centre).multiplyScalar(this.summit + H * 0.3);
      this.flash.scale.setScalar(shape.baseRadius * (0.6 + 1.6 * (1 - k)));
      this.flash.material.opacity = k;
    }
    if (fresh) {
      const s = 1 - Math.exp(-age / 0.5);
      this.ringPoint.copy(shape.centre).multiplyScalar(this.summit + 0.5);
      this.ring.place(this.ringPoint, shape.baseRadius * (0.2 + 1.6 * s), 0.9 * (1 - age / 2.5), shape.centre, frameDt);
    } else this.ring.hide();
  }

  dispose(): void {
    this.scene.remove(this.vent, this.flash);
    this.cone.dispose();
    for (const points of [this.blobs, this.ash]) {
      points.geometry.dispose();
      points.material.dispose();
    }
    this.glow.material.dispose();
    this.flash.material.dispose();
    this.ring.dispose();
  }
}

/**
 * The volcanoes on the visited body, raised by volcano bombs (combat/VolcanoBomb.ts):
 * each a cone of dark rock with a crater, draped over the terrain (the
 * globe counts it in the ground, `addRelief`), lava glowing in its crater and
 * running down channels on its flanks, blobs of lava thrown from the vent and
 * an ash column drifting downwind. A new one rises out of the ground erupting
 * violently, shaking the camera, then settles into a gentle eruption; the ones
 * that stood before the visit are risen and settled from the start.
 * Everything is a function of the level's clock (combat/volcano.ts).
 * Added after the camera, so it can shake it.
 */
export class Volcanoes implements Entity {
  private readonly views: VolcanoView[] = [];
  private readonly glowTexture = createGlowTexture();
  private readonly light = new THREE.Color();
  private readonly toCamera = new THREE.Vector3();
  private readonly cameraAt = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly clock: RenderClock,
    private readonly ground: VolcanoGround,
    private readonly camera: THREE.PerspectiveCamera,
    /** Unit direction to the sun, its light and the ambient light (see PlanetGlobe). */
    private readonly sun: THREE.Vector3,
    private readonly sunLight: THREE.Color,
    private readonly ambientLight: THREE.Color,
    debug: Debug,
  ) {
    const f = debug.folder('Volcanoes');
    f?.add(volcanoParams, 'flightTime', 0.3, 5);
    f?.add(volcanoParams, 'growTime', 0.5, 15);
    f?.add(volcanoParams, 'birthTime', 1, 60);
    f?.add(volcanoParams, 'idle', 0, 1);
    f?.add(volcanoParams, 'maxPerBody', 1, 30, 1);
    f?.add(volcanoLookParams, 'blobSize', 0.1, 5);
    f?.add(volcanoLookParams, 'lava', 0, 3);
    f?.add(volcanoLookParams, 'glow', 0, 3);
    f?.add(volcanoLookParams, 'ashHeight', 0, 8);
    f?.add(volcanoLookParams, 'ashOpacity', 0, 1);
    f?.add(volcanoLookParams, 'shake', 0, 3);
  }

  get count(): number {
    return this.views.length;
  }

  /** The volcanoes' shapes (for tests and the level). */
  get shapes(): VolcanoShape[] {
    return this.views.map((v) => v.shape);
  }

  /** Each cone's chunks drawn now (see VolcanoSurface), for automation. */
  lodStats(): ReturnType<VolcanoSurface['stats']>[] {
    return this.views.map((v) => v.cone.stats());
  }

  /** True when every cone has the chunks the camera wants (for automation). */
  get settled(): boolean {
    return this.views.every((v) => v.cone.settled);
  }

  /**
   * Raises a volcano at `site`, born at the level's clock time `bornAt`
   * (null: it stood there before the visit, risen and settled).
   */
  add(site: VolcanoSite, bornAt: number | null): VolcanoShape {
    const centre = new THREE.Vector3(site.x, site.y, site.z).normalize();
    const groundAtCentre = this.ground.terrainRadius(centre, new THREE.Color());
    const shape = new VolcanoShape(site, this.ground.radius, groundAtCentre, this.ground.seaRadius);
    const born = bornAt ?? -Infinity;
    shape.growth = volcanoGrowth(this.clock.renderTime - born);
    const view = new VolcanoView(this.scene, shape, born, this.ground, this.glowTexture);
    this.views.push(view);
    this.ground.addRelief(shape, groundAtCentre + shape.height);
    return shape;
  }

  /** True if unit direction `dir` is on a volcano (plants there are buried). */
  covers(dir: THREE.Vector3): boolean {
    for (const v of this.views) if (dir.dot(v.shape.centre) > v.shape.cosAngle) return true;
    return false;
  }

  update(frameDt: number): void {
    if (this.views.length === 0) return;
    const time = this.clock.renderTime;
    // The camera before it shakes, in the body frame (the scene's space).
    const camera = this.camera.getWorldPosition(this.cameraAt);
    const deadline = performance.now() + BUILD_BUDGET_MS;
    // The ash is lit by the sun on its side of the globe, dimly by the ambient light on the night side.
    let shake = 0;
    for (const v of this.views) {
      const day = Math.max(0, v.shape.centre.dot(this.sun));
      this.light.copy(this.sunLight).multiplyScalar(0.25 + 0.75 * Math.sqrt(day)).add(this.ambientLight);
      // Ash is dark however bright the sun: no brighter than lit grey.
      const top = Math.max(this.light.r, this.light.g, this.light.b);
      if (top > ASH_MAX_LIGHT) this.light.multiplyScalar(ASH_MAX_LIGHT / top);
      v.update(time, this.light, frameDt, camera, deadline);
      const age = time - v.bornAt;
      if (age >= 0 && age < volcanoParams.growTime + 2) {
        // Rumbling as it rises, the stronger the nearer the camera is.
        const near = 1 - Math.min(1, this.toCamera.copy(this.camera.position).sub(v.vent.position).length() / (v.shape.baseRadius * 10));
        shake = Math.max(shake, near * Math.exp(-age / 2) * Math.min(1, age / 0.15));
      }
    }
    if (shake > 0) {
      const a = shake * volcanoLookParams.shake;
      this.camera.position.x += a * (Math.sin(time * 37.1) + 0.5 * Math.sin(time * 71.3));
      this.camera.position.y += a * (Math.sin(time * 41.7 + 1.1) + 0.5 * Math.sin(time * 63.1));
      this.camera.position.z += a * (Math.sin(time * 33.9 + 2.3) + 0.5 * Math.sin(time * 79.9));
      this.camera.updateMatrixWorld();
    }
  }

  dispose(): void {
    for (const v of this.views) v.dispose();
    this.views.length = 0;
    this.glowTexture.dispose();
  }
}
