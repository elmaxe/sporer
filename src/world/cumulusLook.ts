import * as THREE from 'three';
import {
  MAX_PUFFS,
  PUFF_SHAPES,
  PUFF_TEXELS,
  channelSlot,
  clusterBase,
  clusterCentre,
  clusterStrength,
  cumulusCluster,
  puffAtlas,
  towerCluster,
  type CumulusCluster,
  type CumulusField,
  type GroundRadius,
} from '../gen/cumulus';
import type { StormEvent } from '../gen/weather';
import type { AtmosphereSun } from './atmosphereShell';

/**
 * Tunables of the puffy clouds (debug folder Weather). `opacity` is how
 * solid a puff's core is; `nearFade` keeps a puff the camera flies into
 * from filling the screen (it fades out within this many puff radii).
 */
export const cumulusParams = {
  opacity: 0.92,
  nearFade: 2.5,
  /** Light through a puff's thin edges with the sun behind it (the silver lining). */
  silver: 1.1,
  /** Sunlight on the puffs: over 1 so sunlit tops come out white through the tone mapping. */
  sun: 1.35,
  /**
   * Level of detail by a cluster's angular size from the camera (its span
   * over its distance, radians): every puff from `lodNear` up, down to two
   * bigger ones at `lodFar` and below.
   */
  lodNear: 0.08,
  lodFar: 0.008,
};

/** Flashes the puff shader reads (the weather look's slots). */
const FLASH_SLOTS = 8;
/** A flash lights the puffs this far round (radians, the glow's 1/e width). */
const FLASH_WIDTH = 0.05;

let atlas: THREE.DataTexture | null = null;

