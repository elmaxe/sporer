import { describe, expect, it } from 'vitest';
import { generateAnimalForm } from '../src/gen/animalForm';
import {
  anchorOf,
  decodeDesign,
  defaultCreature,
  encodeDesign,
  growCreature,
  insertVertebra,
  randomCreature,
  removeVertebra,
  skinPoint,
  speciesDesign,
  splatAt,
  splatPosition,
  tidySpine,
} from '../src/gen/creature';
import { dutyFactor, footPath, legPhase, solveTwoBone, type CreaturePose } from '../src/gen/creatureMotion';
import { Rng } from '../src/gen/rng';
import { buildAnimalMesh } from '../src/surface/animalMesh';
import { creatureForm } from '../src/gen/creature';

const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('creature gait', () => {
  it('gives four legs the lateral-sequence walk and the diagonal trot', () => {
    const walk = [legPhase(0, 2, false, 0), legPhase(1, 2, false, 0), legPhase(0, 2, true, 0), legPhase(1, 2, true, 0)];
    expect(walk).toEqual([0, 0.25, 0.5, 0.75]);
    // Trotting, each hind foot steps with the opposite fore foot.
    expect(legPhase(0, 2, false, 1)).toBeCloseTo(legPhase(1, 2, true, 1));
    expect(legPhase(1, 2, false, 1)).toBeCloseTo(legPhase(0, 2, true, 1));
  });

  it('gives six legs alternating tripods when trotting', () => {
    const a = [legPhase(0, 3, false, 1), legPhase(1, 3, true, 1), legPhase(2, 3, false, 1)];
    const b = [legPhase(0, 3, true, 1), legPhase(1, 3, false, 1), legPhase(2, 3, true, 1)];
    for (const p of a) expect(p).toBeCloseTo(a[0]!);
    for (const p of b) expect(p).toBeCloseTo((a[0]! + 0.5) % 1);
  });

  it('plants a foot for its duty factor, sliding back a whole step, then swings it forward', () => {
    const duty = dutyFactor(0);
    expect(duty).toBeGreaterThan(0.5);
    expect(dutyFactor(1)).toBeLessThan(0.5);
    expect(footPath(0, duty, 1, 0.2)).toEqual([0.5, 0]);
    const late = footPath(duty - 1e-6, duty, 1, 0.2);
    expect(late[0]).toBeCloseTo(-0.5, 4);
    expect(late[1]).toBe(0);
    expect(footPath((1 + duty) / 2, duty, 1, 0.2)[1]).toBeCloseTo(0.2);
    // Continuous round the cycle.
    expect(footPath(1 - 1e-6, duty, 1, 0.2)[0]).toBeCloseTo(0.5, 4);
  });

  it('solves two-bone IK keeping the bones their lengths', () => {
    const hip: [number, number, number] = [0.3, 1, 0];
    const target: [number, number, number] = [0.5, 0.1, 0.3];
    const { knee, end } = solveTwoBone(hip, target, 0.6, 0.6, [0, 0, 1]);
    expect(dist(hip, knee)).toBeCloseTo(0.6);
    expect(dist(knee, end)).toBeCloseTo(0.6);
    expect(dist(end, target)).toBeCloseTo(0, 5);
    // The knee bends towards the pole.
    expect(knee[2]).toBeGreaterThan((hip[2] + end[2]) / 2);
    // Out of reach: straight, pointing at it.
    const far = solveTwoBone(hip, [0, -5, 0], 0.6, 0.6, [0, 0, 1]);
    expect(dist(hip, far.end)).toBeCloseTo(1.2, 3);
  });
});

