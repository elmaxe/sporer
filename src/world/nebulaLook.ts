import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import {
  EMISSION_CORE,
  EMISSION_CORE_SIZE,
  MAX_BLOBS,
  NEBULA_K,
  PLANETARY_INNER_RADIUS,
  PLANETARY_INNER_WEIGHT,
  PLANETARY_INNER_WIDTH,
  dimsStars,
  type NebulaData,
  type NebulaKind,
  type NebulaShape,
} from '../gen/nebulas';
import { GAUSSIAN_K, GAUSSIAN_PATH_GLSL, glowDensity } from '../galaxy/glowVolume';
import type { GalaxyGlow } from '../galaxy/appearance';
import { cloudNoiseTexture } from './noiseTexture';

export const nebulaParams = {
  /** Overall brightness of the glowing gas (the galaxy map and every system's sky alike). */
  brightness: 1.6,
};

/** Ray-march steps through a nebula's bounding sphere on the map (dithered per pixel), and when baked into a sky (once, so more, not dithered). */
const MAP_STEPS = 40;
const BAKE_STEPS = 96;
/**
 * The cavity a hot star's wind blows round itself in an emission or
 * reflection nebula (the Rosette's "hole in the heart"): the gas is thinned
 * by 1 − CAVITY_DEPTH·exp(−s² / CAVITY_SIZE), s the distance from the star in
 * local units. Seen from its star, the sky is the glowing walls, not a fog.
 */
const CAVITY_DEPTH = 0.95;
const CAVITY_SIZE = 0.02;
/** The hull (an icosphere, whose faces cut inside the sphere through its vertices) is this much bigger, so it holds the unit sphere. */
const HULL_SCALE = 1.06;

/** Glow volumes a nebula can sit behind (the galaxy map's disc and bulge). */
const MAX_GLOWS = 2;

/**
 * The galaxy's glow volumes round a nebula on the map (see createGlowVolume),
 * so a nebula only dims the glow behind it: the glow between the camera and
 * where its dust absorbs is added back in. Glow nearer the camera than
 * `near` doesn't shine, as on the map.
 */
export interface NebulaGlows {
  glows: readonly GalaxyGlow[];
  near: number;
}

const KIND_IDS: Record<NebulaKind, number> = { emission: 0, reflection: 1, dark: 2, planetary: 3, remnant: 4 };
const SHAPE_IDS: Record<NebulaShape, number> = { clouds: 0, shell: 1, ring: 2, bipolar: 3 };

/**
 * Blending for a nebula: its light is added, and what's behind it is dimmed
 * by its transmittance (alpha): rgb = src.rgb + dst.rgb · src.a, and the
 * target's alpha is multiplied too (a baked sky keeps the transmittance there).
 */
export function applyNebulaBlending(material: THREE.Material): void {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.SrcAlphaFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.SrcAlphaFactor;
  material.transparent = true;
  material.depthWrite = false;
}

/**
 * A nebula (gen/nebulas.ts) as a volume: a hull round its bounding sphere,
 * whose fragment shader marches the view ray through it, adding the light of
 * the gas and dimming by its dust. The density is the generator's smooth
 * model (Gaussian blobs, or a shell) times structure from the shared 3D
 * noise texture, so it looks right from any side and from inside. Its
 * geometry is in the nebula's frame (radius 1): place it with `position`,
 * `quaternion` = the orientation and `scale` = the radius, in galaxy units
 * (the galaxy map) or in galaxy units round a system's star (its sky bake).
 */
