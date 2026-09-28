import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { SystemData } from '../gen/system';
import type { Physics } from '../physics/Physics';
import { Planet } from './Planet';
import { Star } from './Star';

/**
 * Renders a generated SystemData: its star(s) and planets. Units are
 * system-scene units (see gen/system.ts).
 */
export class StarSystem implements Entity {
  readonly stars: Star[];
  readonly planets: Planet[];
  private readonly ambient: THREE.HemisphereLight;
  private readonly glowTexture: THREE.CanvasTexture;

  constructor(
    private readonly scene: THREE.Scene,
    physics: Physics,
    readonly data: SystemData,
  ) {
    this.glowTexture = createGlowTexture();
    this.stars = data.stars.map((s) => new Star(scene, physics, s, this.glowTexture));
    this.planets = data.planets.map((p) => new Planet(scene, physics, p));
    this.ambient = new THREE.HemisphereLight('#9bb8ff', '#1a1020', 0.35);
    scene.add(this.ambient);
  }

  fixedUpdate(dt: number): void {
    for (const s of this.stars) s.fixedUpdate(dt);
    for (const p of this.planets) p.fixedUpdate(dt);
  }

  update(frameDt: number, alpha: number): void {
    for (const s of this.stars) s.update(frameDt, alpha);
    for (const p of this.planets) p.update(frameDt, alpha);
  }

  dispose(): void {
    for (const s of this.stars) s.dispose();
    for (const p of this.planets) p.dispose();
    this.scene.remove(this.ambient);
    this.ambient.dispose();
    this.glowTexture.dispose();
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