describe('creature design', () => {
  it('grows the default creature standing on its four feet', () => {
    const d = defaultCreature();
    const g = growCreature(d);
    expect(g.skeleton.legs.length).toBe(4);
    expect(g.skeleton.eyes.length).toBe(2);
    for (const leg of g.skeleton.legs) {
      const foot = leg.points[leg.points.length - 1]!;
      expect(foot[1]).toBeCloseTo(leg.radii[leg.radii.length - 1]!, 3);
    }
  });

  it('keeps the mesh topology the same in any pose, so the editor can update it in place', () => {
    const d = randomCreature(42);
    const form = creatureForm(d);
    const rest = buildAnimalMesh(growCreature(d).skeleton, form, 4, 0);
    const pose: CreaturePose = { time: 3.2, cycle: 1.37, run: 0.6, moving: 1 };
    const moving = buildAnimalMesh(growCreature(d, pose).skeleton, form, 4, 0);
    expect(moving.triangles).toBe(rest.triangles);
    expect(Array.from(moving.positions).every(Number.isFinite)).toBe(true);
  });

  it('finds the anchor of a point on the skin again', () => {
    const g = growCreature(defaultCreature());
    for (const [s, theta] of [
      [0.5, 0.3],
      [0.2, 2.0],
      [0.8, -1.2],
      [1.03, 0.6],
    ] as const) {
      const p = skinPoint(g.rest, s, theta).p;
      const a = anchorOf(g.rest, p);
      expect(dist(skinPoint(g.rest, a.s, a.theta).p, p)).toBeLessThan(0.05);
    }
  });

  it('keeps parts and paint in place when a vertebra is added or taken out', () => {
    const d = defaultCreature();
    const before = growCreature(d);
    const part = d.parts[0]!;
    const at = skinPoint(before.rest, part.s, part.theta).p;
    const splat = splatAt(before.rest, skinPoint(before.rest, 0.45, 0.4).p, 0.1, '#ff0000');
    d.splats.push(splat);
    const paint = splatPosition(before.rest, splat);
    insertVertebra(d, 3);
    const after = growCreature(d);
    expect(dist(skinPoint(after.rest, part.s, part.theta).p, at)).toBeLessThan(0.12);
    expect(dist(splatPosition(after.rest, d.splats[0]!), paint)).toBeLessThan(0.12);
    removeVertebra(d, 4);
    const back = growCreature(d);
    expect(dist(skinPoint(back.rest, part.s, part.theta).p, at)).toBeLessThan(0.12);
  });

  it("poses an arm by its three nodes: shoulder, elbow and hand, mirrored on the other side", () => {
    const d = defaultCreature();
    d.parts.push({ kind: 'arm', s: 0.7, theta: 1.6, size: 1, tilt: 0, spread: 0, mirror: true, joint: [0.3, -0.1, 0.25], end: [0.35, 0.4, 0.6] });
    const g = growCreature(d);
    const arms = g.skeleton.legs.filter((l) => l.arm);
    expect(arms.length).toBe(2);
    const left = arms.find((a) => a.points[0]![0] > 0)!;
    const right = arms.find((a) => a.points[0]![0] < 0)!;
    const [shoulder, elbow, hand] = left.points;
    expect(dist(elbow!, [shoulder![0] + 0.3, shoulder![1] - 0.1, shoulder![2] + 0.25])).toBeLessThan(1e-3);
    expect(dist(hand!, [shoulder![0] + 0.35, shoulder![1] + 0.4, shoulder![2] + 0.6])).toBeLessThan(1e-3);
    // The other arm's elbow sticks out the other way.
    expect(right.points[1]![0]).toBeLessThan(right.points[0]![0]);
  });

  it('poses a leg by its knee and foot, the foot kept on the ground, and walks it from there', () => {
    const d = defaultCreature();
    d.parts[0] = { ...d.parts[0]!, joint: [0.5, -0.3, 0.3], end: [0.9, 5, -0.4] };
    const g = growCreature(d);
    const left = g.skeleton.legs.find((l) => !l.arm && l.points[0]![0] > 0 && Math.abs(l.points[0]![2] - g.limbs[0]!.hip[2]) < 1e-6)!;
    const [hip, knee, foot] = left.points;
    expect(dist(knee!, [hip![0] + 0.5, hip![1] - 0.3, hip![2] + 0.3])).toBeLessThan(1e-3);
    // The foot's height is ignored: it stands on the ground, out and behind as placed.
    expect(foot![1]).toBeCloseTo(left.radii[2]!, 3);
    expect(foot![0] - hip![0]).toBeCloseTo(0.9, 3);
    expect(foot![2] - hip![2]).toBeCloseTo(-0.4, 3);
    const walking = growCreature(d, { time: 1, cycle: 0.3, run: 0, moving: 1 });
    expect(walking.skeleton.legs.flatMap((l) => l.points.flat()).every(Number.isFinite)).toBe(true);
  });

  it('grows a mouth on the snout whose mesh keeps its topology as it yawns', () => {
    const d = defaultCreature();
    const form = creatureForm(d);
    const rest = growCreature(d);
    expect(rest.skeleton.mouths?.length).toBe(1);
    const m = rest.skeleton.mouths![0]!;
    expect(m.width).toBeGreaterThan(0);
    for (const t of [0.5, 1.7, 4.1]) {
      const posed = growCreature(d, { time: t, cycle: t * 0.3, run: 0, moving: 1 });
      expect(buildAnimalMesh(posed.skeleton, form, 4, 0).triangles).toBe(buildAnimalMesh(rest.skeleton, form, 4, 0).triangles);
    }
    d.parts.find((p) => p.kind === 'mouth')!.teeth = false;
    expect(growCreature(d).skeleton.mouths![0]!.teeth).toBe(false);
  });

  it('lets the spine rise straight up and curl back over the body, its skin unpinched', () => {
    const d = defaultCreature();
    // The tail (the first vertebrae) climbs straight up from the hips, then reaches forward over the back.
    d.spine.splice(0, 3, { y: 3.6, z: 0.4, r: 0.1, w: 1 }, { y: 3.7, z: -0.4, r: 0.14, w: 1 }, { y: 3, z: -1.2, r: 0.2, w: 1 }, { y: 2, z: -1.25, r: 0.3, w: 1 });
    tidySpine(d.spine);
    // Kept as drawn: going backwards is allowed now.
    expect(d.spine[0]!.z).toBeCloseTo(0.4);
    const g = growCreature(d, { time: 1, cycle: 0.4, run: 0, moving: 1 });
    for (let i = 1; i < g.frames.length; i++) {
      const a = g.frames[i - 1]!;
      const b = g.frames[i]!;
      // The rings turn smoothly: no flipped side axis (the pinch where the spine pointed straight up).
      expect(a.side[0] * b.side[0] + a.side[1] * b.side[1] + a.side[2] * b.side[2]).toBeGreaterThan(0.9);
    }
    // Over the back, heading forward again from the tip, the tail's top faces down onto the body: it's upside down, as a curled tail is.
    expect(g.frames[0]!.up[1]).toBeLessThan(0);
    const mesh = buildAnimalMesh(g.skeleton, creatureForm(d), 4, 0);
    expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true);
    const p = skinPoint(g.rest, 0.05, 0.4).p;
    const back = anchorOf(g.rest, p);
    expect(dist(skinPoint(g.rest, back.s, back.theta).p, p)).toBeLessThan(0.05);
  });

  it('reads links that kept arm nodes as elbow and hand', () => {
    const d = defaultCreature();
    d.parts.push({ kind: 'arm', s: 0.7, theta: 1.6, size: 1, tilt: 0, spread: 0, mirror: true, elbow: [0.3, -0.1, 0.25], hand: [0.35, 0.4, 0.6] } as never);
    const back = decodeDesign(encodeDesign(d))!;
    expect(back.parts[back.parts.length - 1]!.joint).toEqual([0.3, -0.1, 0.25]);
  });

  it('grows random creatures without NaNs', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const d = randomCreature(seed);
      const g = growCreature(d, { time: seed, cycle: seed * 0.37, run: (seed % 5) / 4, moving: 1 });
      const nums = [...g.skeleton.spine.flatMap((n) => [...n.p, n.rx, n.ry]), ...g.skeleton.legs.flatMap((l) => l.points.flat()), ...g.skeleton.spikes.flatMap((s) => s.points.flat()), ...g.skeleton.eyes.flatMap((e) => e.centre)];
      expect(nums.every(Number.isFinite)).toBe(true);
    }
  });

  it('makes random creatures that stand tall as well as long and low', () => {
    let tall = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const sp = randomCreature(seed).spine;
      // Somewhere along it the spine climbs steeply (an upright torso, a tall neck, a centaur's front).
      const steep = sp.slice(1).some((v, i) => Math.atan2(v.y - sp[i]!.y, Math.abs(v.z - sp[i]!.z)) > (50 * Math.PI) / 180);
      if (steep) tall++;
    }
    expect(tall).toBeGreaterThan(12);
    expect(tall).toBeLessThan(50);
  });

  it("makes a game species' body: a random creature with its plan's legs, its size and its coat", () => {
    for (const plan of ['quadruped', 'hexapod', 'biped'] as const) {
      const form = generateAnimalForm(new Rng(5), plan, 120);
      const d = speciesDesign(form, 2.5);
      expect(d.paint.base).toBe(form.color);
      const g = growCreature(d);
      expect(g.length).toBeGreaterThan(2.5);
      expect(g.length).toBeLessThan(2.5 * 2.5);
      const legs = d.parts.filter((p) => p.kind === 'leg').length;
      expect(legs).toBe(plan === 'quadruped' ? 2 : plan === 'hexapod' ? 3 : 1);
      expect(growCreature(d).skeleton.legs.filter((l) => !l.arm).length).toBe(legs * 2);
    }
  });

  it('packs a design into text and back', () => {
    const d = randomCreature(9);
    const back = decodeDesign(encodeDesign(d));
    expect(back?.spine.length).toBe(d.spine.length);
    expect(back?.parts.length).toBe(d.parts.length);
    expect(back?.paint.base).toBe(d.paint.base);
    expect(decodeDesign('not a design')).toBeNull();
  });
});
