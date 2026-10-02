import * as THREE from 'three';
import {
  DEBRIS_CHUNKS,
  ROCK,
  blastParams,
  crustTemperature,
  debrisPalette,
  debrisParams,
  debrisPosition,
  debrisThrow,
  dropletTemperature,
  generateDebris,
  generateVapour,
  glowBrightness,
  glowColor,
  hotArea,
  vapourState,
  type DebrisChunk,
  type DebrisLook,
} from '../gen/debris';
import type { PlanetStyle } from '../gen/planets';
import { Rng } from '../gen/rng';
import type { AtmosphereSun } from './atmosphereShell';
import { createGlowTexture } from './glowTexture';
import { SIMPLEX_GLSL } from './noiseGlsl';

/** What a field is drawn with: how many rocks, dust motes and vapour puffs, and how much bigger than true the rocks are. */
export interface DebrisDetail {
  chunks: number;
  motes: number;
  puffs: number;
  /** Rocks drawn this many times their size (the system view's few stand for many). */
  chunkScale: number;
  /** A dust mote's size, in the body's radii. */
  moteSize: number;
}

/** Low orbit: the full field. */
export const DEBRIS_NEAR: DebrisDetail = { chunks: DEBRIS_CHUNKS, motes: 5000, puffs: 140, chunkScale: 1, moteSize: 0.012 };
/** The system view: the biggest rocks, a little larger, and thinner dust and vapour. */
export const DEBRIS_FAR: DebrisDetail = { chunks: 220, motes: 1200, puffs: 70, chunkScale: 1.7, moteSize: 0.03 };

export const debrisLookParams = {
  /** How bright the glowing melt is (× its blackbody brightness, see glowBrightness). */
  melt: 1.1,
  /** How bright the hot crust glows (dull red at its floor; brighter while fresh and near the fissures). */
  crust: 0.22,
  /** The faint glow round a molten field (its fissures lighting its dust), and how much brighter it starts. */
  haze: 0.12,
  hazeStart: 1.5,
  /** How much the fissures throb (the melt welling up), and how fast, radians per second. */
  pulse: 0.3,
  pulseRate: 0.9,
  /** How bright glowing droplets and the vapour are. */
  droplets: 2.5,
  vapour: 1.6,
  /** The vapour puffs' opacity at full density. */
  vapourOpacity: 0.55,
};

/** Quenched melt crusts over black, like fresh basaltic glass; the core's pieces are iron. */
const CRUST = new THREE.Color('#3a3431');
const IRON = new THREE.Color('#5e6066');
/** Earth's core radius over its radius (3485 / 6371 km, NASA): rocks from deeper than this are the core's. */
const CORE_FRACTION = 0.547;
/** Points never draw bigger than this many pixels across. */
const MAX_MOTE_PIXELS = 48;
const MAX_PUFF_PIXELS = 280;
/** The vapour puffs' billows, baked once (pixels a side). */
const PUFF_TEXTURE_SIZE = 64;

/** Premultiplied alpha: the colour is lit dust times its opacity plus light it gives off. */
const PREMULTIPLIED = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
} as const;

/** Where a piece is (as gen/debris.ts debrisPosition, in the vertex shader). */
const THROW_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uThrowTime;
  uniform float uSwirl;
  uniform float uFlatten;
  vec3 thrown(vec3 dir, float from, float to, float pace) {
    float e = uTime <= 0.0 ? 0.0 : 1.0 - exp(-uTime * pace / uThrowTime);
    float r = mix(from, to, e);
    float a = uTime <= 0.0 ? 0.0 : uSwirl * uTime / pow(max(to, 0.2), 1.5);
    float c = cos(a);
    float s = sin(a);
    vec3 p = dir * r;
    return vec3(c * p.x + s * p.z, p.y * uFlatten, -s * p.x + c * p.z);
  }
