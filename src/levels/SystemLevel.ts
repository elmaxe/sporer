import * as THREE from 'three';
import type { SoundEffects } from '../audio/sfx';
import { StarSounds } from '../audio/StarSounds';
import { FIXED_DT } from '../core/Game';
import type { Debug } from '../core/Debug';
import type { Input } from '../core/Input';
import type { StarRef } from '../gen/galaxy';
import type { NebulaData } from '../gen/nebulas';
import { generateSystem, systemExtent, type SystemData } from '../gen/system';
import { Physics } from '../physics/Physics';
import { OrbitCamera, cameraParams } from '../player/OrbitCamera';
import { Picker } from '../player/Picker';
import { Ship } from '../player/Ship';
import { TargetMarker } from '../player/TargetMarker';
import { systemMaxView } from '../player/zoomCurve';
import { Hud } from '../ui/Hud';
import { SystemMap } from '../ui/SystemMap';
import type { Tooltip } from '../ui/Tooltip';
import { GalaxyBand } from '../world/GalaxyBand';
import { NebulaSky, skyStarDimming } from '../world/NebulaSky';
import { galacticLightParams } from '../world/galacticLight';
import { galacticSky } from '../gen/galactic';
import { OrbitTrails } from '../world/OrbitTrails';
import type { CelestialBody } from '../world/CelestialBody';
import { Planet } from '../world/Planet';
import { SkyStars } from '../world/SkyStars';
import { StarSystem } from '../world/StarSystem';
import { arrivalParams, hoverViewElevation } from './arrival';
import { Level } from './Level';
import { renderScene } from '../world/wireframe';

/** Where the camera settles after flying in from the galaxy (or starting out in a system). */
export const ARRIVAL_DISTANCE = 90;
/** Flying to within this distance of a planet or moon's surface also descends to it (the ship's radius is 2). */
const TOUCH_MARGIN = 3;
/** The camera keeps this much clear of a body's surface (the view dips below the ecliptic, under the body). */
const CAMERA_CLEARANCE = 1.5;
/** Hovering at a star, the camera looks at the star but keeps the ship within this angle of the view's axis (the view is 65° tall). */
const AIM_LIMIT = (24 * Math.PI) / 180;
/** Seconds for the camera's aim to settle on the star, or back on the ship. */
const AIM_EASE = 0.7;

/**
 * A star system at system-scene units: the generated system, the player's
 * ship with its own physics world, orbit camera, picking and HUD. While the
 * player is down at a planet, the planet level draws this scene as its sky
 * (`renderSky`).
 */
export class SystemLevel extends Level {
  override readonly touchControls = 'space';
  readonly data: SystemData;
  readonly world: StarSystem;
  readonly ship: Ship;
  readonly orbit: OrbitCamera;
  readonly band: GalaxyBand;
  /** Nebulas close enough to show in the sky, or null. */
  readonly nebulaSky: NebulaSky | null;
  private readonly hud: Hud;
  /** The star, planets and moons in a row, in the corner (mouse players) or from the Map button (touch). */
  readonly map: SystemMap;
  /** The galaxy's other stars, where they really are. */
  readonly skyStars: SkyStars;
  private readonly marker: TargetMarker;
  private readonly starSounds: StarSounds;
  readonly trails: OrbitTrails;
  /** The star the camera is looking at, rather than the ship hovering over it (until the ship goes elsewhere). */
  private aimBody: CelestialBody | null = null;
  private aimWeight = 0;

