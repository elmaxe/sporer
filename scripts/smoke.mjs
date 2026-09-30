// Headless browser smoke test over the Chrome DevTools Protocol.
// Usage: npm run smoke [-- http://localhost:5173/]   (dev server must be running)
// Checks: W moves the ship along -Z, the autopilot flies back to a point, hovering + clicking
// the star targets it, and the galaxy loop works (scroll out to the galaxy, click the nearest
// star, travel, scroll in to its system, where the ship flies in and parks a few star diameters out; the galaxy
// shows distant galaxies, twinkles, spins and draws binaries as two dots, and picking works while it's turned), a
// real click on the speaker button starts audio; then the transitions and galaxy travel play their whooshes, and M
// mutes. Then the planet loop (park at a planet, scroll in to low orbit, click the globe and fly, scroll all the way
// in and out and check the ship's altitude follows, scroll back out beside it, parked as far out as the zoom says),
// and again for every planet
// type, a ringed rocky/icy/lava world and a moon in other systems (skip those with --quick). The system sky has
// the galaxy band (screenshot looking at the galactic centre) and a smoke trail per planet and moon. Living stars: the
// surface clock advances and storms have particles under way (and keep animating in the planet level's sky); comets
// move, show their name on hover and ignore clicks. Looking at the star close up lowers the exposure (eye adaptation).
// Living lava: in low orbit over the lava world, the eruptions have vents, events and blobs in the air.
// Geysers: every body in the planet loop has the geyser kind its climate says (or none), with vents, eruptions and
// particles in the air while one erupts; the loop also visits a body with each kind (steam, cryo planet and moon, sulphur).
// Seamless zooms: through the galaxy and planet loops, every frame of every level transition records the crossfade
// weight and canvas brightness; each transition must crossfade and never go black (screenshots mid-handover).
// Touch: on an emulated phone, hold/tap/drag/pinch and the on-screen stick and Boost work, down to a planet and out.
// Prints JSON with FPS, console errors and screenshot paths. Exit 1 on failure.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, sleep } from './lib/browser.mjs';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const url = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5173/';

const outDir = mkdtempSync(join(tmpdir(), 'spore2-smoke-'));
// A fresh browser and profile every run (so no saved volume or mute carries over), at 1280x720.
const page = await launch({ width: 1280, height: 720 });
const { send, errors } = page;
// Never throws: a failed expression reads as undefined and fails the checks that use it.
const evaluate = page.tryEvaluate;

await send('Page.navigate', { url });
await sleep(4000);

// Let the first frames draw (shader compiles, the sky's one-off bake) before timing anything.
await page.waitFor(`typeof window.levels !== 'undefined'`, 30000);
await evaluate(`new Promise((r) => { let n = 0; (function f() { if (++n > 20) r(); else requestAnimationFrame(f); })(); })`);