`;

const DUST_VERTEX = /* glsl */ `
  attribute vec4 aPiece; // from, to, pace, shade
  attribute float aDroplet;
  uniform float uRadius;
  uniform float uSize;
  uniform float uScale;
  uniform float uMaxPixels;
  uniform vec3 uSun;
  varying float vLight;
  varying float vShade;
  varying float vDroplet;
  ${THROW_GLSL}
  void main() {
    vec3 p = thrown(position, aPiece.x, aPiece.y, aPiece.z) * uRadius;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uTime <= 0.0 ? 0.0 : min(uMaxPixels, uSize * uScale / max(-mv.z, 1e-3));
    // Lit from the sun's side of the cloud, a little all round (it scatters).
    vLight = 0.35 + 0.65 * max(0.0, dot(normalize(position + 1e-4), uSun));
    vShade = aPiece.w;
    vDroplet = aDroplet;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uDropGlow;
  uniform float uOpacity;
  varying float vLight;
  varying float vShade;
  varying float vDroplet;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float f = 1.0 - smoothstep(0.15, 0.5, length(d));
    if (f <= 0.0) discard;
    float a = f * uOpacity;
    // Molten droplets glow as they cool; the rest is dust in the sunlight.
    vec3 glow = uDropGlow * vDroplet * f;
    gl_FragColor = vec4(uColor * vLight * vShade * a + glow, a);
  }
