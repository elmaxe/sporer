import { describe, expect, it } from 'vitest';
import { LogRing, MAX_LOG_TEXT, formatLogArgs } from '../src/debug/consoleLog';
import { clampMark, dumpFileName, markNear, summaryLines, type DebugDump } from '../src/debug/dumpFormat';
import { FrameTimes } from '../src/debug/frameTimes';

describe('console log ring', () => {
  it('keeps the latest entries and counts the dropped ones', () => {
    const ring = new LogRing(3);
    for (let i = 0; i < 5; i++) ring.push({ t: i, level: 'error', text: `e${i}` });
    expect(ring.entries().map((e) => e.text)).toEqual(['e2', 'e3', 'e4']);
    expect(ring.dropped).toBe(2);
  });

  it('formats errors, objects and long text', () => {
    const err = new Error('boom');
    expect(formatLogArgs(['failed:', err])).toContain('boom');
    expect(formatLogArgs([{ a: 1 }, 2, null])).toBe('{"a":1} 2 null');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatLogArgs([circular])).toBe('[object Object]');
    const long = formatLogArgs(['x'.repeat(MAX_LOG_TEXT + 50)]);
    expect(long.length).toBe(MAX_LOG_TEXT + 1);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('frame times', () => {
  it('measures the gaps between frames, oldest first, in a fixed ring', () => {
    const f = new FrameTimes(4);
    expect(f.stats()).toBeNull();
    let t = 0;
    for (const dt of [10, 20, 30, 40, 50, 60]) f.frame((t += dt));
    // The first frame has no gap; the ring keeps the latest four.
    expect(f.durations()).toEqual([30, 40, 50, 60]);
    const s = f.stats()!;
    expect(s.frames).toBe(4);
    expect(s.meanMs).toBe(45);
    expect(s.maxMs).toBe(60);
    expect(s.fps).toBeCloseTo(1000 / 45, 1);
  });
});

describe('dump format', () => {
  it('names files by local time, sortable', () => {
    expect(dumpFileName(new Date(2026, 9, 2, 14, 3, 7))).toBe('sporer-dump-2026-10-02-1403-07.json');
  });

  it('clamps marks into the picture', () => {
    expect(clampMark(-0.2, 1.3)).toEqual({ x: 0, y: 1 });
    expect(clampMark(0.123456, 0.5)).toEqual({ x: 0.1235, y: 0.5 });
  });

  it('finds the mark under a tap, measuring round on a tall picture', () => {
    const marks = [
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.52 },
    ];
    // Twice as tall as wide: 0.02 down is 0.04 widths.
    expect(markNear(marks, 0.5, 0.515, 0.03, 2)).toBe(1);
    expect(markNear(marks, 0.5, 0.6, 0.03, 2)).toBe(-1);
    expect(markNear([], 0.5, 0.5, 0.1, 1)).toBe(-1);
  });

  it('summarises a dump for the marked-up picture', () => {
    const dump = {
      note: 'Ring looks wrong\nsee mark 1',
      marks: [{ x: 0.25, y: 0.5 }],
      createdAt: '2026-10-02T10:00:00.000Z',
      build: { branch: 'main', build: '42', commit: 'abc1234', dev: false },
      device: { viewport: [390, 844], devicePixelRatio: 3, touch: true },
      renderer: { gpu: 'Apple GPU', quality: 'full', render: { calls: 120 } },
      performance: { frames: { fps: 58.2, p50Ms: 16.7, p95Ms: 20, maxMs: 41 } },
      state: {
        mode: 'planet',
        seed: null,
        star: 6,
        transitioning: false,
        crossfade: null,
        system: { time: 3, name: 'Haikrai', ship: { enRoute: false, target: null } },
        planet: { time: 12.5, body: { name: 'Haikrai III' }, ship: { radius: 700, clearance: 20 } },
        orbit: { distance: 45 },
        camera: { fov: 65 },
        graphics: { weather: true, plants: false, wireframe: false },
      },
      log: { entries: [{ t: 1, level: 'error', text: 'shader failed\nline 2' }], dropped: 0 },
    } as unknown as DebugDump;
    const lines = summaryLines(dump);
    expect(lines[0]).toBe('Note: Ring looks wrong');
    expect(lines[1]).toBe('see mark 1');
    expect(lines).toContain('Marks: 1 (25%, 50%)');
    expect(lines.some((l) => l.includes('low orbit over Haikrai III') && l.includes('t=12.50 s'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Build: main · build 42 · abc1234'))).toBe(true);
    expect(lines.some((l) => l.includes('390×844 @3x · touch · Apple GPU'))).toBe(true);
    expect(lines.at(-1)).toBe('Console: 1 errors, 0 warnings; last: shader failed');
  });
});
