import { describe, expect, it } from 'vitest';
import { Jobs, now } from '../src/core/jobs';

describe('Jobs', () => {
  it('runs put-off jobs in order, a budget at a time, and those they put off after the rest', () => {
    const jobs = new Jobs();
    const done: string[] = [];
    let time = 0;
    const clock = () => time;
    jobs.defer(() => {
      done.push('a');
      time += 4;
      jobs.defer(() => done.push('c'));
    });
    jobs.defer(() => {
      done.push('b');
      time += 4;
    });
    expect(jobs.done).toBe(false);
    jobs.run(3, clock);
    // One job is always run, even over the budget.
    expect(done).toEqual(['a']);
    expect(jobs.left).toBe(2);
    jobs.run(10, clock);
    expect(done).toEqual(['a', 'b', 'c']);
    expect(jobs.done).toBe(true);
    jobs.run(10, clock);
    expect(done).toEqual(['a', 'b', 'c']);
  });

  it('runAll empties the queue; now runs at once', () => {
    const jobs = new Jobs();
    let n = 0;
    for (let i = 0; i < 5; i++) jobs.defer(() => n++);
    jobs.runAll();
    expect(n).toBe(5);
    expect(jobs.done).toBe(true);
    now(() => n++);
    expect(n).toBe(6);
  });
});
