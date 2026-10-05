import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Input } from '../core/Input';
import { describeClimateDetail } from '../gen/climate';
import { describeLife } from '../gen/life';
import { cometActivity, describeNucleus } from '../gen/comets';
import { describeShape } from '../gen/shape';
import { keplerPosition, type KeplerOrbit } from '../gen/orbit';
import { GLOBE_SIZE_FACTOR } from '../gen/planets';
import { bodyLabLink } from '../lab/bodyLink';
import { describeGeysers, geyserActivity } from '../gen/geysers';
import { describeWeather } from '../gen/weather';
import { CometActivity } from '../planet/CometActivity';
import { Meteors } from '../planet/Meteors';
import { atmosphereLook } from '../gen/atmosphere';
import { GIANT_ESCAPE_VELOCITY, METEOR_MIN_PRESSURE, describeShower, meteorShowers } from '../gen/meteors';
import { Geysers } from '../planet/Geysers';
import { Weather } from '../planet/Weather';
import { ShipWake } from '../planet/ShipWake';
import { VentSounds } from '../planet/VentSounds';
import { LavaEruptions } from '../planet/LavaEruptions';
import { LocalMoons } from '../planet/LocalMoons';
import { PlanetFrame } from '../planet/PlanetFrame';
import { PlanetGlobe, RELIEF_SCALE } from '../planet/PlanetGlobe';
import { followWeight } from '../planet/ground';
import { PlanetHud } from '../planet/PlanetHud';
import { PlanetLights } from '../planet/PlanetLights';
import { PlanetMap } from '../planet/PlanetMap';
import { PlanetPicker } from '../planet/PlanetPicker';
import { PlanetShip } from '../planet/PlanetShip';
import { SpeciesTab, type SpeciesIcons } from '../planet/SpeciesTab';
import { Radar } from '../radar/Radar';
import { maxViewDistance, travelScale } from '../planet/frame';
import { OrbitCamera, type OrbitParams } from '../player/OrbitCamera';
import { flightAltitude, maxLookUpAt, minPitchAt, zoomCurveParams, zoomFraction } from '../player/zoomCurve';
import type { SurfaceChanges } from '../surface/changes';
import { PlantTooltip } from '../surface/PlantTooltip';
import { plantSetup } from '../surface/plantSetup';
import { animalSetup } from '../surface/animalSetup';
import { SurfaceAnimals } from '../surface/SurfaceAnimals';
import { SurfaceEntities } from '../surface/SurfaceEntities';
import type { Tooltip } from '../ui/Tooltip';
import { cometParams } from '../world/Comet';
import { galacticLightParams } from '../world/galacticLight';
import type { Planet } from '../world/Planet';
import { Level } from './Level';
import type { SystemLevel } from './SystemLevel';
import { renderScene } from '../world/wireframe';
import type { SoundEffects } from '../audio/sfx';
import { PlanetBuster } from '../combat/PlanetBuster';
import { VolcanoBomb } from '../combat/VolcanoBomb';
import { Laser } from '../combat/Laser';
import { volcanoParams } from '../combat/volcano';
import { Volcanoes } from '../planet/Volcanoes';
import { hashSeed } from '../gen/rng';
import { isGas } from '../world/Planet';
import type { ItemId, ItemStatus, ItemSwitches, ItemUser } from '../combat/items';
import { bodyKey } from '../combat/busted';
import { CargoBeam } from '../cargo/CargoBeam';
import { bodyGravity } from '../cargo/beam';
import type { Inventory } from '../cargo/inventory';
import { weatherKind } from '../gen/weather';
import { PlantBrush } from '../surface/PlantBrush';
import { Plantings } from '../surface/Plantings';
import { GroundRocks } from '../surface/GroundRocks';
import { rockSetup } from '../surface/rockSetup';
import { DEBRIS_REACH, debrisLookFor } from '../gen/debris';
import { DEBRIS_NEAR, DebrisField } from '../world/DebrisField';

/**
 * Low-orbit camera, in planet-level units (an Earth-sized globe's radius is
 * EARTH_GLOBE_RADIUS). The near end is next to the UFO; maxDistance (for
 * Earth-sized and bigger globes) takes in the globe, so it grows with them.
 */