export function createNebulaMesh(
  n: NebulaData,
  /** 'map': dithered, for every frame; 'bake': finer, drawn once into a sky. */
  quality: 'map' | 'bake' = 'map',
  /**
   * The galaxy glows the nebula is seen through (the map). Its output is then
   * in the canvas's colour space (sRGB), like the glow it is blended over,
   * and the glow in front of its dust is added to its light.
   */
  glows?: NebulaGlows,
): THREE.Mesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial> {
  const blobs = Array.from({ length: MAX_BLOBS }, (_, i) => {
    const b = n.blobs[i];
    return b ? new THREE.Vector4(b.center.x, b.center.y, b.center.z, b.weight) : new THREE.Vector4();
  });
  const radii = Array.from({ length: MAX_BLOBS }, (_, i) => {
    const b = n.blobs[i];
    return b ? new THREE.Vector3(b.radii.x, b.radii.y, b.radii.z) : new THREE.Vector3(1, 1, 1);
  });
  const shell = n.shell
    ? new THREE.Vector4(n.shell.axes.x, n.shell.axes.y, n.shell.axes.z, n.shell.width)
    : new THREE.Vector4(1, 1, 1, 1);
  const camera = new THREE.Vector3();
  const glowList = glows?.glows.slice(0, MAX_GLOWS) ?? [];
  const glowRadii = Array.from({ length: MAX_GLOWS }, (_, i) => {
    const g = glowList[i];
    return g ? new THREE.Vector3(g.radii.x, g.radii.y, g.radii.z) : new THREE.Vector3(1, 1, 1);
  });
  // Colour times the brightness it saturates at (linear), and the density.
  const glowColors = Array.from({ length: MAX_GLOWS }, (_, i) => {
    const g = glowList[i];
    return g ? new THREE.Color(g.color).multiplyScalar(g.maxBrightness) : new THREE.Color(0);
  });
  const glowDensities = Array.from({ length: MAX_GLOWS }, (_, i) => {
    const g = glowList[i];
    return g ? glowDensity(g.radii.y, g.faceOnOpacity, g.maxBrightness) : 0;
  });
  const defines: Record<string, number> = quality === 'bake' ? { STEPS: BAKE_STEPS } : { STEPS: MAP_STEPS, DITHER: 1 };
  if (glows) defines.FRONT_GLOW = 1;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uNoise: { value: cloudNoiseTexture() },
      uCamera: { value: camera },
      uKind: { value: KIND_IDS[n.kind] },
      uShape: { value: SHAPE_IDS[n.shape] },
      uBlobCount: { value: Math.min(n.blobs.length, MAX_BLOBS) },
      uBlobs: { value: blobs },
      uBlobRadii: { value: radii },
      uShell: { value: shell },
      uStar: { value: new THREE.Vector3(n.starLocal.x, n.starLocal.y, n.starLocal.z) },
      uColor: { value: new THREE.Color(n.colors[0]) },
      uColor2: { value: new THREE.Color(n.colors[1]) },
      uGlow: { value: n.glow },
      uDust: { value: n.dust },
      uNoiseScale: { value: n.noiseScale },
      uNoiseOffset: { value: new THREE.Vector3(n.noiseOffset.x, n.noiseOffset.y, n.noiseOffset.z) },
      uBrightness: { value: nebulaParams.brightness },
      // Nebula frame → galaxy coordinates: position, rotation and radius (the frame's unit).
      uOrigin: { value: new THREE.Vector3(n.position.x, n.position.y, n.position.z) },
      uRotation: {
        value: new THREE.Matrix3().setFromMatrix4(
          new THREE.Matrix4().makeRotationFromQuaternion(
            new THREE.Quaternion(n.orientation.x, n.orientation.y, n.orientation.z, n.orientation.w),
          ),
        ),
      },
      uRadius: { value: n.radius },
      uGlowCount: { value: glowList.length },
      uGlowRadii: { value: glowRadii },
      uGlowColors: { value: glowColors },
      uGlowDensities: { value: glowDensities },
      uGlowNear: { value: glows?.near ?? 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    defines,
    fragmentShader: NEBULA_FRAGMENT,
    // Back faces cover the nebula whether the camera is outside or inside it.
    side: THREE.BackSide,
  });
  applyNebulaBlending(material);

  const geometry = new THREE.IcosahedronGeometry(HULL_SCALE, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = n.name;
  const inverse = new THREE.Matrix4();
  mesh.onBeforeRender = (_renderer, _scene, cam) => {
    // The camera in the nebula's frame (the mesh's local space).
    camera.setFromMatrixPosition(cam.matrixWorld).applyMatrix4(inverse.copy(mesh.matrixWorld).invert());
    material.uniforms.uBrightness!.value = nebulaParams.brightness;
  };
  return mesh;
}

