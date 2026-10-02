// Unpacks a debug dump (the game's menu → "Save debug dump", or F8) for reading: its pictures as files, the rest
// as JSON without the pictures, and a readable summary on stdout. See the debug-dump skill.
//
// Usage: npm run dump -- <dump.json> [--out <dir>]
//   --out <dir>   where the files go (default: a folder next to the dump, named after it)
//
// Writes:
//   annotated.jpg   the screen with the player's marks (numbered rings) and a summary strip under it: look first
//   screen.jpg      the screen as the player saw it: the game with the HUD, tooltip, maps and buttons over it
//   game.png        the game's own picture, exact pixels (no HTML overlays)
//   state.json      the dump without the pictures (game state, device, renderer, frame times, console log, tunables)
// Prints the summary, every console error, the marks in picture pixels, and the command that restores the dump's
// state in the headless browser (npm run shot -- --dump <file>).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
let file = null;
let out = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = args[++i];
  else if (args[i].startsWith('--')) throw new Error(`Unknown option ${args[i]}`);
  else file = args[i];
}
if (!file) {
  console.error('Usage: npm run dump -- <dump.json> [--out <dir>]');
  process.exit(1);
}
file = resolve(file);
const dump = JSON.parse(readFileSync(file, 'utf8'));
if (dump.format !== 'sporer-debug-dump') {
  console.error(`${file} isn't a debug dump (format: ${dump.format})`);
  process.exit(1);
}
out = resolve(out ?? join(dirname(file), basename(file, '.json')));
mkdirSync(out, { recursive: true });

const written = [];
const images = dump.images ?? {};
const sizes = {};
for (const [key, name] of [
  ['annotated', 'annotated'],
  ['screen', 'screen'],
  ['game', 'game'],
]) {
  const url = images[key];
  if (!url) continue;
  const m = /^data:image\/(png|jpeg);base64,(.*)$/.exec(url);
  if (!m) continue;
  const path = join(out, `${name}.${m[1] === 'jpeg' ? 'jpg' : 'png'}`);
  const bytes = Buffer.from(m[2], 'base64');
  writeFileSync(path, bytes);
  sizes[key] = imageSize(bytes);
  written.push(path);
}
const { images: _, ...rest } = dump;
writeFileSync(join(out, 'state.json'), JSON.stringify(rest, null, 2));
written.push(join(out, 'state.json'));

/** Width and height of a PNG or JPEG. */
function imageSize(b) {
  if (b[0] === 0x89) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; i < b.length; ) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    // Start of frame (baseline or progressive): height then width.
    if (marker >= 0xc0 && marker <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}

