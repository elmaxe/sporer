import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import { FIXED_DT } from '../core/Game';
import { hashSeed } from '../gen/rng';
import { describePlanet, describeSized, type PlanetData, type SystemData } from '../gen/system';
import { skyScale } from '../planet/frame';
import type { Physics } from '../physics/Physics';
import type { CelestialBody } from './CelestialBody';
import { describeAsteroid } from '../gen/belts';
import { describeComet } from '../gen/comets';
import { Comet, cometConfig, cometParams } from './Comet';
import { AsteroidBelt, asteroidConfig, beltParams } from './AsteroidBelt';
import { Planet } from './Planet';
import { Star } from './Star';
import { addAtmosphereDebug, type AtmosphereSun } from './atmosphereShell';
import { stormParams } from './StarStorms';
import { createGlowTexture } from './glowTexture';
import { addLavaDebug } from './lavaMaterial';
import { addWeatherDebug } from './weatherLook';
import { starParams } from './starMaterials';
import { addGalacticLightDebug, galacticLightParams } from './galacticLight';
import type { Vec3Like } from '../gen/orbit';

/** Gap between a body's neighbourhood (rings, moon orbits) and where the autopilot parks. */
const PLANET_STANDOFF_MARGIN = 10;
const MOON_STANDOFF_MARGIN = 6;

/**
 * Renders a generated SystemData: its star(s), planets, moons and comets (a
 * visitable nucleus each, with its coma and tails). Units are
 * system-scene units (see gen/system.ts). One clock drives every orbit, so
 * the system can be fast-forwarded (`setTime`) or posed at any moment
 * (`pose`, for the planet level's sky) without stepping physics.
 */