  constructor(
    readonly ref: StarRef,
    camera: THREE.PerspectiveCamera,
    input: Input,
    tooltip: Tooltip,
    debug: Debug,
    /** The galaxy's stars, in this system's sky. */
    stars: readonly StarRef[],
    /** The galaxy's nebulas: the ones nearby are in the sky. */
    nebulas: readonly NebulaData[],
    sfx: SoundEffects,
    /** Called when the player scrolls out past the system (to the galaxy). */
    onZoomOut: () => void,
    /** Called when the player scrolls in past the closest zoom (to descend to a planet). */
    onZoomIn: () => void,
  ) {
    const physics = Physics.create(FIXED_DT);
    super(physics);
    this.data = generateSystem(ref);

    const near = NebulaSky.near(nebulas, ref.position);
    const dim = skyStarDimming(near, ref.position, this.data);
    this.band = this.add(new GalaxyBand(this.scene, ref, this.data, debug, dim));
    this.nebulaSky = near.length > 0 ? this.add(new NebulaSky(this.scene, ref, this.data, near, debug)) : null;
    this.skyStars = this.add(new SkyStars(this.scene, stars, ref, this.data, debug, dim));
    // With no star (a rogue planet), the galaxy's glow from its centre lights the system.
    const centre = this.data.stars.length > 0 ? undefined : galacticSky(ref.position, this.data.galacticTilt).bulge;
    this.world = this.add(new StarSystem(this.scene, physics, this.data, debug, centre));
    // Starting out here, the ship hovers above the star (or the rogue planet) as if it had just flown in from the galaxy.
    const anchor = this.world.anchor;
    this.ship = this.add(new Ship(this.scene, physics, input, this.world.bodies, debug, sfx, anchor));
    this.ship.parkAt(anchor, ARRIVAL_DISTANCE);
    // Visual-only entities below run in this order each frame: camera first, then what reads it.
    this.orbit = this.add(
      new OrbitCamera(
        camera,
        this.ship.object,
        input,
        // Big systems may zoom out further, to see them whole before leaving for the galaxy.
        { ...cameraParams, maxDistance: systemMaxView(systemExtent(this.data), cameraParams.maxDistance) },
        {
          distance: ARRIVAL_DISTANCE,
          pitch: this.hoverElevation(ARRIVAL_DISTANCE, 0),
          onZoomPastLimit: (dir) => (dir > 0 ? onZoomOut() : onZoomIn()),
          // Zoom freely on the way, but leave the system or descend only where the autopilot is going.
          zoomLimitsHold: () => this.ship.enRoute,
          keepOut: (position) => this.keepOutOfBodies(position),
        },
        debug,
        'System camera',
      ),
    );
    if (!this.starless) this.aimAt(anchor, 1);
    this.starSounds = this.add(new StarSounds(camera, this.world.stars, sfx, debug));
    const picker = this.add(new Picker(camera, input, this.ship, this.world.bodies, sfx, [], this.world.belts));
    this.trails = this.add(
      new OrbitTrails(
        this.scene,
        camera,
        // A rogue planet sits still at the centre: no orbit to trail.
        this.world.planets.filter((p) => p.config.orbit.radius > 0),
        this.world.moons,
        (body) => body === picker.hovered || body === this.ship.targetBody,
        debug,
      ),
    );
    this.marker = this.add(new TargetMarker(this.scene, camera, this.ship));
    this.map = this.add(
      new SystemMap(this.data, this.world.stars, this.world.planets, this.world.moons, this.ship, picker, input, this.world.belts),
    );
    this.hud = this.add(new Hud(this.ship, picker, this.map, input, this.data, tooltip));
  }

  /** True for a rogue planet's system: no star, lit by the galaxy's glow. */
  get starless(): boolean {
    return this.world.stars.length === 0;
  }

  /**
   * Makes the camera look at `star`, which the ship hovers above, rather than
   * at the ship, `weight` of the way (1 = at once; it eases in from 0 otherwise).
   * It stays so until the ship goes to another body.
   */
  aimAt(star: CelestialBody, weight = 0): void {
    this.aimBody = star;
    this.aimWeight = weight;
    this.orbit.setAim(star.renderPosition, weight, AIM_LIMIT);
  }

  /** While a transition drives the camera: looks at the star `k` (0–1) as much as it would (the transition fades it out). */
  aimFade(k: number): void {
    this.orbit.setAim(this.aimBody?.renderPosition ?? null, this.aimWeight * k, AIM_LIMIT);
  }

