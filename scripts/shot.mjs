// Screenshots of the running game, driven by a list of steps. Needs the dev server (npm run dev).
//
// Usage: npm run shot -- [options] [steps...]
//   npm run shot -- --out /tmp/shots                                   one screenshot of the start view
//   npm run shot -- --star 5 --clean shot:start galaxy shot:galaxy     a red giant system, then the galaxy
//   npm run shot -- "freeze:levels.seamless?.elapsed > 1.3" ...         see the step list below
//
// Options:
//   --url <url>        page to load (default http://localhost:5173/); --star <id> / --seed <s> add URL params
//   --lab [<query>]    the planet lab (lab.html) instead of the game, e.g. --lab "gen=7&type=ice" or --lab
//                      "seed=1337&star=5&planet=2" (a game planet); drive it with js:lab.set(...) and the like
//   --plants [<query>] the plant lab (plants.html), e.g. --plants "gen=4&kind=tree&arch=palm&view=lineup" or
//                      --plants "seed=1337&star=5&planet=1&species=2"; drive it with js:plantLab.set(...) and the like
//   --stars [<query>]  the star lab (stars.html), e.g. --stars "gen=4&kind=redGiant&view=system" or --stars
//                      "seed=1337&star=5" (a game system; star=sol our own); drive it with js:starLab.setStar(...) and the like
//   --out <dir>        where PNGs go (default: a new temp dir); created if missing
//   --size <w>x<h>     page size in CSS pixels (default 1280x720)
//   --phone            an emulated phone: 390x844 (unless --size), mobile, touch events (the game's touch mode)
//   --clean            hide the debug panel and FPS meter
//   --low              ?quality=low: half resolution, no antialiasing (about 5x faster under SwiftShader; for
//                      checks where a soft picture will do)
//   --sheet            also write sheet.png: every screenshot in a labelled grid (one Read for a sequence)
//   --steps <file>     read more steps from a file, one per line (# comments), handy for long JS
//   --dump <file>      a debug dump (menu → Save debug dump, F8): load its galaxy and system at its page size
//                      (a phone's in --phone mode) and quality, then restore its state (level, body, clocks,
//                      ship, camera, graphics switches) and leave the game paused there; the notes on what
//                      couldn't be matched are the first result. With no steps: shot:restored. See debug-dump.
//
// Steps, run in order (with no steps: shot:view):
//   shot:<name>                  screenshot → <name>.png
//   crop:<name>:<x>,<y>,<w>,<h>[:<zoom>]
//                                crop of the last screenshot (CSS px), scaled up by zoom (default 2, nearest)
//   wait:<ms>                    sleep
//   js:<expression>              evaluate in the page (promises awaited); the value is printed
//   until:<expression>[@<ms>]    poll until truthy (default timeout 20000 ms)
//   settle                       wait until no level transition runs, plus a few frames
//   galaxy | system              levels.toGalaxy() / levels.toSystem(), then settle
//   freeze:<expression>          stop the game loop on the first frame (after drawing) where the expression
//                                is truthy, so the next shot shows exactly that frame; `resume` restarts it
//   resume                       game.start() after a freeze
//   solo:<outgoing|incoming>:<name>
//                                while frozen mid-crossfade: redraw showing only that level, screenshot → <name>.png,
//                                then redraw the blend (compare the two sides of a handover)
//   tap:<element id>             tap (--phone) or click the middle of that element, then wait two frames
//   hover:<x>,<y> | hover:<expression>
//                                move the mouse there (CSS px; or an expression giving {x, y}), wait a few frames
//   press:<x>,<y> | press:<expression>
//                                press and hold the mouse button (a finger with --phone) there (CSS px; or an
//                                expression giving {x, y}), wait a few frames; `release` lets go (the beam)
//   release                      let go of a press, wait a few frames
//   fps                          measure frames per second over 120 frames
//   goto:<url or ?params>        load another page (e.g. goto:?star=2) and wait for the game
//
// Page globals (dev build): game, levels, galaxy, ship, world, system, planet, audio, menu, debugDump, generateSystem.
// In the lab: game and lab (src/lab/PlanetLab.ts: lab.set, setView, generate, load, look, setTime, ...);
// settle there waits for lab.ready (the latest edit built and drawn). In the plant lab: game and plantLab
// (src/plantlab/PlantLab.ts: plantLab.set, setForm, select, setView, generate, load, look, ...), settle waits for plantLab.ready.
// In the star lab: game and starLab (src/starlab/StarLab.ts: starLab.setStar, setActivity, setTuning, setView, generate,
// load, focus, look, setTime, ...), settle waits for starLab.ready.
// Prints JSON: { ok, failure, out, shots, results, errors } (errors: console errors/warnings/exceptions).
// A failing step stops the run, saves failure.png and exits 1.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launch, sleep } from './lib/browser.mjs';

