// Headless browser smoke test over the Chrome DevTools Protocol.
// Usage: npm run smoke [-- http://localhost:5173/]   (dev server must be running)
// Checks: W moves the ship along -Z, the autopilot flies back to a point, and hovering +
// clicking the star targets it. Prints JSON with FPS, console errors and a screenshot path.
// Exit 1 on failure.
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
let before, after, autopilot, pick, fps;
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
  fps = await evaluate(`new Promise((r) => { let n = 0; const t0 = performance.now();
    (function f() { if (++n === 120) r(Math.round(120000 / (performance.now() - t0))); else requestAnimationFrame(f); })(); })`);
}
const screenshot = join(outDir, 'screenshot.png');
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(screenshot, Buffer.from(shot.result.data, 'base64'));

const moved = started && after.pos[2] < before.pos[2] - 10 && after.speed > 5;
const autopiloted = started && autopilot.endDist < Math.max(3, autopilot.startDist * 0.1);
const picked = started && pick.target === pick.star && pick.tooltip === pick.star;
const ok = started && moved && autopiloted && picked && errors.length === 0;
console.log(
  JSON.stringify({ ok, started, moved, autopiloted, picked, before, after, autopilot, pick, fps, errors, screenshot }, null, 2),
);

ws.close();
proc.kill();
process.exit(ok ? 0 : 1);
