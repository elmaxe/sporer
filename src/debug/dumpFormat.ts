import type { VolcanoSite } from '../combat/volcano';
import type { InventoryData } from '../cargo/inventory';
import type { SurfaceChangesData } from '../surface/changes';
import type { LogEntry } from './consoleLog';
import type { FrameStats } from './frameTimes';

/**
 * The debug dump file (the menu's "Save debug dump", F8): one JSON file with
 * what the player saw, what they marked and wrote about it, and the state
 * needed to reproduce it. `scripts/dump.mjs` (npm run dump) unpacks it and
 * `npm run shot -- --dump <file>` restores it (see the `debug-dump` skill).
 * Pure types and helpers: no DOM or THREE.
 */
export const DUMP_FORMAT = 'sporer-debug-dump';
export const DUMP_VERSION = 1;

export type Vec3 = [number, number, number];
export type Quat4 = [number, number, number, number];

/** A spot the player marked on the screenshot: 0–1 across and down the picture. */
export interface DumpMark {
  x: number;
  y: number;
}

/** Which body of the system (its list in `StarSystem` and the index in it), with its name to check against. */
export interface BodyRef {
  kind: 'star' | 'planet' | 'moon' | 'comet' | 'asteroid';
  index: number;
  name: string;
}

/** The game's state when the dump was taken: enough to put the game back there (see gameState.ts). */
export interface GameState {
  /** Galaxy seed and system id as in the URL (`?seed`, `?star`). */
  seed: string | null;
  star: number;
  mode: 'system' | 'galaxy' | 'planet';
  /** A level transition was under way: the state is the incoming level's, mid-zoom. */
  transitioning: boolean;
  /** The incoming level's weight while two levels were crossfaded, else null. */
  crossfade: number | null;
  /** The shared camera, in the active level's units. */
  camera: { position: Vec3; quaternion: Quat4; fov: number; near: number; far: number; aspect: number };
  /** The active level's orbit camera: distance from its centre, world direction from it to the camera, look-up tip. */
  orbit: { distance: number; direction: Vec3; lookUp: number };
  system: {
    id: number;
    name: string;
    starless: boolean;
    /** System clock (frozen at the moment of descent while in low orbit). */
    time: number;
    ship: { position: Vec3; speed: number; enRoute: boolean; target: BodyRef | null; viewDistance: number };
    /** The star the camera turns to while the ship hovers above it. */
    aim: { body: BodyRef | null; weight: number };
    /** Spin angles of planets, moons, comet nuclei and asteroids, in that order (they accumulate, so aren't a function of the clock). */
    spins: number[];
  };
  /** Low orbit, when there. */
  planet: {
    body: BodyRef;
    /** The planet lab link for the body. */
    lab: string;
    time: number;
    spinAngle: number;
    radius: number;
    ship: { direction: Vec3; radius: number; goalRadius: number; clearance: number | null; enRoute: boolean };
  } | null;
  /** The galaxy map, when there. */
  galaxy: { spin: number; current: number; destination: number | null } | null;
  graphics: { weather: boolean; plants: boolean; wireframe: boolean };
  /**
   * Bodies blown apart by the planet buster (missing in dumps from before it): this system's, each with its
   * blast's system time, and how many there are in the whole game. Also whether one was going off.
   */
  busted?: { bodies: { body: BodyRef; time: number }[]; total: number; firing: boolean; elapsed: number | null };
  /** Volcanoes raised by volcano bombs on this system's bodies (missing in dumps from before them), oldest first. */
  volcanoes?: { body: BodyRef; sites: VolcanoSite[] }[];
  /**
   * The cargo hold and, in low orbit, what the player has done to the body's surface (plants taken, plants
   * set down), what the beam is armed with and what's in the air (missing in dumps from before the beam).
   */
  cargo?: {
    inventory: InventoryData;
    surface: SurfaceChangesData | null;
    selected: string | null;
    inFlight: { state: string; fate: string | null; species: string }[];
  };
  /** What the DOM overlays showed (text the screenshot's game picture leaves out). */
  ui: {
    touchMode: boolean;
    hud: Record<string, string>;
    tooltip: string | null;
    systemMap: boolean;
    planetMap: boolean;
    /** Visible overlay elements and where they are (CSS px): to spot layout problems. */
    overlays: { id: string; rect: [number, number, number, number] }[];
  };
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  devicePixelRatio: number;
  /** CSS px. */
  viewport: [number, number];
  visualViewport: [number, number, number] | null;
  screen: [number, number];
  orientation: string | null;
  touch: boolean;
  coarsePointer: boolean;
  standalone: boolean;
  fullscreen: boolean;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
}

export interface RendererInfo {
  gpu: string | null;
  vendor: string | null;
  webgl: string;
  pixelRatio: number;
  /** Drawing buffer in device px. */
  drawingBuffer: [number, number];
  maxTextureSize: number;
  precision: string;
  /** Draw calls and primitives of the last frame drawn, every pass. */
  render: { calls: number; triangles: number; points: number; lines: number };
  memory: { geometries: number; textures: number };
  programs: number;
  quality: 'low' | 'full';
  contextLost: boolean;
}

