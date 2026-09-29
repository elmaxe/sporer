// Headless browser smoke test over the Chrome DevTools Protocol.
// Usage: npm run smoke [-- http://localhost:5173/]   (dev server must be running)
// Checks: W moves the ship along -Z, the autopilot flies back to a point, hovering + clicking
// the star targets it, and the galaxy loop works (scroll out to the galaxy, click the nearest
// star, travel, scroll in to its system; the galaxy shows distant galaxies, twinkles, spins and draws binaries
// as two dots, and picking works while it's turned), a real click on the speaker button starts audio; then the
// transitions and galaxy travel play their whooshes, and M mutes. Then the planet loop (park at a planet,
// scroll in to low orbit, click the globe and fly, scroll back out beside it), and again for every planet
// type, a ringed rocky/icy/lava world and a moon in other systems (skip those with --quick). The system sky has
// the galaxy band (screenshot looking at the galactic centre) and an orbit line per planet and moon.
// Prints JSON with FPS, console errors and screenshot paths. Exit 1 on failure.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const url = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173/';
const port = 9333;
const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/opt/pw-browsers/chromium',
];
const browser = process.env.CHROME_PATH ?? browsers.find(existsSync);
if (!browser) throw new Error('No Chrome/Edge found; set CHROME_PATH');

// A browser left on the port (e.g. from a crashed run) would be reused with its old state (saved volume, mute).
if (await fetch(`http://127.0.0.1:${port}/json/version`).then(() => true, () => false)) {
  throw new Error(`A browser is already listening on port ${port}; close it first`);
}

