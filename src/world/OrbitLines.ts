import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { orbitPath } from '../gen/orbit';
import type { CelestialBody } from './CelestialBody';
import type { Planet } from './Planet';

export const orbitLineParams = {
  /** Opacity of a planet's orbit line. */
  opacity: 0.16,
  /** Opacity of the hovered or targeted body's orbit line. */
  highlight: 0.5,
  /** Opacity of a moon's orbit line near its planet. */
  moonOpacity: 0.14,
  /** Lines closer to the camera than this fade out (system units), so they never slash across the view. */
  nearFade: 40,
  /** Moon orbits show when the camera is within this many of their planet's standoff distances. */
  moonRange: 5,
};

const PLANET_SEGMENTS = 128;
const MOON_SEGMENTS = 64;
/** How fast a line eases to its new opacity (per second). */
const EASE_RATE = 8;

interface OrbitLine {
  body: Planet;
  line: THREE.LineLoop<THREE.BufferGeometry, THREE.ShaderMaterial>;
  opacity: number;
}

/**
 * Faint orbit lines: one loop per planet around the barycentre, and one per
 * moon around its planet, shown only near that planet. Lines fade out close
 * to the camera and around their own body, and the hovered or targeted
 * body's orbit is brighter. Built once; per frame only uniforms change.
 * (A binary's stars circle each other too tightly to need a line.)
 */
export class OrbitLines implements Entity {
  private readonly root = new THREE.Group();
  private readonly planetLines: OrbitLine[];
  private readonly moonLines: OrbitLine[];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    planets: readonly Planet[],
    moons: readonly Planet[],
    /** Whether a body's orbit should stand out (e.g. hovered or the autopilot's target). */
    private readonly highlighted: (body: CelestialBody) => boolean,
    debug: Debug,
  ) {
    this.root.name = 'Orbit lines';
    this.planetLines = planets.map((p) => this.createLine(p, PLANET_SEGMENTS, '#8fb0ff'));
    this.moonLines = moons.map((m) => this.createLine(m, MOON_SEGMENTS, '#a8bcd8'));
    scene.add(this.root);

    const f = debug.folder('Orbit lines');
    f?.add(orbitLineParams, 'opacity', 0, 1);
    f?.add(orbitLineParams, 'highlight', 0, 1);
    f?.add(orbitLineParams, 'moonOpacity', 0, 1);
    f?.add(orbitLineParams, 'nearFade', 0, 200);
    f?.add(orbitLineParams, 'moonRange', 1, 20);
    f?.add(this.root, 'visible').name('show');
  }

  /** Hides or shows every line (the planet level's sky leaves them out). */
  set visible(visible: boolean) {
    this.root.visible = visible;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  update(frameDt: number): void {
    const ease = 1 - Math.exp(-EASE_RATE * frameDt);
    const { opacity, highlight, moonOpacity, nearFade, moonRange } = orbitLineParams;
    for (const o of this.planetLines) {
      this.ease(o, this.highlighted(o.body) ? highlight : opacity, ease, nearFade);
    }
    for (const o of this.moonLines) {
      const parent = o.body.parent!;
      o.line.position.copy(parent.renderPosition);
      const distance = this.camera.position.distanceTo(parent.renderPosition);
      const near = 1 - THREE.MathUtils.smoothstep(distance, parent.standoff * moonRange, parent.standoff * moonRange * 2);
      this.ease(o, this.highlighted(o.body) ? highlight : moonOpacity * near, ease, nearFade);
    }
  }

  dispose(): void {
    this.scene.remove(this.root);
    for (const { line } of [...this.planetLines, ...this.moonLines]) {
      line.geometry.dispose();
      line.material.dispose();
    }
  }

  private ease(o: OrbitLine, target: number, ease: number, nearFade: number): void {
    o.opacity += (target - o.opacity) * ease;
    const u = o.line.material.uniforms;
    u.opacity!.value = o.opacity;
    u.nearFade!.value = nearFade;
    o.line.visible = o.opacity > 0.002;
  }

  private createLine(body: Planet, segments: number, color: string): OrbitLine {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(orbitPath(body.config.orbit, segments), 3));
    const reach = Math.max(body.radius, body.config.rings?.outer ?? 0);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(color) },
        opacity: { value: 0 },
        // Live reference: the line fades out around wherever its body is drawn.
        body: { value: body.renderPosition },
        gap: { value: reach * 1.3 },
        nearFade: { value: orbitLineParams.nearFade },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform float opacity;
        uniform vec3 body;
        uniform float gap;
        uniform float nearFade;
        varying vec3 vWorld;
        void main() {
          float a = opacity
            * smoothstep(gap, gap * 2.5, distance(vWorld, body))
            * smoothstep(nearFade * 0.2, nearFade, distance(vWorld, cameraPosition));
          gl_FragColor = vec4(color, a);
          #include <colorspace_fragment>
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const line = new THREE.LineLoop(geometry, material);
    line.name = `${body.name} orbit`;
    line.frustumCulled = false;
    line.visible = false;
    this.root.add(line);
    return { body, line, opacity: 0 };
  }
}