/** Places a nebula mesh at its galaxy position (minus `origin`), turned and sized. */
export function placeNebula(mesh: THREE.Object3D, n: NebulaData, origin?: { x: number; y: number; z: number }): void {
  mesh.position.set(n.position.x - (origin?.x ?? 0), n.position.y - (origin?.y ?? 0), n.position.z - (origin?.z ?? 0));
  mesh.quaternion.set(n.orientation.x, n.orientation.y, n.orientation.z, n.orientation.w);
  mesh.scale.setScalar(n.radius);
}

/** The nebulas' tunables in a debug folder named `name` (one per level: re-requesting a name replaces the folder). */
export function addNebulaDebug(debug: Debug, name: string, onChange?: () => void): ReturnType<Debug['folder']> {
  const f = debug.folder(name);
  f?.add(nebulaParams, 'brightness', 0, 5).onChange(() => onChange?.());
  return f;
}

const NEBULA_FRAGMENT = /* glsl */ `
  precision highp sampler3D;
  #define MAX_BLOBS ${MAX_BLOBS}
  #define K ${NEBULA_K.toFixed(2)}
  uniform sampler3D uNoise;
  uniform vec3 uCamera;
  uniform int uKind;
  uniform int uShape;
  uniform int uBlobCount;
  uniform vec4 uBlobs[MAX_BLOBS];
  uniform vec3 uBlobRadii[MAX_BLOBS];
  uniform vec4 uShell;
  uniform vec3 uStar;
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uGlow;
  uniform float uDust;
  uniform float uNoiseScale;
  uniform vec3 uNoiseOffset;
  uniform float uBrightness;
  varying vec3 vLocal;

  #ifdef FRONT_GLOW
    #define MAX_GLOWS ${MAX_GLOWS}
    uniform vec3 uOrigin;
    uniform mat3 uRotation;
    uniform float uRadius;
    uniform int uGlowCount;
    uniform vec3 uGlowRadii[MAX_GLOWS];
    uniform vec3 uGlowColors[MAX_GLOWS];
    uniform float uGlowDensities[MAX_GLOWS];
    uniform float uGlowNear;
    ${GAUSSIAN_PATH_GLSL}

    // The galaxy's glows along the ray from the camera (o, d in the nebula's frame) to 't'
    // (frame units), each as it appears on the canvas (galaxy/glowVolume.ts, sRGB-encoded).
    vec3 frontGlow(vec3 o, vec3 d, float t) {
      vec3 og = uOrigin + uRotation * (o * uRadius);
      vec3 dg = uRotation * d;
      float far = t * uRadius;
      vec3 sum = vec3(0.0);
      if (far <= uGlowNear) return sum;
      for (int i = 0; i < MAX_GLOWS; i++) {
        if (i >= uGlowCount) break;
        vec3 oo = og / uGlowRadii[i];
        vec3 dd = dg / uGlowRadii[i];
        float path = gaussianPath(oo, dd, ${GAUSSIAN_K.toFixed(1)}, uGlowNear) - gaussianPath(oo, dd, ${GAUSSIAN_K.toFixed(1)}, far);
        vec3 glow = uGlowColors[i] * (1.0 - exp(-uGlowDensities[i] * max(path, 0.0)));
        sum += sRGBTransferOETF(vec4(glow, 1.0)).rgb;
      }
      return sum;
    }
  #endif

  // gen/nebulas.ts: shellRadius and bipolarReach.
  float shellRadius(vec3 p) {
    vec3 q = p / uShell.xyz;
    float r = length(q);
    if (uShape != 3 || r < 1e-5) return r;
    return r / (0.4 + 0.6 * pow(abs(q.y) / r, 0.8));
  }

  // gen/nebulas.ts: nebulaDensity (the smooth model).
  float smoothDensity(vec3 p, out float shellR) {
    shellR = 0.0;
    if (uShape == 0) {
      float sum = 0.0;
      for (int i = 0; i < MAX_BLOBS; i++) {
        if (i >= uBlobCount) break;
        vec3 x = (p - uBlobs[i].xyz) / uBlobRadii[i];
        sum += uBlobs[i].w * exp(-K * dot(x, x));
      }
      return sum;
    }
    shellR = shellRadius(p);
    float u = (shellR - 1.0) / uShell.w;
    float d = exp(-0.5 * u * u);
    if (uShape == 2) {
      float y = p.y / uShell.y / 0.3;
      d *= 0.3 + 1.2 * exp(-0.5 * y * y);
    }
    return d;
  }

  void main() {
    vec3 o = uCamera;
    vec3 d = normalize(vLocal - uCamera);
    // The part of the ray inside the unit sphere.
    float b = dot(o, d);
    float h = b * b - (dot(o, o) - 1.0);
    if (h <= 0.0) discard;
    h = sqrt(h);
    float t0 = max(-b - h, 0.0);
    float t1 = -b + h;
    if (t1 <= t0) discard;
    // A fixed step (the sphere's diameter over STEPS), so rays through a nebula's edge take fewer.
    float dt = 2.0 / float(STEPS);
    #ifdef DITHER
      // Interleaved gradient noise: a fixed per-pixel offset hides the steps' banding.
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    #else
      float jitter = 0.5;
    #endif

    vec3 light = vec3(0.0);
    float transmit = 1.0;
    // Where along the ray the dust absorbs, weighted by how much it takes out.
    float absorbed = 0.0;
    float absorbedT = 0.0;
    for (int i = 0; i < STEPS; i++) {
      float t = t0 + (float(i) + jitter) * dt;
      if (t > t1 || transmit < 0.01) break;
      vec3 p = o + d * t;
      float shellR;
      float base = smoothDensity(p, shellR);
      // A planetary nebula's thick inner zone of O III inside its Hα rim (gen/nebulas.ts planetaryInner).
      float inner = 0.0;
      if (uKind == 3) {
        float u = (shellR - ${PLANETARY_INNER_RADIUS.toFixed(2)}) / (uShell.w * ${PLANETARY_INNER_WIDTH.toFixed(2)});
        inner = ${PLANETARY_INNER_WEIGHT.toFixed(2)} * exp(-0.5 * u * u);
      }
      if (base + inner < 0.003) continue;
      vec3 q = p * uNoiseScale + uNoiseOffset;
      vec2 n = texture(uNoise, q).rg;
      float structure;
      vec3 color = uColor;
      float lit = 1.0;
      if (uKind == 4) {
        // Supernova remnant: thin, bright filaments (ridged noise, mean 1), red and teal.
        float ridge = 1.0 - abs(2.0 * n.r - 1.0);
        structure = 9.0 * pow(ridge, 8.0) * (0.5 + n.g);
        color = mix(uColor, uColor2, smoothstep(0.35, 0.65, texture(uNoise, q * 0.5 + 0.31).r));
      } else if (uKind == 3) {
        // Planetary nebula: teal O III inside, red Hα round the rim, a little knotty.
        structure = 0.55 + 0.9 * (0.7 * n.r + 0.3 * n.g);
        color = (uColor * base + uColor2 * inner) / (base + inner);
        base += inner;
      } else {
        // Clumps and wisps (mean ~1): most of the light from a minority of the gas.
        float c = 0.7 * n.r + 0.3 * n.g;
        structure = 4.0 * c * c * c;
        float s2 = dot(p - uStar, p - uStar);
        if (uKind < 2) base *= 1.0 - ${CAVITY_DEPTH.toFixed(2)} * exp(-s2 / ${CAVITY_SIZE.toFixed(3)});
        if (uKind == 0) {
          // The hot O III core round the star; brighter nearer it.
          color = mix(uColor, uColor2, ${EMISSION_CORE.toFixed(2)} * exp(-s2 / ${EMISSION_CORE_SIZE.toFixed(3)}));
          lit = 0.5 + exp(-s2 / 0.15);
        } else if (uKind == 1) {
          // Starlight scattered by dust: bright by the star, whiter right next to it.
          color = mix(uColor, uColor2, exp(-s2 / 0.02));
          lit = 0.3 + 1.5 * exp(-s2 / 0.08);
        }
      }
      float density = base * structure;
      light += transmit * color * (uGlow * lit * density * dt);
      // Dust: in emission nebulas lanes and pillars of its own, elsewhere it follows the gas.
      float dust = uKind == 0 ? smoothstep(0.45, 0.75, texture(uNoise, q * 1.7 + 0.53).r) * 2.5 : structure;
      float taken = transmit * (1.0 - exp(-uDust * base * dust * dt));
      absorbed += taken;
      absorbedT += taken * t;
      transmit -= taken;
    }
    // Soft saturation on the brightest channel, so the brightest parts level off in their own colour.
    float peak = max(max(light.r, light.g), light.b);
    light *= (1.0 - exp(-peak * uBrightness)) / max(peak, 1e-6);
    #ifdef FRONT_GLOW
      // Blended over the canvas's glow (dst · transmit), so the glow in front of the
      // dust is put back: front + behind · transmit, all as the canvas holds it.
      float depth = absorbed > 1e-4 ? absorbedT / absorbed : t0;
      vec3 front = frontGlow(o, d, depth);
      gl_FragColor = vec4(sRGBTransferOETF(vec4(light, 1.0)).rgb + front * (1.0 - transmit), transmit);
    #else
      gl_FragColor = vec4(light, transmit);
      #include <colorspace_fragment>
    #endif
  }`;