const outDir = mkdtempSync(join(tmpdir(), 'spore2-smoke-'));
const proc = spawn(browser, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${join(outDir, 'profile')}`,
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--window-size=1280,720',
  // Chrome refuses to run as root (e.g. in containers) with its sandbox on.
  ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
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
let before, after, autopilot, pick, sky, galaxyLoop, fps, audio, planetLoop;
const planetTypes = [];
const wheel = (deltaY) =>
  evaluate(`game.renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaY: ${deltaY}, bubbles: true, cancelable: true }))`);

/**
 * Parks the system ship beside the body `bodyExpr` evaluates to, scrolls in to its planet level, clicks the
 * globe a little way ahead of the ship, lets it fly, then scrolls back out. Returns what it saw.
 */
async function runPlanetLoop(bodyExpr, shotName) {
  // Input is blocked during a level transition (slow under SwiftShader), which would swallow the wheel below.
  for (let i = 0; i < 40 && (await evaluate(`levels.transitioning`)); i++) await sleep(250);
  const r = await evaluate(`(() => {
    const body = ${bodyExpr};
    window.__body = body;
    // Park on the day side, a little above the orbital plane.
    const side = world.stars[0].position.clone().sub(body.position).normalize();
    side.y += 0.5;
    ship.parkAt(body, side);
    return { name: body.name, type: body.config.type, moon: body.parent !== null };
  })()`);
  await sleep(300);
  await wheel(-50000); // to min zoom
  await sleep(1500);
  await wheel(-300); // keep scrolling in
  for (let i = 0; i < 20 && (await evaluate(`levels.mode !== 'planet' || levels.transitioning`)); i++) await sleep(250);
  r.mode = await evaluate(`levels.mode`);
  r.soundIn = await evaluate(`audio.lastPlayed?.name ?? null`);
  if (r.mode !== 'planet') return r;
  r.sky = await evaluate(`planet.skyStats`);
  r.expectedSky = await evaluate(`({ bodies: world.planets.length + world.moons.length - 1 - world.moons.filter((m) => m.parent === __body).length })`);

  // Click the globe ~20° ahead of the ship, towards the top of the screen.
  r.click = await evaluate(`new Promise((resolve) => {
    const V = game.camera.position.constructor;
    const u = planet.ship.direction.clone();
    const up = new V(0, 1, 0).applyQuaternion(game.camera.quaternion);
    const t = up.sub(u.clone().multiplyScalar(up.dot(u))).normalize();
    const point = u.clone().multiplyScalar(Math.cos(0.35)).add(t.multiplyScalar(Math.sin(0.35))).multiplyScalar(100);
    const p = point.clone().project(game.camera);
    const rect = game.renderer.domElement.getBoundingClientRect();
    const at = { clientX: rect.left + ((p.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - p.y) / 2) * rect.height, bubbles: true };
    const canvas = game.renderer.domElement;
    window.__start = u;
    canvas.dispatchEvent(new PointerEvent('pointermove', at));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, button: 0 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, button: 0 }));
    requestAnimationFrame(() => requestAnimationFrame(() => resolve({
      onScreen: Math.abs(p.x) < 1 && Math.abs(p.y) < 1,
      enRoute: planet.ship.enRoute,
      targetAngle: +planet.ship.destination.angleTo(point).toFixed(3),
    })));
  })`);
  await sleep(3000);
  r.flewDegrees = await evaluate(`+(planet.ship.direction.angleTo(__start) * 180 / Math.PI).toFixed(1)`);
  r.altitudeOk = await evaluate(`Math.abs(planet.ship.object.position.length() - planet.ship.radius) < 0.5`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  r.screenshot = join(outDir, `${shotName}.png`);
  writeFileSync(r.screenshot, Buffer.from(shot.result.data, 'base64'));

  await wheel(50000); // to max zoom
  await sleep(1500);
  await wheel(300); // keep scrolling out
  for (let i = 0; i < 20 && (await evaluate(`levels.mode !== 'system' || levels.transitioning`)); i++) await sleep(250);
  r.modeAfter = await evaluate(`levels.mode`);
  r.soundOut = await evaluate(`audio.lastPlayed?.name ?? null`);
  r.parkedAt = await evaluate(`ship.targetBody?.name ?? null`);
  r.standoffs = await evaluate(`+(ship.object.position.distanceTo(__body.renderPosition) / __body.standoff).toFixed(2)`);
  r.ok =
    r.mode === 'planet' &&
    r.sky.bodies === r.expectedSky.bodies &&
    r.click.onScreen &&
    r.click.enRoute &&
    r.flewDegrees > 3 &&
    r.altitudeOk &&
    r.modeAfter === 'system' &&
    r.parkedAt === r.name &&
    Math.abs(r.standoffs - 1) < 0.2;
  return r;
}
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

  // System sky: the galaxy band and the orbit lines. Look at the galactic centre for a screenshot.
  sky = await evaluate(`(() => {
    const scene = levels.systemLevel.scene;
    const band = scene.getObjectByName('Galaxy band');
    const lines = scene.getObjectByName('Orbit lines');
    const c = levels.systemLevel.band.sky.center;
    levels.systemLevel.orbit.lookFrom(new game.camera.position.constructor(-c.x, -c.y, -c.z));
    return {
      band: !!band && !!scene.getObjectByName('Galaxy band stars'),
      orbitLines: lines?.children.length ?? 0,
      expectedLines: world.planets.length + world.moons.length,
    };
  })()`);
  await sleep(1500);
  sky.visibleLines = await evaluate(`levels.systemLevel.scene.getObjectByName('Orbit lines').children.filter((l) => l.visible).length`);
  const bandShot = await send('Page.captureScreenshot', { format: 'png' });
  sky.screenshot = join(outDir, 'band.png');
  writeFileSync(sky.screenshot, Buffer.from(bandShot.result.data, 'base64'));

  // Galaxy loop, driven by real wheel and pointer events.
  galaxyLoop = { from: await evaluate(`system.id`) };
  await wheel(50000); // to max zoom
  await sleep(1500);
  await wheel(300); // keep scrolling past it
  await sleep(1800);
  galaxyLoop.modeAfterZoomOut = await evaluate(`levels.mode`);
  galaxyLoop.fps = await evaluate(measureFps);
  // Step 6 polish: distant galaxies, twinkle, a slow spin, binaries as two dots.
  galaxyLoop.polish = await evaluate(`new Promise((resolve) => {
    const level = levels.galaxyLevel;
    const a0 = level.spin.angle, t0 = performance.now();
    setTimeout(() => resolve({
      distantGalaxies: level.distantGalaxies.count,
      spinRadPerSec: (level.spin.angle - a0) / ((performance.now() - t0) / 1000),
      dots: level.map.dotCount,
      expectedDots: galaxy.stars.reduce((t, s) => t + s.stars.length, 0),
      stars: galaxy.stars.length,
      twinkle: level.map.points.material.uniforms.twinkle.value,
      twinkleTime: level.map.points.material.uniforms.time.value,
    }), 1000);
  })`);
  // Turn the galaxy well away from its start, so the click below also checks picking and travel while rotated.
  await evaluate(`levels.galaxyLevel.root.rotation.y += 1.2`);
  await sleep(200);
  const galaxyShot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, 'galaxy.png'), Buffer.from(galaxyShot.result.data, 'base64'));

  galaxyLoop.clicked = await evaluate(`new Promise((resolve) => {
    const here = galaxy.stars[system.id].position;
    let best = null, bestD = Infinity;
    for (const s of galaxy.stars) {
      const d = Math.hypot(s.position.x - here.x, s.position.y - here.y, s.position.z - here.z);
      if (s.id !== system.id && d < bestD) { best = s; bestD = d; }
    }
    const p = new game.camera.position.constructor(best.position.x, best.position.y, best.position.z)
      .applyMatrix4(levels.galaxyLevel.root.matrixWorld).project(game.camera);
    const rect = game.renderer.domElement.getBoundingClientRect();
    const at = { clientX: rect.left + ((p.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - p.y) / 2) * rect.height, bubbles: true };
    const canvas = game.renderer.domElement;
    canvas.dispatchEvent(new PointerEvent('pointermove', at));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, button: 0 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, button: 0 }));
    requestAnimationFrame(() => requestAnimationFrame(() =>
      resolve({ nearest: best.id, destination: levels.galaxyLevel.ship.destination?.id ?? null })));
  })`);
  for (let i = 0; i < 60 && (await evaluate(`levels.galaxyLevel.ship.travelling`)); i++) await sleep(250);
  galaxyLoop.dockedAt = await evaluate(`levels.galaxyLevel.ship.travelling ? null : levels.galaxyLevel.ship.current.id`);

  await wheel(-50000); // to min zoom
  await sleep(1500);
  await wheel(-300); // keep scrolling in
  await sleep(2000);
  galaxyLoop.modeAfterZoomIn = await evaluate(`levels.mode`);
  galaxyLoop.to = await evaluate(`system.id`);
  galaxyLoop.shipSpeed = await evaluate(`ship.speed`);
  fps = await evaluate(measureFps);

  // Audio: a real (trusted) click on the speaker button unlocks audio and opens the volume panel.
  const button = await evaluate(`(() => { const r = document.getElementById('audio-toggle').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, ...button, button: 'left', clickCount: 1 });
  }
  await sleep(1000);
  audio = await evaluate(`({ state: audio.state, panelOpen: !document.getElementById('audio-panel').hidden,
    effectsSlider: !!document.querySelector('#audio-panel input[data-key="sfx"]') })`);

  // Whooshes: zoom out (transition), travel to a neighbour, zoom back in.
  const played = `(audio.lastPlayed && { name: audio.lastPlayed.name, seconds: +audio.lastPlayed.seconds.toFixed(2), count: audio.lastPlayed.count })`;
  audio.sfx = {};
  await evaluate(`levels.toGalaxy()`);
  audio.sfx.out = await evaluate(played);
  await sleep(1500);
  audio.sfx.travel = await evaluate(`(() => {
    const ship = levels.galaxyLevel.ship;
    const here = ship.current.position;
    let best = null, bestD = Infinity;
    for (const s of galaxy.stars) {
      const d = Math.hypot(s.position.x - here.x, s.position.y - here.y, s.position.z - here.z);
      if (s !== ship.current && d < bestD) { best = s; bestD = d; }
    }
    ship.travelTo(best);
    return ${played};
  })()`);
  for (let i = 0; i < 60 && (await evaluate(`levels.galaxyLevel.ship.travelling`)); i++) await sleep(250);
  await evaluate(`levels.toSystem()`);
  audio.sfx.in = await evaluate(played);
  await sleep(1500);
  audio.sfx.modeAfter = await evaluate(`levels.mode`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyM', key: 'm' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyM', key: 'm' });
  audio.mutedByKey = await evaluate(`document.getElementById('audio').classList.contains('muted')`);

  // Planet loop in the current system: the first terran or ocean world, else the first planet.
  planetLoop = await runPlanetLoop(
    `world.planets.find((p) => ['terran', 'ocean'].includes(p.config.type)) ?? world.planets[0]`,
    'planet',
  );
}

