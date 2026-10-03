import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { GalaxyData, StarRef } from '../gen/galaxy';
import { STAR_DIMMING_GLSL, starDimmingUniforms } from '../world/nebulaLook';
import { GLOW_NEAR, binaryLayout, galaxyGlows, galaxyMemberSize, type GalaxyGlow } from './appearance';
import { discDustGlsl } from './discDust';
import { createGlowVolume } from './glowVolume';

/** Dots never get smaller or bigger than this on screen, in CSS pixels. */
const MIN_DOT_PX = 2;
const MAX_DOT_PX = 64;

export const galaxyMapParams = {
  /** Twinkle depth: brightness swings by about ± this (a bit more for small, faint dots). */
  twinkle: 0.15,
  /** Radians per second of the fastest twinkle; each star gets 0.35–1× of it. */
  twinkleSpeed: 4.5,
};

/**
 * The galaxy as seen from outside: every star as one soft, additive dot
 * (a single Points draw), plus glowing volumes for the disc and the bulge
 * (so the glow reads from any angle, including edge-on). Dots are dimmed
 * behind dark nebulas and the plane's dust lanes (see discDust.ts).
 * Dots have a size in galaxy units, so nearby stars look bigger. Stars
 * twinkle subtly, except the ones held steady (the current and hovered star).
 * A binary is two dots turning about their centre of mass in the view plane
 * (see binaryLayout). Everything is added to `parent`, the galaxy's rotating
 * root, and works in its local (galaxy) coordinates.
 */
export class GalaxyMap implements Entity {
  /** Star positions as xyz triples, indexed like `galaxy.stars` (binaries: the centre of mass). */
  readonly positions: Float32Array;
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly glows: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>[] = [];
  private readonly bufferSize = new THREE.Vector2();
  private readonly steady = new THREE.Vector2(-1, -1);
  private readonly faded = new THREE.Vector2(-1, 0);
  /** Where the faded star's members are drawn in its close-up (galaxy coordinates)... */
  private readonly closeUp = [new THREE.Vector3(), new THREE.Vector3()];
  /** ...and how far its dots have moved there, 0–1. */
  private readonly converge = { value: 0 };
  private readonly cameraLocal = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private time = 0;

