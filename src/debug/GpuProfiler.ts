import * as THREE from 'three';
import {
  OUTSIDE_PASSES,
  gpuReportLines,
  summarizeTimings,
  type DrawRecord,
  type FrameCapture,
  type FrameSample,
  type GpuTimings,
  type PassSample,
  type ProgramRecord,
} from './gpuReport';

/** A program's shader sources as written and as the browser translated them for the driver (HLSL, Metal, GLSL). */
export interface ShaderSources {
  id: number;
  name: string;
  vertex: string | null;
  fragment: string | null;
  translatedVertex: string | null;
  translatedFragment: string | null;
}

interface PassAcc {
  sample: PassSample;
  gpuNs: number;
}

/** One frame being measured: its passes and the timer queries still in flight. */
interface FrameAcc {
  passes: Map<string, PassAcc>;
  segments: { query: WebGLQuery; pass: PassAcc }[];
  cpuStart: number;
  cpuMs: number;
}

/** A pass being rendered (passes nest: a render inside an object's onBeforeRender, a cube camera). */
interface Open {
  pass: PassAcc;
  t0: number;
  calls0: number;
  triangles0: number;
  childMs: number;
  childCalls: number;
  childTriangles: number;
}

interface Measure {
  want: number;
  frames: FrameSample[];
  discarded: number;
  deadline: number;
  resolve: (t: GpuTimings) => void;
}

interface Capture {
  shaders: boolean;
  started: boolean;
  draws: DrawRecord[];
  calls: Record<string, number>;
  bufferBytes: number;
  textureBytes: number;
  /** GL programs used, in first-use order, with three's id and name. */
  programs: Map<WebGLProgram, ProgramRecord>;
  resolve: (c: { capture: FrameCapture; shaders: ShaderSources[] }) => void;
}

const BLENDING: Record<number, string> = {
  [THREE.NoBlending]: 'NoBlending',
  [THREE.NormalBlending]: 'NormalBlending',
  [THREE.AdditiveBlending]: 'AdditiveBlending',
  [THREE.SubtractiveBlending]: 'SubtractiveBlending',
  [THREE.MultiplyBlending]: 'MultiplyBlending',
  [THREE.CustomBlending]: 'CustomBlending',
};

