// Headless browser smoke test over the Chrome DevTools Protocol.
// Usage: npm run smoke [-- [options] [http://localhost:5173/]]   (dev server must be running)
//   --only <sections>  run just these, comma-separated, in the usual order: core (flying, picking, system map,
//                      living stars, comets, sky), galaxy (the galaxy loop), nebulas (every kind on the map
//                      and from inside), rogues (fly to a rogue planet and down to it), dust (a young star's disc,
//                      a debris disc, comet dust trails, meteor showers and impact flashes in low orbit), audio, planet (the home planet
//                      loop, held zoom, seamless zooms), types (every planet type and geyser kind), lab, plants
//                      (the plant lab), touch
//   --quick            everything but types
//   --timeout <s>      give up after this long (default 900), reporting the section it was in
//   --full-quality     render as players see it (default: ?quality=low, half resolution without antialiasing,
//                      about 5x the frame rate under SwiftShader)
// Each section prints its time and result on stderr as it finishes. A page that stops answering (SwiftShader can
// block it for minutes) fails the run at once, naming the step, instead of hanging.
// Checks: the ship starts hovering above the star and there's no manual flying (W and a click on empty space leave
// it there), hovering + clicking the star targets it, the system map shows every planet and moon (hover, click to
// fly, N folds it), and the galaxy loop works (scroll out to the galaxy, click the nearest star, travel, scroll in to
// its system, where the ship flies in and hovers straight above the star with the camera over it; the galaxy shows distant
// galaxies, twinkles, spins and draws binaries as two dots, and picking works while it's turned), a real click on the
// menu button starts audio and opens the menu (the game pauses; volume sliders and a planet lab link; its Save debug
// dump opens the dump dialog, where typing a note doesn't reach the game and Save makes the JSON file with the
// pictures and state, and Esc closes just the dialog; a real Esc closes the menu); then galaxy travel asks for its sound (and the zooms between levels for none), and M mutes. Then the planet loop (hover at
// a planet, scroll in to low orbit, click the globe and fly, the Equal Earth map is shown and a click on it sets the
// autopilot there, scroll all the way in and out and check the ship's altitude follows, scroll back out to hover
// above it, as high as the zoom says, with the camera zoomed out past the handover and the planet in view), and again for every planet
// type, a ringed rocky/icy/lava world and a moon in other systems (skip those with --quick). The system sky has
// the galaxy band (screenshot looking at the galactic centre) and a smoke trail per planet and moon. Living stars: the
// surface clock advances and storms have particles under way (and keep animating in the planet level's sky); comets
// move, their nuclei are bodies, and hovering one shows its name and a click flies there. The sky's stars are the
// galaxy's own (hundreds of them, none of the old random starfield). Comets: the planet section also visits the home system's first comet at its
// closest pass (the planet loop over its irregular nucleus), with jets, coma and tails on, then jumps the clock to its
// farthest point, where they're off. Asteroid belts: the core section checks the home belt's rocks (meshes near the ship),
// that hovering the belt names it and a click flies to its nearest named asteroid, and the system map shows its asteroids;
// the planet section visits a named asteroid and a contact binary (the full planet loop), with belt rocks in the sky.
// Living lava: in low orbit over the lava world, the eruptions have vents, events and blobs in the air.
// Geysers: every body in the planet loop has the geyser kind its climate says (or none), with vents, eruptions and
// particles in the air while one erupts; the loop also visits a body with each kind (steam, cryo planet and moon, sulphur).
// Plants: bodies of tier 1 and up have plants around the ship (none on tier 0 or gas giants), hovering one shows it in the
// tooltip, the menu's Plants button turns them off and on, and a removed plant stays in the change list.
// Weather: every body in the planet loop has the weather its climate says (or none), as clouds in the system view and
// low orbit, with storms and flashes coming and going over time; the loop also visits an acid-deck (Venus-like, with
// volcanic lightning), a methane (Titan-like) and a dusty (Mars-like) world. The menu's Weather toggle switches it.
// Seamless zooms: through the galaxy and planet loops, every frame of every level transition records the crossfade
// weight and canvas brightness; each transition must crossfade and never go black (screenshots mid-handover).
// Touch: on an emulated phone, hold/tap/drag/pinch and Boost work (no stick in space, the stick in low orbit), down to a planet and out;
// the full-screen button shows, and the Map button opens the system map (in space) and the planet map (in low
// orbit), a tap on either flies there, × closes it; the menu button opens the menu. The planet lab works on the
// phone too (stick, Map button, drag, tap to fly).
// Nebulas: the galaxy map draws every nebula and dims its stars behind dark ones; hovering one names it and clicking it
// sets course for its star; then a system inside each kind (emission, reflection, dark, planetary, remnant) is entered
// from the galaxy: its HUD names the nebula, its sky is baked (glowing kinds add light, a dark one blocks it) and
// hiding that sky changes the picture, also in low orbit inside the emission nebula; FPS in each.
// Rogue planets: the galaxy map draws every rogue; hovering one names it as a rogue planet and clicking it flies
// there; scrolled into, its "system" has no star but the galactic light, the HUD and URL say where it is, the ship
// hovers above it and it isn't pitch black (system view and low orbit); the planet loop runs over it (no plants, no
// star in the sky) and every zoom on the way crossfades and never goes black; FPS in its system.
// Dust: a young star (a handful in the galaxy, most in nebulas) has a protoplanetary disc with its forming planets in its
// gaps, named by the HUD and the galaxy map's tooltip; the disc lights the system view and, down at a forming planet,
// low orbit's sky (hiding it changes both); the zooms crossfade. A debris disc and comet dust trails draw. In the home
// system a planet crossing a comet's stream gets meteors at the shower's peak (and the HUD says so), and an airless moon
// of it impact flashes.
// Planet lab (lab.html): every type, a moon, a comet and an asteroid build and draw in both views, a game planet, a game comet
// and a game asteroid load, the panel works.
// Plant lab (plants.html): every architecture grows and draws at every level of detail, each level cheaper than the
// last, zooming out on one plant goes through the levels (the game's crossfade) and past the last one, the line-up and
// the grove (the game's own plant system) draw, a game planet's plants load, the planet lab links to its plants.
// Prints JSON with FPS, console errors and screenshot paths. Exit 1 on failure.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, sleep, StallError } from './lib/browser.mjs';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const SECTIONS = ['core', 'galaxy', 'nebulas', 'rogues', 'dust', 'audio', 'planet', 'types', 'lab', 'plants', 'touch'];
const only = option('--only')?.split(',');
if (only?.some((name) => !SECTIONS.includes(name))) {
  console.error(`--only takes some of: ${SECTIONS.join(', ')}`);
  process.exit(2);
}
const quick = args.includes('--quick');
const runs = (name) => (only ? only.includes(name) : name !== 'types' || !quick);
const deadline = Number(option('--timeout') ?? 900);
const gameUrl = new URL(args.find((a, i) => !a.startsWith('--') && !['--only', '--timeout'].includes(args[i - 1])) ?? 'http://localhost:5173/');
if (!args.includes('--full-quality') && !gameUrl.searchParams.has('quality')) gameUrl.searchParams.set('quality', 'low');
const url = gameUrl.href;
/** Another page of the game (e.g. lab.html?gen=3) at the same render quality. */
const pageUrl = (path) => {
  const u = new URL(path, url);
  if (gameUrl.searchParams.has('quality')) u.searchParams.set('quality', gameUrl.searchParams.get('quality'));
  return u.href;
};
if (!(await fetch(url).then((r) => r.ok, () => false))) {
  console.error(`Nothing at ${gameUrl.origin}: start the dev server first (npm run dev -- --strictPort)`);
  process.exit(1);
}

const outDir = mkdtempSync(join(tmpdir(), 'spore2-smoke-'));
// A fresh browser and profile every run (so no saved volume or mute carries over), at 1280x720.
const page = await launch({ width: 1280, height: 720 });
const { send, errors } = page;
// Only throws if the page stops answering: a failed expression reads as undefined and fails the checks that use it.
const evaluate = page.tryEvaluate;
/** Polls `expression` until it's truthy, for at most `ms`; returns whether it got there. */
const until = (expression, ms) => page.waitFor(expression, ms);
/** Waits for `n` frames to be drawn. */
const drawFrames = (n) => evaluate(`new Promise((r) => { let n = 0; (function f() { if (++n > ${n}) r(); else requestAnimationFrame(f); })(); })`);
/** True once the game has loaded and no level transition runs. */
const READY = `typeof window.levels !== 'undefined' && typeof window.ship !== 'undefined' && !levels.transitioning`;

const T0 = Date.now();
const sections = {};
let current = 'loading';
const report = () => ({ ok: false, sections, seconds: Math.round((Date.now() - T0) / 1000), errors });
const timer = setTimeout(() => {
  console.error(`[smoke] gave up after ${deadline} s, in ${current}`);
  console.log(JSON.stringify({ ...report(), timedOut: current }, null, 2));
  process.exit(1);
}, deadline * 1000);

// Let the first frames draw (shader compiles, the sky's one-off bake) before timing anything.
const started = await page.goto(url, READY, 60000);
if (started) await drawFrames(20);
/** The system the game starts in (the URL's, or the galaxy's home system); sections may leave it elsewhere. */
const startId = started ? await evaluate(`system.id`) : null;

const state = `({ speed: +ship.speed.toFixed(1), pos: ship.object.position.toArray().map((n) => +n.toFixed(1)) })`;
let before, after, autopilot, pick, systemMap, sky, living, comet, belt, galaxyLoop, fps, audio, planetLoop, heldZoom, cometLoop, asteroidLoops, seamless, nebulas, rogues, dust;
const planetTypes = [];
let lab = null;
let plantLab = null;
let touch = null;
let touchLab = null;

/**
 * Runs section `name` (if it was asked for) and records whether it passed and how long it took. A page that
 * stops answering skips everything after it: the browser is stuck.
 */
let stalled = null;
async function section(name, run) {
  if (!runs(name) || stalled || !started) return;
  current = name;
  const t0 = Date.now();
  const s = (sections[name] = { ok: false });
  try {
    s.ok = !!(await run());
  } catch (e) {
    s.error = e.message;
    if (e instanceof StallError) stalled = `${name}: ${e.message}`;
  }
  s.seconds = +((Date.now() - t0) / 1000).toFixed(1);
  console.error(`[smoke] ${name}: ${s.ok ? 'ok' : 'FAILED'} in ${s.seconds} s${s.error ? ` (${s.error})` : ''}`);
}
const wheel = (deltaY) =>
  evaluate(`game.renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaY: ${deltaY}, bubbles: true, cancelable: true }))`);

/**
 * Waits for the game to freeze mid-handover (see __seamless.freezeWhen), screenshots it as `<name>.png` and resumes.
 * Returns the screenshot's path, or null if it never froze.
 */
async function freezeShot(name) {
  for (let i = 0; i < 80 && !(await evaluate(`__seamless.frozen`)); i++) await sleep(100);
  if (!(await evaluate(`__seamless.frozen`))) return null;
  const path = join(outDir, `${name}.png`);
  writeFileSync(path, await page.screenshot());
  await evaluate(`__seamless.frozen = false, game.start()`);
  return path;
}

/**
 * Parks the system ship beside the body `bodyExpr` evaluates to, scrolls in to its planet level, clicks the
 * globe a little way ahead of the ship, lets it fly, then scrolls back out. Returns what it saw.
 */
