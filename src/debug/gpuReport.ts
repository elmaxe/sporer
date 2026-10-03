/**
 * What the GPU profiler (GpuProfiler.ts) measured and captured, and how to
 * read it: per-pass GPU and CPU times over a run of frames, and one frame's
 * draw calls, WebGL calls, uploads and shader programs. A pass is one
 * `renderer.render` call, named after its scene (and render target); time
 * spent between passes (clears, the crossfade's copy) is its own row.
 * Pure: no DOM or THREE.
 */

/** The row for GPU work done outside every `renderer.render` call. */
export const OUTSIDE_PASSES = '(outside passes)';

/** One pass in one frame, its nested passes' work left out. */
export interface PassSample {
  name: string;
  /** How many times it was rendered in the frame. */
  calls: number;
  /** GPU time (timer queries), or null where they aren't supported. */
  gpuMs: number | null;
  /** CPU time spent issuing it. */
  cpuMs: number;
  draws: number;
  triangles: number;
}

export interface FrameSample {
  /** The whole frame's GPU time (every pass and the work between them), or null. */
  gpuMs: number | null;
  /** The whole frame's CPU time: updates and rendering. */
  cpuMs: number;
  passes: PassSample[];
}

export interface Stats {
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

export interface PassTiming {
  name: string;
  /** Mean renders per frame. */
  calls: number;
  /** Mean per frame (frames without the pass count as 0), and the worst frame. */
  gpuMs: number | null;
  gpuMsMax: number | null;
  cpuMs: number;
  draws: number;
  triangles: number;
  /** Fraction of the frame's GPU time. */
  share: number | null;
}

/** Per-pass timings over a run of frames, the most expensive pass first. */
export interface GpuTimings {
  /** Whether EXT_disjoint_timer_query_webgl2 measured GPU time (else only CPU times). */
  timerQueries: boolean;
  frames: number;
  /** Frames thrown away because the GPU's timer was disturbed (power state, context switch). */
  discarded: number;
  gpuMs: Stats | null;
  cpuMs: Stats;
  passes: PassTiming[];
}

const round = (v: number, digits = 3) => Math.round(v * 10 ** digits) / 10 ** digits;

function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const mean = values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
  return { mean: round(mean), p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted.at(-1) ?? 0) };
}

/** Sums the frames up per pass, most GPU time first (CPU time where there's no GPU timing). */
export function summarizeTimings(frames: FrameSample[], discarded: number, timerQueries: boolean): GpuTimings {
  const n = Math.max(1, frames.length);
  const passes = new Map<string, { calls: number; gpu: number; gpuMax: number; cpu: number; draws: number; triangles: number; order: number }>();
  for (const frame of frames) {
    for (const p of frame.passes) {
      let acc = passes.get(p.name);
      if (!acc) passes.set(p.name, (acc = { calls: 0, gpu: 0, gpuMax: 0, cpu: 0, draws: 0, triangles: 0, order: passes.size }));
      acc.calls += p.calls;
      acc.gpu += p.gpuMs ?? 0;
      acc.gpuMax = Math.max(acc.gpuMax, p.gpuMs ?? 0);
      acc.cpu += p.cpuMs;
      acc.draws += p.draws;
      acc.triangles += p.triangles;
    }
  }
  const gpuFrames = timerQueries ? frames.map((f) => f.gpuMs ?? 0) : [];
  const gpuMs = timerQueries && frames.length > 0 ? stats(gpuFrames) : null;
  const rows: (PassTiming & { order: number })[] = [...passes].map(([name, a]) => ({
    name,
    calls: round(a.calls / n, 2),
    gpuMs: timerQueries ? round(a.gpu / n) : null,
    gpuMsMax: timerQueries ? round(a.gpuMax) : null,
    cpuMs: round(a.cpu / n),
    draws: round(a.draws / n, 1),
    triangles: Math.round(a.triangles / n),
    share: gpuMs && gpuMs.mean > 0 ? round(a.gpu / n / gpuMs.mean, 3) : null,
    order: a.order,
  }));
  rows.sort((a, b) => (b.gpuMs ?? b.cpuMs) - (a.gpuMs ?? a.cpuMs) || a.order - b.order);
  return {
    timerQueries,
    frames: frames.length,
    discarded,
    gpuMs,
    cpuMs: stats(frames.map((f) => f.cpuMs)),
    passes: rows.map(({ order: _, ...row }) => row),
  };
}

