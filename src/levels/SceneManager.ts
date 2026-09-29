import * as THREE from 'three';
import type { SoundEffects } from '../audio/sfx';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import type { GalaxyData, StarRef } from '../gen/galaxy';
import { Tooltip } from '../ui/Tooltip';
import type { Planet } from '../world/Planet';
import { GALAXY_VIEW_DISTANCE, GalaxyLevel } from './GalaxyLevel';
import { PLANET_VIEW_DISTANCE, PlanetLevel } from './PlanetLevel';
import type { Level } from './Level';
import {
  galaxyScale,
  handoverIn,
  handoverOut,
  planetHandoverIn,
  planetHandoverOut,
  planetZoomParams,
  sampleSeamlessZoom,
  seamlessZoomParams,
  type SeamlessSample,
  type SeamlessZoom,
} from './seamlessZoom';
import { ARRIVAL_DISTANCE, SystemLevel } from './SystemLevel';

/**
 * The origin: the system's barycentre, where the system camera looks during the
 * galaxy zoom, and the globe's centre in the planet level. Never modified.
 */
const ORIGIN = new THREE.Vector3();
/** A camera looks along its local -Z, so +Z points from what it looks at back to it. */
const BACK = new THREE.Vector3(0, 0, 1);

export type LevelMode = 'system' | 'galaxy' | 'planet';

/** A running zoom between two levels: one timeline (seamlessZoom.ts) driving both. */
interface SeamlessTransition {
  zoom: SeamlessZoom;
  elapsed: number;
  started: boolean;
  outgoing: Level;
  incoming: Level;
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
 * the way back up). Each transition is one continuous zoom with no cut, under
 * a whoosh, with input blocked meanwhile: the outgoing level plays alone, then
 * both are drawn and crossfaded, framed identically, then the incoming one
 * plays alone.
 *
 * Galaxy ↔ system: the galaxy camera dives at the star while the
 * UFO shrinks into it and a close-up of the system's star(s) grows out of its
 * dot; then both levels are drawn and crossfaded, framed identically (same
 * distance in each level's units, the view turned by the system's galactic
 * tilt), and the system camera zooms on while turning back to its own orbit
 * and over to the UFO, which grows back. Zooming out is the same in reverse.
 * System ↔ planet works the same way, framed on the body: the planet level
 * shows the same globe (in its own units and spinning frame), with the rest
 * of the system as its sky. A global entity: it runs before the active level
 * each frame.
 */