export const planetCameraParams: OrbitParams = {
  minDistance: 8,
  maxDistance: 260 * GLOBE_SIZE_FACTOR,
  zoomSpeed: 0.0025,
  rotateSpeed: 0.005,
  damping: 0.1,
};

/** Where the camera settles after descending. */
export const PLANET_VIEW_DISTANCE = 45;
/** The camera keeps this far above the terrain beneath it (planet units; the ship's lowest altitude is 3). */
const CAMERA_CLEARANCE = 1.5;
/** Over a small body the camera pulls back at most this many of its radii (its longest reach) from the ship. */
export const SMALL_BODY_VIEW_RADII = 6;
/** Seconds back along a comet's orbit to find the way it's going. */
const COMET_MOTION_DT = 0.25;
/** The globe's centre (the planet level's origin). Never modified. */
const ORIGIN = new THREE.Vector3();
/** Watching a planet buster: seconds to turn to the globe and back, and the most the view turns from the ship (radians). */
const WATCH_EASE = 0.8;
const WATCH_LIMIT = 0.45;
/** The HUD's line under the name once the body is busted. */
const BUSTED_DETAIL = 'Blown apart by a planet buster: a field of rubble and dust';
/** Over a giant's cloud tops (no atmosphere shell), meteors burn up to this many radii from the centre. */
const GIANT_METEOR_TOP = 1.06;
/** Bodies in the sky are drawn at least this many pixels in radius. */
const SKY_MIN_PIXELS = 1.5;
/** The sky camera's clipping range, in system units. */
const SKY_NEAR = 0.2;
const SKY_FAR = 20000;

/**
 * Low orbit over one planet or moon, in its own body frame and units (see
 * planet/frame.ts): the detailed globe, its moons, sunlight from the real
 * star direction, and the ship on a scripted orbit (no physics world).
 *
 * The rest of the system is the sky: each frame, the (inactive) system level
 * is posed at this level's clock and rendered from a camera at the matching
 * place and orientation in system space, then this scene is drawn over it.
 * So the star, other planets and moons are where they really are, at their
 * true angular size and lit with correct phases.
 */
export class PlanetLevel extends Level implements ItemUser {
  override readonly touchControls = 'surface';
  readonly frame: PlanetFrame;
  readonly ship: PlanetShip;
  readonly orbit: OrbitCamera;
  /** The globe's sea-level radius in planet-level units: the body's true size (see planet/frame.ts). */
  readonly radius: number;
  private readonly moons: LocalMoons;
  /** Lava worlds and moons only (and not once busted, as for the rest of what lives on the surface). */
  eruptions: LavaEruptions | null = null;
  /** Bodies with geothermal activity only (see gen/geysers.ts). */
  geysers: Geysers | null = null;
  /** The geysers' sound, as loud as the vents erupting near the camera are. */
  ventSounds: VentSounds | null = null;
  /** Bodies with weather only: rain, lightning bolts and their light (the clouds are the globe's). */
  weather: Weather | null = null;
  /** Bodies whose orbit crosses a comet's dust stream: meteors (or impact flashes) while it does (not once busted). */
  meteors: Meteors | null = null;
  /** Water and lava seas (not once busted): the ship's downwash on the sea below it. */
  wake: ShipWake | null = null;
  /** Comets only: their jets, coma and tails, as active as the comet is close to the star. */
  comet: CometActivity | null = null;
  /** A comet's orbit, which bends its dust tail back. */
  private readonly cometOrbit: KeplerOrbit | null;
  private readonly before = new THREE.Vector3();
  private readonly now = new THREE.Vector3();
  /** Habitable bodies (T1 and up) only: plants standing on the ground (see gen/plants.ts). */
  plants: SurfaceEntities | null = null;
  /** Solid bodies (not once busted): the loose rocks on the ground, loaded as the camera comes near it (gen/rocks.ts). */
  rocks: GroundRocks | null = null;
  /** The animals roaming it (gen/animals.ts), where plants grow. */
  animals: SurfaceAnimals | null = null;
  /** The radar, tracking a species of those animals picked on the map's Species tab (not once busted). */
  radar: Radar | null = null;
  /** Plants the player set down here that took root (not once busted). */
  plantings: Plantings | null = null;
  private plantTooltip: PlantTooltip | null = null;
  /** The abduction beam and the cargo it sets down (not once busted). */
  cargo: CargoBeam | null = null;
  /** The planet buster, fired from here (spent once the body is busted). */
  readonly buster: PlanetBuster;
  /** The volcano bomb, fired from here at solid ground (not on giants or once busted). */
  readonly volcanoBomb: VolcanoBomb;
  /** The laser, killing the animals and plants it touches. */
  readonly laser: Laser;
  /** Solid bodies only (and not once busted): the volcanoes raised on it, kept in its change list. */
  volcanoes: Volcanoes | null = null;
  /** Once busted: its debris field, and the system time of the blast. */
  private debris: DebrisField | null = null;
  private blastTime = 0;
  /** How far the camera has turned from the ship to the globe's centre to watch the buster go off (0–1). */
  private watchWeight = 0;
  private readonly globe: PlanetGlobe;
  private readonly hud: PlanetHud;
  /** The Equal Earth map in the corner (mouse players). */
  readonly map: PlanetMap;
  /** Bodies drawn by this level, left out of the sky: the planet and its moons. */
  private readonly hidden: readonly Planet[];
  private readonly skyCamera = new THREE.PerspectiveCamera(65, 1, SKY_NEAR, SKY_FAR);
  private readonly start = new THREE.Vector3();
  private readonly cameraDir = new THREE.Vector3();
  private readonly cameraParams: OrbitParams;

