import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { BULGE_GLOW_COLOR, DISC_GLOW_COLOR } from '../galaxy/appearance';
import { BAND_SAMPLES, BULGE_FLATTENING, bandStarDirections, galacticSky, type GalacticSky } from '../gen/galactic';
import type { StarRef } from '../gen/galaxy';
import { hashSeed, Rng } from '../gen/rng';
import type { SystemData } from '../gen/system';
import { VALUE_NOISE_GLSL } from './noiseGlsl';

export const galaxyBandParams = {
  /** Peak brightness of the disc band. */
  brightness: 0.22,
  /** Peak brightness of the bulge glow around the galactic centre. */
  bulge: 0.3,
  /** How dark the dust lanes get (0 = none, 1 = black). */
  dust: 0.8,
  /** Brightness of the faint stars crowding along the band. */
  stars: 1,
};

const BAND_STAR_COUNT = 3500;
/**
 * Cube map face size the band is baked into (~0.18° per texel, 6 MB). The
 * band is soft (its narrowest σ is ~3°) and its finest dust ~0.5°, so more
 * would cost memory for little gain.
 */
const BAKE_SIZE = 512;

/**
 * The galaxy's band across a system's sky, seen from where the star really
 * is (see gen/galactic.ts): brightest towards the galactic centre with its
 * bulge, broader and fainter towards the rim, with dark dust lanes along the
 * midline, plus a crowd of faint stars along it. Drawn at infinity (the view
 * rotation only, so it never needs recentring) before everything else,
 * including the Starfield.
 *
 * The band never changes within a system, so its (costly) shader runs once,
 * baked into a cube map the first time the sky is drawn; each frame then
 * costs one texture lookup per pixel.
 */
export class GalaxyBand implements Entity {
  /** The galaxy as seen from this system: directions in system space and the band profile. */
  readonly sky: GalacticSky;
  private readonly sphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly stars: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly bakeScene = new THREE.Scene();
  private readonly bakeMaterial: THREE.ShaderMaterial;
  private readonly target = new THREE.WebGLCubeRenderTarget(BAKE_SIZE, { generateMipmaps: false });
  private readonly cubeCamera = new THREE.CubeCamera(0.1, 10, this.target);
  private baked = false;

  constructor(
    private readonly scene: THREE.Scene,
    ref: StarRef,
    system: SystemData,
    debug: Debug,
  ) {
    const sky = (this.sky = galacticSky(ref.position, system.galacticTilt));
    const vec = (v: { x: number; y: number; z: number }) => new THREE.Vector3(v.x, v.y, v.z);
    const north = vec(sky.north);
    const discColor = new THREE.Color(DISC_GLOW_COLOR).lerp(new THREE.Color('#ffffff'), 0.35);

    const geometry = new THREE.SphereGeometry(1, 64, 32);
    this.bakeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        north: { value: north },
        center: { value: vec(sky.center) },
        east: { value: vec(sky.east) },
        band: { value: sky.band.map((s) => new THREE.Vector3(s.brightness, s.width, s.offset)) },
        bulgeLat: { value: Math.asin(THREE.MathUtils.clamp(north.dot(vec(sky.bulge)), -1, 1)) },
        bulgeSize: { value: sky.bulgeSize },
        discColor: { value: discColor },
        bulgeColor: { value: new THREE.Color(BULGE_GLOW_COLOR) },
        brightness: { value: galaxyBandParams.brightness },
        bulgeBrightness: { value: galaxyBandParams.bulge },
        dust: { value: galaxyBandParams.dust },
        // Each system's dust lanes and star clouds differ.
        seed: { value: (hashSeed(system.seed, 'band') % 1000) / 10 },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: BAND_FRAGMENT,
      side: THREE.BackSide,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.bakeScene.add(new THREE.Mesh(geometry, this.bakeMaterial));
    // sRGB storage keeps the faint outskirts free of banding in 8 bits.
    this.target.texture.colorSpace = THREE.SRGBColorSpace;

    this.sphere = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { map: { value: this.target.texture } },
        vertexShader: SKY_VERTEX,
        fragmentShader: /* glsl */ `
          uniform samplerCube map;
          varying vec3 vDir;
          void main() {
            gl_FragColor = textureCube(map, vDir);
            #include <colorspace_fragment>
          }`,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
      }),
    );
    // Bake on first use, when a renderer is at hand (a nested render, as THREE's Reflector does).
    this.sphere.onBeforeRender = (renderer) => {
      if (this.baked) return;
      this.baked = true;
      this.cubeCamera.update(renderer, this.bakeScene);
    };
    this.sphere.name = 'Galaxy band';
    this.sphere.frustumCulled = false;
    this.sphere.renderOrder = -3;
    scene.add(this.sphere);

    const rng = new Rng(hashSeed(system.seed, 'bandStars'));
    const positions = bandStarDirections(sky, rng, BAND_STAR_COUNT);
    const colors = new Float32Array(BAND_STAR_COUNT * 3);
    const sizes = new Float32Array(BAND_STAR_COUNT);
    const c = new THREE.Color();
    for (let i = 0; i < BAND_STAR_COUNT; i++) {
      c.setHSL(rng.chance(0.6) ? 0.1 : 0.6, rng.range(0, 0.4), 1).multiplyScalar(rng.range(0.05, 0.3));
      c.toArray(colors, i * 3);
      sizes[i] = rng.range(1, 2.2);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: { pixelRatio: { value: 1 }, brightness: { value: galaxyBandParams.stars } },
      vertexShader: STARS_VERTEX,
      fragmentShader: STARS_FRAGMENT,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.stars = new THREE.Points(starGeometry, starMaterial);
    this.stars.name = 'Galaxy band stars';
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -2;
    this.stars.onBeforeRender = (renderer) => {
      starMaterial.uniforms.pixelRatio!.value = renderer.getPixelRatio();
    };
    scene.add(this.stars);

    const f = debug.folder('Galaxy band');
    if (f) {
      const u = this.bakeMaterial.uniforms;
      const rebake = (name: string) => (v: number) => {
        u[name]!.value = v;
        this.baked = false;
      };
      f.add(galaxyBandParams, 'brightness', 0, 1).onChange(rebake('brightness'));
      f.add(galaxyBandParams, 'bulge', 0, 1).onChange(rebake('bulgeBrightness'));
      f.add(galaxyBandParams, 'dust', 0, 1).onChange(rebake('dust'));
      f.add(galaxyBandParams, 'stars', 0, 3).onChange((v: number) => (starMaterial.uniforms.brightness!.value = v));
    }
  }

  dispose(): void {
    this.scene.remove(this.sphere, this.stars);
    this.sphere.geometry.dispose();
    this.sphere.material.dispose();
    this.bakeMaterial.dispose();
    this.target.dispose();
    this.stars.geometry.dispose();
    this.stars.material.dispose();
  }
}