const state = `({ speed: +ship.speed.toFixed(1), pos: ship.object.position.toArray().map((n) => +n.toFixed(1)) })`;
const started = await evaluate(`typeof window.ship !== 'undefined'`);
let before, after, autopilot, pick, sky, living, comet, eye, galaxyLoop, fps, audio, planetLoop, heldZoom, seamless;
const planetTypes = [];
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
async function runPlanetLoop(bodyExpr, shotName, handoverShot = null) {
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
  if (handoverShot) await evaluate(`__seamless.freezeWhen = 'planet'`);
  await wheel(-300); // keep scrolling in
  if (handoverShot) r.handoverShot = await freezeShot(handoverShot);
  // Right after a page load the headless frame rate can be ~2 FPS, and a click while the zoom still runs is ignored.
  for (let i = 0; i < 40 && (await evaluate(`levels.mode !== 'planet' || levels.transitioning`)); i++) await sleep(250);
  r.mode = await evaluate(`levels.mode`);
  r.soundIn = await evaluate(`audio.lastPlayed?.name ?? null`);
  if (r.mode !== 'planet') return r;
  r.sky = await evaluate(`planet.skyStats`);
  // The sky star's clock and the planet level's own clock (its time is the system time down here).
  const skyTime = `[world.stars[0].storms.shownTime, planet.time]`;
  const skyBefore = await evaluate(skyTime);
  r.expectedSky = await evaluate(`({ bodies: world.planets.length + world.moons.length - 1 - world.moons.filter((m) => m.parent === __body).length })`);

  // Click the globe ~20° ahead of the ship, towards the top of the screen.
  r.click = await evaluate(`new Promise((resolve) => {
    const V = game.camera.position.constructor;
    const u = planet.ship.direction.clone();
    const up = new V(0, 1, 0).applyQuaternion(game.camera.quaternion);
    const t = up.sub(u.clone().multiplyScalar(up.dot(u))).normalize();
    const point = u.clone().multiplyScalar(Math.cos(0.35)).add(t.multiplyScalar(Math.sin(0.35))).multiplyScalar(planet.radius);
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
  const settled = `Math.abs(planet.orbit.zoom - planet.orbit.targetDistance) < 0.5 &&
    Math.abs(planet.ship.radius - planet.flyingRadius(planet.orbit.zoom)) < 0.5`;
  const settle = async () => {
    await sleep(500);
    for (let i = 0; i < 40 && !(await evaluate(settled)); i++) await sleep(250);
  };
  await wheel(-50000);
  await settle();
  r.altitude = { low: await evaluate(altitude) };
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
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  r.screenshot = join(outDir, `${shotName}.png`);
  writeFileSync(r.screenshot, Buffer.from(shot.result.data, 'base64'));

  await wheel(50000); // to max zoom
  await settle();
  r.altitude.high = await evaluate(altitude);
  await wheel(300); // keep scrolling out
  for (let i = 0; i < 20 && (await evaluate(`levels.mode !== 'system' || levels.transitioning`)); i++) await sleep(250);
  r.modeAfter = await evaluate(`levels.mode`);
  r.soundOut = await evaluate(`audio.lastPlayed?.name ?? null`);
  r.parkedAt = await evaluate(`ship.targetBody?.name ?? null`);
  // Parked as far from the body as the system camera's zoom puts it.
  r.standoffs = await evaluate(`+(ship.object.position.distanceTo(__body.renderPosition) / ship.parkDistance(__body)).toFixed(2)`);
  r.ok =
    r.mode === 'planet' &&
    r.sky.bodies === r.expectedSky.bodies &&
    r.click.onScreen &&
    r.click.enRoute &&
    r.flewDegrees > 3 &&
    r.skyClock > 0.3 &&
    Math.abs(r.skyStarTime - r.skyClock) < 0.25 &&
    r.altitudeOk &&
    r.altitude.high > r.altitude.low + 20 &&
    (r.type !== 'lava' || (r.lava && r.lava.vents > 0 && r.lava.events > 0 && r.lava.blobs > 0)) &&
    (r.expectedGeysers ?? null) === (r.geysers?.kind ?? null) &&
    (!r.geysers || (r.geysers.vents > 0 && r.geysers.events > 0 && (r.geysers.erupting === 0 || r.geysers.particles > 0))) &&
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

  // Living stars and comets: sample twice, a couple of seconds apart.
  const sample = `({
    starTime: world.stars[0].storms.shownTime,
    clock: world.time,
    live: world.stars.reduce((n, s) => n + s.storms.liveParticles, 0),
    comets: world.comets.map((c) => c.position.toArray()),
    tails: world.comets.map((c) => +c.activity.toFixed(3)),
    pickable: world.bodies.some((b) => world.comets.includes(b)),
  })`;
  const first = await evaluate(sample);
  await sleep(2000);
  const second = await evaluate(sample);
  living = {
    starSeconds: +(second.starTime - first.starTime).toFixed(2),
    // The star's clock against the system's own (not the wall clock, which runs ahead at headless frame rates).
    clockSeconds: +(second.clock - first.clock).toFixed(2),
    liveParticles: [first.live, second.live],
    comets: second.comets.length,
    cometsMoved: second.comets.every((p, i) => Math.hypot(...p.map((v, k) => v - first.comets[i][k])) > 0.1),
    cometActivity: second.tails,
    pickable: second.pickable,
  };

  // Comets (when this system has any): hovering one shows its name, clicking it doesn't fly there.
  comet = await evaluate(`new Promise((resolve) => {
    const c = world.comets[0];
    if (!c) return resolve({ none: true });
    const orbit = levels.systemLevel.orbit;
    orbit.setFocus(c.position);
    orbit.setDistance(120);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const p = c.renderPosition.clone().project(game.camera);
      const rect = game.renderer.domElement.getBoundingClientRect();
      const at = { clientX: rect.left + ((p.x + 1) / 2) * rect.width, clientY: rect.top + ((1 - p.y) / 2) * rect.height, bubbles: true };
      const canvas = game.renderer.domElement;
      canvas.dispatchEvent(new PointerEvent('pointermove', at));
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...at, button: 0 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...at, button: 0 }));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const r = {
          name: c.name,
          tooltip: document.getElementById('tooltip').hidden ? null : document.getElementById('tooltip-name').textContent,
          autopilot: ship.autopilotActive,
        };
        orbit.setFocus(null);
        orbit.setDistance(45);
        resolve(r);
      }));
    }));
  })`);

  // Eye adaptation: the exposure drops while the star fills the view, and recovers after.
  eye = { start: await evaluate(`+levels.systemLevel.eye.exposure.toFixed(2)`) };
  await evaluate(`(() => { const s = world.stars[0], o = levels.systemLevel.orbit;
    o.setFocus(s.renderPosition); o.setDistance(s.radius * 3); })()`);
  await sleep(2500);
  eye.close = await evaluate(`+levels.systemLevel.eye.exposure.toFixed(2)`);
  await evaluate(`levels.systemLevel.orbit.setFocus(null), levels.systemLevel.orbit.setDistance(45)`);

  // System sky: the galaxy band and the orbit trails. Look at the galactic centre for a screenshot.
  sky = await evaluate(`(() => {
    const scene = levels.systemLevel.scene;
    const band = scene.getObjectByName('Galaxy band');
    const c = levels.systemLevel.band.sky.center;
    levels.systemLevel.orbit.lookFrom(new game.camera.position.constructor(-c.x, -c.y, -c.z));
    return {
      band: !!band && !!scene.getObjectByName('Galaxy band stars'),
      trails: levels.systemLevel.trails.count,
      expectedTrails: world.planets.length + world.moons.length,
    };
  })()`);
  await sleep(1500);
  sky.visibleTrails = await evaluate(`levels.systemLevel.trails.visibleCount`);
  const bandShot = await send('Page.captureScreenshot', { format: 'png' });
  sky.screenshot = join(outDir, 'band.png');
  writeFileSync(sky.screenshot, Buffer.from(bandShot.result.data, 'base64'));

  // Galaxy loop, driven by real wheel and pointer events.
  galaxyLoop = { from: await evaluate(`system.id`) };
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
      s.current.frames.push({ weight, brightness: sum / (3 * n) });
      if (s.freezeWhen && weight !== null && weight > 0.35 && levels.mode === s.freezeWhen) {
        s.freezeWhen = null; s.frozen = true; game.stop();
      }
    };
  })()`);
  await wheel(50000); // to max zoom
  await sleep(1500);
  await wheel(300); // keep scrolling past it
  await sleep(1800);
  for (let i = 0; i < 40 && (await evaluate(`levels.transitioning`)); i++) await sleep(250);
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
  // Scroll in mid-jump: held until the ship docks, then it zooms into the destination.
  await evaluate(`__seamless.freezeWhen = 'system'`);
  await wheel(-50000);
  galaxyLoop.heldWhileTravelling = await evaluate(`levels.galaxyLevel.ship.travelling && levels.mode === 'galaxy'`);
  for (let i = 0; i < 60 && (await evaluate(`levels.galaxyLevel.ship.travelling`)); i++) await sleep(250);
  galaxyLoop.dockedAt = await evaluate(`levels.galaxyLevel.ship.travelling ? null : levels.galaxyLevel.ship.current.id`);
  galaxyLoop.handoverShot = await freezeShot('handover');
  for (let i = 0; i < 20 && (await evaluate(`levels.mode !== 'system' || levels.transitioning`)); i++) await sleep(250);
  await sleep(300);
  galaxyLoop.modeAfterZoomIn = await evaluate(`levels.mode`);
  galaxyLoop.to = await evaluate(`system.id`);
  galaxyLoop.shipSpeed = await evaluate(`ship.speed`);
  // Arriving, the ship flies in from far out and brakes to park a few star diameters from the star.
  const arrival = `({ target: ship.targetBody?.name ?? null, star: world.stars[0].name, enRoute: ship.enRoute,
    distance: +ship.object.position.distanceTo(world.stars[0].position).toFixed(0),
    park: +ship.parkDistance(world.stars[0]).toFixed(0), zone: +system.starZone.toFixed(0) })`;
  galaxyLoop.arrival = { flying: await evaluate(arrival) };
  for (let i = 0; i < 60 && (await evaluate(`ship.enRoute`)); i++) await sleep(250);
  galaxyLoop.arrival.parked = await evaluate(arrival);
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
  for (let i = 0; i < 60 && (await evaluate(`levels.galaxyLevel.ship.travelling || levels.transitioning`)); i++) await sleep(250);
  await evaluate(`levels.toSystem()`);
  audio.sfx.in = await evaluate(played);
  await sleep(500);
  // The zoom runs slower than real time at headless frame rates (each frame advances it by at most 0.25 s).
  for (let i = 0; i < 40 && (await evaluate(`levels.transitioning`)); i++) await sleep(250);
  audio.sfx.modeAfter = await evaluate(`levels.mode`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyM', key: 'm' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyM', key: 'm' });
  audio.mutedByKey = await evaluate(`document.getElementById('audio').classList.contains('muted')`);

  // Planet loop in the current system: the first terran or ocean world, else the first planet.
  planetLoop = await runPlanetLoop(
    `world.planets.find((p) => ['terran', 'ocean'].includes(p.config.type)) ?? world.planets[0]`,
    'planet',
    'planet-handover',
  );

  // Scrolling in while the autopilot flies is held until it arrives, then descends to the destination.
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
  for (let i = 0; i < 80 && (await evaluate(`levels.mode !== 'planet' || levels.transitioning`)); i++) await sleep(250);
  heldZoom.mode = await evaluate(`levels.mode`);
  heldZoom.descendedTo = await evaluate(`planet?.body.name ?? null`);
  heldZoom.ok =
    heldZoom.whileFlying.enRoute &&
    heldZoom.whileFlying.mode === 'system' &&
    Math.abs(heldZoom.whileFlying.zoom - heldZoom.zoomBefore) < 1 &&
    heldZoom.mode === 'planet' &&
    heldZoom.descendedTo === heldZoom.target;
  await evaluate(`levels.leavePlanet()`);
  for (let i = 0; i < 20 && (await evaluate(`levels.mode !== 'system' || levels.transitioning`)); i++) await sleep(250);
  await sleep(300);

  seamless = await evaluate(`(() => {
    game.afterFrame = null;
    const segments = __seamless.segments.map((seg) => {
      const blended = seg.frames.filter((x) => x.weight !== null && x.weight > 0 && x.weight < 1);
      return {
        zoom: seg.from + ' → ' + seg.to,
        frames: seg.frames.length,
        crossfadeFrames: blended.length,
        minBrightness: +Math.min(...seg.frames.map((x) => x.brightness)).toFixed(2),
      };
    });
    const kinds = [...new Set(segments.map((x) => x.zoom))];
    return { segments, kinds };
  })()`);
  seamless.handoverShots = [galaxyLoop.handoverShot, planetLoop.handoverShot];
  seamless.ok =
    ['system → galaxy', 'galaxy → system', 'system → planet', 'planet → system'].every((k) => seamless.kinds.includes(k)) &&
    seamless.segments.every((x) => x.crossfadeFrames > 0 && x.minBrightness > 0.5);
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
        // One body with each kind of geyser (moons included: cryo moons have tiger stripes).
        const kind = geyserKind(p.type, p.climate);
        if (kind && !(('geysers-' + kind) in found)) found['geysers-' + kind] = { star: ref.id, expr: 'world.planets[' + i + ']' };
        for (const m of p.moons) {
          const k = geyserKind(m.type, m.climate);
          if (k === 'cryo' && !('geysers-cryo-moon' in found))
            found['geysers-cryo-moon'] = { star: ref.id, expr: 'world.moons.find((m) => m.name === ' + JSON.stringify(m.name) + ')' };
          if (k === 'sulphur' && !('geysers-sulphur' in found))
            found['geysers-sulphur'] = { star: ref.id, expr: 'world.moons.find((m) => m.name === ' + JSON.stringify(m.name) + ')' };
        }
      });
      if (Object.keys(found).length === want.length + 6) break;
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