const args = process.argv.slice(2);
const opts = { url: 'http://localhost:5173/', size: '1280x720', clean: false, sheet: false, params: {} };
const steps = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const value = () => {
    if (i + 1 >= args.length) throw new Error(`${a} needs a value`);
    return args[++i];
  };
  if (a === '--url') opts.url = value();
  else if (a === '--out') opts.out = value();
  else if (a === '--size') opts.size = value();
  else if (a === '--star') opts.params.star = value();
  else if (a === '--seed') opts.params.seed = value();
  else if (a === '--lab') {
    opts.lab = true;
    // An optional query right after it (anything not starting with -- and not a step).
    if (i + 1 < args.length && !args[i + 1].startsWith('--') && !/^[a-z]+(:|$)/.test(args[i + 1])) opts.labQuery = args[++i];
  } else if (a === '--plants') {
    opts.plants = true;
    if (i + 1 < args.length && !args[i + 1].startsWith('--') && !/^[a-z]+(:|$)/.test(args[i + 1])) opts.plantsQuery = args[++i];
  } else if (a === '--stars') {
    opts.stars = true;
    if (i + 1 < args.length && !args[i + 1].startsWith('--') && !/^[a-z]+(:|$)/.test(args[i + 1])) opts.starsQuery = args[++i];
  } else if (a === '--phone') opts.phone = true;
  else if (a === '--clean') opts.clean = true;
  else if (a === '--low') opts.params.quality = 'low';
  else if (a === '--sheet') opts.sheet = true;
  else if (a === '--steps') {
    for (const line of readFileSync(value(), 'utf8').split('\n')) {
      const s = line.trim();
      if (s && !s.startsWith('#')) steps.push(s);
    }
  } else if (a === '--dump') opts.dump = JSON.parse(readFileSync(value(), 'utf8'));
  else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
  else steps.push(a);
}
if (opts.dump) {
  const { state, device, url: dumpUrl } = opts.dump;
  if (!state) throw new Error(`The dump has no game state (${opts.dump.stateError ?? 'unknown why'})`);
  if (state.seed !== null) opts.params.seed ??= state.seed;
  opts.params.star ??= String(state.star);
  if (new URL(dumpUrl).searchParams.get('quality') === 'low') opts.params.quality = 'low';
  if (device.touch) opts.phone = true;
  if (!args.includes('--size')) opts.size = device.viewport.join('x');
  steps.unshift('restore');
}
if (steps.length === (opts.dump ? 1 : 0)) steps.push(opts.dump ? 'shot:restored' : 'shot:view');

if (opts.phone && !args.includes('--size') && !opts.dump) opts.size = '390x844';
const [width, height] = opts.size.split('x').map(Number);
const page_ = opts.stars
  ? `stars.html${opts.starsQuery ? `?${opts.starsQuery.replace(/^\?/, '')}` : ''}`
  : opts.plants
  ? `plants.html${opts.plantsQuery ? `?${opts.plantsQuery.replace(/^\?/, '')}` : ''}`
  : opts.lab
    ? `lab.html${opts.labQuery ? `?${opts.labQuery.replace(/^\?/, '')}` : ''}`
    : '';
const url = new URL(page_, opts.url);
for (const [k, v] of Object.entries(opts.params)) url.searchParams.set(k, v);
/** True once the page's game (or the lab) is running. */
const STARTED = `typeof window.lab !== 'undefined' || typeof window.plantLab !== 'undefined' || typeof window.starLab !== 'undefined' || (typeof window.levels !== 'undefined' && typeof window.ship !== 'undefined')`;
/** True when nothing is changing: no level transition in the game, the latest edit built and drawn in the lab. */
const SETTLED = `typeof window.starLab !== 'undefined' ? starLab.ready : typeof window.plantLab !== 'undefined' ? plantLab.ready : typeof window.lab !== 'undefined' ? lab.ready : !levels.transitioning`;
const out = resolve(opts.out ?? mkdtempSync(join(tmpdir(), 'spore2-shots-')));
mkdirSync(out, { recursive: true });

if (!(await fetch(url).then((r) => r.ok, () => false))) {
  console.error(`Nothing at ${url.origin}: start the dev server first (npm run dev -- --strictPort)`);
  process.exit(1);
}