const lines = [];
const say = (s = '') => lines.push(s);
const s = dump.state;
say(`Debug dump ${basename(file)} · taken ${dump.createdAt}`);
say(`Note: ${dump.note?.trim() ? dump.note.trim().replace(/\n/g, '\n      ') : '(none)'}`);
const [sw, sh] = sizes.screen ?? sizes.game ?? [0, 0];
const [vw, vh] = dump.device.viewport;
if (dump.marks.length > 0) {
  say('Marks (on screen.jpg / game.png; CSS px of the page in brackets):');
  dump.marks.forEach((m, i) =>
    say(`  ${i + 1}: ${Math.round(m.x * sw)},${Math.round(m.y * sh)} px  [${Math.round(m.x * vw)},${Math.round(m.y * vh)}]  (${(m.x * 100).toFixed(1)}%, ${(m.y * 100).toFixed(1)}%)`),
  );
} else say('Marks: none');
say(`URL: ${dump.url}`);
const b = dump.build;
say(`Build: ${b.branch ?? '?'} · ${b.build !== null ? `build ${b.build}` : b.dev ? 'dev server' : 'local build'} · commit ${b.commit ?? '?'}`);
if (s) {
  say(`Level: ${s.mode}${s.transitioning ? ` (mid-transition, crossfade ${s.crossfade})` : ''} · seed ${s.seed ?? 'default'} · system ${s.system.id} ${s.system.name}${s.system.starless ? ' (rogue)' : ''}`);
  const ship = s.system.ship;
  say(`System: t=${s.system.time.toFixed(3)} s · ship ${ship.enRoute ? 'flying to' : 'hovering at'} ${ship.target ? `${ship.target.name} (${ship.target.kind} ${ship.target.index})` : '?'} · view distance ${ship.viewDistance.toFixed(1)}`);
  if (s.planet) {
    const p = s.planet;
    say(`Low orbit: ${p.body.name} (${p.body.kind} ${p.body.index}) · t=${p.time.toFixed(3)} s · globe radius ${p.radius.toFixed(1)} · ship radius ${p.ship.radius.toFixed(2)}${p.ship.clearance !== null ? `, ${p.ship.clearance.toFixed(2)} above ground` : ''}`);
    say(`  Planet lab: ${p.lab}`);
  }
  if (s.galaxy) say(`Galaxy: at star ${s.galaxy.current}${s.galaxy.destination !== null ? ` → ${s.galaxy.destination}` : ''} · spin ${s.galaxy.spin.toFixed(4)}`);
  const c = s.camera;
  say(`Camera: orbit distance ${s.orbit.distance.toFixed(2)}, look-up ${s.orbit.lookUp.toFixed(3)} · position ${c.position.map((v) => v.toFixed(2)).join(', ')} · fov ${c.fov}`);
  const g = s.graphics;
  say(`Graphics: weather ${g.weather ? 'on' : 'off'} · plants ${g.plants ? 'on' : 'off'} · wireframe ${g.wireframe ? 'on' : 'off'}`);
  const hud = Object.values(s.ui.hud);
  if (hud.length > 0) say(`HUD: ${hud.join(' | ')}`);
  if (s.ui.tooltip) say(`Tooltip: ${s.ui.tooltip}`);
  say(`Maps: system ${s.ui.systemMap ? 'shown' : 'hidden'} · planet ${s.ui.planetMap ? 'shown' : 'hidden'} · overlays ${s.ui.overlays.map((o) => `${o.id} [${o.rect.join(',')}]`).join(' ')}`);
} else say(`State: unavailable (${dump.stateError ?? 'unknown'})`);
const d = dump.device;
say(`Device: ${vw}×${vh} CSS px @${d.devicePixelRatio}x${d.touch ? ' · touch' : ''}${d.standalone ? ' · home-screen app' : ''}${d.fullscreen ? ' · fullscreen' : ''} · ${d.orientation ?? ''} · ${d.userAgent}`);
const r = dump.renderer;
if (r) say(`Renderer: ${r.gpu ?? '?'} (${r.vendor ?? '?'}) · ${r.webgl} · pixel ratio ${r.pixelRatio} · buffer ${r.drawingBuffer.join('×')} · ${r.quality} quality · ${r.render.calls} draws, ${r.render.triangles} triangles in the frame · ${r.programs} programs${r.contextLost ? ' · CONTEXT LOST' : ''}`);
const f = dump.performance.frames;
if (f) say(`Frames: ${f.fps} FPS over ${f.frames} frames · median ${f.p50Ms} ms · 95th ${f.p95Ms} ms · worst ${f.maxMs} ms${dump.performance.jsHeapMb !== null ? ` · JS heap ${dump.performance.jsHeapMb} MB` : ''} · up ${dump.performance.uptime} s`);
const log = dump.log.entries;
say(`Console: ${log.length} entries${dump.log.dropped ? ` (+${dump.log.dropped} older dropped)` : ''}`);
for (const e of log) say(`  [${e.t.toFixed(1)} s] ${e.level}: ${e.text.replace(/\n/g, '\n      ')}`);
if (images.screenError) say(`Screen picture failed: ${images.screenError} (game.png has the game alone)`);
say();
say(`Files: ${written.join('  ')}`);
if (s) {
  const phone = d.touch ? ' --phone' : '';
  say(`Reproduce: npm run shot -- --dump ${file} --out ${join(out, 'repro')} --clean${phone} shot:restored`);
}
console.log(lines.join('\n'));
