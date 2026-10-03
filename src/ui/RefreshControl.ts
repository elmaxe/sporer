import { registerServiceWorker } from '../pwa/serviceWorker';

/** How long Refresh waits for the server to say whether there's a new version, ms. */
const CHECK_MS = 8000;
/** How long Refresh waits for a new version to download before reloading anyway, ms. */
const DOWNLOAD_MS = 60000;
/** How long Refresh waits for the new version to take over, ms. */
const SWITCH_MS = 3000;
/** Opening the menu checks for a new version at most this often, ms. */
const CHECK_EVERY_MS = 60000;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Resolves once `worker` has finished installing (or failed to), or after `ms`. */
function installed(worker: ServiceWorker, ms: number): Promise<void> {
  return Promise.race([
    wait(ms),
    new Promise<void>((resolve) => {
      const check = () => {
        if (worker.state === 'installing') return;
        worker.removeEventListener('statechange', check);
        resolve();
      };
      worker.addEventListener('statechange', check);
      check();
    }),
  ]);
}

/**
 * The menu's Refresh section (#menu-refresh-section in index.html): a Refresh
 * button that reloads the game, the only way to in an installed app (it runs
 * full screen, without the browser's reload). It gets the newest version on
 * the way: it asks the server for one, waits for it to download and has it
 * take over from the copy saved on the device (pwa/sw.ts), then reloads.
 *
 * The line above it says whether the game is saved for offline play, and
 * when a new version has downloaded in the background (found when the game
 * starts or the menu opens) it says so, and a dot on the menu button shows
 * it's waiting.
 */
export class RefreshControl {
  private readonly status = document.getElementById('menu-refresh-status')!;
  private readonly button = document.getElementById('menu-refresh') as HTMLButtonElement;
  private readonly menuButton = document.getElementById('menu-toggle');
  private reg: ServiceWorkerRegistration | null = null;
  private busy = false;
  private lastCheck = 0;

  constructor() {
    this.button.addEventListener('click', this.onRefresh);
    window.addEventListener('online', this.show);
    window.addEventListener('offline', this.show);
    this.show();
    void registerServiceWorker().then((reg) => {
      if (!reg) return;
      this.reg = reg;
      this.lastCheck = performance.now();
      reg.addEventListener('updatefound', this.onUpdateFound);
      if (reg.installing) this.onUpdateFound();
      navigator.serviceWorker.addEventListener('controllerchange', this.show);
      this.show();
    });
  }

  /** Asks the server for a new version (the menu calls this when it opens). */
  check(): void {
    if (!this.reg || this.busy || !navigator.onLine || performance.now() - this.lastCheck < CHECK_EVERY_MS) return;
    this.lastCheck = performance.now();
    this.reg.update().catch(() => {});
  }

  dispose(): void {
    this.button.removeEventListener('click', this.onRefresh);
    window.removeEventListener('online', this.show);
    window.removeEventListener('offline', this.show);
    this.reg?.removeEventListener('updatefound', this.onUpdateFound);
    navigator.serviceWorker?.removeEventListener('controllerchange', this.show);
  }

  /** A new version (or, the first time, the game itself) is downloading. */
  private onUpdateFound = () => {
    const worker = this.reg?.installing;
    if (!worker) return;
    worker.addEventListener('statechange', this.show);
    this.show();
  };

  /** True when a new version has downloaded and waits to take over from the one playing. */
  private get updateReady(): boolean {
    return !!this.reg?.waiting && !!navigator.serviceWorker.controller;
  }

  private show = () => {
    if (this.busy) return;
    const reg = this.reg;
    const ready = this.updateReady;
    let text: string;
    if (!reg) text = 'Reloads the game.';
    else if (ready) text = 'A new version is ready: refresh to play it.';
    else if (reg.installing || reg.waiting) {
      text = navigator.serviceWorker.controller ? 'Downloading a new version…' : 'Saving the game on this device so it starts without internet…';
    } else if (reg.active) text = 'Saved on this device, so it starts without internet. Refresh reloads it, with the newest version if there is one.';
    else text = 'Reloads the game.';
    if (!navigator.onLine) text += ' You are offline.';
    this.status.textContent = text;
    this.button.classList.toggle('primary', ready);
    this.menuButton?.classList.toggle('update', ready);
  };

  private onRefresh = async () => {
    if (this.busy) return;
    this.busy = true;
    this.button.disabled = true;
    const reg = this.reg;
    try {
      if (reg && navigator.serviceWorker.controller) {
        if (navigator.onLine && !reg.waiting) {
          this.status.textContent = 'Looking for a new version…';
          await Promise.race([reg.update().catch(() => {}), wait(CHECK_MS)]);
        }
        const next = reg.installing ?? reg.waiting;
        if (next?.state === 'installing') {
          this.status.textContent = 'Downloading the new version…';
          await installed(next, DOWNLOAD_MS);
        }
        if (next?.state === 'installed') {
          this.status.textContent = 'Starting the new version…';
          const switched = new Promise<void>((r) => navigator.serviceWorker.addEventListener('controllerchange', () => r(), { once: true }));
          next.postMessage('skipWaiting');
          await Promise.race([switched, wait(SWITCH_MS)]);
        }
      }
    } finally {
      location.reload();
    }
  };
}
