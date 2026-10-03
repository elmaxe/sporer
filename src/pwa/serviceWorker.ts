/**
 * The page's side of the service worker (pwa/sw.ts), which keeps the build on
 * the device so the game starts without internet. Registered by the game's
 * page in production builds only: the dev server has none (it would get in
 * the way of Vite's reloading), so neither do the smoke test and screenshots.
 */

/** Cache names are 'sporer <scope> <version>' (as in sw.ts). */
export const CACHE_PREFIX = 'sporer ';

/** How long to let the registration start before leaving the page anyway, ms. */
const REGISTER_WAIT_MS = 3000;

let registering: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Registers this build's worker (sw.js next to the page, scoped to its folder),
 * once; null where there's none (dev server, no support, refused).
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  registering ??=
    import.meta.env.DEV || !('serviceWorker' in navigator)
      ? Promise.resolve(null)
      : navigator.serviceWorker.register('sw.js').catch((err: unknown) => {
          console.warn('Service worker not registered, so no offline play:', err);
          return null;
        });
  return registering;
}

/**
 * Waits (briefly) for the registration to start before the page leaves for
 * another version, so the release's worker gets installed even when an
 * installed app always goes straight on to the preview: the app starts at the
 * release, so that's the one it needs offline.
 */
export async function registrationStarted(): Promise<void> {
  await Promise.race([registerServiceWorker(), new Promise((r) => setTimeout(r, REGISTER_WAIT_MS))]);
}

/** True when the page at `folderUrl` has a worker of its own installed, so it opens offline. */
export async function availableOffline(folderUrl: string): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration(folderUrl).catch(() => undefined);
  return reg?.scope === folderUrl && reg.active !== null;
}

/**
 * The workers' scopes that belong to versions no longer on the site: pull
 * requests' folders (`pr/<n>/`) of the site at `root` that aren't one of
 * `paths`. The release and the preview always stay; the release is where an
 * installed app starts.
 */
export function staleScopes(root: string, paths: readonly string[], scopes: readonly string[]): string[] {
  const live = new Set(paths.map((p) => root + p));
  return scopes.filter((scope) => {
    if (!scope.startsWith(root) || live.has(scope)) return false;
    return /^pr\/\d+\/$/.test(scope.slice(root.length));
  });
}

/**
 * Unregisters the workers of versions gone from the site and deletes their
 * saved copies, so closed pull requests don't keep taking room on the device.
 * `paths` is the site's list of versions' folders; it must be the real one, so
 * nothing is forgotten offline, where the list is the last one seen.
 */
export async function forgetRemovedVersions(root: string, paths: readonly string[]): Promise<void> {
  if (!('serviceWorker' in navigator) || !navigator.onLine || paths.length === 0) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  const stale = new Set(staleScopes(root, paths, regs.map((r) => r.scope)));
  if (stale.size === 0) return;
  await Promise.all(regs.filter((r) => stale.has(r.scope)).map((r) => r.unregister()));
  const names = await caches.keys();
  const scopeOf = (name: string) => name.slice(CACHE_PREFIX.length).split(' ')[0] ?? '';
  await Promise.all(names.filter((n) => n.startsWith(CACHE_PREFIX) && stale.has(scopeOf(n))).map((n) => caches.delete(n)));
}