  constructor(
    private readonly system: SystemLevel,
    readonly body: Planet,
    /** System-space direction from the body where the player arrives (the side the ship was on). */
    side: THREE.Vector3,
    camera: THREE.PerspectiveCamera,
    input: Input,
    debug: Debug,
    /** Called when the player scrolls out past low orbit (back to the system). */
    onZoomOut: () => void,
    /** What has been done to this body's surface entities, kept by the scene manager across visits. */
    private readonly changes: SurfaceChanges,
    /** Shows the plant under the pointer. */
    tooltip: Tooltip,
    sfx: SoundEffects,
    /** The system time the body was blown apart by a planet buster, or null if it's whole. */
    blastTime: number | null,
    /** Called as a planet buster is fired here, with the system time of the blast to come. */
    private readonly onBust: (blastTime: number) => void,
    /** The ship's cargo hold (kept by the scene manager for the whole game). */
    inventory: Inventory,
    /** Which switch items are on: the radar tracks only while it is (kept by the scene manager for the whole game). */
    private readonly switches: ItemSwitches,
    /** Pictures of species for the map's Species tab (none in tests). */
    icons: SpeciesIcons | null = null,
  ) {
    super();
    this.frame = this.add(new PlanetFrame(body, system.world.time, debug));
    const globe = (this.globe = this.add(new PlanetGlobe(this.scene, body.config, this.frame, camera, debug)));
    const busted = blastTime !== null;
    if (busted) {
      globe.bust(globe.radius * DEBRIS_REACH);
      this.addDebris(blastTime);
    }
    this.eruptions =
      globe.lava && !busted
        ? this.add(new LavaEruptions(this.scene, this.frame, globe.lava.activity, body.config.seed, body.config.style.sea!, debug))
        : null;
    const { config } = body;
    // Its activity follows the same 1/r² from the star as the tails in the sky (and is off far out).
    const activity = () => cometActivity(this.frame.center.length(), system.data.habitableRadius, cometParams.activeDistance);
    const comet = config.small === 'comet' && config.shape ? system.world.comets.find((c) => c.nucleus === body) : undefined;
    this.cometOrbit = comet?.data.orbit ?? null;
    this.comet =
      comet && config.shape && !busted
        ? this.add(
            new CometActivity(
              this.scene,
              this.frame,
              config.seed,
              config.shape,
              globe.radius,
              globe.groundHeight,
              globe.sun,
              globe.sunLight,
              globe.ambientLight,
              activity,
              { ion: comet.data.ionColor, dust: comet.data.dustColor },
              debug,
            ),
          )
        : null;
    const geysers = geyserActivity({ ...config, moon: body.parent !== null }, globe.radius, RELIEF_SCALE);
    this.geysers =
      geysers && !busted
        ? this.add(new Geysers(this.scene, this.frame, geysers, config.seed, globe.sun, globe.sunLight, globe.ambientLight, debug))
        : null;
    this.moons = this.add(
      new LocalMoons(
        this.scene,
        this.frame,
        system.world.moons.filter((m) => m.parent === body),
        globe.sun,
      ),
    );
    this.hidden = [body, ...this.moons.moons];
    this.add(
      new PlanetLights(
        this.scene,
        this.frame,
        system.world.stars,
        globe.sun,
        globe.sunLight,
        globe.ambientLight,
        system.world.galacticCentre,
      ),
    );

    this.frame.toLocalDirection(side, this.start);
    this.radius = globe.radius;
    // A small body is framed by its own size (the usual minimum would leave a comet a speck).
    const small = config.shape ? SMALL_BODY_VIEW_RADII * globe.radius : undefined;
    this.cameraParams = { ...planetCameraParams, maxDistance: maxViewDistance(globe.radius, planetCameraParams.maxDistance, small) };
    this.ship = this.add(
      new PlanetShip(this.scene, input, camera, debug, this.flyingRadius(PLANET_VIEW_DISTANCE), this.start, travelScale(globe.radius), {
        height: globe.groundHeight,
        // The debris field's edge once busted.
        get top() {
          return globe.top;
        },
      }),
    );
    this.setFlight(PLANET_VIEW_DISTANCE);
    this.ship.placeAt(this.start);
    this.orbit = this.add(
      new OrbitCamera(
        camera,
        this.ship.object,
        input,
        this.cameraParams,
        {
          distance: PLANET_VIEW_DISTANCE,
          up: this.ship.up,
          // Never inside the globe, whatever the zoom transitions do: above the highest terrain.
          keepOut: (position) => this.keepAboveTerrain(position),
          // Stay above the ship's horizon, so the camera never dips into the ground.
          minPitch: THREE.MathUtils.degToRad(5),
          pitch: THREE.MathUtils.degToRad(40),
          // Dragging on down tips the view up to the sky.
          lookUp: zoomCurveParams.lookUp,
          // Not while a planet buster is going off.
          onZoomPastLimit: (dir) => dir > 0 && !this.busy && onZoomOut(),
        },
        debug,
        'Planet camera',
      ),
    );
    // After the camera: heard from where it is this frame.
    this.ventSounds = this.geysers ? this.add(new VentSounds(this.geysers, camera, this.frame, sfx, debug)) : null;
    // After the ship: the downwash under it on the water or lava, where it's drawn this frame.
    this.wake = ShipWake.wanted(globe) && !busted ? this.add(new ShipWake(this.scene, globe, this.ship.object, camera, globe.sun)) : null;
    // After the camera: the bolts face this frame's view.
    this.weather =
      globe.weather && !busted
        ? this.add(
            new Weather(this.scene, this.frame, globe.weather, config, camera, globe.sun, globe.sunLight, globe.ambientLight, debug),
          )
        : null;
    // After the camera: a rising volcano shakes it.
    const volcanoes = (this.volcanoes =
      !busted && !isGas(config)
        ? this.add(new Volcanoes(this.scene, this.frame, globe, camera, globe.sun, globe.sunLight, globe.ambientLight, debug))
        : null);
    // Those raised on earlier visits stand there, risen and settled.
    if (volcanoes) for (const site of changes.volcanoes) volcanoes.add(site, null);
    const plantsSetup = busted ? null : plantSetup(config);
    this.plants = plantsSetup ? this.add(new SurfaceEntities(this.scene, plantsSetup.plan, plantsSetup.ground, camera, changes, debug)) : null;
    const rocks = busted ? null : rockSetup(config);
    this.rocks = rocks ? this.add(new GroundRocks(this.scene, rocks.plan, rocks.ground, camera, debug)) : null;
    this.buryPlants();
    const animalsSetup = busted ? null : animalSetup(config, plantsSetup);
    this.animals = animalsSetup ? this.add(new SurfaceAnimals(this.scene, animalsSetup.plan, animalsSetup.ground, camera, this.frame, debug, changes)) : null;
    // After the ship and the camera: its waves spread round where the ship is drawn this frame.
    this.radar = animalsSetup
      ? this.add(new Radar(this.scene, animalsSetup.plan, animalsSetup.ground, this.ship, camera, this.frame, sfx, () => switches.isOn('radar'), debug, changes))
      : null;
    this.plantings = busted ? null : this.add(new Plantings(this.scene, changes));
    // The plants the ship goes through shake: the planet's own and those set down (gone once it's busted).
    this.add(new PlantBrush(this.ship, () => [this.plants, this.plantings], debug));
    this.plantTooltip = this.plantings
      ? this.add(new PlantTooltip(camera, input, this.plants, this.plantings, tooltip, this.animals, (ray, out) => globe.groundHit(ray, out)))
      : null;
    const events = { fire: (time: number) => this.fire(time), blast: () => this.blast(), done: () => this.settled() };
    this.buster = this.add(new PlanetBuster(this.scene, this.frame, camera, input, globe, this.ship.object, sfx, events, busted, debug));
    // Before the beam and the picker: a press the laser takes is neither (the beam takes every press it sees).
    this.laser = this.add(
      new Laser(this.scene, camera, input, globe, this.ship, this, sfx, () => (this.busy ? 'Not while the planet buster goes off' : null), bodyKey(config), debug),
    );
    // Before the picker: a press the beam takes isn't a click that flies the ship.
    const world = { climate: config.climate ?? null, weather: weatherKind(config.type, config.climate) };
    this.cargo = this.plantings
      ? this.add(
          new CargoBeam(
            this.scene,
            camera,
            input,
            globe,
            this.ship,
            this.plants,
            this.plantings,
            this.animals,
            inventory,
            { key: bodyKey(config), name: body.name, world, gravity: bodyGravity(config) },
            sfx,
            () => (this.busy ? 'Not while the planet buster goes off' : null),
            debug,
          ),
        )
      : null;
    this.volcanoBomb = this.add(
      new VolcanoBomb(
        this.scene,
        this.frame,
        camera,
        input,
        globe,
        this.ship.object,
        sfx,
        () => this.volcanoBlock(),
        (point, time) => this.raiseVolcano(point, time),
      ),
    );
    this.add(
      new PlanetPicker(
        this.scene,
        camera,
        input,
        this.ship,
        (ray, out) => globe.groundHit(ray, out),
        globe.groundHeight,
        (point) => this.buster.click(point) || this.volcanoBomb.click(point),
      ),
    );
    const { climate } = config;
    const weatherLine = globe.weather ? describeWeather(globe.weather.data) : '';
    const detail = busted
      ? BUSTED_DETAIL
      : climate
        ? describeClimateDetail(climate) +
          (geysers ? ` · ${describeGeysers(geysers.kind)}` : '') +
          (weatherLine ? ` · ${weatherLine}` : '') +
          (config.life ? ` · ${describeLife(config.life)}` : '')
        : config.small === 'comet' && config.shape
          ? describeNucleus(config.shape, activity())
          : config.shape
            ? describeShape(config.shape)
            : null;
    // Meteor showers where the body's orbit (a moon's: its planet's) crosses a comet's dust stream.
    const heliocentric = body.parent?.config ?? config;
    const showers =
      config.shape || config.path || busted
        ? []
        : meteorShowers(
            { orbit: heliocentric.orbit, escapeVelocity: climate?.escapeVelocity ?? GIANT_ESCAPE_VELOCITY, seed: config.seed },
            system.data.comets,
            system.data.habitableRadius,
          );
    const airless = config.type !== 'gas' && !(climate && climate.pressure >= METEOR_MIN_PRESSURE);
    const look = climate && !airless ? atmosphereLook(climate, config.radius) : null;
    this.meteors = showers.length
      ? this.add(
          new Meteors(
            this.scene,
            this.frame,
            showers,
            heliocentric.orbit,
            airless,
            globe.radius,
            look?.top ?? GIANT_METEOR_TOP,
            globe.groundHeight,
            camera,
            globe.sun,
            this.ship.object,
            debug,
          ),
        )
      : null;
    const showerLine = () =>
      this.meteors?.shower
        ? describeShower(this.meteors.shower, airless) + (this.meteors.radiantUp ? '' : ' (radiant below the horizon)')
        : '';
    this.hud = this.add(new PlanetHud(this.ship, `${body.name} · ${body.description}`, input, detail, showerLine));
    const species = new SpeciesTab(bodyKey(config), animalsSetup?.plan.species ?? [], plantsSetup?.plan.species ?? [], this.radar, icons, () => switches.isOn('radar'));
    this.map = this.add(new PlanetMap(config, body.name, this.ship, globe, input, debug, species));
    debug
      .folder('Planet lab')
      ?.add({ open: () => window.open(this.labLink(), '_blank') }, 'open')
      .name('Open this planet in the lab');
  }

