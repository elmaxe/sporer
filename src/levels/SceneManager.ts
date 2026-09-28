import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import type { GalaxyData, StarRef } from '../gen/galaxy';
import type { OrbitCamera } from '../player/OrbitCamera';
import { cameraParams } from '../player/OrbitCamera';
import { Fade } from '../ui/Fade';
import { Tooltip } from '../ui/Tooltip';
import { GALAXY_VIEW_DISTANCE, GalaxyLevel } from './GalaxyLevel';
import { ARRIVAL_DISTANCE, SystemLevel } from './SystemLevel';
import { samplePhase, type TransitionPhase } from './transition';

/** Seconds for each half of a transition (zoom + fade out, swap, zoom + fade in). */
const OUT_SECONDS = 0.45;
const IN_SECONDS = 0.8;
/** Galaxy camera distance where a system transition starts or ends: right at the star. */
const GALAXY_CLOSE_DISTANCE = 2.5;

interface ActivePhase extends TransitionPhase {
  orbit: OrbitCamera;
  /** Runs when the phase ends; returns the next phase, if any. */
  then: () => ActivePhase | null;
}

/**
 * Owns the levels and moves between them. Zooming out past a system shows
 * the galaxy, framed on the current star; zooming in at a star enters its
 * system (generated on demand). Each transition reads as one continuous zoom:
 * the old camera keeps zooming while the screen fades to black, the levels
 * swap, and the new camera zooms on while it fades back in. Input is blocked
 * meanwhile. A global entity: it runs before the active level each frame.
 */
export class SceneManager implements Entity {
  readonly galaxyLevel: GalaxyLevel;
  private _systemLevel: SystemLevel;
  private readonly tooltip = new Tooltip();
  private readonly fade = new Fade();
  private phase: ActivePhase | null = null;
  private elapsed = 0;

  constructor(
    private readonly game: Game,
    galaxy: GalaxyData,
    start: StarRef,
    private readonly debug: Debug,
  ) {
    const { camera, input, renderer } = game;
    this.galaxyLevel = new GalaxyLevel(galaxy, start, camera, input, renderer.domElement, this.tooltip, debug, () =>
      this.toSystem(),
    );
    this._systemLevel = this.createSystem(start);
    game.setLevel(this._systemLevel);
  }

  get systemLevel(): SystemLevel {
    return this._systemLevel;
  }

  get mode(): 'system' | 'galaxy' {
    return this.game.level === this.galaxyLevel ? 'galaxy' : 'system';
  }

  get transitioning(): boolean {
    return this.phase !== null;
  }

  /** System → galaxy, framed on the current star. */
  toGalaxy(): void {
    if (this.transitioning || this.mode === 'galaxy') return;
    const from = this._systemLevel.orbit;
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
    if (this.transitioning || this.mode === 'system' || ship.travelling) return;
    const from = this.galaxyLevel.orbit;
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

  update(frameDt: number): void {
    const phase = this.phase;
    if (!phase) return;
    this.elapsed += frameDt;
    const { distance, fade } = samplePhase(phase, this.elapsed);
    phase.orbit.setDistance(distance);
    this.fade.set(fade);
    if (this.elapsed < phase.duration) return;

    this.elapsed = 0;
    this.phase = phase.then();
    if (!this.phase) this.game.input.blocked = false;
  }

  dispose(): void {
    this._systemLevel.dispose();
    this.galaxyLevel.dispose();
  }

  private begin(phase: ActivePhase): void {
    this.phase = phase;
    this.elapsed = 0;
    this.game.input.blocked = true;
  }

  private createSystem(ref: StarRef): SystemLevel {
    const { camera, input } = this.game;
    const level = new SystemLevel(ref, camera, input, this.tooltip, this.debug, () => this.toGalaxy());
    // Remember the system in the URL, so a reload comes back here.
    const url = new URL(location.href);
    url.searchParams.set('star', String(ref.id));
    history.replaceState(null, '', url);
    return level;
  }
}
