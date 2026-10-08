import { describe, expect, it } from 'vitest';
import { generateLabAnimals } from '../src/animallab/labAnimals';
import type { Vec3 } from '../src/gen/animalForm';
import { growCreature, speciesDesign } from '../src/gen/creature';
import { MAX_RIG_LIMBS, creatureRig, rigVertices } from '../src/gen/creatureRig';
import { ANIMAL_LOD_COUNT, buildAnimalMesh } from '../src/surface/animalMesh';

const species = [1, 2, 3, 4, 5, 6].flatMap((seed) => generateLabAnimals(seed).species);

describe('game animals as editor creatures', () => {
  it('rigs every species: legs ranked, a hip on the spine, a neck ahead of the front legs', () => {
    for (const s of species) {
      const grown = growCreature(speciesDesign(s.form, s.length));
      const rig = creatureRig(grown);
      expect(rig.limbs.length).toBeGreaterThan(0);
      expect(rig.limbs.length).toBeLessThanOrEqual(MAX_RIG_LIMBS);
      expect(rig.legs).toBe(grown.limbs.filter((l) => !l.arm).length);
      for (const l of rig.limbs) {
        expect(l.s).toBeGreaterThanOrEqual(0);
        expect(l.s).toBeLessThanOrEqual(1);
        // The rest knee is where the IK puts it: each bone as long as the rig says.
        expect(Math.hypot(l.joint[0] - l.hip[0], l.joint[1] - l.hip[1], l.joint[2] - l.hip[2])).toBeCloseTo(l.upper, 3);
        expect(Math.hypot(l.foot[0] - l.joint[0], l.foot[1] - l.joint[1], l.foot[2] - l.joint[2])).toBeCloseTo(l.lower, 3);
      }
      expect(rig.neck.from).toBeGreaterThan(Math.max(...rig.limbs.filter((l) => !l.arm).map((l) => l.s)));
      expect(rig.neck.to).toBeGreaterThan(rig.neck.from);
    }
  });

  it('bends the head down to the ground to graze', () => {
    for (const s of species) {
      const grown = growCreature(speciesDesign(s.form, s.length));
      const { neck } = creatureRig(grown);
      const tip = grown.rest[grown.rest.length - 1]!;
      const y = tip.p[1] - tip.ry - neck.pivot[1];
      const z = tip.p[2] - neck.pivot[2];
      const low = neck.pivot[1] + Math.cos(neck.graze) * y - Math.sin(neck.graze) * z;
      if (neck.graze < (110 * Math.PI) / 180 - 1e-6) expect(low).toBeLessThan(grown.length * 0.05);
      expect(neck.graze).toBeGreaterThan(0);
    }
  });

  it("tags each vertex with its limb and bone, or its place along the spine", { timeout: 20000 }, () => {
    for (const s of species.slice(0, 8)) {
      const grown = growCreature(speciesDesign(s.form, s.length));
      const rig = creatureRig(grown);
      for (let lod = 0; lod < ANIMAL_LOD_COUNT; lod++) {
        const m = buildAnimalMesh(grown.skeleton, s.form, s.length, lod);
        const tags = rigVertices(rig, grown.rest, m.positions, (i) => {
          const part = m.rig[i * 4]!;
          return part > 0.5 && part < 2.5 ? ([m.pivots[i * 3]!, m.pivots[i * 3 + 1]!, m.pivots[i * 3 + 2]!] as Vec3) : null;
        });
        expect(tags.length).toBe((m.positions.length / 3) * 4);
        expect(tags.every(Number.isFinite)).toBe(true);
        // Checked in plain code and counted (an expect per vertex is too slow for tens of thousands).
        const used = new Set<number>();
        let bad = 0;
        let pawsUpper = 0;
        for (let i = 0; i < tags.length; i += 4) {
          const limb = tags[i]!;
          if (!Number.isInteger(limb) || limb > rig.limbs.length) bad++;
          if (limb > 0) used.add(limb);
          for (const k of [1, 2, 3]) if (tags[i + k]! < 0 || tags[i + k]! > 1) bad++;
          // The paw belongs to the lower bone.
          const v = i / 4;
          if (limb > 0 && m.positions[v * 3 + 1]! < rig.limbs[limb - 1]!.foot[1] * 0.5 && tags[i + 1]! <= 0.9) pawsUpper++;
        }
        expect(bad).toBe(0);
        expect(pawsUpper).toBe(0);
        // Every limb has its vertices.
        expect(used.size).toBe(rig.limbs.length);
      }
    }
  });
});
