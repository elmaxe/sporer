import { describe, expect, it } from 'vitest';
import { decodeDesign, defaultCreature, encodeDesign, growCreature, isGear, randomCreature, skinPoint } from '../src/gen/creature';
import { gearFrame, helmetFit, suitRing, suitSpan, suitUp, undress, SUIT_PUFF } from '../src/gen/creatureOutfit';
import { buildAnimalMesh } from '../src/surface/animalMesh';
import { creatureForm } from '../src/gen/creature';

const dist = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('creature outfits', () => {
  it('fits the suit to the torso, not the head or the tail', () => {
    const d = defaultCreature();
    const { from, to } = suitSpan(d);
    // Blorbo's legs are at 0.3 and 0.53; its head is the last vertebra.
    expect(from).toBeLessThan(0.3);
    expect(to).toBeGreaterThan(0.53);
    expect(to).toBeLessThan(0.85);
    expect(from).toBeGreaterThan(0.05);
  });

  it("puffs the suit's rings just off the skin", () => {
    const g = growCreature(defaultCreature());
    const ring = suitRing(g.frames, 0.45, 16);
    const skin = Array.from({ length: 16 }, (_, i) => skinPoint(g.frames, 0.45, (i / 16) * Math.PI * 2).p);
    ring.forEach((p, i) => {
      const gap = dist(p, skin[i]!);
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(skinPoint(g.frames, 0.45, 0).r * (SUIT_PUFF - 1) * 3);
    });
  });

  it('puts the helmet round the whole head, snout and eyes included', () => {
    for (const seed of [1, 2, 3, 11, 23]) {
      const d = randomCreature(seed);
      const g = growCreature(d);
      const h = helmetFit(g.frames);
      const tip = skinPoint(g.frames, 1.06, 0).p;
      expect(dist(tip, h.centre)).toBeLessThan(h.radius);
      for (const e of g.skeleton.eyes.filter((_, i) => i < 2)) {
        // Eyes on the head (not ones placed far down the body).
        if (dist(e.centre, g.frames[g.frames.length - 1]!.p) < h.radius * 0.8) expect(dist(e.centre, h.centre) + e.radius).toBeLessThan(h.radius * 1.05);
      }
      expect(h.collarRadius).toBeLessThan(h.radius);
    }
  });

  it('builds gear in a right-handed frame standing out of the skin, lifted onto the suit', () => {
    const d = suitUp(defaultCreature());
    const g = growCreature(d);
    const jet = d.parts.find((p) => p.kind === 'jetpack')!;
    const f = gearFrame(g.frames, jet, false);
    const onSuit = gearFrame(g.frames, jet, false, true);
    expect(f.y[1]).toBeGreaterThan(0.8);
    const x = f.x;
    const yz = [f.y[1] * f.z[2] - f.y[2] * f.z[1], f.y[2] * f.z[0] - f.y[0] * f.z[2], f.y[0] * f.z[1] - f.y[1] * f.z[0]];
    expect(dist(x, yz)).toBeLessThan(1e-6);
    expect(onSuit.p[1]).toBeGreaterThan(f.p[1]);
  });

  it("suits up a creature with gear that doesn't change its body, and takes it all off again", () => {
    const d = defaultCreature();
    const dressed = suitUp(d);
    expect(dressed.outfit?.helmet).toBe(true);
    expect(dressed.parts.filter((p) => isGear(p.kind)).map((p) => p.kind).sort()).toEqual(['badge', 'jetpack', 'pad']);
    // Gear is drawn apart from the body: the body's mesh is the same.
    const a = buildAnimalMesh(growCreature(d).skeleton, creatureForm(d), 4, 0);
    const b = buildAnimalMesh(growCreature(dressed).skeleton, creatureForm(dressed), 4, 0);
    expect(b.positions.length).toBe(a.positions.length);
    expect(undress(dressed)).toEqual(d);
    const back = decodeDesign(encodeDesign(dressed))!;
    expect(back.outfit?.suit).toBe(true);
    expect(back.parts.length).toBe(dressed.parts.length);
  });
});