  constructor(
    private readonly parent: THREE.Object3D,
    galaxy: GalaxyData,
    debug: Debug,
  ) {
    const n = galaxy.stars.length;
    this.positions = new Float32Array(n * 3);
    // One dot per star, so binaries get two.
    const dots = galaxy.stars.reduce((t, ref) => t + ref.stars.length, 0);
    const dotPositions = new Float32Array(dots * 3);
    const colors = new Float32Array(dots * 3);
    const sizes = new Float32Array(dots);
    const ids = new Float32Array(dots);
    // Binary turn: offset from the centre of mass (signed, so the members sit opposite), phase, speed.
    const orbits = new Float32Array(dots * 3);
    const color = new THREE.Color();
    let dot = 0;
    galaxy.stars.forEach((ref, i) => {
      const { x, y, z } = ref.position;
      this.positions.set([x, y, z], i * 3);
      const layout = binaryLayout(ref);
      ref.stars.forEach((star, member) => {
        dotPositions.set([x, y, z], dot * 3);
        color.set(star.color).toArray(colors, dot * 3);
        sizes[dot] = galaxyMemberSize(star);
        ids[dot] = ref.id;
        if (layout) orbits.set([layout.offsets[member]! * (member ? -1 : 1), layout.phase, layout.speed], dot * 3);
        dot++;
      });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('starId', new THREE.BufferAttribute(ids, 1));
    geometry.setAttribute('orbit', new THREE.BufferAttribute(orbits, 3));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        // Pixels per world unit at distance 1; set per frame from the camera and canvas.
        scale: { value: 1 },
        minSize: { value: MIN_DOT_PX },
        maxSize: { value: MAX_DOT_PX },
        time: { value: 0 },
        twinkle: { value: galaxyMapParams.twinkle },
        twinkleSpeed: { value: galaxyMapParams.twinkleSpeed },
        // Ids of up to two stars that don't twinkle (-1: none).
        steady: { value: this.steady },
        // A star (id) whose dots fade out by the given amount, 0–1.
        faded: { value: this.faded },
        // ...and move this far (0–1) to its members' places in the close-up.
        closeUp: { value: this.closeUp },
        converge: this.converge,
        // The camera in galaxy coordinates, and the dark nebulas between it and each star.
        cameraLocal: { value: this.cameraLocal },
        ...starDimmingUniforms(galaxy.nebulas),
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        attribute float starId;
        attribute vec3 orbit;
        uniform float scale;
        uniform float minSize;
        uniform float maxSize;
        uniform float time;
        uniform float twinkle;
        uniform float twinkleSpeed;
        uniform vec2 steady;
        uniform vec2 faded;
        uniform vec3 closeUp[2];
        uniform float converge;
        uniform vec3 cameraLocal;
        varying vec3 vColor;
        varying float vDim;
        ${STAR_DIMMING_GLSL}
        ${discDustGlsl(galaxy.radius)}
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // Binary members turn about their centre of mass in the view plane.
          float a = orbit.y + time * orbit.z;
          mv.xy += vec2(cos(a), sin(a)) * orbit.x;
          // The faded star's dots move to where its close-up draws its members (member 1 has the negative offset).
          bool fading = abs(starId - faded.x) < 0.5;
          if (fading && converge > 0.0) {
            vec4 target = modelViewMatrix * vec4(orbit.x < 0.0 ? closeUp[1] : closeUp[0], 1.0);
            mv = mix(mv, target, converge);
          }
          float px = size * scale / -mv.z;
          gl_PointSize = clamp(px, minSize, maxSize);
          // Dots clamped up to the minimum size get dimmer instead of bigger.
          vDim = clamp(px / minSize, 0.6, 1.0);

          // Twinkle: two detuned sines per star, phases and rates from golden-ratio hashes of its id.
          float h1 = fract(starId * 0.6180339 + sign(orbit.x) * 0.25);
          float h2 = fract(starId * 0.7548777);
          float f = twinkleSpeed * (0.35 + 0.65 * h1);
          float wave = 0.6 * sin(time * f + h2 * 6.2832) + 0.4 * sin(time * f * 1.73 + h1 * 6.2832);
          float small = 1.0 - smoothstep(minSize, minSize * 4.0, px);
          bool held = abs(starId - steady.x) < 0.5 || abs(starId - steady.y) < 0.5;
          vDim *= held ? 1.0 : 1.0 + twinkle * (1.0 + 0.6 * small) * wave;
          if (fading) vDim *= 1.0 - faded.y;
          // Hidden behind dark nebulas, and dimmed behind the dust lanes.
          vDim *= starDimming(cameraLocal, position) * discDustTransmittance(cameraLocal, position);

          vColor = color;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vDim;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          // Hot white-ish core and a coloured halo.
          float core = smoothstep(0.35, 0.0, d);
          float halo = pow(1.0 - d, 2.0);
          vec3 c = vColor * halo + mix(vColor, vec3(1.0), 0.6) * core;
          gl_FragColor = vec4(c * vDim, 1.0);
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      const cam = camera as THREE.PerspectiveCamera;
      const height = renderer.getDrawingBufferSize(this.bufferSize).y;
      const ratio = renderer.getPixelRatio();
      const u = material.uniforms;
      u.scale!.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      u.minSize!.value = MIN_DOT_PX * ratio;
      u.maxSize!.value = MAX_DOT_PX * ratio;
      u.time!.value = this.time;
      u.twinkle!.value = galaxyMapParams.twinkle;
      u.twinkleSpeed!.value = galaxyMapParams.twinkleSpeed;
      this.inverse.copy(this.points.matrixWorld).invert();
      this.cameraLocal.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this.inverse);
    };
    parent.add(this.points);

    const f = debug.folder('Galaxy stars');
    f?.add(galaxyMapParams, 'twinkle', 0, 0.6);
    f?.add(galaxyMapParams, 'twinkleSpeed', 0, 15);

    for (const g of galaxyGlows(galaxy.radius)) this.addGlow(g);
  }

  /** Dots drawn: one per star, two per binary. */
  get dotCount(): number {
    return this.points.geometry.getAttribute('position').count;
  }

  /** Stars (by id) that shine steadily instead of twinkling, e.g. the current and hovered one. */
  holdSteady(a: StarRef | null, b: StarRef | null): void {
    this.steady.set(a?.id ?? -1, b?.id ?? -1);
  }

  /** Fades `star`'s dot(s) out by `amount` (0–1), e.g. while a close-up of it takes over. */
  fade(star: StarRef | null, amount: number): void {
    this.faded.set(star && amount > 0 ? star.id : -1, amount);
  }

  /**
   * Moves the faded star's dots `amount` (0–1) of the way from their places
   * on the map to `members`, where its close-up draws its star(s) (galaxy
   * coordinates), so a binary's two dots become the close-up's two stars
   * instead of being seen beside them.
   */
  convergeTo(members: readonly THREE.Vector3[], amount: number): void {
    members.forEach((m, i) => this.closeUp[i]?.copy(m));
    // A single star's one dot: both slots the same.
    if (members.length === 1) this.closeUp[1]!.copy(members[0]!);
    this.converge.value = members.length > 0 ? amount : 0;
  }

  update(frameDt: number): void {
    // Not wrapped (binaries have unrelated periods); float32 keeps it smooth for many hours.
    this.time += frameDt;
  }

  dispose(): void {
    this.parent.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
    for (const g of this.glows) {
      this.parent.remove(g);
      g.geometry.dispose();
      g.material.dispose();
    }
  }

  private addGlow(g: GalaxyGlow): void {
    const radii = new THREE.Vector3(g.radii.x, g.radii.y, g.radii.z);
    const glow = createGlowVolume(radii, g.color, g.faceOnOpacity, g.maxBrightness, GLOW_NEAR);
    glow.renderOrder = -1;
    this.parent.add(glow);
    this.glows.push(glow);
  }
}