async function runPlanetLoop(bodyExpr, shotName, handoverShot = null, during = null) {
  // Input is blocked during a level transition (slow under SwiftShader), which would swallow the wheel below.
  for (let i = 0; i < 40 && (await evaluate(`levels.transitioning`)); i++) await sleep(250);
  const r = await evaluate(`(() => {
    const body = ${bodyExpr};
    window.__body = body;
    ship.parkAt(body);
    return { name: body.name, type: body.config.type, moon: body.parent !== null };
  })()`);
  await sleep(300);
  await wheel(-50000); // to min zoom
  // Keep scrolling only once the camera has (almost) got there, or the extra scroll doesn't count as past it.
  await until(`(() => { const o = levels.systemLevel.orbit;
    return o.targetDistance <= o.params.minDistance && o.zoom < o.params.minDistance * 1.2; })()`, 10000);
  if (handoverShot) await evaluate(`__seamless.freezeWhen = 'planet'`);
  const soundBefore = await evaluate(`audio.lastPlayed?.name ?? null`);
  await wheel(-300); // keep scrolling in
  if (handoverShot) r.handoverShot = await freezeShot(handoverShot);
  // Right after a page load the headless frame rate can be ~2 FPS, and a click while the zoom still runs is ignored.
  for (let i = 0; i < 40 && (await evaluate(`levels.mode !== 'planet' || levels.transitioning`)); i++) await sleep(250);
  r.mode = await evaluate(`levels.mode`);
  r.soundIn = await evaluate(`audio.lastPlayed?.name ?? null`);
  // An airless body's descent asks for nothing, leaving the cue from before it.
  r.soundBefore = soundBefore;
  if (r.mode !== 'planet') return r;
  r.sky = await evaluate(`planet.skyStats`);
  // The sky star's clock and the planet level's own clock (its time is the system time down here).
  // (A rogue planet has no star: its sky's clock is the level's own.)
  const skyTime = `[world.stars[0]?.storms.shownTime ?? planet.time, planet.time]`;
  const skyBefore = await evaluate(skyTime);
  r.expectedSky = await evaluate(`({ bodies: world.planets.length + world.moons.length + world.nuclei.length + world.asteroids.length - 1 - world.moons.filter((m) => m.parent === __body).length })`);

  // Click the globe ~20° ahead of the ship, towards the top of the screen.
  r.click = await evaluate(`new Promise((resolve) => {
    const V = game.camera.position.constructor;
    const u = planet.ship.direction.clone();
    const up = new V(0, 1, 0).applyQuaternion(game.camera.quaternion);
    const t = up.sub(u.clone().multiplyScalar(up.dot(u))).normalize();
    const ahead = u.clone().multiplyScalar(Math.cos(0.35)).add(t.multiplyScalar(Math.sin(0.35)));
    // On the ground as drawn (a comet's nucleus is lumpy, nowhere near its bounding sphere).
    const point = ahead.multiplyScalar(planet.groundRadius(ahead));
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
  // Until it has flown a few degrees and a little game time has passed.
  await until(`planet.ship.direction.angleTo(__start) * 180 / Math.PI > 4 && ${skyTime}[1] - ${JSON.stringify(skyBefore?.[1] ?? 0)} > 0.6`, 10000);
  // The sky's star keeps living, and its clock follows the planet level's (compared with that clock, not the
  // wall clock: at headless frame rates game time runs slower than real time).
  const skyAfter = await evaluate(skyTime);
  r.skyStarTime = +(skyAfter[0] - skyBefore[0]).toFixed(2);
  r.skyClock = +(skyAfter[1] - skyBefore[1]).toFixed(2);
  r.flewDegrees = await evaluate(`+(planet.ship.direction.angleTo(__start) * 180 / Math.PI).toFixed(1)`);
  r.altitudeOk = await evaluate(`Math.abs(planet.ship.object.position.length() - planet.ship.radius) < 0.5`);
  // The zoom sets the altitude: all the way in skims the peaks, all the way out climbs to high orbit. Waits for the
  // camera to get there and the ship to follow (at headless frame rates the game runs slower than real time).
  const altitude = `+(planet.ship.object.position.length() - planet.radius).toFixed(1)`;
  // First the wheel must have been read (it waits for the next frame: a screenshot capture can stall the page for a
  // while), so the camera's target is at the limit; then the camera and the ship have to get there.
  const settle = async (limit) => {
    const settled = `planet.orbit.targetDistance === planet.orbit.params.${limit} &&
      Math.abs(planet.orbit.zoom - planet.orbit.targetDistance) < 0.5 &&
      Math.abs(planet.ship.radius - planet.ship.goalRadius) < 0.5`;
    for (let i = 0; i < 60 && !(await evaluate(settled)); i++) await sleep(250);
  };
  await wheel(-50000);
  await settle('minDistance');
  r.altitude = { low: await evaluate(altitude) };
  // Zoomed in, the UFO keeps its clearance over the ground beneath it (about 3 units, a bit more when it climbs ahead of a slope).
  r.clearance = await evaluate(`planet.ship.clearance`);
  r.lava = await evaluate(
    `planet.eruptions && { vents: planet.eruptions.activity.vents.length, events: planet.eruptions.events.length, blobs: planet.eruptions.liveBlobs }`,
  );
  // The body's geysers (if its climate gives it any): vents, eruptions under way and particles in the air.
  r.geysers = await evaluate(
    `planet.geysers && { kind: planet.geysers.activity.kind, vents: planet.geysers.activity.vents.length, events: planet.geysers.events.length,
      erupting: planet.geysers.events.filter((e) => e.start <= planet.frame.renderTime && planet.frame.renderTime < e.start + e.duration).length,
      particles: planet.geysers.liveParticles, capacity: planet.geysers.capacity }`,
  );
  r.expectedGeysers = await evaluate(`geyserKind(__body.config.type, __body.config.climate)`);
  // The body's weather (if its climate gives it any): the same look in the system view and here, storms coming and
  // going and lightning where it should be, over a stretch of the level's clock.
  r.expectedWeather = await evaluate(`({ kind: weatherKind(__body.config.type, __body.config.climate), volcanic: volcanicLightning(__body.config.type, __body.config.climate) })`);
  r.weather = await evaluate(`planet.weather && new Promise((resolve) => {
    const look = planet.weather.look;
    const start = planet.frame.renderTime, wall = performance.now();
    let storms = 0, flashes = 0, shafts = 0;
    const clouds = planet.scene.getObjectByName('Clouds');
    (function f() {
      storms = Math.max(storms, look.shown.length);
      flashes = Math.max(flashes, look.flashCount);
      shafts = Math.max(shafts, planet.weather.shaftCount);
      // 4 s of the level's clock (bounded in wall time, should the clock stall).
      if (planet.frame.renderTime - start < 4 && performance.now() - wall < 20000) return requestAnimationFrame(f);
      resolve({ kind: look.data.kind, volcanic: look.data.volcanic, lightning: look.data.storms.some((s) => s.lightning > 0) || look.data.backgroundLightning > 0,
        storms, flashes, shafts, clouds: !!clouds && clouds.visible, systemView: !!__body.weather && __body.weather.data.kind === look.data.kind,
        cloudRadius: +(look.data.cloudRadius / look.data.radius).toFixed(3) });
    })();
  })`);
  // Plants: bodies of tier 1 and up (not gas giants) have them, standing around the ship; tier 0 has none. The menu's
  // Plants button turns them off (and back on), and what is left is gone for good once removed.
  r.expectedPlants = await evaluate(`!!__body.config.climate && __body.config.climate.habitability > 0 && !__body.config.bands`);
  if (r.expectedPlants) {
    for (let i = 0; i < 80 && !(await evaluate(`planet.plants && planet.plants.settled && planet.plants.stats().cells > 0`)); i++) await sleep(250);
    r.plants = await evaluate(`planet.plants && { tier: planet.plants.plan.tier, species: planet.plants.plan.species.length, ...planet.plants.stats() }`);
    r.plants.tierOk = await evaluate(`planet.plants.plan.tier === __body.config.climate.habitability`);
    // Hovering a plant shows it in the tooltip (the nearest plant in view, if any is).
    const hover = () => evaluate(`new Promise((resolve) => {
      const P = planet.plants;
      const cam = game.camera;
      const V = cam.position.constructor;
      const candidates = [...P.cells.values()].flatMap((c) => c.plants).map((p) => {
        const s = P.plan.species[p.species];
        const v = new V(p.x, p.y, p.z).multiplyScalar(p.radius + s.height * p.scale * 0.5);
        return { s, d: v.distanceTo(cam.position), n: v.clone().project(cam) };
      }).filter((c) => Math.abs(c.n.x) < 0.8 && Math.abs(c.n.y) < 0.8 && c.n.z < 1 && c.d < 150).sort((a, b) => a.d - b.d);
      if (!candidates.length) return resolve({ skipped: true });
      const c = candidates[0];
      const rect = game.renderer.domElement.getBoundingClientRect();
      const at = { clientX: rect.left + ((c.n.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - c.n.y) / 2) * rect.height, bubbles: true };
      game.renderer.domElement.dispatchEvent(new PointerEvent('pointermove', at));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const name = document.getElementById('tooltip-name').textContent;
        resolve({ shown: !document.getElementById('tooltip').hidden, name, known: P.plan.species.some((s) => s.name === name) });
      }));
    })`);
    r.plants.tooltip = await hover();
    if (r.plants.tooltip.skipped && r.plants.plants > 0) {
      // Over the sea, or land too far off: hover above the first loaded plant and try again.
      await evaluate(`(() => { const p = [...planet.plants.cells.values()].flatMap((c) => c.plants)[0]; if (p) planet.ship.placeAt(new (planet.ship.direction.constructor)(p.x, p.y, p.z)); })()`);
      await sleep(1500);
      for (let i = 0; i < 80 && !(await evaluate(`planet.plants.settled`)); i++) await sleep(250);
      r.plants.tooltip = await hover();
    }
    if (handoverShot) {
      const toggle = async (want) => {
        await evaluate(`document.getElementById('graphics-plants').click()`);
        for (let i = 0; i < 80 && !(await evaluate(want)); i++) await sleep(250);
        return evaluate(want);
      };
      const off = await toggle(`planet.plants.stats().cells === 0 && !planet.plants.object.visible`);
      const on = await toggle(`planet.plants.stats().cells > 0 && planet.plants.settled && planet.plants.object.visible`);
      // Removing a plant is recorded in the change list, which lives on after the planet level.
      r.plants.switch = { off, on };
      const removal = await evaluate(`(() => {
        const cells = planet.plants.cells;
        const plant = [...cells.values()].flatMap((c) => c.plants)[0];
        if (!plant) return { skipped: true };
        const before = planet.plants.stats().plants;
        const removed = planet.plants.remove(plant.id);
        return { removed, recorded: planet.plants.isRemoved(plant.id), before, id: plant.id };
      })()`);
      r.plants.removal = { ...(removal ?? { failed: true }), after: await evaluate(`(() => { planet.plants.update(); return planet.plants.stats().plants; })()`) };
    }
  } else {
    r.plants = { none: await evaluate(`planet.plants === null`) };
  }
  // The Equal Earth map: shown and baked; clicking it sends the autopilot to that point of the globe.
  for (let i = 0; i < 40 && !(await evaluate(`planet.map.baked`)); i++) await sleep(250);
  r.map = await evaluate(`new Promise((resolve) => {
    const canvas = document.getElementById('planet-map-marks');
    const rect = canvas.getBoundingClientRect();
    const V = game.camera.position.constructor;
    const want = planet.ship.direction.clone().applyAxisAngle(new V(0, 1, 0), 1).applyAxisAngle(new V(1, 0, 0), 0.2);
    const p = planet.map.mapPosition(want);
    // Degrees per pixel of the map around that point, east-west and north-south (Equal Earth squeezes both away
    // from the equator), for the coarser of the two.
    const east = new V(0, 1, 0).cross(want).normalize();
    const north = want.clone().cross(east);
    const step = 0.01;
    const pixels = (axis) => {
      const q = planet.map.mapPosition(want.clone().applyAxisAngle(axis, step));
      return Math.hypot(q.x - p.x, q.y - p.y);
    };
    const localDegrees = (step * 180) / Math.PI / Math.min(pixels(north), pixels(east));
    const at = { clientX: rect.left + p.x, clientY: rect.top + p.y, button: 0, bubbles: true };
    canvas.dispatchEvent(new MouseEvent('click', at));
    requestAnimationFrame(() => requestAnimationFrame(() => resolve({
      visible: planet.map.visible && !document.getElementById('planet-map').hidden && rect.width > 100,
      baked: planet.map.baked,
      enRoute: planet.ship.enRoute,
      targetDegrees: +(planet.ship.destination.angleTo(want) * 180 / Math.PI).toFixed(2),
      // Click coordinates are whole pixels, so the target is within a pixel or so of the point.
      pixelDegrees: +Math.max(360 / rect.width, localDegrees).toFixed(2),
    })));
  })`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  r.screenshot = join(outDir, `${shotName}.png`);
  writeFileSync(r.screenshot, Buffer.from(shot.result.data, 'base64'));
  // Checks of the caller's own while down there (e.g. a comet's jets).
  if (during) r.during = await during();

  await wheel(50000); // to max zoom
  await settle('maxDistance');
  r.altitude.high = await evaluate(altitude);
  await wheel(300); // keep scrolling out
  for (let i = 0; i < 20 && (await evaluate(`levels.mode !== 'system' || levels.transitioning`)); i++) await sleep(250);
  r.modeAfter = await evaluate(`levels.mode`);
  r.soundOut = await evaluate(`audio.lastPlayed?.name ?? null`);
  r.parkedAt = await evaluate(`ship.targetBody?.name ?? null`);
  // Hovering above the body, as far out as the system camera's zoom puts it, with the camera zoomed out past the
  // handover (the zoom never turned back in) and the planet in view.
  r.standoffs = await evaluate(`+(ship.object.position.distanceTo(__body.renderPosition) / ship.parkDistance(__body)).toFixed(2)`);
  r.hover = await evaluate(`(() => {
    const d = ship.object.position.clone().sub(__body.renderPosition);
    const p = __body.renderPosition.clone().project(game.camera);
    return {
      degreesAbove: +(Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180 / Math.PI).toFixed(1),
      zoom: +levels.systemLevel.orbit.zoom.toFixed(1),
      bodyInView: Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1,
    };
  })()`);
  r.ok =
    r.mode === 'planet' &&
    r.sky.bodies === r.expectedSky.bodies &&
    r.click.onScreen &&
    r.click.enRoute &&
    r.flewDegrees > 3 &&
    r.skyClock > 0.3 &&
    Math.abs(r.skyStarTime - r.skyClock) < 0.25 &&
    r.altitudeOk &&
    r.clearance >= 1 &&
    r.clearance < 15 &&
    r.altitude.high > r.altitude.low + 20 &&
    r.map.visible &&
    r.map.baked &&
    r.map.enRoute &&
    r.map.targetDegrees < 1.5 * r.map.pixelDegrees &&
    (r.type !== 'lava' || (r.lava && r.lava.vents > 0 && r.lava.events > 0 && r.lava.blobs > 0)) &&
    (r.expectedGeysers ?? null) === (r.geysers?.kind ?? null) &&
    (!r.geysers || (r.geysers.vents > 0 && r.geysers.events > 0 && (r.geysers.erupting === 0 || r.geysers.particles > 0))) &&
    (r.expectedPlants
      ? r.plants.tierOk &&
        r.plants.cells > 0 &&
        (r.plants.tooltip.skipped ? r.type !== 'terran' : r.plants.tooltip.shown && r.plants.tooltip.known) &&
        (r.type !== 'terran' || (r.plants.plants > 50 && r.plants.drawCalls > 0)) &&
        (!handoverShot ||
          (r.plants.switch.off &&
            r.plants.switch.on &&
            (r.plants.removal.skipped || (r.plants.removal.removed && r.plants.removal.recorded && r.plants.removal.after === r.plants.removal.before - 1))))
      : r.plants.none) &&
    !!r.weather === (r.expectedWeather.kind !== null || r.expectedWeather.volcanic) &&
    (!r.weather ||
      ((r.expectedWeather.kind === null || r.weather.kind === r.expectedWeather.kind) &&
        r.weather.volcanic === r.expectedWeather.volcanic &&
        r.weather.clouds &&
        r.weather.systemView &&
        r.weather.cloudRadius > 1)) &&
    r.modeAfter === 'system' &&
    r.parkedAt === r.name &&
    Math.abs(r.standoffs - 1) < 0.2 &&
    r.hover.degreesAbove > 80 &&
    r.hover.zoom > 85 &&
    r.hover.bodyInView;
  return r;
}
const measureFps = `new Promise((r) => { let n = 0; const t0 = performance.now();
  (function f() { if (++n === 120) r(Math.round(120000 / (performance.now() - t0))); else requestAnimationFrame(f); })(); })`;
await section('core', async () => {
  // The ship starts out hovering above the star. There's no manual flying: holding W and clicking empty space
  // leave it there.
  const hovering = `({ ...${state}, target: ship.targetBody.name, enRoute: ship.enRoute,
    offset: ship.object.position.clone().sub(ship.targetBody.position).toArray(),
    degreesAbove: (() => { const d = ship.object.position.clone().sub(ship.targetBody.position);
      return +(Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180 / Math.PI).toFixed(1); })() })`;
  before = await evaluate(hovering);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }))`);
  await sleep(1000);
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))`);
  // A click on a spot where no body is (padded as the picker pads them).
  await evaluate(`(() => {
    const canvas = game.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const V = game.camera.position.constructor;
    const clear = (x, y) => {
      const dir = new V(x, y, 0.5).unproject(game.camera).sub(game.camera.position).normalize();
      return world.bodies.every((b) => {
        const to = b.renderPosition.clone().sub(game.camera.position);
        return dir.angleTo(to) > Math.max(Math.asin(Math.min(1, b.radius / to.length())), 0.02) + 0.05;
      });
    };
    const spots = [[-0.8, 0.8], [0.8, 0.8], [-0.8, -0.8], [0.8, -0.8], [0, 0.85], [0, -0.85]];
    const [x, y] = spots.find(([sx, sy]) => clear(sx, sy)) ?? spots[0];
    const at = { clientX: rect.left + ((x + 1) / 2) * rect.width, clientY: rect.top + ((1 - y) / 2) * rect.height, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, button: 0 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, button: 0 }));
  })()`);
  await drawFrames(3);
  after = await evaluate(hovering);
  autopilot = {
    star: await evaluate(`world.stars[0].name`),
    offsetMoved: +Math.hypot(...after.offset.map((v, k) => v - before.offset[k])).toFixed(2),
  };

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

  // The system map: shown with every planet and moon, and the count in its title; hovering a planet's disc
  // shows its tooltip, clicking it sends the autopilot there, and N folds the panel away and back.
  for (let i = 0; i < 40 && !(await evaluate(`levels.systemLevel.map.baked`)); i++) await sleep(250);
  systemMap = await evaluate(`new Promise((resolve) => {
    const map = levels.systemLevel.map;
    const canvas = document.getElementById('system-map-canvas');
    const rect = canvas.getBoundingClientRect();
    const body = world.planets[world.planets.length - 1];
    const p = map.mapPosition(body);
    const at = { clientX: rect.left + p.x, clientY: rect.top + p.y, button: 0, pointerType: 'mouse', bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointermove', at));
    canvas.dispatchEvent(new MouseEvent('click', at));
    const layout = map.currentLayout;
    requestAnimationFrame(() => requestAnimationFrame(() => resolve({
      visible: map.visible && !document.getElementById('system-map').hidden && rect.width > 100,
      baked: map.baked,
      title: document.getElementById('system-map-title').textContent,
      planets: layout.planets.length,
      moons: layout.planets.reduce((n, q) => n + q.moons.length, 0),
      asteroids: layout.belts.reduce((n, b) => n + b.asteroids.length, 0),
      expected: { planets: world.planets.length, moons: world.moons.length, asteroids: world.asteroids.length, belts: world.belts.length },
      body: body.name,
      tooltip: document.getElementById('tooltip').hidden ? null : document.getElementById('tooltip-name').textContent,
      target: ship.targetBody?.name ?? null,
    })));
  })`);
  // Back to hovering above the star for the checks below.
  await evaluate(`document.getElementById('system-map-canvas').dispatchEvent(new PointerEvent('pointerleave')), ship.parkAt(world.stars[0])`);
  const key = (type) => evaluate(`window.dispatchEvent(new KeyboardEvent('${type}', { code: 'KeyN' }))`);
  const mapOpen = `levels.systemLevel.map.visible && getComputedStyle(document.querySelector('#system-map .map-body')).display !== 'none'`;
  // Held for a few frames, so the map's per-frame poll sees the press (headless frame rates are low).
  const frames = `new Promise((r) => { let n = 0; (function f() { if (++n > 3) r(); else requestAnimationFrame(f); })(); })`;
  const pressN = async () => {
    await key('keydown');
    await evaluate(frames);
    await key('keyup');
    await evaluate(frames);
  };
  await pressN();
  systemMap.folded = !(await evaluate(mapOpen));
  await pressN();
  systemMap.unfolded = await evaluate(mapOpen);
  systemMap.ok =
    systemMap.visible &&
    systemMap.baked &&
    systemMap.title.includes(systemMap.expected.planets === 1 ? '1 planet' : `${systemMap.expected.planets} planets`) &&
    systemMap.planets === systemMap.expected.planets &&
    systemMap.moons === systemMap.expected.moons &&
    systemMap.asteroids === systemMap.expected.asteroids &&
    (systemMap.expected.belts === 0 || /belt/.test(systemMap.title)) &&
    systemMap.tooltip === systemMap.body &&
    systemMap.target === systemMap.body &&
    systemMap.folded &&
    systemMap.unfolded;

  // Living stars and comets: sample twice, a couple of seconds apart.
  const sample = `({
    starTime: world.stars[0].storms.shownTime,
    clock: world.time,
    live: world.stars.reduce((n, s) => n + s.storms.liveParticles, 0),
    comets: world.comets.map((c) => c.position.toArray()),
    tails: world.comets.map((c) => +c.activity.toFixed(3)),
    // Each comet's nucleus is a body (picked and flown to like a moon), on the comet's orbit.
    nuclei: world.comets.every((c) => world.bodies.includes(c.nucleus) && c.nucleus.position.distanceTo(c.position) < 1),
  })`;
  const first = await evaluate(sample);
  await until(`world.time - ${first.clock} > 1`, 6000);
  const second = await evaluate(sample);
  living = {
    starSeconds: +(second.starTime - first.starTime).toFixed(2),
    // The star's clock against the system's own (not the wall clock, which runs ahead at headless frame rates).
    clockSeconds: +(second.clock - first.clock).toFixed(2),
    liveParticles: [first.live, second.live],
    comets: second.comets.length,
    cometsMoved: second.comets.every((p, i) => Math.hypot(...p.map((v, k) => v - first.comets[i][k])) > 0.1),
    cometActivity: second.tails,
    nuclei: second.nuclei,
  };

  // Comets (when this system has any): hovering one shows its name, and clicking it flies there.
  comet = await evaluate(`new Promise((resolve) => {
    const c = world.comets[0];
    if (!c) return resolve({ none: true });
    const orbit = levels.systemLevel.orbit;
    orbit.setFocus(c.position);
    orbit.setDistance(120);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const p = c.nucleus.renderPosition.clone().project(game.camera);
      const rect = game.renderer.domElement.getBoundingClientRect();
      const at = { clientX: rect.left + ((p.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - p.y) / 2) * rect.height, bubbles: true };
      const canvas = game.renderer.domElement;
      canvas.dispatchEvent(new PointerEvent('pointermove', at));
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, button: 0 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, button: 0 }));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const r = {
          name: c.nucleus.name,
          tooltip: document.getElementById('tooltip').hidden ? null : document.getElementById('tooltip-name').textContent,
          autopilot: ship.enRoute && ship.targetBody === c.nucleus,
        };
        orbit.setFocus(null);
        orbit.setDistance(45);
        // Back above the star for the rest of the checks.
        ship.parkAt(world.stars[0]);
        resolve(r);
      }));
    }));
  })`);

  // Asteroid belts (when this system has any): near a named asteroid the rocks round it are meshes and the rest dots;
  // hovering the belt between its asteroids names it, and clicking it flies to the named asteroid nearest the click.
  belt = await evaluate(`new Promise((resolve) => {
    const b = world.belts[0];
    if (!b) return resolve({ none: true });
    const a = b.asteroids[0];
    const orbit = levels.systemLevel.orbit;
    ship.parkAt(a);
    orbit.setDistance(40);
    const frames = (n, f) => (n <= 0 ? f() : requestAnimationFrame(() => frames(n - 1, f)));
    frames(3, () => {
      const V = game.camera.position.constructor;
      const rect = game.renderer.domElement.getBoundingClientRect();
      // A point on the belt's mid-plane near the asteroid, on screen and clear of every body.
      // At the asteroid's own distance from the star (the belt is wide), clamped inside the belt.
      const mid = Math.min(b.data.outer, Math.max(b.data.inner, Math.hypot(a.renderPosition.x, a.renderPosition.z)));
      const base = Math.atan2(a.renderPosition.z, a.renderPosition.x);
      let at = null;
      let point = null;
      for (let k = 1; k < 40 && !at; k++) {
        const angle = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (6 / mid);
        const q = new V(Math.cos(angle) * mid, 0, Math.sin(angle) * mid);
        const p = q.clone().project(game.camera);
        const clear = world.bodies.every((x) => x.renderPosition.distanceTo(q) > x.radius * 3 + 2);
        if (Math.abs(p.x) < 0.8 && Math.abs(p.y) < 0.8 && p.z < 1 && clear) {
          at = { clientX: rect.left + ((p.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - p.y) / 2) * rect.height, bubbles: true };
          point = q;
        }
      }
      const r = { name: b.name, rocks: b.rocks.length, meshRocks: b.meshRocks, named: b.asteroids.length };
      if (!at) return resolve({ ...r, noPoint: true });
      const canvas = game.renderer.domElement;
      canvas.dispatchEvent(new PointerEvent('pointermove', at));
      frames(2, () => {
        r.tooltip = document.getElementById('tooltip').hidden ? null : document.getElementById('tooltip-name').textContent;
        canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, button: 0 }));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, button: 0 }));
        frames(2, () => {
          r.target = ship.targetBody?.name ?? null;
          r.nearest = b.bodyNear(point)?.name ?? null;
          r.toAsteroid = b.asteroids.includes(ship.targetBody);
          ship.parkAt(world.stars[0]);
          orbit.setDistance(45);
          resolve(r);
        });
      });
    });
  })`);

  // System sky: the galaxy band and the orbit trails. Look at the galactic centre for a screenshot.
  sky = await evaluate(`(() => {
    const scene = levels.systemLevel.scene;
    const band = scene.getObjectByName('Galaxy band');
    const c = levels.systemLevel.band.sky.center;
    levels.systemLevel.orbit.lookFrom(new game.camera.position.constructor(-c.x, -c.y, -c.z));
    return {
      band: !!band && !!scene.getObjectByName('Galaxy band stars'),
      skyStars: levels.systemLevel.skyStars.count,
      trails: levels.systemLevel.trails.count,
      expectedTrails: world.planets.length + world.moons.length,
    };
  })()`);
  await until(`levels.systemLevel.trails.visibleCount >= 1`, 4000);
  await drawFrames(5);
  sky.visibleTrails = await evaluate(`levels.systemLevel.trails.visibleCount`);
  const bandShot = await send('Page.captureScreenshot', { format: 'png' });
  sky.screenshot = join(outDir, 'band.png');
  writeFileSync(sky.screenshot, Buffer.from(bandShot.result.data, 'base64'));

  const hovered = [before, after].every((s) => s.target === autopilot.star && !s.enRoute && s.degreesAbove > 80);
  const noManual = autopilot.offsetMoved < 1;
  const picked = pick.target === pick.star && pick.tooltip === pick.star && systemMap.ok;
  const skyOk = sky.band && sky.skyStars > 300 && sky.trails === sky.expectedTrails && sky.visibleTrails >= 1;
  const alive =
    living.clockSeconds > 0.3 &&
    Math.abs(living.starSeconds - living.clockSeconds) < 0.25 &&
    living.liveParticles.some((n) => n > 0) &&
    living.cometsMoved &&
    living.nuclei &&
    (comet.none || (comet.tooltip === comet.name && comet.autopilot)) &&
    (belt.none || (belt.rocks > 1000 && belt.meshRocks > 0 && belt.tooltip === belt.name && belt.toAsteroid && belt.target === belt.nearest));
  Object.assign(sections.core, { hovered, noManual, picked, skyOk, alive });
  return hovered && noManual && picked && skyOk && alive;
});

if (started && (runs('galaxy') || runs('nebulas') || runs('rogues') || runs('dust') || runs('audio') || runs('planet'))) {
  // Seamless zooms: while a level transition runs, sample every drawn frame (after drawing, before it's shown):
  // the crossfade weight and the canvas brightness (mean over a sparse grid). Each transition is one segment,
  // from the level it left to the one it reached. Setting __seamless.freezeWhen to a mode stops the game once
  // mid-handover into that level, for a screenshot (see freezeShot).
  await evaluate(`(() => {
    const gl = game.renderer.getContext();
    window.__seamless = { segments: [], current: null, freezeWhen: null, frozen: false, lastMode: levels.mode };
    game.afterFrame = () => {
      const s = window.__seamless;
      if (!levels.transitioning) {
        if (s.current) { s.current.to = levels.mode; s.segments.push(s.current); s.current = null; }
        s.lastMode = levels.mode;
        return;
      }
      s.current ??= { from: s.lastMode, frames: [] };
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      if (!s.px || s.px.length !== w * h * 4) s.px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, s.px);
      let sum = 0, n = 0;
      for (let y = 2; y < h; y += 8) for (let x = 2; x < w; x += 8) {
        const i = 4 * (y * w + x); sum += s.px[i] + s.px[i + 1] + s.px[i + 2]; n++;
      }
      const weight = levels.crossfade;
      // Planet zooms: how far the camera is from the body's centre, in radii: in the planet level, of the ground
      // beneath it (the terrain as drawn, or the sea), so a camera low over a valley isn't taken for one inside the hills;
      // in the system view, of the body's sphere. 'peaks' measures against the highest terrain, for the record.
      const pl = levels.planetLevel;
      const p = game.camera.position;
      const clearance = !pl ? null : levels.mode === 'planet'
        ? p.length() / pl.groundRadius(p.clone().normalize())
        : p.distanceTo(pl.body.renderPosition) / pl.body.radius;
      const peaks = pl && levels.mode === 'planet' ? p.length() / pl.top : null;
      s.current.frames.push({ weight, brightness: sum / (3 * n), clearance, peaks });
      if (s.freezeWhen && weight !== null && weight > 0.35 && levels.mode === s.freezeWhen) {
        s.freezeWhen = null; s.frozen = true; game.stop();
      }
    };
  })()`);
}

await section('galaxy', async () => {
  // Galaxy loop, driven by real wheel and pointer events.
  galaxyLoop = { from: await evaluate(`system.id`) };
  await wheel(50000); // to max zoom
  await until(`(() => { const o = levels.systemLevel.orbit;
    return o.targetDistance >= o.params.maxDistance && o.zoom > o.params.maxDistance * 0.85; })()`, 10000);
  await wheel(300); // keep scrolling past it
  await until(`levels.mode === 'galaxy' && !levels.transitioning`, 20000);
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
  // Scroll in mid-jump: the camera zooms in, but the level doesn't change until the ship docks and we scroll on.
  await evaluate(`__seamless.freezeWhen = 'system'`);
  const zoomBeforeJump = await evaluate(`levels.galaxyLevel.orbit.zoom`);
  await wheel(-50000);
  await sleep(600);
  galaxyLoop.heldWhileTravelling = await evaluate(`levels.galaxyLevel.ship.travelling && levels.mode === 'galaxy'`);
  galaxyLoop.zoomedWhileTravelling = (await evaluate(`levels.galaxyLevel.orbit.zoom`)) < zoomBeforeJump * 0.9;
  for (let i = 0; i < 60 && (await evaluate(`levels.galaxyLevel.ship.travelling`)); i++) await sleep(250);
  await sleep(1500);
  await wheel(-50000);
  galaxyLoop.dockedAt = await evaluate(`levels.galaxyLevel.ship.travelling ? null : levels.galaxyLevel.ship.current.id`);
  galaxyLoop.handoverShot = await freezeShot('handover');
  for (let i = 0; i < 20 && (await evaluate(`levels.mode !== 'system' || levels.transitioning`)); i++) await sleep(250);
  await sleep(300);
  galaxyLoop.modeAfterZoomIn = await evaluate(`levels.mode`);
  galaxyLoop.to = await evaluate(`system.id`);
  galaxyLoop.shipSpeed = await evaluate(`ship.speed`);
  // Arriving, the ship flies in from far out and brakes to hover straight above the star.
  const arrival = `({ target: ship.targetBody?.name ?? null, star: world.stars[0].name, enRoute: ship.enRoute,
    distance: +ship.object.position.distanceTo(world.stars[0].position).toFixed(0),
    park: +ship.parkDistance(world.stars[0]).toFixed(0),
    aboveEcliptic: +(ship.object.position.y - world.stars[0].position.y).toFixed(1),
    cameraAboveShip: +(game.camera.position.y - ship.object.position.y).toFixed(1) })`;
  galaxyLoop.arrival = { flying: await evaluate(arrival) };
  for (let i = 0; i < 60 && (await evaluate(`ship.enRoute`)); i++) await sleep(250);
  galaxyLoop.arrival.parked = await evaluate(arrival);
  fps = await evaluate(measureFps);
  return (
    galaxyLoop.modeAfterZoomOut === 'galaxy' &&
    galaxyLoop.polish.distantGalaxies >= 100 &&
    galaxyLoop.polish.spinRadPerSec > 0 &&
    galaxyLoop.polish.spinRadPerSec < 0.01 &&
    galaxyLoop.polish.dots === galaxyLoop.polish.expectedDots &&
    galaxyLoop.polish.dots > galaxyLoop.polish.stars &&
    galaxyLoop.polish.twinkle > 0 &&
    galaxyLoop.polish.twinkleTime > 0 &&
    galaxyLoop.clicked.destination === galaxyLoop.clicked.nearest &&
    galaxyLoop.heldWhileTravelling &&
    galaxyLoop.zoomedWhileTravelling &&
    galaxyLoop.dockedAt === galaxyLoop.clicked.nearest &&
    galaxyLoop.handoverShot !== null &&
    galaxyLoop.modeAfterZoomIn === 'system' &&
    galaxyLoop.to === galaxyLoop.clicked.nearest &&
    galaxyLoop.arrival.flying.target === galaxyLoop.arrival.flying.star &&
    galaxyLoop.arrival.parked.target === galaxyLoop.arrival.parked.star &&
    !galaxyLoop.arrival.parked.enRoute &&
    Math.abs(galaxyLoop.arrival.parked.distance - galaxyLoop.arrival.parked.park) < 3 &&
    // Always hovers straight above the star, with the camera over the ship.
    galaxyLoop.arrival.parked.aboveEcliptic > 0.98 * galaxyLoop.arrival.parked.distance &&
    galaxyLoop.arrival.parked.cameraAboveShip > 0 &&
    typeof galaxyLoop.shipSpeed === 'number'
  );
});

/** Mean brightness (0–255) of the canvas as drawn now, over a sparse grid, after drawing a fresh frame. */
const canvasBrightness = `(() => {
  game.redraw();
  const gl = game.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let sum = 0, n = 0;
  for (let y = 2; y < h; y += 8) for (let x = 2; x < w; x += 8) { const i = 4 * (y * w + x); sum += px[i] + px[i + 1] + px[i + 2]; n++; }
  return +(sum / (3 * n)).toFixed(2);
})()`;
/** How much the nebula sky changes the current view: brightness with it minus without it. */
const nebulaEffect = `(() => {
  const sky = levels.systemLevel.nebulaSky;
  if (!sky) return null;
  const on = ${canvasBrightness};
  sky.visible = false;
  const off = ${canvasBrightness};
  sky.visible = true;
  return +(on - off).toFixed(2);
})()`;

await section('nebulas', async () => {
  const r = (nebulas = { kinds: {} });
  const home = await evaluate(`system.id`);
  const toGalaxy = async () => {
    await until(`!levels.transitioning`, 20000);
    await evaluate(`levels.toGalaxy()`);
    return until(`levels.mode === 'galaxy' && !levels.transitioning`, 40000);
  };
  /** Docks the galaxy ship at `id` and zooms into its system; true once there with its sky baked. */
  const enter = async (id) => {
    await evaluate(`levels.galaxyLevel.ship.jumpTo(galaxy.stars[${id}]), levels.toSystem()`);
    return until(`levels.mode === 'system' && !levels.transitioning && system.id === ${id} &&
      (!levels.systemLevel.nebulaSky || levels.systemLevel.nebulaSky.ready)`, 40000);
  };
  await toGalaxy();
  r.map = await evaluate(`({
    nebulas: galaxy.nebulas.length,
    drawn: levels.galaxyLevel.nebulas.count,
    kinds: [...new Set(galaxy.nebulas.map((n) => n.kind))],
    darkBlobs: levels.galaxyLevel.map.points.material.uniforms.uDimCount.value,
  })`);
  // Hover and click the biggest emission nebula from the nearest star outside it, looking across the ship at it
  // from one side, so the nebula's middle isn't behind the ship's own star; the pointer then searches round its
  // middle for a spot clear of stars (a star under the pointer wins).
  r.pick = await evaluate(`new Promise((resolve) => {
    const n = galaxy.nebulas.filter((x) => x.kind === 'emission').sort((a, b) => b.radius - a.radius)[0];
    const d = (s) => Math.hypot(s.position.x - n.position.x, s.position.y - n.position.y, s.position.z - n.position.z);
    const from = galaxy.stars.filter((s) => d(s) > 1.3 * n.radius).sort((a, b) => d(a) - d(b))[0];
    const level = levels.galaxyLevel;
    level.ship.jumpTo(from);
    const V = game.camera.position.constructor;
    const centre = () => new V(n.position.x, n.position.y, n.position.z).applyMatrix4(level.root.matrixWorld);
    const ship = () => new V(from.position.x, from.position.y, from.position.z).applyMatrix4(level.root.matrixWorld);
    level.orbit.setDistance(n.radius * 1.5);
    level.orbit.lookFrom(ship().sub(centre()).normalize().applyAxisAngle(new V(0, 1, 0), 0.5));
    const canvas = game.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const frames = (k) => new Promise((r) => { let i = 0; (function f() { if (++i > k) r(); else requestAnimationFrame(f); })(); });
    setTimeout(async () => {
      const p = centre().project(game.camera);
      const cx = rect.left + ((p.x + 1) / 2) * rect.width, cy = rect.top + ((1 - p.y) / 2) * rect.height;
      let at = null, tooltip = null;
      for (let k = 0; k < 25 && !at; k++) {
        const a = k * 2.4, rr = 12 * Math.sqrt(k);
        const here = { clientX: cx + rr * Math.cos(a), clientY: cy + rr * Math.sin(a), bubbles: true };
        canvas.dispatchEvent(new PointerEvent('pointermove', here));
        await frames(2);
        tooltip = document.getElementById('tooltip').hidden ? null : document.getElementById('tooltip-name').textContent;
        if (tooltip === n.name) at = here;
      }
      if (at) {
        canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, button: 0 }));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, button: 0 }));
        await frames(2);
      }
      resolve({ nebula: n.name, host: n.star, tooltip, destination: level.ship.destination?.id ?? null });
    }, 1500);
  })`);
  // What the nebulas cost on the map: frames per second in this view with them and without them.
  r.galaxyFps = await evaluate(measureFps);
  r.galaxyFpsWithout = await evaluate(`(levels.galaxyLevel.nebulas.visible = false, ${measureFps})`);
  await evaluate(`levels.galaxyLevel.nebulas.visible = true`);
  // The ship is flying to the nebula's star; the visits below jump instead.

  // A system inside each kind: the nebula's own star (always inside it).
  const hosts = await evaluate(`Object.fromEntries(['emission', 'reflection', 'dark', 'planetary', 'remnant'].map((k) =>
    [k, galaxy.nebulas.filter((n) => n.kind === k).sort((a, b) => b.radius - a.radius)[0].star]))`);
  for (const [kind, id] of Object.entries(hosts)) {
    current = `nebulas (${kind})`;
    const k = (r.kinds[kind] = { star: id, entered: await enter(id) });
    Object.assign(k, await evaluate(`({
      nebula: system.nebula?.kind ?? null,
      hud: document.getElementById('hud-location').textContent,
      sky: levels.systemLevel.nebulaSky?.stats(game.renderer) ?? null,
    })`));
    k.effect = await evaluate(nebulaEffect);
    k.fps = await evaluate(measureFps);
    k.fpsWithout = await evaluate(`(levels.systemLevel.nebulaSky.visible = false, ${measureFps})`);
    await evaluate(`levels.systemLevel.nebulaSky.visible = true`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    k.screenshot = join(outDir, `nebula-${kind}.png`);
    writeFileSync(k.screenshot, Buffer.from(shot.result.data, 'base64'));
    if (kind === 'emission') {
      // Low orbit inside it: the nebula is in the planet level's sky too.
      await evaluate(`(() => { const p = world.planets[0]; ship.parkAt(p); levels.toPlanet(p); })()`);
      k.lowOrbit = await until(`levels.mode === 'planet' && !levels.transitioning`, 40000);
      if (k.lowOrbit) {
        k.lowOrbitEffect = await evaluate(nebulaEffect);
        await evaluate(`levels.leavePlanet()`);
        await until(`levels.mode === 'system' && !levels.transitioning`, 40000);
      }
    }
    await toGalaxy();
  }
  // Back to where the section started, for the sections after it.
  r.back = (await enter(home)) && (await evaluate(`system.id`)) === home;

  const glowing = ['emission', 'reflection', 'planetary', 'remnant'];
  r.ok =
    r.map.drawn === r.map.nebulas &&
    r.map.kinds.length === 5 &&
    r.map.darkBlobs > 0 &&
    r.pick.tooltip === r.pick.nebula &&
    r.pick.destination === r.pick.host &&
    Object.entries(r.kinds).every(
      ([kind, k]) =>
        k.entered &&
        k.nebula === kind &&
        k.hud.includes(' Nebula') &&
        k.sky !== null &&
        // Glowing kinds light the sky up; a dark one blocks what's behind it.
        (glowing.includes(kind) ? k.sky.light > 0.02 && Math.abs(k.effect) > 1 : k.sky.transmittance < 0.8),
    ) &&
    r.kinds.emission.lowOrbit &&
    Math.abs(r.kinds.emission.lowOrbitEffect) > 1 &&
    r.back;
  return r.ok;
});

/** Mean brightness (0–255) of the middle of a body's disc as drawn now (the inner half of its radius on screen). */
const discBrightness = (bodyExpr) => `(() => {
  game.redraw();
  const body = ${bodyExpr};
  const cam = game.camera;
  const c = body.renderPosition.clone().project(cam);
  const edge = body.renderPosition.clone().add(cam.up.clone().applyQuaternion(cam.quaternion).multiplyScalar(body.radius)).project(cam);
  const gl = game.renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const cx = (c.x + 1) / 2 * w, cy = (c.y + 1) / 2 * h;
  const r = 0.5 * Math.hypot((edge.x - c.x) / 2 * w, (edge.y - c.y) / 2 * h);
  const px = new Uint8Array(4);
  let sum = 0, n = 0;
  for (let y = -r; y <= r; y += Math.max(1, r / 6)) for (let x = -r; x <= r; x += Math.max(1, r / 6)) {
    if (x * x + y * y > r * r) continue;
    gl.readPixels(Math.round(cx + x), Math.round(cy + y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    sum += px[0] + px[1] + px[2]; n++;
  }
  return n ? +(sum / (3 * n)).toFixed(2) : null;
})()`;

await section('rogues', async () => {
  const r = (rogues = {});
  const home = await evaluate(`system.id`);
  const segmentsBefore = await evaluate(`window.__seamless ? __seamless.segments.length : 0`);
  await until(`!levels.transitioning`, 20000);
  await evaluate(`levels.toGalaxy()`);
  await until(`levels.mode === 'galaxy' && !levels.transitioning`, 40000);
  r.map = await evaluate(`({
    rogues: galaxy.rogues.length,
    drawn: levels.galaxyLevel.rogues.positions.length / 3,
    idsFollowStars: galaxy.rogues.every((x, i) => x.id === galaxy.stars.length + i),
  })`);
  // Hover and click a rogue, looking at it across its nearest star (where the ship docks), a little from one side.
  r.pick = await evaluate(`new Promise((resolve) => {
    const level = levels.galaxyLevel;
    const target = galaxy.rogues.find((x) => !x.nebula) ?? galaxy.rogues[0];
    const d = (s) => Math.hypot(s.position.x - target.position.x, s.position.y - target.position.y, s.position.z - target.position.z);
    const from = galaxy.stars.slice().sort((a, b) => d(a) - d(b))[0];
    level.ship.jumpTo(from);
    const V = game.camera.position.constructor;
    const at = (s) => new V(s.position.x, s.position.y, s.position.z).applyMatrix4(level.root.matrixWorld);
    level.orbit.setDistance(d(from) * 1.2);
    level.orbit.lookFrom(at(from).sub(at(target)).normalize().applyAxisAngle(new V(0, 1, 0), 0.4));
    const canvas = game.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const frames = (k) => new Promise((r) => { let i = 0; (function f() { if (++i > k) r(); else requestAnimationFrame(f); })(); });
    setTimeout(async () => {
      const p = at(target).project(game.camera);
      const here = { clientX: rect.left + ((p.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - p.y) / 2) * rect.height, bubbles: true };
      canvas.dispatchEvent(new PointerEvent('pointermove', here));
      await frames(3);
      const tip = document.getElementById('tooltip');
      const tooltip = tip.hidden ? null : { name: document.getElementById('tooltip-name').textContent, text: tip.textContent };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...here, button: 0 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...here, button: 0 }));
      await frames(2);
      resolve({ rogue: target.id, name: target.name, onScreen: Math.abs(p.x) < 1 && Math.abs(p.y) < 1, tooltip, destination: level.ship.destination?.id ?? null });
    }, 1500);
  })`);
  r.arrived = (await until(`!levels.galaxyLevel.ship.travelling`, 40000)) && (await evaluate(`levels.galaxyLevel.ship.current.id`)) === r.pick.rogue;
  r.galaxyFps = await evaluate(measureFps);
  // Scroll in: the zoom crossfades into the rogue's system (screenshot mid-handover).
  if (await evaluate(`!!window.__seamless`)) await evaluate(`__seamless.freezeWhen = 'system'`);
  await evaluate(`levels.toSystem()`);
  r.handoverShot = await freezeShot('rogue-handover');
  r.entered = await until(`levels.mode === 'system' && !levels.transitioning && system.id === ${r.pick.rogue}`, 40000);
  r.flewIn = await until(`!ship.enRoute`, 40000);
  r.system = await evaluate(`({
    stars: world.stars.length,
    planets: world.planets.length,
    galacticLight: !!world.galacticLight,
    hud: document.getElementById('hud-location').textContent,
    url: location.search,
    hovering: ship.targetBody === world.planets[0],
    centred: world.planets[0].renderPosition.length() < 1e-6,
    trails: levels.systemLevel.trails.planetTrails?.length ?? null,
  })`);
  r.disc = await evaluate(discBrightness('world.planets[0]'));
  r.fps = await evaluate(measureFps);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  r.screenshot = join(outDir, 'rogue-system.png');
  writeFileSync(r.screenshot, Buffer.from(shot.result.data, 'base64'));
  // Down to low orbit and back, as for any planet; down there it's lit (not black), with no star in the sky.
  r.loop = await runPlanetLoop('world.planets[0]', 'rogue-low-orbit', null, async () => ({
    brightness: await evaluate(canvasBrightness),
    sunLight: await evaluate(`planet.globe.sunLight.r + planet.globe.sunLight.g + planet.globe.sunLight.b`),
  }));
  r.segments = await evaluate(`window.__seamless ? __seamless.segments.slice(${segmentsBefore}).map((seg) => ({
    zoom: seg.from + ' → ' + seg.to,
    crossfadeFrames: seg.frames.filter((x) => x.weight !== null && x.weight > 0 && x.weight < 1).length,
    minBrightness: +Math.min(...seg.frames.map((x) => x.brightness)).toFixed(2),
  })) : null`);
  // Back home, for the sections after this one.
  await evaluate(`levels.toGalaxy()`);
  await until(`levels.mode === 'galaxy' && !levels.transitioning`, 40000);
  await evaluate(`levels.galaxyLevel.ship.jumpTo(galaxy.stars[${home}]), levels.toSystem()`);
  r.back = await until(`levels.mode === 'system' && !levels.transitioning && system.id === ${home}`, 40000);

  r.ok =
    r.map.rogues >= 5 &&
    r.map.drawn === r.map.rogues &&
    r.map.idsFollowStars &&
    r.pick.onScreen &&
    r.pick.tooltip?.name === r.pick.name &&
    r.pick.tooltip.text.includes('Rogue planet') &&
    r.pick.destination === r.pick.rogue &&
    r.arrived &&
    r.entered &&
    r.flewIn &&
    r.system.stars === 0 &&
    r.system.planets === 1 &&
    r.system.galacticLight &&
    r.system.hud.includes('Rogue planet') &&
    r.system.url.includes(`star=${r.pick.rogue}`) &&
    r.system.hovering &&
    r.system.centred &&
    r.disc > 6 &&
    r.loop.ok &&
    r.loop.sky.stars === 0 &&
    r.loop.during.brightness > 3 &&
    r.loop.during.sunLight > 0 &&
    (r.segments === null || (r.segments.length >= 3 && r.segments.every((x) => x.crossfadeFrames > 0 && x.minBrightness > 0.5))) &&
    r.back;
  return r.ok;
});

/** How much the system's dust lights the view: canvas brightness with it minus without it. */
const dustEffect = `(() => {
  const dust = world.dust;
  if (!dust) return null;
  const on = ${canvasBrightness};
  dust.object.visible = false;
  const off = ${canvasBrightness};
  dust.object.visible = true;
  return { on, off, effect: +(on - off).toFixed(2) };
})()`;

/** Descends to `bodyExpr`, sets the clock to its shower's peak and watches the meteors (or impact flashes) for a while. */
async function watchShower(bodyExpr, name) {
  for (let i = 0; i < 40 && (await evaluate(`levels.transitioning`)); i++) await sleep(250);
  const r = await evaluate(`(() => {
    const body = ${bodyExpr};
    window.__body = body;
    ship.parkAt(body);
    levels.systemLevel.orbit.lookFrom(world.stars[0].position.clone().sub(body.renderPosition));
    levels.toPlanet(body);
    return { name: body.name };
  })()`);
  r.entered = await until(`levels.mode === 'planet' && !levels.transitioning`, 40000);
  if (!r.entered) return r;
  r.showers = await evaluate(`planet.meteors?.showers.length ?? 0`);
  if (!r.showers) return r;
  // To the peak, looking down from high enough to see the side facing the stream, the radiant up where we are.
  r.start = await evaluate(`(() => {
    const m = planet.meteors, s = m.showers[0];
    const orbit = (__body.parent ?? __body).config.orbit;
    planet.frame.restart(nextShowerPeak(s, orbit, planet.time) - 0.5);
    const V = game.camera.position.constructor;
    const radiant = planet.frame.toLocalDirection(new V(...s.radiant), new V());
    planet.ship.placeAt(radiant);
    planet.orbit.setDistance(planet.radius * 0.6);
    return { airless: m.airless, speed: +s.speed.toFixed(1), from: s.name };
  })()`);
  r.watch = await evaluate(`new Promise((resolve) => {
    const m = planet.meteors, start = planet.frame.renderTime, wall = performance.now();
    let most = 0, activity = 0, hud = '';
    (function f() {
      most = Math.max(most, m.count);
      activity = Math.max(activity, m.activity);
      if (m.shower) hud = document.getElementById('hud-climate').textContent;
      if (planet.frame.renderTime - start < 3 && performance.now() - wall < 20000) return requestAnimationFrame(f);
      resolve({ most, activity: +activity.toFixed(2), hud, radiantUp: m.radiantUp });
    })();
  })`);
  // Caught with one on screen.
  for (let i = 0; i < 40 && !(await evaluate(`planet.meteors.count > 0`)); i++) await sleep(100);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  r.screenshot = join(outDir, `${name}.png`);
  writeFileSync(r.screenshot, Buffer.from(shot.result.data, 'base64'));
  await evaluate(`levels.leavePlanet()`);
  r.left = await until(`levels.mode === 'system' && !levels.transitioning`, 40000);
  r.ok = r.entered && r.watch.most > 0 && r.watch.activity > 0.2 && /meteor/.test(r.watch.hud) && r.left;
  return r;
}

await section('dust', async () => {
  const r = (dust = {});
  const home = startId;
  // Where the section started: it ends there, so the sections after it run where they would without it.
  const from = await evaluate(`system.id`);
  const segmentsBefore = await evaluate(`window.__seamless ? __seamless.segments.length : 0`);
  /** Through the galaxy map to system `id` (no page load, so the zoom recorder keeps running). */
  const visit = async (id) => {
    await until(`!levels.transitioning`, 20000);
    await evaluate(`levels.toGalaxy()`);
    await until(`levels.mode === 'galaxy' && !levels.transitioning`, 40000);
    await evaluate(`levels.galaxyLevel.ship.jumpTo(galaxy.stars[${id}]), levels.toSystem()`);
    const entered = await until(`levels.mode === 'system' && !levels.transitioning && system.id === ${id}`, 40000);
    await until(`!ship.enRoute`, 30000);
    return entered;
  };
  r.young = await evaluate(`(() => {
    const stars = galaxy.stars.filter((s) => s.young);
    const ref = stars.find((s) => generateSystem(s).planets.length > 0);
    return { count: stars.length, inNebulas: stars.filter((s) => s.nebula).length, id: ref?.id ?? null };
  })()`);
  if (r.young.id === null) return false;
  current = 'dust (young star)';
  // The galaxy map's tooltip says it's young.
  await evaluate(`levels.toGalaxy()`);
  await until(`levels.mode === 'galaxy' && !levels.transitioning`, 40000);
  await evaluate(`levels.galaxyLevel.ship.jumpTo(galaxy.stars[${r.young.id}])`);
  await sleep(1500);
  r.tooltip = await evaluate(`new Promise((resolve) => {
    const level = levels.galaxyLevel, ref = galaxy.stars[${r.young.id}];
    const V = game.camera.position.constructor;
    const p = new V(ref.position.x, ref.position.y, ref.position.z).applyMatrix4(level.root.matrixWorld).project(game.camera);
    const rect = game.renderer.domElement.getBoundingClientRect();
    const at = { clientX: rect.left + ((p.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - p.y) / 2) * rect.height, bubbles: true };
    game.renderer.domElement.dispatchEvent(new PointerEvent('pointermove', at));
    let n = 0;
    (function f() {
      if (++n < 4) return requestAnimationFrame(f);
      const tip = document.getElementById('tooltip');
      resolve(tip.hidden ? null : { name: document.getElementById('tooltip-name').textContent, text: tip.textContent });
    })();
  })`);
  r.loaded = await visit(r.young.id);
  r.system = await evaluate(`(() => {
    const d = system.dust;
    return {
      kind: d?.kind ?? null,
      sheets: world.dust?.sheets.length ?? 0,
      hud: document.getElementById('hud-location').textContent,
      forming: world.planets.every((p) => p.description.includes('forming')),
      inGaps: system.planets.length > 0 && system.planets.every((p, i) => Math.abs(p.orbit.radius - d.gaps[i].at) < 1e-6 && d.gaps[i].width >= p.radius),
      comets: system.comets.length,
      belts: system.belts.length,
    };
  })()`);
  r.fps = await evaluate(measureFps);
  // From above, the disc lights the view (and hiding it darkens it).
  await evaluate(`(() => { const o = levels.systemLevel.orbit; o.setDistance(system.dust.outer * 1.3); o.lookFrom(new (game.camera.position.constructor)(0.25, 1, 0.15)); })()`);
  await sleep(2500);
  r.disc = await evaluate(dustEffect);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  r.screenshot = join(outDir, 'young-system.png');
  writeFileSync(r.screenshot, Buffer.from(shot.result.data, 'base64'));
  r.back = true;
  // Down to a forming planet: the disc is in its sky too, as in the system view.
  r.loop = await runPlanetLoop('world.planets[0]', 'forming-planet', null, async () => {
    // Pulled out to see the sky round the planet.
    await evaluate(`planet.orbit.setDistance(planet.orbit.params.maxDistance)`);
    await sleep(2500);
    const effect = await evaluate(dustEffect);
    // Back in (at the limit, the loop's scroll out would leave at once).
    await evaluate(`planet.orbit.setDistance(45)`);
    await sleep(1500);
    return effect;
  });

  // A debris disc: the first system with one draws it, and it adds a little light.
  current = 'dust (debris disc)';
  const debris = await evaluate(`galaxy.stars.find((s) => !s.young && generateSystem(s).dust?.kind === 'debris')?.id ?? null`);
  r.debris = { id: debris, loaded: await visit(debris) };
  r.debris.fps = await evaluate(measureFps);
  await evaluate(`(() => { const o = levels.systemLevel.orbit; o.setDistance(system.dust.outer * 1.8); o.lookFrom(new (game.camera.position.constructor)(0.25, 1, 0.15)); })()`);
  await sleep(2500);
  Object.assign(r.debris, await evaluate(`({ kind: system.dust.kind, hud: document.getElementById('hud-location').textContent })`), { effect: await evaluate(dustEffect) });

  // Meteor showers in the home system: a planet with air, and an airless moon, at their shower's peak.
  current = 'dust (meteor showers)';
  r.home = await visit(home);
  r.trails = await evaluate(`({ trails: world.trails.length, comets: world.comets.length })`);
  const pick = (airless) => `(() => {
    const showers = (b) => meteorShowers({ orbit: (b.parent ?? b).config.orbit, escapeVelocity: 0, seed: b.config.seed }, system.comets, system.habitableRadius);
    const air = (b) => b.config.type === 'gas' || (b.config.climate && b.config.climate.pressure >= 4e-7);
    const body = [...world.planets, ...world.moons].find((b) => showers(b).length > 0 && ${airless ? '!' : ''}air(b));
    return body ? (body.parent ? 'world.moons[' + world.moons.indexOf(body) + ']' : 'world.planets[' + world.planets.indexOf(body) + ']') : null;
  })()`;
  const withAir = await evaluate(pick(false));
  const airless = await evaluate(pick(true));
  r.meteors = withAir ? await watchShower(withAir, 'meteor-shower') : null;
  r.flashes = airless ? await watchShower(airless, 'impact-flashes') : null;
  r.segments = await evaluate(`window.__seamless ? __seamless.segments.slice(${segmentsBefore}).map((seg) => ({
    zoom: seg.from + ' → ' + seg.to,
    crossfadeFrames: seg.frames.filter((x) => x.weight !== null && x.weight > 0 && x.weight < 1).length,
    minBrightness: +Math.min(...seg.frames.map((x) => x.brightness)).toFixed(2),
  })) : null`);
  r.returned = from === home || (await visit(from));

  r.ok =
    r.returned &&
    r.young.count >= 3 &&
    r.young.count <= 15 &&
    r.young.inNebulas >= r.young.count / 2 &&
    r.loaded &&
    r.system.kind === 'protoplanetary' &&
    r.system.sheets > 0 &&
    r.system.hud.includes('protoplanetary disc') &&
    r.system.forming &&
    r.system.inGaps &&
    r.system.comets === 0 &&
    r.system.belts === 0 &&
    r.disc.effect > 3 &&
    r.tooltip?.text.includes('young') &&
    r.back &&
    r.loop.ok &&
    r.loop.during.effect > 1 &&
    (r.segments === null || r.segments.every((x) => x.crossfadeFrames > 0 && x.minBrightness > 0.5)) &&
    r.debris.loaded &&
    r.debris.kind === 'debris' &&
    r.debris.hud.includes('debris disc') &&
    r.debris.effect.effect > 0.02 &&
    r.home &&
    r.trails.trails === r.trails.comets &&
    !!r.meteors?.ok &&
    !!r.flashes?.ok;
  return r.ok;
});

await section('audio', async () => {
  // Audio: a real (trusted) click on the menu button unlocks audio and opens the menu, which pauses the game and
  // holds the volume sliders and a link to the planet lab (for the first planet here); a real Esc closes it.
  const button = await evaluate(`(() => { const r = document.getElementById('menu-toggle').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, ...button, button: 'left', clickCount: 1 });
  }
  await until(`menu.isOpen && game.paused`, 5000);
  const clock = `levels.systemLevel.world.time`;
  const pausedAt = await evaluate(clock);
  await sleep(500);
  audio = await evaluate(`({ state: audio.state, panelOpen: menu.isOpen, paused: game.paused && ${clock} === ${pausedAt},
    effectsSlider: !!document.querySelector('#menu #audio input[data-key="sfx"]'),
    labLink: document.getElementById('menu-lab').href.includes('lab.html#'),
    labText: document.getElementById('menu-lab').textContent })`);
  // The Weather toggle (Graphics): off hides every body's clouds, on brings them back.
  audio.weatherToggle = await evaluate(`new Promise((resolve) => {
    const button = document.getElementById('graphics-weather');
    const clouds = () => world.planets.concat(world.moons).filter((p) => p.weather).map((p) => p.object.getObjectByName('Clouds'));
    const on = button.getAttribute('aria-pressed') === 'true';
    const frames = (n, then) => (n ? requestAnimationFrame(() => frames(n - 1, then)) : then());
    button.click();
    frames(3, () => {
      const offText = button.textContent, offHidden = clouds().every((c) => !c.visible);
      button.click();
      frames(3, () => resolve({ on, offText, offHidden, back: button.getAttribute('aria-pressed') === 'true' && clouds().every((c) => c.visible), bodies: clouds().length }));
    });
  })`);
  // The debug dump from the menu: its dialog shows the screen; typing in the note doesn't reach the game (M would
  // mute); Save makes one JSON file with the pictures and the game state; Esc in a new one closes only the dialog.
  await evaluate(`window.__dumpBlob = null; { const o = URL.createObjectURL; URL.createObjectURL = (b) => { window.__dumpBlob = b; return o(b); }; }
    document.getElementById('menu-dump').click()`);
  await until(`!document.getElementById('dump').hidden && document.getElementById('dump-image').naturalWidth > 0`, 30000);
  await evaluate(`document.getElementById('dump-note').focus()`);
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, code: 'KeyM', key: 'm', ...(type === 'keyDown' ? { text: 'm' } : {}) });
  const picture = await evaluate(`(() => { const r = document.getElementById('dump-image').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...picture, button: 'left', clickCount: 1 });
  audio.dump = await evaluate(`({ note: document.getElementById('dump-note').value, muted: document.getElementById('audio').classList.contains('muted'),
    marks: document.querySelectorAll('#dump-marks .dump-mark').length })`);
  await evaluate(`document.getElementById('dump-save').click()`);
  await until(`window.__dumpBlob !== null && document.getElementById('dump').hidden`, 60000);
  Object.assign(audio.dump, await evaluate(`window.__dumpBlob.text().then((t) => { const d = JSON.parse(t);
    return { format: d.format, mode: d.state?.mode, star: d.state?.star === levels.systemLevel.data.id, savedNote: d.note, savedMarks: d.marks.length,
      game: d.images.game?.startsWith('data:image/png'), screen: d.images.screen?.startsWith('data:image/jpeg'),
      annotated: d.images.annotated?.startsWith('data:image/jpeg'), gpu: !!d.renderer?.gpu, frames: d.performance.frames?.frames ?? 0,
      menuOpen: menu.isOpen && game.paused }; })`));
  await evaluate(`document.getElementById('menu-dump').click()`);
  await until(`!document.getElementById('dump').hidden`, 30000);
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  await until(`document.getElementById('dump').hidden`, 5000);
  audio.dump.escClosesDialogOnly = await evaluate(`menu.isOpen && game.paused`);
  audio.menuShot = join(outDir, 'menu.png');
  writeFileSync(audio.menuShot, await page.screenshot());
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  await until(`!menu.isOpen && ${clock} > ${pausedAt}`, 5000);
  audio.closedByEsc = await evaluate(`!menu.isOpen && !game.paused && ${clock} > ${pausedAt}`);

  // Sound cues: zoom out (silent), travel to a neighbour (the travel loop), zoom back in (silent).
  const played = `(audio.lastPlayed && { name: audio.lastPlayed.name, seconds: +audio.lastPlayed.seconds.toFixed(2), count: audio.lastPlayed.count })`;
  audio.sfx = {};
  await evaluate(`levels.toGalaxy()`);
  audio.sfx.out = await evaluate(played);
  await until(`levels.mode === 'galaxy' && !levels.transitioning`, 20000);
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
  for (let i = 0; i < 60 && (await evaluate(`levels.galaxyLevel.ship.travelling || levels.transitioning`)); i++) await sleep(250);
  await evaluate(`levels.toSystem()`);
  audio.sfx.in = await evaluate(played);
  // The zoom runs slower than real time at headless frame rates (each frame advances it by at most 0.25 s).
  await until(`levels.mode === 'system' && !levels.transitioning`, 20000);
  audio.sfx.modeAfter = await evaluate(`levels.mode`);
  // Ambient loops: the ship's hum always on, the star's near and far loops sounding from the arrival view.
  audio.ambient = await evaluate(`Object.fromEntries(audio.ambientLevels.map((a) => [a.cue, +a.level.toFixed(3)]))`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyM', key: 'm' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyM', key: 'm' });
  audio.mutedByKey = await evaluate(
    `document.getElementById('audio').classList.contains('muted') && document.getElementById('menu-toggle').classList.contains('muted')`,
  );
  return (
    audio.state === 'running' &&
    audio.panelOpen &&
    audio.paused &&
    audio.effectsSlider &&
    audio.labLink &&
    audio.weatherToggle.on &&
    audio.weatherToggle.offText === 'Weather: off' &&
    audio.weatherToggle.offHidden &&
    audio.weatherToggle.back &&
    audio.dump.note === 'm' &&
    !audio.dump.muted &&
    audio.dump.marks === 1 &&
    audio.dump.format === 'sporer-debug-dump' &&
    audio.dump.mode === 'system' &&
    audio.dump.star &&
    audio.dump.savedNote === 'm' &&
    audio.dump.savedMarks === 1 &&
    audio.dump.game &&
    audio.dump.screen &&
    audio.dump.annotated &&
    audio.dump.gpu &&
    audio.dump.frames > 0 &&
    audio.dump.menuOpen &&
    audio.dump.escClosesDialogOnly &&
    audio.closedByEsc &&
    audio.sfx.out === null &&
    audio.sfx.travel?.name === 'interstellarTravel' &&
    audio.sfx.in?.name === 'interstellarTravel' &&
    audio.sfx.in.count === 1 &&
    audio.sfx.modeAfter === 'system' &&
    audio.ambient.shipHum === 1 &&
    Math.hypot(audio.ambient.starNear ?? 0, audio.ambient.starFar ?? 0) > 0.3 &&
    audio.mutedByKey
  );
});

await section('planet', async () => {
  // Planet loop in the current system: the first terran or ocean world, else the first planet.
  planetLoop = await runPlanetLoop(
    `world.planets.find((p) => ['terran', 'ocean'].includes(p.config.type)) ?? world.planets[0]`,
    'planet',
    'planet-handover',
  );

  // Scrolling in while the autopilot flies zooms the camera but doesn't descend; once it arrives, scrolling on does.
  heldZoom = await evaluate(`(() => {
    const here = ship.targetBody;
    // The nearest other body at least 150 units away, so the trip lasts a couple of seconds.
    const dist = (b) => b.position.distanceTo(ship.object.position);
    const bodies = [...world.planets, ...world.moons].filter((b) => b !== here && dist(b) > 150);
    const target = bodies.reduce((a, b) => (dist(a) < dist(b) ? a : b));
    ship.moveTo(target);
    return { target: target.name, zoomBefore: +levels.systemLevel.orbit.zoom.toFixed(1) };
  })()`);
  await wheel(-50000);
  await sleep(300);
  await wheel(-300);
  await sleep(300);
  heldZoom.whileFlying = await evaluate(
    `({ enRoute: ship.enRoute, mode: levels.mode, zoom: +levels.systemLevel.orbit.zoom.toFixed(1) })`,
  );
  for (let i = 0; i < 80 && (await evaluate(`ship.enRoute`)); i++) await sleep(250);
  await sleep(1500);
  await wheel(-50000);
  for (let i = 0; i < 80 && (await evaluate(`levels.mode !== 'planet' || levels.transitioning`)); i++) await sleep(250);
  heldZoom.mode = await evaluate(`levels.mode`);
  heldZoom.descendedTo = await evaluate(`planet?.body.name ?? null`);
  heldZoom.ok =
    heldZoom.whileFlying.enRoute &&
    heldZoom.whileFlying.mode === 'system' &&
    heldZoom.whileFlying.zoom < heldZoom.zoomBefore * 0.9 &&
    heldZoom.mode === 'planet' &&
    heldZoom.descendedTo === heldZoom.target;
  await evaluate(`levels.leavePlanet()`);
  for (let i = 0; i < 20 && (await evaluate(`levels.mode !== 'system' || levels.transitioning`)); i++) await sleep(250);
  await sleep(300);

  // A comet: visited like a moon (the irregular nucleus in low orbit, zoom in and out), at its closest pass, where its
  // jets, coma and tails are on; then, with the level's clock jumped to its farthest point, they're off.
  const hasComet = await evaluate(`world.nuclei.length > 0`);
  if (hasComet) {
    await evaluate(`(() => {
      const o = world.nuclei[0].config.path;
      const t = (((-o.phase / (2 * Math.PI)) % 1) + 1) % 1 * o.period + Math.ceil(world.time / o.period) * o.period;
      world.setTime(t);
    })()`);
    cometLoop = await runPlanetLoop(`world.nuclei[0]`, 'comet', null, async () => {
      const read = `({ strength: +planet.comet.strength.toFixed(3), jets: planet.comet.jets.visible, coma: planet.comet.coma.visible,
        vents: planet.comet.vents.length, lobes: planet.body.config.shape.lobes.length, hud: document.getElementById('hud-climate').textContent,
        zone: +(planet.frame.center.length() / levels.systemLevel.data.habitableRadius).toFixed(2) })`;
      const near = await evaluate(read);
      await evaluate(`(() => {
        const o = planet.body.config.path;
        const turn = (Math.PI - o.phase) / (2 * Math.PI) - planet.time / o.period;
        planet.frame.restart(planet.time + (((turn % 1) + 1) % 1) * o.period);
      })()`);
      await drawFrames(3);
      const far = await evaluate(read);
      return { near, far };
    });
    cometLoop.ok =
      cometLoop.ok &&
      cometLoop.type === 'barren' &&
      cometLoop.during.near.strength > 0.5 &&
      cometLoop.during.near.jets &&
      cometLoop.during.near.coma &&
      cometLoop.during.near.vents > 0 &&
      /jets active/.test(cometLoop.during.near.hud) &&
      cometLoop.during.far.zone > 3 &&
      cometLoop.during.far.strength === 0 &&
      !cometLoop.during.far.jets &&
      !cometLoop.during.far.coma;
  }

  // Named asteroids (when this system has a belt): one single and one contact binary, each visited with the full
  // planet loop; down there, the belt's rocks near the asteroid drift through the sky as meshes.
  const hasBelt = await evaluate(`world.asteroids.length > 0`);
  asteroidLoops = [];
  if (hasBelt) {
    for (const binary of [false, true]) {
      const pick = `world.asteroids.find((a) => a.config.shape.binary === ${binary})`;
      if (!(await evaluate(`!!${pick}`))) continue;
      const loop = await runPlanetLoop(pick, binary ? 'contact-binary' : 'asteroid', null, async () =>
        evaluate(`(() => {
          const b = world.belts.find((x) => x.asteroids.includes(planet.body));
          return { hud: document.getElementById('hud-climate').textContent, location: document.getElementById('hud-location').textContent,
            lobes: planet.body.config.shape.lobes.length, binary: planet.body.config.shape.binary, skyRocks: b.meshRocks, small: planet.body.config.small };
        })()`),
      );
      loop.ok =
        loop.ok &&
        loop.during.small === 'asteroid' &&
        loop.during.binary === binary &&
        (binary ? /Contact binary/.test(loop.during.hud) && loop.during.lobes >= 2 : !/Contact binary/.test(loop.during.hud)) &&
        loop.during.skyRocks > 0;
      asteroidLoops.push(loop);
    }
  }

  seamless = await evaluate(`(() => {
    game.afterFrame = null;
    const segments = __seamless.segments.map((seg) => {
      const blended = seg.frames.filter((x) => x.weight !== null && x.weight > 0 && x.weight < 1);
      return {
        zoom: seg.from + ' → ' + seg.to,
        frames: seg.frames.length,
        crossfadeFrames: blended.length,
        minBrightness: +Math.min(...seg.frames.map((x) => x.brightness)).toFixed(2),
        minClearance: +Math.min(...seg.frames.map((x) => x.clearance ?? Infinity)).toFixed(3),
        minOverPeaks: +Math.min(...seg.frames.map((x) => x.peaks ?? Infinity)).toFixed(3),
      };
    });
    const kinds = [...new Set(segments.map((x) => x.zoom))];
    return { segments, kinds };
  })()`);
  seamless.handoverShots = [galaxyLoop?.handoverShot, planetLoop.handoverShot];
  // Each zoom this run went through (the galaxy loop's only if that section ran).
  const kinds = [
    ...(sections.galaxy || sections.nebulas ? ['system → galaxy', 'galaxy → system'] : []),
    'system → planet',
    'planet → system',
  ];
  seamless.ok =
    kinds.every((k) => seamless.kinds.includes(k)) && seamless.segments.every((x) => x.crossfadeFrames > 0 && x.minBrightness > 0.5 && (x.minClearance ?? Infinity) >= 1);
  // Audio is only unlocked by the audio section's real click, so only then does the loop ask for its sounds.
  const heard = !sections.audio || (['reentry', planetLoop.soundBefore].includes(planetLoop.soundIn) && planetLoop.soundOut === 'leavePlanet');
  const asteroidsOk = !hasBelt || (asteroidLoops.length === 2 && asteroidLoops.every((l) => l.ok));
  return planetLoop.ok && heard && heldZoom.ok && (!hasComet || cometLoop.ok) && asteroidsOk && planetLoop.handoverShot !== null && seamless.ok;
});

await section('types', async () => {
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
        // One body with each kind of geyser (moons included: cryo moons have tiger stripes).
        const kind = geyserKind(p.type, p.climate);
        if (kind && !(('geysers-' + kind) in found)) found['geysers-' + kind] = { star: ref.id, expr: 'world.planets[' + i + ']' };
        // One world with each kind of weather the types above don't guarantee.
        const w = weatherKind(p.type, p.climate);
        if ((w === 'acid' || w === 'methane' || w === 'dust') && !(('weather-' + w) in found))
          found['weather-' + w] = { star: ref.id, expr: 'world.planets[' + i + ']' };
        for (const m of p.moons) {
          const k = geyserKind(m.type, m.climate);
          if (k === 'cryo' && !('geysers-cryo-moon' in found))
            found['geysers-cryo-moon'] = { star: ref.id, expr: 'world.moons.find((m) => m.name === ' + JSON.stringify(m.name) + ')' };
          if (k === 'sulphur' && !('geysers-sulphur' in found))
            found['geysers-sulphur'] = { star: ref.id, expr: 'world.moons.find((m) => m.name === ' + JSON.stringify(m.name) + ')' };
        }
      });
      if (Object.keys(found).length === want.length + 9) break;
    }
    return found;
  })()`);
  const base = new URL(url);
  for (const [type, { star, expr }] of Object.entries(found)) {
    base.searchParams.set('star', String(star));
    current = `types (${type})`;
    const t0 = Date.now();
    const loaded = await page.goto(base.href, READY, 30000);
    const r = loaded ? await runPlanetLoop(expr, `planet-${type}`) : { ok: false, loaded };
    planetTypes.push({ case: type, star, ...r, seconds: +((Date.now() - t0) / 1000).toFixed(1) });
  }
  return planetTypes.every((r) => r.ok) && planetTypes.length === 16; // 7 types, ringed, moon, 4 geyser kinds and 3 weather kinds
});
const screenshot = join(outDir, 'screenshot.png');
if (started && !stalled) writeFileSync(screenshot, await page.screenshot());

