import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { SceneManager } from '../levels/SceneManager';
import type { SystemLevel } from '../levels/SystemLevel';
import { bodyKey } from '../combat/busted';
import { bodyLabLink } from '../lab/bodyLink';
import { lodParams } from '../planet/LodSurface';
import type { OrbitCamera } from '../player/OrbitCamera';
import { SurfaceChanges } from '../surface/changes';
import { plantParams } from '../surface/plantParams';
import type { CelestialBody } from '../world/CelestialBody';
import type { Planet } from '../world/Planet';
import type { StarSystem } from '../world/StarSystem';
import { weatherParams } from '../world/weatherLook';
import { wireframeParams } from '../world/wireframe';
import type { DumpSource } from './DebugDump';
import type { BodyRef, GameState, Quat4, Vec3 } from './dumpFormat';
import { frames, overlayRects } from './page';

/**
 * Reads the game's state into a debug dump (`captureGameState`) and puts the
 * game back into it (`restoreGameState`, for `npm run shot -- --dump`). The
 * restore is best effort: the system, body, clocks, spins, ship and camera
 * come back exactly; a ship caught mid-flight is parked at where it was going,
 * and a dump taken mid-transition comes back at the incoming level, settled.
 */

const BODY_LISTS = ['stars', 'planets', 'moons', 'comets', 'asteroids'] as const;

function bodyList(world: StarSystem, kind: BodyRef['kind']): readonly CelestialBody[] {
  switch (kind) {
    case 'star':
      return world.stars;
    case 'planet':
      return world.planets;
    case 'moon':
      return world.moons;
    case 'comet':
      return world.nuclei;
    case 'asteroid':
      return world.asteroids;
  }
}

const KINDS: Record<(typeof BODY_LISTS)[number], BodyRef['kind']> = {
  stars: 'star',
  planets: 'planet',
  moons: 'moon',
  comets: 'comet',
  asteroids: 'asteroid',
};

/** Where `body` is in the system's lists, or null (e.g. a body of another system). */
export function bodyRef(world: StarSystem, body: CelestialBody | null): BodyRef | null {
  if (!body) return null;
  for (const list of BODY_LISTS) {
    const kind = KINDS[list];
    const index = bodyList(world, kind).indexOf(body);
    if (index >= 0) return { kind, index, name: body.name };
  }
  return null;
}

/** The body `ref` names: by its list and index if the name matches there, else by name. */
export function resolveBody(world: StarSystem, ref: BodyRef): CelestialBody | null {
  const byIndex = bodyList(world, ref.kind)[ref.index];
  if (byIndex?.name === ref.name) return byIndex;
  return world.bodies.find((b) => b.name === ref.name) ?? null;
}

/** The bodies whose spin accumulates (see `GameState.system.spins`), in the dump's order. */
function spinning(world: StarSystem): Planet[] {
  return [...world.planets, ...world.moons, ...world.nuclei, ...world.asteroids];
}

const vec = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];
const quat = (q: THREE.Quaternion): Quat4 => [q.x, q.y, q.z, q.w];

function activeOrbit(levels: SceneManager): OrbitCamera {
  if (levels.mode === 'planet' && levels.planetLevel) return levels.planetLevel.orbit;
  return levels.mode === 'galaxy' ? levels.galaxyLevel.orbit : levels.systemLevel.orbit;
}

function text(id: string): string | null {
  const el = document.getElementById(id);
  return el && !el.hidden && el.offsetParent !== null ? (el.textContent ?? '').trim() : null;
}

/** Overlays worth knowing the place of (HUD, tooltip, maps, buttons), when shown. */
const OVERLAYS = [
  'hud',
  'tooltip',
  'system-map',
  'planet-map',
  'touch-controls',
  'touch-stick',
  'touch-buttons',
  'fullscreen-toggle',
  'fullscreen-hint',
  'menu-toggle',
  'fps',
];

