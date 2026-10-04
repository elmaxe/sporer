import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { DustCloud } from '../gen/galaxy';
import { GAUSSIAN_K, GAUSSIAN_PATH_GLSL } from './glowVolume';

export const galaxyDustParams = {
  /** Brightness of a single gas cloud at its centre, seen face-on; overlapping clouds add up. */
  cloudIntensity: 0.04,
  /** The same for the arms' haze (big, faint clouds). */
  hazeIntensity: 0.02,
};

/**
 * Soft limit on how much brighter a glowing cloud gets along a long path
 * through it (edge-on, or end-on along the arm): at most 1 / (1 - e^-SATURATION)
 * ≈ 1.16× its face-on brightness. Along the disc many clouds line up and add,
 * so each one must not brighten much on its own.
 */
const SATURATION = 2;
/**
 * The arms' gas as a whole is a slab that absorbs some of its own light:
 * seen at a slant (|μ| = sine of the angle to the disc), each cloud is
 * dimmed by (1 - e^(-τ/|μ|))·|μ|/τ (relative to face-on), so the many
 * clouds that line up edge-on level off instead of piling up into white.
 * |μ| stops at MIN_MU, about the arms' thickness over their length, as a
 * finite disc only lines up so many.
 */
const SLAB_TAU = 0.5;
const MIN_MU = 0.1;
const slab = (mu: number) => ((1 - Math.exp(-SLAB_TAU / mu)) * mu) / SLAB_TAU;
/** Clouds fade out between these camera distances, so nearby space stays clear. */
const FADE_NEAR = 150;
const FADE_FAR = 350;
/**
 * Glowing gas fades in between these fractions of the galaxy radius: the arms
 * are packed tightly near the bulge, where overlapping clouds would pile up.
 */
const INNER_FADE: readonly [number, number] = [0.08, 0.4];
/** The low-poly hull is a bit bigger than the ellipsoid, so it contains its Gaussian (~1% at the ellipsoid). */
const HULL_SCALE = 1.15;
/** √(π/K): the Gaussian's column through its centre, per unit of radius. */
const UNIT_COLUMN = Math.sqrt(Math.PI / GAUSSIAN_K).toFixed(6);

type Layer = 'gas' | 'haze';

/**
 * The spiral arms' gas, two layers of Gaussian ellipsoids (long along their
 * arm, flatter than wide): puffy glowing gas clouds and a faint haze of big,
 * thick clouds round them. Each layer is one instanced draw of a low-poly
 * hull; the fragment shader integrates the gas along the view ray in closed
 * form, so clouds change shape as the camera moves round them and overlap in
 * depth. Clouds near the camera fade out and are culled once invisible. The
 * gas is drawn with the scene; the haze, soft and big on screen, in the
 * nebulas' reduced-resolution pass.
 */
export class GalaxyDust implements Entity {
  private readonly meshes: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>[];
  /** The camera in the parent's (galaxy) coordinates, where the clouds are defined. */
  private readonly cameraLocal = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();

  constructor(
    private readonly parent: THREE.Object3D,
    layers: { gas: readonly DustCloud[]; haze: readonly DustCloud[] },
    galaxyRadius: number,
    /**
     * Galaxy coordinates in a reduced-resolution pass (GalaxyNebulas.frame)
     * for the haze: at full resolution it cost ~70 ms a frame under
     * SwiftShader, a third of the whole galaxy view.
     */
    private readonly lowRes: THREE.Object3D,
    debug: Debug,
  ) {
    this.meshes = (['gas', 'haze'] as const).map((layer) => this.createLayer(layer, layers[layer], galaxyRadius));
    const f = debug.folder('Galaxy dust');
    f?.add(galaxyDustParams, 'cloudIntensity', 0, 0.15).name('gas');
    f?.add(galaxyDustParams, 'hazeIntensity', 0, 0.06).name('haze');
    f?.add(this, 'visible');
  }

  /** Shown or hidden (to measure what they cost). */
  set visible(v: boolean) {
    for (const m of this.meshes) m.visible = v;
  }

  get visible(): boolean {
    return this.meshes[0]!.visible;
  }

  /** Clouds in each layer. */
  get counts(): { gas: number; haze: number } {
    const [gas, haze] = this.meshes.map((m) => m.geometry.instanceCount);
    return { gas: gas!, haze: haze! };
  }

  update(): void {
    const [gas, haze] = this.meshes;
    gas!.material.uniforms.strength!.value = galaxyDustParams.cloudIntensity;
    haze!.material.uniforms.strength!.value = galaxyDustParams.hazeIntensity;
  }