export class SceneManager implements Entity {
  readonly galaxyLevel: GalaxyLevel;
  private _systemLevel: SystemLevel;
  private _planetLevel: PlanetLevel | null = null;
  private readonly side = new THREE.Vector3();
  private readonly tooltip = new Tooltip();
  private seamless: SeamlessTransition | null = null;
  // Scratch for the seamless zoom (live: the cameras read them every frame).
  private readonly view = new THREE.Quaternion();
  private readonly rotation = new THREE.Quaternion();
  private readonly direction = new THREE.Vector3();
  /** The visited body's spin, from the planet level's frame (see Planet.spinAt). */
  private readonly planetSpin = (time: number) => this._planetLevel?.frame.spinAt(time) ?? 0;

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
    return this.seamless !== null;
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
      incoming: galaxy,
      apply: (s) => {
        if (s.blend < 1) {
          from.setFocus(ORIGIN, s.lead);
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
      incoming: system,
      apply: (s) => {
        if (s.blend < 1) {
          // The camera follows the ship into the star.
          from.setDistance(s.distance * scale);
          galaxy.setDive(s.lead);
        }
        if (s.blend > 0) {
          to.setFocus(ORIGIN, 1 - s.tail);
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
   * parked at (or right next to). Does nothing away from planets. The camera
   * flies at the body as the UFO shrinks away, then the planet level (built
   * as the zoom starts) takes over, framed identically through the body
   * frame, and zooms on down to the UFO, which grows back above the part of
   * the globe the camera was looking at.
   */
  toPlanet(body: Planet | null = this._systemLevel.approachableBody()): void {
    if (this.transitioning || this.mode !== 'system' || !body) return;
    const system = this._systemLevel;
    const from = system.orbit;
    const camera = this.game.camera;
    const handover = planetHandoverIn(body.radius, camera.position.distanceTo(body.renderPosition));
    // Arrive under the camera: its orbit keeps its direction while it flies at the body.
    const side = this.side.copy(BACK).applyQuaternion(from.orientation(this.view));
    const level = this.createPlanet(body, side);
    const to = level.orbit;
    const { frame } = level;
    const scale = frame.scale;
    // Body frame from system space.
    const matchView = () => from.orientation(this.view).premultiply(frame.inverse);
    this.sfx.play('transitionIn');
    this.beginSeamless({
      zoom: this.planetZoom(from.zoom, handover, PLANET_VIEW_DISTANCE / scale),
      outgoing: system,
      incoming: level,
      apply: (s) => {
        if (s.blend < 1) {
          from.setFocus(body.renderPosition, s.lead);
          from.setDistance(s.distance);
          system.ship.setScale(1 - s.lead);
        }
        if (s.blend > 0) {
          to.setFocus(ORIGIN, 1 - s.tail);
          to.setDistance(s.distance * scale);
          to.setView(matchView(), 1 - s.tail);
          level.ship.setScale(s.tail);
        }
        // Both show the same globe: the system's turns with the planet level's (slower) spin.
        body.spinAt = s.blend > 0 && s.blend < 1 ? this.planetSpin : null;
      },
      swap: () => {
        // The system ran on during the lead: start the planet level's clock and spin from here.
        level.restart(system.world.time, side);
        this.game.setLevel(level);
        // Settle behind the ship facing the way the screen's top pointed (the camera looks down on it now).
        to.lookFrom(this.direction.set(0, -1, 0).applyQuaternion(matchView()), true);
      },
      finish: () => {
        body.spinAt = null;
        from.setFocus(null);
        system.ship.setScale(1);
        to.setFocus(null);
        to.setView(null);
        to.zoomTo(PLANET_VIEW_DISTANCE);
        level.ship.setScale(1);
      },
    });
  }

  /**
   * Low orbit → back to the system, which catches up with the time spent at
   * the planet. The planet camera pulls back to take in the globe as the UFO
   * shrinks away, the system takes over framed identically, and its camera
   * pulls on back and over to the ship, parked beside the body on the side it
   * was flying over.
   */
  leavePlanet(): void {
    const planet = this._planetLevel;
    if (this.transitioning || !planet || this.mode !== 'planet') return;
    const system = this._systemLevel;
    const { body, frame } = planet;
    const from = planet.orbit;
    const to = system.orbit;
    const scale = frame.scale;
    const handover = planetHandoverOut(body.radius, from.zoom / scale);
    const end = Math.max(ARRIVAL_DISTANCE / 2, body.radius * 3);
    // System space from the body frame.
    const matchView = () => from.orientation(this.view).premultiply(frame.quaternion);
    this.sfx.play('transitionOut');
    this.beginSeamless({
      zoom: this.planetZoom(from.zoom / scale, handover, end),
      outgoing: planet,
      incoming: system,
      apply: (s) => {
        if (s.blend < 1) {
          from.setFocus(ORIGIN, s.lead);
          from.setDistance(s.distance * scale);
          planet.ship.setScale(1 - s.lead);
        }
        if (s.blend > 0) {
          to.setFocus(body.renderPosition, 1 - s.tail);
          to.setDistance(s.distance);
          to.setView(matchView(), 1 - s.tail);
          system.ship.setScale(s.tail);
        }
        body.spinAt = s.blend > 0 && s.blend < 1 ? this.planetSpin : null;
      },
      swap: () => {
        system.world.setTime(planet.time);
        body.spinAngle = frame.spinAngle;
        planet.exitSide(this.side);
        system.ship.parkAt(body, this.side);
        this.game.setLevel(system);
        system.eye.settleNext();
        to.lookFrom(this.direction.copy(BACK).applyQuaternion(matchView()));
      },
      finish: () => {
        body.spinAt = null;
        this.dropPlanet();
        to.setFocus(null);
        to.setView(null);
        to.zoomTo(end);
        system.ship.setScale(1);
      },
    });
  }

  update(frameDt: number): void {
    // Flying into a planet or moon takes you down to it too.
    if (!this.transitioning && this.mode === 'system') {
      const body = this._systemLevel.bodyInReach();
      if (body) this.toPlanet(body);
    }
    if (this.seamless) this.stepSeamless(frameDt);
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

  private planetZoom(start: number, handover: number, end: number): SeamlessZoom {
    const { lead, overlap, tail } = planetZoomParams;
    return { lead, overlap, tail, start, handover, end };
  }

  private beginSeamless(t: Omit<SeamlessTransition, 'elapsed' | 'swapped' | 'started'>): void {
    this.seamless = { ...t, elapsed: 0, swapped: false, started: false };
    this.game.input.blocked = true;
    t.apply(sampleSeamlessZoom(t.zoom, 0));
    // Compile the incoming level's shaders now, not on its first frame mid-crossfade (a visible stall).
    this.game.renderer.compile(t.incoming.scene, this.game.camera);
  }

  private stepSeamless(frameDt: number): void {
    const t = this.seamless!;
    // The first frame's time went into setting the zoom up (building a level, compiling): don't skip ahead by it.
    if (t.started) t.elapsed += frameDt;
    t.started = true;
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
