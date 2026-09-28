import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { RAPIER, type Physics } from '../physics/Physics';
import { Planet, type PlanetConfig } from './Planet';

/*
 * Units: the player UFO is ~4 units across. Distances are heavily compressed
 * compared to reality (as in Spore) so a whole system fits within a few
 * hundred units and can be crossed in seconds.
 */

export interface StarSystemConfig {
  sun: { radius: number; color: THREE.ColorRepresentation };
  planets: PlanetConfig[];
}

export const HOME_SYSTEM: StarSystemConfig = {
  sun: { radius: 30, color: '#ffd27a' },
  planets: [
    {
      name: 'Cinder',
      radius: 5,
      seed: 3,
      spin: 0.3,
      orbit: { radius: 90, period: 50, phase: 0.5, inclination: 0.05 },
      style: { sea: null, low: '#5a2a1c', high: '#d9763f', relief: 0.08 },
    },
    {
      name: 'Verdance',
      radius: 9,
      seed: 11,
      spin: 0.15,
      orbit: { radius: 150, period: 90, phase: 2.2, inclination: -0.03 },
      style: { sea: '#1f5fa8', low: '#3f8f3a', high: '#e8e2c8', relief: 0.07 },
    },
    {
      name: 'Glacia',
      radius: 7,
      seed: 27,
      spin: 0.2,
      orbit: { radius: 220, period: 140, phase: 4.1, inclination: 0.08 },
      style: { sea: '#6fb6d6', low: '#cfe6f2', high: '#ffffff', relief: 0.05 },
    },
    {
      name: 'Jovana',
      radius: 16,
      seed: 42,
      spin: 0.1,
      orbit: { radius: 330, period: 220, phase: 1.0, inclination: -0.02 },
      style: { sea: null, low: '#8a5a3a', high: '#f0d7a8', relief: 0.015 },
    },
  ],
};

/** A sun with its light, glow and collider, plus its orbiting planets. */
export class StarSystem implements Entity {
  readonly planets: Planet[];
  private readonly sun: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private readonly glow: THREE.Sprite;
  private readonly light: THREE.PointLight;
  private readonly ambient: THREE.HemisphereLight;
  private readonly sunBody: RAPIER.RigidBody;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: Physics,
    config: StarSystemConfig,
  ) {
    const { radius, color } = config.sun;

    this.sun = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), new THREE.MeshBasicMaterial({ color }));
    this.sun.name = 'Sun';

    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: createGlowTexture(),
        color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.glow.scale.setScalar(radius * 6);

    // decay 0 keeps intensity constant with distance, so outer planets stay lit.
    this.light = new THREE.PointLight(color, 3, 0, 0);
    this.ambient = new THREE.HemisphereLight('#9bb8ff', '#1a1020', 0.35);

    scene.add(this.sun, this.glow, this.light, this.ambient);

    this.sunBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    physics.world.createCollider(RAPIER.ColliderDesc.ball(radius), this.sunBody);

    this.planets = config.planets.map((p) => new Planet(scene, physics, p));
  }

  fixedUpdate(dt: number): void {
    for (const p of this.planets) p.fixedUpdate(dt);
  }

  update(frameDt: number, alpha: number): void {
    for (const p of this.planets) p.update(frameDt, alpha);
  }

  dispose(): void {
    for (const p of this.planets) p.dispose();
    this.scene.remove(this.sun, this.glow, this.light, this.ambient);
    this.sun.geometry.dispose();
    this.sun.material.dispose();
    this.glow.material.map?.dispose();
    this.glow.material.dispose();
    this.light.dispose();
    this.ambient.dispose();
    this.physics.world.removeRigidBody(this.sunBody);
  }
}

function createGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