/** Dark nebulas' blobs dimming the galaxy map's stars at most (the star shader's slots). */
export const MAX_DIM_BLOBS = 32;

/**
 * Uniforms for `starDimming` (STAR_DIMMING_GLSL): every blob of the dark
 * nebulas as its centre in galaxy space with its optical depth scale (w),
 * and the matrix taking a galaxy-space offset into the blob's unit space.
 */
export function starDimmingUniforms(nebulas: readonly NebulaData[]): {
  uDimCount: { value: number };
  uDimBlobs: { value: THREE.Vector4[] };
  uDimMatrices: { value: THREE.Matrix3[] };
} {
  const centres: THREE.Vector4[] = [];
  const matrices: THREE.Matrix3[] = [];
  const q = new THREE.Quaternion();
  const m4 = new THREE.Matrix4();
  const c = new THREE.Vector3();
  for (const n of nebulas) {
    if (!dimsStars(n)) continue;
    q.set(n.orientation.x, n.orientation.y, n.orientation.z, n.orientation.w);
    for (const b of n.blobs) {
      if (centres.length >= MAX_DIM_BLOBS) break;
      c.set(b.center.x, b.center.y, b.center.z).multiplyScalar(n.radius).applyQuaternion(q);
      // Optical depth per unit of the blob's column in galaxy units (the model integrates in local units).
      centres.push(new THREE.Vector4(n.position.x + c.x, n.position.y + c.y, n.position.z + c.z, (n.dust * b.weight) / n.radius));
      // Galaxy offset → nebula frame (inverse rotation) → blob unit space.
      m4.makeRotationFromQuaternion(q).invert();
      const m = new THREE.Matrix3().setFromMatrix4(m4);
      const s = new THREE.Matrix3().set(
        1 / (b.radii.x * n.radius), 0, 0,
        0, 1 / (b.radii.y * n.radius), 0,
        0, 0, 1 / (b.radii.z * n.radius),
      );
      matrices.push(s.multiply(m));
    }
  }
  const count = centres.length;
  while (centres.length < MAX_DIM_BLOBS) centres.push(new THREE.Vector4());
  while (matrices.length < MAX_DIM_BLOBS) matrices.push(new THREE.Matrix3());
  return { uDimCount: { value: count }, uDimBlobs: { value: centres }, uDimMatrices: { value: matrices } };
}

