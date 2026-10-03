// Checks the service worker (src/pwa/sw.ts) in a headless browser: the game saved on the device starts
// with the server gone, and the menu's Refresh button brings in a new version.
//   npm run offline               builds, then checks
//   npm run offline -- --no-build checks the dist/ that's there
// dist/ is served the way GitHub Pages serves the site: the release at /sporer/, the same build again as
// the preview at /sporer/preview/, and a versions.json listing both. "Offline" is the server stopped, so
// anything the worker didn't save fails, as it would without internet. Every response is no-cache, so each
// request the browser makes reaches the server and can be counted.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { launch, sleep } from './lib/browser.mjs';

const DIST = resolve(import.meta.dirname, '../dist');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.bin': 'application/octet-stream',
};

if (!process.argv.includes('--no-build')) execSync('npx vite build', { stdio: ['ignore', 'ignore', 'inherit'] });
if (!existsSync(join(DIST, 'sw.js'))) throw new Error('dist/sw.js is missing: build first');
const files = JSON.parse(/const FILES = (.*);/.exec(readFileSync(join(DIST, 'sw.js'), 'utf8'))[1]);

/** Set to make the server hand out a "new version" of sw.js (another VERSION, so another cache). */
let swVersionSuffix = '';
const versions = {
  versions: [
    { id: 'release', label: 'Release', path: '', ref: 'v0', commit: 'aaaaaaa', date: '2026-01-01T00:00:00Z' },
    { id: 'preview', label: 'Preview (main)', path: 'preview/', ref: 'main', commit: 'bbbbbbb', date: '2026-01-01T00:00:00Z' },
  ],
};
const requests = [];

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  requests.push(path);
  if (path === '/sporer/versions.json') {
    res.writeHead(200, { 'Content-Type': TYPES['.json'] }).end(JSON.stringify(versions));
    return;
  }
  const m = /^\/sporer\/(?:preview\/)?(.*)$/.exec(path);
  if (!m) return void res.writeHead(404).end();
  let file = normalize(join(DIST, m[1] === '' || m[1].endsWith('/') ? `${m[1]}index.html` : m[1]));
  if (!file.startsWith(DIST) || !existsSync(file)) return void res.writeHead(404).end();
  let body = readFileSync(file);
  if (m[1] === 'sw.js' && swVersionSuffix) body = Buffer.from(body.toString().replace(/const VERSION = "(\w+)"/, `const VERSION = "$1${swVersionSuffix}"`));
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(body);
});
const listen = (port = 0) => new Promise((r) => server.listen(port, '127.0.0.1', () => r(server.address().port)));
const stop = () => new Promise((r) => (server.closeAllConnections(), server.close(r)));

const port = await listen();
const site = `http://127.0.0.1:${port}/sporer/`;
const browser = await launch({ width: 960, height: 600 });
const { evaluate, waitFor, goto, close } = browser;
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
  return ok;
};
const started = `!document.getElementById('loading')`;
/** Where the page is, for a failed check. */
const where = () => browser.tryEvaluate(`JSON.stringify([location.href, document.title, document.getElementById('loading')?.textContent ?? null])`, 5000);
const status = () => evaluate(`document.getElementById('menu-refresh-status').textContent`);
const cacheNames = () => evaluate(`caches.keys()`);
const savedCount = (scope) =>
  evaluate(`(async () => { const n = (await caches.keys()).find((n) => n.startsWith('sporer ${scope} ')); return n ? (await (await caches.open(n)).keys()).length : 0; })()`);

try {
  check(await goto(`${site}?quality=low`, started, 60000), 'the game starts online');
  check(await waitFor(`navigator.serviceWorker.controller !== null`, 60000), 'its service worker takes control');
  check((await savedCount(site)) === files.length, `it saved all ${files.length} files`);
  check(/Saved on this device/.test(await status()), `the menu says so: "${await status()}"`);

  const before = requests.length;
  await goto(`${site}preview/?quality=low`, started, 60000);
  check(await waitFor(`navigator.serviceWorker.controller?.scriptURL === '${site}preview/sw.js'`, 60000), "the preview gets a worker of its own, not the release's");
  check((await savedCount(`${site}preview/`)) === files.length, 'with its own copy');
  // The page asks for some of them itself; the worker asking again would make it twice.
  const assets = requests.slice(before).filter((p) => p.startsWith('/sporer/preview/assets/'));
  const twice = assets.filter((p, i) => assets.indexOf(p) !== i);
  check(twice.length === 0, `copying the release's hashed files, not downloading them (${twice.length} downloaded again)`);

  await stop();
  console.log('-- server stopped');
  check(await goto(`${site}?quality=low&seed=7`, started, 60000), 'the game starts offline');
  check(!(await evaluate(`document.body.textContent.includes('Failed to start')`)), 'without failing');
  // A stopped server isn't a lost connection, so the browser may still think it's online.
  check(/You are offline/.test(await status()) || (await evaluate('navigator.onLine')), 'the menu says so if the browser knows');
  const range = await evaluate(`(async () => {
    const url = [...document.querySelectorAll('audio')].map((a) => a.src)[0] ?? new URL('${files.find((f) => f.endsWith('.mp3'))}', location.href).href;
    const r = await fetch(url, { headers: { Range: 'bytes=100-199' } });
    return [r.status, (await r.arrayBuffer()).byteLength, r.headers.get('Content-Range')];
  })()`);
  check(range[0] === 206 && range[1] === 100, `audio range requests are answered from the copy: ${JSON.stringify(range)}`);
  check(await goto(`${site}lab.html?gen=3&type=terran`, `window.lab`, 60000), 'the planet lab opens offline') || console.log('  at', await where());
  check(await goto(`${site}preview/?quality=low`, started, 60000), 'the preview starts offline') || console.log('  at', await where());

  await listen(port);
  swVersionSuffix = 'b';
  console.log('-- server back, with a new version');
  check(await goto(`${site}?quality=low`, started, 60000), 'the game starts online again');
  check(await waitFor(`(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting)()`, 60000), 'the new version downloads in the background and waits');
  await evaluate(`document.getElementById('menu-toggle').click()`);
  check(await waitFor(`document.getElementById('menu-toggle').classList.contains('update')`, 5000), 'the menu button shows a dot');
  check(/new version is ready/.test(await status()), `the menu says so: "${await status()}"`);
  await evaluate(`window.__leaving = true; document.getElementById('menu-refresh').click()`);
  check(await waitFor(`!window.__leaving && ${started}`, 60000), 'Refresh reloads the game');
  check(await waitFor(`(async () => (await caches.keys()).some((n) => n.startsWith('sporer ${site} ') && n.endsWith('b')))()`, 10000), 'running the new version');
  const names = await cacheNames();
  check(names.filter((n) => n.startsWith(`sporer ${site} `)).length === 1, `the old one's copy is gone (${names.length} caches)`);
  await sleep(500);
  const errors = browser.errors.filter((e) => !/Failed to load resource|ERR_CONNECTION_REFUSED|Surface map/.test(e));
  check(errors.length === 0, `no console errors${errors.length ? `:\n  ${errors.join('\n  ')}` : ''}`);
} finally {
  await close();
  if (server.listening) await stop();
}
console.log(failed ? `${failed} check(s) failed` : 'all good');
process.exit(failed ? 1 : 0);