if (started && !quick) {
  // Every planet type (plus a ringed solid planet and a moon), each in the first system of this galaxy that has one.
  const found = await evaluate(`(() => {
    const want = ['lava', 'barren', 'desert', 'terran', 'ocean', 'ice', 'gas'];
    const found = {};
    for (const ref of galaxy.stars) {
      const sys = generateSystem(ref);
      sys.planets.forEach((p, i) => {
        if (want.includes(p.type) && !(p.type in found)) found[p.type] = { star: ref.id, expr: 'world.planets[' + i + ']' };
        if (p.rings && p.type !== 'gas' && !('ringed' in found)) found.ringed = { star: ref.id, expr: 'world.planets[' + i + ']' };
        if (p.moons.length && !('moon' in found)) found.moon = { star: ref.id, expr: 'world.moons.find((m) => m.parent === world.planets[' + i + '])' };
      });
      if (Object.keys(found).length === want.length + 2) break;
    }
    return found;
  })()`);
  const base = new URL(url);
  for (const [type, { star, expr }] of Object.entries(found)) {
    base.searchParams.set('star', String(star));
    await send('Page.navigate', { url: base.href });
    await sleep(4000);
    const r = await runPlanetLoop(expr, `planet-${type}`);
    planetTypes.push({ case: type, star, ...r });
  }
}
const screenshot = join(outDir, 'screenshot.png');
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(screenshot, Buffer.from(shot.result.data, 'base64'));

