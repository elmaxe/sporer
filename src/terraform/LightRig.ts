import * as THREE from 'three';
import { createGlowTexture } from '../world/glowTexture';
import { CLOUD_RENDER_ORDER } from '../world/weatherLook';
import {
  MIRROR_AIM,
  MIRROR_DISTANCE,
  MIRROR_POLAR,
  SHADE_DISTANCE,
  SHADE_RADIUS,
  lightParams,
  mirrorAzimuth,
  mirrorUnfold,
  sailRadius,
  type Installations,
} from './light';

/*
 * What heat-and-light terraforming leaves over a body (terraform/
 * light.ts), drawn the same in both views: the system view's Planet and
 * low orbit (terraform/LightTools.ts). Built in body radii and scaled by the
 * body's radius, centred on it, not turning with it: everything is placed
 * from the sun's direction each frame.
 *
 * - Each orbital mirror is a hexagonal sail on a frame, on station a little
 *   sunward of the terminator (light.ts MIRROR_POLAR, MIRROR_DISTANCE), its
 *   normal halfway between the sun and the spot on the day side it lights,
 *   as big as the light it adds (sailRadius: a quarter of the body's light
 *   is a sail of half its radius). A faint cone of light runs down to that
 *   spot, and the sail glints when the camera is in its reflected beam. It
 *   unfolds as it's deployed and folds away as it's recalled. Lancing, every
 *   mirror turns to the lance's spot.
 * - The sunshade is a disc far sunward (stylised: SHADE_DISTANCE), its slats
 *   as wide as the share of light it blocks, its sunlit rim glowing.
 */

const RENDER_ORDER = CLOUD_RENDER_ORDER + 1;
/** The sails' sides: a hexagon. */
const SAIL_SIDES = 6;
const Y = new THREE.Vector3(0, 1, 0);

const CONE_VERTEX = /* glsl */ `
  varying float vFacing;
  varying float vAlong;
  void main() {
    vAlong = uv.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    vFacing = abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }
`;

