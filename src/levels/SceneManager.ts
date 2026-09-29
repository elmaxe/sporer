import * as THREE from 'three';
import type { SoundEffects } from '../audio/sfx';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import type { GalaxyData, StarRef } from '../gen/galaxy';
import type { OrbitCamera } from '../player/OrbitCamera';
import { Fade } from '../ui/Fade';
import { Tooltip } from '../ui/Tooltip';
import type { Planet } from '../world/Planet';
import { GALAXY_VIEW_DISTANCE, GalaxyLevel } from './GalaxyLevel';
import { PLANET_VIEW_DISTANCE, PlanetLevel, planetCameraParams } from './PlanetLevel';
import type { Level } from './Level';
import {
  galaxyScale,
  handoverIn,
  handoverOut,
  sampleSeamlessZoom,
  seamlessZoomParams,
  type SeamlessSample,
  type SeamlessZoom,
} from './seamlessZoom';
import { ARRIVAL_DISTANCE, SystemLevel } from './SystemLevel';
import { ease, samplePhase, type TransitionPhase } from './transition';

/** Seconds for each half of a planet transition (zoom + fade out, swap, zoom + fade in). */
const OUT_SECONDS = 0.45;
const IN_SECONDS = 0.8;
/** The system's barycentre, where the system camera looks during the galaxy zoom. Never modified. */
const BARYCENTRE = new THREE.Vector3();
/** A camera looks along its local -Z, so +Z points from what it looks at back to it. */
const BACK = new THREE.Vector3(0, 0, 1);
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

/** A running galaxy ↔ system zoom: one timeline (seamlessZoom.ts) driving both levels. */
interface SeamlessTransition {
  zoom: SeamlessZoom;
  elapsed: number;
  outgoing: Level;
  swapped: boolean;
  /** Poses both levels for this point of the timeline (before they update this frame). */
  apply: (s: SeamlessSample) => void;
  /** Once, as the crossfade starts: the incoming level becomes the active one. */
  swap: () => void;
  finish: () => void;
}

