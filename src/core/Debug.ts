import type GUI from 'lil-gui';
import type Stats from 'stats.js';

/**
 * Dev tooling: lil-gui tweak panel + stats.js FPS meter. Enabled in dev builds
 * or with `?debug` in the URL; otherwise every method is a no-op and the
 * libraries are never loaded (they are dynamically imported).
 *
 * Usage: `const f = debug.folder('Ship'); f?.add(params, 'thrust', 0, 200);`
 */
export class Debug {
  private readonly folders = new Map<string, GUI>();

  private constructor(
    private readonly gui?: GUI,
    private readonly stats?: Stats,
  ) {}

  static async create(): Promise<Debug> {
    const enabled = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
    if (!enabled) return new Debug();

    const [{ default: GUIClass }, { default: StatsClass }] = await Promise.all([
      import('lil-gui'),
      import('stats.js'),
    ]);
    const gui = new GUIClass({ title: 'Debug' });
    // Leave the bottom-right corner free for the sound button (#audio).
    gui.domElement.style.maxHeight = 'calc(100% - 72px)';
    // On a phone the open panel would cover the whole screen (and swallow every touch).
    if (matchMedia('(max-width: 600px)').matches) gui.close();
    const stats = new StatsClass();
    stats.dom.id = 'stats';
    stats.dom.style.cssText = 'position:fixed;top:0;left:0;z-index:100;';
    document.body.appendChild(stats.dom);
    return new Debug(gui, stats);
  }

  get enabled(): boolean {
    return this.gui !== undefined;
  }

  /**
   * A GUI folder, or undefined when debug is off. Asking for an existing name
   * replaces that folder, so an object that is rebuilt (e.g. the ship when a
   * new system loads) doesn't leave controls bound to its disposed predecessor.
   */
  folder(name: string): GUI | undefined {
    if (!this.gui) return undefined;
    this.folders.get(name)?.destroy();
    const folder = this.gui.addFolder(name);
    this.folders.set(name, folder);
    return folder;
  }

  beginFrame(): void {
    this.stats?.begin();
  }

  endFrame(): void {
    this.stats?.end();
  }

  dispose(): void {
    this.gui?.destroy();
    this.stats?.dom.remove();
  }
}
