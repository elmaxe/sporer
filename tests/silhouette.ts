/**
 * A mesh's silhouette seen along unit direction `dir` (orthographic), as a
 * `res` × `res` grid of 0/1 over a square `size` across, centred on the
 * picture of `centre` (default: the origin). For comparing levels of detail
 * in tests.
 */
export function silhouette(
  positions: Float32Array,
  dir: readonly [number, number, number],
  size: number,
  res: number,
  centre: readonly [number, number, number] = [0, 0, 0],
): Uint8Array {
  const grid = new Uint8Array(res * res);
  const cell = size / res;
  // The picture's axes: across (horizontal where it can be) and up.
  const ux = Math.abs(dir[1]) > 0.999 ? 1 : dir[2];
  const uz = Math.abs(dir[1]) > 0.999 ? 0 : -dir[0];
  const ul = Math.hypot(ux, uz);
  const u = [ux / ul, 0, uz / ul];
  const v = [dir[1] * u[2]! - dir[2] * u[1]!, dir[2] * u[0]! - dir[0] * u[2]!, dir[0] * u[1]! - dir[1] * u[0]!];
  const cu = centre[0] * u[0]! + centre[1] * u[1]! + centre[2] * u[2]!;
  const cv = centre[0] * v[0]! + centre[1] * v[1]! + centre[2] * v[2]!;
  const px = (i: number) => (positions[i]! * u[0]! + positions[i + 1]! * u[1]! + positions[i + 2]! * u[2]! - cu) / cell + res / 2;
  const py = (i: number) => (positions[i]! * v[0]! + positions[i + 1]! * v[1]! + positions[i + 2]! * v[2]! - cv) / cell + res / 2;
  for (let t = 0; t < positions.length; t += 9) {
    const ax = px(t), ay = py(t), bx = px(t + 3), by = py(t + 3), cx = px(t + 6), cy = py(t + 6);
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(res - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(res - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const qx = x + 0.5, qy = y + 0.5;
        const w0 = ((bx - qx) * (cy - qy) - (by - qy) * (cx - qx)) / area;
        const w1 = ((cx - qx) * (ay - qy) - (cy - qy) * (ax - qx)) / area;
        if (w0 >= 0 && w1 >= 0 && 1 - w0 - w1 >= 0) grid[y * res + x] = 1;
      }
    }
  }
  return grid;
}

/** Covered cells of a silhouette. */
export function coverageCount(grid: Uint8Array): number {
  let n = 0;
  for (const c of grid) n += c;
  return n;
}