/**
 * Owns the levels and moves between them. Zooming out past a system shows
 * the galaxy, framed on the current star; zooming in at a star enters its
 * system (generated on demand). Zooming in while parked at a planet or moon
 * descends to its low orbit (a planet level, built on demand and dropped on
 * the way back up). Each transition reads as one continuous zoom, under a
 * whoosh, with input blocked meanwhile.
 *
 * Galaxy ↔ system is seamless: the galaxy camera dives at the star while the
 * UFO shrinks into it and a close-up of the system's star(s) grows out of its
 * dot; then both levels are drawn and crossfaded, framed identically (same
 * distance in each level's units, the view turned by the system's galactic
 * tilt), and the system camera zooms on while turning back to its own orbit
 * and over to the UFO, which grows back. Zooming out is the same in reverse.
 * Planet transitions fade through black: the old camera keeps zooming while
 * the screen fades out, the levels swap, and the new camera zooms on while it
 * fades back in. A global entity: it runs before the active level each frame.
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
  private seamless: SeamlessTransition | null = null;
  // Scratch for the seamless zoom (live: the cameras read them every frame).
  private readonly view = new THREE.Quaternion();
  private readonly rotation = new THREE.Quaternion();
  private readonly direction = new THREE.Vector3();

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
    return this.phase !== null || this.seamless !== null;
  }

  /** The incoming level's weight while two levels are crossfaded, else null (for tests). */
  get crossfade(): number | null {
    return this.game.crossfadeWeight;
  }

  /**
   * System → galaxy, framed on the current star: the camera pulls back to the
   * star(s) as the UFO shrinks away, then the galaxy takes over (its ship
   * rising out of the star) and zooms out to the usual view.
   */
  toGalaxy(): void {
    if (this.transitioning || this.mode !== 'system') return;
    const system = this._systemLevel;
    const galaxy = this.galaxyLevel;
    const from = system.orbit;
    const to = galaxy.orbit;
    const handover = handoverOut(system.data.starZone, from.zoom);
    const scale = galaxyScale(handover);
    // As the system's eye sees it (it may still be adapted to a star close up).
    galaxy.showCloseUp(system.data, scale, () => system.world.time, () => system.eye.exposure);
    // Galaxy space from system space: the system's tilt, turned with the galaxy.
    const matchView = () => from.orientation(this.view).premultiply(galaxy.systemRotation(system.data, this.rotation));
    this.sfx.play('transitionOut');
    this.beginSeamless({
      zoom: this.seamlessZoom(from.zoom, handover, GALAXY_VIEW_DISTANCE / scale),
      outgoing: system,
      apply: (s) => {
        if (s.blend < 1) {
          from.setFocus(BARYCENTRE, s.lead);
          from.setDistance(s.distance);
          system.ship.setScale(1 - s.lead);
        }
        if (s.blend > 0) {
          // The camera follows the ship, which rises out of the star.
          to.setDistance(s.distance * scale);
          to.setView(matchView(), 1 - s.tail);
          galaxy.setDive(1 - s.tail);
        }
      },
      swap: () => {
        this.game.setLevel(galaxy);
        // Settle on the orbit closest to the matched view.
        to.lookFrom(this.direction.copy(BACK).applyQuaternion(matchView()));
      },
      finish: () => {
        galaxy.hideCloseUp();
        galaxy.setDive(0);
        to.setView(null);
        to.zoomTo(GALAXY_VIEW_DISTANCE);
        from.setFocus(null);
        system.ship.setScale(1);
      },
    });
  }

  /**
   * Galaxy → the system of the star the ship is docked at. Ignored while
   * travelling. The camera dives at the star as the UFO shrinks into it and
   * the star swells into a sun, then the system takes over and zooms on in,
   * over to the UFO growing back at its place.
   */
  toSystem(): void {
    const galaxy = this.galaxyLevel;
    const ship = galaxy.ship;
    if (this.transitioning || this.mode !== 'galaxy' || ship.travelling) return;
    if (this._systemLevel.ref !== ship.current) {
      this._systemLevel.dispose();
      this._systemLevel = this.createSystem(ship.current);
    }
    const system = this._systemLevel;
    const from = galaxy.orbit;
    const to = system.orbit;
    const handover = handoverIn(system.data.starZone);
    const scale = galaxyScale(handover);
    // Dark-adapted, as the system's eye will be (it settles at the handover, with the star small).
    galaxy.showCloseUp(system.data, scale, () => system.world.time, () => 1);
    // System space from galaxy space: undo the galaxy's turn and the system's tilt.
    const matchView = () =>
      from.orientation(this.view).premultiply(galaxy.systemRotation(system.data, this.rotation).invert());
    this.sfx.play('transitionIn');
    this.beginSeamless({
      zoom: this.seamlessZoom(from.zoom / scale, handover, ARRIVAL_DISTANCE),
      outgoing: galaxy,
      apply: (s) => {
        if (s.blend < 1) {
          // The camera follows the ship into the star.
          from.setDistance(s.distance * scale);
          galaxy.setDive(s.lead);
        }
        if (s.blend > 0) {
          to.setFocus(BARYCENTRE, 1 - s.tail);
          to.setDistance(s.distance);
          to.setView(matchView(), 1 - s.tail);
          system.ship.setScale(s.tail);
        }
      },
      swap: () => {
        this.game.setLevel(system);
        system.eye.settleNext();
        // Settle on the orbit closest to the matched view.
        to.lookFrom(this.direction.copy(BACK).applyQuaternion(matchView()));
      },
      finish: () => {
        galaxy.hideCloseUp();
        galaxy.setDive(0);
        to.setFocus(null);
        to.setView(null);
        to.zoomTo(ARRIVAL_DISTANCE);
        system.ship.setScale(1);
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
    if (!this.transitioning && this.mode === 'system') {
      const body = this._systemLevel.bodyInReach();
      if (body) this.toPlanet(body);
    }
    if (this.seamless) {
      this.stepSeamless(frameDt);
      return;
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

  private seamlessZoom(start: number, handover: number, end: number): SeamlessZoom {
    const { lead, overlap, tail } = seamlessZoomParams;
    return { lead, overlap, tail, start, handover, end };
  }

  private beginSeamless(t: Omit<SeamlessTransition, 'elapsed' | 'swapped'>): void {
    this.seamless = { ...t, elapsed: 0, swapped: false };
    this.game.input.blocked = true;
    t.apply(sampleSeamlessZoom(t.zoom, 0));
  }

  private stepSeamless(frameDt: number): void {
    const t = this.seamless!;
    t.elapsed += frameDt;
    const s = sampleSeamlessZoom(t.zoom, t.elapsed);
    if (!t.swapped && s.blend > 0) {
      t.swapped = true;
      t.swap();
    }
    t.apply(s);
    // Both levels are drawn only while both show.
    this.game.setCrossfade(s.blend > 0 && s.blend < 1 ? t.outgoing : null, s.blend);
    if (!s.done) return;
    t.finish();
    this.seamless = null;
    this.game.input.blocked = false;
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
