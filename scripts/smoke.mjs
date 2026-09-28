// Headless browser smoke test over the Chrome DevTools Protocol.
// Usage: npm run smoke [-- http://localhost:5173/]   (dev server must be running)
// Checks: W moves the ship along -Z, the autopilot flies back to a point, hovering + clicking
// the star targets it, and the galaxy loop works (scroll out to the galaxy, click the nearest
// star, travel, scroll in to its system). Prints JSON with FPS, console errors and screenshot
// paths. Exit 1 on failure.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/';
const port = 9333;
const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const browser = process.env.CHROME_PATH ?? browsers.find(existsSync);
if (!browser) throw new Error('No Chrome/Edge found; set CHROME_PATH');

const outDir = mkdtempSync(join(tmpdir(), 'spore2-smoke-'));
const proc = spawn(browser, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${join(outDir, 'profile')}`,
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--window-size=1280,720',
  'about:blank',
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = targets.find((t) => t.type === 'page');
  } catch {}
}
if (!target) throw new Error('Could not connect to headless browser');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let nextId = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m);
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type)) {
    errors.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++nextId;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(4000);

const state = `({ speed: +ship.speed.toFixed(1), pos: ship.object.position.toArray().map((n) => +n.toFixed(1)) })`;
const started = await evaluate(`typeof window.ship !== 'undefined'`);
let before, after, autopilot, pick, galaxyLoop, fps;
const measureFps = `new Promise((r) => { let n = 0; const t0 = performance.now();
  (function f() { if (++n === 120) r(Math.round(120000 / (performance.now() - t0))); else requestAnimationFrame(f); })(); })`;
if (started) {
  before = await evaluate(state);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`);
  await sleep(2000);
  after = await evaluate(state);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))`);

  // Autopilot back to the start (a route known to be clear).
  const home = `{ x: ${before.pos[0]}, y: ${before.pos[1]}, z: ${before.pos[2]} }`;
  const distHome = `ship.object.position.distanceTo(${home})`;
  const startDist = await evaluate(`ship.moveTo(${home}), ${distHome}`);
  await sleep(4000);
  autopilot = { startDist: +startDist.toFixed(1), endDist: +(await evaluate(distHome)).toFixed(1) };

  // Hover and click the (first) star at its on-screen position.
  pick = await evaluate(`new Promise((resolve) => {
    const canvas = game.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const star = world.stars[0];
    const p = star.renderPosition.clone().project(game.camera);
    const at = { clientX: rect.left + ((p.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - p.y) / 2) * rect.height, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointermove', at));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, button: 0 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, button: 0 }));
    requestAnimationFrame(() => requestAnimationFrame(() => resolve({
      star: star.name,
      target: ship.targetBody?.name ?? null,
      tooltip: document.getElementById('tooltip').hidden ? null : document.getElementById('tooltip-name').textContent,
    })));
  })`);
  await evaluate(`ship.stop()`);

  // Galaxy loop, driven by real wheel and pointer events.
  const wheel = (deltaY) =>
    evaluate(`game.renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaY: ${deltaY}, bubbles: true, cancelable: true }))`);
  galaxyLoop = { from: await evaluate(`system.id`) };
  await wheel(50000); // to max zoom
  await sleep(1500);
  await wheel(300); // keep scrolling past it
  await sleep(1800);
  galaxyLoop.modeAfterZoomOut = await evaluate(`levels.mode`);
  galaxyLoop.fps = await evaluate(measureFps);
  const galaxyShot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, 'galaxy.png'), Buffer.from(galaxyShot.result.data, 'base64'));

  galaxyLoop.clicked = await evaluate(`new Promise((resolve) => {
    const here = galaxy.stars[system.id].position;
    let best = null, bestD = Infinity;
    for (const s of galaxy.stars) {
      const d = Math.hypot(s.position.x - here.x, s.position.y - here.y, s.position.z - here.z);
      if (s.id !== system.id && d < bestD) { best = s; bestD = d; }
    }
    const p = new game.camera.position.constructor(best.position.x, best.position.y, best.position.z).project(game.camera);
    const rect = game.renderer.domElement.getBoundingClientRect();
    const at = { clientX: rect.left + ((p.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - p.y) / 2) * rect.height, bubbles: true };
    const canvas = game.renderer.domElement;
    canvas.dispatchEvent(new PointerEvent('pointermove', at));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, button: 0 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, button: 0 }));
    requestAnimationFrame(() => requestAnimationFrame(() =>
      resolve({ nearest: best.id, destination: levels.galaxyLevel.ship.destination?.id ?? null })));
  })`);
  for (let i = 0; i < 40 && (await evaluate(`levels.galaxyLevel.ship.travelling`)); i++) await sleep(250);
  galaxyLoop.dockedAt = await evaluate(`levels.galaxyLevel.ship.travelling ? null : levels.galaxyLevel.ship.current.id`);

  await wheel(-50000); // to min zoom
  await sleep(1500);
  await wheel(-300); // keep scrolling in
  await sleep(2000);
  galaxyLoop.modeAfterZoomIn = await evaluate(`levels.mode`);
  galaxyLoop.to = await evaluate(`system.id`);
  galaxyLoop.shipSpeed = await evaluate(`ship.speed`);
  fps = await evaluate(measureFps);
}
const screenshot = join(outDir, 'screenshot.png');
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(screenshot, Buffer.from(shot.result.data, 'base64'));

const moved = started && after.pos[2] < before.pos[2] - 10 && after.speed > 5;
const autopiloted = started && autopilot.endDist < Math.max(3, autopilot.startDist * 0.1);
const picked = started && pick.target === pick.star && pick.tooltip === pick.star;
const looped =
  started &&
  galaxyLoop.modeAfterZoomOut === 'galaxy' &&
  galaxyLoop.clicked.destination === galaxyLoop.clicked.nearest &&
  galaxyLoop.dockedAt === galaxyLoop.clicked.nearest &&
  galaxyLoop.modeAfterZoomIn === 'system' &&
  galaxyLoop.to === galaxyLoop.clicked.nearest &&
  typeof galaxyLoop.shipSpeed === 'number';
const ok = started && moved && autopiloted && picked && looped && errors.length === 0;
console.log(
  JSON.stringify(
    { ok, started, moved, autopiloted, picked, looped, before, after, autopilot, pick, galaxyLoop, fps, errors, screenshot, galaxyScreenshot: join(outDir, 'galaxy.png') },
    null,
    2,
  ),
);

ws.close();
proc.kill();
process.exit(ok ? 0 : 1);
