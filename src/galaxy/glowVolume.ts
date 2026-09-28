import * as THREE from 'three';

/**
 * Density falls off as exp(-K·r²) in the ellipsoid's unit space, so it is
 * ~1% at `radii` (σ = 1/3 of each radius).
 */
const K = 4.5;
/**
 * The mesh is this much bigger than `radii`, so the density has fallen to
 * ~1e-6 at its surface. Cutting the Gaussian off at `radii` (~1%) left a
 * visible outline.
 */
const MESH_SCALE = 1.8;

/**
 * A glowing, axis-aligned Gaussian "gas" ellipsoid centred at the origin.
 * Each pixel integrates the density along its view ray in closed form (with
 * erfc), so the glow looks right from any angle and from inside: round seen
 * face-on, a bright thin band seen edge-on. Brightness saturates softly as
 * `maxBrightness` · (1 - exp(-density · path)), so long paths (edge-on, or
 * looking along the disc from inside it) level off instead of washing out.
 *
 * Gas closer to the camera than `near` doesn't glow. From inside the disc
 * that keeps the view clear nearby while the distant disc still shows as a
 * band along the horizon; from outside it changes nothing.
 *
 * `faceOnOpacity` is the brightness at the centre when viewed along y; it
 * must be below `maxBrightness`.
 */
export function createGlowVolume(
  radii: THREE.Vector3,
  color: THREE.ColorRepresentation,
  faceOnOpacity: number,
  maxBrightness: number,
  near: number,
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  // Path integral through the centre along y is ry·√(π/K); pick the density
  // that makes that column come out at `faceOnOpacity`.
  const faceOnColumn = radii.y * Math.sqrt(Math.PI / K);
  const density = -Math.log(1 - faceOnOpacity / maxBrightness) / faceOnColumn;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      radii: { value: radii.clone() },
      color: { value: new THREE.Color(color) },
      density: { value: density },
      maxBrightness: { value: maxBrightness },
      near: { value: near },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 radii;
      uniform vec3 color;
      uniform float density;
      uniform float maxBrightness;
      uniform float near;
      varying vec3 vWorld;

      // Abramowitz & Stegun 7.1.26, |error| < 1.5e-7.
      float erfc_(float x) {
        float z = abs(x);
        float t = 1.0 / (1.0 + 0.3275911 * z);
        float y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
        float r = y * exp(-z * z);
        return x >= 0.0 ? r : 2.0 - r;
      }

      void main() {
        // Ray from the camera in the ellipsoid's unit space; t stays in world units.
        vec3 o = cameraPosition / radii;
        vec3 d = normalize(vWorld - cameraPosition) / radii;
        float a = dot(d, d);
        float m = dot(o, d) / a;              // t of closest approach is -m
        float perp2 = max(dot(o, o) - m * m * a, 0.0);
        // ∫_near^∞ exp(-K |o + t d|²) dt: the ray from 'near' in front of the camera onwards.
        float ka = ${K.toFixed(1)} * a;
        float path = exp(-${K.toFixed(1)} * perp2) * 0.886226925 / sqrt(ka) * erfc_(sqrt(ka) * (m + near));
        gl_FragColor = vec4(color * maxBrightness * (1.0 - exp(-density * path)), 1.0);
        #include <colorspace_fragment>
      }`,
    // Back faces cover the whole ellipsoid whether the camera is outside or inside it.
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  mesh.scale.copy(radii).multiplyScalar(MESH_SCALE);
  return mesh;
}
