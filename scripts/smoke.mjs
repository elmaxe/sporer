// Headless browser smoke test over the Chrome DevTools Protocol.
// Usage: npm run smoke [-- [options] [http://localhost:5173/]]   (dev server must be running)
//   --only <sections>  run just these, comma-separated, in the usual order: core (flying, picking, system map,
//                      living stars, comets, sky), galaxy (the galaxy loop), nebulas (every kind on the map
//                      and from inside), rogues (fly to a rogue planet and down to it), blackholes (find a black
//                      hole on the map, fly into its system: its shadow, bent sky and disc, and down to a planet there), dust (a young star's disc,
//                      a debris disc, comet dust trails, meteor showers and impact flashes in low orbit), audio, planet (the home planet
//                      loop, held zoom, seamless zooms), types (every planet type and geyser kind), lab, plants
//                      (the plant lab), animals (the animal lab), stars (the star lab, a black hole too), touch, cargo (the abduction beam and the hold), volcano (the volcano bomb), buster
//                      (the planet buster, last: it blows up a moon of the home system)
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
// galaxies, twinkles, spins, draws binaries as two dots and its arms' gas and haze, and picking works while it's turned), a real click on the
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
// particles in the air while one erupts; the loop also visits a body with each kind (steam, cryo planet and moon, sulphur,
// fumarole), and every body with geysers has their sound. Every solid body has rocks on its ground once the camera is down
// near it, and over water, low, the ship's downwash stirs the sea.
// Plants: bodies of tier 1 and up have plants around the ship (none on tier 0 or gas giants), hovering one shows it in the
// tooltip, the menu's Plants button turns them off and on, and a removed plant stays in the change list.
// Weather: every body in the planet loop has the weather its climate says (or none), as clouds in the system view and
// low orbit (water and methane worlds' as puffy clusters, some in view), with storms and flashes coming and going over time; the loop also visits an acid-deck (Venus-like, with
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
// Cargo beam: the item bar's Inventory tab (grey; the bar and its tooltips take the tab's colour) holds the beam;
// over a forest on the home planet a real 1 arms it, holding the mouse on a tree beams it up (the ship stays) into the
// hold (a stack with the plant's picture and count), letting go halfway drops it again, holding on bare ground fires
// the beam there too (and the ship stays), sweeping it over the forest catches several plants, a real 3 selects the stack and
// holding on the ground sets it down to take root; one dropped with a click falls from the ship (which stays), one set
// down in the sea drowns; what was taken
// and planted is still so after leaving and coming back; the cues abductStart, abductBeam, abductSuccess, exportBeam
// and dropImpact are asked for (all that with the animals hidden, so only plants are caught). Then with the animals
// shown, over a herd: holding the beam on an animal beams it up into its own stack (an animal's picture), and set down
// on the ground it roams there; Tab and a real 3 arm the laser (Weapons' third slot), and holding it on an animal and on
// a tree kills them (recorded as removed, burning away), with the laserBeam and laserHit cues; the animals taken or
// killed and the one set down are still so after leaving and coming back.
// Volcano bomb: pressing 2 in the system says where to use it; in low orbit over a solid planet a real 2 arms it and a
// real click on the ground fires it: a volcano rises there (the ground under it is higher, the ship flies over it; its
// cone is one chunk seen from afar and splits into finer ones next to it, like the terrain), the cues go fire → rise, the bomb stays armed for another; over a gas giant it can't be used; the system view's globe
// shows it, it's still there (risen) when the planet is visited again, and on the globe after a trip to the galaxy.
// Planet buster (last, as it leaves a moon of the home system busted): the item bar shows in the system with the
// buster unusable (pressing 1 says where to use it); in low orbit over a moon, a real 1 arms it and a real click on the
// globe fires it (once); scrolling out is refused until it's over; the screen flashes, the globe gives way to debris,
// the sounds go fire → flight → impact → explode (with audio on); afterwards it can't be armed again, the HUD and the
// system view's tooltip say it's a debris field, revisiting low orbit shows the field (no globe, no plants or weather),
// and it's still busted after a trip out to the galaxy and back.
// Planet lab (lab.html): every type, a moon, a comet and an asteroid build and draw in both views, a game planet, a game comet
// and a game asteroid load, the panel works, and the readout's Report button saves a debug dump of the lab.
// Plant lab (plants.html): every architecture grows and draws at every level of detail, each level cheaper than the
// last, zooming out on one plant goes through the levels (the game's crossfade) and past the last one, the line-up and
// the grove (the game's own plant system) draw, close up and as a whole planet, a game planet's plants load, the planet lab links to its plants,
// and the Report button saves a debug dump of the lab.
// Animals: in the animal lab every body plan draws at every level of detail, the specimen walks and grazes, zooming out goes
// through the levels, the line-ups and herds draw, a game planet's animals load, the planet lab links to them; in the game a
// herd roams near the ship on the home planet and the tooltip names an animal under the pointer; the planet map's Species
// tab lists the planet's animals and plants with their pictures and counts the herds; a real click on that herd's species
// picks it, but the radar stays quiet until the item bar's Radar switch is turned on (a real click): then waves round the
// ship, close by, whole rings, the radarPing cue at its highest pitch; switched off it goes quiet again, and a second click on the species stops it.
// Prints JSON with FPS, console errors and screenshot paths. Exit 1 on failure.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, sleep, StallError } from './lib/browser.mjs';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const SECTIONS = ['core', 'galaxy', 'nebulas', 'rogues', 'blackholes', 'dust', 'audio', 'planet', 'types', 'lab', 'plants', 'animals', 'stars', 'touch', 'cargo', 'volcano', 'buster'];
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
let before, after, autopilot, pick, systemMap, sky, living, comet, belt, galaxyLoop, fps, audio, planetLoop, heldZoom, cometLoop, asteroidLoops, seamless, nebulas, rogues, blackHoles, dust;
const planetTypes = [];
let lab = null;
let buster = null;
let cargo = null;
let volcano = null;
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
  // Heard: a vent loop wherever there are geysers.
  r.ventSounds = await evaluate(`!!planet.ventSounds === !!planet.geysers && (!planet.ventSounds || planet.ventSounds.level >= 0)`);
  // Loose rocks on every solid body's ground, loaded now the camera is down near it (none on giants).
  r.rocks = await evaluate(`planet.rocks && new Promise((resolve) => {
    const wall = performance.now();
    const check = () => (planet.rocks.settled || performance.now() - wall > 8000 ? resolve(planet.rocks.stats()) : requestAnimationFrame(check));
    check();
  })`);
  r.expectedRocks = await evaluate(`__body.config.type !== 'gas' && !(__body.config.bands && __body.config.bands.length)`);
  // Over water or lava, low, the ship's downwash stirs the sea under it.
  r.wake = await evaluate(`planet.wake && (() => {
    const w = planet.wake, g = planet.globe, dir = planet.ship.object.position.clone().normalize();
    const landing = g.landingAt(dir), over = landing === 'sea' || landing === 'lava', height = planet.ship.object.position.length() - g.radius;
    return { over, height, strength: w.strength };
  })()`);
  // The body's weather (if its climate gives it any): the same look in the system view and here, storms coming and
  // going and lightning where it should be, over a stretch of the level's clock.
  r.expectedWeather = await evaluate(`({ kind: weatherKind(__body.config.type, __body.config.climate), volcanic: volcanicLightning(__body.config.type, __body.config.climate) })`);
  r.weather = await evaluate(`planet.weather && new Promise((resolve) => {
    const look = planet.weather.look;
    const start = planet.frame.renderTime, wall = performance.now();
    let storms = 0, flashes = 0, shafts = 0, puffs = 0;
    const clouds = planet.scene.getObjectByName('Clouds');
    (function f() {
      storms = Math.max(storms, look.shown.length);
      puffs = Math.max(puffs, look.puffs[0] ? look.puffs[0].puffCount : 0);
      flashes = Math.max(flashes, look.flashCount);
      shafts = Math.max(shafts, planet.weather.shaftCount);
      // 4 s of the level's clock (bounded in wall time, should the clock stall).
      if (planet.frame.renderTime - start < 4 && performance.now() - wall < 20000) return requestAnimationFrame(f);
      resolve({ kind: look.data.kind, volcanic: look.data.volcanic, lightning: look.data.storms.some((s) => s.lightning > 0) || look.data.backgroundLightning > 0,
        storms, flashes, shafts, clouds: !!clouds && clouds.visible, systemView: !!__body.weather && __body.weather.data.kind === look.data.kind,
        // Water and methane worlds' clouds are puffy clusters (gen/cumulus.ts), some of them in view.
        puffy: !!look.cumulus, puffs,
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
    r.ventSounds &&
    (r.expectedRocks ? r.rocks && r.rocks.cells > 0 : r.rocks === null) &&
    (!r.wake || !r.wake.over || r.wake.height > 4 || r.wake.strength > 0.9) &&
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
        r.weather.puffy === (r.weather.kind === 'water' || r.weather.kind === 'methane') &&
        (!r.weather.puffy || r.weather.puffs > 0) &&
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

if (started && (runs('galaxy') || runs('nebulas') || runs('rogues') || runs('blackholes') || runs('dust') || runs('audio') || runs('planet'))) {
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
      dust: level.dust.counts,
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
    galaxyLoop.polish.dust.gas > 0 &&
    galaxyLoop.polish.dust.haze > 0 &&
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

/**
 * A black hole on screen: the mean brightness (0–255) of its shadow's middle and of the ring round it out to
 * its disc, read from the canvas just drawn.
 */
const holeBrightness = `(() => {
  game.redraw();
  const hole = world.stars[0];
  const cam = game.camera;
  const c = hole.renderPosition.clone().project(cam);
  const up = cam.up.clone().applyQuaternion(cam.quaternion);
  const px = (radius) => {
    const e = hole.renderPosition.clone().add(up.clone().multiplyScalar(radius)).project(cam);
    return 0.5 * Math.hypot((e.x - c.x) * gl.drawingBufferWidth, (e.y - c.y) * gl.drawingBufferHeight);
  };
  const gl = game.renderer.getContext();
  const cx = (c.x + 1) / 2 * gl.drawingBufferWidth, cy = (c.y + 1) / 2 * gl.drawingBufferHeight;
  const shadow = px(hole.radius), disc = px(hole.pickRadius);
  const p = new Uint8Array(4);
  const mean = (from, to, dy = 0) => {
    let sum = 0, n = 0;
    for (let k = 0; k < 160; k++) {
      const a = k * 2.39996, r = from + (to - from) * ((k + 0.5) / 160);
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + dy + Math.sin(a) * r);
      if (x < 0 || y < 0 || x >= gl.drawingBufferWidth || y >= gl.drawingBufferHeight) continue;
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      sum += p[0] + p[1] + p[2]; n++;
    }
    return n ? +(sum / (3 * n)).toFixed(2) : null;
  };
  // Edge on, the disc's near side crosses the shadow's middle: its upper half is still black.
  return { centre: mean(0, shadow * 0.3), upper: mean(0, shadow * 0.15, shadow * 0.55), disc: mean(shadow * 1.6, disc), shadowPx: +shadow.toFixed(1) };
})()`;

await section('blackholes', async () => {
  const r = (blackHoles = {});
  const home = await evaluate(`system.id`);
  const segmentsBefore = await evaluate(`window.__seamless ? __seamless.segments.length : 0`);
  await until(`!levels.transitioning`, 20000);
  await evaluate(`levels.toGalaxy()`);
  await until(`levels.mode === 'galaxy' && !levels.transitioning`, 40000);
  r.map = await evaluate(`(() => {
    const holes = galaxy.stars.filter((s) => s.stars[0].kind === 'blackHole');
    const rings = levels.galaxyLevel.map.holeCount;
    return { holes: holes.length, rings, expected: Math.round(galaxy.stars.length / 1000), inRemnant: holes.some((s) => s.nebula?.kind === 'remnant'), home: holes.some((s) => s.id === ${home}) };
  })()`);
  // Hover and click one, from its nearest star, as for a rogue planet.
  r.pick = await evaluate(`new Promise((resolve) => {
    const level = levels.galaxyLevel;
    const holes = galaxy.stars.filter((s) => s.stars[0].kind === 'blackHole');
    const target = holes.find((x) => !x.nebula) ?? holes[0];
    const d = (s) => Math.hypot(s.position.x - target.position.x, s.position.y - target.position.y, s.position.z - target.position.z);
    const from = galaxy.stars.filter((s) => s !== target).sort((a, b) => d(a) - d(b))[0];
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
      resolve({ hole: target.id, name: target.name, onScreen: Math.abs(p.x) < 1 && Math.abs(p.y) < 1, tooltip, destination: level.ship.destination?.id ?? null });
    }, 1500);
  })`);
  r.arrived = (await until(`!levels.galaxyLevel.ship.travelling`, 40000)) && (await evaluate(`levels.galaxyLevel.ship.current.id`)) === r.pick.hole;
  if (await evaluate(`!!window.__seamless`)) await evaluate(`__seamless.freezeWhen = 'system'`);
  await evaluate(`levels.toSystem()`);
  r.handoverShot = await freezeShot('blackhole-handover');
  r.entered = await until(`levels.mode === 'system' && !levels.transitioning && system.id === ${r.pick.hole}`, 40000);
  r.flewIn = await until(`!ship.enRoute`, 40000);
  r.system = await evaluate(`({
    kind: world.stars[0].data.kind,
    hud: document.getElementById('hud-location').textContent,
    url: location.search,
    hovering: ship.targetBody === world.stars[0],
    skyBaked: !!world.sky?.ready,
    planets: world.planets.length,
    innermost: world.planets[0]?.config.orbit.radius ?? null,
    reach: system.starZone,
  })`);
  // Seen from where the camera arrives, then from the disc's plane (the far side bent over the top).
  r.arrival = await evaluate(holeBrightness);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  r.screenshot = join(outDir, 'blackhole-system.png');
  writeFileSync(r.screenshot, Buffer.from(shot.result.data, 'base64'));
  await evaluate(`(() => {
    const o = levels.systemLevel.orbit, hole = world.stars[0];
    o.setFocus(hole.renderPosition);
    o.setDistance(hole.pickRadius * 1.65);
    o.lookFrom(hole.renderPosition.clone().set(1, 0.08, 0.25));
  })()`);
  await sleep(800);
  r.edgeOn = await evaluate(holeBrightness);
  const edge = await send('Page.captureScreenshot', { format: 'png' });
  r.edgeScreenshot = join(outDir, 'blackhole-edge-on.png');
  writeFileSync(r.edgeScreenshot, Buffer.from(edge.result.data, 'base64'));
  await evaluate(`levels.systemLevel.orbit.setFocus(null)`);
  r.fps = await evaluate(measureFps);
  // Down to its first planet and back: the hole is in the sky there.
  r.loop = r.system.planets > 0 ? await runPlanetLoop('world.planets[0]', 'blackhole-low-orbit') : { ok: true, none: true };
  r.segments = await evaluate(`window.__seamless ? __seamless.segments.slice(${segmentsBefore}).map((seg) => ({
    zoom: seg.from + ' → ' + seg.to,
    crossfadeFrames: seg.frames.filter((x) => x.weight !== null && x.weight > 0 && x.weight < 1).length,
    minBrightness: +Math.min(...seg.frames.map((x) => x.brightness)).toFixed(2),
  })) : null`);
  await evaluate(`levels.toGalaxy()`);
  await until(`levels.mode === 'galaxy' && !levels.transitioning`, 40000);
  await evaluate(`levels.galaxyLevel.ship.jumpTo(galaxy.stars[${home}]), levels.toSystem()`);
  r.back = await until(`levels.mode === 'system' && !levels.transitioning && system.id === ${home}`, 40000);

  r.ok =
    r.map.holes === r.map.expected &&
    r.map.holes > 0 &&
    r.map.rings === r.map.holes &&
    r.map.inRemnant &&
    !r.map.home &&
    r.pick.onScreen &&
    r.pick.tooltip?.name === r.pick.name &&
    r.pick.tooltip.text.includes('Black hole') &&
    r.pick.destination === r.pick.hole &&
    r.arrived &&
    r.entered &&
    r.flewIn &&
    r.system.kind === 'blackHole' &&
    r.system.hud.includes('Black hole') &&
    r.system.url.includes(`star=${r.pick.hole}`) &&
    r.system.hovering &&
    r.system.skyBaked &&
    (r.system.innermost === null || r.system.innermost > r.system.reach) &&
    // The shadow is black, the disc round it lit (from where the camera arrives and edge on).
    r.arrival.centre < 12 &&
    r.arrival.disc > 25 &&
    r.edgeOn.upper < 12 &&
    r.edgeOn.disc > 12 &&
    r.loop.ok &&
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
  // And with the ship at the same body and the view from the same side (coming back through the galaxy map leaves the
  // view facing the way it arrived from, and the planet section's descent lands where the view faces).
  const view = await evaluate(`(() => {
    const o = levels.systemLevel.orbit, V = game.camera.position.constructor;
    return { dir: o.direction(new V()).toArray(), zoom: o.zoom, body: ship.targetBody.name };
  })()`);
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
  await evaluate(`(() => {
    const body = [...world.stars, ...world.planets, ...world.moons].find((b) => b.name === ${JSON.stringify(view.body)});
    if (body) ship.parkAt(body);
    const o = levels.systemLevel.orbit;
    o.setDistance(${view.zoom});
    o.lookFrom(new (game.camera.position.constructor)(...${JSON.stringify(view.dir)}));
  })()`);

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
      if (Object.keys(found).length === want.length + 10) break;
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
  return planetTypes.every((r) => r.ok) && planetTypes.length === 17; // 7 types, ringed, moon, 5 geyser kinds and 3 weather kinds
});
const screenshot = join(outDir, 'screenshot.png');
if (started && !stalled) writeFileSync(screenshot, await page.screenshot());

/**
 * The planet lab (lab.html): every planet type and a moon build in the globe and system views and draw a lit
 * planet (mean brightness of the middle of the canvas), lava worlds have eruptions, a game planet loads by
 * star and index with its name, the panel's type control rebuilds the planet, the page URL keeps a link, and the
 * Report button saves a debug dump of it.
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
  r.dump = await labDump(page);
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
    r.panelType === 'ice' &&
    labDumpOk(r.dump, 'planet-lab');
  return r;
}

/**
 * A lab's debug dump: the readout's Report button opens the dump dialog with the screen, and Save makes the JSON
 * file with the pictures and the lab's state (its #hash, the camera), no game state.
 */
async function labDump(page) {
  const evaluate = page.tryEvaluate;
  await evaluate(`window.__dumpBlob = null; { const o = URL.createObjectURL; URL.createObjectURL = (b) => { window.__dumpBlob = b; return o(b); }; }
    document.getElementById('lab-dump').click()`);
  if (!(await page.waitFor(`!document.getElementById('dump').hidden && document.getElementById('dump-image').naturalWidth > 0`, 60000))) return { opened: false };
  await evaluate(`document.getElementById('dump-note').value = 'lab'; document.getElementById('dump-save').click()`);
  if (!(await page.waitFor(`window.__dumpBlob !== null && document.getElementById('dump').hidden`, 60000))) return { opened: true, saved: false };
  return evaluate(`window.__dumpBlob.text().then((t) => { const d = JSON.parse(t);
    return { opened: true, saved: true, format: d.format, app: d.app, note: d.note, state: d.state, hash: d.lab?.hash === location.hash.slice(1),
      zoom: d.lab?.camera.zoom ?? 0, screen: !!d.images.screen?.startsWith('data:image/jpeg'), annotated: !!d.images.annotated?.startsWith('data:image/jpeg'),
      tunables: !!d.tunables, running: !game.paused }; })`);
}

function labDumpOk(d, app) {
  return !!d && d.saved && d.format === 'sporer-debug-dump' && d.app === app && d.note === 'lab' && d.state === null && d.hash && d.zoom > 0 && d.screen && d.annotated && d.tunables && d.running;
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
  r.dump = await labDump(page);
  // The grove is a whole planet: zoomed out, the globe lit in the middle of the view, in space.
  r.globe = await evaluate(`(async () => {
    await plantLab.look(0, 90, 880);
    return { brightness: ${brightness}, sky: plantLab.level.scene.background.getHSL({}).l };
  })()`);
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
    r.globe.brightness > 20 &&
    r.globe.sky < 0.05 &&
    r.loaded.species > 0 &&
    r.loaded.source?.star === PLANT_STAR &&
    r.loaded.hash > 100 &&
    r.linked?.species === r.loaded.species &&
    r.linked.source?.planet === PLANT_PLANET &&
    labDumpOk(r.dump, 'plant-lab');
  return r;
}
await section('plants', async () => (plantLab = await runPlantLab()).ok);

/**
 * Animals: in the animal lab (animals.html, a browser of its own), every body plan grows and draws at every level of
 * detail (each cheaper than the one before), the specimen walks and grazes and zooming out on it passes through every
 * level and past the last, the line-ups draw, the herds view roams with the game's SurfaceAnimals, a game planet's
 * animals load and the planet lab's Animals link opens them; then in the game, on the home system's habitable planet,
 * a herd is drawn near the ship, walking or grazing, and hovering an animal names it in the tooltip.
 */
async function runAnimalLab() {
  const own = await launch({ width: 1280, height: 720 });
  try {
    return await animalLabChecks(own);
  } finally {
    errors.push(...own.errors.map((e) => `animal lab: ${e}`));
    await own.close();
  }
}

async function animalLabChecks(page) {
  const evaluate = page.tryEvaluate;
  const r = { plans: [] };
  if (!(await page.goto(pageUrl('animals.html?gen=3'), `typeof window.animalLab !== 'undefined' && animalLab.ready`, 30000))) return { ok: false, started: false };
  const brightness = `(() => {
    game.redraw();
    const gl = game.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0, n = 0;
    for (let y = Math.floor(h * 0.3); y < h * 0.7; y += 4) for (let x = Math.floor(w * 0.4); x < w * 0.6; x += 4) {
      const i = 4 * (y * w + x); sum += px[i] + px[i + 1] + px[i + 2]; n++;
    }
    return +(sum / (3 * n)).toFixed(1);
  })()`;
  for (const plan of ['quadruped', 'hexapod', 'biped']) {
    r.plans.push(
      await evaluate(`(async () => {
        await animalLab.generate(5, { plan: '${plan}' });
        await animalLab.setView({ view: 'specimen', lod: 0, pace: 'stand' });
        await animalLab.look(60, 15, 2.4);
        const levels = [];
        for (const lod of [0, 1, 2]) {
          await animalLab.setView({ lod });
          levels.push({ lod, triangles: animalLab.level.lods[lod].triangles, brightness: ${brightness} });
        }
        return { plan: animalLab.species.form.plan, legs: animalLab.level.skeleton.legs.filter((l) => !l.arm).length, levels };
      })()`),
    );
  }
  // Walking round its circle: it moves, its legs swing (the drawn picture changes between frames as it goes).
  r.walk = await evaluate(`(async () => {
    await animalLab.generate(5, { plan: 'quadruped' });
    await animalLab.setView({ view: 'specimen', lod: 'auto', pace: 'walk' });
    const at = () => animalLab.level.posed[0].mesh.instanceMatrix.array.slice(12, 15);
    const a = at();
    await new Promise((ok) => setTimeout(ok, 1500));
    const b = at();
    return { moved: +Math.hypot(b[0] - a[0], b[2] - a[2]).toFixed(2), stride: +animalLab.level.posed[0].anim.array[1].toFixed(2) };
  })()`);
  r.graze = await evaluate(`(async () => { await animalLab.setView({ pace: 'graze' }); await new Promise((ok) => setTimeout(ok, 4000)); return +animalLab.level.posed[0].anim.array[3].toFixed(2); })()`);
  // Zooming out with the game's own levels and fade: through every level, then gone.
  r.zoom = await evaluate(`(async () => {
    await animalLab.setView({ pace: 'stand' });
    const seen = [];
    for (const d of [3, 20, 50, 160]) {
      await animalLab.look(0, 10, d);
      await new Promise((ok) => setTimeout(ok, 1200));
      seen.push(animalLab.level.lodNow().lod);
    }
    return seen;
  })()`);
  r.lineup = await evaluate(`(async () => { await animalLab.setView({ view: 'lineup', lod: 0 }); return { meshes: animalLab.level.posed.length, brightness: ${brightness} }; })()`);
  r.species = await evaluate(`(async () => { await animalLab.setView({ view: 'species' }); return { meshes: animalLab.level.posed.length, set: animalLab.state.species.length }; })()`);
  r.herds = await evaluate(`(async () => {
    await animalLab.setView({ view: 'herds', showLods: true });
    await animalLab.lookAtHerd();
    await animalLab.look(0, 35, 30);
    await new Promise((ok) => setTimeout(ok, 1500));
    return animalLab.level.herds.stats();
  })()`);
  r.screenshot = join(outDir, 'animal-lab.png');
  writeFileSync(r.screenshot, await page.screenshot());
  await evaluate(`animalLab.setView({ view: 'specimen', showLods: false })`);
  r.loaded = await evaluate(`(async () => {
    await animalLab.load('1337', ${PLANT_STAR}, ${PLANT_PLANET});
    return { species: animalLab.state.species.length, tier: animalLab.state.tier, source: animalLab.state.source, gravity: animalLab.view.gravity, hash: location.hash.length };
  })()`);
  if (!(await page.goto(pageUrl(`lab.html?seed=1337&star=${PLANT_STAR}&planet=${PLANT_PLANET}`), `typeof window.lab !== 'undefined' && lab.ready`, 30000))) return { ...r, ok: false };
  const link = await evaluate(`(() => { const a = [...document.querySelectorAll('#lab-info a')].find((x) => x.textContent === 'Animals'); return a && !a.hidden ? a.href : null; })()`);
  r.linked = link
    ? (await page.goto(link, `typeof window.animalLab !== 'undefined' && animalLab.ready`, 30000)) &&
      (await evaluate(`({ species: animalLab.state.species.length, source: animalLab.state.source })`))
    : null;
  r.ok =
    r.plans.length === 3 &&
    r.plans.every(
      (a, i) =>
        a.plan === ['quadruped', 'hexapod', 'biped'][i] &&
        a.legs === [4, 6, 2][i] &&
        a.levels.every((l, k) => l.triangles > 0 && l.brightness > 20 && (k === 0 || l.triangles < a.levels[k - 1].triangles)),
    ) &&
    r.walk.moved > 0.2 &&
    r.walk.stride > 0.5 &&
    r.graze > 0 &&
    JSON.stringify(r.zoom) === JSON.stringify([0, 1, 2, 3]) &&
    r.lineup.meshes === 3 &&
    r.lineup.brightness > 20 &&
    r.species.meshes === r.species.set &&
    r.herds.herds > 5 &&
    r.herds.drawn > 0 &&
    r.herds.walking + r.herds.grazing > 0 &&
    r.loaded.species > 0 &&
    r.loaded.source?.star === PLANT_STAR &&
    r.loaded.hash > 100 &&
    r.linked?.species === r.loaded.species &&
    r.linked.source?.planet === PLANT_PLANET;
  return r;
}

async function runGameAnimals() {
  if (!(await page.goto(url, READY, 60000))) return { ok: false };
  await drawFrames(20);
  await evaluate(`(() => { const p = world.planets.find((b) => b.config.climate && b.config.climate.habitability >= 2 && b.config.climate.insolation > 0); ship.parkAt(p); levels.toPlanet(p); })()`);
  await until(`levels.mode === 'planet' && !levels.transitioning`, 60000);
  // Over the first herd of four or more, a little to its side, zoomed in.
  const r = { named: false };
  r.found = await evaluate(`(async () => { const g = await import('/src/gen/animals.ts'); const A = planet.animals; if (!A) return null; const n = g.herdGridSize(A.plan.radius);
    for (let f = 0; f < 6; f++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const h = g.generateHerd(A.plan, A.ground, f, i, j);
      if (h && h.count >= 4) { const pose = {}; new g.HerdPath(A.plan, A.ground, h, { hipHeight: 1 }).pose(0, planet.frame.renderTime, pose); const e1 = {}, e2 = {}; g.tangentBasis(pose, e1, e2);
        planet.ship.placeAt(new (planet.ship.up.constructor)(pose.x + e1.x * 0.012, pose.y + e1.y * 0.012, pose.z + e1.z * 0.012).normalize()); return { species: A.plan.species[h.species].name, count: h.count }; } }
    return null; })()`);
  await evaluate(`planet.orbit.zoomTo(10)`);
  await sleep(2000);
  await until(`planet.animals.settled`, 30000);
  await until(`Math.abs(planet.ship.radius - planet.ship.goalRadius) < 0.05`, 30000);
  await drawFrames(10);
  r.stats = await evaluate(`planet.animals.stats()`);
  // Hover the nearest drawn animal (aimed and moved to in one go, as the camera may still ease): the tooltip names it.
  for (let i = 0; i < 6 && !r.named; i++) {
    r.tooltip = await evaluate(`new Promise((resolve) => {
      const A = planet.animals; const v = new (planet.ship.up.constructor)(); const canvas = game.renderer.domElement; const rect = canvas.getBoundingClientRect();
      let at = null;
      for (const p of A.herdPositions()) { v.copy(p).addScaledVector(p.clone().normalize(), 0.4); A.object.localToWorld(v); const s = v.clone().project(game.camera);
        if (Math.abs(s.x) < 0.9 && Math.abs(s.y) < 0.9 && s.z < 1) { at = { clientX: rect.left + ((s.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - s.y) / 2) * rect.height, bubbles: true }; break; } }
      if (!at) return resolve(null);
      canvas.dispatchEvent(new PointerEvent('pointermove', at));
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.getElementById('tooltip').hidden ? null : document.getElementById('tooltip-name').textContent)));
    })`);
    r.named = (await evaluate(`planet.animals.plan.species.map((s) => s.name)`)).includes(r.tooltip);
  }
  r.screenshot = join(outDir, 'animals.png');
  writeFileSync(r.screenshot, await page.screenshot());
  r.radar = await runRadar(r.found?.species);
  r.ok = !!r.found && r.stats.herds > 0 && r.stats.drawn > 0 && r.stats.drawCalls > 0 && r.named && r.radar.ok;
  return r;
}

/**
 * The planet map's Species tab and the radar, over the herd `name` runGameAnimals found: real clicks on the tab and on
 * the species' row (which unlock audio, so the radarPing cue is asked for).
 */
async function runRadar(name) {
  const r = {};
  const click = async (selector) => {
    const at = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' });
      const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!at) return false;
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...at, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    await drawFrames(2);
    return true;
  };
  await evaluate(`(() => { window.__cues = []; window.__rates = []; const play = audio.play.bind(audio);
    audio.play = (c, o) => (__cues.push(c), c === 'radarPing' && __rates.push(o?.rate), play(c, o)); })()`);
  // The debug panel sits over the map's title bar: out of the way meanwhile.
  await evaluate(`document.querySelectorAll('.lil-gui.lil-auto-place').forEach((e) => (e.style.visibility = 'hidden'))`);
  r.tab = await click('#planet-map-tabs button[data-tab=species]');
  await until(`planet.radar.census.done && [...document.querySelectorAll('#planet-species .species-icon')].every((i) => i.src.startsWith('data:image/png'))`, 30000);
  await drawFrames(20);
  r.list = await evaluate(`({ tab: planet.map.tab, drawing: planet.map.drawing, shown: !document.getElementById('planet-species').hidden,
    animals: document.querySelectorAll('#planet-species .species-row.animal').length, plants: document.querySelectorAll('#planet-species .species-row.plant').length,
    species: planet.animals.plan.species.length, plantSpecies: planet.plants?.plan.species.length ?? 0,
    statuses: [...document.querySelectorAll('#planet-species .species-row.animal .species-status')].map((e) => e.textContent),
    herds: planet.radar.census.herds.length })`);
  const index = await evaluate(`planet.animals.plan.species.findIndex((s) => s.name === ${JSON.stringify(name ?? '')})`);
  // Picked with the radar off: nothing happens.
  await evaluate(`levels.switches.set('radar', false)`);
  r.picked = await click(`#planet-species .species-row.animal[data-species="${index}"]`);
  await drawFrames(30);
  r.standby = await evaluate(`({ state: planet.radar.state, pings: planet.radar.pingCount, visible: planet.radar.visible,
    status: document.querySelector('#planet-species .species-row.tracking .species-status')?.textContent ?? '', dot: document.getElementById('planet-map-tabs').classList.contains('tracking') })`);
  // The item bar's Radar, in the Inventory: switched on, it tracks.
  await click('.item-tab[data-tab=inventory]');
  r.switchedOn = await click('.item-slot[data-item=radar]');
  r.slotOn = await evaluate(`document.querySelector('.item-slot[data-item=radar]').classList.contains('on')`);
  await until(`planet.radar.state === 'tracking' && planet.radar.pingCount >= ${r.standby.pings + 2}`, 30000);
  await drawFrames(4);
  r.tracking = await evaluate(`({ tracking: planet.radar.tracking, state: planet.radar.state, distance: planet.radar.distance, proximity: planet.radar.proximity,
    visible: planet.radar.visible, pings: planet.radar.pingCount, row: document.querySelector('#planet-species .species-row.tracking')?.dataset.species ?? null,
    status: document.querySelector('#planet-species .species-row.tracking .species-status')?.textContent ?? '',
    dot: document.getElementById('planet-map-tabs').classList.contains('tracking'), cues: __cues.filter((c) => c === 'radarPing').length,
    rates: __rates.slice(), played: audio.lastPlayed && { name: audio.lastPlayed.name, rate: audio.lastPlayed.rate } })`);
  r.nearPitch = await evaluate(`import('/src/radar/radarRules.ts').then((m) => m.radarParams.nearPitch)`);
  // Once the "Radar on" note has had its moment, the hint line says what it tracks.
  await until(`document.getElementById('item-hint').textContent.startsWith('Radar: ')`, 20000);
  r.tracking.hint = await evaluate(`document.getElementById('item-hint').textContent`);
  r.screenshot = join(outDir, 'radar.png');
  writeFileSync(r.screenshot, await page.screenshot());
  // Switched off again: no more pings, the waves die away.
  await click('.item-slot[data-item=radar]');
  const pings = await evaluate(`planet.radar.pingCount`);
  await until(`!planet.radar.visible`, 20000);
  await drawFrames(30);
  r.switchedOff = await evaluate(`({ state: planet.radar.state, more: planet.radar.pingCount - ${pings}, visible: planet.radar.visible, on: levels.switches.isOn('radar') })`);
  await click('.item-tab[data-tab=weapons]');
  await click(`#planet-species .species-row.animal[data-species="${index}"]`);
  r.stopped = await evaluate(`({ tracking: planet.radar.tracking, state: planet.radar.state, row: !!document.querySelector('#planet-species .species-row.tracking') })`);
  await click('#planet-map-tabs button[data-tab=map]');
  r.back = await evaluate(`({ tab: planet.map.tab, drawing: planet.map.drawing, shown: !document.getElementById('planet-species').hidden })`);
  await evaluate(`document.querySelectorAll('.lil-gui.lil-auto-place').forEach((e) => (e.style.visibility = ''))`);
  r.ok =
    r.tab &&
    r.list.tab === 'species' &&
    !r.list.drawing &&
    r.list.shown &&
    r.list.animals === r.list.species &&
    r.list.plants === r.list.plantSpecies &&
    r.list.statuses.every((t) => /^(\d+ (herds?|packs?|seen)|None found)$/.test(t)) &&
    r.list.herds > 0 &&
    index >= 0 &&
    r.picked &&
    r.standby.state === 'standby' &&
    r.standby.pings === 0 &&
    !r.standby.visible &&
    r.standby.status === 'Radar off' &&
    !r.standby.dot &&
    r.switchedOn &&
    r.slotOn &&
    /^Radar: the nearest .+ is (right here|close)$/.test(r.tracking.hint) &&
    r.switchedOff.state === 'standby' &&
    r.switchedOff.more === 0 &&
    !r.switchedOff.visible &&
    !r.switchedOff.on &&
    r.tracking.tracking === index &&
    r.tracking.row === String(index) &&
    r.tracking.distance < 60 &&
    /^Tracking · (right here|close)$/.test(r.tracking.status) &&
    r.tracking.visible &&
    r.tracking.dot &&
    r.tracking.cues >= 2 &&
    // Right above the herd the ping is at its highest (radarParams.nearPitch, or nearly), and the audio manager plays it at that rate.
    r.tracking.rates.length === r.tracking.cues &&
    r.tracking.rates.every((x) => x > r.nearPitch * 0.85 && x <= r.nearPitch + 1e-9) &&
    r.tracking.played?.name === 'radarPing' &&
    Math.abs(r.tracking.played.rate - r.tracking.rates.at(-1)) < 1e-9 &&
    r.stopped.tracking === null &&
    r.stopped.state === 'off' &&
    !r.stopped.row &&
    r.back.tab === 'map' &&
    r.back.drawing &&
    !r.back.shown;
  return r;
}
let animalLab = null;
let gameAnimals = null;
await section('animals', async () => {
  animalLab = await runAnimalLab();
  gameAnimals = await runGameAnimals();
  return animalLab.ok && gameAnimals.ok;
});