  /** True when the globe has every chunk of terrain the camera wants (automation, e.g. restoring a debug dump). */
  get globeSettled(): boolean {
    return this.globe.settled;
  }

  /** The ground's radius (terrain as drawn, or the sea) in unit direction `dir` of the body frame. */
  groundRadius(dir: THREE.Vector3): number {
    return this.globe.groundRadius(dir);
  }

  /** A link to this planet (or moon, or planet with its moons) in the planet lab (lab.html). */
  labLink(): string {
    return bodyLabLink(this.body);
  }

  /** Radius of the highest terrain (once busted, the debris field's edge): the ship's altitude is measured from it. */
  private get top(): number {
    return this.globe.top;
  }

  /** True while a planet buster is going off here: the player can't leave until it's over. */
  get busy(): boolean {
    return this.buster.busy;
  }

  /** True once the body has been blown apart (or is being: from the blast on). */
  get busted(): boolean {
    return this.globe.busted;
  }

  /** The item bar's view of this level: the planet buster, the volcano bomb and the laser can be fired from here, and the beam used. */
  get selected(): ItemId | null {
    return this.buster.armed ? 'planetBuster' : this.volcanoBomb.armed ? 'volcanoBomb' : this.laser.armed ? 'laser' : (this.cargo?.selected ?? null);
  }