/** One draw call of a captured frame. */
export interface DrawRecord {
  pass: string;
  /** The object's name, else its nearest named ancestor's and its type and geometry ("Sea", "Planet buster › Mesh<SphereGeometry>"). */
  object: string;
  /** The geometry's id, to tell one geometry drawn many times (instancing would do) from many alike. */
  geometry: number;
  /** Mesh, InstancedMesh, Points, LineSegments, Sprite, ... */
  kind: string;
  /** The material's name, else its type; an unnamed ShaderMaterial lists a few of its uniforms to find it by. */
  material: string;
  /** The GL program's id in this capture (see `programs`). */
  program: number;
  instances: number;
  triangles: number;
  points: number;
  lines: number;
  transparent: boolean;
  /** NoBlending, NormalBlending, AdditiveBlending, ... */
  blending: string;
  depthTest: boolean;
  depthWrite: boolean;
}

/** A shader program used in the captured frame. */
export interface ProgramRecord {
  id: number;
  /** Three's program name (the material's name) or the first material drawn with it. */
  name: string;
  draws: number;
  /** The driver's link and compile messages (warnings too), if it left any. */
  log: string | null;
}

/** WebGL calls of the captured frame. */
export interface GlCounts {
  /** Calls per WebGL function. */
  calls: Record<string, number>;
  /** Bytes sent to buffers and textures (image sources counted at 4 bytes a pixel). */
  bufferBytes: number;
  textureBytes: number;
}

export interface FrameCapture {
  gpu: string | null;
  /** Drawing buffer in device px. */
  drawingBuffer: [number, number];
  draws: DrawRecord[];
  programs: ProgramRecord[];
  gl: GlCounts;
}

/** Draws of one object with one material in one pass, added up. */
export interface DrawGroup {
  pass: string;
  object: string;
  material: string;
  draws: number;
  /** Distinct geometries among the draws. */
  geometries: number;
  instances: number;
  triangles: number;
  points: number;
}

export interface CaptureSummary {
  draws: number;
  triangles: number;
  points: number;
  lines: number;
  /** Per pass, in the order drawn. */
  passes: { name: string; draws: number; triangles: number; points: number; transparent: number }[];
  /** The objects drawn most often, then those with the most triangles. */
  groups: DrawGroup[];
  programSwitches: number;
  textureBinds: number;
  stateChanges: number;
  bufferBytes: number;
  textureBytes: number;
  /** Shaders compiled or programs linked during the frame: a hitch. */
  compiles: number;
  /** Programs whose driver log isn't empty (warnings or errors). */
  programLogs: { name: string; log: string }[];
  /** Things worth a look, in plain words. */
  hints: string[];
}

/** WebGL calls that change the pipeline's state (not binds, uniforms or draws). */
const STATE_CALLS = ['enable', 'disable', 'blendFunc', 'blendFuncSeparate', 'blendEquation', 'blendEquationSeparate', 'depthFunc', 'depthMask', 'colorMask', 'cullFace', 'frontFace', 'polygonOffset', 'stencilFunc', 'stencilOp', 'stencilMask', 'viewport', 'scissor'];