/**
 * Touch play on an emulated phone (390x844, real CDP touch events): hold a finger on the star (tooltip), lift
 * (autopilot to it), drag (rotates, no tap), pinch (zoom), the on-screen stick with a second finger on Boost, then
 * pinch in at a planet to descend, tap the globe, and pinch out to the system and on to the galaxy, checking which
 * on-screen controls each level shows.
 */
async function runTouch() {
  const W = 390;
  const H = 844;
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const home = new URL(url);
  home.searchParams.delete('star');
  await send('Page.navigate', { url: home.href });
  await sleep(4000);
  await page.waitFor(`typeof window.levels !== 'undefined' && !levels.transitioning`, 30000);
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
    upDown: getComputedStyle(document.getElementById('touch-up')).display !== 'none' })`;
  const center = (id) =>
    evaluate(`(() => { const b = document.getElementById('${id}').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
  const r = {};

  r.system = await evaluate(`({ touchMode: game.input.touchMode, help: document.getElementById('hud-help').textContent.startsWith('Tap'), ...${controls} })`);
  const star = await evaluate(`(() => { const p = world.stars[0].renderPosition.clone().project(game.camera); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; })()`);
  await touch('touchStart', [star]);
  await sleep(300);
  r.holdTooltip = await evaluate(`document.getElementById('tooltip').hidden ? null : document.getElementById('tooltip-name').textContent`);
  await touch('touchEnd', []);
  await frames();
  r.tap = await evaluate(`({ star: world.stars[0].name, target: ship.targetBody?.name ?? null, tooltipHidden: document.getElementById('tooltip').hidden })`);
  await evaluate(`ship.stop()`);

  const yaw = await evaluate(`levels.systemLevel.orbit.targetYaw`);
  await swipe([[150, 500]], [[250, 500]]);
  r.drag = { yaw: +((await evaluate(`levels.systemLevel.orbit.targetYaw`)) - yaw).toFixed(2), tapped: await evaluate(`ship.autopilotActive`) };

  const distance = await evaluate(`levels.systemLevel.orbit.targetDistance`);
  await swipe([[195, 380], [195, 460]], [[195, 340], [195, 500]]); // spread to twice as far apart: half the distance
  r.pinch = +((await evaluate(`levels.systemLevel.orbit.targetDistance`)) / distance).toFixed(2);

  const stick = await center('touch-stick');
  const boost = await center('touch-boost');
  const from = await evaluate(`ship.object.position.toArray()`);
  await touch('touchStart', [stick]);
  await touch('touchMove', [[stick[0], stick[1] - 60]]);
  await sleep(800);
  await touch('touchStart', [[stick[0], stick[1] - 60], boost]);
  await sleep(200);
  r.stick = await evaluate(`({ forward: game.input.axis('KeyS', 'KeyW'), boost: game.input.isDown('ShiftLeft'), speed: +ship.speed.toFixed(1) })`);
  await touch('touchEnd', []);
  await frames();
  r.stick.released = await evaluate(`game.input.axis('KeyS', 'KeyW') === 0 && !game.input.isDown('ShiftLeft')`);
  const to = await evaluate(`ship.object.position.toArray()`);
  r.stick.moved = +Math.hypot(to[0] - from[0], to[2] - from[2]).toFixed(1);

  // Down to a planet and back.
  await evaluate(`(() => { const body = world.planets[0]; const side = world.stars[0].position.clone().sub(body.position).normalize(); side.y += 0.5; ship.parkAt(body, side); })()`);
  await sleep(300);
  r.planet = { mode: await pinchUntil('planet', true) };
  if (r.planet.mode === 'planet') {
    Object.assign(r.planet, await evaluate(controls));
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
    r.system.ship === 'space' &&
    r.system.shown &&
    r.system.upDown &&
    r.holdTooltip === r.tap.star &&
    r.tap.target === r.tap.star &&
    r.tap.tooltipHidden &&
    Math.abs(r.drag.yaw) > 0.3 &&
    !r.drag.tapped &&
    Math.abs(r.pinch - 0.5) < 0.05 &&
    r.stick.forward > 0.9 &&
    r.stick.boost &&
    r.stick.released &&
    r.stick.moved > 5 &&
    r.planet.mode === 'planet' &&
    r.planet.ship === 'surface' &&
    r.planet.shown &&
    !r.planet.upDown &&
    r.planet.tapEnRoute &&
    r.planet.back === 'system' &&
    r.galaxy.mode === 'galaxy' &&
    r.galaxy.ship === 'none' &&
    !r.galaxy.shown;
  return r;
}
const touch = started ? await runTouch() : null;

const moved = started && after.pos[2] < before.pos[2] - 10 && after.speed > 5;
const autopiloted = started && autopilot.endDist < Math.max(3, autopilot.startDist * 0.1);
const picked = started && pick.target === pick.star && pick.tooltip === pick.star;
const skyOk = started && sky.band && sky.trails === sky.expectedTrails && sky.visibleTrails >= 1;
const alive =
  started &&
  living.clockSeconds > 0.3 &&
  Math.abs(living.starSeconds - living.clockSeconds) < 0.25 &&
  living.liveParticles.some((n) => n > 0) &&
  living.cometsMoved &&
  !living.pickable &&
  (comet.none || (comet.tooltip === comet.name && !comet.autopilot)) &&
  eye.close < eye.start - 0.1;
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
  galaxyLoop.heldWhileTravelling &&
  galaxyLoop.dockedAt === galaxyLoop.clicked.nearest &&
  galaxyLoop.handoverShot !== null &&
  galaxyLoop.modeAfterZoomIn === 'system' &&
  galaxyLoop.to === galaxyLoop.clicked.nearest &&
  galaxyLoop.arrival.flying.target === galaxyLoop.arrival.flying.star &&
  galaxyLoop.arrival.parked.target === galaxyLoop.arrival.parked.star &&
  !galaxyLoop.arrival.parked.enRoute &&
  Math.abs(galaxyLoop.arrival.parked.distance - galaxyLoop.arrival.parked.park) < 3 &&
  galaxyLoop.arrival.parked.distance > 2 * galaxyLoop.arrival.parked.zone &&
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
  heldZoom.ok &&
  planetLoop.handoverShot !== null &&
  seamless.ok &&
  planetTypes.every((r) => r.ok) &&
  (quick || planetTypes.length === 13); // 7 types, ringed, moon and 4 geyser kinds
const touched = started && touch.ok;
const ok = started && moved && autopiloted && picked && skyOk && alive && looped && sounded && planets && touched && errors.length === 0;
console.log(
  JSON.stringify(
    { ok, started, moved, autopiloted, picked, skyOk, alive, looped, sounded, planets, touched, before, after, autopilot, pick, sky, living, comet, eye, galaxyLoop, seamless, audio, planetLoop, heldZoom, planetTypes, touch, fps, errors, screenshot, galaxyScreenshot: join(outDir, 'galaxy.png') },
    null,
    2,
  ),
);

await page.close();
process.exit(ok ? 0 : 1);