const page = await launch({ width, height });
if (opts.phone) {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
const shots = [];
const results = [];
let last = null;
/** Where a `press` step holds the mouse (or finger) down, until `release`. */
let pressed = null;
let failure = null;

const HIDE_DEBUG = `(() => { const s = document.createElement('style');
  s.textContent = '.lil-gui.lil-auto-place, #stats { display: none !important; }'; document.head.appendChild(s); })()`;

/** Loads `href` and waits until the game is running (a few frames drawn). */
async function load(href) {
  if (!(await page.goto(href, STARTED, 30000))) {
    throw new Error(`The game didn't start at ${href}`);
  }
  if (opts.clean) await page.evaluate(HIDE_DEBUG);
  await settle();
}

/** Waits until no transition runs, then for a few frames (so shaders are compiled and the view is drawn). */
async function settle() {
  if (!(await page.waitFor(SETTLED, 30000))) throw new Error('A level transition (or lab build) never finished');
  await page.evaluate(`new Promise((r) => { let n = 0; (function f() { if (++n > 3) r(); else requestAnimationFrame(f); })(); })`);
}

function save(name, png) {
  const path = join(out, `${name}.png`);
  writeFileSync(path, png);
  shots.push({ name, path });
  return path;
}

/** Runs an image job on a canvas in the page (no image libraries needed on this side); returns a PNG. */
async function canvasJob(fn, images, arg) {
  const data = images.map((b) => `data:image/png;base64,${b.toString('base64')}`);
  const url = await page.evaluate(`(async () => {
    const images = await Promise.all(${JSON.stringify(data)}.map((src) => new Promise((ok, fail) => {
      const img = new Image(); img.onload = () => ok(img); img.onerror = fail; img.src = src; })));
    const canvas = document.createElement('canvas');
    (${fn})(canvas, images, ${JSON.stringify(arg)});
    return canvas.toDataURL('image/png');
  })()`);
  return Buffer.from(url.split(',')[1], 'base64');
}

const cropJob = (canvas, [img], { x, y, w, h, zoom }) => {
  canvas.width = w * zoom;
  canvas.height = h * zoom;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, w, h, 0, 0, w * zoom, h * zoom);
};

const sheetJob = (canvas, images, { names, tile }) => {
  const cols = Math.min(3, images.length);
  const th = Math.round((images[0].height / images[0].width) * tile);
  canvas.width = tile * cols;
  canvas.height = th * Math.ceil(images.length / cols);
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 18px sans-serif';
  images.forEach((img, i) => {
    const x = (i % cols) * tile, y = Math.floor(i / cols) * th;
    // Fit each image (crops may have other shapes) into its tile.
    const fit = Math.min(tile / img.width, th / img.height);
    ctx.drawImage(img, x, y, img.width * fit, img.height * fit);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x, y, ctx.measureText(names[i]).width + 16, 28);
    ctx.fillStyle = '#ffec70';
    ctx.fillText(names[i], x + 8, y + 20);
    ctx.strokeStyle = '#444';
    ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, th - 1);
  });
};