  status(item: ItemId): ItemStatus {
    if (item === 'radar') return this.radarStatus();
    if (item === 'planetBuster') return this.buster.status();
    if (item === 'volcanoBomb') return this.volcanoBomb.status();
    if (item === 'laser') return this.laser.status();
    if (this.cargo) return this.cargo.status(item);
    return { available: false, hint: '', reason: item === 'abduct' ? 'Nothing left here to beam up' : 'Nothing here to set it down on' };
  }

  select(item: ItemId | null): void {
    // The weapons put away before the one chosen is armed (they share the aiming cursor), and before the beam, so its cursor isn't undone.
    if (item !== 'planetBuster') this.buster.arm(false);
    if (item !== 'volcanoBomb') this.volcanoBomb.arm(false);
    if (item !== 'laser') this.laser.arm(false);
    if (item === 'planetBuster') this.buster.arm(true);
    if (item === 'volcanoBomb') this.volcanoBomb.arm(true);
    if (item === 'laser') this.laser.arm(true);
    this.cargo?.arm(item === 'planetBuster' || item === 'volcanoBomb' || item === 'laser' ? null : item);
  }

  /** The radar's line above the item bar while it's on (a switch: always available). */
  private radarStatus(): ItemStatus {
    const radar = this.radar;
    if (!this.switches.isOn('radar')) return { available: true, hint: '' };
    if (!radar) return { available: true, hint: 'Radar: no animals live here' };
    const tracking = radar.tracking;
    if (tracking === null) return { available: true, hint: "Radar on: pick an animal on the map's Species tab to track it" };
    const name = radar.plan.species[tracking]!.name;
    const state = radar.state;
    return {
      available: true,
      hint: state === 'tracking' ? `Radar: the nearest ${name} is ${radar.proximity}` : state === 'none' ? `Radar: no ${name} found here` : `Radar: searching for ${name}…`,
    };
  }