export interface DebugDump {
  format: typeof DUMP_FORMAT;
  version: number;
  /** ISO time. */
  createdAt: string;
  url: string;
  /** What the player wrote. */
  note: string;
  marks: DumpMark[];
  build: { branch: string | null; build: string | null; commit: string | null; dev: boolean };
  device: DeviceInfo;
  renderer: RendererInfo | null;
  performance: { uptime: number; frames: FrameStats | null; frameTimesMs: number[]; jsHeapMb: number | null };
  state: GameState | null;
  /** Why the state couldn't be read, if it couldn't. */
  stateError?: string;
  log: { entries: LogEntry[]; dropped: number };
  /** lil-gui's values (`gui.save()`) when the debug panel is on. */
  tunables: unknown;
  /** Data URLs: the game's own picture (PNG), the screen as seen with its overlays (JPEG) and the marked-up summary (JPEG). */
  images: { game: string | null; screen: string | null; annotated: string | null; screenError?: string };
}

/** A file name for a dump taken at `date`: sporer-dump-2026-10-02-1432-15.json (local time, sorts by time). */
export function dumpFileName(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `sporer-dump-${day}-${p(date.getHours())}${p(date.getMinutes())}-${p(date.getSeconds())}.json`;
}

/** A mark clamped into the picture, rounded to 4 decimals. */
export function clampMark(x: number, y: number): DumpMark {
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1e4) / 1e4;
  return { x: c(x), y: c(y) };
}

/**
 * The index of the mark nearest (x, y) within `radius` picture widths, or -1.
 * `heightPerWidth` is the picture's height / width (marks are 0–1 both ways).
 */
export function markNear(marks: readonly DumpMark[], x: number, y: number, radius: number, heightPerWidth: number): number {
  let best = -1;
  let bestD = radius;
  marks.forEach((m, i) => {
    // Measure in widths, so the circle is round on a tall phone picture.
    const d = Math.hypot(m.x - x, (m.y - y) * heightPerWidth);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

function where(state: GameState): string {
  if (state.mode === 'galaxy') return 'galaxy map';
  if (state.mode === 'planet' && state.planet) {
    const s = state.planet.ship;
    const clear = s.clearance === null ? '' : `, ${s.clearance.toFixed(1)} above ground`;
    return `low orbit over ${state.planet.body.name} (radius ${s.radius.toFixed(1)}${clear})`;
  }
  const ship = state.system.ship;
  const target = ship.target?.name ?? '?';
  return `system ${state.system.name}: ${ship.enRoute ? `flying to ${target}` : `hovering at ${target}`}`;
}

/** The summary printed under the marked-up screenshot: what, where, which build and device, how fast. */
export function summaryLines(dump: Omit<DebugDump, 'images'>): string[] {
  const lines: string[] = [];
  if (dump.note.trim()) lines.push(...dump.note.trim().split('\n').map((l, i) => (i === 0 ? `Note: ${l}` : l)));
  if (dump.marks.length > 0) lines.push(`Marks: ${dump.marks.map((m, i) => `${i + 1} (${Math.round(m.x * 100)}%, ${Math.round(m.y * 100)}%)`).join(' · ')}`);
  const s = dump.state;
  if (s) {
    const time = s.mode === 'planet' && s.planet ? s.planet.time : s.system.time;
    const moving = s.transitioning ? ` · mid-transition${s.crossfade !== null ? ` (crossfade ${s.crossfade.toFixed(2)})` : ''}` : '';
    lines.push(`Where: ${where(s)} · seed ${s.seed ?? 'default'} · star ${s.star} · t=${time.toFixed(2)} s${moving}`);
    const g = s.graphics;
    lines.push(`Camera: distance ${s.orbit.distance.toFixed(1)} · fov ${s.camera.fov} · weather ${g.weather ? 'on' : 'off'} · plants ${g.plants ? 'on' : 'off'}${g.wireframe ? ' · wireframe' : ''}`);
    const c = s.cargo;
    if (c && (c.inventory.stacks.length > 0 || c.selected || c.inFlight.length > 0 || c.surface?.planted?.length || c.surface?.removed.length)) {
      const hold = c.inventory.stacks.map((st) => `${st.species.name} ×${st.count}`).join(', ') || 'empty';
      const here = c.surface ? ` · here: ${c.surface.removed.length} taken, ${c.surface.planted?.length ?? 0} set down` : '';
      const air = c.inFlight.length > 0 ? ` · in the air: ${c.inFlight.map((l) => `${l.species} (${l.fate ?? l.state})`).join(', ')}` : '';
      lines.push(`Cargo: ${hold}${c.selected ? ` · armed: ${c.selected}` : ''}${here}${air}`);
    }
  } else if (dump.stateError) {
    lines.push(`State unavailable: ${dump.stateError}`);
  }
  const b = dump.build;
  lines.push(`Build: ${b.branch ?? '?'} · ${b.build !== null ? `build ${b.build}` : b.dev ? 'dev' : 'local'} · ${b.commit ?? '?'} · ${dump.createdAt}`);
  const d = dump.device;
  const r = dump.renderer;
  lines.push(
    `Device: ${d.viewport[0]}×${d.viewport[1]} @${d.devicePixelRatio}x${d.touch ? ' · touch' : ''}${r ? ` · ${r.gpu ?? 'unknown GPU'} · ${r.quality} quality` : ''}`,
  );
  const f = dump.performance.frames;
  if (f) lines.push(`Frames: ${f.fps} FPS · median ${f.p50Ms} ms · 95% ${f.p95Ms} ms · worst ${f.maxMs} ms${r ? ` · ${r.render.calls} draws` : ''}`);
  const errors = dump.log.entries.filter((e) => e.level !== 'warn').length;
  const warnings = dump.log.entries.length - errors;
  if (dump.log.entries.length > 0) lines.push(`Console: ${errors} errors, ${warnings} warnings; last: ${dump.log.entries.at(-1)!.text.split('\n')[0]}`);
  return lines;
}