async function run(step) {
  const colon = step.indexOf(':');
  const [kind, rest] = colon < 0 ? [step, ''] : [step.slice(0, colon), step.slice(colon + 1)];
  switch (kind) {
    case 'shot': {
      last = await page.screenshot();
      save(rest || `shot-${shots.length + 1}`, last);
      return;
    }
    case 'crop': {
      if (!last) throw new Error('crop needs a screenshot first');
      const [name, box, zoom = '2'] = rest.split(':');
      const [x, y, w, h] = box.split(',').map(Number);
      save(name, await canvasJob(cropJob.toString(), [last], { x, y, w, h, zoom: Number(zoom) }));
      return;
    }
    case 'wait':
      return sleep(Number(rest));
    case 'js':
      results.push({ step, value: await page.evaluate(rest) });
      return;
    case 'until': {
      const at = rest.lastIndexOf('@');
      const timed = at > 0 && /^\d+$/.test(rest.slice(at + 1));
      const expr = timed ? rest.slice(0, at) : rest;
      if (!(await page.waitFor(expr, timed ? Number(rest.slice(at + 1)) : 20000))) throw new Error('timed out');
      return;
    }
    case 'settle':
      return settle();
    case 'galaxy':
    case 'system':
      await page.evaluate(kind === 'galaxy' ? 'levels.toGalaxy()' : 'levels.toSystem()');
      if (!(await page.waitFor(`levels.mode === '${kind}'`, 30000))) throw new Error(`Didn't reach the ${kind}`);
      return settle();
    case 'freeze': {
      await page.evaluate(`window.__shotFrozen = false; game.afterFrame = () => {
        let hit = false; try { hit = !!(${rest}); } catch {}
        if (hit) { game.stop(); game.afterFrame = null; window.__shotFrozen = true; } }`);
      if (!(await page.waitFor(`window.__shotFrozen`, 30000))) throw new Error('the expression never became true');
      return;
    }
    case 'solo': {
      const [side, name] = rest.split(':');
      if (side !== 'outgoing' && side !== 'incoming') throw new Error('solo takes outgoing or incoming');
      if (!(await page.evaluate(`levels.crossfade !== null`))) throw new Error('no crossfade is running (freeze mid-handover first)');
      await page.evaluate(`game.crossfadeSolo = '${side}'; game.redraw(); game.crossfadeSolo = null`);
      last = await page.screenshot();
      save(name || side, last);
      await page.evaluate(`game.redraw()`);
      return;
    }
    case 'resume':
      await page.evaluate(`game.afterFrame = null; game.start()`);
      return;
    case 'tap': {
      const at = await page.evaluate(`(() => { const e = document.getElementById(${JSON.stringify(rest)}); if (!e) return null;
        const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!at) throw new Error(`no element #${rest}`);
      if (opts.phone) {
        await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...at, id: 0 }] });
        await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        for (const type of ['mousePressed', 'mouseReleased']) {
          await page.send('Input.dispatchMouseEvent', { type, ...at, button: 'left', clickCount: 1 });
        }
      }
      await page.evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      return;
    }
    case 'hover': {
      const xy = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(rest);
      const at = xy ? { x: Number(xy[1]), y: Number(xy[2]) } : await page.evaluate(rest);
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) throw new Error(`no point to hover: ${JSON.stringify(at)}`);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
      await page.evaluate(`new Promise((r) => { let n = 0; (function f() { if (++n === 4) r(); else requestAnimationFrame(f); })(); })`);
      return;
    }
    case 'press': {
      const xy = /^\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*$/.exec(rest);
      const at = xy ? { x: Number(xy[1]), y: Number(xy[2]) } : await page.evaluate(rest);
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) throw new Error(`no point to press: ${JSON.stringify(at)}`);
      pressed = at;
      if (opts.phone) {
        // Emulated touch sometimes keeps a finger down (from the page's own start-up); end it, or the new one is ignored.
        await page.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
        await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...at, id: 0 }] });
      } else {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
        await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', buttons: 1, clickCount: 1 });
      }
      await page.evaluate(`new Promise((r) => { let n = 0; (function f() { if (++n === 4) r(); else requestAnimationFrame(f); })(); })`);
      return;
    }
    case 'release': {
      const at = pressed ?? { x: 0, y: 0 };
      pressed = null;
      if (opts.phone) await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', buttons: 0, clickCount: 1 });
      await page.evaluate(`new Promise((r) => { let n = 0; (function f() { if (++n === 4) r(); else requestAnimationFrame(f); })(); })`);
      return;
    }
    case 'fps':
      results.push({
        step,
        value: await page.evaluate(`new Promise((r) => { let n = 0; const t0 = performance.now();
          (function f() { if (++n === 120) r(Math.round(120000 / (performance.now() - t0))); else requestAnimationFrame(f); })(); })`),
      });
      return;
    case 'restore':
      results.push({ step, value: await page.evaluate(`debugDump.restore(${JSON.stringify(opts.dump.state)})`, 300000) });
      return;
    case 'goto': {
      const next = new URL(rest, url);
      if (opts.params.quality) next.searchParams.set('quality', opts.params.quality);
      return load(next.href);
    }
    default:
      throw new Error(`Unknown step "${step}"`);
  }
}

try {
  await load(url.href);
  for (const step of steps) {
    try {
      await run(step);
    } catch (err) {
      failure = `${step}: ${err instanceof Error ? err.message : String(err)}`;
      // Show what was on screen when it went wrong.
      save('failure', await page.screenshot());
      break;
    }
  }
  if (opts.sheet && shots.length > 0) {
    const images = shots.map((s) => readFileSync(s.path));
    const png = await canvasJob(sheetJob.toString(), images, { names: shots.map((s) => s.name), tile: 640 });
    writeFileSync(join(out, 'sheet.png'), png);
    shots.push({ name: 'sheet', path: join(out, 'sheet.png') });
  }
} catch (err) {
  failure = err instanceof Error ? err.message : String(err);
} finally {
  await page.close();
}

const ok = !failure;
console.log(JSON.stringify({ ok, failure: failure ?? undefined, out, shots, results, errors: page.errors }, null, 2));
process.exit(ok ? 0 : 1);