/** Everything a debug dump records about where the game is. */
export function captureGameState(game: Game, levels: SceneManager): GameState {
  const params = new URL(location.href).searchParams;
  const system = levels.systemLevel;
  const { world, ship } = system;
  const camera = game.camera;
  const orbit = activeOrbit(levels);
  const planet = levels.mode === 'planet' ? levels.planetLevel : null;
  const galaxy = levels.galaxyLevel;
  const aim = system.aim;
  const hud: Record<string, string> = {};
  for (const id of ['hud-location', 'hud-climate', 'hud-speed', 'hud-target', 'hud-help']) {
    const t = text(id);
    if (t) hud[id] = t;
  }
  const tooltip = text('tooltip');
  return {
    seed: params.get('seed'),
    star: system.data.id,
    mode: levels.mode,
    transitioning: levels.transitioning,
    crossfade: levels.crossfade,
    camera: {
      position: vec(camera.position),
      quaternion: quat(camera.quaternion),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      aspect: camera.aspect,
    },
    orbit: { distance: orbit.zoom, direction: vec(orbit.direction(new THREE.Vector3())), lookUp: orbit.lookUpAngle },
    system: {
      id: system.data.id,
      name: system.data.name,
      starless: system.starless,
      time: world.time,
      ship: {
        position: vec(ship.object.position),
        speed: ship.speed,
        enRoute: ship.enRoute,
        target: bodyRef(world, ship.targetBody),
        viewDistance: ship.viewDistance,
      },
      aim: { body: bodyRef(world, aim.body), weight: aim.weight },
      spins: spinning(world).map((p) => p.spinAngle),
    },
    planet: planet
      ? {
          body: bodyRef(world, planet.body) ?? { kind: 'planet', index: -1, name: planet.body.name },
          lab: bodyLabLink(planet.body),
          time: planet.frame.time,
          spinAngle: planet.frame.spinAngle,
          radius: planet.radius,
          ship: {
            direction: vec(planet.ship.direction),
            radius: planet.ship.radius,
            goalRadius: planet.ship.goalRadius,
            clearance: planet.ship.clearance,
            enRoute: planet.ship.enRoute,
          },
        }
      : null,
    galaxy:
      levels.mode === 'galaxy'
        ? { spin: galaxy.spin.angle, current: galaxy.ship.current.id, destination: galaxy.ship.destination?.id ?? null }
        : null,
    graphics: { weather: weatherParams.enabled, plants: plantParams.enabled, wireframe: wireframeParams.enabled },
    busted: {
      bodies: spinning(world).flatMap((b) =>
        b.blastedAt === null ? [] : [{ body: bodyRef(world, b) ?? { kind: 'planet' as const, index: -1, name: b.name }, time: b.blastedAt }],
      ),
      total: levels.busted.count,
      firing: !!planet?.busy,
      elapsed: planet?.buster.elapsed ?? null,
    },
    volcanoes: spinning(world).flatMap((b) =>
      b.volcanoSites.length === 0 ? [] : [{ body: bodyRef(world, b) ?? { kind: 'planet' as const, index: -1, name: b.name }, sites: b.volcanoSites }],
    ),
    cargo: {
      inventory: levels.inventory.toJSON(),
      surface: planet ? levels.surfaceChanges.forPlanet(bodyKey(planet.body.config)).toJSON() : null,
      selected: planet?.cargo?.selected ?? null,
      inFlight: planet?.cargo?.inFlight ?? [],
    },
    ui: {
      touchMode: game.input.touchMode,
      hud,
      tooltip,
      systemMap: levels.mode === 'system' && system.map.visible,
      planetMap: !!planet?.map.visible,
      overlays: overlayRects(OVERLAYS),
    },
  };
}

async function settle(levels: SceneManager): Promise<void> {
  for (let i = 0; i < 6000 && levels.transitioning; i++) await frames(1);
  if (levels.transitioning) throw new Error('A level transition never finished');
  await frames(3);
}

function setOrbit(orbit: OrbitCamera, state: GameState['orbit']): void {
  orbit.setDistance(state.distance);
  orbit.lookFrom(new THREE.Vector3(...state.direction));
  orbit.setLookUp(state.lookUp);
}

/** System clock and every body's spin as dumped (spins accumulate frame by frame, so the clock alone misses them). */
function setSystemClock(system: SystemLevel, state: GameState['system'], time: number): void {
  const { world } = system;
  world.setTime(time);
  const bodies = spinning(world);
  state.spins.forEach((spin, i) => {
    const body = bodies[i];
    if (body) body.spinAngle = spin;
  });
}

/**
 * Puts the game back where `state` was (the page must have been loaded with
 * its `?seed` and `?star`) and leaves it paused there (`game.paused = false`
 * lets it run on), so the view is exactly the dumped moment. Resolves once
 * it's drawn; returns notes on what couldn't be matched exactly.
 */