const moved = started && after.pos[2] < before.pos[2] - 10 && after.speed > 5;
const autopiloted = started && autopilot.endDist < Math.max(3, autopilot.startDist * 0.1);
const picked = started && pick.target === pick.star && pick.tooltip === pick.star;
const skyOk = started && sky.band && sky.orbitLines === sky.expectedLines && sky.visibleLines >= 1;
const looped =
  started &&
  galaxyLoop.modeAfterZoomOut === 'galaxy' &&
  galaxyLoop.polish.distantGalaxies >= 100 &&
  galaxyLoop.polish.spinRadPerSec > 0 &&
  galaxyLoop.polish.spinRadPerSec < 0.01 &&
  galaxyLoop.polish.dots === galaxyLoop.polish.expectedDots &&
  galaxyLoop.polish.dots > galaxyLoop.polish.stars &&
  galaxyLoop.polish.twinkle > 0 &&
  galaxyLoop.polish.twinkleTime > 0 &&
  galaxyLoop.clicked.destination === galaxyLoop.clicked.nearest &&
  galaxyLoop.dockedAt === galaxyLoop.clicked.nearest &&
  galaxyLoop.modeAfterZoomIn === 'system' &&
  galaxyLoop.to === galaxyLoop.clicked.nearest &&
  typeof galaxyLoop.shipSpeed === 'number';
const sounded =
  started &&
  audio.state === 'running' &&
  audio.panelOpen &&
  audio.effectsSlider &&
  audio.sfx.out?.name === 'transitionOut' &&
  audio.sfx.travel?.name === 'travel' &&
  audio.sfx.in?.name === 'transitionIn' &&
  audio.sfx.in.count === 3 &&
  audio.sfx.modeAfter === 'system' &&
  audio.mutedByKey;
// Audio is only unlocked in the first page load, so only the home system's loop can hear its whooshes.
const planets =
  started &&
  planetLoop.ok &&
  planetLoop.soundIn === 'transitionIn' &&
  planetLoop.soundOut === 'transitionOut' &&
  planetTypes.every((r) => r.ok) &&
  (quick || planetTypes.length === 9);
const ok = started && moved && autopiloted && picked && skyOk && looped && sounded && planets && errors.length === 0;
console.log(
  JSON.stringify(
    { ok, started, moved, autopiloted, picked, skyOk, looped, sounded, planets, before, after, autopilot, pick, sky, galaxyLoop, audio, planetLoop, planetTypes, fps, errors, screenshot, galaxyScreenshot: join(outDir, 'galaxy.png') },
    null,
    2,
  ),
);

ws.close();
proc.kill();
process.exit(ok ? 0 : 1);
