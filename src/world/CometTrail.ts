import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { CometData } from '../gen/comets';
import { keplerPosition } from '../gen/orbit';

export const cometTrailParams = {
  /** The old stream's brightness all along the orbit, where the light is a habitable radius's. */
  stream: 0.015,
  /** Extra brightness of the fresh trail near the comet. */
  fresh: 0.35,
  /**
   * How far along the orbit the fresh trail reaches behind the comet (turns of mean anomaly, to 1/e), and a
   * twelfth of that ahead: Encke's reaches 60° behind and 5° ahead (Reach et al. 2007; docs/research/dust.md).
   */
  reach: 0.1,
  /** It fades out closer to the camera than this (system units), so it never cuts across the view up close. */
  nearFade: 60,
};

/** Points round the orbit. */
const POINTS = 720;

const VERTEX = /* glsl */ `
  attribute float aAnomaly;   // mean anomaly of the point, radians
  uniform float uComet;       // the comet's mean anomaly now
  uniform float uHabitable;
  uniform float uStream;
  uniform float uFresh;
  uniform float uReach;
  uniform float uNearFade;
  varying float vBrightness;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    // Behind the comet (it sheds dust that lags) the fresh trail reaches further than ahead of it.
    float d = uComet - aAnomaly;
    d -= 6.2831853 * floor(d / 6.2831853 + 0.5);
    float reach = uReach * 6.2831853 * (d > 0.0 ? 1.0 : 0.083);
    float fresh = exp(-(d / reach) * (d / reach));
    // Lit by the star (1/r, squeezed so the far orbit still shows faintly).
    float light = min(uHabitable / max(length(world.xyz), 1.0), 3.0);
    float near = smoothstep(uNearFade * 0.3, uNearFade, distance(world.xyz, cameraPosition));
    vBrightness = (uStream + uFresh * fresh) * light * near;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vBrightness;
  void main() {
    gl_FragColor = vec4(uColor * vBrightness, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * A comet's dust trail: the meteoroid stream it has left all along its
 * orbit, a faint line in the system view (and so in low orbit's sky),
 * brighter where the comet shed it lately, just behind it. Where a planet's
 * orbit passes through it, the planet gets a meteor shower (gen/meteors.ts).
 */
export class CometTrail implements Entity {
  readonly line: THREE.LineLoop<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly uniforms: Record<string, THREE.IUniform>;

  constructor(
    private readonly scene: THREE.Scene,
    readonly data: CometData,
    habitableRadius: number,
  ) {
    const { orbit } = data;
    const positions = new Float32Array(POINTS * 3);
    const anomalies = new Float32Array(POINTS);
    const p = new THREE.Vector3();
    const at = { ...orbit, phase: 0 };
    for (let i = 0; i < POINTS; i++) {
      // Even in eccentric anomaly, so the far end isn't left with too few points.
      const E = (2 * Math.PI * i) / POINTS;
      const M = E - orbit.eccentricity * Math.sin(E);
      keplerPosition(at, (M / (2 * Math.PI)) * orbit.period, p);
      positions.set([p.x, p.y, p.z], i * 3);
      anomalies[i] = M;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aAnomaly', new THREE.BufferAttribute(anomalies, 1));
    this.uniforms = {
      uComet: { value: 0 },
      uHabitable: { value: habitableRadius },
      uStream: { value: cometTrailParams.stream },
      uFresh: { value: cometTrailParams.fresh },
      uReach: { value: cometTrailParams.reach },
      uNearFade: { value: cometTrailParams.nearFade },
      uColor: { value: new THREE.Color(data.dustColor) },
    };
    this.line = new THREE.LineLoop(
      geometry,
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: this.uniforms,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.line.name = `${data.name} dust trail`;
    this.line.frustumCulled = false;
    scene.add(this.line);
  }

  /** Where the comet is on its orbit now (its fresh trail follows it). */
  animate(time: number): void {
    const { orbit } = this.data;
    const u = this.uniforms;
    u.uComet!.value = orbit.phase + (2 * Math.PI * time) / orbit.period;
    u.uStream!.value = cometTrailParams.stream;
    u.uFresh!.value = cometTrailParams.fresh;
    u.uReach!.value = cometTrailParams.reach;
    u.uNearFade!.value = cometTrailParams.nearFade;
  }

  update(): void {}

  dispose(): void {
    this.scene.remove(this.line);
    this.line.geometry.dispose();
    this.line.material.dispose();
  }
}

/** Binds the trails' tunables in the debug panel. */
export function addCometTrailDebug(debug: Debug): void {
  const f = debug.folder('Comet dust trails');
  f?.add(cometTrailParams, 'stream', 0, 0.5);
  f?.add(cometTrailParams, 'fresh', 0, 2);
  f?.add(cometTrailParams, 'reach', 0.005, 0.3);
  f?.add(cometTrailParams, 'nearFade', 0, 300);
}
