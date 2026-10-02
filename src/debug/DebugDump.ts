import * as THREE from 'three';
import type { Debug } from '../core/Debug';
import type { Entity } from '../core/Entity';
import type { Game } from '../core/Game';
import type { SceneManager } from '../levels/SceneManager';
import { DebugDumpDialog, type DumpChoice } from '../ui/DebugDumpDialog';
import { buildInfo } from '../ui/buildInfo';
import { drawAnnotated } from './annotate';
import type { LogRing } from './consoleLog';
import { DUMP_FORMAT, DUMP_VERSION, dumpFileName, summaryLines, type DebugDump, type DeviceInfo, type GameState, type RendererInfo } from './dumpFormat';
import { FrameTimes } from './frameTimes';
import { captureGameState, restoreGameState } from './gameState';

/** Overlays left out of the screen picture: the dialogs over it, the debug panel (its values are in `tunables`). */
const NOT_IN_PICTURE = new Set(['app', 'menu', 'dump', 'loading', 'stats']);
const KEY = 'F8';

/** What `capture` took, before the player marks it up. */
interface Capture {
  createdAt: Date;
  url: string;
  state: GameState | null;
  stateError?: string;
  game: HTMLCanvasElement | null;
  screen: HTMLCanvasElement | null;
  screenError?: string;
  /** The pictures encoded up front, so sharing starts right on the tap (browsers allow it only then). */
  gameUrl: string | null;
  screenUrl: string | null;
  renderer: RendererInfo | null;
  device: DeviceInfo;
}

/**
 * The debug dump (menu → "Save debug dump", or F8): freezes the game,
 * captures the frame (the game's own picture and the screen with its HUD and
 * maps), lets the player mark the problem and write a note (DebugDumpDialog),
 * then saves or shares one JSON file with the pictures, a marked-up copy
 * with a summary strip, the game state to reproduce it (gameState.ts), the
 * device and renderer, frame times and the console's errors (see
 * dumpFormat.ts). A global entity: it times every frame for the dump.
 */
export class DebugDumpControl implements Entity {
  private readonly dialog = new DebugDumpDialog();
  private readonly frames = new FrameTimes();
  private readonly button = document.getElementById('menu-dump') as HTMLButtonElement | null;
  private busy = false;

  constructor(
    private readonly game: Game,
    private readonly levels: SceneManager,
    private readonly log: LogRing,
    private readonly debug: Debug,
  ) {
    this.button?.addEventListener('click', this.onButton);
    window.addEventListener('keydown', this.onKey);
  }

  update(): void {
    this.frames.frame(performance.now());
  }