const CONE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFacing;
  varying float vAlong;
  void main() {
    // A soft shaft: brightest through its middle, fading at the sail and brightening where it lands.
    float a = uOpacity * pow(vFacing, 1.5) * smoothstep(0.0, 0.12, 1.0 - vAlong) * (0.55 + 0.45 * (1.0 - vAlong));
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

const SHADE_FRAGMENT = /* glsl */ `
  uniform float uBlock;
  uniform vec3 uRim;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float w = fwidth(r);
    if (r > 1.0 + w) discard;
    // Slats across the disc, as wide as the light they block.
    float s = fract(p.y * 9.0);
    float sw = fwidth(p.y * 9.0);
    float slat = smoothstep(0.5 - uBlock * 0.5 - sw, 0.5 - uBlock * 0.5, s) * (1.0 - smoothstep(0.5 + uBlock * 0.5, 0.5 + uBlock * 0.5 + sw, s));
    float frame = smoothstep(0.93 - w, 0.93, r) + (1.0 - smoothstep(0.012, 0.012 + 2.0 * w, abs(p.x)));
    float inside = 1.0 - smoothstep(1.0 - w, 1.0 + w, r);
    float a = inside * max(slat * 0.94, min(1.0, frame) * 0.9);
    vec3 color = mix(vec3(0.035, 0.037, 0.045), uRim, smoothstep(0.93 - w, 0.97, r) * 0.8);
    gl_FragColor = vec4(color, a);
  }
`;

const SHADE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

interface Sail {
  readonly group: THREE.Group;
  readonly sail: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly frame: THREE.LineSegments;
  readonly glint: THREE.Sprite;
  readonly cone: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
}

export class LightRig {
  /** Centred on the body, scaled to its radius; add it to the view's scene (or the body's group). */
  readonly object = new THREE.Group();
  private readonly sails: Sail[] = [];
  private readonly sailGeometry = new THREE.CircleGeometry(1, SAIL_SIDES);
  private readonly frameGeometry: THREE.BufferGeometry;
  private readonly coneGeometry = new THREE.CylinderGeometry(1, 1.12, 1, 20, 1, true).translate(0, 0.5, 0);
  private readonly sailMaterial = new THREE.MeshStandardMaterial({
    color: '#e8eef5',
    metalness: 0.85,
    roughness: 0.18,
    emissive: '#3a4250',
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
  });
  private readonly frameMaterial = new THREE.LineBasicMaterial({ color: '#9aa3ad', transparent: true, opacity: 0.9 });
  private readonly glintTexture = createGlowTexture();
  private readonly shade: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  private readonly sun = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly station = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly toAim = new THREE.Vector3();
  private readonly toEye = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly z = new THREE.Vector3(0, 0, 1);
  /** The ready mirrors' stations, body radii (for the lance's beams). */
  private readonly ready: THREE.Vector3[] = [];
  private readyCount = 0;

  constructor(
    /** The body's radius in the view's units. */
    radius: number,
    /** The colour of the star's light (the cones and glints). */
    private readonly light: THREE.ColorRepresentation = '#fff4d8',
  ) {
    this.object.scale.setScalar(radius);
    this.object.name = 'Terraforming rig';
    this.frameGeometry = sailFrame();
    this.shade = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.ShaderMaterial({
        vertexShader: SHADE_VERTEX,
        fragmentShader: SHADE_FRAGMENT,
        uniforms: { uBlock: { value: 0 }, uRim: { value: new THREE.Color('#d9c39a') } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.shade.renderOrder = RENDER_ORDER;
    this.shade.visible = false;
    this.object.add(this.shade);
  }

  /** Sets the body's radius in the view's units. */
  setRadius(radius: number): void {
    this.object.scale.setScalar(radius);
  }

  /**
   * Places the mirrors and the shade for `inst` at game time `time`: `sun`
   * is the unit direction to the star and `axis` the body's spin axis (both
   * in the rig's parent's frame); `focus` a point on the body (its parent's
   * frame) every mirror aims at, the lance's spot, or null; `camera` for the
   * glints.
   */
  pose(sun: THREE.Vector3, axis: THREE.Vector3, inst: Installations, time: number, focus: THREE.Vector3 | null, camera: THREE.Camera): void {
    const S = this.sun.copy(sun).normalize();
    // A frame round the sun's direction that keeps still as the body turns: from the spin axis.
    this.u.crossVectors(S, axis);
    if (this.u.lengthSq() < 1e-8) this.u.set(1, 0, 0).cross(S);
    this.u.normalize();
    this.v.crossVectors(S, this.u);
    const scale = this.object.scale.x;
    this.object.updateMatrixWorld();
    this.eye.copy(camera.position);
    this.object.worldToLocal(this.eye);
    while (this.sails.length < inst.slots.length) this.sails.push(this.newSail());
    this.readyCount = 0;
    for (let k = 0; k < this.sails.length; k++) {
      const sail = this.sails[k]!;
      const slot = inst.slots[k];
      const unfold = slot ? mirrorUnfold(slot, time) : 0;
      sail.group.visible = sail.cone.visible = unfold > 0;
      if (unfold <= 0) continue;
      const a = mirrorAzimuth(k);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // On station, gliding out as it unfolds.
      const reach = MIRROR_DISTANCE * (0.8 + 0.2 * smooth(unfold));
      this.station
        .copy(S)
        .multiplyScalar(Math.cos(MIRROR_POLAR))
        .addScaledVector(this.u, Math.sin(MIRROR_POLAR) * ca)
        .addScaledVector(this.v, Math.sin(MIRROR_POLAR) * sa)
        .multiplyScalar(reach);
      // The spot it lights: towards it from the sub-solar point, or the lance's.
      if (focus) this.aim.copy(focus).divideScalar(scale);
      else
        this.aim
          .copy(S)
          .multiplyScalar(Math.cos(MIRROR_AIM))
          .addScaledVector(this.u, Math.sin(MIRROR_AIM) * ca)
          .addScaledVector(this.v, Math.sin(MIRROR_AIM) * sa);
      this.toAim.subVectors(this.aim, this.station);
      const length = this.toAim.length();
      this.toAim.divideScalar(Math.max(length, 1e-6));
      this.normal.addVectors(S, this.toAim).normalize();
      const r = sailRadius(lightParams.mirrorStarlight, this.normal.dot(S)) * smooth(unfold);
      sail.group.position.copy(this.station);
      sail.group.quaternion.setFromUnitVectors(this.z, this.normal);
      // Unfolding: it turns as its panels open.
      sail.sail.rotation.z = (1 - unfold) * 2.4;
      sail.frame.rotation.z = sail.sail.rotation.z;
      sail.sail.scale.setScalar(r);
      sail.frame.scale.setScalar(r);
      // The cone, from the sail down to where it lands.
      const cone = sail.cone;
      cone.visible = true;
      cone.position.copy(this.station);
      cone.quaternion.setFromUnitVectors(Y, this.toAim);
      cone.scale.set(r * 0.92, length, r * 0.92);
      cone.material.uniforms.uOpacity!.value = (focus ? 0.16 : 0.07) * smooth(unfold);
      // A glint when the camera is in its reflected beam (along `toAim`), and a faint sheen always.
      this.toEye.subVectors(this.eye, this.station).normalize();
      const glint = 0.25 + 3 * Math.max(0, this.toAim.dot(this.toEye)) ** 24;
      sail.glint.scale.setScalar(r * (1.2 + 1.6 * Math.min(1, glint)));
      sail.glint.material.opacity = Math.min(1, glint) * smooth(unfold);
      if (slot && slot.recalled === null && unfold >= 1) {
        if (this.readyCount === this.ready.length) this.ready.push(new THREE.Vector3());
        this.ready[this.readyCount++]!.copy(this.station);
      }
    }
    // The shade, far sunward, facing the star.
    const block = inst.shadeShown;
    this.shade.visible = block > 0.001;
    if (this.shade.visible) {
      this.shade.position.copy(S).multiplyScalar(SHADE_DISTANCE);
      this.shade.quaternion.setFromUnitVectors(this.z, S);
      this.shade.scale.setScalar(SHADE_RADIUS);
      this.shade.material.uniforms.uBlock!.value = block;
    }
  }

  /**
   * The ready mirrors that can see `foot` (a point on the body, the rig's
   * parent's frame), into `out` in the same frame: where the lance's beams
   * come from. Returns how many.
   */
  lanceSources(foot: THREE.Vector3, out: THREE.Vector3[]): number {
    const scale = this.object.scale.x;
    const r = foot.length();
    if (r < 1e-6) return 0;
    let n = 0;
    for (let i = 0; i < this.readyCount && n < out.length; i++) {
      const m = this.ready[i]!;
      // In sight above the spot's horizon: (m − p) · p̂ > 0, in body radii.
      if ((m.x * foot.x + m.y * foot.y + m.z * foot.z) / r - r / scale <= 0.02) continue;
      out[n++]!.copy(m).multiplyScalar(scale).add(this.object.position);
    }
    return n;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.sailGeometry.dispose();
    this.frameGeometry.dispose();
    this.coneGeometry.dispose();
    this.sailMaterial.dispose();
    this.frameMaterial.dispose();
    this.glintTexture.dispose();
    for (const s of this.sails) {
      s.glint.material.dispose();
      s.cone.material.dispose();
    }
    this.shade.geometry.dispose();
    this.shade.material.dispose();
  }

  private newSail(): Sail {
    const group = new THREE.Group();
    const sail = new THREE.Mesh(this.sailGeometry, this.sailMaterial);
    const frame = new THREE.LineSegments(this.frameGeometry, this.frameMaterial);
    const glint = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glintTexture, color: this.light, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    );
    glint.renderOrder = RENDER_ORDER + 1;
    // Just in front of the sail, on its lit side.
    glint.position.z = 0.01;
    const cone = new THREE.Mesh(
      this.coneGeometry,
      new THREE.ShaderMaterial({
        vertexShader: CONE_VERTEX,
        fragmentShader: CONE_FRAGMENT,
        uniforms: { uColor: { value: new THREE.Color(this.light) }, uOpacity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    cone.renderOrder = RENDER_ORDER;
    cone.frustumCulled = false;
    group.add(sail, frame, glint);
    group.visible = cone.visible = false;
    this.object.add(group, cone);
    return { group, sail, frame, glint, cone };
  }
}

/** The sail's frame: its rim and spokes, a unit hexagon. */
function sailFrame(): THREE.BufferGeometry {
  const points: number[] = [];
  for (let i = 0; i < SAIL_SIDES; i++) {
    const a0 = (i / SAIL_SIDES) * Math.PI * 2;
    const a1 = ((i + 1) / SAIL_SIDES) * Math.PI * 2;
    points.push(Math.cos(a0), Math.sin(a0), 0.002, Math.cos(a1), Math.sin(a1), 0.002);
    points.push(0, 0, 0.002, Math.cos(a0), Math.sin(a0), 0.002);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

function smooth(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