/**
 * The planet lab (lab.html): every planet type and a moon build in the globe and system views and draw a lit
 * planet (mean brightness of the middle of the canvas), lava worlds have eruptions, a game planet loads by
 * star and index with its name, the panel's type control rebuilds the planet, and the page URL keeps a link.
 */
async function runLab() {
  const r = { cases: [] };
  if (!(await page.goto(pageUrl('lab.html?gen=3'), `typeof window.lab !== 'undefined' && lab.ready`, 30000))) return { ok: false, started: false };
  // Redraw and read the canvas in the same task (the drawing buffer is only valid until it's shown).
  const brightness = `(() => {
    game.redraw();
    const gl = game.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0, n = 0;
    for (let y = Math.floor(h * 0.3); y < h * 0.7; y += 6) for (let x = Math.floor(w * 0.35); x < w * 0.65; x += 6) {
      const i = 4 * (y * w + x); sum += px[i] + px[i + 1] + px[i + 2]; n++;
    }
    return +(sum / (3 * n)).toFixed(1);
  })()`;
  const cases = [
    ...['lava', 'barren', 'desert', 'terran', 'ocean', 'ice', 'gas'].map((type) => ({ type })),
    { kind: 'moon' },
    { kind: 'comet' },
    { kind: 'asteroid' },
  ];
  for (const c of cases) {
    const result = { case: c.type ?? c.kind };
    for (const view of ['globe', 'system']) {
      await evaluate(`lab.setView({ view: '${view}' }).then(() => lab.generate(17, ${JSON.stringify(c)}))`);
      await page.waitFor(`lab.ready`, 30000);
      result[view] = await evaluate(`({
        type: lab.planet.type, kind: lab.planet.kind, triangles: lab.level.triangles,
        eruptions: !!lab.level.eruptions, brightness: ${brightness},
        comet: lab.level.comet && { vents: lab.level.comet.vents.length, strength: lab.level.comet.strength, shape: !!lab.planet.shape } })`);
    }
    result.ok =
      (!c.type || result.globe.type === c.type) &&
      (!c.kind || result.globe.kind === c.kind) &&
      // Comet nuclei and asteroids are small: from the lab's default view their six root chunks (3072 triangles) are fine enough.
      result.globe.triangles > (c.kind === 'comet' || c.kind === 'asteroid' ? 3000 : 5000) &&
      result.system.triangles > 500 &&
      // A comet's nucleus is nearly black (albedo ~4%), as are carbonaceous asteroids, so less light comes back from them.
      result.globe.brightness > (c.kind === 'comet' || c.kind === 'asteroid' ? 3 : 8) &&
      result.system.brightness > (c.kind === 'comet' || c.kind === 'asteroid' ? 3 : 8) &&
      result.globe.eruptions === (result.globe.type === 'lava') &&
      // Comets (and only they) have jets in the globe view, on by default (close to the star).
      !!result.globe.comet === (c.kind === 'comet') &&
      (!result.globe.comet || (result.globe.comet.vents > 0 && result.globe.comet.strength > 0.5 && result.globe.comet.shape));
    r.cases.push(result);
  }
  await evaluate(`lab.setView({ view: 'globe' })`);
  r.loaded = await evaluate(`(async () => {
    await lab.load('1337', 5, 1);
    return { name: lab.planet.name, source: lab.source, hash: location.hash.length };
  })()`);
  // A comet of the game: the home system's first (seed 1337).
  r.loadedComet = await evaluate(`(async () => {
    await lab.loadComet('1337', 6, 0);
    return { kind: lab.planet.kind, name: lab.planet.name, source: lab.source, jets: !!lab.level.comet };
  })()`);
  // A named asteroid of the game: the home system's first belt's first.
  r.loadedAsteroid = await evaluate(`(async () => {
    await lab.loadAsteroid('1337', 6, 0, 0);
    return { kind: lab.planet.kind, shape: !!lab.planet.shape, source: lab.source };
  })()`);
  r.panelType = await evaluate(`(async () => {
    game.debug.panel.controllersRecursive().find((c) => c._name === 'type').setValue('ice');
    await new Promise((ok) => setTimeout(ok, 50));
    await lab.whenReady();
    return lab.planet.type;
  })()`);
  r.screenshot = join(outDir, 'lab.png');
  writeFileSync(r.screenshot, await page.screenshot());
  r.ok =
    r.cases.length === cases.length &&
    r.cases.every((c) => c.ok) &&
    // Planet index 1 is the system's second planet: "<star name> II".
    / II$/.test(r.loaded?.name ?? '') &&
    r.loaded.source?.star === 5 &&
    r.loaded.hash > 100 &&
    r.loadedComet?.kind === 'comet' &&
    /^Comet /.test(r.loadedComet.name) &&
    r.loadedComet.source?.comet === 0 &&
    r.loadedComet.jets &&
    r.loadedAsteroid?.kind === 'asteroid' &&
    r.loadedAsteroid.shape &&
    r.loadedAsteroid.source?.asteroid === 0 &&
    r.panelType === 'ice';
  return r;
}
await section('lab', async () => (lab = await runLab()).ok);