`;

const VAPOUR_VERTEX = /* glsl */ `
  attribute vec4 aPuff; // distance, size, shade, seed
  uniform float uRadius;
  uniform float uSize;
  uniform float uFlatten;
  uniform float uScale;
  uniform float uMaxPixels;
  uniform vec3 uSun;
  uniform vec3 uTints[4];
  varying float vLight;
  varying vec3 vTint;
  varying float vSeed;
  void main() {
    vec3 p = position * aPuff.x * uSize;
    p.y *= uFlatten;
    vec4 mv = modelViewMatrix * vec4(p * uRadius, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(uMaxPixels, aPuff.y * uSize * uRadius * 2.0 * uScale / max(-mv.z, 1e-3));
    vLight = 0.3 + 0.7 * max(0.0, dot(normalize(position + 1e-4), uSun));
    vTint = uTints[int(aPuff.z)];
    vSeed = aPuff.w;
  }
`;

const VAPOUR_FRAGMENT = /* glsl */ `
  uniform vec3 uGlow;
  uniform float uDensity;
  uniform sampler2D uBillows;
  varying float vLight;
  varying vec3 vTint;
  varying float vSeed;
  void main() {
    // The baked billows, turned and flipped by the puff's seed so no two look alike.
    vec2 d = gl_PointCoord - 0.5;
    float c = cos(vSeed);
    float s = sin(vSeed);
    vec2 uv = vec2(c * d.x - s * d.y, s * d.x + c * d.y) * (mod(vSeed, 2.0) > 1.0 ? -1.0 : 1.0) + 0.5;
    float a = texture2D(uBillows, uv).r * uDensity;
    if (a <= 0.002) discard;
    gl_FragColor = vec4(vTint * vLight * a + uGlow * a, a);
  }
`;

/**
 * A busted body's debris field (gen/debris.ts, docs/research/shattered-planets.md),
 * as hot as the blast left it (`DebrisLook`): its rocks as one instanced mesh,
 * molten skins crusting over black within seconds while fissures keep glowing
 * (the inside stays molten for millions of years), the core's pieces iron grey;
 * its dust as one `Points`, a share of it molten droplets that glow and cool;
 * and, when part of it vaporised (all of a giant), a cloud of glowing vapour
 * that spreads, cools and condenses away (a giant's gas lingers as a thin
 * cloud). Everything moves in the shaders or from `animate(t)`, `t` seconds
 * after the blast (hidden before it), so both views show the same field at the
 * same moment. Centred on its group's origin, in units of `radius`.
 */
export class DebrisField {
  readonly object = new THREE.Group();
  private readonly chunks: readonly DebrisChunk[];
  private readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly dust: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly vapour: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | null;
  private readonly billows: THREE.DataTexture | null = null;
  /** The rocks' fissures: how wide (from the hot area) and how they glow. */
  private readonly crack = { value: 0 };
  private readonly crackGlow = { value: new THREE.Color(0, 0, 0) };
  private readonly crustGlow = { value: new THREE.Color(0, 0, 0) };
  private readonly pulse = { value: new THREE.Vector2(0, 0) };
  /** A soft glow round a molten field. */
  private readonly haze: THREE.Sprite | null;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly sunDir = new THREE.Vector3();
  private readonly worldRotation = new THREE.Quaternion();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly drawSize = new THREE.Vector2();
  private readonly rgb: [number, number, number] = [0, 0, 0];
  private readonly chunkScale: number;
  private shown = false;

  constructor(
    seed: number,
    style: PlanetStyle,
    bands: readonly string[] | null | undefined,
    private readonly radius: number,
    detail: DebrisDetail,
    /** Where the light comes from (a star's position, or a direction), for the dust's lit side. */
    private readonly sun: AtmosphereSun | null,
    /** How hot the blast left it. */
    private readonly look: DebrisLook,
  ) {
    // Whatever vaporised isn't rubble: fewer rocks the more of it went, none of a giant.
    const rocks = look.gas ? 0 : Math.round(detail.chunks * (1 - 0.7 * look.vapour));
    const data = generateDebris(seed, rocks, detail.motes);
    this.chunks = data.chunks;
    this.chunkScale = detail.chunkScale;
    const palette = debrisPalette(style, bands).map((c) => new THREE.Color(c));

    const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95, metalness: 0 });
    this.addFissures(material);
    this.mesh = new THREE.InstancedMesh(rockGeometry(seed), material, Math.max(1, this.chunks.length));
    this.mesh.count = this.chunks.length;
    this.mesh.name = 'Debris';
    // The rocks move far from where the mesh's bounds were taken.
    this.mesh.frustumCulled = false;
    const rng = new Rng(hashOf(seed));
    const glow = new Float32Array(Math.max(1, this.chunks.length) * 2);
    const color = new THREE.Color();
    this.chunks.forEach((c, i) => {
      // `melt` of the rocks melted (where the energy went, they all did): crusted dark, with glowing fissures;
      // the rest stay the body's cold rock. The core's pieces are iron.
      const molten = rng.next() < look.melt;
      const core = !look.gas && c.from / 0.9 < CORE_FRACTION && c.shade === 0;
      color.copy(core ? IRON : palette[c.shade]!);
      if (molten) color.lerp(CRUST, 0.9);
      this.mesh.setColorAt(i, color.multiplyScalar(c.light));
      this.mesh.setMatrixAt(i, this.zero);
      // How wide this rock's fissures are (none on cold rock), and a seed for where they run.
      glow[i * 2] = molten ? rng.range(0.6, 1.4) : 0;
      glow[i * 2 + 1] = rng.range(0, 100);
    });
    this.mesh.geometry.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 2));
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Dust, a share of it molten droplets.
    const motes = data.motes;
    const dir = new Float32Array(motes.length * 3);
    const piece = new Float32Array(motes.length * 4);
    const droplet = new Float32Array(motes.length);
    motes.forEach((m, i) => {
      dir.set(m.dir, i * 3);
      piece.set([m.from, m.to, m.pace, rng.range(0.55, 1.1)], i * 4);
      droplet[i] = rng.next() < 0.6 * look.melt ? 1 : 0;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(dir, 3));
    geometry.setAttribute('aPiece', new THREE.BufferAttribute(piece, 4));
    geometry.setAttribute('aDroplet', new THREE.BufferAttribute(droplet, 1));
    // Mid-grey between the rock colours, sooty where it melted (condensed melt is dark glass).
    const dustColor = palette
      .reduce((sum, c) => sum.add(c), new THREE.Color(0, 0, 0))
      .multiplyScalar(1 / palette.length)
      .lerp(CRUST, 0.7 * look.melt);
    this.dust = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        uniforms: {
          ...throwUniforms(),
          uRadius: { value: radius },
          uSize: { value: detail.moteSize * radius },
          uScale: { value: 500 },
          uMaxPixels: { value: MAX_MOTE_PIXELS },
          uSun: { value: new THREE.Vector3(0, 1, 0) },
          uColor: { value: dustColor },
          uDropGlow: { value: new THREE.Color(0, 0, 0) },
          uOpacity: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        ...PREMULTIPLIED,
      }),
    );
    this.dust.name = 'Debris dust';
    this.dust.frustumCulled = false;
    this.dust.onBeforeRender = this.pointScale(this.dust.material);
    this.object.add(this.mesh, this.dust);

    // A soft glow round a field that melted (a giant's gas glows on its own).
    this.haze = look.melt > 0.05 && !look.gas ? createHaze() : null;
    if (this.haze) this.object.add(this.haze);

    // The vapour cloud (a giant's gas), tinted like the dust (or the bands).
    if (look.vapour > 0) this.billows = billowTexture(seed);
    this.vapour = this.billows ? this.createVapour(seed, detail.puffs, palette, this.billows) : null;
    if (this.vapour) this.object.add(this.vapour);
  }

  /** Poses the field `t` seconds after the blast (hidden before it). */
  animate(t: number): void {
    const look = this.look;
    const u = this.dust.material.uniforms;
    u.uTime!.value = t;
    // The dust thins out as it spreads.
    u.uOpacity!.value = t <= 0 ? 0 : 0.55 * Math.min(1, t / 0.3) * (0.45 + 0.55 * Math.exp(-t / 20));
    const drop = dropletTemperature(t);
    this.setGlow(u.uDropGlow!.value as THREE.Color, drop, debrisLookParams.droplets * (t > 0 ? 1 : 0));

    // The melt on the molten rocks: all of it glows at first, crusting over to fissures; they show the melt inside, at the triple point.
    const area = hotArea(t, 1);
    // Ridged simplex noise is under w over about 1.4 w of the surface: widths for the hot area.
    this.crack.value = Math.min(1.5, 0.7 * area);
    this.setGlow(this.crackGlow.value, ROCK.triplePoint, debrisLookParams.melt * (area > 0 ? 1 : 0));
    // The crust's own dull glow: bright while fresh, settling to red heat.
    const fresh = Math.exp(-Math.max(0, t) / blastParams.crustTime);
    glowColor(crustTemperature(t), this.rgb);
    this.crustGlow.value.setRGB(this.rgb[0], this.rgb[1], this.rgb[2]).multiplyScalar(t > 0 ? debrisLookParams.crust * (1 + 3 * fresh) : 0);
    this.pulse.value.set(t * debrisLookParams.pulseRate, debrisLookParams.pulse);
    if (this.haze) {
      glowColor(1300 + 900 * fresh, this.rgb);
      this.haze.material.color.setRGB(this.rgb[0], this.rgb[1], this.rgb[2]);
      this.haze.material.opacity = t > 0 ? debrisLookParams.haze * look.melt * (1 + debrisLookParams.hazeStart * fresh) : 0;
      this.haze.scale.setScalar(2 * 1.5 * this.radius * Math.min(1, 0.4 + t / blastParams.crustTime));
    }

    if (this.vapour) {
      const v = this.vapour.material.uniforms;
      const state = vapourState(t, look);
      v.uSize!.value = state.size;
      v.uDensity!.value = Math.min(1, state.density * debrisLookParams.vapourOpacity * 1.6);
      this.setGlow(v.uGlow!.value as THREE.Color, state.temperature, debrisLookParams.vapour);
      this.vapour.visible = state.density > 0.002;
    }
    this.lightUp();

    if (t <= 0) {
      if (this.shown) {
        for (let i = 0; i < this.chunks.length; i++) this.mesh.setMatrixAt(i, this.zero);
        this.mesh.instanceMatrix.needsUpdate = true;
        this.shown = false;
      }
      return;
    }
    this.shown = true;
    const R = this.radius;
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i]!;
      debrisPosition(c, t, this.position).multiplyScalar(R);
      // A burst of tumbling from the blast, then a slow turn forever.
      const angle = c.angle + c.kick * debrisThrow(t, c.pace) + c.spin * t;
      this.axis.set(c.axis[0], c.axis[1], c.axis[2]);
      this.rotation.setFromAxisAngle(this.axis, angle);
      const size = c.size * R * this.chunkScale;
      this.scale.set(c.shape[0] * size, c.shape[1] * size, c.shape[2] * size);
      this.mesh.setMatrixAt(i, this.matrix.compose(this.position, this.rotation, this.scale));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
    this.dust.geometry.dispose();
    this.dust.material.dispose();
    this.vapour?.geometry.dispose();
    this.vapour?.material.dispose();
    this.billows?.dispose();
    this.haze?.material.map?.dispose();
    this.haze?.material.dispose();
  }

  /** `out` = the blackbody colour of `T` K, as bright as it glows, × `strength`. */
  private setGlow(out: THREE.Color, T: number, strength: number): void {
    glowColor(T, this.rgb);
    out.setRGB(this.rgb[0], this.rgb[1], this.rgb[2]).multiplyScalar(strength * glowBrightness(T));
  }

  /**
   * The rocks' glowing fissures: the material's emission is the melt's glow
   * where ridged noise in the rock's own space runs below the crack width,
   * which shrinks as the skin crusts over. Each rock has its own width and
   * pattern (`aGlow`: width, 0 for cold rock, and seed; kept apart, as one packed number decoded per
   * pixel flickered between the two where interpolation nudged it).
   */
  private addFissures(material: THREE.MeshStandardMaterial): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uCrack = this.crack;
      shader.uniforms.uCrackGlow = this.crackGlow;
      shader.uniforms.uCrustGlow = this.crustGlow;
      shader.uniforms.uPulse = this.pulse;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute vec2 aGlow;\nvarying vec3 vRock;\nvarying vec2 vGlow;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = position;\nvGlow = aGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nuniform float uCrack;\nuniform vec3 uCrackGlow;\nuniform vec3 uCrustGlow;\nuniform vec2 uPulse;\nvarying vec3 vRock;\nvarying vec2 vGlow;\n${SIMPLEX_GLSL}`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          {
            float seed = vGlow.y;
            float width = uCrack * vGlow.x;
            // Thin glowing lines where ridged noise crosses zero, never thinner than a pixel so far rocks still glint.
            float n = abs(snoise(vRock * 2.2 + seed * 1.37));
            float wide = max(width, 0.35 * fwidth(n));
            float molten = step(0.001, vGlow.x) * step(0.001, width);
            float crack = 1.0 - smoothstep(0.4 * wide, wide, n);
            // The melt wells up and sinks back: a slow throb, out of step from rock to rock and along each crack.
            float throb = 1.0 - uPulse.y * (0.5 + 0.5 * sin(uPulse.x + seed * 0.37 + dot(vRock, vec3(2.1, 1.3, 1.7))));
            // The crust glows dull red, hotter near the fissures where the heat comes through.
            float nearCrack = 1.0 - smoothstep(0.0, 0.6, n);
            totalEmissiveRadiance += molten * (uCrackGlow * crack * throb + uCrustGlow * (0.35 + 0.65 * nearCrack));
          }`,
        );
    };
    // One program for every debris field (the uniforms are per field).
    material.customProgramCacheKey = () => 'debris-fissures';
  }

  private createVapour(
    seed: number,
    count: number,
    palette: readonly THREE.Color[],
    billows: THREE.Texture,
  ): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
    const puffs = generateVapour(seed, count);
    const dir = new Float32Array(puffs.length * 3);
    const puff = new Float32Array(puffs.length * 4);
    puffs.forEach((p, i) => {
      dir.set(p.dir, i * 3);
      puff.set([p.distance, p.size, p.shade, p.seed], i * 4);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(dir, 3));
    geometry.setAttribute('aPuff', new THREE.BufferAttribute(puff, 4));
    // Rock vapour condenses to grey smoke; a giant's gas keeps its bands' colours.
    const grey = palette.reduce((sum, c) => sum.add(c), new THREE.Color(0, 0, 0)).multiplyScalar(0.5 / palette.length);
    const tints = palette.map((c) => (this.look.gas ? c.clone().multiplyScalar(0.8) : grey.clone()));
    const points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: VAPOUR_VERTEX,
        fragmentShader: VAPOUR_FRAGMENT,
        uniforms: {
          uRadius: { value: this.radius },
          uSize: { value: 1 },
          uFlatten: { value: debrisParams.flatten },
          uScale: { value: 500 },
          uMaxPixels: { value: MAX_PUFF_PIXELS },
          uSun: { value: new THREE.Vector3(0, 1, 0) },
          uTints: { value: tints },
          uGlow: { value: new THREE.Color(0, 0, 0) },
          uDensity: { value: 0 },
          uBillows: { value: billows },
        },
        transparent: true,
        depthWrite: false,
        ...PREMULTIPLIED,
      }),
    );
    points.name = 'Debris vapour';
    points.frustumCulled = false;
    points.visible = false;
    points.onBeforeRender = this.pointScale(points.material);
    return points;
  }

  /** Points are sized in pixels: from the drawing camera's projection. */
  private pointScale(material: THREE.ShaderMaterial): THREE.Object3D['onBeforeRender'] {
    return (renderer, _scene, camera) => {
      const height = renderer.getRenderTarget()?.height ?? renderer.getDrawingBufferSize(this.drawSize).y;
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 65;
      material.uniforms.uScale!.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    };
  }

  /** The sun's direction in the field's own frame, for the dust's and vapour's lit sides. */
  private lightUp(): void {
    const sun = this.sun;
    if (!sun) return;
    const dir = this.sunDir.copy(sun.vector);
    this.object.getWorldQuaternion(this.worldRotation).invert();
    if (sun.point) dir.sub(this.object.getWorldPosition(this.position));
    dir.applyQuaternion(this.worldRotation);
    if (dir.lengthSq() === 0) return;
    dir.normalize();
    (this.dust.material.uniforms.uSun!.value as THREE.Vector3).copy(dir);
    if (this.vapour) (this.vapour.material.uniforms.uSun!.value as THREE.Vector3).copy(dir);
  }
}

/** The shared uniforms of `THROW_GLSL`. */
function throwUniforms(): Record<string, THREE.IUniform> {
  return {
    uTime: { value: -1 },
    uThrowTime: { value: debrisParams.throwTime },
    uSwirl: { value: debrisParams.swirl },
    uFlatten: { value: debrisParams.flatten },
  };
}

/** A soft ball of billows (opacity in red), from value noise on the CPU with the body's seed. */
function billowTexture(seed: number): THREE.DataTexture {
  const n = PUFF_TEXTURE_SIZE;
  const rng = new Rng(hashOf(seed) ^ 0xb111);
  // A small grid of random values, smoothly interpolated, at two scales.
  const grid = (cells: number) => Array.from({ length: (cells + 1) * (cells + 1) }, () => rng.next());
  const coarse = grid(4);
  const fine = grid(9);
  const sample = (g: number[], cells: number, x: number, y: number) => {
    const fx = x * cells;
    const fy = y * cells;
    const i = Math.min(cells - 1, Math.floor(fx));
    const j = Math.min(cells - 1, Math.floor(fy));
    const u = fx - i;
    const v = fy - j;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const at = (a: number, b: number) => g[b * (cells + 1) + a]!;
    return (at(i, j) * (1 - su) + at(i + 1, j) * su) * (1 - sv) + (at(i, j + 1) * (1 - su) + at(i + 1, j + 1) * su) * sv;
  };
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n;
      const v = (y + 0.5) / n;
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      const ball = r >= 1 ? 0 : 1 - (r <= 0.2 ? 0 : ((r - 0.2) / 0.8) ** 2 * (3 - 2 * ((r - 0.2) / 0.8)));
      const billow = 0.65 * sample(coarse, 4, u, v) + 0.35 * sample(fine, 9, u, v);
      const a = Math.max(0, Math.min(1, ball * (0.35 + 1.1 * billow)));
      data.set([Math.round(a * 255), 0, 0, 255], (y * n + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, n, n);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** The glow round a molten field: a soft additive sprite, tinted and sized in `animate`. */
function createHaze(): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: createGlowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
      opacity: 0,
    }),
  );
  sprite.name = 'Debris glow';
  return sprite;
}

function hashOf(seed: number): number {
  return (seed ^ 0x9e3779b9) >>> 0;
}

/**
 * A rough rock of radius at most 1: an icosahedron with its corners pulled
 * in by seeded amounts (the same amount for a corner shared by faces, so it
 * stays closed), flat-shaded.
 */
function rockGeometry(seed: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const rng = new Rng(seed ^ 0x5eed);
  const pulls = new Map<string, number>();
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let pull = pulls.get(key);
    if (pull === undefined) pulls.set(key, (pull = rng.range(0.62, 1)));
    pos.setXYZ(i, pos.getX(i) * pull, pos.getY(i) * pull, pos.getZ(i) * pull);
  }
  geometry.computeVertexNormals();
  return geometry;
}
