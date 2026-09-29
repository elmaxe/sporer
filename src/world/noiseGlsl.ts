/**
 * GLSL: smooth 3D value noise, `valueNoise(p)` in [0, 1], and
 * `fbm(p, octaves)` summing up to 5 octaves (normalised to [0, 1)).
 * Cheap and hash-based, no textures. Shared by the sky and smoke shaders.
 */
export const VALUE_NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float valueNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  float fbm(vec3 p, int octaves) {
    float sum = 0.0;
    float amp = 0.5;
    float total = 0.0;
    for (int i = 0; i < 5; i++) {
      if (i >= octaves) break;
      sum += amp * valueNoise(p);
      total += amp;
      p = p * 2.03 + 1.7;
      amp *= 0.5;
    }
    return sum / total;
  }
`;
