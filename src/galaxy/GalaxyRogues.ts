import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { GalaxyData, StarRef } from '../gen/galaxy';
import { generateSystem } from '../gen/system';
import { STAR_DIMMING_GLSL, starDimmingUniforms } from '../world/nebulaLook';
import { ROGUE_DOT_SIZE, rogueColor } from './appearance';

/** A rogue's ring never gets smaller or bigger than this on screen, in CSS pixels. */
const MIN_RING_PX = 5;
const MAX_RING_PX = 40;

export const galaxyRogueParams = {
  /** How bright the rings are (stars' dots are 1). */
  brightness: 0.75,
  /** Seconds per slow swell of the ring's glow. */
  pulse: 6,
};

/**
 * The rogue planets on the galaxy map: faint, hollow rings in their
 * surface's colour, not star-like dots, with a dark middle and a slow swell
 * instead of a twinkle (one `Points` draw). Like the stars, they dim behind
 * dark nebulas, and one fades out while the ship dives into it. Lives in
 * the galaxy's rotating root, in galaxy coordinates.
 */
export class GalaxyRogues implements Entity {
  /** Positions as xyz triples, indexed like `galaxy.rogues`. */
  readonly positions: Float32Array;
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly bufferSize = new THREE.Vector2();
  private readonly faded = new THREE.Vector2(-1, 0);
  private readonly cameraLocal = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private time = 0;

  constructor(
    private readonly parent: THREE.Object3D,
    galaxy: GalaxyData,
    debug: Debug,
  ) {
    const n = galaxy.rogues.length;
    this.positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const ids = new Float32Array(n);
    const color = new THREE.Color();
    galaxy.rogues.forEach((ref, i) => {
      const { x, y, z } = ref.position;
      this.positions.set([x, y, z], i * 3);
      // A handful of one-planet systems: cheap to generate up front for their colour.
      color.set(rogueColor(generateSystem(ref).planets[0]!.type)).toArray(colors, i * 3);
      ids[i] = ref.id;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('rogueId', new THREE.BufferAttribute(ids, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        scale: { value: 1 },
        size: { value: ROGUE_DOT_SIZE },
        minSize: { value: MIN_RING_PX },
        maxSize: { value: MAX_RING_PX },
        brightness: { value: galaxyRogueParams.brightness },
        time: { value: 0 },
        pulse: { value: galaxyRogueParams.pulse },
        faded: { value: this.faded },
        cameraLocal: { value: this.cameraLocal },
        ...starDimmingUniforms(galaxy.nebulas),
      },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute float rogueId;
        uniform float scale;
        uniform float size;
        uniform float minSize;
        uniform float maxSize;
        uniform float brightness;
        uniform float time;
        uniform float pulse;
        uniform vec2 faded;
        uniform vec3 cameraLocal;
        varying vec3 vColor;
        varying float vDim;
        ${STAR_DIMMING_GLSL}
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float px = size * scale / -mv.z;
          gl_PointSize = clamp(px, minSize, maxSize);
          // A slow swell, out of step between rogues.
          float phase = fract(rogueId * 0.6180339) * 6.2832;
          vDim = brightness * (0.8 + 0.2 * sin(time * 6.2832 / pulse + phase));
          if (abs(rogueId - faded.x) < 0.5) vDim *= 1.0 - faded.y;
          vDim *= starDimming(cameraLocal, position);
          vColor = color;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vDim;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          // A thin bright rim round a dark disc (the planet's night side), with a faint halo outside it.
          float rim = smoothstep(0.42, 0.62, d) * (1.0 - smoothstep(0.62, 0.8, d));
          float halo = 0.25 * (1.0 - smoothstep(0.62, 1.0, d));
          gl_FragColor = vec4(vColor * (rim + halo) * vDim, 1.0);
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'Rogue planets';
    this.points.frustumCulled = false;
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      const cam = camera as THREE.PerspectiveCamera;
      const height = renderer.getDrawingBufferSize(this.bufferSize).y;
      const ratio = renderer.getPixelRatio();
      const u = material.uniforms;
      u.scale!.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      u.minSize!.value = MIN_RING_PX * ratio;
      u.maxSize!.value = MAX_RING_PX * ratio;
      u.brightness!.value = galaxyRogueParams.brightness;
      u.pulse!.value = galaxyRogueParams.pulse;
      u.time!.value = this.time;
      this.inverse.copy(this.points.matrixWorld).invert();
      this.cameraLocal.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this.inverse);
    };
    parent.add(this.points);

    const f = debug.folder('Galaxy rogues');
    f?.add(galaxyRogueParams, 'brightness', 0, 2);
    f?.add(galaxyRogueParams, 'pulse', 1, 20);
    f?.add(this.points, 'visible').name('show');
  }

  /** Fades `ref`'s ring out by `amount` (0–1), e.g. while the ship dives into it. Stars are ignored. */
  fade(ref: StarRef | null, amount: number): void {
    this.faded.set(ref && amount > 0 ? ref.id : -1, amount);
  }

  update(frameDt: number): void {
    this.time += frameDt;
  }

  dispose(): void {
    this.parent.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