/**
 * The plant lab (plants.html): every architecture grows and draws a lit plant at every level of detail (each
 * cheaper than the one before), zooming out on one plant with the game's own crossfade passes through every level and
 * past the last, the line-up and the grove (the game's SurfaceEntities) draw, a game planet's plants load by star and
 * planet, and the planet lab's Plants link opens its planet's species here. In a browser of its own: after the
 * sections before it, the shared tab sometimes took over a minute to navigate to the page at all.
 */
/** A game planet with plants: the home system's first, Haikrai I (T3, seed 1337). */
const PLANT_STAR = 6;
const PLANT_PLANET = 0;
async function runPlantLab() {
  const own = await launch({ width: 1280, height: 720 });
  try {
    return await plantLabChecks(own);
  } finally {
    errors.push(...own.errors.map((e) => `plant lab: ${e}`));
    await own.close();
  }
}

async function plantLabChecks(page) {
  const evaluate = page.tryEvaluate;
  const r = { architectures: [] };
  if (!(await page.goto(pageUrl('plants.html?gen=3'), `typeof window.plantLab !== 'undefined' && plantLab.ready`, 30000))) return { ok: false, started: false };
  const brightness = `(() => {
    game.redraw();
    const gl = game.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0, n = 0;
    for (let y = Math.floor(h * 0.25); y < h * 0.75; y += 4) for (let x = Math.floor(w * 0.4); x < w * 0.6; x += 4) {
      const i = 4 * (y * w + x); sum += px[i] + px[i + 1] + px[i + 2]; n++;
    }
    return +(sum / (3 * n)).toFixed(1);
  })()`;
  for (const arch of ['conifer', 'broadleaf', 'palm', 'shrub']) {
    const kind = arch === 'shrub' ? 'largeBush' : 'tree';
    r.architectures.push(
      await evaluate(`(async () => {
        await plantLab.generate(5, { kind: '${kind}', architecture: '${arch}' });
        await plantLab.setView({ view: 'specimen', lod: 0 });
        const levels = [];
        for (const lod of [0, 1, 2, 3]) {
          await plantLab.setView({ lod });
          levels.push({ lod, triangles: plantLab.level.lods[lod].triangles, brightness: ${brightness} });
        }
        return { arch: plantLab.species.form.architecture, levels };
      })()`),
    );
  }
  // Zooming out on one plant with the game's own levels and fade: through every level, then gone.
  r.zoom = await evaluate(`(async () => {
    await plantLab.generate(5, { kind: 'tree', architecture: 'broadleaf' });
    await plantLab.setView({ view: 'specimen', lod: 'auto' });
    const seen = [];
    for (const d of [2, 9, 20, 34, 80]) {
      await plantLab.look(0, 10, d);
      await new Promise((ok) => setTimeout(ok, 1200));
      seen.push(plantLab.level.lodNow().lod);
    }
    return seen;
  })()`);
  r.lineup = await evaluate(`(async () => { await plantLab.setView({ view: 'lineup', lod: 0 }); return { meshes: plantLab.level.lods.length, brightness: ${brightness} }; })()`);
  r.grove = await evaluate(`(async () => {
    await plantLab.setView({ view: 'grove', showLods: true });
    await plantLab.look(0, 25, 80);
    return { ...plantLab.level.grove.stats(), brightness: ${brightness} };
  })()`);
  r.screenshot = join(outDir, 'plant-lab.png');
  writeFileSync(r.screenshot, await page.screenshot());
  await evaluate(`plantLab.setView({ view: 'specimen', showLods: false })`);
  r.loaded = await evaluate(`(async () => {
    await plantLab.load('1337', ${PLANT_STAR}, ${PLANT_PLANET});
    return { species: plantLab.state.species.length, tier: plantLab.state.tier, source: plantLab.state.source, hash: location.hash.length };
  })()`);
  // The planet lab at the same planet links to its plants, and the link opens them here.
  if (!(await page.goto(pageUrl(`lab.html?seed=1337&star=${PLANT_STAR}&planet=${PLANT_PLANET}`), `typeof window.lab !== 'undefined' && lab.ready`, 30000))) return { ...r, ok: false };
  const link = await evaluate(`(() => { const a = [...document.querySelectorAll('#lab-info a')].find((x) => x.textContent === 'Plants'); return a && !a.hidden ? a.href : null; })()`);
  r.linked = link
    ? (await page.goto(link, `typeof window.plantLab !== 'undefined' && plantLab.ready`, 30000)) &&
      (await evaluate(`({ species: plantLab.state.species.length, source: plantLab.state.source })`))
    : null;
  r.ok =
    r.architectures.length === 4 &&
    r.architectures.every(
      (a, i) =>
        a.arch === ['conifer', 'broadleaf', 'palm', 'shrub'][i] &&
        a.levels.every((l, k) => l.triangles > 0 && l.brightness > 20 && (k === 0 || l.triangles <= a.levels[k - 1].triangles)) &&
        a.levels[3].triangles < a.levels[0].triangles / 4,
    ) &&
    JSON.stringify(r.zoom) === JSON.stringify([0, 1, 2, 3, 4]) &&
    r.lineup.meshes === 4 &&
    r.lineup.brightness > 20 &&
    r.grove.plants > 1000 &&
    r.grove.lods.every((n) => n > 0) &&
    r.grove.brightness > 20 &&
    r.loaded.species > 0 &&
    r.loaded.source?.star === PLANT_STAR &&
    r.loaded.hash > 100 &&
    r.linked?.species === r.loaded.species &&
    r.linked.source?.planet === PLANT_PLANET;
  return r;
}
await section('plants', async () => (plantLab = await runPlantLab()).ok);