/** The capture's totals, per pass and per object, and hints on what to look at. */
export function summarizeCapture(capture: FrameCapture, groupLimit = 15): CaptureSummary {
  const { draws, gl } = capture;
  const passes: CaptureSummary['passes'] = [];
  const groups = new Map<string, DrawGroup>();
  const geometries = new Map<DrawGroup, Set<number>>();
  for (const d of draws) {
    let pass = passes.at(-1);
    if (pass?.name !== d.pass) passes.push((pass = { name: d.pass, draws: 0, triangles: 0, points: 0, transparent: 0 }));
    pass.draws++;
    pass.triangles += d.triangles;
    pass.points += d.points;
    if (d.transparent) pass.transparent++;
    const key = `${d.pass}\u0000${d.object}\u0000${d.material}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { pass: d.pass, object: d.object, material: d.material, draws: 0, geometries: 0, instances: 0, triangles: 0, points: 0 }));
    let ids = geometries.get(g);
    if (!ids) geometries.set(g, (ids = new Set()));
    ids.add(d.geometry);
    g.geometries = ids.size;
    g.draws++;
    g.instances += d.instances;
    g.triangles += d.triangles;
    g.points += d.points;
  }
  const count = (name: string) => gl.calls[name] ?? 0;
  const sum = (key: 'triangles' | 'points' | 'lines') => draws.reduce((s, d) => s + d[key], 0);
  const summary: CaptureSummary = {
    draws: draws.length,
    triangles: sum('triangles'),
    points: sum('points'),
    lines: sum('lines'),
    passes,
    groups: [...groups.values()].sort((a, b) => b.draws - a.draws || b.triangles - a.triangles).slice(0, groupLimit),
    programSwitches: count('useProgram'),
    textureBinds: count('bindTexture'),
    stateChanges: STATE_CALLS.reduce((s, name) => s + count(name), 0),
    bufferBytes: gl.bufferBytes,
    textureBytes: gl.textureBytes,
    compiles: count('compileShader') + count('linkProgram'),
    programLogs: capture.programs.filter((p) => p.log).map((p) => ({ name: p.name, log: p.log! })),
    hints: [],
  };
  summary.hints = captureHints(summary, [...groups.values()]);
  return summary;
}

const MB = 1024 * 1024;

function captureHints(s: CaptureSummary, groups: DrawGroup[]): string[] {
  const hints: string[] = [];
  for (const g of groups) {
    if (g.draws >= 10 && g.instances === g.draws && g.geometries === 1) {
      hints.push(`${g.object} (${g.material}) is drawn ${g.draws} times in ${g.pass}, the same geometry once per draw: an InstancedMesh would make it one draw.`);
    }
  }
  if (s.compiles > 0) hints.push(`${s.compiles} shader compiles or program links in this frame: a hitch, unless it's the first frame of something new.`);
  if (s.textureBytes > MB) hints.push(`${(s.textureBytes / MB).toFixed(1)} MB of texture data uploaded in one frame.`);
  if (s.bufferBytes > MB) hints.push(`${(s.bufferBytes / MB).toFixed(1)} MB of vertex or index data uploaded in one frame: upload only the changed ranges (addUpdateRange).`);
  if (s.draws > 0 && s.programSwitches > s.draws * 0.8 && s.draws >= 20) {
    hints.push(`The program changes on almost every draw (${s.programSwitches} switches for ${s.draws} draws): drawing objects with the same material together would save switches.`);
  }
  for (const p of s.programLogs) hints.push(`The driver has something to say about ${p.name}: ${p.log.split('\n')[0]}`);
  return hints;
}

const ms = (v: number | null) => (v === null ? '–' : `${v.toFixed(2)} ms`);

/** A readable report of a run's timings and, if given, a captured frame. */
export function gpuReportLines(timings: GpuTimings | null, capture: FrameCapture | null): string[] {
  const lines: string[] = [];
  if (capture) lines.push(`GPU: ${capture.gpu ?? 'unknown'} · ${capture.drawingBuffer[0]}×${capture.drawingBuffer[1]} px`);
  if (timings) {
    const g = timings.gpuMs;
    lines.push(
      `Frame over ${timings.frames} frames${timings.discarded ? ` (${timings.discarded} discarded)` : ''}: ` +
        (g ? `GPU ${ms(g.mean)} mean, ${ms(g.p95)} 95th, ${ms(g.max)} worst · ` : 'no GPU timer queries · ') +
        `CPU ${ms(timings.cpuMs.mean)} mean`,
    );
    for (const p of timings.passes) {
      const share = p.share === null ? '' : ` (${Math.round(p.share * 100)}%)`;
      if (p.name === OUTSIDE_PASSES) {
        if ((p.gpuMs ?? 0) >= 0.005) lines.push(`  ${p.name}: GPU ${ms(p.gpuMs)}${share}`);
        continue;
      }
      lines.push(`  ${p.name}: GPU ${ms(p.gpuMs)}${share} · CPU ${ms(p.cpuMs)} · ${p.draws} draws · ${p.triangles} triangles${p.calls !== 1 ? ` · ×${p.calls}` : ''}`);
    }
  }
  if (capture) {
    const s = summarizeCapture(capture, 10);
    lines.push(
      `Captured frame: ${s.draws} draws, ${s.triangles} triangles, ${s.points} points · ${s.programSwitches} program switches, ` +
        `${s.textureBinds} texture binds, ${s.stateChanges} state changes · uploads ${(s.bufferBytes / 1024).toFixed(0)} KB buffers, ` +
        `${(s.textureBytes / 1024).toFixed(0)} KB textures`,
    );
    for (const p of s.passes) lines.push(`  ${p.name}: ${p.draws} draws (${p.transparent} transparent), ${p.triangles} triangles, ${p.points} points`);
    lines.push('Most drawn:');
    for (const g of s.groups) {
      const many = g.draws > 1 ? (g.geometries === 1 ? ', one geometry' : `, ${g.geometries} geometries`) : '';
      lines.push(`  ${g.draws}× ${g.object} [${g.material}] in ${g.pass}: ${g.triangles} triangles${g.points ? `, ${g.points} points` : ''}${g.instances > g.draws ? `, ${g.instances} instances` : ''}${many}`);
    }
    for (const h of s.hints) lines.push(`Hint: ${h}`);
  }
  return lines;
}
