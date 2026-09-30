// Draws the home-screen icons (a UFO over a planet, on space) into public/icons/ as PNGs.
// Run with `node scripts/icons.mjs`; no dependencies (a tiny PNG encoder on node:zlib).
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
const SS = 4; // supersamples per axis

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Colour at (u, v) in [0, 1]², v down. `maskable` keeps the art inside the 80% safe zone. */
function shade(u, v, maskable) {
  const k = maskable ? 0.8 : 1;
  const x = (u - 0.5) / k + 0.5;
  const y = (v - 0.5) / k + 0.5;
  // Space: a deep blue glow, with a few stars.
  let c = mix([4, 8, 22], [20, 34, 70], smooth(0.9, 0, Math.hypot(u - 0.35, v - 0.3)));
  for (const [sx, sy, r] of [[0.18, 0.2, 0.012], [0.8, 0.14, 0.009], [0.9, 0.42, 0.007], [0.12, 0.55, 0.008], [0.62, 0.08, 0.006]]) {
    c = mix(c, [220, 235, 255], smooth(r, r * 0.3, Math.hypot(x - sx, y - sy)));
  }
  // The planet: an ocean world lit from the upper left, rising from the bottom.
  const pd = Math.hypot(x - 0.5, y - 1.18) / 0.62;
  if (pd < 1.02) {
    const nx = (x - 0.5) / 0.62;
    const ny = (y - 1.18) / 0.62;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const light = Math.max(0.12, -0.55 * nx - 0.6 * ny + 0.55 * nz);
    const land = Math.sin(nx * 9 + 1) * Math.sin(ny * 11 + nx * 4) > 0.25;
    const ground = land ? [70, 150, 80] : [30, 90, 170];
    c = mix(c, ground.map((g) => g * light), smooth(1.02, 0.99, pd));
    // Atmosphere rim.
    c = mix(c, [120, 200, 255], 0.5 * smooth(0.9, 1.0, pd) * smooth(1.02, 1.0, pd));
  }
  // The UFO: a glowing dome over a saucer.
  const dome = Math.hypot((x - 0.5) / 0.13, (y - 0.43) / 0.12);
  if (dome < 1 && y < 0.47) c = mix(c, mix([102, 255, 204], [220, 255, 245], smooth(1, 0.2, Math.hypot((x - 0.46) / 0.13, (y - 0.38) / 0.12))), smooth(1, 0.92, dome));
  const saucer = Math.hypot((x - 0.5) / 0.3, (y - 0.5) / 0.075);
  if (saucer < 1) c = mix(c, mix([200, 210, 225], [110, 120, 140], smooth(0.44, 0.56, y)), smooth(1, 0.9, saucer));
  for (const lx of [0.33, 0.44, 0.56, 0.67]) {
    c = mix(c, [255, 230, 120], smooth(0.018, 0.008, Math.hypot(x - lx, y - 0.515)));
  }
  // Tractor beam.
  if (y > 0.55 && y < 0.82) {
    const half = 0.05 + (y - 0.55) * 0.35;
    c = mix(c, [102, 255, 204], 0.28 * smooth(half, half * 0.6, Math.abs(x - 0.5)) * smooth(0.82, 0.6, y));
  }
  return c;
}

function png(size, maskable) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let j = 0; j < size; j++) {
    raw[j * (size * 3 + 1)] = 0; // filter: none
    for (let i = 0; i < size; i++) {
      let acc = [0, 0, 0];
      for (let a = 0; a < SS; a++)
        for (let b = 0; b < SS; b++) {
          const c = shade((i + (a + 0.5) / SS) / size, (j + (b + 0.5) / SS) / size, maskable);
          acc = acc.map((v, k) => v + c[k]);
        }
      const o = j * (size * 3 + 1) + 1 + i * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(Math.min(255, acc[k] / (SS * SS)));
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
]) {
  writeFileSync(new URL(name, OUT), png(size, maskable));
  console.log(name);
}
