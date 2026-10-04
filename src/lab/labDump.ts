import { Vector3 } from 'three';
import type { Game } from '../core/Game';
import type { DumpSource } from '../debug/DebugDump';
import type { LabDumpState, Vec3 } from '../debug/dumpFormat';
import { frames, overlayRects } from '../debug/page';
import { lodParams } from '../planet/LodSurface';
import { decodeLab, describeLab, encodeLab } from './labPlanet';
import type { PlanetLab } from './PlanetLab';

/** The lab's overlays worth knowing the place of: the readout, the panel, the map and the phone's controls. */
const OVERLAYS = ['lab-info', '.lil-gui.lil-auto-place', 'planet-map', 'touch-controls', 'touch-stick', 'touch-buttons', 'fps'];

const vec = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/**
 * The planet lab as the debug dump's source (its Report button, F8): the
 * planet and view (the lab's own link), the camera, the UFO and the clock;
 * restored by `npm run shot -- --dump` (see the debug-dump skill).
 */
export function planetLabDumpSource(game: Game, lab: PlanetLab): DumpSource {
  return { app: 'planet-lab', capture: () => capture(game, lab), restore: (state) => restore(game, lab, state) };
}

function capture(game: Game, lab: PlanetLab): LabDumpState {
  const { view, planet } = lab;
  const carry = lab.level?.carry() ?? null;
  const where = view.view === 'globe' ? `low orbit, ${view.camera === 'fly' ? 'following the UFO' : 'orbit camera'}` : 'system view';
  return {
    page: 'planet-lab',
    hash: encodeLab(lab.state),
    link: lab.link,
    title: `${planet.name}: ${describeLab(planet)} · ${where}`,
    camera: { direction: carry ? vec(carry.direction) : [0, 0, 1], zoom: carry?.zoom ?? 0, position: vec(game.camera.position), fov: game.camera.fov },
    ship: carry?.ship ? vec(carry.ship) : null,
    time: lab.clock.renderTime,
    ready: lab.ready,
    ui: { touchMode: game.input.touchMode, overlays: overlayRects(OVERLAYS) },
  };
}

/**
 * Puts the lab back where `state` was: the planet and view (unless the page
 * already shows them), then the clock, the UFO and the camera, and leaves the
 * game paused there (`game.paused = false` runs it on). Returns notes on what
 * couldn't be matched.
 */
async function restore(game: Game, lab: PlanetLab, state: LabDumpState): Promise<string[]> {
  const notes: string[] = [];
  const wanted = decodeLab(state.hash);
  if (!wanted) throw new Error("The dump's planet link doesn't decode");
  game.paused = false;
  if (encodeLab(lab.state) !== state.hash) {
    Object.assign(lab.view, wanted.view);
    lab.applyLive();
    await lab.replace(wanted.planet, wanted.source ?? null);
    game.debug.panel?.controllersRecursive().forEach((c) => c.updateDisplay());
  }
  await lab.whenReady();
  // Paused frames still update and draw: the view catches up without time moving.
  game.paused = true;
  const level = lab.level;
  if (!level) throw new Error('The lab has no planet built');
  if (state.time !== null) lab.setTime(state.time);
  if (state.ship) {
    if (level.ship) level.ship.placeAt(new Vector3(...state.ship));
    else notes.push('the dump had the UFO, this view has none');
  }
  level.orbit.lookFrom(new Vector3(...state.camera.direction));
  level.orbit.setDistance(state.camera.zoom * level.radius);
  // Chunks blend in over time, which stands still: let them pop in instead.
  const morph = lodParams.morphSeconds;
  lodParams.morphSeconds = 0;
  await frames(2);
  for (let i = 0; i < 600 && !(level.globe?.settled ?? true); i++) await frames(1);
  lodParams.morphSeconds = morph;
  if (!(level.globe?.settled ?? true)) notes.push("the globe's detail hadn't finished building");
  if (!state.ready) notes.push('taken mid-rebuild: the dump may show the planet from before the last edit');
  await frames(3);
  return notes;
}
