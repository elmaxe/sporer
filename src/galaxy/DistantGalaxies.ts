import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { DistantGalaxy, DistantGalaxyKind } from '../gen/distantGalaxies';

/** Distance of the sky shell from the camera: beyond everything, inside the far plane (20000). */
const SKY_RADIUS = 9000;
const KIND_INDEX: Record<DistantGalaxyKind, number> = { spiral: 0, elliptical: 1, edgeOn: 2, irregular: 3 };

export const distantGalaxyParams = {
  /** Overall brightness; kept low so our own galaxy dominates. */
  intensity: 0.8,
};

/**
 * Other galaxies on the galaxy map's sky: one instanced draw of camera-facing
 * quads on a camera-centred shell (a skybox, no parallax), each shaped
 * procedurally in the fragment shader: log-spiral arms over an exponential
 * disc and a warm bulge, Sérsic-like ellipticals, thin edge-on discs with a
 * dust lane, and clumpy irregulars. No textures. Lives in the scene, not the
 * galaxy's rotating root, so the universe stays put while the galaxy turns.
 */
export class DistantGalaxies implements Entity {
  private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor(
    private readonly scene: THREE.Scene,
    galaxies: readonly DistantGalaxy[],
    debug: Debug,
  ) {
    const n = galaxies.length;
    const dirs = new Float32Array(n * 3);
    const shapes = new Float32Array(n * 4);
    const looks = new Float32Array(n * 4);
    const tints = new Float32Array(n * 3);
    const color = new THREE.Color();
    galaxies.forEach((g, i) => {
      dirs.set([g.direction.x, g.direction.y, g.direction.z], i * 3);
      shapes.set([KIND_INDEX[g.kind], g.size, g.rotation, Math.cos(g.tilt)], i * 4);
      looks.set([g.arms, g.winding, g.brightness, g.seed], i * 4);
      color.set(g.color).toArray(tints, i * 3);
    });

    const quad = new THREE.PlaneGeometry(2, 2);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('dir', new THREE.InstancedBufferAttribute(dirs, 3));
    geometry.setAttribute('shape', new THREE.InstancedBufferAttribute(shapes, 4));
    geometry.setAttribute('look', new THREE.InstancedBufferAttribute(looks, 4));
    geometry.setAttribute('tint', new THREE.InstancedBufferAttribute(tints, 3));
    geometry.instanceCount = n;

    const material = new THREE.ShaderMaterial({
      uniforms: { intensity: { value: distantGalaxyParams.intensity } },
      vertexShader: /* glsl */ `
        attribute vec3 dir;
        attribute vec4 shape;   // kind, angular radius, position angle, cos(tilt)
        attribute vec4 look;    // arms, winding, brightness, seed
        attribute vec3 tint;
        varying vec2 vUv;
        varying float vKind;
        varying float vCosTilt;
        varying vec4 vLook;
        varying vec3 vTint;
        void main() {
          vec3 d = normalize(dir);
          vec3 ref = abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 right = normalize(cross(ref, d));
          // Wound so the quad faces the camera (its normal, right × up, is -d).
          vec3 up = cross(right, d);
          float c = cos(shape.z);
          float s = sin(shape.z);
          vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
          vec3 world = cameraPosition + (d + (right * q.x + up * q.y) * tan(shape.y)) * ${SKY_RADIUS.toFixed(1)};
          vUv = position.xy;
          vKind = shape.x;
          vCosTilt = shape.w;
          vLook = look;
          vTint = tint;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float intensity;
        varying vec2 vUv;
        varying float vKind;
        varying float vCosTilt;
        varying vec4 vLook;
        varying vec3 vTint;

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          return 0.5 * noise(p) + 0.3 * noise(p * 2.03 + 7.1) + 0.2 * noise(p * 4.01 + 3.7);
        }

        const vec3 BULGE = vec3(1.0, 0.86, 0.62);

        void main() {
          vec2 p = vUv;
          float seed = vLook.w;
          float b = 0.0;
          vec3 col = vTint;
          if (vKind < 0.5) {
            // Spiral: deproject the tilted disc, then log-spiral arms (theta + winding·ln r = const).
            vec2 q = vec2(p.x, p.y / max(vCosTilt, 0.12));
            float r = length(q);
            float th = atan(q.y, q.x);
            float arms = pow(0.5 + 0.5 * cos(vLook.x * (th - vLook.y * log(r + 0.03))), 2.5);
            float clumps = 0.55 + 0.9 * fbm(q * 5.0 + seed);
            float disc = exp(-r * 4.5) * (0.2 + 1.1 * arms * clumps);
            float bulge = exp(-r * r * 90.0);
            b = disc + 1.3 * bulge;
            col = mix(vTint, BULGE, clamp(bulge * 1.3 / max(b, 1e-4), 0.0, 1.0));
          } else if (vKind < 1.5) {
            // Elliptical: a smooth, Sérsic-like (n = 2) blob, squashed by the tilt.
            vec2 q = vec2(p.x, p.y / max(vCosTilt, 0.45));
            b = exp(-3.67 * sqrt(length(q) / 0.28));
          } else if (vKind < 2.5) {
            // Edge-on disc: thin and long, a bulge, and a dark dust lane just off the midplane.
            float h = 0.045 + 0.25 * vCosTilt;
            float disc = exp(-abs(p.x) * 3.8) * exp(-abs(p.y) / h) * (0.8 + 0.4 * fbm(vec2(p.x * 8.0, p.y * 3.0) + seed));
            float bulge = exp(-(p.x * p.x + p.y * p.y * 2.5) * 45.0);
            float lane = 1.0 - 0.8 * exp(-pow((p.y - 0.25 * h) / (0.4 * h), 2.0)) * smoothstep(0.85, 0.05, abs(p.x));
            b = (disc + 1.2 * bulge) * lane;
            col = mix(vTint, BULGE, clamp(bulge * 1.2 / max(disc + 1.2 * bulge, 1e-4), 0.0, 1.0));
          } else {
            // Irregular: clumpy, lopsided star-forming knots.
            vec2 q = vec2(p.x, p.y / max(vCosTilt, 0.4)) + (vec2(noise(p * 2.0 + seed), noise(p * 2.0 - seed)) - 0.5) * 0.35;
            float r = length(q);
            float knots = pow(fbm(q * 6.0 + seed * 1.7), 3.0) * 4.0;
            b = exp(-r * r * 6.0) * (0.15 + knots);
          }
          // Soft edge, so the quad never shows.
          b *= smoothstep(1.0, 0.75, length(p));
          gl_FragColor = vec4(col * b * vLook.z * intensity, 1.0);
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -2;
    scene.add(this.mesh);

    debug.folder('Distant galaxies')?.add(distantGalaxyParams, 'intensity', 0, 2);
  }

  /** Number of galaxies drawn (for debugging and the smoke test). */
  get count(): number {
    return this.mesh.geometry.instanceCount;
  }

  update(): void {
    this.mesh.material.uniforms.intensity!.value = distantGalaxyParams.intensity;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
