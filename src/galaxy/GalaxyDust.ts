import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { DustCloud } from '../gen/galaxy';
import { GAUSSIAN_K, GAUSSIAN_PATH_GLSL } from './glowVolume';

/** Brightness of a single cloud at its centre, seen face-on; overlapping clouds add up. */
const CLOUD_INTENSITY = 0.04;
/**
 * Soft limit on how much brighter a cloud gets along a long path through it
 * (edge-on, or end-on along the arm): at most 1 / (1 - e^-SATURATION) ≈ 1.16×
 * its face-on brightness. Along the disc many clouds line up and add, so
 * each one must not brighten much on its own.
 */
const SATURATION = 2;
/** Clouds fade out between these camera distances, so nearby space stays clear. */
const FADE_NEAR = 150;
const FADE_FAR = 350;
/**
 * Dust fades in between these fractions of the galaxy radius: the arms are
 * packed tightly near the bulge, where overlapping clouds would pile up.
 */
const INNER_FADE: readonly [number, number] = [0.08, 0.4];
/** The low-poly hull is a bit bigger than the ellipsoid, so it contains its Gaussian (~1% at the ellipsoid). */
const HULL_SCALE = 1.15;

/**
 * Glowing gas along the spiral arms. Each cloud is a real 3D Gaussian
 * ellipsoid (long along its arm, flat like the disc) drawn as one instance of
 * a low-poly hull; the fragment shader integrates the gas along the view ray
 * in closed form, so clouds change shape as the camera moves around them and
 * overlap in depth. All clouds are one instanced draw. Clouds near the camera
 * fade out and are culled once invisible.
 */
export class GalaxyDust implements Entity {
  private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor(
    private readonly scene: THREE.Scene,
    clouds: readonly DustCloud[],
    galaxyRadius: number,
  ) {
    const n = clouds.length;
    const centers = new Float32Array(n * 3);
    const radii = new Float32Array(n * 3);
    const angles = new Float32Array(n);
    const colors = new Float32Array(n * 3);
    const color = new THREE.Color();
    clouds.forEach((c, i) => {
      centers.set([c.position.x, c.position.y, c.position.z], i * 3);
      // Semi-axes in the cloud's frame: x along the arm, y up, z across.
      radii.set([c.length / 2, c.thickness / 2, c.width / 2], i * 3);
      angles[i] = c.angle;
      const r = Math.hypot(c.position.x, c.position.z) / galaxyRadius;
      const inner = THREE.MathUtils.smoothstep(r, INNER_FADE[0], INNER_FADE[1]);
      color.set(c.color).multiplyScalar(0.15 + 0.85 * inner).toArray(colors, i * 3);
    });

    const hull = new THREE.IcosahedronGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('position', hull.getAttribute('position'));
    geometry.setAttribute('center', new THREE.InstancedBufferAttribute(centers, 3));
    geometry.setAttribute('radii', new THREE.InstancedBufferAttribute(radii, 3));
    geometry.setAttribute('angle', new THREE.InstancedBufferAttribute(angles, 1));
    geometry.setAttribute('cloudColor', new THREE.InstancedBufferAttribute(colors, 3));
    geometry.instanceCount = n;

    const material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec3 center;
        attribute vec3 radii;
        attribute float angle;
        attribute vec3 cloudColor;
        varying vec3 vWorld;
        varying vec3 vCenter;
        varying vec3 vRadii;
        varying vec2 vRot;
        varying vec3 vColor;
        void main() {
          float fade = smoothstep(${FADE_NEAR.toFixed(1)}, ${FADE_FAR.toFixed(1)}, distance(center, cameraPosition));
          if (fade <= 0.0) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume: nothing drawn
            return;
          }
          // Rotation about +Y by 'angle' (maps +X to (cos, 0, -sin)).
          float c = cos(angle);
          float s = sin(angle);
          vec3 local = position * radii * ${HULL_SCALE};
          vec3 world = center + vec3(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
          vWorld = world;
          vCenter = center;
          vRadii = radii;
          vRot = vec2(c, s);
          vColor = cloudColor * ${CLOUD_INTENSITY} * fade;
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld;
        varying vec3 vCenter;
        varying vec3 vRadii;
        varying vec2 vRot;
        varying vec3 vColor;
        ${GAUSSIAN_PATH_GLSL}

        // World → the cloud's frame (the inverse of the rotation in the vertex shader).
        vec3 toLocal(vec3 v) {
          return vec3(vRot.x * v.x - vRot.y * v.z, v.y, vRot.y * v.x + vRot.x * v.z);
        }

        void main() {
          vec3 o = toLocal(cameraPosition - vCenter) / vRadii;
          vec3 d = toLocal(normalize(vWorld - cameraPosition)) / vRadii;
          float path = gaussianPath(o, d, ${GAUSSIAN_K.toFixed(1)}, 0.0);
          // 1 through the centre seen face-on (along y), more along longer paths.
          float n = path / (vRadii.y * ${Math.sqrt(Math.PI / GAUSSIAN_K).toFixed(6)});
          float brightness = (1.0 - exp(-n * ${SATURATION.toFixed(1)})) / ${(1 - Math.exp(-SATURATION)).toFixed(6)};
          gl_FragColor = vec4(vColor * brightness, 1.0);
          #include <colorspace_fragment>
        }`,
      // Back faces cover the cloud even if the camera gets inside it.
      side: THREE.BackSide,
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
