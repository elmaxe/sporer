import * as THREE from 'three';
import type { SoundEffects } from '../audio/sfx';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import type { GalaxyData, StarRef } from '../gen/galaxy';
import type { OrbitCamera } from '../player/OrbitCamera';
import { cameraParams } from '../player/OrbitCamera';
import { Fade } from '../ui/Fade';
import { Tooltip } from '../ui/Tooltip';
import type { Planet } from '../world/Planet';
import { GALAXY_VIEW_DISTANCE, GalaxyLevel } from './GalaxyLevel';
import { PLANET_VIEW_DISTANCE, PlanetLevel, planetCameraParams } from './PlanetLevel';
import { ARRIVAL_DISTANCE, SystemLevel } from './SystemLevel';
import { ease, samplePhase, type TransitionPhase } from './transition';

/** Seconds for each half of a transition (zoom + fade out, swap, zoom + fade in). */
const OUT_SECONDS = 0.45;
const IN_SECONDS = 0.8;
/** Galaxy camera distance where a system transition starts or ends: right at the star. */
const GALAXY_CLOSE_DISTANCE = 2.5;
/** System camera distance from a planet's centre where a planet transition starts or ends, in radii. */
const PLANET_CLOSE_RADII = 1.5;
/** How far (in its own zoom) the planet camera pulls away while leaving. */
const PLANET_LEAVE_ZOOM = 3;

export type LevelMode = 'system' | 'galaxy' | 'planet';
interface ActivePhase extends TransitionPhase {
  orbit: OrbitCamera;
  /** Called every frame with the eased progress in [0, 1]. */
  tick?: (u: number) => void;
  /** Runs when the phase ends; returns the next phase, if any. */
  then: () => ActivePhase | null;
}

/**
 * Owns the levels and moves between them. Zooming out past a system shows
 * the galaxy, framed on the current star; zooming in at a star enters its
 * system (generated on demand). Zooming in while parked at a planet or moon
 * descends to its low orbit (a planet level, built on demand and dropped on
 * the way back up). Each transition reads as one continuous zoom:
 * the old camera keeps zooming while the screen fades to black, the levels
 * swap, and the new camera zooms on while it fades back in, under a whoosh.
 * Input is blocked meanwhile. A global entity: it runs before the active level each frame.
 */
export class SceneManager implements Entity {
  readonly galaxyLevel: GalaxyLevel;
  private _systemLevel: SystemLevel;
  private _planetLevel: PlanetLevel | null = null;
  private readonly side = new THREE.Vector3();
  private readonly tooltip = new Tooltip();
  private readonly fade = new Fade();
  private phase: ActivePhase | null = null;
  private elapsed = 0;

  constructor(
    private readonly game: Game,
    galaxy: GalaxyData,
    start: StarRef,
    private readonly debug: Debug,
    private readonly sfx: SoundEffects,
  ) {
    const { camera, input, renderer } = game;
    this.galaxyLevel = new GalaxyLevel(galaxy, start, camera, input, renderer.domElement, this.tooltip, debug, sfx, () =>
      this.toSystem(),
    );
    this._systemLevel = this.createSystem(start);
    game.setLevel(this._systemLevel);
  }

  get systemLevel(): SystemLevel {
    return this._systemLevel;
  }

  get planetLevel(): PlanetLevel | null {
    return this._planetLevel;
  }

  get mode(): LevelMode {
    const level = this.game.level;
    return level === this.galaxyLevel ? 'galaxy' : level === this._planetLevel ? 'planet' : 'system';
  }

  get transitioning(): boolean {
    return this.phase !== null;
  }

  /** System → galaxy, framed on the current star. */
  toGalaxy(): void {
    if (this.transitioning || this.mode !== 'system') return;
    const from = this._systemLevel.orbit;
    this.sfx.play('transitionOut');
    this.begin({
      orbit: from,
      from: from.zoom,
      to: from.zoom * 4,
      duration: OUT_SECONDS,
      fadeFrom: 0,
      fadeTo: 1,
      then: () => {
        this.game.setLevel(this.galaxyLevel);
        const to = this.galaxyLevel.orbit;
        return {
          orbit: to,
          from: GALAXY_CLOSE_DISTANCE,
          to: GALAXY_VIEW_DISTANCE,
          duration: IN_SECONDS,
          fadeFrom: 1,
          fadeTo: 0,
          then: () => (to.zoomTo(GALAXY_VIEW_DISTANCE), null),
        };
      },
    });
  }

  /** Galaxy → the system of the star the ship is docked at. Ignored while travelling. */
  toSystem(): void {
    const ship = this.galaxyLevel.ship;
    if (this.transitioning || this.mode !== 'galaxy' || ship.travelling) return;
    const from = this.galaxyLevel.orbit;
    this.sfx.play('transitionIn');
    this.begin({
      orbit: from,
      from: from.zoom,
      to: GALAXY_CLOSE_DISTANCE,
      duration: OUT_SECONDS,
      fadeFrom: 0,
      fadeTo: 1,
      then: () => {
        if (this._systemLevel.ref !== ship.current) {
          this._systemLevel.dispose();
          this._systemLevel = this.createSystem(ship.current);
        }
        this.game.setLevel(this._systemLevel);
        const to = this._systemLevel.orbit;
        return {
          orbit: to,
          from: cameraParams.maxDistance,
          to: ARRIVAL_DISTANCE,
          duration: IN_SECONDS,
          fadeFrom: 1,
          fadeTo: 0,
          then: () => (to.zoomTo(ARRIVAL_DISTANCE), null),
        };
      },
    });
  }