  /** Why a volcano bomb can't be fired here now, or null if it can. */
  private volcanoBlock(): string | null {
    if (isGas(this.body.config)) return 'No ground here to raise a volcano on';
    if (this.busted || !this.volcanoes) return 'Nothing left here to raise a volcano on';
    if (this.busy) return 'Planet buster away…';
    const inFlight = this.volcanoBomb?.inFlight ? 1 : 0;
    if (this.volcanoes.count + inFlight >= volcanoParams.maxPerBody) return 'No room here for more volcanoes';
    return null;
  }

  /** A volcano bomb has landed at `point` (body frame) at clock time `time`: a volcano rises there, for good. */
  private raiseVolcano(point: THREE.Vector3, time: number): void {
    if (!this.volcanoes || this.busted) return;
    const dir = point.clone().normalize();
    const site = { x: dir.x, y: dir.y, z: dir.z, seed: hashSeed(this.body.config.seed, 'volcano', this.changes.volcanoes.length) };
    this.changes.addVolcano(site);
    const shape = this.volcanoes.add(site, time);
    // The system view's globe shows it too (rising with the same clock).
    this.body.addVolcano(site, time);
    this.buryPlants();
    // Plants set down where it rose are gone for good (those set down on it later stay).
    this.plantings?.bury((dir) => dir.dot(shape.centre) > shape.cosAngle);
  }

