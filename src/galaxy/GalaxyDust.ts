import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { DustCloud } from '../gen/galaxy';

/** Brightness of a single cloud seen face-on; overlapping clouds add up. */
const CLOUD_INTENSITY = 0.05;
/** Clouds fade out between these camera distances, so nearby space stays clear. */
const FADE_NEAR = 150;
const FADE_FAR = 350;
/** Thinnest a cloud gets when the disc is seen exactly edge-on (fraction of its width). */
const MIN_THICKNESS = 0.12;
/**
 * Dust fades in between these fractions of the galaxy radius: the arms are
 * packed tightly near the bulge, where overlapping clouds would pile up.
 */
const INNER_FADE: readonly [number, number] = [0.08, 0.4];

/**
 * Glowing gas along the spiral arms: large, faint, additive soft clouds,
 * drawn as one instanced batch of camera-facing quads. Clouds are thin sheets
 * in the galactic plane, so each quad is squashed vertically by how edge-on
 * the view is (the orbit camera never rolls, so view-up is world-up).
 * Edge-on, the arms merge into the disc's band instead of standing out as
 * round puffs. Squashing the quad itself (rather than discarding pixels of a
 * square point sprite) keeps the fill cost low; faded-out clouds are
 * collapsed to nothing.
 */
export class GalaxyDust implements Entity {
  private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor(
    private readonly scene: THREE.Scene,
    clouds: readonly DustCloud[],
    galaxyRadius: number,
  ) {
    const centers = new Float32Array(clouds.length * 3);
    const colors = new Float32Array(clouds.length * 3);
    const sizes = new Float32Array(clouds.length);
    const color = new THREE.Color();
    clouds.forEach((c, i) => {
      centers.set([c.position.x, c.position.y, c.position.z], i * 3);
      const r = Math.hypot(c.position.x, c.position.z) / galaxyRadius;
      const inner = THREE.MathUtils.smoothstep(r, INNER_FADE[0], INNER_FADE[1]);
      color.set(c.color).multiplyScalar(0.15 + 0.85 * inner).toArray(colors, i * 3);
      sizes[i] = c.size;
    });

    // One unit quad (corners at ±0.5), instanced per cloud.
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('center', new THREE.InstancedBufferAttribute(centers, 3));
    geometry.setAttribute('cloudColor', new THREE.InstancedBufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.InstancedBufferAttribute(sizes, 1));
    geometry.instanceCount = clouds.length;

    const material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 center;
        attribute vec3 cloudColor;
        attribute float size;
        varying vec3 vColor;
        varying vec2 vCorner;
        void main() {
          vec4 world = modelMatrix * vec4(center, 1.0);
          vec3 toCloud = world.xyz - cameraPosition;
          float dist = length(toCloud);
          float fade = smoothstep(${FADE_NEAR.toFixed(1)}, ${FADE_FAR.toFixed(1)}, dist);
          if (fade <= 0.0) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume: nothing drawn
            return;
          }
          // |sin(elevation)| of the view: 1 face-on, 0 edge-on.
          float thickness = max(abs(toCloud.y) / dist, ${MIN_THICKNESS});
          vec4 mv = viewMatrix * world;
          mv.xy += position.xy * size * vec2(1.0, thickness);
          vCorner = position.xy * 2.0;
          vColor = cloudColor * ${CLOUD_INTENSITY} * fade;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying vec2 vCorner;
        void main() {
          float r2 = dot(vCorner, vCorner);
          if (r2 > 1.0) discard;
          // Gaussian falloff, ~2% at the edge.
          gl_FragColor = vec4(vColor * exp(-4.0 * r2), 1.0);
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