/** Uniforms three gives every material; left out when naming an unnamed shader by its own. */
const BUILTIN_UNIFORMS = new Set(['modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'isOrthographic']);

/**
 * Measures where the GPU's time goes, pass by pass (`measure`), and records
 * everything one frame sends to it (`capture`): its draw calls with the
 * object and material behind each, its WebGL calls, the bytes uploaded and
 * the shader programs used, with the driver's messages and, on request,
 * their sources. A pass is one `renderer.render` call, named after its
 * scene. Costs nothing until asked: the hooks go in for the frames measured
 * and come out after. `Game` calls `beginFrame` / `endFrame` around each
 * frame. GPU times come from EXT_disjoint_timer_query_webgl2; where it's
 * missing (Firefox, Safari), only CPU times are measured. In the page:
 * `game.gpu.measure()`, `game.gpu.capture()`, `game.gpu.report()`.
 */
export class GpuProfiler {
  private readonly gl: WebGL2RenderingContext;
  private readonly timer: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  /** Frames drawn since the page loaded (to tell a stopped loop from a running one). */
  framesDrawn = 0;
  private measuring: Measure | null = null;
  private capturing: Capture | null = null;
  private frame: FrameAcc | null = null;
  /** Frames drawn whose timer queries haven't all answered yet. */
  private readonly pending: FrameAcc[] = [];
  private readonly open: Open[] = [];
  private outside: PassAcc | null = null;
  private segment: { query: WebGLQuery; pass: PassAcc } | null = null;
  private hooked = false;
  private originalRender: THREE.WebGLRenderer['render'] | null = null;
  private originalDraw: THREE.WebGLRenderer['renderBufferDirect'] | null = null;
  private wrappedGl: string[] = [];

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.timer = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuProfiler['timer'];
  }

  /**
   * Times the next `frames` frames pass by pass (GPU and CPU). Resolves with
   * what it has after `timeoutMs` if the frames stop coming (a stopped loop).
   */
  measure(frames = 60, timeoutMs = 10000): Promise<GpuTimings> {
    if (this.measuring) return Promise.reject(new Error('Already measuring'));
    return new Promise((resolve) => {
      const m: Measure = { want: frames, frames: [], discarded: 0, deadline: performance.now() + timeoutMs, resolve };
      this.measuring = m;
      // The frames may stop coming altogether (a stopped loop): finish anyway.
      setTimeout(() => this.measuring === m && this.finishMeasure(), timeoutMs + 50);
    });
  }

  /**
   * Records the next frame drawn: every draw call, WebGL call, upload and
   * program. With `shaders`, also each program's sources (as written and as
   * translated for the driver). Rejects if no frame is drawn in `timeoutMs`.
   */
  capture(options: { shaders?: boolean } = {}, timeoutMs = 10000): Promise<{ capture: FrameCapture; shaders: ShaderSources[] }> {
    if (this.capturing) return Promise.reject(new Error('Already capturing'));
    return new Promise((resolve, reject) => {
      const c: Capture = {
        shaders: options.shaders ?? false,
        started: false,
        draws: [],
        calls: {},
        bufferBytes: 0,
        textureBytes: 0,
        programs: new Map(),
        resolve,
      };
      this.capturing = c;
      setTimeout(() => {
        if (this.capturing !== c || c.started) return;
        this.capturing = null;
        reject(new Error(`No frame drawn in ${timeoutMs / 1000} s to capture`));
      }, timeoutMs);
    });
  }

  /** Measures and captures, and returns the readable report (gpuReport.ts) with both. */
  async report(frames = 60): Promise<{ lines: string[]; timings: GpuTimings; capture: FrameCapture; shaders: ShaderSources[] }> {
    const timings = await this.measure(frames);
    const { capture, shaders } = await this.capture({ shaders: true });
    return { lines: gpuReportLines(timings, capture), timings, capture, shaders };
  }

  beginFrame(): void {
    this.framesDrawn++;
    if (this.pending.length > 0) this.collect();
    const m = this.measuring;
    if (m && performance.now() > m.deadline) this.finishMeasure();
    const c = this.capturing;
    if (!this.measuring && !c && this.pending.length === 0) {
      if (this.hooked) this.unhook();
      return;
    }
    this.hook();
    if (c && !c.started) {
      c.started = true;
      this.hookGl(c);
    }
    if (this.measuring && this.measuring.frames.length + this.pending.length < this.measuring.want) {
      this.frame = { passes: new Map(), segments: [], cpuStart: performance.now(), cpuMs: 0 };
      this.outside = this.pass(OUTSIDE_PASSES);
      this.startSegment(this.outside);
    }
  }

  endFrame(): void {
    const f = this.frame;
    if (f) {
      this.endSegment();
      f.cpuMs = performance.now() - f.cpuStart;
      this.pending.push(f);
      this.frame = null;
      this.outside = null;
      // Without timer queries there's nothing to wait for.
      if (!this.timer) this.collect();
    }
    const c = this.capturing;
    if (c?.started) {
      this.unhookGl();
      this.capturing = null;
      c.resolve(this.finishCapture(c));
    }
  }

  dispose(): void {
    this.unhook();
    for (const f of this.pending) for (const s of f.segments) this.gl.deleteQuery(s.query);
    this.pending.length = 0;
  }

  // Passes and timer queries

  private pass(name: string): PassAcc {
    const f = this.frame!;
    let p = f.passes.get(name);
    if (!p) f.passes.set(name, (p = { sample: { name, calls: 0, gpuMs: null, cpuMs: 0, draws: 0, triangles: 0 }, gpuNs: 0 }));
    return p;
  }

  /** Starts timing GPU work for `pass` (one query at a time, so a nested pass ends its parent's segment). */
  private startSegment(pass: PassAcc): void {
    if (!this.timer || !this.frame) return;
    const query = this.gl.createQuery();
    this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT, query);
    this.segment = { query, pass };
  }

  private endSegment(): void {
    if (!this.timer || !this.segment) return;
    this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);
    this.frame?.segments.push(this.segment);
    this.segment = null;
  }

  /** Reads the answered queries, oldest frame first; a disjoint timer throws away every frame in flight. */
  private collect(): void {
    const gl = this.gl;
    const timer = this.timer;
    if (timer && gl.getParameter(timer.GPU_DISJOINT_EXT)) {
      for (const f of this.pending) for (const s of f.segments) gl.deleteQuery(s.query);
      if (this.measuring) this.measuring.discarded += this.pending.length;
      this.pending.length = 0;
      return;
    }
    while (this.pending.length > 0) {
      const f = this.pending[0]!;
      if (timer) {
        const last = f.segments.at(-1);
        if (last && !gl.getQueryParameter(last.query, gl.QUERY_RESULT_AVAILABLE)) return;
        for (const s of f.segments) {
          s.pass.gpuNs += gl.getQueryParameter(s.query, gl.QUERY_RESULT) as number;
          gl.deleteQuery(s.query);
        }
      }
      this.pending.shift();
      const passes = [...f.passes.values()].map((p) => ({ ...p.sample, gpuMs: timer ? p.gpuNs / 1e6 : null }));
      const gpuMs = timer ? passes.reduce((s, p) => s + p.gpuMs!, 0) : null;
      const m = this.measuring;
      if (m) {
        m.frames.push({ gpuMs, cpuMs: f.cpuMs, passes });
        if (m.frames.length >= m.want) this.finishMeasure();
      }
    }
  }

  private finishMeasure(): void {
    const m = this.measuring;
    if (!m) return;
    this.measuring = null;
    m.resolve(summarizeTimings(m.frames, m.discarded, this.timer !== null));
  }

  // Hooks on the renderer

  private hook(): void {
    if (this.hooked) return;
    this.hooked = true;
    const renderer = this.renderer;
    const render = renderer.render;
    const draw = renderer.renderBufferDirect;
    this.originalRender = render;
    this.originalDraw = draw;
    renderer.render = (scene, camera) => {
      if (!this.frame && !this.capturing?.started) return render.call(renderer, scene, camera);
      this.beginPass(scene);
      try {
        render.call(renderer, scene, camera);
      } finally {
        this.endPass();
      }
    };
    renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
      const c = this.capturing;
      if (!c?.started) return draw.call(renderer, camera, scene, geometry, material, object, group);
      const r = renderer.info.render;
      const triangles = r.triangles;
      const points = r.points;
      const lines = r.lines;
      const calls = r.calls;
      draw.call(renderer, camera, scene, geometry, material, object, group);
      if (r.calls === calls) return;
      c.draws.push(this.drawRecord(c, geometry, material, object, r.triangles - triangles, r.points - points, r.lines - lines));
    };
  }

  private unhook(): void {
    if (!this.hooked) return;
    this.hooked = false;
    this.renderer.render = this.originalRender!;
    this.renderer.renderBufferDirect = this.originalDraw!;
  }

  private currentPassName = OUTSIDE_PASSES;
  private readonly passNames: string[] = [];

  private beginPass(scene: THREE.Object3D): void {
    const name = passName(scene, this.renderer.getRenderTarget());
    this.passNames.push(name);
    this.currentPassName = name;
    if (!this.frame) return;
    const pass = this.pass(name);
    pass.sample.calls++;
    this.endSegment();
    this.startSegment(pass);
    const r = this.renderer.info.render;
    this.open.push({ pass, t0: performance.now(), calls0: r.calls, triangles0: r.triangles, childMs: 0, childCalls: 0, childTriangles: 0 });
  }

  private endPass(): void {
    this.passNames.pop();
    this.currentPassName = this.passNames.at(-1) ?? OUTSIDE_PASSES;
    const o = this.open.pop();
    if (!o || !this.frame) return;
    const r = this.renderer.info.render;
    const ms = performance.now() - o.t0;
    const calls = r.calls - o.calls0;
    const triangles = r.triangles - o.triangles0;
    // Only the pass's own work; its nested passes have their own rows.
    o.pass.sample.cpuMs += ms - o.childMs;
    o.pass.sample.draws += calls - o.childCalls;
    o.pass.sample.triangles += triangles - o.childTriangles;
    const parent = this.open.at(-1);
    if (parent) {
      parent.childMs += ms;
      parent.childCalls += calls;
      parent.childTriangles += triangles;
    }
    this.endSegment();
    this.startSegment(parent?.pass ?? this.outside!);
  }

  // Frame capture

  private drawRecord(c: Capture, geometry: THREE.BufferGeometry, material: THREE.Material, object: THREE.Object3D, triangles: number, points: number, lines: number): DrawRecord {
    const program = (this.renderer.properties.get(material) as { currentProgram?: { id: number; name: string; program: WebGLProgram } }).currentProgram;
    let record = program ? c.programs.get(program.program) : undefined;
    if (program && !record) {
      record = { id: program.id, name: program.name || materialLabel(material), draws: 0, log: null };
      c.programs.set(program.program, record);
    }
    if (record) record.draws++;
    const instanced = object as Partial<THREE.InstancedMesh>;
    return {
      pass: this.currentPassName,
      object: objectLabel(object, geometry),
      geometry: geometry.id,
      kind: object.type,
      material: materialLabel(material),
      program: record?.id ?? -1,
      instances: instanced.isInstancedMesh ? instanced.count! : 1,
      triangles,
      points,
      lines,
      transparent: material.transparent,
      blending: BLENDING[material.blending] ?? String(material.blending),
      depthTest: material.depthTest,
      depthWrite: material.depthWrite,
    };
  }

  /** Counts every WebGL call (and the bytes uploaded) until `unhookGl`. */
  private hookGl(c: Capture): void {
    const gl = this.gl as unknown as Record<string, unknown>;
    const proto = Object.getPrototypeOf(this.gl) as object;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const original = Object.getOwnPropertyDescriptor(proto, name)?.value as unknown;
      if (typeof original !== 'function' || name === 'constructor') continue;
      const bytes = uploadBytes(name);
      gl[name] = (...args: unknown[]) => {
        c.calls[name] = (c.calls[name] ?? 0) + 1;
        if (bytes === 'buffer') c.bufferBytes += bufferBytes(args);
        else if (bytes === 'texture') c.textureBytes += textureBytes(args);
        return (original as (...a: unknown[]) => unknown).apply(this.gl, args);
      };
      this.wrappedGl.push(name);
    }
  }

  private unhookGl(): void {
    const gl = this.gl as unknown as Record<string, unknown>;
    for (const name of this.wrappedGl) delete gl[name];
    this.wrappedGl = [];
  }

  private finishCapture(c: Capture): { capture: FrameCapture; shaders: ShaderSources[] } {
    const gl = this.gl;
    const shaders: ShaderSources[] = [];
    const debugShaders = c.shaders ? gl.getExtension('WEBGL_debug_shaders') : null;
    for (const [program, record] of c.programs) {
      const source: ShaderSources = { id: record.id, name: record.name, vertex: null, fragment: null, translatedVertex: null, translatedFragment: null };
      const logs = [gl.getProgramInfoLog(program)?.trim() ?? ''];
      for (const s of gl.getAttachedShaders(program) ?? []) {
        const type = gl.getShaderParameter(s, gl.SHADER_TYPE) as number;
        const text = gl.getShaderSource(s);
        // Three deletes its shaders once linked, which loses their logs and translations: compile a copy.
        const copy = text === null ? null : gl.createShader(type);
        let translated: string | null = null;
        if (copy && text !== null) {
          gl.shaderSource(copy, text);
          gl.compileShader(copy);
          logs.push(gl.getShaderInfoLog(copy)?.trim() ?? '');
          translated = debugShaders?.getTranslatedShaderSource(copy) || null;
          gl.deleteShader(copy);
        }
        if (type === gl.VERTEX_SHADER) [source.vertex, source.translatedVertex] = [text, translated];
        else [source.fragment, source.translatedFragment] = [text, translated];
      }
      record.log = logs.filter(Boolean).join('\n') || null;
      if (c.shaders) shaders.push(source);
    }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      capture: {
        gpu: (gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) as string | null) ?? null,
        drawingBuffer: [size.x, size.y],
        draws: c.draws,
        programs: [...c.programs.values()],
        gl: { calls: c.calls, bufferBytes: c.bufferBytes, textureBytes: c.textureBytes },
      },
      shaders,
    };
  }
}