/**
 * Touch play on an emulated phone (390x844, real CDP touch events): hold a finger on the star (tooltip), lift
 * (autopilot to it), drag (rotates, no tap), pinch (zoom), Boost (no stick in space), then
 * pinch in at a planet to descend, tap the globe, and pinch out to the system and on to the galaxy, checking which
 * on-screen controls each level shows.
 */
async function runTouch() {
  const W = 390;
  const H = 844;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const start = new URL(url);
  start.searchParams.delete('star');
  await page.goto(start.href, READY, 30000);
  const touch = (type, points) => send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const frames = () => evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  const swipe = async (from, to, steps = 10) => {
    await touch('touchStart', from);
    for (let i = 1; i <= steps; i++) {
      await touch('touchMove', from.map(([x, y], k) => [x + ((to[k][0] - x) * i) / steps, y + ((to[k][1] - y) * i) / steps]));
      await sleep(16);
    }
    await touch('touchEnd', []);
    await frames();
  };
  const pinchUntil = async (mode, spread) => {
    for (let k = 0; k < 10 && (await evaluate(`levels.mode`)) !== mode; k++) {
      await swipe(spread ? [[195, 400], [195, 440]] : [[195, 200], [195, 640]], spread ? [[195, 200], [195, 640]] : [[195, 400], [195, 440]]);
      await sleep(500);
      for (let i = 0; i < 40 && (await evaluate(`levels.transitioning`)); i++) await sleep(250);
    }
    return evaluate(`levels.mode`);
  };
  const controls = `({ ship: document.documentElement.dataset.ship,
    shown: getComputedStyle(document.getElementById('touch-controls')).display !== 'none',
    stick: getComputedStyle(document.getElementById('touch-stick')).display !== 'none' })`;
  const center = (id) =>
    evaluate(`(() => { const b = document.getElementById('${id}').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
  const r = {};

  r.system = await evaluate(`({ touchMode: game.input.touchMode, help: document.getElementById('hud-help').textContent.startsWith('Tap'),
    fullscreenButton: getComputedStyle(document.getElementById('fullscreen-toggle')).display !== 'none', ...${controls} })`);
  const star = await evaluate(`(() => { const p = world.stars[0].renderPosition.clone().project(game.camera); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; })()`);
  await touch('touchStart', [star]);
  await sleep(300);
  r.holdTooltip = await evaluate(`document.getElementById('tooltip').hidden ? null : document.getElementById('tooltip-name').textContent`);
  await touch('touchEnd', []);
  await frames();
  r.tap = await evaluate(`({ star: world.stars[0].name, target: ship.targetBody?.name ?? null, tooltipHidden: document.getElementById('tooltip').hidden })`);

  const yaw = await evaluate(`levels.systemLevel.orbit.targetYaw`);
  await swipe([[150, 500]], [[250, 500]]);
  r.drag = { yaw: +((await evaluate(`levels.systemLevel.orbit.targetYaw`)) - yaw).toFixed(2), tapped: await evaluate(`ship.enRoute || ship.targetBody !== world.stars[0]`) };

  const distance = await evaluate(`levels.systemLevel.orbit.targetDistance`);
  await swipe([[195, 380], [195, 460]], [[195, 340], [195, 500]]); // spread to twice as far apart: half the distance
  r.pinch = +((await evaluate(`levels.systemLevel.orbit.targetDistance`)) / distance).toFixed(2);

  // Boost (it speeds the autopilot up; there's no stick in space).
  await touch('touchStart', [await center('touch-boost')]);
  await sleep(200);
  r.boost = { held: await evaluate(`game.input.isDown('ShiftLeft')`) };
  await touch('touchEnd', []);
  await frames();
  r.boost.released = await evaluate(`!game.input.isDown('ShiftLeft')`);

  // The menu: a tap on the menu button opens it (paused, with the planet lab link), a tap on Resume closes it.
  await touch('touchStart', [await center('menu-toggle')]);
  await touch('touchEnd', []);
  await frames();
  r.menu = await evaluate(`({ opened: menu.isOpen && game.paused, lab: document.getElementById('menu-lab').href.includes('lab.html') })`);
  r.menu.shot = join(outDir, 'touch-menu.png');
  writeFileSync(r.menu.shot, await page.screenshot());
  await touch('touchStart', [await center('menu-resume')]);
  await touch('touchEnd', []);
  await frames();
  r.menu.closed = await evaluate(`!menu.isOpen && !game.paused`);

  // The system map: the Map button (above Boost) opens it over the screen, a tap on a planet flies
  // there, and its × closes it.
  const systemMapShown = `getComputedStyle(document.getElementById('system-map')).display !== 'none' && levels.systemLevel.map.visible`;
  r.systemMap = { closed: !(await evaluate(systemMapShown)), button: await evaluate(`getComputedStyle(document.getElementById('touch-map')).display !== 'none'`) };
  await touch('touchStart', [await center('touch-map')]);
  await touch('touchEnd', []);
  await frames();
  await frames();
  r.systemMap.opened = await evaluate(systemMapShown);
  const planetTap = await evaluate(`(() => {
    const p = levels.systemLevel.map.mapPosition(world.planets[0]);
    const rect = document.getElementById('system-map-canvas').getBoundingClientRect();
    return [rect.left + p.x, rect.top + p.y];
  })()`);
  await touch('touchStart', [planetTap]);
  await touch('touchEnd', []);
  await frames();
  r.systemMap.target = await evaluate(`ship.targetBody === world.planets[0]`);
  r.systemMap.screenshot = join(outDir, 'touch-system-map.png');
  writeFileSync(r.systemMap.screenshot, await page.screenshot());
  await touch('touchStart', [await center('system-map-toggle')]);
  await touch('touchEnd', []);
  await frames();
  r.systemMap.closedAgain = !(await evaluate(systemMapShown));

  // Down to a planet and back.
  await evaluate(`ship.parkAt(world.planets[0])`);
  await sleep(300);
  r.planet = { mode: await pinchUntil('planet', true) };
  if (r.planet.mode === 'planet') {
    Object.assign(r.planet, await evaluate(controls));
    // The map starts closed on touch; the Map button opens it over the screen, a tap on it sets the autopilot
    // there, and its × closes it.
    const mapShown = `getComputedStyle(document.getElementById('planet-map')).display !== 'none' && planet.map.visible`;
    r.planet.map = { closed: !(await evaluate(mapShown)), button: await evaluate(`getComputedStyle(document.getElementById('touch-map')).display !== 'none'`) };
    const mapButton = await center('touch-map');
    await touch('touchStart', [mapButton]);
    await touch('touchEnd', []);
    await frames();
    r.planet.map.opened = await evaluate(mapShown);
    for (let i = 0; i < 40 && !(await evaluate(`planet.map.baked`)); i++) await sleep(250);
    const mapTap = await evaluate(`(() => {
      const V = game.camera.position.constructor;
      window.__mapWant = planet.ship.direction.clone().applyAxisAngle(new V(0, 1, 0), -1);
      const p = planet.map.mapPosition(__mapWant);
      const rect = document.getElementById('planet-map-marks').getBoundingClientRect();
      return [rect.left + p.x, rect.top + p.y];
    })()`);
    await touch('touchStart', [mapTap]);
    await touch('touchEnd', []);
    await frames();
    r.planet.map.tapDegrees = await evaluate(`planet.ship.enRoute ? +(planet.ship.destination.angleTo(__mapWant) * 180 / Math.PI).toFixed(2) : null`);
    r.planet.map.screenshot = join(outDir, 'touch-map.png');
    writeFileSync(r.planet.map.screenshot, await page.screenshot());
    const close = await center('planet-map-toggle');
    await touch('touchStart', [close]);
    await touch('touchEnd', []);
    await frames();
    r.planet.map.closedAgain = !(await evaluate(mapShown));
    const at = await evaluate(`(() => {
      const V = game.camera.position.constructor;
      const u = planet.ship.direction.clone();
      const up = new V(0, 1, 0).applyQuaternion(game.camera.quaternion);
      const t = up.sub(u.clone().multiplyScalar(up.dot(u))).normalize();
      const p = u.multiplyScalar(Math.cos(0.35)).add(t.multiplyScalar(Math.sin(0.35))).multiplyScalar(planet.radius).project(game.camera);
      return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight];
    })()`);
    await touch('touchStart', [at]);
    await touch('touchEnd', []);
    await frames();
    r.planet.tapEnRoute = await evaluate(`planet.ship.enRoute`);
    r.planet.screenshot = join(outDir, 'touch-planet.png');
    writeFileSync(r.planet.screenshot, await page.screenshot());
    r.planet.back = await pinchUntil('system', false);
  }
  r.galaxy = { mode: await pinchUntil('galaxy', false), ...(await evaluate(controls)) };
  r.ok =
    r.system.touchMode &&
    r.system.help &&
    r.system.fullscreenButton &&
    r.system.ship === 'space' &&
    r.system.shown &&
    !r.system.stick &&
    r.holdTooltip === r.tap.star &&
    r.tap.target === r.tap.star &&
    r.tap.tooltipHidden &&
    Math.abs(r.drag.yaw) > 0.3 &&
    !r.drag.tapped &&
    Math.abs(r.pinch - 0.5) < 0.05 &&
    r.boost.held &&
    r.boost.released &&
    r.menu.opened &&
    r.menu.lab &&
    r.menu.closed &&
    r.systemMap.closed &&
    r.systemMap.button &&
    r.systemMap.opened &&
    r.systemMap.target &&
    r.systemMap.closedAgain &&
    r.planet.mode === 'planet' &&
    r.planet.ship === 'surface' &&
    r.planet.shown &&
    r.planet.map.closed &&
    r.planet.map.button &&
    r.planet.map.opened &&
    r.planet.map.tapDegrees !== null &&
    r.planet.map.tapDegrees < 1.5 &&
    r.planet.map.closedAgain &&
    r.planet.stick &&
    r.planet.tapEnRoute &&
    r.planet.back === 'system' &&
    r.galaxy.mode === 'galaxy' &&
    r.galaxy.ship === 'none' &&
    !r.galaxy.shown;
  return r;
}

/**
 * The planet lab on an emulated phone: the controls panel starts folded, the on-screen stick and Map button show
 * in low orbit, a drag turns the camera, a tap on the globe flies the UFO there, and the Map button opens the map
 * over the screen. In a browser of its own: in the same tab, after runTouch's gestures headless Chrome stopped
 * sending the lab page pointer events at all (no pointerdown in 20 probe touches, while a tap on a button still
 * clicked it), so the drag and the globe tap never reached the game's input and this failed every run.
 */
async function runTouchLab() {
  const W = 390;
  const H = 844;
  const phone = await launch({ width: W, height: H });
  try {
    const send = phone.send;
    const evaluate = phone.tryEvaluate;
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (!(await phone.goto(pageUrl('lab.html?gen=4&type=terran'), `typeof window.lab !== 'undefined' && lab.ready`, 30000))) return { ok: false, started: false };
    const tap = async ([x, y]) => {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    };
    const center = (id) =>
      evaluate(`(() => { const b = document.getElementById('${id}').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    const r = {};
    r.layout = await evaluate(`({ touch: document.documentElement.classList.contains('touch'), ship: document.documentElement.dataset.ship,
      stick: getComputedStyle(document.getElementById('touch-stick')).display !== 'none',
      mapButton: getComputedStyle(document.getElementById('touch-map')).display !== 'none',
      panelFolded: game.debug.panel._closed, panelWidth: game.debug.panel.domElement.getBoundingClientRect().width,
      back: !!document.querySelector('#lab-info a.lab-back') })`);
    const yaw = await evaluate(`lab.level.orbit.targetYaw`);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 520, id: 0 }] });
    for (let i = 1; i <= 10; i++) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120 + i * 12, y: 520, id: 0 }] });
      await sleep(16);
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await evaluate(`new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    r.dragYaw = +((await evaluate(`lab.level.orbit.targetYaw`)) - yaw).toFixed(2);
    // The middle of the globe, on screen.
    await tap(await evaluate(`[innerWidth / 2, innerHeight / 2]`));
    r.tapFlies = await evaluate(`lab.level.ship.enRoute`);
    await tap(await center('touch-map'));
    await phone.waitFor(`lab.level.map.visible`, 3000);
    r.mapOpen = await evaluate(`lab.level.map.visible`);
    r.screenshot = join(outDir, 'touch-lab.png');
    writeFileSync(r.screenshot, await phone.screenshot());
    // Its console errors count like the main page's.
    errors.push(...phone.errors.map((e) => `touch lab: ${e}`));
    r.ok =
      r.layout.touch &&
      r.layout.ship === 'surface' &&
      r.layout.stick &&
      r.layout.mapButton &&
      r.layout.panelFolded &&
      r.layout.back &&
      Math.abs(r.dragYaw) > 0.2 &&
      r.tapFlies &&
      r.mapOpen;
    return r;
  } finally {
    await phone.close();
  }
}
await section('touch', async () => {
  touch = await runTouch();
  touchLab = await runTouchLab();
  return touch.ok && touchLab.ok;
});
clearTimeout(timer);

const ok = started && !stalled && Object.keys(sections).length > 0 && Object.values(sections).every((x) => x.ok) && errors.length === 0;
console.error(`[smoke] ${ok ? 'ok' : 'FAILED'} in ${Math.round((Date.now() - T0) / 1000)} s${errors.length ? `, ${errors.length} console errors` : ''}`);
console.log(
  JSON.stringify(
    { ok, started, stalled, sections, before, after, autopilot, pick, systemMap, sky, living, comet, belt, galaxyLoop, nebulas, rogues, dust, seamless, audio, planetLoop, heldZoom, cometLoop, asteroidLoops, planetTypes, touch, touchLab, lab, plantLab, fps, errors, screenshot, galaxyScreenshot: join(outDir, 'galaxy.png') },
    null,
    2,
  ),
);

await page.close();
process.exit(ok ? 0 : 1);