let starLab = null;
/**
 * The star lab (stars.html): every kind of star draws lit and alive (storms under way) close up, a game system
 * loads by galaxy and star and draws whole with every planet, the system tuner changes it (planets, comets),
 * following a planet frames it, time stops at speed 0, Sol loads with its real planets, a link
 * round-trips the exact state, and the planet lab's Star link opens its planet's system here. In a browser of
 * its own, like the plant lab.
 */
async function runStarLab() {
  const own = await launch({ width: 1280, height: 720 });
  try {
    return await starLabChecks(own);
  } finally {
    errors.push(...own.errors.map((e) => `star lab: ${e}`));
    await own.close();
  }
}

async function starLabChecks(page) {
  const evaluate = page.tryEvaluate;
  const r = { kinds: [] };
  if (!(await page.goto(pageUrl('stars.html?gen=3'), `typeof window.starLab !== 'undefined' && starLab.ready`, 30000))) return { ok: false, started: false };
  // Mean brightness of the middle of the picture (0–255).
  const brightness = `(() => {
    game.redraw();
    const gl = game.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0, n = 0;
    for (let y = Math.floor(h * 0.4); y < h * 0.6; y += 2) for (let x = Math.floor(w * 0.45); x < w * 0.55; x += 2) {
      const i = 4 * (y * w + x); sum += px[i] + px[i + 1] + px[i + 2]; n++;
    }
    return +(sum / (3 * n)).toFixed(1);
  })()`;
  for (const kind of ['mainSequence', 'redDwarf', 'whiteDwarf', 'redGiant', 'blueGiant']) {
    r.kinds.push(
      await evaluate(`(async () => {
        await starLab.generate(21, { kind: '${kind}', binary: false });
        await starLab.setView({ view: 'star' });
        await starLab.setTime(300);
        await new Promise((ok) => setTimeout(ok, 600));
        const star = starLab.level.world.stars[0];
        return { kind: star.data.kind, brightness: ${brightness}, particles: star.storms.liveParticles };
      })()`),
    );
  }
  // A black hole: its shadow black in the middle, its disc lit round it.
  r.hole = await evaluate(`(async () => {
    await starLab.generate(21, { kind: 'blackHole', binary: false });
    await starLab.setView({ view: 'star' });
    await starLab.look(0, 60);
    await new Promise((ok) => setTimeout(ok, 600));
    game.redraw();
    const gl = game.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // The shadow's middle: a few pixels round the centre (the hole is small in this view).
    let dark = 0, m = 0;
    for (let y = Math.floor(h / 2) - 4; y <= h / 2 + 4; y++) for (let x = Math.floor(w / 2) - 4; x <= w / 2 + 4; x++) {
      const i = 4 * (y * w + x); dark += px[i] + px[i + 1] + px[i + 2]; m++;
    }
    const middle = +(dark / (3 * m)).toFixed(1);
    let lit = 0, n = 0;
    for (let i = 0; i < px.length; i += 4 * 97) { lit += px[i] + px[i + 1] + px[i + 2] > 300 ? 1 : 0; n++; }
    return { kind: starLab.level.world.stars[0].data.kind, middle, lit: +(lit / n).toFixed(3), info: document.getElementById('lab-info').textContent.includes('Black hole') };
  })()`);
  r.holeScreenshot = join(outDir, 'star-lab-black-hole.png');
  writeFileSync(r.holeScreenshot, await page.screenshot());
  r.screenshot = join(outDir, 'star-lab.png');
  writeFileSync(r.screenshot, await page.screenshot());
  r.system = await evaluate(`(async () => {
    await starLab.load('1337', ${PLANT_STAR});
    await starLab.setView({ view: 'system', speed: 1 });
    const w = starLab.level.world;
    return { planets: w.planets.length, expected: starLab.system.planets.length, source: starLab.state.source, links: document.querySelectorAll('#lab-info .lab-planets a').length };
  })()`);
  r.tuned = await evaluate(`(async () => {
    await starLab.setTuning({ planets: 9, comets: 4 });
    const w = starLab.level.world;
    const out = { planets: w.planets.length, comets: w.comets.length };
    await starLab.setTuning({ planets: null, comets: null });
    return { ...out, back: starLab.level.world.planets.length };
  })()`);
  r.focus = await evaluate(`(async () => {
    const name = starLab.system.planets[1].name;
    await starLab.focus(name);
    await new Promise((ok) => setTimeout(ok, 1500));
    const level = starLab.level;
    return { followed: level.focus?.name === name, distance: +level.orbit.zoom.toFixed(1), radius: level.focus.radius };
  })()`);
  r.stopped = await evaluate(`(async () => {
    await starLab.setView({ speed: 0 });
    const t = starLab.level.world.time;
    await new Promise((ok) => setTimeout(ok, 500));
    const still = starLab.level.world.time === t;
    await starLab.setView({ speed: 1 });
    await new Promise((ok) => setTimeout(ok, 500));
    return still && starLab.level.world.time > t;
  })()`);
  r.sol = await evaluate(`(async () => {
    await starLab.load('1337', 'sol');
    return { real: starLab.state.real, earth: starLab.system.planets.some((p) => p.name === 'Earth'), planets: starLab.level.world.planets.length };
  })()`);
  r.link = await evaluate(`(async () => {
    await starLab.generate(8, { binary: true });
    await starLab.setActivity({ spots: 0.9 });
    const link = starLab.link, star = JSON.stringify(starLab.state.stars);
    return { link, star };
  })()`);
  // A fresh page (only the #hash differs, which the browser wouldn't load again).
  r.linkOk =
    !!r.link &&
    (await page.goto(r.link.link.replace('#', '?fresh=1#'), `typeof window.starLab !== 'undefined' && starLab.ready`, 30000)) &&
    (await evaluate(`JSON.stringify(starLab.state.stars)`)) === r.link.star;
  // The planet lab at a game planet links to its system here.
  if (!(await page.goto(pageUrl(`lab.html?seed=1337&star=${PLANT_STAR}&planet=${PLANT_PLANET}`), `typeof window.lab !== 'undefined' && lab.ready`, 30000))) return { ...r, ok: false };
  const link = await evaluate(`(() => { const a = [...document.querySelectorAll('#lab-info a')].find((x) => x.textContent === 'Star'); return a && !a.hidden ? a.href : null; })()`);
  r.linked = link
    ? (await page.goto(link, `typeof window.starLab !== 'undefined' && starLab.ready`, 30000)) &&
      (await evaluate(`({ source: starLab.state.source, view: starLab.view.view, planets: starLab.level.world.planets.length })`))
    : null;
  r.ok =
    r.kinds.length === 5 &&
    r.kinds.every((k, i) => k.kind === ['mainSequence', 'redDwarf', 'whiteDwarf', 'redGiant', 'blueGiant'][i] && k.brightness > 60) &&
    r.kinds.some((k) => k.particles > 0) &&
    r.hole.kind === 'blackHole' &&
    r.hole.middle < 15 &&
    r.hole.lit > 0.005 &&
    r.hole.info &&
    r.system.planets > 0 &&
    r.system.planets === r.system.expected &&
    r.system.links === r.system.expected &&
    r.system.source?.star === PLANT_STAR &&
    r.tuned.planets === 9 &&
    r.tuned.comets === 4 &&
    r.tuned.back === r.system.planets &&
    r.focus.followed &&
    r.focus.distance < r.focus.radius * 10 &&
    r.stopped === true &&
    r.sol.real === 'sol' &&
    r.sol.earth &&
    r.sol.planets > 0 &&
    r.linkOk === true &&
    r.linked?.source?.star === PLANT_STAR &&
    r.linked.view === 'system' &&
    r.linked.planets === r.system.planets;
  return r;
}
await section('stars', async () => (starLab = await runStarLab()).ok);