/**
 * GLSL: `starDimming(from, to)`, the share of a star's light that reaches
 * `from` through the dark nebulas (gen/nebulas.ts's starTransmittance, in
 * closed form per blob, without the noise).
 */
export const STAR_DIMMING_GLSL = /* glsl */ `
  #define MAX_DIM_BLOBS ${MAX_DIM_BLOBS}
  uniform int uDimCount;
  uniform vec4 uDimBlobs[MAX_DIM_BLOBS];
  uniform mat3 uDimMatrices[MAX_DIM_BLOBS];

  float erfcDim(float x) {
    float z = abs(x);
    float t = 1.0 / (1.0 + 0.3275911 * z);
    float y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    float r = y * exp(-z * z);
    return x >= 0.0 ? r : 2.0 - r;
  }

  float starDimming(vec3 from, vec3 to) {
    if (uDimCount == 0) return 1.0;
    vec3 ray = to - from;
    float len = length(ray);
    vec3 dir = ray / max(len, 1e-6);
    float depth = 0.0;
    for (int i = 0; i < MAX_DIM_BLOBS; i++) {
      if (i >= uDimCount) break;
      vec3 o = uDimMatrices[i] * (from - uDimBlobs[i].xyz);
      vec3 d = uDimMatrices[i] * dir;
      float a = dot(d, d);
      float m = dot(o, d) / a;
      float perp2 = max(dot(o, o) - m * m * a, 0.0);
      float ka = ${NEBULA_K.toFixed(2)} * a;
      float scale = exp(-${NEBULA_K.toFixed(2)} * perp2) * 0.886226925 / sqrt(ka);
      // The column between 'from' and the star: from 0 to len along the ray.
      float column = scale * (erfcDim(sqrt(ka) * m) - erfcDim(sqrt(ka) * (m + len)));
      depth += uDimBlobs[i].w * column;
    }
    return exp(-depth);
  }
`;

