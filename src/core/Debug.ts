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
    const stats = new StatsClass();
    stats.dom.style.cssText = 'position:fixed;top:0;left:0;z-index:100;';
    document.body.appendChild(stats.dom);
    return new Debug(gui, stats);
  }

  get enabled(): boolean {
    return this.gui !== undefined;
  }

  /** A (possibly nested) GUI folder, or undefined when debug is off. */
  folder(name: string): GUI | undefined {
    return this.gui?.addFolder(name);
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
