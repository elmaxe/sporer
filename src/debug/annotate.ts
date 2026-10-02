import type { DumpMark } from './dumpFormat';

/** Widest the marked-up picture gets (px): it's for reading, the full-size screenshots are kept beside it. */
const MAX_WIDTH = 1280;
/** Narrowest: a small picture (low quality on a phone) is scaled up so the summary under it reads. */
const MIN_WIDTH = 720;
const MARK_COLOR = '#ffe14d';
const TEXT_COLOR = '#e8f1ff';
const STRIP_COLOR = '#0a1222';

/** Splits `text` into lines no wider than `width` in the context's font (breaking long words too). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width) {
      line = next;
      continue;
    }
    if (line) out.push(line);
    line = word;
    // A word wider than the line (a URL): cut it.
    while (ctx.measureText(line).width > width && line.length > 1) {
      let n = line.length - 1;
      while (n > 1 && ctx.measureText(line.slice(0, n)).width > width) n--;
      out.push(line.slice(0, n));
      line = line.slice(n);
    }
  }
  if (line) out.push(line);
  return out;
}

/** Draws a numbered ring at (x, y) px. */
function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, label: string): void {
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.arc(x, y, r + ctx.lineWidth * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = MARK_COLOR;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  // The number on a tab above right of the ring, off the spot itself.
  const size = Math.max(12, r * 0.7);
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  const w = ctx.measureText(label).width + size * 0.6;
  const tx = x + r * 0.7;
  const ty = y - r * 0.7 - size * 1.2;
  ctx.fillStyle = MARK_COLOR;
  ctx.fillRect(tx, ty, w, size * 1.3);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, tx + size * 0.3, ty + size * 0.68);
}

/**
 * The marked-up picture for a debug dump: the screen with the player's marks
 * as numbered rings, and under it (not over it, where it would hide the
 * problem; on a phone there's no room beside it) a strip with the summary
 * lines, wrapped to the picture's width.
 */
export function drawAnnotated(image: CanvasImageSource, width: number, height: number, marks: readonly DumpMark[], lines: readonly string[]): HTMLCanvasElement {
  const scale = Math.min(MAX_WIDTH / width, Math.max(1, MIN_WIDTH / width));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontSize = Math.round(Math.min(22, Math.max(13, w / 42)));
  const font = `${fontSize}px system-ui, sans-serif`;
  const pad = Math.round(fontSize * 0.8);
  ctx.font = font;
  const wrapped = lines.flatMap((l) => wrap(ctx, l, w - pad * 2));
  const lineHeight = Math.round(fontSize * 1.35);
  const strip = pad * 2 + wrapped.length * lineHeight;

  canvas.width = w;
  canvas.height = h + strip;
  ctx.drawImage(image, 0, 0, w, h);
  const r = Math.max(14, Math.min(w, h) * 0.045);
  marks.forEach((m, i) => drawMark(ctx, m.x * w, m.y * h, r, String(i + 1)));

  ctx.fillStyle = STRIP_COLOR;
  ctx.fillRect(0, h, w, strip);
  ctx.fillStyle = MARK_COLOR;
  ctx.fillRect(0, h, w, 2);
  ctx.font = font;
  ctx.textBaseline = 'top';
  ctx.fillStyle = TEXT_COLOR;
  wrapped.forEach((l, i) => ctx.fillText(l, pad, h + pad + i * lineHeight));
  return canvas;
}