  /**
   * System → low orbit over `body`, by default the planet or moon the ship is
   * parked at (or right next to). The camera flies at the body, not the ship,
   * as the screen fades. Does nothing away from planets.
   */
  toPlanet(body: Planet | null = this._systemLevel.approachableBody()): void {
    if (this.transitioning || this.mode !== 'system' || !body) return;
    const system = this._systemLevel;
    this.sfx.play('transitionIn');
    const from = system.orbit;
    this.begin({
      orbit: from,
      from: from.zoom,
      to: body.radius * PLANET_CLOSE_RADII,
      duration: OUT_SECONDS,
      fadeFrom: 0,
      fadeTo: 1,
      tick: (u) => from.setFocus(body.renderPosition, u),
      then: () => {
        from.setFocus(null);
        // Arrive over the side of the body the ship was on.
        this.side.subVectors(system.ship.object.position, body.renderPosition);
        const level = this.createPlanet(body, this.side);
        this.game.setLevel(level);
        const to = level.orbit;
        return {
          orbit: to,
          from: planetCameraParams.maxDistance,
          to: PLANET_VIEW_DISTANCE,
          duration: IN_SECONDS,
          fadeFrom: 1,
          fadeTo: 0,
          then: () => (to.zoomTo(PLANET_VIEW_DISTANCE), null),
        };
      },
    });
  }

  /**
   * Low orbit → back to the system, which catches up with the time spent at
   * the planet. The ship reappears parked beside the body, on the side it
   * was flying over, and the camera pulls back from the body to the ship.
   */
  leavePlanet(): void {
    const planet = this._planetLevel;
    if (this.transitioning || !planet || this.mode !== 'planet') return;
    const from = planet.orbit;
    this.sfx.play('transitionOut');
    this.begin({
      orbit: from,
      from: from.zoom,
      to: from.zoom * PLANET_LEAVE_ZOOM,
      duration: OUT_SECONDS,
      fadeFrom: 0,
      fadeTo: 1,
      then: () => {
        const system = this._systemLevel;
        const { body } = planet;
        system.world.setTime(planet.time);
        body.spinAngle = planet.frame.spinAngle;
        planet.exitSide(this.side);
        system.ship.parkAt(body, this.side);
        const to = system.orbit;
        // Look past the ship at the body, then pull back and over to the ship.
        to.lookFrom(this.side);
        to.setFocus(body.renderPosition, 1);
        this.game.setLevel(system);
        this.dropPlanet();
        const distance = Math.max(ARRIVAL_DISTANCE / 2, body.radius * 3);
        return {
          orbit: to,
          from: body.radius * PLANET_CLOSE_RADII,
          to: distance,
          duration: IN_SECONDS,
          fadeFrom: 1,
          fadeTo: 0,
          tick: (u) => to.setFocus(body.renderPosition, 1 - u),
          then: () => (to.setFocus(null), to.zoomTo(distance), null),
        };
      },
    });
  }

  update(frameDt: number): void {
    // Flying into a planet or moon takes you down to it too.
    if (!this.phase && this.mode === 'system') {
      const body = this._systemLevel.bodyInReach();
      if (body) this.toPlanet(body);
    }
    const phase = this.phase;
    if (!phase) return;
    this.elapsed += frameDt;
    const { distance, fade } = samplePhase(phase, this.elapsed);
    phase.orbit.setDistance(distance);
    phase.tick?.(ease(phase.duration > 0 ? this.elapsed / phase.duration : 1));
    this.fade.set(fade);
    if (this.elapsed < phase.duration) return;

    this.elapsed = 0;
    this.phase = phase.then();
    if (!this.phase) this.game.input.blocked = false;
  }

  dispose(): void {
    this.dropPlanet();
    this._systemLevel.dispose();
    this.galaxyLevel.dispose();
  }

  private begin(phase: ActivePhase): void {
    this.phase = phase;
    this.elapsed = 0;
    this.game.input.blocked = true;
  }

  private createPlanet(body: Planet, side: THREE.Vector3): PlanetLevel {
    const { camera, input } = this.game;
    this._planetLevel = new PlanetLevel(this._systemLevel, body, side, camera, input, this.debug, () =>
      this.leavePlanet(),
    );
    return this._planetLevel;
  }

  private dropPlanet(): void {
    this._planetLevel?.dispose();
    this._planetLevel = null;
  }

  private createSystem(ref: StarRef): SystemLevel {
    const { camera, input } = this.game;
    const level = new SystemLevel(
      ref,
      camera,
      input,
      this.tooltip,
      this.debug,
      () => this.toGalaxy(),
      () => this.toPlanet(),
    );
    // Remember the system in the URL, so a reload comes back here.
    const url = new URL(location.href);
    url.searchParams.set('star', String(ref.id));
    history.replaceState(null, '', url);
    return level;
  }
}