  /** Captures the frame and asks the player what's wrong; resolves when the file is saved or shared, or cancelled. */
  async open(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const wasPaused = this.game.paused;
    this.game.paused = true;
    try {
      const capture = await this.capture();
      const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] });
      let choice = await this.dialog.ask(capture.screenUrl ?? capture.gameUrl ?? '', canShare);
      while (choice.action !== 'cancel') {
        this.dialog.status('Making the file…');
        const json = JSON.stringify(this.build(capture, choice));
        const name = dumpFileName(capture.createdAt);
        try {
          await deliver(json, name, choice);
          this.dialog.hide();
          break;
        } catch (err) {
          // Sharing dismissed or refused: stay open to try again, or save instead.
          if (err instanceof DOMException && err.name === 'AbortError') this.dialog.status('');
          else this.dialog.status(`Couldn't ${choice.action}: ${err instanceof Error ? err.message : String(err)}`);
          this.dialog.setBusy(false);
          choice = await this.dialog.next();
        }
      }
    } finally {
      this.game.paused = wasPaused;
      this.busy = false;
    }
  }

  /** The dump's data with no player input (automation: `debugDump.data()`), images left out. */
  data(): Omit<DebugDump, 'images'> {
    const capture = this.captureData();
    const { images: _, ...rest } = this.build(capture, { action: 'save', note: '', marks: [] }, false);
    return rest;
  }

  /** Puts the game back into a dump's state (see gameState.ts). */
  restore(state: GameState): Promise<string[]> {
    return restoreGameState(this.game, this.levels, state);
  }

  dispose(): void {
    this.dialog.dispose();
    this.button?.removeEventListener('click', this.onButton);
    window.removeEventListener('keydown', this.onKey);
  }

  private captureData(): Capture {
    let state: GameState | null = null;
    let stateError: string | undefined;
    try {
      state = captureGameState(this.game, this.levels);
    } catch (err) {
      stateError = err instanceof Error ? err.message : String(err);
    }
    return {
      createdAt: new Date(),
      url: location.href,
      state,
      stateError,
      game: null,
      screen: null,
      gameUrl: null,
      screenUrl: null,
      renderer: this.rendererInfo(),
      device: deviceInfo(this.game.input.touchMode),
    };
  }

  /** The state and pictures of this moment: the game's frame redrawn and copied at once (its buffer isn't kept), then the screen. */
  private async capture(): Promise<Capture> {
    const capture = this.captureData();
    const canvas = this.game.renderer.domElement;
    this.game.redraw();
    const game = document.createElement('canvas');
    game.width = canvas.width;
    game.height = canvas.height;
    game.getContext('2d')!.drawImage(canvas, 0, 0);
    capture.game = game;
    try {
      capture.screen = await screenPicture(game, canvas);
    } catch (err) {
      capture.screenError = err instanceof Error ? err.message : String(err);
    }
    capture.gameUrl = game.toDataURL('image/png');
    capture.screenUrl = capture.screen?.toDataURL('image/jpeg', 0.92) ?? null;
    return capture;
  }

  private build(capture: Capture, choice: DumpChoice, images = true): DebugDump {
    const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
    const dump: DebugDump = {
      format: DUMP_FORMAT,
      version: DUMP_VERSION,
      createdAt: capture.createdAt.toISOString(),
      url: capture.url,
      note: choice.note,
      marks: choice.marks,
      build: { ...buildInfo },
      device: capture.device,
      renderer: capture.renderer,
      performance: {
        uptime: Math.round(performance.now()) / 1000,
        frames: this.frames.stats(),
        frameTimesMs: this.frames.durations().map((d) => Math.round(d * 10) / 10),
        jsHeapMb: memory ? Math.round(memory.usedJSHeapSize / 1e5) / 10 : null,
      },
      state: capture.state,
      ...(capture.stateError ? { stateError: capture.stateError } : {}),
      log: { entries: this.log.entries(), dropped: this.log.dropped },
      tunables: this.debug.panel?.save() ?? null,
      images: { game: null, screen: null, annotated: null },
    };
    if (!images) return dump;
    const picture = capture.screen ?? capture.game;
    dump.images = {
      game: capture.gameUrl,
      screen: capture.screenUrl,
      annotated: picture ? drawAnnotated(picture, picture.width, picture.height, choice.marks, summaryLines(dump)).toDataURL('image/jpeg', 0.88) : null,
      ...(capture.screenError ? { screenError: capture.screenError } : {}),
    };
    return dump;
  }

  private rendererInfo(): RendererInfo | null {
    try {
      const renderer = this.game.renderer;
      const gl = renderer.getContext();
      let gpu = gl.getParameter(gl.RENDERER) as string | null;
      let vendor = gl.getParameter(gl.VENDOR) as string | null;
      // Chrome and Safari report "WebKit WebGL" there; the real names are behind this extension.
      if (!gpu || /webkit/i.test(gpu)) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
          vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string;
        }
      }
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const { info, capabilities } = renderer;
      return {
        gpu,
        vendor,
        webgl: gl.getParameter(gl.VERSION) as string,
        pixelRatio: renderer.getPixelRatio(),
        drawingBuffer: [size.x, size.y],
        maxTextureSize: capabilities.maxTextureSize,
        precision: capabilities.precision,
        render: { calls: info.render.calls, triangles: info.render.triangles, points: info.render.points, lines: info.render.lines },
        memory: { geometries: info.memory.geometries, textures: info.memory.textures },
        programs: info.programs?.length ?? 0,
        quality: new URL(location.href).searchParams.get('quality') === 'low' ? 'low' : 'full',
        contextLost: gl.isContextLost(),
      };
    } catch {
      return null;
    }
  }

  private onButton = () => void this.open();

  private onKey = (e: KeyboardEvent) => {
    if (e.code !== KEY || e.repeat) return;
    e.preventDefault();
    void this.open();
  };
}

/**
 * The screen as seen: the game's picture with the page's overlays (HUD,
 * tooltip, maps, buttons) drawn over it by html-to-image (SVG
 * foreignObject; loaded only when a dump is taken), at the game canvas's
 * resolution.
 */
async function screenPicture(game: HTMLCanvasElement, canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import('html-to-image');
  const width = window.innerWidth;
  const height = window.innerHeight;
  // At least the screen's own resolution, so the HUD's text reads even when the game draws at half (?quality=low).
  const ratio = Math.max(canvas.width / Math.max(1, canvas.clientWidth), Math.min(window.devicePixelRatio, 2));
  const overlay = await toCanvas(document.body, {
    width,
    height,
    pixelRatio: ratio,
    style: { background: 'transparent' },
    skipFonts: true,
    filter: (node) => !(node instanceof HTMLElement) || (!NOT_IN_PICTURE.has(node.id) && !node.classList.contains('lil-gui')),
  });
  const out = document.createElement('canvas');
  out.width = Math.round(width * ratio);
  out.height = Math.round(height * ratio);
  const ctx = out.getContext('2d')!;
  ctx.drawImage(game, 0, 0, out.width, out.height);
  ctx.drawImage(overlay, 0, 0, out.width, out.height);
  return out;
}

function deviceInfo(touch: boolean): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number; standalone?: boolean };
  const vv = window.visualViewport;
  const media = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    language: nav.language,
    devicePixelRatio: window.devicePixelRatio,
    viewport: [window.innerWidth, window.innerHeight],
    visualViewport: vv ? [Math.round(vv.width), Math.round(vv.height), vv.scale] : null,
    screen: [screen.width, screen.height],
    orientation: screen.orientation?.type ?? null,
    touch,
    coarsePointer: media('(pointer: coarse)'),
    standalone: media('(display-mode: standalone)') || nav.standalone === true,
    fullscreen: !!document.fullscreenElement,
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    deviceMemory: nav.deviceMemory ?? null,
  };
}

/** Shares the file (phones: to a chat, mail or Files) or downloads it. */
async function deliver(json: string, name: string, choice: DumpChoice): Promise<void> {
  const blob = new Blob([json], { type: 'application/json' });
  if (choice.action === 'share') {
    const file = new File([blob], name, { type: 'application/json' });
    await navigator.share({ files: [file], title: name, ...(choice.note.trim() ? { text: choice.note.trim() } : {}) });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
