import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import { groundDensity, PATH_SAMPLES, type AtmosphereLook } from '../gen/atmosphere';

/**
 * Tunables of the atmosphere shader (the look's shape comes from
 * gen/atmosphere.ts), shared as uniforms by every atmosphere, so the debug
 * panel changes them all at once.
 */
export const atmosphereUniforms = {
  intensity: { value: 1 },
  /** Brightness of the night side, relative to the day side. */
  night: { value: 0.06 },
  /** Strength of the warm band along the terminator. */
  dusk: { value: 0.8 },
  /** Extra glow looking towards the sun through the air (forward scattering). */
  forward: { value: 0.6 },
};

export function addAtmosphereDebug(debug: Debug): void {
  const f = debug.folder('Atmosphere');
  f?.add(atmosphereUniforms.intensity, 'value', 0, 3).name('intensity');
  f?.add(atmosphereUniforms.night, 'value', 0, 0.5).name('night');
  f?.add(atmosphereUniforms.dusk, 'value', 0, 3).name('dusk');
  f?.add(atmosphereUniforms.forward, 'value', 0, 3).name('forward');
}

/**
 * Atmospheres draw after the opaque scene (so they haze whatever is behind
 * them), and the ship draws after them: it flies inside the shell, and the
 * haze is integrated down to the ground, which would put the ship under it.
 */
export const ATMOSPHERE_RENDER_ORDER = 1;
export const AFTER_ATMOSPHERE_RENDER_ORDER = 2;

/**
 * Where the sun is: a world-space point (the star in the system view) or a
 * unit direction (the planet level's sunlight). The vector is used live, so
 * keep it updated rather than replacing it.
 */
export interface AtmosphereSun {
  vector: THREE.Vector3;
  point: boolean;
}

const MESH_MARGIN = 1.02;

/**
 * A soft atmosphere shell: each pixel integrates the density (falling off
 * exponentially with height, see gen/atmosphere.ts) along its view ray from
 * the camera or the shell's top to the ground or out the far side, and draws
 * the optical depth τ as haze: the scene behind is dimmed by e^(−τ) and the
 * air's own light, (1 − e^(−τ)) · tint, is added, bright by day, with a warm
 * band at dusk and a faint night side. The same shader works from outside
 * (front faces, depth-tested, so things in front hide it) and from inside
 * (back faces, drawn over the ground: the horizon hazes into the sky).
 *
 * `radius` is the planet's sea-level radius in the mesh's local units. The
 * mesh must be added straight to a (possibly moving, scaled) parent centred
 * on the planet; everything else is read from its world matrix.
 */
export function createAtmosphere(
  radius: number,
  color: string,
  look: AtmosphereLook,
  sun: AtmosphereSun,
  segments = 64,
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  // The polygons sit inside the sphere they approximate; push them out so the shell's true top is covered.
  const meshRadius = radius * look.top * MESH_MARGIN;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      duskColor: { value: new THREE.Color('#ff7a3d') },
      radius: { value: radius },
      top: { value: radius * look.top },
      meshRadius: { value: meshRadius },
      scaleHeight: { value: radius * look.scaleHeight },
      density: { value: groundDensity(look) / radius },
      sun: { value: sun.vector },
      sunIsPoint: { value: sun.point ? 1 : 0 },
      ...atmosphereUniforms,
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vCenter;
      varying float vScale;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vCenter = modelMatrix[3].xyz;
        vScale = length(modelMatrix[0].xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      #define SAMPLES ${PATH_SAMPLES}
      uniform vec3 color;
      uniform vec3 duskColor;
      uniform float radius;
      uniform float top;
      uniform float meshRadius;
      uniform float scaleHeight;
      uniform float density;
      uniform vec3 sun;
      uniform float sunIsPoint;
      uniform float intensity;
      uniform float night;
      uniform float dusk;
      uniform float forward;
      varying vec3 vWorld;
      varying vec3 vCenter;
      varying float vScale;

      // 1 at the ground, exactly 0 at the top (gen/atmosphere.ts relativeDensity).
      float relativeDensity(float r) {
        float edge = exp(-(top - radius) / scaleHeight);
        return max(0.0, (exp(-(r - radius) / scaleHeight) - edge) / (1.0 - edge));
      }

      void main() {
        vec3 center = vCenter;
        vec3 o = (cameraPosition - center) / vScale;
        vec3 d = normalize(vWorld - cameraPosition);
        float oo = dot(o, o);
        // Outside the mesh only its front faces count, inside only its back faces.
        if ((oo > meshRadius * meshRadius) != gl_FrontFacing) discard;

        // The ray's segment in the air: from the camera or the top to the ground or the far side.
        float b = dot(o, d);
        float shell = b * b - (oo - top * top);
        if (shell <= 0.0) discard;
        float t0 = max(-b - sqrt(shell), 0.0);
        float t1 = -b + sqrt(shell);
        if (t1 <= 0.0) discard;
        float ground = b * b - (oo - radius * radius);
        if (ground > 0.0) {
          float tg = -b - sqrt(ground);
          if (tg > 0.0) t1 = min(t1, tg);
        }
        // Split where the ray comes closest (densest), sample each half with t ∝ u² (gen/atmosphere.ts pathOpticalDepth).
        float tc = clamp(-b, t0, t1);
        vec3 L = sunIsPoint > 0.5 ? normalize(sun - center) : sun;
        float column = 0.0;
        float lit = 0.0;
        float warm = 0.0;
        for (int i = 0; i < SAMPLES; i++) {
          float u = (float(i) + 0.5) / float(SAMPLES);
          for (int j = 0; j < 2; j++) {
            float len = j == 0 ? t0 - tc : t1 - tc;
            vec3 p = o + d * (tc + len * u * u);
            float r = length(p);
            float w = relativeDensity(r) * 2.0 * abs(len) * u;
            float mu = dot(p, L) / r;
            column += w;
            lit += w * smoothstep(-0.3, 0.25, mu);
            warm += w * exp(-pow((mu - 0.03) / 0.15, 2.0));
          }
        }
        if (column <= 0.0) discard;
        float tau = column * density / float(SAMPLES);
        float alpha = 1.0 - exp(-tau);
        float day = mix(night, 1.0, lit / column);
        float fwd = 1.0 + forward * pow(max(dot(d, L), 0.0), 8.0) * day;
        vec3 light = (color * day + duskColor * dusk * warm / column) * fwd * intensity;
        // Premultiplied: the blend dims what's behind by e^(-tau) and adds the air's light.
        gl_FragColor = vec4(light * alpha, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(meshRadius, segments, segments / 2), material);
  mesh.name = 'Atmosphere';
  mesh.renderOrder = ATMOSPHERE_RENDER_ORDER;
  const centre = new THREE.Vector3();
  mesh.onBeforeRender = (_renderer, _scene, camera) => {
    // From inside the haze is drawn over the ground, which is nearer than the shell's far side.
    mesh.getWorldPosition(centre);
    const scale = mesh.matrixWorld.getMaxScaleOnAxis();
    material.depthTest = camera.position.distanceToSquared(centre) > (meshRadius * scale) ** 2;
  };
  return mesh;
}

