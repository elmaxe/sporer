import { describe, expect, it } from 'vitest';
import { arriveImpulse, detourWaypoint, standoffPoint, type ArriveParams } from '../src/player/autopilot';
import type { Vec3Like } from '../src/gen/orbit';

const DT = 1 / 60;
const params: ArriveParams = { maxSpeed: 150, accel: 250, gain: 8, damping: 1.2 };
const v3 = (x = 0, y = 0, z = 0): Vec3Like => ({ x, y, z });
const dist = (a: Vec3Like, b: Vec3Like) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Integrates like Rapier: impulse on a mass-1 body, then damping, then position. */
function simulate(target: (t: number) => Vec3Like, targetVel: Vec3Like, seconds: number) {
  const pos = v3();
  const vel = v3();
  const impulse = v3();
  let maxSpeed = 0;
  for (let i = 0; i < seconds / DT; i++) {
    arriveImpulse(pos, vel, target(i * DT), targetVel, params, DT, impulse);
    for (const k of ['x', 'y', 'z'] as const) {
      vel[k] = (vel[k] + impulse[k]) / (1 + params.damping * DT);
      pos[k] += vel[k] * DT;
    }
    maxSpeed = Math.max(maxSpeed, Math.hypot(vel.x, vel.y, vel.z));
  }
  return { pos, vel, maxSpeed };
}

describe('arriveImpulse', () => {
  it('cruises at max speed and stops at a distant point without overshooting', () => {
    const goal = v3(1000, 0, -500);
    const { pos, vel, maxSpeed } = simulate(() => goal, v3(), 15);
    // Project the final position onto the travel direction.
    const overshoot = (pos.x * goal.x + pos.z * goal.z) / Math.hypot(goal.x, goal.z) - Math.hypot(goal.x, goal.z);
    expect(maxSpeed).toBeGreaterThan(params.maxSpeed * 0.95);
    expect(maxSpeed).toBeLessThan(params.maxSpeed * 1.05);
    expect(dist(pos, goal)).toBeLessThan(0.5);
    expect(Math.hypot(vel.x, vel.y, vel.z)).toBeLessThan(0.5);
    expect(overshoot).toBeLessThan(0.5);
  });

  it('brakes firmly and settles quickly instead of creeping in', () => {
    // 300 units: ~2 s at cruise, ~0.6 s to brake from 150 at accel / 2, plus a short settle.
    const goal = v3(300, 0, 0);
    const { pos, vel } = simulate(() => goal, v3(), 3.2);
    expect(dist(pos, goal)).toBeLessThan(0.5);
    expect(Math.hypot(vel.x, vel.y, vel.z)).toBeLessThan(1);
  });

  it('never exceeds the acceleration limit', () => {
    const out = arriveImpulse(v3(), v3(0, 0, 100), v3(500, 0, 0), v3(), params, DT, v3());
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(params.accel * DT);
  });

  it('matches the velocity of a moving target once it catches up', () => {
    const velocity = v3(8, 0, 3);
    const moving = (t: number) => v3(200 + velocity.x * t, 0, velocity.z * t);
    const { pos, vel } = simulate(moving, velocity, 20);
    expect(dist(pos, moving(20 - DT))).toBeLessThan(1);
    expect(dist(vel, velocity)).toBeLessThan(0.5);
  });
});

describe('standoffPoint', () => {
  it('parks on the side the ship approaches from', () => {
    const p = standoffPoint(v3(100, 0, 0), v3(10, 0, 0), 20, v3());
    expect(p).toEqual({ x: 30, y: 0, z: 0 });
  });

  it('handles a ship exactly at the body centre', () => {
    const p = standoffPoint(v3(5, 5, 5), v3(5, 5, 5), 10, v3());
    expect(dist(p, v3(5, 5, 5))).toBeCloseTo(10);
  });
});

describe('detourWaypoint', () => {
  const sun = { position: v3(0, 0, 0), radius: 30 };

  it('leaves a clear path alone', () => {
    expect(detourWaypoint(v3(-200, 0, 100), v3(200, 0, 100), [sun], 8, v3())).toBe(false);
  });

  it('puts a waypoint beside an obstacle in the way', () => {
    const out = v3();
    expect(detourWaypoint(v3(-200, 0, 5), v3(200, 0, 5), [sun], 8, out)).toBe(true);
    expect(dist(out, sun.position)).toBeGreaterThan(38);
    expect(out.z).toBeGreaterThan(0); // on the side the path already leans towards
  });

  it('sidesteps a dead-centre hit', () => {
    const out = v3();
    expect(detourWaypoint(v3(-200, 0, 0), v3(200, 0, 0), [sun], 8, out)).toBe(true);
    expect(dist(out, sun.position)).toBeGreaterThan(38);
  });

  it('ignores obstacles around the destination or the ship', () => {
    expect(detourWaypoint(v3(-200, 0, 0), v3(20, 0, 20), [sun], 8, v3())).toBe(false);
    expect(detourWaypoint(v3(20, 0, 20), v3(-200, 0, 0), [sun], 8, v3())).toBe(false);
  });

  it('flies around the obstacle without touching it', () => {
    const pos = v3(-300, 0, 0);
    const vel = v3();
    const goal = v3(300, 0, 10);
    const aim = v3();
    const impulse = v3();
    let closest = Infinity;
    for (let i = 0; i < 20 / DT; i++) {
      const detour = detourWaypoint(pos, goal, [sun], 8, aim);
      const remaining = detour ? dist(pos, aim) + dist(aim, goal) : undefined;
      arriveImpulse(pos, vel, detour ? aim : goal, v3(), params, DT, impulse, remaining);
      for (const k of ['x', 'y', 'z'] as const) {
        vel[k] = (vel[k] + impulse[k]) / (1 + params.damping * DT);
        pos[k] += vel[k] * DT;
      }
      closest = Math.min(closest, dist(pos, sun.position));
    }
    expect(closest).toBeGreaterThan(sun.radius + 2); // the ship's own radius is 2
    expect(dist(pos, goal)).toBeLessThan(1);
  });
});
