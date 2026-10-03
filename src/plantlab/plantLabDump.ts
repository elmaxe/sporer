import { MathUtils, type Vector3 } from 'three';
import type { Game } from '../core/Game';
import type { DumpSource } from '../debug/DebugDump';
import type { LabDumpState, Vec3 } from '../debug/dumpFormat';
import { frames, overlayRects } from '../debug/page';
import { PLANT_KINDS } from '../gen/plants';
import { decodePlantLab, encodePlantLab } from './labPlants';
import type { PlantLab } from './PlantLab';

/** The lab's overlays worth knowing the place of: the readout and the panel. */
const OVERLAYS = ['lab-info', '.lil-gui.lil-auto-place', 'fps'];

const vec = (v: Vector3): Vec3 => [v.x, v.y, v.z];

/**
 * The plant lab as the debug dump's source (its Report button, F8): the
 * species, selection and view (the lab's own link) and the camera; restored
 * by `npm run shot -- --dump` (see the debug-dump skill).
 */
export function plantLabDumpSource(game: Game, lab: PlantLab): DumpSource {
  return { app: 'plant-lab', capture: () => capture(game, lab), restore: (state) => restore(game, lab, state) };
}

function capture(game: Game, lab: PlantLab): LabDumpState {
  const { state, species: s, view } = lab;
  const carry = lab.level?.carry() ?? null;
  const lod = view.view === 'specimen' ? `, level of detail ${view.lod}` : '';
  return {
    page: 'plant-lab',
    hash: encodePlantLab(state),
    link: lab.link,
    title: `${s.name}: ${PLANT_KINDS[s.kind].label}, ${s.form.architecture} · species ${state.selected + 1} of ${state.species.length} · ${view.view}${lod}`,
    camera: { direction: carry ? vec(carry.direction) : [0, 0, 1], zoom: carry?.zoom ?? 0, position: vec(game.camera.position), fov: game.camera.fov },
    ship: null,
    time: null,
    ready: lab.ready,
    ui: { touchMode: game.input.touchMode, overlays: overlayRects(OVERLAYS) },
  };
}

/**
 * Puts the lab back where `state` was: the species and view (unless the page
 * already shows them), then the camera, and leaves the game paused there.
 * Returns notes on what couldn't be matched.
 */
async function restore(game: Game, lab: PlantLab, state: LabDumpState): Promise<string[]> {
  const notes: string[] = [];
  const wanted = decodePlantLab(state.hash);
  if (!wanted) throw new Error("The dump's plant link doesn't decode");
  game.paused = false;
  if (encodePlantLab(lab.state) !== state.hash) {
    await lab.replace(wanted);
    game.debug.panel?.controllersRecursive().forEach((c) => c.updateDisplay());
  }
  await lab.whenReady();
  game.paused = true;
  const level = lab.level;
  if (!level) throw new Error('The lab has nothing built');
  const [x, y, z] = state.camera.direction;
  level.look(MathUtils.radToDeg(Math.atan2(x, z)), MathUtils.radToDeg(Math.asin(MathUtils.clamp(y, -1, 1))), state.camera.zoom);
  // The grove loads the cells the camera now sees.
  await frames(2);
  for (let i = 0; i < 600 && !(level.grove?.settled ?? true); i++) await frames(1);
  if (!(level.grove?.settled ?? true)) notes.push("the grove hadn't finished loading");
  if (!state.ready) notes.push('taken mid-rebuild: the dump may show the plants from before the last edit');
  await frames(3);
  return notes;
}