/** A pass's name: its scene's (or object's) name or type, and where it draws if not to the screen. */
function passName(scene: THREE.Object3D, target: THREE.WebGLRenderTarget | null): string {
  let name = scene.name || scene.type;
  const override = (scene as Partial<THREE.Scene>).overrideMaterial;
  if (override) name += ` [${override.name || override.type}]`;
  if (target) name += ` → ${target instanceof THREE.WebGLCubeRenderTarget ? 'cube ' : ''}${target.width}×${target.height}`;
  return name;
}

function objectLabel(object: THREE.Object3D, geometry: THREE.BufferGeometry): string {
  if (object.name) return object.name;
  const self = `${object.type}<${geometry.name || geometry.type}>`;
  for (let p = object.parent; p; p = p.parent) if (p.name && !(p as Partial<THREE.Scene>).isScene) return `${p.name} › ${self}`;
  return self;
}

function materialLabel(material: THREE.Material): string {
  if (material.name) return material.name;
  const uniforms = (material as Partial<THREE.ShaderMaterial>).uniforms;
  if (!uniforms) return material.type;
  const own = Object.keys(uniforms).filter((u) => !BUILTIN_UNIFORMS.has(u));
  return own.length ? `${material.type} {${own.slice(0, 5).join(', ')}${own.length > 5 ? ', …' : ''}}` : material.type;
}

