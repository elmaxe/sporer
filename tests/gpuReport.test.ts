import { describe, expect, it } from 'vitest';
import {
  OUTSIDE_PASSES,
  gpuReportLines,
  summarizeCapture,
  summarizeTimings,
  type DrawRecord,
  type FrameCapture,
  type FrameSample,
} from '../src/debug/gpuReport';

const pass = (name: string, gpuMs: number | null, cpuMs = 1, draws = 10, triangles = 100) => ({ name, calls: 1, gpuMs, cpuMs, draws, triangles });

describe('GPU timings', () => {
  it('averages each pass over every frame, the most expensive first', () => {
    const frames: FrameSample[] = [
      { gpuMs: 6, cpuMs: 4, passes: [pass('Sky', 2), pass('Planet', 4)] },
      // The sky wasn't drawn in this frame: it counts as 0 there.
      { gpuMs: 4, cpuMs: 2, passes: [pass('Planet', 4)] },
    ];
    const t = summarizeTimings(frames, 1, true);
    expect(t.frames).toBe(2);
    expect(t.discarded).toBe(1);
    expect(t.gpuMs).toEqual({ mean: 5, p50: 6, p95: 6, max: 6 });
    expect(t.passes.map((p) => p.name)).toEqual(['Planet', 'Sky']);
    const [planet, sky] = t.passes;
    expect(planet!.gpuMs).toBe(4);
    expect(planet!.share).toBe(0.8);
    expect(sky!.gpuMs).toBe(1);
    expect(sky!.gpuMsMax).toBe(2);
    expect(sky!.calls).toBe(0.5);
    // The passes' shares add up to the frame.
    expect(t.passes.reduce((s, p) => s + p.share!, 0)).toBeCloseTo(1);
  });

  it('orders by CPU time where there are no timer queries', () => {
    const frames: FrameSample[] = [{ gpuMs: null, cpuMs: 5, passes: [pass('A', null, 1), pass('B', null, 3)] }];
    const t = summarizeTimings(frames, 0, false);
    expect(t.gpuMs).toBeNull();
    expect(t.passes.map((p) => [p.name, p.gpuMs, p.share])).toEqual([
      ['B', null, null],
      ['A', null, null],
    ]);
  });
});

const draw = (over: Partial<DrawRecord>): DrawRecord => ({
  pass: 'System',
  object: 'Rock',
  geometry: 1,
  kind: 'Mesh',
  material: 'MeshStandardMaterial',
  program: 1,
  instances: 1,
  triangles: 10,
  points: 0,
  lines: 0,
  transparent: false,
  blending: 'NormalBlending',
  depthTest: true,
  depthWrite: true,
  ...over,
});

const capture = (draws: DrawRecord[], calls: Record<string, number> = {}): FrameCapture => ({
  gpu: 'Test GPU',
  drawingBuffer: [100, 50],
  draws,
  programs: [
    { id: 1, name: 'Rock', draws: draws.length, log: null },
    { id: 2, name: 'Nebula', draws: 0, log: "warning X4000: use of potentially uninitialized variable (f_smoothDensity)\nmore" },
  ],
  gl: { calls, bufferBytes: 2 * 1024 * 1024, textureBytes: 0 },
});

describe('frame capture summary', () => {
  it('adds the draws up per pass in drawing order and per object', () => {
    const s = summarizeCapture(
      capture([
        draw({ pass: 'Sky', object: 'Stars', points: 500, triangles: 0, transparent: true }),
        draw({}),
        draw({ triangles: 30 }),
        draw({ object: 'Sea', material: 'Sea' }),
      ]),
    );
    expect(s.draws).toBe(4);
    expect(s.triangles).toBe(50);
    expect(s.points).toBe(500);
    expect(s.passes).toEqual([
      { name: 'Sky', draws: 1, triangles: 0, points: 500, transparent: 1 },
      { name: 'System', draws: 3, triangles: 50, points: 0, transparent: 0 },
    ]);
    expect(s.groups[0]).toMatchObject({ object: 'Rock', draws: 2, triangles: 40, geometries: 1 });
  });

  it('suggests instancing only for one geometry drawn many times', () => {
    const same = Array.from({ length: 12 }, () => draw({}));
    const many = Array.from({ length: 12 }, (_, i) => draw({ object: 'Moon', geometry: 100 + i }));
    const s = summarizeCapture(capture([...same, ...many]));
    const instancing = s.hints.filter((h) => h.includes('InstancedMesh'));
    expect(instancing).toHaveLength(1);
    expect(instancing[0]).toContain('Rock');
  });

  it('points out compiles, big uploads and driver messages', () => {
    const s = summarizeCapture(capture([draw({})], { compileShader: 2, linkProgram: 1, useProgram: 1 }));
    expect(s.compiles).toBe(3);
    expect(s.programLogs).toEqual([{ name: 'Nebula', log: expect.stringContaining('f_smoothDensity') }]);
    expect(s.hints.some((h) => h.includes('3 shader compiles'))).toBe(true);
    expect(s.hints.some((h) => h.includes('2.0 MB of vertex'))).toBe(true);
    expect(s.hints.some((h) => h.startsWith('The driver has something to say about Nebula: warning X4000'))).toBe(true);
  });
});

describe('report', () => {
  it('lists the passes, leaving out an idle outside row, and the capture', () => {
    const timings = summarizeTimings([{ gpuMs: 3, cpuMs: 1, passes: [pass('Planet', 3), { ...pass(OUTSIDE_PASSES, 0), calls: 0 }] }], 0, true);
    const lines = gpuReportLines(timings, capture([draw({})]));
    expect(lines[0]).toBe('GPU: Test GPU · 100×50 px');
    expect(lines.some((l) => l.startsWith('  Planet: GPU 3.00 ms (100%)'))).toBe(true);
    expect(lines.some((l) => l.includes(OUTSIDE_PASSES))).toBe(false);
    expect(lines.some((l) => l.startsWith('Captured frame: 1 draws'))).toBe(true);
  });
});