/** The puffs' sprite atlas (gen/cumulus.ts), made once and shared (never disposed). */
function puffTexture(): THREE.DataTexture {
  if (atlas) return atlas;
  const size = PUFF_TEXELS * 2;
  const texture = new THREE.DataTexture(puffAtlas(20261003), size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return (atlas = texture);
}

const vertexShader = /* glsl */ `
  attribute vec4 iPos;    // body frame, planet units; radius
  attribute vec4 iInfo;   // alpha, height in the cluster (0 base, 1 top), shape, unused
  attribute vec4 iCentre; // the cluster's middle; its horizontal radius
  uniform vec3 uSun;
  uniform float uSunPoint;
  uniform float uNearFade;
  uniform float uRadius;
  uniform vec4 uFlashes[${FLASH_SLOTS}];
  uniform int uFlashCount;
  varying vec2 vCorner;
  varying vec2 vTile;
  varying float vAlpha;
  varying vec3 vLv;
  varying float vDay;
  varying float vDusk;
  varying float vShade;
  varying float vScatter;
  varying float vGlow;
  varying float vFar;

  void main() {
    vec4 world = modelMatrix * vec4(iPos.xyz, 1.0);
    float scale = length(modelMatrix[0].xyz);
    float size = iPos.w * scale;
    vec4 view = viewMatrix * world;
    vec3 centre = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 up = normalize(world.xyz - centre);
    vec3 L = uSunPoint > 0.5 ? normalize(uSun - world.xyz) : normalize(uSun);
    // The planet's day and night under the puff, and a warm band at dusk.
    float mu = dot(up, L);
    vDay = smoothstep(-0.12, 0.2, mu);
    vDusk = smoothstep(-0.3, 0.0, mu) * (1.0 - smoothstep(0.0, 0.3, mu));
    // Self-shadowing within the cluster: its sunward side is lit, the far side and the flat base in shade.
    vec3 middle = (modelMatrix * vec4(iCentre.xyz, 1.0)).xyz;
    float side = clamp(dot(world.xyz - middle, L) / max(iCentre.w * scale, 1e-4), -1.0, 1.0);
    float base = mix(0.6, 1.0, smoothstep(0.0, 0.6, iInfo.y));
    vShade = mix(0.5, 1.0, 0.5 + 0.5 * side) * base;
    // Looking towards the sun through the puff: its thin edges glow.
    vec3 toCamera = normalize(cameraPosition - world.xyz);
    vScatter = pow(max(0.0, dot(-toCamera, L)), 6.0);
    vLv = normalize((viewMatrix * vec4(L, 0.0)).xyz);
    // Lightning lights the towers from inside.
    float glow = 0.0;
    for (int i = 0; i < ${FLASH_SLOTS}; i++) {
      if (i >= uFlashCount) break;
      vec4 f = uFlashes[i];
      if (f.w <= 0.0) continue;
      glow += f.w * exp(-(1.0 - dot(up, f.xyz)) / ${((FLASH_WIDTH * FLASH_WIDTH) / 2).toFixed(6)});
    }
    vGlow = glow;
    // A puff the camera is in or about to enter fades out instead of filling the screen.
    float near = smoothstep(size * 0.8, size * uNearFade, length(view.xyz));
    // Night-side clouds are dark and see-through enough not to blot out the air's glow at the limb.
    vAlpha = iInfo.x * near * (0.2 + 0.8 * smoothstep(-0.2, 0.1, mu));
    // From orbit, puffs seen edge-on at the limb thin out, so the clouds don't stand round the planet as a fuzzy rim
    // (in low orbit the horizon keeps its towering clouds).
    float orbit = smoothstep(1.25, 1.8, length(cameraPosition - centre) / (uRadius * scale));
    vAlpha *= mix(1.0, smoothstep(0.05, 0.4, dot(up, toCamera)), orbit);
    vCorner = position.xy;
    float shape = iInfo.z;
    vTile = vec2(mod(shape, 2.0), floor(shape / 2.0)) * 0.5;
    // Small on screen (seen from orbit): softer and a little bigger, so a cluster's puffs merge into one patch.
    float screen = projectionMatrix[1][1] * size / max(-view.z, 1e-4);
    vFar = 1.0 - smoothstep(0.012, 0.05, screen);
    view.xy += position.xy * size * (1.0 + 0.5 * vFar);
    gl_Position = projectionMatrix * view;
    if (vAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uColor;
  uniform vec3 uSunColor;
  uniform float uSunStrength;
  uniform float uAmbient;
  uniform float uGain;
  uniform float uOpacity;
  uniform float uSilver;
  uniform float uSunGain;
  uniform float uFlashGain;
  varying vec2 vCorner;
  varying vec2 vTile;
  varying float vAlpha;
  varying vec3 vLv;
  varying float vDay;
  varying float vDusk;
  varying float vShade;
  varying float vScatter;
  varying float vGlow;
  varying float vFar;

  void main() {
    // Crisp, cauliflower edges up close; soft from afar.
    float d = texture(uAtlas, vTile + (vCorner * 0.5 + 0.5) * 0.5).r;
    float a = mix(smoothstep(0.06, 0.55, d), d * 0.8, vFar);
    if (a < 0.01) discard;
    // A rounded puff: the sprite as the near half of a ball, lit by the sun (wrapped, so the shade side isn't black).
    vec3 n = vec3(vCorner, sqrt(max(0.0, 1.0 - dot(vCorner, vCorner))));
    float diffuse = 0.4 + 0.6 * max(0.0, dot(n, vLv));
    vec3 sun = uSunColor * vDay * diffuse * vShade * uSunGain;
    vec3 lit = uColor * (uAmbient + sun) + vDusk * vec3(1.0, 0.6, 0.4) * 0.2 * uColor;
    lit += uSunColor * vDay * vScatter * (1.0 - a) * uSilver;
    lit *= uSunStrength;
    float glow = vGlow * uFlashGain * mix(1.0, 0.35, vDay);
    lit += vec3(0.8, 0.86, 1.0) * glow * (0.4 + 1.6 * a);
    gl_FragColor = vec4(lit * uGain, clamp(a * uOpacity * vAlpha + glow * 0.2 * a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const scratchCamera = new THREE.Vector3();
const scratchDir: [number, number, number] = [0, 0, 0];

/**
 * A body's puffy clouds (gen/cumulus.ts) as one instanced mesh of lit
 * sprites. `animate(time)` follows the clock: each channel's cluster for the
 * slot under way, the thunderstorms' towers, and writes the puffs that face
 * the camera, far to near (the camera of the last frame drawn decides the
 * order and which side of the planet is hidden).
 */
export class CumulusClouds {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  /** Puffs written at the last `animate` (the lab's readout). */
  puffCount = 0;
  /** Clusters alive at the last `animate`, towers included. */
  clusterCount = 0;
  private readonly channels: (CumulusCluster | null)[] = [];
  private readonly towers = new Map<number, CumulusCluster>();
  private readonly live: CumulusCluster[] = [];
  private readonly strengths: number[] = [];
  private readonly keys: number[] = [];
  private readonly order: number[] = [];
  private readonly pos: THREE.InstancedBufferAttribute;
  private readonly info: THREE.InstancedBufferAttribute;
  private readonly middle: THREE.InstancedBufferAttribute;
  /** The camera in the mesh's frame, as of the last frame it was drawn (planet units). */
  private readonly camera = new THREE.Vector3(0, 0, 1e9);
  private readonly byKey = (a: number, b: number): number => this.keys[b]! - this.keys[a]!;
  /** Drawn since the last `animate` (else it skips its work). */
  private seen = true;

  constructor(
    readonly field: CumulusField,
    private readonly ground: GroundRadius,
    shared: Record<string, THREE.IUniform>,
    scale: number,
    sun: AtmosphereSun,
    sunColor?: THREE.Color,
  ) {
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const attribute = () => new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('iPos', (this.pos = attribute()));
    geometry.setAttribute('iInfo', (this.info = attribute()));
    geometry.setAttribute('iCentre', (this.middle = attribute()));
    geometry.instanceCount = 0;
    // Culled as a whole when the planet is off screen.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), field.top * 1.1);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uAtlas: { value: puffTexture() },
        uColor: shared.uColor!,
        uGain: shared.uGain!,
        uAmbient: shared.uAmbient!,
        uFlashGain: shared.uFlashGain!,
        uFlashes: shared.uFlashes!,
        uFlashCount: shared.uFlashCount!,
        uOpacity: { value: cumulusParams.opacity },
        uNearFade: { value: cumulusParams.nearFade },
        uRadius: { value: field.radius },
        uSilver: { value: cumulusParams.silver },
        uSunGain: { value: cumulusParams.sun },
        uSun: { value: sun.vector },
        uSunPoint: { value: sun.point ? 1 : 0 },
        uSunColor: { value: sunColor ?? new THREE.Color(1, 1, 1) },
        uSunStrength: sun.strength ?? { value: 1 },
      },
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.scale.setScalar(scale);
    this.mesh.name = 'Cumulus';
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
      this.mesh.worldToLocal(camera.getWorldPosition(scratchCamera));
      this.camera.copy(scratchCamera);
      this.seen = true;
    };
  }

  /** The clouds at system time `time`; `storms` are the body's storms under way (thunderstorm cells become towers). `coverage` scales the clusters alive. */
  animate(time: number, storms: readonly StormEvent[], coverage: number): void {
    const u = this.mesh.material.uniforms;
    u.uOpacity!.value = cumulusParams.opacity;
    u.uNearFade!.value = cumulusParams.nearFade;
    u.uSilver!.value = cumulusParams.silver;
    u.uSunGain!.value = cumulusParams.sun;
    // Off screen (the planet culled, or behind the camera): nothing to follow until it is drawn again.
    if (!this.seen) return;
    this.seen = false;
    const live = this.live;
    live.length = 0;
    this.strengths.length = 0;
    const count = Math.round(this.field.clusters * Math.max(0, coverage));
    for (let c = 0; c < count; c++) {
      const slot = channelSlot(this.field, c, time);
      let cluster = this.channels[c];
      if (!cluster || cluster.slot !== slot) cluster = this.channels[c] = cumulusCluster(this.field, c, slot, this.ground);
      const s = clusterStrength(cluster, time);
      if (s > 0) {
        live.push(cluster);
        this.strengths.push(s);
      }
    }
    for (const [seed, tower] of this.towers) if (tower.storm!.end <= time || tower.storm!.start > time + 1) this.towers.delete(seed);
    for (const e of storms) {
      if (e.kind !== 'cell') continue;
      let tower = this.towers.get(e.seed);
      if (!tower) this.towers.set(e.seed, (tower = towerCluster(this.field, e, this.ground)));
      const s = clusterStrength(tower, time);
      if (s > 0) {
        live.push(tower);
        this.strengths.push(s);
      }
    }
    this.clusterCount = live.length;
    this.write(time);
  }

  /** Writes the live clusters' puffs that the camera can see, farthest cluster first. */
  private write(time: number): void {
    const cam = this.camera;
    const camDist = cam.length();
    const R = this.field.radius * 0.97;
    // The planet hides what is past the horizon as seen from the camera: the camera's and the point's horizon angles add.
    const camHorizon = Math.acos(Math.min(1, R / Math.max(camDist, 1e-6)));
    const keys = this.keys;
    const order = this.order;
    keys.length = order.length = 0;
    for (let i = 0; i < this.live.length; i++) {
      const c = this.live[i]!;
      const d = clusterCentre(c, time, scratchDir);
      const r = clusterBase(c, time) + c.depth * 0.5;
      const cos = (d[0] * cam.x + d[1] * cam.y + d[2] * cam.z) / Math.max(camDist, 1e-6);
      const reach = camHorizon + Math.acos(Math.min(1, R / r)) + (c.span + c.depth) / R + 0.05;
      if (reach < Math.PI && cos < Math.cos(reach)) {
        keys.push(Infinity);
        continue;
      }
      const dx = d[0] * r - cam.x;
      const dy = d[1] * r - cam.y;
      const dz = d[2] * r - cam.z;
      keys.push(dx * dx + dy * dy + dz * dz);
      order.push(i);
    }
    order.sort(this.byKey);
    const P = this.pos.array as Float32Array;
    const I = this.info.array as Float32Array;
    const M = this.middle.array as Float32Array;
    let n = 0;
    for (const i of order) {
      const c = this.live[i]!;
      const s = this.strengths[i]!;
      const d = clusterCentre(c, time, scratchDir);
      const [x, y, z] = d;
      // East (increasing longitude) and north at the cluster.
      const h = Math.hypot(x, z) || 1e-6;
      const ex = z / h;
      const ez = -x / h;
      const nx = -y * (x / h);
      const ny = h;
      const nz = -y * (z / h);
      // It billows up as it forms (a tower rises) and thins as it evaporates.
      const grow = 0.6 + 0.4 * s;
      const rise = c.storm ? 0.3 + 0.7 * s : grow;
      const base = clusterBase(c, time);
      const mid = base + c.depth * 0.5 * rise;
      const below = cam.x * x + cam.y * y + cam.z * z < mid;
      const puffs = c.puffs;
      // Level of detail: a cluster small on screen is a few bigger puffs spread over it (it reads the same, for far less drawing).
      const detail = Math.min(1, Math.max(0, (c.span / Math.sqrt(this.keys[i]!) - cumulusParams.lodFar) / (cumulusParams.lodNear - cumulusParams.lodFar)));
      const count = Math.min(puffs.length, Math.max(2, Math.ceil(puffs.length * detail)));
      const bigger = Math.min(2.5, Math.sqrt(puffs.length / count));
      const spread = grow * (0.7 + 0.3 * detail);
      for (let j = 0; j < count && n < MAX_PUFFS; j++) {
        // Far to near within the cluster: bottom up seen from above, top down from below.
        const k = Math.floor(((below ? count - 1 - j : j) * puffs.length) / count);
        const p = puffs[k]!;
        const e = p.east * spread;
        const no = p.north * spread;
        const r = base + p.up * rise;
        const o = n * 4;
        P[o] = x * r + ex * e + nx * no;
        P[o + 1] = y * r + ny * no;
        P[o + 2] = z * r + ez * e + nz * no;
        P[o + 3] = p.radius * grow * bigger;
        I[o] = s;
        I[o + 1] = p.height;
        I[o + 2] = p.shape % PUFF_SHAPES;
        I[o + 3] = 0;
        M[o] = x * mid;
        M[o + 1] = y * mid;
        M[o + 2] = z * mid;
        M[o + 3] = c.span * grow;
        n++;
      }
    }
    this.puffCount = n;
    this.mesh.geometry.instanceCount = n;
    for (const a of [this.pos, this.info, this.middle]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