  dispose(): void {
    for (const m of this.meshes) {
      m.removeFromParent();
      m.geometry.dispose();
      m.material.dispose();
    }
  }

  private createLayer(
    layer: Layer,
    clouds: readonly DustCloud[],
    galaxyRadius: number,
  ): THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> {
    const lowRes = layer === 'haze';
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
    hull.dispose();

    const material = new THREE.ShaderMaterial({
      uniforms: { cameraLocal: { value: this.cameraLocal }, strength: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform vec3 cameraLocal;
        attribute vec3 center;
        attribute vec3 radii;
        attribute float angle;
        attribute vec3 cloudColor;
        varying vec3 vLocal;
        varying vec3 vCenter;
        varying vec3 vRadii;
        varying vec2 vRot;
        varying vec3 vColor;
        varying float vFade;
        void main() {
          // Gas fades by the distance to its centre; the big haze clouds once the camera nears their edge.
          float reach = max(distance(center, cameraLocal) - ${layer === 'gas' ? '0.0' : 'max(radii.x, radii.z)'}, 0.0);
          float fade = smoothstep(${FADE_NEAR.toFixed(1)}, ${FADE_FAR.toFixed(1)}, reach);
          if (fade <= 0.0) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside the clip volume: nothing drawn
            return;
          }
          // Rotation about +Y by 'angle' (maps +X to (cos, 0, -sin)).
          float c = cos(angle);
          float s = sin(angle);
          vec3 local = position * radii * ${HULL_SCALE};
          vec3 galaxy = center + vec3(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
          vLocal = galaxy;
          vCenter = center;
          vRadii = radii;
          vRot = vec2(c, s);
          vColor = cloudColor;
          vFade = fade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(galaxy, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 cameraLocal;
        uniform float strength;
        varying vec3 vLocal;
        varying vec3 vCenter;
        varying vec3 vRadii;
        varying vec2 vRot;
        varying vec3 vColor;
        varying float vFade;
        ${GAUSSIAN_PATH_GLSL}

        // Galaxy → the cloud's frame (the inverse of the rotation in the vertex shader).
        vec3 toLocal(vec3 v) {
          return vec3(vRot.x * v.x - vRot.y * v.z, v.y, vRot.y * v.x + vRot.x * v.z);
        }

        void main() {
          vec3 o = toLocal(cameraLocal - vCenter) / vRadii;
          vec3 d = toLocal(normalize(vLocal - cameraLocal)) / vRadii;
          float path = gaussianPath(o, d, ${GAUSSIAN_K.toFixed(1)}, 0.0);
          // 1 through the centre seen face-on (along y), more along longer paths.
          float n = path / (vRadii.y * ${UNIT_COLUMN});
          // Softly saturating along long paths, and dimmer the flatter the view (see SLAB_TAU).
          float brightness = (1.0 - exp(-n * ${SATURATION.toFixed(1)})) / ${(1 - Math.exp(-SATURATION)).toFixed(6)};
          float mu = max(abs(normalize(vLocal - cameraLocal).y), ${MIN_MU.toFixed(2)});
          brightness *= (1.0 - exp(-${SLAB_TAU.toFixed(2)} / mu)) * mu / ${(SLAB_TAU * slab(1)).toFixed(6)};
          gl_FragColor = vec4(vColor * strength * vFade * brightness, 1.0);
          ${
            lowRes
              ? // Into a linear target that's laid over the canvas as it is: encode for the canvas here.
                'gl_FragColor.rgb = sRGBTransferOETF(gl_FragColor).rgb;'
              : '#include <colorspace_fragment>'
          }
        }`,
      // Back faces cover the cloud even if the camera gets inside it.
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    if (lowRes) {
      // Adds light to the pass, leaving its alpha (the nebulas' transmittance, see applyNebulaBlending) as it is.
      material.blending = THREE.CustomBlending;
      material.blendEquation = THREE.AddEquation;
      material.blendSrc = THREE.OneFactor;
      material.blendDst = THREE.OneFactor;
      material.blendSrcAlpha = THREE.ZeroFactor;
      material.blendDstAlpha = THREE.OneFactor;
    } else {
      material.blending = THREE.AdditiveBlending;
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Galaxy ${layer}`;
    mesh.frustumCulled = false;
    // The gas with the disc's glows (-1); the haze before the nebulas (0) in their pass, which dim it behind their dust.
    mesh.renderOrder = -1;
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
      this.inverse.copy(mesh.matrixWorld).invert();
      this.cameraLocal.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(this.inverse);
    };
    (lowRes ? this.lowRes : this.parent).add(mesh);
    return mesh;
  }
}
