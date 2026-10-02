import * as THREE from 'three';
import {
  DEBRIS_CHUNKS,
  debrisHeat,
  debrisPalette,
  debrisParams,
  debrisPosition,
  debrisThrow,
  generateDebris,
  type DebrisChunk,
} from '../gen/debris';
import type { PlanetStyle } from '../gen/planets';
import { Rng } from '../gen/rng';
import type { AtmosphereSun } from './atmosphereShell';

/** What a field is drawn with: how many rocks and dust motes, and how much bigger than true the rocks are. */
export interface DebrisDetail {
  chunks: number;
  motes: number;
  /** Rocks drawn this many times their size (the system view's few stand for many). */
  chunkScale: number;
  /** A dust mote's size, in the body's radii. */
  moteSize: number;
}

/** Low orbit: the full field. */
export const DEBRIS_NEAR: DebrisDetail = { chunks: DEBRIS_CHUNKS, motes: 5000, chunkScale: 1, moteSize: 0.012 };
/** The system view: the biggest rocks, a little larger, and thinner dust. */
export const DEBRIS_FAR: DebrisDetail = { chunks: 220, motes: 1200, chunkScale: 1.7, moteSize: 0.03 };

/** The molten glow of fresh chunks, and of the dust. */
const HOT = new THREE.Color('#ff5a1a');
/** Dust motes never draw bigger than this many pixels across. */
const MAX_MOTE_PIXELS = 48;

const DUST_VERTEX = /* glsl */ `
  attribute vec4 aPiece; // from, to, pace, shade
  uniform float uTime;
  uniform float uThrowTime;
  uniform float uSwirl;
  uniform float uFlatten;
  uniform float uRadius;
  uniform float uSize;
  uniform float uScale;
  uniform float uMaxPixels;
  uniform vec3 uSun;
  varying float vLight;
  varying float vShade;
  void main() {
    float e = uTime <= 0.0 ? 0.0 : 1.0 - exp(-uTime * aPiece.z / uThrowTime);
    float r = mix(aPiece.x, aPiece.y, e);
    float a = uTime <= 0.0 ? 0.0 : uSwirl * uTime / pow(max(aPiece.y, 0.2), 1.5);
    float c = cos(a);
    float s = sin(a);
    vec3 p = position * r;
    p = vec3(c * p.x + s * p.z, p.y * uFlatten, -s * p.x + c * p.z) * uRadius;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uTime <= 0.0 ? 0.0 : min(uMaxPixels, uSize * uScale / max(-mv.z, 1e-3));
    // Lit from the sun's side of the cloud, a little all round (it scatters).
    vLight = 0.35 + 0.65 * max(0.0, dot(normalize(position + 1e-4), uSun));
    vShade = aPiece.w;
  }
`;

const DUST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uHeat;
  uniform float uOpacity;
  varying float vLight;
  varying float vShade;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float f = 1.0 - smoothstep(0.15, 0.5, length(d));
    if (f <= 0.0) discard;
    vec3 col = uColor * vLight * vShade + uHot * uHeat;
    gl_FragColor = vec4(col, f * uOpacity);
  }
`;

/**
 * A busted body's debris field (gen/debris.ts): its rocks as one
 * instanced mesh, tumbling and glowing as they cool, and its dust as one
 * `Points` moved in the vertex shader. `animate(t)` poses it `t` seconds
 * after the blast (before it, the rocks and dust are hidden), so both views
 * show the same field at the same moment. Centred on its group's origin, in
 * units of `radius` (the body's radius in those units).
 */
export class DebrisField {
  readonly object = new THREE.Group();
  private readonly chunks: readonly DebrisChunk[];
  private readonly mesh: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly dust: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly sunDir = new THREE.Vector3();
  private readonly worldRotation = new THREE.Quaternion();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly drawSize = new THREE.Vector2();
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
  ) {
    const data = generateDebris(seed, detail.chunks, detail.motes);
    this.chunks = data.chunks;
    const palette = debrisPalette(style, bands).map((c) => new THREE.Color(c));

    const material = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(rockGeometry(seed), material, this.chunks.length);
    this.mesh.name = 'Debris';
    // The rocks move far from where the mesh's bounds were taken.
    this.mesh.frustumCulled = false;
    const color = new THREE.Color();
    this.chunks.forEach((c, i) => {
      this.mesh.setColorAt(i, color.copy(palette[c.shade]!).multiplyScalar(c.light));
      this.mesh.setMatrixAt(i, this.zero);
    });
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chunkScale = detail.chunkScale;

    const motes = data.motes;
    const dir = new Float32Array(motes.length * 3);
    const piece = new Float32Array(motes.length * 4);
    const rng = new Rng(seed);
    motes.forEach((m, i) => {
      dir.set(m.dir, i * 3);
      piece.set([m.from, m.to, m.pace, rng.range(0.55, 1.1)], i * 4);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(dir, 3));
    geometry.setAttribute('aPiece', new THREE.BufferAttribute(piece, 4));
    // Mid-grey between the rock colours.
    const dustColor = palette.reduce((sum, c) => sum.add(c), new THREE.Color(0, 0, 0)).multiplyScalar(1 / palette.length);
    this.dust = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        uniforms: {
          uTime: { value: -1 },
          uThrowTime: { value: debrisParams.throwTime },
          uSwirl: { value: debrisParams.swirl },
          uFlatten: { value: debrisParams.flatten },
          uRadius: { value: radius },
          uSize: { value: detail.moteSize * radius },
          uScale: { value: 500 },
          uMaxPixels: { value: MAX_MOTE_PIXELS },
          uSun: { value: new THREE.Vector3(0, 1, 0) },
          uColor: { value: dustColor },
          uHot: { value: HOT.clone() },
          uHeat: { value: 0 },
          uOpacity: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
      }),
    );
    this.dust.name = 'Debris dust';
    this.dust.frustumCulled = false;
    // Points are sized in pixels: from the drawing camera's projection.
    this.dust.onBeforeRender = (renderer, _scene, camera) => {
      const height = renderer.getRenderTarget()?.height ?? renderer.getDrawingBufferSize(this.drawSize).y;
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 65;
      this.dust.material.uniforms.uScale!.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    };
    this.object.add(this.mesh, this.dust);
  }

  /** Poses the field `t` seconds after the blast (hidden before it). */
  animate(t: number): void {
    const u = this.dust.material.uniforms;
    u.uTime!.value = t;
    const heat = debrisHeat(t);
    this.mesh.material.emissive.copy(HOT).multiplyScalar(heat);
    u.uHeat!.value = 0.8 * heat;
    // The dust thins out as it spreads.
    u.uOpacity!.value = t <= 0 ? 0 : 0.55 * Math.min(1, t / 0.3) * (0.45 + 0.55 * Math.exp(-t / 20));
    this.lightDust();
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
  }

  /** The sun's direction in the field's own frame, for the dust. */
  private lightDust(): void {
    const sun = this.sun;
    if (!sun) return;
    const dir = this.sunDir.copy(sun.vector);
    this.object.getWorldQuaternion(this.worldRotation).invert();
    if (sun.point) dir.sub(this.object.getWorldPosition(this.position));
    dir.applyQuaternion(this.worldRotation);
    if (dir.lengthSq() > 0) this.dust.material.uniforms.uSun!.value.copy(dir.normalize());
  }
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