export class StarSystem implements Entity {
  readonly stars: Star[];
  readonly planets: Planet[];
  readonly moons: Planet[] = [];
  /** Their comae and tails; the nuclei are visitable bodies (`nuclei`, in `bodies`). */
  readonly comets: Comet[];
  /** The comets' nuclei: irregular small bodies, picked and flown to like moons. */
  readonly nuclei: Planet[];
  /** Asteroid belts and Trojan swarms: scenery rocks and dust, hovered as a whole (see AsteroidBelt). */
  readonly belts: AsteroidBelt[];
  /** The belts' named asteroids: irregular small bodies, picked and flown to like moons. */
  readonly asteroids: Planet[] = [];
  /** Comet nuclei and asteroids: stepped, posed and spun like the moons. */
  private readonly small: Planet[];
  /** Everything the player can hover and fly to. */
  readonly bodies: CelestialBody[];
  /** What the system centres on, where the ship arrives: the (main) star, or a rogue planet. */
  readonly anchor: CelestialBody;
  /** A starless system's light: the galaxy's glow from its centre (null with a star). */
  readonly galacticLight: THREE.DirectionalLight | null;
  /** Unit direction of that light, in system space (null with a star). */
  readonly galacticCentre: THREE.Vector3 | null;
  /** How brightly the air and clouds are lit: 1 by a star, less by the galaxy's glow. */
  private readonly airLight = { value: galacticLightParams.air };
  private readonly ambient: THREE.HemisphereLight;
  private readonly glowTexture: THREE.CanvasTexture;
  private _time = 0;
  private readonly scratch = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    physics: Physics,
    readonly data: SystemData,
    debug?: Debug,
    /** Unit direction to the galactic centre in system space: lights a system with no star. */
    galacticCentre: Vec3Like = { x: 1, y: 0, z: 0 },
  ) {
    this.glowTexture = createGlowTexture();
    const binary = data.stars.length > 1;
    this.stars = data.stars.map(
      (s, i) =>
        new Star(
          scene,
          physics,
          binary ? `${data.name} ${'AB'[i]}` : data.name,
          s,
          hashSeed(data.seed, 'star', i),
        ),
    );
    // Atmospheres are lit from the main star, wherever it is drawn; with none, from the galactic centre.
    const star = this.stars[0];
    const centre = new THREE.Vector3(galacticCentre.x, galacticCentre.y, galacticCentre.z).normalize();
    const sun: AtmosphereSun = star
      ? { vector: star.object.position, point: true }
      : { vector: centre, point: false, strength: this.airLight };
    this.galacticCentre = star ? null : centre;
    this.galacticLight = star ? null : new THREE.DirectionalLight(galacticLightParams.color, galacticLightParams.intensity);
    if (this.galacticLight) {
      this.galacticLight.name = 'Galactic light';
      this.galacticLight.position.copy(centre).multiplyScalar(1000);
      scene.add(this.galacticLight);
    }
    this.planets = data.planets.map((p) => {
      const planet = new Planet(scene, physics, p, describe(p), p.extent + PLANET_STANDOFF_MARGIN, sun);
      for (const m of p.moons) {
        const moon = new Planet(scene, physics, m, `${describePlanet(m.type)} · moon`, m.radius + MOON_STANDOFF_MARGIN, sun, planet);
        this.moons.push(moon);
      }
      return planet;
    });
    this.comets = data.comets.map((c) => {
      const nucleus = new Planet(scene, physics, cometConfig(c), describeComet(c), c.radius + MOON_STANDOFF_MARGIN, sun);
      return new Comet(scene, c, nucleus, data.habitableRadius, this.glowTexture);
    });
    this.nuclei = this.comets.map((c) => c.nucleus);
    this.belts = data.belts.map((b) => {
      const asteroids = b.asteroids.map(
        (a) => new Planet(scene, physics, asteroidConfig(a), describeAsteroid(a, b), a.radius + MOON_STANDOFF_MARGIN, sun),
      );
      this.asteroids.push(...asteroids);
      return new AsteroidBelt(scene, b, asteroids);
    });
    this.small = [...this.nuclei, ...this.asteroids];
    this.bodies = [...this.stars, ...this.planets, ...this.moons, ...this.small];
    this.anchor = this.stars[0] ?? this.planets[0]!;
    this.ambient = new THREE.HemisphereLight('#9bb8ff', '#1a1020', 0.35);
    scene.add(this.ambient);
    this.animate(this._time);

    if (debug) {
      if (this.galacticLight) addGalacticLightDebug(debug);
      addAtmosphereDebug(debug);
      addLavaDebug(debug);
      addWeatherDebug(debug);
    }
    const stars = debug?.folder('Stars');
    stars?.add(starParams, 'pace', 0, 5);
    stars?.add(starParams, 'granulation', 0.2, 3);
    stars?.add(starParams, 'spots', 0, 3);
    stars?.add(starParams, 'limbDarkening', 0, 1);
    stars?.add(starParams, 'corona', 0, 3);
    stars?.add(starParams, 'intensity', 0.5, 5);
    stars?.add(starParams, 'rim', 0, 3);
    stars?.add(starParams, 'rimWidth', 0.02, 1);
    stars?.add(starParams, 'glare', 0, 2);
    stars?.add(stormParams, 'particleSize', 0.005, 0.1);
    stars?.add(stormParams, 'brightness', 0, 3);
    const comets = debug?.folder('Comets');
    comets?.add(cometParams, 'activeDistance', 0.3, 3);
    comets?.add(cometParams, 'tailLength', 0, 300);
    comets?.add(cometParams, 'maxTailLength', 0, 1000);
    comets?.add(cometParams, 'tailWidth', 0, 20);
    comets?.add(cometParams.nearFade, '0', 0, 20).name('nearFade from');
    comets?.add(cometParams.nearFade, '1', 0, 100).name('nearFade to');
    comets?.add(cometParams, 'dustCurve', 0, 1);
    const belts = debug?.folder('Asteroid belts');
    belts?.add(beltParams, 'meshPixels', 1, 12);
    belts?.add(beltParams, 'minPixels', 0, 3);
    belts?.add(beltParams, 'dotBrightness', 0, 4);
    belts?.add(beltParams, 'dustNear', 0, 1000);
    belts?.add(beltParams, 'dustFar', 0, 3000);
    belts?.add(beltParams, 'dustBrightness', 0, 1);
    belts?.add(beltParams, 'reselect', 0, 2);
    belts?.add(beltParams, 'maxMeshes', 0, 5000, 50);
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
    for (const n of this.small) n.step(this._time, dt);
  }

  /** Fast-forwards (or rewinds) every body to `time`, e.g. after time passed in the planet level. */
  setTime(time: number): void {
    this._time = time;
    for (const s of this.stars) s.jumpTo(time, FIXED_DT);
    for (const p of this.planets) p.jumpTo(time, FIXED_DT);
    for (const m of this.moons) m.jumpTo(time, FIXED_DT);
    for (const n of this.small) n.jumpTo(time, FIXED_DT);
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
    for (const n of this.small) this.posePlanet(n, time, observer, minAngle);
    this.animate(time);
  }

  /** Undoes `pose`'s enlarging of distant bodies (positions and the rest come back with the next update). */
  unpose(): void {
    for (const p of this.planets) p.object.scale.setScalar(1);
    for (const m of this.moons) m.object.scale.setScalar(1);
    for (const n of this.small) n.object.scale.setScalar(1);
  }

  update(frameDt: number, alpha: number): void {
    if (this.galacticLight) {
      this.galacticLight.color.set(galacticLightParams.color);
      this.galacticLight.intensity = galacticLightParams.intensity;
      this.airLight.value = galacticLightParams.air;
    }
    for (const s of this.stars) s.update(frameDt, alpha);
    for (const p of this.planets) p.update(frameDt, alpha);
    for (const m of this.moons) m.update(frameDt, alpha);
    for (const n of this.small) n.update(frameDt, alpha);
    // The clock between the last two fixed steps, as the bodies are interpolated.
    const time = this._time - FIXED_DT * (1 - alpha);
    for (const p of this.planets) if (p.spinAt) p.spinAngle = p.spinAt(time);
    for (const m of this.moons) if (m.spinAt) m.spinAngle = m.spinAt(time);
    for (const n of this.small) if (n.spinAt) n.spinAngle = n.spinAt(time);
    this.animate(time);
  }

  /** Living stars, lava and comets: pure functions of the (render) time. */
  private animate(time: number): void {
    for (const s of this.stars) s.animate(time);
    for (const p of this.planets) p.animate(time);
    for (const m of this.moons) m.animate(time);
    for (const c of this.comets) c.poseAt(time);
    for (const b of this.belts) b.animate(time);
  }

  dispose(): void {
    for (const s of this.stars) s.dispose();
    for (const p of this.planets) p.dispose();
    for (const m of this.moons) m.dispose();
    for (const c of this.comets) c.dispose();
    for (const n of this.small) n.dispose();
    for (const b of this.belts) b.dispose();
    this.scene.remove(this.ambient);
    this.ambient.dispose();
    if (this.galacticLight) {
      this.scene.remove(this.galacticLight);
      this.galacticLight.dispose();
    }
    this.glowTexture.dispose();
  }

  private posePlanet(p: Planet, time: number, observer: THREE.Vector3, minAngle: number): void {
    const at = p.positionAt(time, p.object.position);
    p.object.scale.setScalar(skyScale(p.radius, this.scratch.subVectors(at, observer).length(), minAngle));
  }
}

function describe(p: PlanetData): string {
  const parts = [describeSized(p.type, p.size)];
  if (p.rings) parts.push('rings');
  if (p.moons.length > 0) parts.push(p.moons.length === 1 ? '1 moon' : `${p.moons.length} moons`);
  return parts.join(' · ');
}
