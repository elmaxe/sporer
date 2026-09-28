import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import { FIXED_DT } from '../core/Game';
import { describePlanet, type PlanetData, type SystemData } from '../gen/system';
import { skyScale } from '../planet/frame';
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
 * system-scene units (see gen/system.ts). One clock drives every orbit, so
 * the system can be fast-forwarded (`setTime`) or posed at any moment
 * (`pose`, for the planet level's sky) without stepping physics.
 */
export class StarSystem implements Entity {
  readonly stars: Star[];
  readonly planets: Planet[];
  readonly moons: Planet[] = [];
  /** Everything the player can hover and fly to. */
  readonly bodies: CelestialBody[];
  private readonly ambient: THREE.HemisphereLight;
  private readonly glowTexture: THREE.CanvasTexture;
  private _time = 0;
  private readonly scratch = new THREE.Vector3();

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

  /** System time in seconds: where every body is on its orbit. */
  get time(): number {
    return this._time;
  }

  fixedUpdate(dt: number): void {
    this._time += dt;
    for (const s of this.stars) s.step(this._time, dt);
    for (const p of this.planets) p.step(this._time, dt);
    for (const m of this.moons) m.step(this._time, dt);
  }

  /** Fast-forwards (or rewinds) every body to `time`, e.g. after time passed in the planet level. */
  setTime(time: number): void {
    this._time = time;
    for (const s of this.stars) s.jumpTo(time, FIXED_DT);
    for (const p of this.planets) p.jumpTo(time, FIXED_DT);
    for (const m of this.moons) m.jumpTo(time, FIXED_DT);
  }

  /**
   * Places the rendered bodies where they are at `time` (render state only;
   * `setTime` restores the rest), enlarging planets and moons that would look
   * smaller than `minAngle` from `observer` so they still show as dots.
   */
  pose(time: number, observer: THREE.Vector3, minAngle: number): void {
    for (const s of this.stars) s.positionAt(time, s.object.position);
    for (const p of this.planets) this.posePlanet(p, time, observer, minAngle);
    for (const m of this.moons) this.posePlanet(m, time, observer, minAngle);
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

  private posePlanet(p: Planet, time: number, observer: THREE.Vector3, minAngle: number): void {
    const at = p.positionAt(time, p.object.position);
    p.object.scale.setScalar(skyScale(p.radius, this.scratch.subVectors(at, observer).length(), minAngle));
  }
}

function describe(p: PlanetData): string {
  const parts = [describePlanet(p.type)];
  if (p.rings) parts.push('rings');
  if (p.moons.length > 0) parts.push(p.moons.length === 1 ? '1 moon' : `${p.moons.length} moons`);
  return parts.join(' · ');
}
