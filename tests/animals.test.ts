import { describe, expect, it } from 'vitest';
import { cloneAnimal, decodeAnimalLab, encodeAnimalLab, generateLabAnimals, rerollAnimal, sanitizeAnimal, withBodyPlan, DEFAULT_ANIMAL_VIEW } from '../src/animallab/labAnimals';
import { legGirthFor, type AnimalSkeleton } from '../src/gen/animalForm';
import { speciesBody } from '../src/gen/speciesBody';
import {
  CARNIVORES_PER_TIER,
  EARTH_G,
  HERBIVORES_PER_TIER,
  HOME_RANGE,
  HerdPath,
  STRIDE_COEFFICIENT,
  STRIDE_EXPONENT,
  WALK_FROUDE,
  animalGait,
  animalMass,
  generateHerd,
  habitable,
  herdGridSize,
  hipHeightOf,
  planAnimals,
  tangentBasis,
  type AnimalPlan,
  type AnimalPose,
  type HerdData,
} from '../src/gen/animals';
import { generateGalaxy, systemRef } from '../src/gen/galaxy';
import { terrainNoise } from '../src/gen/noise';
import type { GroundRadius } from '../src/gen/plants';
import { generateSystem } from '../src/gen/system';
import { labFromSystem, toPlanetConfig } from '../src/lab/labPlanet';
import { ANIMAL_LOD_COUNT, RIG, buildAnimalMesh } from '../src/surface/animalMesh';
import { animalSetup } from '../src/surface/animalSetup';

const RADIUS = 400;
const PEAK = RADIUS * 1.08;
/** A synthetic planet: about half land, relief up to 8% of the radius. */
const ground: GroundRadius = (d) => {
  const n = terrainNoise(d.x, d.y, d.z, 7);
  return n < -0.05 ? RADIUS * 0.96 : RADIUS * (1 + 0.08 * ((n + 0.05) / 1.05));
};

function plan(tier: 0 | 1 | 2 | 3 = 3, seed = 42, gravity = 1): AnimalPlan {
  const p = planAnimals({ seed, tier, temperature: 288, gravity, radius: RADIUS, peak: PEAK, sea: true });
  if (!p) throw new Error('no animals');
  return p;
}

function allSpecies(seeds = 40) {
  return Array.from({ length: seeds }, (_, i) => plan(3, i + 1).species).flat();
}

describe('animal species', () => {
  it('has none at tier 0 and a longer food chain the higher the tier', () => {
    expect(planAnimals({ seed: 1, tier: 0, temperature: 288, gravity: 1, radius: RADIUS, peak: PEAK, sea: true })).toBeNull();
    for (const tier of [1, 2, 3] as const) {
      const p = plan(tier);
      expect(p.species.filter((s) => s.diet === 'herbivore')).toHaveLength(HERBIVORES_PER_TIER[tier]!);
      expect(p.species.filter((s) => s.diet === 'carnivore')).toHaveLength(CARNIVORES_PER_TIER[tier]!);
      p.species.forEach((s, i) => expect(s.index).toBe(i));
    }
  });

  it('is the same for the same seed, and different for another', () => {
    expect(JSON.stringify(plan(3, 9))).toBe(JSON.stringify(plan(3, 9)));
    expect(JSON.stringify(plan(3, 9).species)).not.toBe(JSON.stringify(plan(3, 10).species));
  });

  it('lives on the game worlds where plants grow: the home system has some', () => {
    const galaxy = generateGalaxy(1337);
    const ref = systemRef(galaxy, 6)!;
    const config = toPlanetConfig(labFromSystem(generateSystem(ref), 0)!);
    const setup = animalSetup(config);
    expect(setup).not.toBeNull();
    expect(setup!.plan.species.length).toBeGreaterThan(0);
    expect(setup!.plan.gravity).toBeCloseTo(config.climate!.gravity, 6);
    // A barren world (tier 0) has none.
    const barren = { ...config, climate: { ...config.climate!, habitability: 0 as const } };
    expect(animalSetup(barren)).toBeNull();
  });

  it('gives hunters teeth and no horns', () => {
    const hunters = allSpecies(20).filter((s) => s.diet === 'carnivore');
    expect(hunters.length).toBeGreaterThan(0);
    for (const s of hunters) {
      const parts = speciesBody(s).design.parts;
      expect(parts.some((p) => p.kind === 'horn')).toBe(false);
      expect(parts.filter((p) => p.kind === 'mouth').every((p) => p.teeth !== false)).toBe(true);
    }
  });

  it('thickens legs with size and gravity (elastic similarity, d ∝ √(g·l) of the length)', () => {
    expect(legGirthFor(2, 1)).toBeCloseTo(1, 6);
    expect(legGirthFor(4, 1)).toBeCloseTo(Math.SQRT2, 6);
    expect(legGirthFor(1, 4)).toBeCloseTo(Math.SQRT2, 6);
    expect(legGirthFor(100, 1)).toBeLessThanOrEqual(1.6);
    expect(legGirthFor(0.2, 0.1)).toBeGreaterThanOrEqual(0.7);
  });
});