  /**
   * How high above the ecliptic (radians) a camera `distance` from the ship
   * should look down from to show the body the ship hovers at under it (see
   * `hoverViewElevation`), and no lower than `min` (e.g. the elevation it had).
   * Read after placing the ship: it uses the hover height for the ship's view.
   * Over a star the camera looks at the star anyway, so it sits low, not
   * looking down on the ship.
   */
  hoverElevation(distance: number, min: number): number {
    if (this.world.stars.some((star) => star === this.ship.targetBody)) return arrivalParams.starElevation;
    const [low, high] = arrivalParams.cameraElevation;
    const needed = hoverViewElevation(distance, this.ship.parkDistance(this.ship.targetBody), arrivalParams.bodyBelowCentre);
    return THREE.MathUtils.clamp(Math.max(needed, min), low, high);
  }

  /** The planet or moon the ship is hovering at (not flying to), which scrolling in descends to; null at a star. */
  approachableBody(): Planet | null {
    const body = this.ship.targetBody;
    return !this.ship.enRoute && body instanceof Planet ? body : null;
  }

  /** The planet or moon the ship is flying to (or at), if it's all but touching its surface. */
  bodyInReach(): Planet | null {
    const body = this.ship.targetBody;
    return body instanceof Planet && this.touching(body) ? body : null;
  }

  /**
   * Draws the system as seen from `camera` (in system units) at system time
   * `time`: the sky of the planet level. The player's ship and marker and the
   * `hidden` bodies (the planet being visited, drawn by that level) are left
   * out, as are the orbit trails, and bodies smaller than `minAngle` are
   * enlarged to it.
   */
  renderSky(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    time: number,
    hidden: readonly Planet[],
    minAngle: number,
  ): void {
    this.world.pose(time, camera.position, minAngle);
    const shipVisible = this.ship.object.visible;
    this.ship.object.visible = false;
    this.marker.hide();
    const trails = this.trails.visible;
    this.trails.visible = false;
    for (const body of hidden) body.object.visible = false;
    // A visited comet's coma and tails are all round the camera: low orbit draws them as seen from inside.
    for (const comet of this.world.comets) comet.object.visible = !hidden.includes(comet.nucleus) && !comet.nucleus.busted;
    renderScene(renderer, this.scene, camera);
    for (const body of hidden) body.object.visible = true;
    for (const comet of this.world.comets) comet.object.visible = !comet.nucleus.busted;
    this.trails.visible = trails;
    this.ship.object.visible = shipVisible;
    // This level may be drawn itself in the same frame (crossfading with the planet level).
    this.world.unpose();
  }

  override update(frameDt: number, alpha: number): void {
    super.update(frameDt, alpha);
    // The zoom sets how far from the body it's at the ship parks (read in the next fixed step).
    if (this.zoomLocked) return;
    this.ship.viewDistance = this.orbit.zoom;
    // Looking at the star while hovering over it, back at the ship once it leaves.
    const wanted = this.aimBody && this.ship.targetBody === this.aimBody ? 1 : 0;
    this.aimWeight += (wanted - this.aimWeight) * (1 - Math.exp(-frameDt / AIM_EASE));
    if (wanted === 0 && this.aimWeight < 1e-3) this.aimBody = null;
    this.orbit.setAim(this.aimBody?.renderPosition ?? null, this.aimWeight, AIM_LIMIT);
  }

  /** Pushes a camera position out of any body it's inside of, radially. */
  private keepOutOfBodies(position: THREE.Vector3): void {
    for (const body of this.world.bodies) {
      const centre = body.renderPosition;
      const reach = body.radius + CAMERA_CLEARANCE;
      const d = position.distanceTo(centre);
      if (d >= reach) continue;
      if (d < 1e-6) position.y += reach;
      else position.sub(centre).multiplyScalar(reach / d).add(centre);
    }
  }

  /** Draws the scene; round a rogue planet the eye has opened up to the dark. */
  override render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    renderer.toneMappingExposure = this.starless ? galacticLightParams.exposure : 1;
    renderScene(renderer, this.scene, camera);
    renderer.toneMappingExposure = 1;
  }

  private touching(body: Planet): boolean {
    return this.ship.object.position.distanceTo(body.renderPosition) < body.radius + TOUCH_MARGIN;
  }

  override enter(): void {
    this.hud.activate();
    this.map.activate();
    this.starSounds.mute(false);
  }

  override exit(): void {
    this.hud.deactivate();
    this.map.deactivate();
    this.ship.silence();
    this.starSounds.mute(true);
  }
}