  /** The plants where volcanoes stand are buried under them. */
  private buryPlants(): void {
    const volcanoes = this.volcanoes;
    if (!volcanoes || volcanoes.count === 0) return;
    this.plants?.setBuried((dir) => volcanoes.covers(dir));
    this.rocks?.setBuried((dir) => volcanoes.covers(dir));
  }

  /** The buster is away: hold the ship where it is and pull the camera back to watch. */
  private fire(blastTime: number): void {
    this.ship.locked = true;
    this.ship.stop();
    this.blastTime = blastTime;
    // The debris is ready (and its shaders compiled) before the blast; hidden till then.
    this.addDebris(blastTime);
    this.onBust(blastTime);
  }

  /** The blast: the globe and everything on it give way to the debris, which becomes the ground. */
  private blast(): void {
    this.globe.bust(this.radius * DEBRIS_REACH);
    this.cargo?.clear(false);
    this.laser.clear();
    for (const entity of [this.eruptions, this.geysers, this.ventSounds, this.weather, this.comet, this.plants, this.rocks, this.wake, this.animals, this.radar, this.cargo, this.plantings, this.volcanoes, this.meteors])
      if (entity) this.remove(entity);
    this.eruptions = this.geysers = this.ventSounds = this.weather = this.comet = this.plants = this.rocks = this.wake = this.animals = this.radar = this.cargo = this.plantings = this.meteors = null;
    this.volcanoes = null;
    if (this.plantTooltip) {
      this.plantTooltip.deactivate();
      this.remove(this.plantTooltip);
      this.plantTooltip = null;
    }
    this.map.deactivate();
    this.hud.bust(`${this.body.name} · ${this.body.description}`, BUSTED_DETAIL);
  }

  /** The debris has settled: fly about the field and leave as usual. */
  private settled(): void {
    this.ship.locked = false;
  }

  private addDebris(blastTime: number): void {
    const { config } = this.body;
    this.blastTime = blastTime;
    const sun = { vector: this.globe.sun, point: false };
    this.debris = new DebrisField(config.seed, config.style, config.bands, this.globe.radius, DEBRIS_NEAR, sun, debrisLookFor(config));
    this.scene.add(this.debris.object);
    this.poseDebris();
  }

  /** The debris as it is now; turned back against the body frame's spin, as the system view's doesn't spin. */
  private poseDebris(): void {
    if (!this.debris) return;
    this.debris.object.rotation.y = -this.frame.spinAngle;
    this.debris.animate(this.frame.renderTime - this.blastTime);
  }

  override dispose(): void {
    this.debris?.dispose();
    super.dispose();
  }

  /** The ship's distance from the centre with the camera `view` from it: the zoom sets the altitude. */
  flyingRadius(view: number): number {
    const { minDistance, maxDistance } = this.cameraParams;
    return this.top + flightAltitude(zoomFraction(view, minDistance, maxDistance), this.radius);
  }

  /** Tells the ship how high to fly with the camera `view` from it: the zoom's altitude, following the ground when low. */
  private setFlight(view: number): void {
    const { minDistance, maxDistance } = this.cameraParams;
    this.ship.setRadius(this.flyingRadius(view), followWeight(zoomFraction(view, minDistance, maxDistance)));
  }

  /** Lifts a camera position (the globe is centred on the origin) to just above the terrain beneath it if it's lower. */
  private keepAboveTerrain(position: THREE.Vector3): void {
    const d = position.length();
    if (d < 1e-6) {
      position.set(0, this.top + CAMERA_CLEARANCE, 0);
      return;
    }
    const floor = this.globe.groundRadius(this.cameraDir.copy(position).divideScalar(d)) + CAMERA_CLEARANCE;
    if (d < floor) position.multiplyScalar(floor / d);
  }