describe('animal bodies', () => {
  const species = allSpecies(30);

  it('stands on its feet: every walking leg reaches the ground, the body above it', () => {
    for (const s of species) {
      const k = speciesBody(s).grown.skeleton;
      // A paw's centre is its radius up: it rests on the ground.
      for (const leg of k.legs.filter((l) => !l.arm)) expect(leg.points[leg.points.length - 1]![1] - leg.radii[leg.radii.length - 1]!).toBeCloseTo(0, 6);
      expect(Math.min(...k.spine.map((n) => n.p[1] - n.ry))).toBeGreaterThan(0);
      expect(k.top).toBeGreaterThan(k.hipHeight);
      expect(speciesBody(s).grown.length).toBeGreaterThan(s.length);
    }
  });

  it('has the legs of its body plan', () => {
    for (const s of species) {
      const legs = speciesBody(s).grown.skeleton.legs.filter((l) => !l.arm);
      expect(legs).toHaveLength({ quadruped: 4, hexapod: 6, biped: 2 }[s.form.plan]);
    }
  });

  it('builds cheaper meshes further out, all finite, with smooth unit normals and valid rigs', { timeout: 30000 }, () => {
    for (const s of species.slice(0, 24)) {
      const k = speciesBody(s).grown.skeleton;
      const meshes = Array.from({ length: ANIMAL_LOD_COUNT }, (_, lod) => buildAnimalMesh(k, s.form, s.length, lod));
      for (let lod = 1; lod < ANIMAL_LOD_COUNT; lod++) expect(meshes[lod]!.triangles).toBeLessThan(meshes[lod - 1]!.triangles);
      expect(meshes[0]!.triangles).toBeLessThan(6000);
      expect(meshes[ANIMAL_LOD_COUNT - 1]!.triangles).toBeLessThan(400);
      for (const m of meshes) {
        expect(m.positions.length).toBe(m.triangles * 9);
        expect(m.rig.length).toBe(m.triangles * 12);
        expect(m.normals.length).toBe(m.triangles * 9);
        expect(m.coat.length).toBe(m.triangles * 3);
        for (let i = 0; i < m.normals.length; i += 3) expect(Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!)).toBeCloseTo(1, 4);
        // Each triangle faces the way its vertices' normals do (so it isn't culled from outside).
        let facing = 0;
        for (let t = 0; t < m.triangles; t++) {
          const P = m.positions;
          const N = m.normals;
          const i = t * 9;
          const u = [P[i + 3]! - P[i]!, P[i + 4]! - P[i + 1]!, P[i + 5]! - P[i + 2]!];
          const v = [P[i + 6]! - P[i]!, P[i + 7]! - P[i + 1]!, P[i + 8]! - P[i + 2]!];
          const f = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
          const n = [N[i]! + N[i + 3]! + N[i + 6]!, N[i + 1]! + N[i + 4]! + N[i + 7]!, N[i + 2]! + N[i + 5]! + N[i + 8]!];
          if (f[0]! * n[0]! + f[1]! * n[1]! + f[2]! * n[2]! >= 0) facing++;
        }
        expect(facing).toBe(m.triangles);
        expect(m.positions.every(Number.isFinite)).toBe(true);
        let low = Infinity;
        for (let i = 1; i < m.positions.length; i += 3) low = Math.min(low, m.positions[i]!);
        expect(low).toBeGreaterThan(-s.length * 0.05);
        for (let i = 0; i < m.rig.length; i += 4) {
          expect(Object.values(RIG)).toContain(m.rig[i]);
          expect(m.rig[i + 3]).toBeGreaterThanOrEqual(0);
          expect(m.rig[i + 3]).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('gaits (dynamic similarity)', () => {
  const skeleton = { hipHeight: 0.89 } as AnimalSkeleton;

  it('walks at the Froude number people stroll at and strides 2.3·Fr^0.3 hip heights', () => {
    const g = animalGait(skeleton, 1);
    expect(g.walkSpeed ** 2 / (EARTH_G * 0.89)).toBeCloseTo(WALK_FROUDE, 6);
    // Legs of 0.89 m walk at about people's preferred 1.4 m/s (1.10–1.65).
    expect(g.walkSpeed).toBeGreaterThan(1.1);
    expect(g.walkSpeed).toBeLessThan(1.65);
    expect(g.walkStride / 0.89).toBeCloseTo(STRIDE_COEFFICIENT * WALK_FROUDE ** STRIDE_EXPONENT, 6);
    // Alexander's trackway formula, v = 0.25·g^½·λ^1.67·h^−1.17, gives the speed back from the stride (within its rounding).
    const v = 0.25 * Math.sqrt(EARTH_G) * g.trotStride ** 1.67 * 0.89 ** -1.17;
    expect(v / g.trotSpeed).toBeGreaterThan(0.95);
    expect(v / g.trotSpeed).toBeLessThan(1.05);
  });

  it('walks slower on a lighter world and faster on bigger legs', () => {
    expect(animalGait(skeleton, 0.38).walkSpeed).toBeLessThan(animalGait(skeleton, 1).walkSpeed);
    expect(animalGait({ hipHeight: 2 } as AnimalSkeleton, 1).walkSpeed).toBeGreaterThan(animalGait(skeleton, 1).walkSpeed);
    // The stride, in hip heights, is the same at any size.
    const a = animalGait({ hipHeight: 0.3 } as AnimalSkeleton, 1);
    const b = animalGait({ hipHeight: 3 } as AnimalSkeleton, 1);
    expect(a.walkStride / 0.3).toBeCloseTo(b.walkStride / 3, 6);
  });

  it('weighs what mammals with those legs weigh (hind limb 0.163·M^0.36 m)', () => {
    expect(animalMass(0.163)).toBeCloseTo(1, 6);
    expect(animalMass(0.86)).toBeGreaterThan(95);
    expect(animalMass(0.86)).toBeLessThan(105);
  });
});

describe('herds', () => {
  const p = plan(3, 77);
  const n = herdGridSize(RADIUS);
  const herds: HerdData[] = [];
  for (let face = 0; face < 6; face++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const h = generateHerd(p, ground, face, i, j);
    if (h) herds.push(h);
  }

  it('live on habitable ground, the same on every visit', () => {
    expect(herds.length).toBeGreaterThan(20);
    for (const h of herds.slice(0, 20)) {
      expect(habitable(p, ground, h.home)).toBe(true);
      const [face, i, j] = h.id.split(':').map(Number) as [number, number, number];
      expect(generateHerd(p, ground, face, i, j)).toEqual(h);
    }
  });

  it('are commoner for smaller grazers (Damuth) and rare for hunters (Carbone & Gittleman)', () => {
    const count = (k: number) => herds.filter((h) => h.species === k).length;
    const grazers = p.species.filter((s) => s.diet === 'herbivore').sort((a, b) => hipHeightOf(a) - hipHeightOf(b));
    expect(count(grazers[0]!.index)).toBeGreaterThan(count(grazers[grazers.length - 1]!.index));
    const hunters = p.species.filter((s) => s.diet === 'carnivore').reduce((t, s) => t + count(s.index), 0);
    expect(hunters).toBeLessThan(herds.length * 0.3);
  });

  it('walk smoothly through time as a pure function of the clock, staying near home', () => {
    const pose: AnimalPose = { x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 0, cycle: 0, stride: 0, trot: 0, graze: 0, idle: 0 };
    for (const h of herds.slice(0, 6)) {
      const s = p.species[h.species]!;
      const path = new HerdPath(p, ground, h, speciesBody(s).grown.skeleton);
      const spread = 1.7 * s.length * Math.sqrt(h.count + 1.3) * 1.15;
      let prev: [number, number, number] | null = null;
      let walked = 0;
      let grazed = 0;
      const dt = 0.5;
      const fast = Math.max(path.gait.trotSpeed, path.gait.walkSpeed) * 1.6;
      for (let t = 0; t < 400; t += dt) {
        path.pose(h.count - 1, t, pose);
        expect(Math.hypot(pose.x, pose.y, pose.z)).toBeCloseTo(1, 9);
        expect(Math.hypot(pose.hx, pose.hy, pose.hz)).toBeCloseTo(1, 9);
        expect(Math.abs(pose.hx * pose.x + pose.hy * pose.y + pose.hz * pose.z)).toBeLessThan(1e-9);
        const at: [number, number, number] = [pose.x * RADIUS, pose.y * RADIUS, pose.z * RADIUS];
        const fromHome = Math.hypot(at[0] - h.home.x * RADIUS, at[1] - h.home.y * RADIUS, at[2] - h.home.z * RADIUS);
        expect(fromHome).toBeLessThan(h.range + spread);
        if (prev) expect(Math.hypot(at[0] - prev[0], at[1] - prev[1], at[2] - prev[2])).toBeLessThan(fast * dt + 1e-6);
        prev = at;
        if (pose.stride > 0.05) walked++;
        if (pose.graze > 0.5) grazed++;
      }
      // They spend time walking, and grazers time grazing.
      expect(walked).toBeGreaterThan(0);
      if (s.diet === 'herbivore') expect(grazed).toBeGreaterThan(0);
      // Pure: asking again, out of order, gives the same pose.
      const a = { ...path.pose(0, 123.4, pose) };
      path.pose(0, 9999, pose);
      expect({ ...path.pose(0, 123.4, pose) }).toEqual(a);
      expect(h.range).toBeLessThanOrEqual(HOME_RANGE * 1.8);
    }
  });

  it('start from where one set down landed, facing as it landed, and walk on from there (issue #166)', () => {
    const pose: AnimalPose = { x: 0, y: 0, z: 0, hx: 0, hy: 0, hz: 0, cycle: 0, stride: 0, trot: 0, graze: 0, idle: 0 };
    const e1 = { x: 0, y: 0, z: 0 };
    const e2 = { x: 0, y: 0, z: 0 };
    let roamed = 0;
    // Set down on the homes of wild herds and on steep ground beside them, at odd moments, as SurfaceAnimals.release makes them.
    for (const [i, h] of herds.slice(0, 40).entries()) {
      const species = p.species[h.species]!;
      tangentBasis(h.home, e1, e2);
      const off = i % 2 === 0 ? 0 : 6 / RADIUS;
      const x = h.home.x + e1.x * off;
      const y = h.home.y + e1.y * off;
      const z = h.home.z + e1.z * off;
      const l = Math.hypot(x, y, z);
      const home = { x: x / l, y: y / l, z: z / l };
      const seed = (h.seed * 31 + i) & 0x7fffffff;
      const landed = 1000 + i * 37.3;
      const facing = (i * 0.7) % (Math.PI * 2);
      const released: HerdData = { id: `released:${i}`, species: h.species, count: 1, home, range: 0.5 * HOME_RANGE, slot: 30 + (seed % 40), offset: seed % 1000, seed, landed, facing };
      const path = new HerdPath({ ...p, species: [species] }, ground, { ...released, species: 0 }, speciesBody(species).grown.skeleton);
      path.pose(0, landed, pose);
      // Right where it landed, facing the way it did, standing still.
      expect(Math.hypot(pose.x - home.x, pose.y - home.y, pose.z - home.z) * RADIUS).toBeLessThan(1e-6);
      tangentBasis(home, e1, e2);
      expect(pose.hx).toBeCloseTo(e1.x * Math.cos(facing) + e2.x * Math.sin(facing), 6);
      expect(pose.hy).toBeCloseTo(e1.y * Math.cos(facing) + e2.y * Math.sin(facing), 6);
      expect(pose.hz).toBeCloseTo(e1.z * Math.cos(facing) + e2.z * Math.sin(facing), 6);
      expect(pose.stride).toBe(0);
      expect(pose.graze).toBe(0);
      // Then on without a jump, roaming its range.
      const dt = 0.25;
      const fast = Math.max(path.gait.trotSpeed, path.gait.walkSpeed) * 1.6;
      let prev = [pose.x * RADIUS, pose.y * RADIUS, pose.z * RADIUS];
      let far = 0;
      for (let t = landed + dt; t < landed + 200; t += dt) {
        path.pose(0, t, pose);
        const at = [pose.x * RADIUS, pose.y * RADIUS, pose.z * RADIUS];
        expect(Math.hypot(at[0]! - prev[0]!, at[1]! - prev[1]!, at[2]! - prev[2]!)).toBeLessThan(fast * dt + 1e-6);
        far = Math.max(far, Math.hypot(pose.x - home.x, pose.y - home.y, pose.z - home.z) * RADIUS);
        prev = at;
      }
      expect(far).toBeLessThan(0.5 * HOME_RANGE + 1e-6);
      if (far > 1) roamed++;
    }
    expect(roamed).toBeGreaterThan(30);
  });
});

describe('animal lab model', () => {
  it('round-trips a set through its link', () => {
    const made = generateLabAnimals(5, { tier: 2 });
    const state = { ...made, view: { ...DEFAULT_ANIMAL_VIEW, view: 'herds' as const, pace: 'trot' as const } };
    const back = decodeAnimalLab(encodeAnimalLab(state))!;
    expect(back).toEqual(state);
    expect(decodeAnimalLab('not a link')).toBeNull();
  });

  it('keeps edits within the panel ranges', () => {
    const base = generateLabAnimals(5).species[0]!;
    const s = sanitizeAnimal({ ...base, length: 99, form: { ...base.form, legGirth: -3, color: 'red' } }, base, 0);
    expect(s.length).toBe(12);
    expect(s.form.legGirth).toBe(0.5);
    expect(s.form.color).toBe(base.form.color);
  });

  it('rebuilds a species with another body plan or new proportions, keeping its coat', () => {
    const s = cloneAnimal(generateLabAnimals(5).species[0]!);
    const biped = withBodyPlan(s, 'biped');
    expect(biped.form.plan).toBe('biped');
    expect(biped.form.color).toBe(s.form.color);
    const rolled = rerollAnimal(s, 1);
    expect(rolled.form.plan).toBe(s.form.plan);
    expect(rolled.form.seed).not.toBe(s.form.seed);
    expect(generateLabAnimals(5, { tier: 1, diet: 'carnivore' }).species.some((x) => x.diet === 'carnivore')).toBe(true);
  });
});