/** Rotation-only view: the sky is at infinity, whatever the camera's position. */
const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
  }`;

const BAND_FRAGMENT = /* glsl */ `
  #define PI 3.14159265
  #define N ${BAND_SAMPLES}
  uniform vec3 north;
  uniform vec3 center;
  uniform vec3 east;
  // Per longitude sample: brightness, width (σ of latitude), offset of the midline.
  uniform vec3 band[N];
  uniform float bulgeLat;
  uniform float bulgeSize;
  uniform vec3 discColor;
  uniform vec3 bulgeColor;
  uniform float brightness;
  uniform float bulgeBrightness;
  uniform float dust;
  uniform float seed;
  varying vec3 vDir;

  ${VALUE_NOISE_GLSL}

  void main() {
    vec3 v = normalize(vDir);
    float lat = asin(clamp(dot(v, north), -1.0, 1.0));
    float lon = atan(dot(v, east), dot(v, center));

    float f = mod(lon, 2.0 * PI) / (2.0 * PI) * float(N);
    int i0 = int(mod(floor(f), float(N)));
    vec3 s = mix(band[i0], band[(i0 + 1) % N], fract(f));

    float y = (lat - s.z) / s.y;
    float disc = brightness * pow(s.x, 0.8) * exp(-0.5 * y * y);
    float bx = lon * cos(lat) / bulgeSize;
    float by = (lat - bulgeLat) / (bulgeSize * ${BULGE_FLATTENING.toFixed(2)});
    float bulge = bulgeBrightness * exp(-0.5 * (bx * bx + by * by));
    float total = disc + bulge;
    vec3 color = mix(discColor, bulgeColor, bulge / max(total, 1e-6));

    // Star clouds and dust lanes fade in where the band is bright enough to
    // show them; the faint outskirts are the smooth glow alone, which saves
    // the noise over most of the sky without leaving an edge.
    float detail = smoothstep(0.004, 0.015, total);
    if (detail > 0.0) {
      // Noise coordinates running along the band (continuous all the way round),
      // finer across it, so clouds and lanes are drawn out along the plane.
      vec3 q = vec3(cos(lon) * 2.5, sin(lon) * 2.5, lat * 9.0) + seed;
      float clouds = fbm(q * 1.7, 5);
      float lanes = smoothstep(0.42, 0.62, fbm(q + 7.3, 5));
      // The lanes hug the midline, like the Great Rift.
      float y2 = y / 0.6;
      float mid = exp(-0.5 * y2 * y2);
      total *= mix(1.0, (0.55 + 0.9 * clouds) * (1.0 - dust * lanes * mid), detail);
    }

    gl_FragColor = vec4(color * total, 1.0);
    #include <colorspace_fragment>
  }`;

const STARS_VERTEX = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  uniform float pixelRatio;
  varying vec3 vColor;
  void main() {
    vColor = color;
    gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0)).xyww;
    gl_PointSize = size * pixelRatio;
  }`;

const STARS_FRAGMENT = /* glsl */ `
  uniform float brightness;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor * brightness * (1.0 - d * d), 1.0);
    #include <colorspace_fragment>
  }`;
