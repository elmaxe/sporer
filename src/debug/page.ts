/** Small page helpers shared by the game's and the labs' dump state (gameState.ts, labDump.ts, plantLabDump.ts). */

/**
 * Where each of the elements `ids` is (CSS px: left, top, width, height), the
 * visible ones. An id starting with "." is a selector instead (".lil-gui.lil-auto-place").
 */
export function overlayRects(ids: readonly string[]): { id: string; rect: [number, number, number, number] }[] {
  const out: { id: string; rect: [number, number, number, number] }[] = [];
  for (const id of ids) {
    const el = id.startsWith('.') ? document.querySelector<HTMLElement>(id) : document.getElementById(id);
    if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    out.push({ id, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
  }
  return out;
}

/** Resolves after `n` animation frames. */
export const frames = (n: number): Promise<void> =>
  new Promise<void>((resolve) => {
    let i = 0;
    const tick = () => (++i >= n ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