export async function restoreGameState(game: Game, levels: SceneManager, state: GameState): Promise<string[]> {
  const notes: string[] = [];
  game.paused = false;
  await settle(levels);
  if (levels.mode !== 'system') {
    levels.toSystem();
    await settle(levels);
  }
  const system = levels.systemLevel;
  if (system.data.id !== state.system.id) {
    throw new Error(`This page is at system ${system.data.id}; load it with ?star=${state.system.id}${state.seed ? `&seed=${state.seed}` : ''}`);
  }
  weatherParams.enabled = state.graphics.weather;
  plantParams.enabled = state.graphics.plants;
  wireframeParams.enabled = state.graphics.wireframe;
  if (state.transitioning) notes.push(`taken mid-transition (crossfade ${state.crossfade ?? 'none'}): restored at the ${state.mode} level, settled`);

  const { world, ship } = system;
  // Busted bodies first: low orbit over one is built as a debris field.
  for (const { body: ref, time } of state.busted?.bodies ?? []) {
    const body = resolveBody(world, ref) as Planet | null;
    if (!body) {
      notes.push(`no body ${ref.name} to bust`);
      continue;
    }
    body.bust(time);
    levels.busted.bust(bodyKey(body.config), time);
  }
  // Volcanoes before low orbit is built: it raises those in the body's change list.
  for (const { body: ref, sites } of state.volcanoes ?? []) {
    const body = resolveBody(world, ref) as Planet | null;
    if (!body) {
      notes.push(`no body ${ref.name} to raise volcanoes on`);
      continue;
    }
    const changes = levels.surfaceChanges.forPlanet(bodyKey(body.config));
    for (const site of sites) {
      if (changes.volcanoes.some((v) => v.seed === site.seed)) continue;
      changes.addVolcano(site);
      body.addVolcano(site, null);
    }
  }
  if (state.cargo) {
    levels.inventory.load(state.cargo.inventory);
    if (state.cargo.inFlight.length > 0) notes.push(`${state.cargo.inFlight.length} plant(s) were on the beam or meeting their fate: left out`);
  }
  if (state.busted?.firing) notes.push(`a planet buster was going off (${state.busted.elapsed?.toFixed(1)} s after firing): restored as busted`);
  const shipState = state.system.ship;
  const target = shipState.target ? resolveBody(world, shipState.target) : null;
  if (shipState.target && !target) notes.push(`no body ${shipState.target.name} in this system`);
  if (shipState.enRoute) notes.push(`the ship was flying to ${shipState.target?.name}: parked there instead`);
  /** Clocks, spins and the ship as dumped, with time stopped so nothing moves on. */
  const placeInSystem = (time: number) => {
    game.paused = true;
    setSystemClock(system, state.system, time);
    if (target) ship.parkAt(target, shipState.viewDistance);
  };

  if (state.mode === 'planet' && state.planet) {
    const body = resolveBody(world, state.planet.body) as Planet | null;
    if (!body) throw new Error(`No body ${state.planet.body.name} to descend to`);
    setSystemClock(system, state.system, state.system.time);
    // The plants taken and set down there, before the level is built from them.
    if (state.cargo?.surface) levels.surfaceChanges.set(bodyKey(body.config), SurfaceChanges.fromJSON(state.cargo.surface));
    ship.parkAt(body, shipState.viewDistance);
    await frames(2);
    levels.toPlanet(body);
    await settle(levels);
    const planet = levels.planetLevel;
    if (!planet) throw new Error(`Couldn't descend to ${body.name}`);
    // The level's clock and spin start from the body's: set them to the dumped moment first.
    placeInSystem(state.planet.time);
    body.spinAngle = state.planet.spinAngle;
    planet.frame.restart(state.planet.time);
    planet.orbit.setDistance(state.orbit.distance);
    // A frame for the zoom to set the flying height, then the ship goes where it was and the camera behind it.
    await frames(1);
    planet.ship.placeAt(new THREE.Vector3(...state.planet.ship.direction));
    if (state.planet.ship.enRoute) notes.push('the ship was on the autopilot over the planet: stopped where it was');
    setOrbit(planet.orbit, state.orbit);
  } else if (state.mode === 'galaxy' && state.galaxy) {
    placeInSystem(state.system.time);
    game.paused = false;
    levels.toGalaxy();
    await settle(levels);
    game.paused = true;
    const galaxy = levels.galaxyLevel;
    galaxy.root.rotation.y = state.galaxy.spin;
    galaxy.root.updateMatrixWorld();
    if (state.galaxy.destination !== null) notes.push(`the ship was travelling to star ${state.galaxy.destination}: left docked`);
    setOrbit(galaxy.orbit, state.orbit);
  } else {
    placeInSystem(state.system.time);
    const aim = state.system.aim.body ? resolveBody(world, state.system.aim.body) : null;
    if (aim) system.aimAt(aim, state.system.aim.weight);
    else system.clearAim();
    setOrbit(system.orbit, state.orbit);
  }
  // Paused frames still update and draw: the views catch up (the globe's detail, plants) without time moving.
  await frames(4);
  const planet = levels.mode === 'planet' ? levels.planetLevel : null;
  if (planet) {
    // Chunks blend in over time, which stands still: let them pop in instead.
    const morph = lodParams.morphSeconds;
    lodParams.morphSeconds = 0;
    for (let i = 0; i < 600 && !planet.globeSettled; i++) await frames(1);
    lodParams.morphSeconds = morph;
    if (!planet.globeSettled) notes.push("the globe's detail hadn't finished building");
  }
  // The HUD and maps refresh on timers that stand still while paused: re-entering the level redraws them now.
  game.level?.exit();
  game.level?.enter();
  await frames(2);
  const map = planet ? planet.map : levels.mode === 'system' ? system.map : null;
  const mapShown = planet ? state.ui.planetMap : state.ui.systemMap;
  if (map && map.visible !== mapShown) {
    // On touch the Map button opens it; with a mouse it's folded with N.
    if (game.input.touchMode) document.getElementById('touch-map')?.click();
    else notes.push(`the map was ${mapShown ? 'shown' : 'folded'}: press N to match`);
  }
  await frames(4);
  return notes;
}

/** The game as the debug dump's source: its levels' state, captured and restored. */
export function gameDumpSource(game: Game, levels: SceneManager): DumpSource {
  return { app: 'game', capture: () => captureGameState(game, levels), restore: (state) => restoreGameState(game, levels, state) };
}
