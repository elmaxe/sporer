/*
 * The service worker: keeps a copy of the whole build on the device so the
 * game (and the labs) start without internet, as an installed app or a tab.
 *
 * Built by the serviceWorker plugin in vite.config.ts, which compiles this
 * file to sw.js and puts VERSION (a hash of the build) and FILES (every file
 * of the build, relative to its folder) in front of it. Registered by
 * pwa/serviceWorker.ts. Type-checked on its own (tsconfig.sw.json), as a
 * classic script: no imports or exports.
 *
 * Every build on the Pages site (the release, preview/, pr/<n>/) has its own
 * worker scoped to its folder, and its own cache named after that folder, so
 * they never touch each other's files. A worker answers only for its own
 * build's files and passes everything else on to the network, which keeps the
 * release's worker (whose folder holds the others') out of their way.
 *
 * Installing saves every file; one that an earlier copy (of this build or
 * another) already holds under the same hashed name (assets/) is copied, not
 * downloaded. A new version installs in the background and waits: the old one
 * keeps serving until the game is closed, or the menu's Refresh button
 * (ui/RefreshControl.ts) tells it to take over ('skipWaiting').
 */

declare const VERSION: string;
declare const FILES: readonly string[];

const sw = self as unknown as ServiceWorkerGlobalScope;
const SCOPE = sw.registration.scope;
/** Same as CACHE_PREFIX in pwa/serviceWorker.ts: 'sporer <scope> <version>'. */
const PREFIX = 'sporer ';
const CACHE = `${PREFIX}${SCOPE} ${VERSION}`;
/** This build's files, by absolute URL. */
const OWN = new Set(FILES.map((file) => new URL(file, SCOPE).href));

/** Vite's hashed output: a file's name changes with its content, so any copy under that name will do. */
const isHashed = (file: string) => file.startsWith('assets/');

sw.addEventListener('install', (event) => event.waitUntil(saveAll()));

sw.addEventListener('activate', (event) => event.waitUntil(dropOldCaches().then(() => sw.clients.claim())));

sw.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') void sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;
  // The game's pages take ?seed=, ?star=…, the labs a #hash; the files themselves never vary by query.
  url.search = '';
  url.hash = '';
  if (request.mode === 'navigate' && url.pathname.endsWith('/')) url.pathname += 'index.html';
  if (OWN.has(url.href)) event.respondWith(fromCache(request, url.href));
  // The list of versions for the menu's picker (ui/versions.ts) and the release notes (ui/releaseNotes.ts):
  // the latest, else the last one seen.
  else if (/\/(versions|releases)\.json$/.test(url.pathname)) event.respondWith(networkFirst(request, url.href));
});

async function saveAll(): Promise<void> {
  const cache = await caches.open(CACHE);
  await Promise.all(
    FILES.map(async (file) => {
      const url = new URL(file, SCOPE).href;
      if (await cache.match(url)) return; // an install that was cut short and started again
      const copy = isHashed(file) ? await findCopy(file) : undefined;
      // A new response, not the copy itself: that keeps the other build's URL, which a module script would
      // then load its imports relative to (from the other build's folder).
      if (copy) return cache.put(url, new Response(copy.body, { status: copy.status, statusText: copy.statusText, headers: copy.headers }));
      // Unhashed files (the pages, icons, maps) skip the HTTP cache, so they match the hashed ones.
      const response = await fetch(url, { cache: isHashed(file) ? 'default' : 'no-cache' });
      if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
      await cache.put(url, response);
    }),
  );
}

/** The same hashed file from any build's cache on this device. */
async function findCopy(file: string): Promise<Response | undefined> {
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX) || name === CACHE) continue;
    const scope = name.slice(PREFIX.length).split(' ')[0];
    const hit = await (await caches.open(name)).match(new URL(file, scope).href);
    if (hit) return hit;
  }
  return undefined;
}

/** Removes this folder's caches of earlier versions. */
async function dropOldCaches(): Promise<void> {
  const mine = `${PREFIX}${SCOPE} `;
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith(mine) && n !== CACHE).map((n) => caches.delete(n)));
}

async function fromCache(request: Request, url: string): Promise<Response> {
  const hit = await (await caches.open(CACHE)).match(url);
  if (!hit) return fetch(request);
  const range = request.headers.get('range');
  return range ? partial(hit, range) : hit;
}

/**
 * The part of a saved file a range request asks for: the music plays through
 * an <audio> element, which asks for ranges and (in Safari) won't play a
 * whole file given instead.
 */
async function partial(whole: Response, range: string): Promise<Response> {
  const blob = await whole.blob();
  const size = blob.size;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start = NaN;
  let end = size - 1;
  if (m && m[1] !== '') {
    start = Number(m[1]);
    if (m[2] !== '') end = Math.min(Number(m[2]), size - 1);
  } else if (m && m[2] !== '') {
    start = Math.max(0, size - Number(m[2])); // the last n bytes
  }
  if (!(start <= end)) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': whole.headers.get('Content-Type') ?? '',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

async function networkFirst(request: Request, url: string): Promise<Response> {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(url, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(url);
    if (hit) return hit;
    throw err;
  }
}