  override update(frameDt: number, alpha: number): void {
    // Round a rogue planet only the galaxy's dim glow lights the air.
    if (this.system.starless) this.globe.sunStrength.value = galacticLightParams.air;
    if (this.comet && this.cometOrbit) {
      // The dust tail lags behind the comet: opposite its motion, in the body frame.
      const time = this.frame.renderTime;
      keplerPosition(this.cometOrbit, time - COMET_MOTION_DT, this.before).sub(keplerPosition(this.cometOrbit, time, this.now));
      this.frame.toLocalDirection(this.before.normalize(), this.comet.back);
    }
    // While the buster goes off, the camera pulls back and turns to take in the whole planet (keeping the ship in view).
    if (this.busy && !this.zoomLocked) this.orbit.zoomTo(this.cameraParams.maxDistance);
    const watch = this.busy ? 1 : 0;
    if (watch > 0 || this.watchWeight > 0) {
      this.watchWeight += (watch - this.watchWeight) * (1 - Math.exp(-frameDt / WATCH_EASE));
      if (watch === 0 && this.watchWeight < 0.01) this.watchWeight = 0;
      this.orbit.setAim(this.watchWeight > 0 ? ORIGIN : null, this.watchWeight, WATCH_LIMIT);
    }
    super.update(frameDt, alpha);
    this.poseDebris();
    if (this.zoomLocked) return;
    // Scrolling lifts or lowers the ship, and high up the camera tips over to look down on the globe.
    const { minDistance, maxDistance } = this.cameraParams;
    this.setFlight(this.orbit.zoom);
    const f = zoomFraction(this.orbit.zoom, minDistance, maxDistance);
    this.orbit.setMinPitch(minPitchAt(f));
    this.orbit.setMaxLookUp(maxLookUpAt(f));
  }

  /** System time here; the system level catches up to it on return. */
  get time(): number {
    return this.frame.time;
  }

  /** What the sky shows, for tests: stars, bodies drawn in it, and moons drawn as meshes here. */
  get skyStats(): { stars: number; bodies: number; localMoons: number } {
    const world = this.system.world;
    return {
      stars: world.stars.length,
      bodies: world.planets.length + world.moons.length + world.nuclei.length + world.asteroids.length - this.hidden.length,
      localMoons: this.moons.moons.length,
    };
  }

  override render(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    // The sky camera sits where this camera is, in system space, looking the same way.
    const sky = this.skyCamera;
    if (sky.fov !== camera.fov || sky.aspect !== camera.aspect) {
      sky.fov = camera.fov;
      sky.aspect = camera.aspect;
      sky.updateProjectionMatrix();
    }
    this.frame.toSystemPoint(camera.position, sky.position);
    sky.quaternion.multiplyQuaternions(this.frame.quaternion, camera.quaternion);
    sky.updateMatrixWorld();
    const pixelAngle = THREE.MathUtils.degToRad(camera.fov) / renderer.domElement.clientHeight;

    // Round a rogue planet the eye has opened up to the dark (the sky and the globe alike).
    if (this.system.starless) renderer.toneMappingExposure = galacticLightParams.exposure;
    renderer.autoClear = false;
    renderer.clear();
    this.system.renderSky(renderer, sky, this.frame.renderTime, this.hidden, SKY_MIN_PIXELS * pixelAngle);
    // The planet is always in front of the sky (its own moons are in this scene).
    renderer.clearDepth();
    this.globe.renderDepth(renderer, camera);
    renderScene(renderer, this.scene, camera);
    renderer.toneMappingExposure = 1;
    this.map.render(renderer);
    renderer.autoClear = true;
  }

  /**
   * Restarts the level's clock at system time `time` and puts the ship above
   * `side` (a system-space direction from the body), e.g. when the level was
   * built at the start of a zoom and takes over a moment later.
   */
  restart(time: number, side: THREE.Vector3): void {
    this.frame.restart(time);
    this.ship.placeAt(this.frame.toLocalDirection(side, this.start));
  }

  override enter(): void {
    this.ventSounds?.mute(false);
    this.hud.activate();
    if (!this.busted) this.map.activate();
    this.plantTooltip?.activate();
  }

  override exit(): void {
    this.ventSounds?.mute(true);
    this.buster.arm(false);
    this.volcanoBomb.arm(false);
    this.laser.arm(false);
    this.cargo?.arm(null);
    this.hud.deactivate();
    this.map.deactivate();
    this.plantTooltip?.deactivate();
  }
}