function uploadBytes(name: string): 'buffer' | 'texture' | null {
  if (name === 'bufferData' || name === 'bufferSubData') return 'buffer';
  if (/^(compressed)?[tT]ex(Sub)?Image[23]D$/.test(name)) return 'texture';
  return null;
}

/** bufferData(target, size | data, usage, srcOffset?, length?) and bufferSubData(target, offset, data, srcOffset?, length?). */
function bufferBytes(args: unknown[]): number {
  const data = args.find((a) => ArrayBuffer.isView(a) || a instanceof ArrayBuffer) as ArrayBufferView | ArrayBuffer | undefined;
  // A size alone allocates; nothing is sent.
  if (!data) return 0;
  const i = args.indexOf(data);
  const length = args[i + 2];
  if (typeof length === 'number' && length > 0 && ArrayBuffer.isView(data)) {
    return length * ((data as Partial<Float32Array>).BYTES_PER_ELEMENT ?? 1);
  }
  return data.byteLength;
}

/** The pixels sent by a tex(Sub)Image call: an array's bytes, or 4 bytes a pixel of an image source. */
function textureBytes(args: unknown[]): number {
  for (const a of args) {
    if (ArrayBuffer.isView(a)) return a.byteLength;
    if (a && typeof a === 'object' && 'width' in a && 'height' in a) {
      const { width, height } = a as { width: number; height: number };
      return width * height * 4;
    }
  }
  return 0;
}