/**
 * The glowing sky of a system near or inside nebulas: those nebulas drawn
 * from the star's place in the galaxy, baked once into a cube map (their
 * light in rgb, their transmittance in alpha) and drawn over the galaxy band
 * each frame with the same blending as on the galaxy map (the band behind a
 * dark nebula is dimmed). Stars drawn after it (the band's stars and the
 * SkyStars) are dimmed on the CPU instead (gen/nebulas.ts starTransmittance).
 */
export class NebulaSkyBake {
  readonly texture: THREE.CubeTexture;
  private readonly scene = Object.assign(new THREE.Scene(), { name: 'Nebula sky bake' });
  private readonly target: THREE.WebGLCubeRenderTarget;
  private readonly camera: THREE.CubeCamera;
  private readonly meshes: THREE.Mesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial>[];
  private readonly clear = new THREE.Color();

  constructor(
    nebulas: readonly NebulaData[],
    /** The star's galaxy position. */
    origin: { x: number; y: number; z: number },
    /** Galaxy space → system space. */
    toSystem: THREE.Quaternion,
    size: number,
  ) {
    this.target = new THREE.WebGLCubeRenderTarget(size, { generateMipmaps: false });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture = this.target.texture;
    // Near enough for a planetary nebula round the star, far enough for any in the galaxy.
    this.camera = new THREE.CubeCamera(0.01, 5000, this.target);
    const group = new THREE.Group();
    group.quaternion.copy(toSystem);
    this.scene.add(group);
    this.meshes = nebulas.map((n) => {
      const mesh = createNebulaMesh(n, 'bake');
      placeNebula(mesh, n, origin);
      group.add(mesh);
      return mesh;
    });
    this.scene.updateMatrixWorld(true);
  }

  /** Face size of the cube map. */
  get size(): number {
    return this.target.width;
  }

  /** Renders the cube map (a nested render; call it from an onBeforeRender). */
  bake(renderer: THREE.WebGLRenderer): void {
    renderer.getClearColor(this.clear);
    const alpha = renderer.getClearAlpha();
    // Nothing behind: black, fully transmitting.
    renderer.setClearColor(0x000000, 1);
    this.camera.update(renderer, this.scene);
    renderer.setClearColor(this.clear, alpha);
  }

  /**
   * The baked sky's mean light (0–1, rgb averaged) and transmittance over all
   * six faces, sampled every `stride` texels (tests: does the sky differ?).
   */
  stats(renderer: THREE.WebGLRenderer, stride = 8): { light: number; transmittance: number } {
    const size = this.target.width;
    const px = new Uint8Array(size * size * 4);
    let light = 0;
    let transmittance = 0;
    let n = 0;
    for (let face = 0; face < 6; face++) {
      renderer.readRenderTargetPixels(this.target, 0, 0, size, size, px, face);
      for (let y = 0; y < size; y += stride) {
        for (let x = 0; x < size; x += stride) {
          const i = 4 * (y * size + x);
          light += (px[i]! + px[i + 1]! + px[i + 2]!) / (3 * 255);
          transmittance += px[i + 3]! / 255;
          n++;
        }
      }
    }
    return { light: light / n, transmittance: transmittance / n };
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.target.dispose();
  }
}
