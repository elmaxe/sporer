import * as THREE from 'three';
import { MARKER_RENDER_ORDER } from '../player/MarkerRing';

/** Steps along the line: enough for the dashes to stay smooth, and for perspective along a long one. */
const SEGMENTS = 64;

export interface CourseLineStyle {
  color: THREE.ColorRepresentation;
  /** Width at the ship and at the star, CSS pixels: the line tapers from one to the other. */
  widthFrom: number;
  widthTo: number;
  /** Dashes flowing from the ship to the star (the course being flown), else a steady line. */
  flow: boolean;
}

/** Dash spacing along the line, and how fast the dashes flow, in CSS pixels (per second). */
const DASH_SPACING = 22;
const DASH_SPEED = 30;
/** The line fades in between these distances from the ship, galaxy units: from under its hull (about 1.2 across). */
const HULL_FADE = [0.2, 0.8] as const;

const vertexShader = /* glsl */ `
  uniform vec3 uFrom;
  uniform vec3 uTo;
  uniform vec2 uWidth;
  uniform vec2 uResolution;
  uniform float uNear;
  attribute vec2 aAlong;
  varying float vT;
  varying float vSide;
  varying float vHalf;
  varying float vPixels;

  void main() {
    float t = aAlong.x;
    float side = aAlong.y;
    vec4 a = viewMatrix * vec4(uFrom, 1.0);
    vec4 b = viewMatrix * vec4(uTo, 1.0);
    // Cut the line at the near plane, so an end behind the camera doesn't fold it across the screen.
    float limit = -uNear * 1.5;
    float t0 = 0.0;
    float t1 = 1.0;
    if (a.z > limit && b.z > limit) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    if (b.z > limit) t1 = (limit - a.z) / (b.z - a.z);
    if (a.z > limit) t0 = (limit - a.z) / (b.z - a.z);
    vec4 a2 = mix(a, b, t0);
    vec4 b2 = mix(a, b, t1);
    float u = mix(t0, t1, t);

    vec4 ca = projectionMatrix * a2;
    vec4 cb = projectionMatrix * b2;
    vec4 cp = projectionMatrix * mix(a2, b2, t);
    vec2 halfRes = uResolution * 0.5;
    vec2 sp = cp.xy / cp.w * halfRes;
    vec2 sa = ca.xy / ca.w * halfRes;
    vec2 sb = cb.xy / cb.w * halfRes;
    vec2 dir = sb - sa;
    float len = length(dir);
    dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
    vec2 normal = vec2(-dir.y, dir.x);
    // Half the width, plus a pixel for the soft edge.
    float halfWidth = mix(uWidth.x, uWidth.y, u) * 0.5 + 1.0;
    cp.xy += normal * side * halfWidth / halfRes * cp.w;
    gl_Position = cp;

    vT = u;
    vSide = side;
    vHalf = halfWidth;
    vPixels = length(sp - sa);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFlow;
  uniform float uLength;
  varying float vT;
  varying float vSide;
  varying float vHalf;
  varying float vPixels;

  void main() {
    // Soft over its last pixel at each edge.
    float edge = clamp((1.0 - abs(vSide)) * vHalf, 0.0, 1.0);
    // Brightest at the ship, dimming towards the star; faded in from under the hull.
    float alpha = mix(1.0, 0.55, vT) * smoothstep(${HULL_FADE[0].toFixed(2)}, ${HULL_FADE[1].toFixed(2)}, vT * uLength);
    float phase = fract((vPixels - uTime * ${DASH_SPEED.toFixed(1)}) / ${DASH_SPACING.toFixed(1)});
    float dash = smoothstep(0.0, 0.15, phase) * (1.0 - smoothstep(0.55, 0.7, phase));
    alpha *= mix(1.0, 0.35 + 0.65 * dash, uFlow);
    gl_FragColor = vec4(uColor, uOpacity * alpha * edge);
  }
`;

/**
 * A line on the galaxy map from the ship to a star, tapering from thick at
 * the ship to thin at the star: the course being flown, or the one a click
 * would set. Drawn in screen space (widths in pixels at any zoom) by its
 * vertex shader. Not an Entity: its owner calls `place` (or `hide`) every
 * frame from its own `update`.
 */
export class CourseLine {
  private readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly uniforms: {
    uFrom: THREE.IUniform<THREE.Vector3>;
    uTo: THREE.IUniform<THREE.Vector3>;
    uWidth: THREE.IUniform<THREE.Vector2>;
    uResolution: THREE.IUniform<THREE.Vector2>;
    uNear: THREE.IUniform<number>;
    uColor: THREE.IUniform<THREE.Color>;
    uOpacity: THREE.IUniform<number>;
    uTime: THREE.IUniform<number>;
    uFlow: THREE.IUniform<number>;
    uLength: THREE.IUniform<number>;
  };

  constructor(
    private readonly scene: THREE.Scene,
    style: CourseLineStyle,
  ) {
    const along = new Float32Array((SEGMENTS + 1) * 4);
    const index: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      along.set([i / SEGMENTS, -1, i / SEGMENTS, 1], i * 4);
      if (i < SEGMENTS) {
        const k = i * 2;
        index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 2));
    // Three counts vertices by `position`; the shader places them from the uniforms.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 6), 3));
    geometry.setIndex(index);

    this.uniforms = {
      uFrom: { value: new THREE.Vector3() },
      uTo: { value: new THREE.Vector3() },
      uWidth: { value: new THREE.Vector2(style.widthFrom, style.widthTo) },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 0.1 },
      uColor: { value: new THREE.Color(style.color) },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
      uFlow: { value: style.flow ? 1 : 0 },
      uLength: { value: 1 },
    };
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    // With the marker rings, after every transparent layer.
    this.mesh.renderOrder = MARKER_RENDER_ORDER;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getSize(this.uniforms.uResolution.value);
      if (camera instanceof THREE.PerspectiveCamera) this.uniforms.uNear.value = camera.near;
    };
    scene.add(this.mesh);
  }

  /** Shows the line from `from` (the ship) to `to` (the star), both in world space. */
  place(from: THREE.Vector3, to: THREE.Vector3, opacity: number, frameDt: number): void {
    this.mesh.visible = true;
    this.uniforms.uFrom.value.copy(from);
    this.uniforms.uTo.value.copy(to);
    this.uniforms.uLength.value = from.distanceTo(to);
    this.uniforms.uOpacity.value = opacity;
    this.uniforms.uTime.value += frameDt;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  get shown(): boolean {
    return this.mesh.visible;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
