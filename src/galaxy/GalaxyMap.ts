import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { GalaxyData } from '../gen/galaxy';
import { galaxyStarSize } from './appearance';
import { createGlowVolume } from './glowVolume';

/** Dots never get smaller or bigger than this on screen, in CSS pixels. */
const MIN_DOT_PX = 2;
const MAX_DOT_PX = 64;
/**
 * Glow closer to the camera than this is left out (see createGlowVolume), so
 * the view from inside the disc isn't fogged; ~10 star spacings.
 */
const GLOW_NEAR = 250;

/**
 * The galaxy as seen from outside: every star as one soft, additive dot
 * (a single Points draw), plus glowing volumes for the disc and the bulge
 * (so the glow reads from any angle, including edge-on).
 * Dots have a size in galaxy units, so nearby stars look bigger.
 */
export class GalaxyMap implements Entity {
  /** Star positions as xyz triples, indexed like `galaxy.stars`. */
  readonly positions: Float32Array;
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly glows: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>[] = [];
  private readonly bufferSize = new THREE.Vector2();

  constructor(
    private readonly scene: THREE.Scene,
    galaxy: GalaxyData,
  ) {
    const n = galaxy.stars.length;
    this.positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const color = new THREE.Color();
    galaxy.stars.forEach((ref, i) => {
      this.positions.set([ref.position.x, ref.position.y, ref.position.z], i * 3);
      color.set(ref.stars[0]!.color).toArray(colors, i * 3);
      sizes[i] = galaxyStarSize(ref);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        // Pixels per world unit at distance 1; set per frame from the camera and canvas.
        scale: { value: 1 },
        minSize: { value: MIN_DOT_PX },
        maxSize: { value: MAX_DOT_PX },
      },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        uniform float scale;
        uniform float minSize;
        uniform float maxSize;
        varying vec3 vColor;
        varying float vDim;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float px = size * scale / -mv.z;
          gl_PointSize = clamp(px, minSize, maxSize);
          // Dots clamped up to the minimum size get dimmer instead of bigger.
          vDim = clamp(px / minSize, 0.6, 1.0);
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
      material.uniforms.scale!.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      material.uniforms.minSize!.value = MIN_DOT_PX * ratio;
      material.uniforms.maxSize!.value = MAX_DOT_PX * ratio;
    };
    scene.add(this.points);

    // Faint light over the whole, thin disc and a warmer, brighter, flattened bulge
    // (matching the star distributions in gen/galaxy.ts).
    const r = galaxy.radius;
    this.addGlow(new THREE.Vector3(r * 1.3, r * 0.06, r * 1.3), '#6f86c8', 0.16, 0.28);
    this.addGlow(new THREE.Vector3(r * 0.45, r * 0.2, r * 0.45), '#ffd9a0', 0.45, 0.8);
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
    for (const g of this.glows) {
      this.scene.remove(g);
      g.geometry.dispose();
      g.material.dispose();
    }
  }

  private addGlow(radii: THREE.Vector3, color: string, faceOnOpacity: number, maxBrightness: number): void {
    const glow = createGlowVolume(radii, color, faceOnOpacity, maxBrightness, GLOW_NEAR);
    glow.renderOrder = -1;
    this.scene.add(glow);
    this.glows.push(glow);
  }
}
