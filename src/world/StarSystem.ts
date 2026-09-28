import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { describePlanet, type PlanetData, type SystemData } from '../gen/system';
import type { Physics } from '../physics/Physics';
import type { CelestialBody } from './CelestialBody';
import { Planet } from './Planet';
import { Star } from './Star';
import { createGlowTexture } from './glowTexture';

/** Gap between a body's neighbourhood (rings, moon orbits) and where the autopilot parks. */
const PLANET_STANDOFF_MARGIN = 10;
const MOON_STANDOFF_MARGIN = 6;

/**
 * Renders a generated SystemData: its star(s), planets and moons. Units are
 * system-scene units (see gen/system.ts).
 */
export class StarSystem implements Entity {
  readonly stars: Star[];
  readonly planets: Planet[];
  readonly moons: Planet[] = [];
  /** Everything the player can hover and fly to. */
  readonly bodies: CelestialBody[];
  private readonly ambient: THREE.HemisphereLight;
  private readonly glowTexture: THREE.CanvasTexture;

  constructor(
    private readonly scene: THREE.Scene,
    physics: Physics,
    readonly data: SystemData,
  ) {
    this.glowTexture = createGlowTexture();
    const binary = data.stars.length > 1;
    this.stars = data.stars.map(
      (s, i) => new Star(scene, physics, binary ? `${data.name} ${'AB'[i]}` : data.name, s, this.glowTexture),
    );
    this.planets = data.planets.map((p) => {
      const planet = new Planet(scene, physics, p, describe(p), p.extent + PLANET_STANDOFF_MARGIN);
      for (const m of p.moons) {
        const moon = new Planet(scene, physics, m, `${describePlanet(m.type)} · moon`, m.radius + MOON_STANDOFF_MARGIN, planet);
        this.moons.push(moon);
      }
      return planet;
    });
    this.bodies = [...this.stars, ...this.planets, ...this.moons];
    this.ambient = new THREE.HemisphereLight('#9bb8ff', '#1a1020', 0.35);
    scene.add(this.ambient);
  }

  fixedUpdate(dt: number): void {
    for (const s of this.stars) s.fixedUpdate(dt);
    // Planets before moons: a moon's position is relative to its planet's.
    for (const p of this.planets) p.fixedUpdate(dt);
    for (const m of this.moons) m.fixedUpdate(dt);
  }

  update(frameDt: number, alpha: number): void {
    for (const s of this.stars) s.update(frameDt, alpha);
    for (const p of this.planets) p.update(frameDt, alpha);
    for (const m of this.moons) m.update(frameDt, alpha);
  }

  dispose(): void {
    for (const s of this.stars) s.dispose();
    for (const p of this.planets) p.dispose();
    for (const m of this.moons) m.dispose();
    this.scene.remove(this.ambient);
    this.ambient.dispose();
    this.glowTexture.dispose();
  }
}

function describe(p: PlanetData): string {
  const parts = [describePlanet(p.type)];
  if (p.rings) parts.push('rings');
  if (p.moons.length > 0) parts.push(p.moons.length === 1 ? '1 moon' : `${p.moons.length} moons`);
  return parts.join(' · ');
}