/**
 * Touch play on an emulated phone (390x844, real CDP touch events): no full-screen button, the first tap goes full
 * screen; hold a finger on the star (tooltip), lift (autopilot to it), drag (rotates, no tap), pinch (zoom), Boost (no stick in space), the menu and its release notes (they fit and scroll with a swipe), then
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
      // Clear of the item bar above the stick (from 152 px up), which a finger landing on wouldn't pinch.
      await swipe(spread ? [[195, 360], [195, 400]] : [[195, 160], [195, 580]], spread ? [[195, 160], [195, 580]] : [[195, 360], [195, 400]]);
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
    fullscreenButton: getComputedStyle(document.getElementById('fullscreen-toggle')).display !== 'none',
    fullscreen: !!document.fullscreenElement, ...${controls} })`);
  const star = await evaluate(`(() => { const p = world.stars[0].renderPosition.clone().project(game.camera); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; })()`);
  await touch('touchStart', [star]);
  await sleep(300);
  r.holdTooltip = await evaluate(`document.getElementById('tooltip').hidden ? null : document.getElementById('tooltip-name').textContent`);
  await touch('touchEnd', []);
  await frames();
  r.tap = await evaluate(`({ star: world.stars[0].name, target: ship.targetBody?.name ?? null, tooltipHidden: document.getElementById('tooltip').hidden })`);
  // The first tap took the page full screen (a phone always plays full screen, so it has no button for it).
  for (let i = 0; i < 20 && !(await evaluate(`!!document.fullscreenElement`)); i++) await sleep(50);
  r.fullscreen = await evaluate(`!!document.fullscreenElement`);

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
  r.menu = await evaluate(`({ opened: menu.isOpen && game.paused, lab: document.getElementById('menu-lab').href.includes('lab.html'), stars: /stars\\.html\\?seed=.+&star=\\d+/.test(document.getElementById('menu-stars').href) })`);
  r.menu.shot = join(outDir, 'touch-menu.png');
  writeFileSync(r.menu.shot, await page.screenshot());
  // The release notes (a long list, put in place of the real one, which may not load here, once the menu's load of it is over)
  // fit the screen and scroll with a swipe.
  await evaluate(`(async () => {
    await menu.notes.refresh();
    const body = Array.from({ length: 8 }, (_, i) => '- A change, ' + i + ', described at some length so that it wraps over a line or two.').join('\\n');
    menu.notes.releases = Array.from({ length: 12 }, (_, i) => ({ tag: 'v' + i, name: 'v' + i, date: '2026-01-01T00:00:00Z', url: 'https://github.com/', body }));
    menu.notes.open();
  })()`);
  await frames();
  r.menu.notes = await evaluate(`(() => {
    const b = document.getElementById('notes-panel').getBoundingClientRect();
    const list = document.getElementById('notes-list');
    return { open: menu.notes.isOpen, fits: b.top >= 0 && b.bottom <= innerHeight, overflows: list.scrollHeight > list.clientHeight };
  })()`);
  // Above y = 600: headless Chrome full screen doesn't scroll for touches lower down (its screen is 800 × 600).
  await swipe([[W / 2, 500]], [[W / 2, 200]]);
  r.menu.notes.scrolled = await until(`document.getElementById('notes-list').scrollTop > 0`, 5000);
  await touch('touchStart', [await center('notes-close')]);
  await touch('touchEnd', []);
  await frames();
  r.menu.notes.closed = await evaluate(`!menu.notes.isOpen && menu.isOpen`);
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
    !r.system.fullscreenButton &&
    !r.system.fullscreen &&
    r.fullscreen &&
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
    r.menu.stars &&
    r.menu.notes.open &&
    r.menu.notes.fits &&
    r.menu.notes.overflows &&
    r.menu.notes.scrolled &&
    r.menu.notes.closed &&
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
  try {
    touch = await runTouch();
    touchLab = await runTouchLab();
  } finally {
    // Back to the desktop tab for the sections after it: left an emulated phone, the game would start in touch mode
    // with its plants off, and clicks meant for the planet land on the item bar.
    await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await send('Emulation.clearDeviceMetricsOverride');
  }
  return touch.ok && touchLab.ok;
});
await section('cargo', async () => {
  // A fresh game (the lab sections leave the page elsewhere).
  if (!(await page.goto(url, READY, 60000))) return false;
  await drawFrames(20);
  const key = async (code, k) => {
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', { type, code, key: k });
      await drawFrames(2);
    }
  };
  const mouse = async (type, at) => {
    await send('Input.dispatchMouseEvent', { type, ...at, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    await drawFrames(2);
  };
  const centreOf = (selector) =>
    evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await evaluate(`(() => {
    window.__cues = [];
    const play = audio.play.bind(audio), start = audio.start.bind(audio);
    audio.play = (c) => (__cues.push(c), play(c));
    audio.start = (c) => (__cues.push(c), start(c));
  })()`);
  // The plants first, with the animals hidden (a herd under the beam would be caught too).
  const animalSwitch = (on) => evaluate(`import('/src/surface/animalParams.ts').then((m) => { m.animalParams.enabled = ${on}; })`);
  await animalSwitch(false);
  // The bar's tabs: Weapons (red) on show, the Inventory (grey) a click away; the whole bar takes the tab's colour.
  const weaponsBorder = await evaluate(`getComputedStyle(document.querySelector('.item-panel')).borderTopColor`);
  await mouse('mouseMoved', await centreOf('.item-tab[data-tab=inventory]'));
  await mouse('mousePressed', await centreOf('.item-tab[data-tab=inventory]'));
  await mouse('mouseReleased', await centreOf('.item-tab[data-tab=inventory]'));
  const tabs = await evaluate(`({ tab: document.getElementById('item-bar').dataset.tab, border: getComputedStyle(document.querySelector('.item-panel')).borderTopColor,
    weaponsTab: getComputedStyle(document.querySelector('.item-tab[data-tab=weapons]')).color, slots: [...document.querySelectorAll('.item-slot[data-item]')].map((s) => s.dataset.item) })`);
  // Hovering the beam's slot: its tooltip in the tab's grey.
  await mouse('mouseMoved', await centreOf('.item-slot[data-item=abduct]'));
  const tooltip = await evaluate(`({ tone: document.getElementById('tooltip').dataset.tone ?? null, name: document.getElementById('tooltip-name').textContent })`);
  await mouse('mouseMoved', { x: 640, y: 200 });

  // Down to the home system's habitable planet, over a forest, close in.
  await evaluate(`(() => { const p = world.planets.find((b) => b.config.climate && b.config.climate.habitability >= 2 && b.config.climate.insolation > 0); window.__home = p; ship.parkAt(p); levels.toPlanet(p); })()`);
  await until(`levels.mode === 'planet' && !levels.transitioning`, 60000);
  const forest = await evaluate(`(async () => { const g = await import('/src/gen/plants.ts'); const P = planet.plants; const n = g.plantGridSize(P.plan.radius);
    for (let j = Math.floor(n * 0.3); j < n; j += 2) for (let i = 2; i < n; i += 2) for (const face of [0, 1, 2, 3, 4, 5]) {
      const c = g.generateCell(P.plan, P.ground, face, i, j); const trees = c.filter((p) => P.plan.species[p.species].kind === 'tree');
      if (trees.length >= 6) { const t = trees[0]; planet.ship.placeAt(new (planet.ship.up.constructor)(t.x, t.y, t.z)); return true; } }
    return false; })()`);
  await evaluate(`planet.orbit.zoomTo(30)`);
  await sleep(1500);
  await until(`planet.plants.settled`, 30000);
  // The ship sinks to its new height (slowly under software rendering): the trees found on screen must stay where they were found.
  await until(`Math.abs(planet.ship.radius - planet.ship.goalRadius) < 0.02`, 30000);
  for (let i = 0, last = null; i < 60; i++) {
    const cam = await evaluate(`game.camera.position.toArray()`);
    if (last && Math.hypot(cam[0] - last[0], cam[1] - last[1], cam[2] - last[2]) < 0.005) break;
    last = cam;
    await drawFrames(5);
  }
  await drawFrames(5);
  await evaluate(`(() => {
    // A tree on screen within the beam's reach (screen point), and ground of a kind (land or sea) without a plant on it.
    const at = (x, y) => ({ x: (x + 1) / 2 * innerWidth, y: (1 - y) / 2 * innerHeight });
    window.__tree = (min, max) => { const c = planet.cargo; let best = null;
      for (let y = 0.6; y > -0.8; y -= 0.03) for (let x = -0.8; x < 0.5; x += 0.03) {
        c.raycaster.setFromCamera(c.ndc.set(x, y), game.camera); const t = c.pickPlant(c.raycaster.ray); const d = t && t.base.distanceTo(c.hold);
        if (t && t.cargo.kind === 'plant' && t.cargo.species.kind === 'tree' && d > min && d < max && (!best || Math.abs(y) < best.d)) best = { d: Math.abs(y), ...at(x, y) }; }
      return best; };
    window.__ground = (want, min, max) => { const c = planet.cargo; const out = c.point.clone();
      for (let y = 0.5; y > -0.9; y -= 0.03) for (let x = -0.6; x < 0.6; x += 0.03) {
        c.raycaster.setFromCamera(c.ndc.set(x, y), game.camera); if (c.ground.groundHit(c.raycaster.ray, out) === null) continue;
        const d = out.distanceTo(c.hold); if (d < min || d > max) continue;
        if (c.ground.landingAt(out.clone().normalize()) === want && !c.pickPlant(c.raycaster.ray)) return at(x, y); }
      return null; };
  })()`);
  // A real 1 arms the beam (the Inventory tab's first slot).
  await key('Digit1', '1');
  const armed = await evaluate(`({ selected: planet.selected, cursor: document.body.classList.contains('beaming'), hint: document.getElementById('item-hint').textContent })`);
  const removedCount = () => evaluate(`levels.surfaceChanges.forPlanet(planet.cargo.body.key).removedCount`);
  // Hold on a tree: it (and anything else under the beam) rises to the ship and into the hold; the beam stays on while held.
  const beamUp = async () => {
    const tree = await evaluate(`__tree(12, 50)`);
    if (!tree) return null;
    const removed = await removedCount();
    const total = await evaluate(`levels.inventory.total`);
    await mouse('mouseMoved', tree);
    await mouse('mousePressed', tree);
    const during = await evaluate(`({ beaming: planet.cargo.beaming, lifting: planet.cargo.lifting, ship: planet.ship.enRoute })`);
    await until(`levels.inventory.total > ${total} && planet.cargo.lifting === 0`, 30000);
    const still = await evaluate(`planet.cargo.beaming`);
    await mouse('mouseReleased', tree);
    return { ...during, still, removed: (await removedCount()) - removed, total: (await evaluate(`levels.inventory.total`)) - total };
  };
  const up = await beamUp();
  await drawFrames(3);
  const hold = await evaluate(`({ total: levels.inventory.total, slots: [...document.querySelectorAll('.item-slot[data-item^="cargo:"]')].map((s) => ({ img: s.querySelector('img')?.src.slice(0, 22), count: s.querySelector('.item-count')?.textContent })) })`);
  // Let go halfway: it falls back down (put back, or rooted where it lands), and nothing goes in the hold.
  const tree2 = await evaluate(`__tree(12, 50)`);
  const heldBefore = await evaluate(`levels.inventory.total`);
  // Every load that starts falling is noted (a short fall can be over before the test looks).
  await evaluate(`(() => { const c = planet.cargo; window.__falls = 0; const fall = c.startFall; c.startFall = function (load) { __falls++; return fall.call(this, load); }; })()`);
  await mouse('mouseMoved', tree2);
  await mouse('mousePressed', tree2);
  await until(`planet.cargo.loads.some((l) => l.state === 'up' && l.t > 0.3)`, 20000);
  await mouse('mouseReleased', tree2);
  await until(`planet.cargo.inFlight.length === 0`, 20000);
  const falling = await evaluate(`(() => { delete planet.cargo.startFall; return __falls; })()`);
  const letGo = { falling, beaming: await evaluate(`planet.cargo.beaming`), kept: (await evaluate(`levels.inventory.total`)) === heldBefore };
  // Hold on bare ground: the beam fires there all the same (nothing to lift right under it) and the ship doesn't fly off.
  const bare = await evaluate(`__ground('land', 8, 35)`);
  let empty = null;
  if (bare) {
    await mouse('mouseMoved', bare);
    await mouse('mousePressed', bare);
    await drawFrames(5);
    empty = await evaluate(`({ beaming: planet.cargo.beaming, cone: planet.cargo.look.cone.visible })`);
    await until(`planet.cargo.lifting === 0`, 30000);
    await mouse('mouseReleased', bare);
    await until(`planet.cargo.inFlight.length === 0`, 20000);
    empty.shipStayed = !(await evaluate(`planet.ship.enRoute`));
  }
  // Sweep the held beam across the forest: it catches several plants on the way.
  const sweepFrom = await evaluate(`__tree(12, 50)`);
  let sweep = null;
  if (sweepFrom) {
    const removed = await removedCount();
    await mouse('mouseMoved', sweepFrom);
    await mouse('mousePressed', sweepFrom);
    let most = 0;
    for (let i = 1; i <= 24; i++) {
      const at = { x: sweepFrom.x + Math.sin(i * 0.5) * 18 * Math.sqrt(i), y: sweepFrom.y + Math.cos(i * 0.5) * 18 * Math.sqrt(i) };
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at, button: 'left', buttons: 1 });
      await drawFrames(2);
      most = Math.max(most, await evaluate(`planet.cargo.lifting`));
    }
    await until(`planet.cargo.lifting === 0`, 30000);
    await mouse('mouseReleased', sweepFrom);
    await until(`planet.cargo.inFlight.length === 0`, 20000);
    sweep = { most, removed: (await removedCount()) - removed };
  }
  // Select the stack (3, after the beam and the radar) and hold on the ground: it's set down and takes root.
  await key('Digit3', '3');
  const exportArmed = await evaluate(`planet.selected`);
  const stackBefore = await evaluate(`levels.inventory.stacks[0].count`);
  const totalBefore = await evaluate(`levels.inventory.total`);
  const plantedBefore = await evaluate(`planet.plantings.count`);
  const land = await evaluate(`__ground('land', 8, 35)`);
  await mouse('mouseMoved', land);
  await mouse('mousePressed', land);
  const lowering = await evaluate(`planet.cargo.beaming`);
  await until(`!planet.cargo.beaming`, 60000);
  await mouse('mouseReleased', land);
  await until(`planet.cargo.inFlight.length === 0`, 20000);
  const setDown = { exportArmed, stackBefore, lowering, planted: (await evaluate(`planet.plantings.count`)) - plantedBefore, taken: totalBefore - (await evaluate(`levels.inventory.total`)),
    selected: await evaluate(`planet.selected`), hint: await evaluate(`document.getElementById('item-hint').textContent`) };
  // Two more up. One dropped with a click (no hold): it falls from the ship and the ship stays put.
  await key('Digit1', '1');
  await beamUp();
  await beamUp();
  await key('Digit3', '3');
  const spot = await evaluate(`__ground('land', 8, 35)`);
  await mouse('mouseMoved', spot);
  await mouse('mousePressed', spot);
  await mouse('mouseReleased', spot);
  const dropped = { states: await evaluate(`planet.cargo.inFlight.map((l) => l.state)`) };
  await until(`planet.cargo.inFlight.length === 0`, 20000);
  dropped.shipStayed = !(await evaluate(`planet.ship.enRoute`));
  // The other set down in the sea: it drowns.
  if (!(await evaluate(`planet.selected`))) await key('Digit3', '3');
  const sea = await evaluate(`__ground('sea', 8, 68)`);
  let drown = null;
  if (sea) {
    await mouse('mouseMoved', sea);
    await mouse('mousePressed', sea);
    await until(`!planet.cargo.beaming`, 60000);
    await mouse('mouseReleased', sea);
    await until(`planet.cargo.inFlight.some((l) => l.state === 'fate')`, 20000);
    drown = await evaluate(`planet.cargo.inFlight.map((l) => l.fate)`);
    await until(`planet.cargo.inFlight.length === 0`, 20000);
  }
  // Let go while the ship flies sideways: it keeps the ship's and the beam's motion and lands ahead of where it was let go, not straight below.
  await key('Digit1', '1');
  const flungTree = await evaluate(`__tree(12, 35)`);
  let fling = null;
  if (flungTree) {
    await evaluate(`(() => { const c = planet.cargo; window.__landed = null; const land = c.land; c.land = function (load, quiet) { window.__landed = load.dir.clone(); return land.call(this, load, quiet); }; })()`);
    await mouse('mouseMoved', flungTree);
    await mouse('mousePressed', flungTree);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyD', key: 'd' });
    await until(`planet.cargo.loads.some((l) => l.state === 'up' && l.t > 0.4) && planet.ship.speed > 15`, 20000);
    await mouse('mouseReleased', flungTree);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyD', key: 'd' });
    fling = await evaluate(`(() => { const l = planet.cargo.loads.find((l) => l.state === 'fall'); if (!l) return null;
      const up = l.fall.position.clone().normalize(); const across = l.fall.velocity.clone().addScaledVector(up, -l.fall.velocity.dot(up));
      window.__fling = { from: l.fall.position.clone(), across: across.clone().normalize() }; return { speedAcross: across.length() }; })()`);
    await until(`planet.cargo.inFlight.length === 0`, 30000);
    if (fling) {
      // How far it landed from right below where it was let go, along the way it was going (units over the ground).
      fling.ahead = await evaluate(`(() => { const r = __fling.from.length(); return __landed.clone().sub(__fling.from.clone().normalize()).multiplyScalar(r).dot(__fling.across); })()`);
    }
  }
  // The animals: shown again, over a herd, close in.
  await animalSwitch(true);
  const herd = await evaluate(`(async () => { const g = await import('/src/gen/animals.ts'); const A = planet.animals; if (!A) return null; const n = g.herdGridSize(A.plan.radius);
    for (let f = 0; f < 6; f++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const h = g.generateHerd(A.plan, A.ground, f, i, j);
      if (h && h.count >= 4) { const pose = {}; new g.HerdPath(A.plan, A.ground, h, { hipHeight: 1 }).pose(0, planet.frame.renderTime, pose); const e1 = {}, e2 = {}; g.tangentBasis(pose, e1, e2);
        planet.ship.placeAt(new (planet.ship.up.constructor)(pose.x + e1.x * 0.02, pose.y + e1.y * 0.02, pose.z + e1.z * 0.02).normalize()); return { species: A.plan.species[h.species].name, count: h.count }; } }
    return null; })()`);
  const herdKey = await evaluate(`planet.cargo.body.key`);
  const animalChanges = `levels.surfaceChanges.forPlanet(${JSON.stringify(herdKey)})`;
  let animals = null;
  if (herd) {
    await evaluate(`planet.orbit.zoomTo(22)`);
    await sleep(1500);
    await until(`planet.animals.settled`, 30000);
    await until(`Math.abs(planet.ship.radius - planet.ship.goalRadius) < 0.2`, 120000);
    await drawFrames(10);
    // The screen point of the nearest animal still there (its body, a little above its feet).
    await evaluate(`window.__animal = () => { const A = planet.animals; const v = new (planet.ship.up.constructor)(); const rect = game.renderer.domElement.getBoundingClientRect();
      for (const p of A.herdPositions()) { v.copy(p).addScaledVector(p.clone().normalize(), 0.6); A.object.localToWorld(v); const s = v.clone().project(game.camera);
        if (Math.abs(s.x) < 0.8 && Math.abs(s.y) < 0.8 && s.z < 1) return { x: rect.left + ((s.x + 1) / 2) * rect.width, y: rect.top + ((1 - s.y) / 2) * rect.height }; }
      return null; }`);
    // Beamed up: into a stack of its own, with its picture (the plants above may have filled the hold: emptied first).
    await evaluate(`levels.inventory.load({ stacks: [] })`);
    // (The fling above left the beam armed: a 1 now would put it away.)
    await evaluate(`planet.select('abduct')`);
    const at = await evaluate(`__animal()`);
    const takenBefore = await evaluate(`${animalChanges}.removedAnimalCount`);
    let up = null;
    if (at) {
      await mouse('mouseMoved', at);
      await mouse('mousePressed', at);
      await until(`levels.inventory.stacks.some((s) => s.kind === 'animal') && planet.cargo.lifting === 0`, 30000).catch(() => {});
      await mouse('mouseReleased', at);
      await until(`planet.cargo.inFlight.length === 0`, 20000);
      up = await evaluate(`(() => { const s = levels.inventory.stacks.find((s) => s.kind === 'animal'); return s && { key: s.key, name: s.species.name, count: s.count,
        img: document.querySelector('.item-slot[data-item="cargo:' + s.key + '"] img')?.src.slice(0, 22) }; })()`);
      if (up) up.taken = (await evaluate(`${animalChanges}.removedAnimalCount`)) - takenBefore;
    }
    // Set down on land: it roams there.
    let release = null;
    const spot = up && (await evaluate(`__ground('land', 8, 35)`));
    if (spot) {
      const before = await evaluate(`${animalChanges}.releasedCount`);
      await evaluate(`planet.select('cargo:' + ${JSON.stringify(up.key)})`);
      await mouse('mouseMoved', spot);
      await mouse('mousePressed', spot);
      await until(`!planet.cargo.beaming`, 60000);
      await mouse('mouseReleased', spot);
      await until(`planet.cargo.inFlight.length === 0`, 20000);
      release = { released: (await evaluate(`${animalChanges}.releasedCount`)) - before, hint: await evaluate(`document.getElementById('item-hint').textContent`) };
    }
    // The laser: Tab to the Weapons, a real 1 arms it; held on an animal, then on a tree, it kills them.
    if (await evaluate(`document.getElementById('item-bar').dataset.tab !== 'weapons'`)) await key('Tab', 'Tab');
    await key('Digit1', '1');
    const laserArmed = await evaluate(`({ selected: planet.selected, cursor: document.body.classList.contains('aiming'), hint: document.getElementById('item-hint').textContent })`);
    const fire = async (target, what) => {
      if (!target) return null;
      const killed = await evaluate(`planet.laser.killed`);
      await mouse('mouseMoved', target);
      await mouse('mousePressed', target);
      await drawFrames(3);
      const on = await evaluate(`({ on: planet.laser.on, beam: planet.laser.look.core.visible, ship: planet.ship.enRoute })`);
      await until(`planet.laser.killed > ${killed}`, 20000).catch(() => {});
      await mouse('mouseReleased', target);
      await drawFrames(3);
      return { what, ...on, killed: (await evaluate(`planet.laser.killed`)) - killed, burning: await evaluate(`planet.laser.burning`), off: !(await evaluate(`planet.laser.on`)) };
    };
    const animalKills = await evaluate(`${animalChanges}.removedAnimalCount`);
    const shotAnimal = await fire(await evaluate(`__animal()`), 'animal');
    const killedAnimals = (await evaluate(`${animalChanges}.removedAnimalCount`)) - animalKills;
    const plantKills = await removedCount();
    const shotTree = await fire(await evaluate(`__tree(0, 200)`), 'tree');
    const killedPlants = (await removedCount()) - plantKills;
    await until(`planet.laser.burning === 0`, 20000).catch(() => {});
    animals = { herd, up, release, laserArmed, shotAnimal, killedAnimals, shotTree, killedPlants, burnt: await evaluate(`planet.laser.burning === 0`) };
  }
  // What was planted and taken stays when the planet is left and visited again (the animals too).
  const planted = await evaluate(`planet.plantings.count`);
  const animalsBefore = await evaluate(`({ removed: ${animalChanges}.removedAnimalCount, released: ${animalChanges}.releasedCount })`);
  await evaluate(`levels.leavePlanet()`);
  await until(`levels.mode === 'system' && !levels.transitioning`, 60000);
  await evaluate(`(() => { ship.parkAt(__home); levels.toPlanet(__home); })()`);
  await until(`levels.mode === 'planet' && !levels.transitioning`, 60000);
  const revisit = { planted: await evaluate(`planet.plantings.count`), removed: await evaluate(`levels.surfaceChanges.forPlanet(planet.cargo.body.key).removedCount`),
    animals: await evaluate(`({ removed: ${animalChanges}.removedAnimalCount, released: ${animalChanges}.releasedCount })`), animalsBefore };
  await evaluate(`levels.leavePlanet()`);
  await until(`levels.mode === 'system' && !levels.transitioning`, 60000);
  const allCues = await evaluate(`__cues`);
  const cues = allCues.filter((c) => /^(abduct|export|drop)/.test(c));
  const laserCues = allCues.filter((c) => /^laser/.test(c));
  cargo = { tabs, weaponsBorder, tooltip, forest, armed, up, hold, letGo, empty, sweep, setDown, dropped, drown, fling, planted, animals, revisit, cues, laserCues };
  cargo.ok =
    tabs.tab === 'inventory' &&
    tabs.border !== weaponsBorder &&
    tabs.slots[0] === 'abduct' &&
    tooltip.tone === 'inventory' &&
    forest &&
    armed.selected === 'abduct' &&
    armed.cursor &&
    /hold to fire the beam/.test(armed.hint) &&
    up?.beaming === true &&
    up.lifting >= 1 &&
    up.still === true &&
    !up.ship &&
    up.removed >= 1 &&
    up.total === up.removed &&
    hold.slots.length >= 1 &&
    hold.slots.every((s) => s.img === 'data:image/png;base64,') &&
    hold.slots.reduce((n, s) => n + Number(s.count), 0) === hold.total &&
    letGo.falling > 0 &&
    !letGo.beaming &&
    letGo.kept &&
    (empty === null || (empty.beaming && empty.cone && empty.shipStayed)) &&
    (sweep === null || (sweep.most >= 2 && sweep.removed >= 2)) &&
    /^cargo:/.test(setDown.exportArmed) &&
    setDown.lowering &&
    setDown.planted === 1 &&
    setDown.taken === 1 &&
    setDown.selected === (setDown.stackBefore === 1 ? null : setDown.exportArmed) &&
    /took root/.test(setDown.hint) &&
    dropped.states.includes('fall') &&
    dropped.shipStayed &&
    (drown === null || drown.includes('drown')) &&
    (fling === null || (fling.speedAcross > 3 && fling.ahead > 1)) &&
    revisit.planted === planted &&
    revisit.removed >= 2 &&
    cues.includes('abductStart') &&
    cues.includes('abductBeam') &&
    cues.includes('abductSuccess') &&
    cues.includes('exportBeam') &&
    cues.includes('dropImpact') &&
    !!animals &&
    // Animals of a herd stand close: the beam may catch more than one, all into the one stack.
    animals.up?.taken >= 1 &&
    animals.up.count === animals.up.taken &&
    animals.up.img === 'data:image/png;base64,' &&
    animals.release?.released === 1 &&
    /roam/.test(animals.release.hint) &&
    animals.laserArmed.selected === 'laser' &&
    animals.laserArmed.cursor &&
    /hold to fire the laser/.test(animals.laserArmed.hint) &&
    animals.shotAnimal?.on === true &&
    animals.shotAnimal.beam &&
    !animals.shotAnimal.ship &&
    animals.shotAnimal.off &&
    animals.killedAnimals >= 1 &&
    animals.shotTree?.on === true &&
    animals.killedPlants >= 1 &&
    animals.burnt &&
    revisit.animals.removed === revisit.animalsBefore.removed &&
    revisit.animals.released === revisit.animalsBefore.released &&
    laserCues.includes('laserBeam') &&
    laserCues.includes('laserHit');
  return cargo.ok;
});

await section('volcano', async () => {
  // A fresh game (the lab sections leave the page elsewhere).
  if (!(await page.goto(url, READY, 60000))) return false;
  await drawFrames(20);
  for (let i = 0; i < 40 && (await evaluate(`levels.transitioning || levels.mode !== 'system'`)); i++) {
    if (await evaluate(`levels.mode === 'planet' && !levels.transitioning`)) await evaluate(`levels.leavePlanet()`);
    if (await evaluate(`levels.mode === 'galaxy' && !levels.transitioning`)) await evaluate(`levels.toSystem()`);
    await sleep(500);
  }
  const press = async (code, key) => {
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', { type, code, key });
      await drawFrames(2);
    }
  };
  await press('Digit2', '2');
  const inSpace = await evaluate(`({ slots: document.querySelectorAll('.item-slot[data-item]').length, hint: document.getElementById('item-hint').textContent })`);
  // A gas giant has no ground for it.
  const giant = await evaluate(`world.planets.some((p) => p.config.type === 'gas')`);
  let gas = null;
  if (giant) {
    await evaluate(`(() => { const b = world.planets.find((p) => p.config.type === 'gas'); ship.parkAt(b); levels.toPlanet(b); })()`);
    await until(`levels.mode === 'planet' && !levels.transitioning`, 60000);
    await press('Digit2', '2');
    gas = await evaluate(`({ selected: planet.selected, status: planet.status('volcanoBomb'), volcanoes: planet.volcanoes })`);
    await evaluate(`levels.leavePlanet()`);
    await until(`levels.mode === 'system' && !levels.transitioning`, 60000);
  }
  // Down to a solid planet, one with plants if there is one.
  await evaluate(`(() => {
    const solid = world.planets.filter((p) => p.config.type !== 'gas');
    const b = solid.find((p) => (p.config.climate?.habitability ?? 0) > 0) ?? solid[0] ?? world.moons[0];
    window.__volcanic = b; ship.parkAt(b); levels.toPlanet(b);
  })()`);
  await until(`levels.mode === 'planet' && !levels.transitioning`, 60000);
  await drawFrames(5);
  await press('Digit2', '2');
  const armed = await evaluate(`({ selected: planet.selected, aiming: document.body.classList.contains('aiming'), hint: document.getElementById('item-hint').textContent })`);
  // A real click on the ground under the ship.
  const target = await evaluate(`(() => {
    const d = planet.ship.object.position.clone().normalize();
    const g = d.clone().multiplyScalar(planet.groundRadius(d));
    const v = g.project(game.camera);
    const r = game.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  })()`);
  await evaluate(`(() => {
    window.__cues = [];
    const play = audio.play.bind(audio), start = audio.start.bind(audio);
    audio.play = (c) => (__cues.push(c), play(c));
    audio.start = (c) => (__cues.push(c), start(c));
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...target, button: 'left', clickCount: 1 });
  await drawFrames(2);
  const fired = await evaluate(`({ inFlight: planet.volcanoBomb.inFlight, enRoute: planet.ship.enRoute, selected: planet.selected })`);
  const landed = await until(`planet.volcanoes.count === 1`, 30000);
  const risen = await until(`planet.volcanoes.shapes[0].growth === 1`, 60000);
  await drawFrames(10);
  const after = await evaluate(`(() => {
    const v = planet.volcanoes.shapes[0];
    const c = v.centre;
    const ship = planet.ship.object.position;
    return { selected: planet.selected, available: planet.status('volcanoBomb').available, height: v.height,
      raised: planet.groundRadius(c) - planet.globe.terrainRadius(c, planet.globe.sunLight.clone()),
      aboveSea: planet.groundRadius(c) > (planet.globe.seaRadius ?? 0),
      shipAbove: ship.length() - planet.groundRadius(ship.clone().normalize()), saved: levels.surfaceChanges.forPlanet(__volcanic.name + ':' + __volcanic.config.seed).volcanoes.length };
  })()`);
  // Its cone is refined near the camera like the terrain: one chunk from far off, finer chunks next to it.
  await evaluate(`(() => {
    const v = planet.volcanoes.shapes[0];
    window.__zoom = planet.orbit.zoom;
    planet.orbit.setFocus(v.centre.clone().multiplyScalar(planet.groundRadius(v.centre)));
    planet.orbit.setDistance(v.baseRadius * 15);
  })()`);
  await drawFrames(3);
  const lodFar = { settled: await until(`planet.volcanoes.settled`, 30000), ...(await evaluate(`planet.volcanoes.lodStats()[0]`)) };
  // Its loops: the far one from out there, the near one next to it (see audio/VolcanoSounds).
  const volcanoLevels = `Object.fromEntries(audio.ambientLevels.filter((a) => a.cue.startsWith('volcano')).map((a) => [a.cue, +a.level.toFixed(3)]))`;
  const soundFar = await evaluate(volcanoLevels);
  await evaluate(`planet.orbit.setDistance(planet.volcanoes.shapes[0].baseRadius * 0.4)`);
  await drawFrames(3);
  const lodNear = { settled: await until(`planet.volcanoes.settled`, 30000), ...(await evaluate(`planet.volcanoes.lodStats()[0]`)) };
  const soundNear = await evaluate(volcanoLevels);
  await evaluate(`(() => { planet.orbit.setFocus(null); planet.orbit.setDistance(__zoom); })()`);
  const lod = { far: lodFar, near: lodNear };
  const sound = { far: soundFar, near: soundNear };
  const heard = (await evaluate(`__cues`)).filter((c) => c.startsWith('volcano'));
  await evaluate(`levels.leavePlanet()`);
  await until(`levels.mode === 'system' && !levels.transitioning`, 60000);
  // Silent once left.
  sound.left = await evaluate(volcanoLevels);
  // The system view's globe shows it too.
  const systemView = await evaluate(`__volcanic.volcanoSites.length`);
  await evaluate(`(() => { ship.parkAt(__volcanic); levels.toPlanet(__volcanic); })()`);
  await until(`levels.mode === 'planet' && !levels.transitioning`, 60000);
  await drawFrames(5);
  const revisit = await evaluate(`({ count: planet.volcanoes?.count, growth: planet.volcanoes?.shapes[0]?.growth })`);
  await evaluate(`levels.leavePlanet()`);
  await until(`levels.mode === 'system' && !levels.transitioning`, 60000);
  // Out to the galaxy and back: the system is built afresh, the volcano still on its globe.
  await evaluate(`levels.toGalaxy()`);
  await until(`levels.mode === 'galaxy' && !levels.transitioning`, 60000);
  await evaluate(`levels.toSystem()`);
  await until(`levels.mode === 'system' && !levels.transitioning`, 60000);
  const rebuilt = await evaluate(`[...world.planets, ...world.moons].find((b) => b.name === __volcanic.name)?.volcanoSites.length`);
  volcano = { inSpace, gas, armed, fired, landed, risen, after, lod, sound, heard, systemView, revisit, rebuilt };
  volcano.ok =
    inSpace.slots === 3 &&
    /down to a planet or moon/.test(inSpace.hint) &&
    (!giant || (gas.selected === null && !gas.status.available && /No ground/.test(gas.status.reason) && gas.volcanoes === null)) &&
    armed.selected === 'volcanoBomb' &&
    armed.aiming &&
    /raise a volcano/.test(armed.hint) &&
    fired.inFlight &&
    !fired.enRoute &&
    fired.selected === 'volcanoBomb' &&
    landed &&
    risen &&
    after.raised > 0.5 * after.height &&
    after.aboveSea &&
    after.shipAbove > 0 &&
    after.selected === 'volcanoBomb' &&
    after.available &&
    after.saved === 1 &&
    lod.far.settled &&
    lod.far.chunks === 1 &&
    lod.near.settled &&
    lod.near.chunks > 4 &&
    lod.near.maxDepth >= 2 &&
    heard.join(',') === 'volcanoFire,volcanoRise' &&
    sound.far.volcanoFar > sound.far.volcanoNear &&
    sound.near.volcanoNear > 0.5 &&
    sound.near.volcanoNear > sound.near.volcanoFar &&
    Object.values(sound.left).every((level) => level === 0) &&
    systemView === 1 &&
    revisit.count === 1 &&
    revisit.growth === 1 &&
    rebuilt === 1;
  return volcano.ok;
});
await section('buster', async () => {
  // A fresh game (the lab section leaves the page on lab.html).
  if (!(await page.goto(url, READY, 60000))) return false;
  await drawFrames(20);
  for (let i = 0; i < 40 && (await evaluate(`levels.transitioning || levels.mode !== 'system'`)); i++) {
    if (await evaluate(`levels.mode === 'planet' && !levels.transitioning`)) await evaluate(`levels.leavePlanet()`);
    if (await evaluate(`levels.mode === 'galaxy' && !levels.transitioning`)) await evaluate(`levels.toSystem()`);
    await sleep(500);
  }
  const press = async (code, key) => {
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', { type, code, key });
      await drawFrames(2);
    }
  };
  // In space: the bar shows, but the buster (3) only works in low orbit.
  await press('Digit3', '3');
  const inSpace = await evaluate(`({ bar: !document.getElementById('item-bar').hidden, slots: document.querySelectorAll('.item-slot[data-item]').length,
    hint: document.getElementById('item-hint').textContent })`);
  // Down to a moon of the home system (or its first planet).
  await evaluate(`(() => { const b = world.moons[0] ?? world.planets[0]; window.__busted = b; ship.parkAt(b); levels.toPlanet(b); })()`);
  await until(`levels.mode === 'planet' && !levels.transitioning`, 60000);
  await drawFrames(5);
  await press('Digit3', '3');
  const armed = await evaluate(`({ selected: planet.selected, aiming: document.body.classList.contains('aiming'), hint: document.getElementById('item-hint').textContent })`);
  // A real click on the ground a little way off the ship (the ground under the ship, nudged towards the screen's centre).
  const target = await evaluate(`(() => {
    const p = planet.ship.object.position.clone();
    const d = p.clone().normalize();
    const g = d.clone().multiplyScalar(planet.groundRadius(d));
    const v = g.project(game.camera);
    const r = game.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  })()`);
  // Every cue the game asks for, heard or not (audio may be locked).
  await evaluate(`(() => {
    window.__cues = [];
    const play = audio.play.bind(audio), start = audio.start.bind(audio);
    audio.play = (c) => (__cues.push(c), play(c));
    audio.start = (c) => (__cues.push(c), start(c));
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, ...target, button: 'left', clickCount: 1 });
  await drawFrames(2);
  const fired = await evaluate(`({ state: planet.buster.state, busy: planet.busy, selected: planet.selected })`);
  // No way out while it goes off.
  await evaluate(`levels.leavePlanet()`);
  await drawFrames(2);
  const stayed = await evaluate(`levels.mode === 'planet' && !levels.transitioning`);
  let maxFlash = 0;
  let blasted = false;
  for (let i = 0; i < 600 && (await evaluate(`planet.busy`)); i++) {
    const s = await evaluate(`({ flash: +getComputedStyle(document.getElementById('flash')).opacity, busted: planet.busted })`);
    maxFlash = Math.max(maxFlash, s.flash);
    blasted ||= s.busted;
    await sleep(100);
  }
  const after = await evaluate(`(() => {
    planet.select('planetBuster');
    return { state: planet.buster.state, busy: planet.busy, busted: planet.busted, selected: planet.selected,
      hud: document.getElementById('hud-climate').textContent, systemBody: __busted.busted, description: __busted.description, count: levels.busted.count,
      flash: +getComputedStyle(document.getElementById('flash')).opacity };
  })()`);
  await evaluate(`levels.leavePlanet()`);
  await until(`levels.mode === 'system' && !levels.transitioning`, 60000);
  const system = await evaluate(`({ busted: __busted.busted, radius: __busted.radius > __busted.config.radius, details: __busted.details })`);
  // Back down: a debris field from the start.
  await evaluate(`(() => { ship.parkAt(__busted); levels.toPlanet(__busted); })()`);
  await until(`levels.mode === 'planet' && !levels.transitioning`, 60000);
  await drawFrames(5);
  const revisit = await evaluate(`({ busted: planet.busted, state: planet.buster.state, plants: planet.plants, weather: planet.weather, geysers: planet.geysers,
    available: planet.status('planetBuster').available })`);
  await evaluate(`levels.leavePlanet()`);
  await until(`levels.mode === 'system' && !levels.transitioning`, 60000);
  // Out to the galaxy and back: the system is built afresh, the body still busted.
  await evaluate(`levels.toGalaxy()`);
  await until(`levels.mode === 'galaxy' && !levels.transitioning`, 60000);
  await evaluate(`levels.toSystem()`);
  await until(`levels.mode === 'system' && !levels.transitioning`, 60000);
  const rebuilt = await evaluate(`[...world.planets, ...world.moons].filter((b) => b.busted).map((b) => b.name)`);
  const bustedName = await evaluate(`__busted.name`);
  const heardOrder = (await evaluate(`__cues`)).filter((c) => c.startsWith('buster') || c === 'planetExplode');
  buster = { inSpace, armed, fired, stayed, maxFlash, blasted, sounds: heardOrder, after, system, revisit, rebuilt, bustedName };
  buster.ok =
    inSpace.bar &&
    inSpace.slots === 3 &&
    /down to a planet or moon/.test(inSpace.hint) &&
    armed.selected === 'planetBuster' &&
    armed.aiming &&
    fired.state === 'firing' &&
    fired.busy &&
    fired.selected === null &&
    stayed &&
    maxFlash > 0.5 &&
    blasted &&
    after.state === 'spent' &&
    !after.busy &&
    after.busted &&
    after.selected === null &&
    /planet buster/.test(after.hud) &&
    after.systemBody &&
    /^Debris field/.test(after.description) &&
    after.count === 1 &&
    system.busted &&
    system.radius &&
    revisit.busted &&
    revisit.state === 'spent' &&
    !revisit.available &&
    revisit.plants === null &&
    revisit.weather === null &&
    revisit.geysers === null &&
    rebuilt.length === 1 &&
    rebuilt[0] === bustedName &&
    heardOrder.join(',') === 'busterFire,busterFlight,busterImpact,planetExplode';
  return buster.ok;
});
clearTimeout(timer);

const ok = started && !stalled && Object.keys(sections).length > 0 && Object.values(sections).every((x) => x.ok) && errors.length === 0;
console.error(`[smoke] ${ok ? 'ok' : 'FAILED'} in ${Math.round((Date.now() - T0) / 1000)} s${errors.length ? `, ${errors.length} console errors` : ''}`);
console.log(
  JSON.stringify(
    { ok, started, stalled, sections, before, after, autopilot, pick, systemMap, sky, living, comet, belt, galaxyLoop, nebulas, rogues, blackHoles, dust, seamless, audio, planetLoop, heldZoom, cometLoop, asteroidLoops, planetTypes, touch, touchLab, cargo, volcano, buster, lab, plantLab, animalLab, gameAnimals, starLab, fps, errors, screenshot, galaxyScreenshot: join(outDir, 'galaxy.png') },
    null,
    2,
  ),
);

await page.close();
process.exit(ok ? 0 : 1);
