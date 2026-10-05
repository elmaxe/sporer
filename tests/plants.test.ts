import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Debug } from '../src/core/Debug';
import { generateGalaxy } from '../src/gen/galaxy';
import {
  COVER_PER_TIER,
  LATITUDE_SWING,
  MIN_ELEVATION,
  PLANT_CELL_SIZE,
  PLANT_KINDS,
  SPECIES_PER_TIER,
  generateCell,
  localTemperature,
  parsePlantId,
  plantGridSize,
  planPlants,
  type GroundRadius,
  type PlantData,
  type PlantPlan,
} from '../src/gen/plants';
import { terrainNoise } from '../src/gen/noise';
import { generateSystem } from '../src/gen/system';
import { SurfaceChangeStore, SurfaceChanges } from '../src/surface/changes';
import { createPlantGeometry } from '../src/surface/plantLook';
import { plantParams } from '../src/surface/plantParams';
import { plantSetup } from '../src/surface/plantSetup';
import { SurfaceEntities } from '../src/surface/SurfaceEntities';
import { Plantings } from '../src/surface/Plantings';
import { HULL_DEPTH, HULL_RADIUS } from '../src/planet/ground';
import { PlantBrush, leafParams } from '../src/surface/PlantBrush';
import type { Puff } from '../src/cargo/CargoFx';
import { PlantShaker, SHAKE_SLOTS, plantShakeParams, plantShakeUniforms } from '../src/surface/plantShake';
import { parseGraphicsSettings } from '../src/ui/GraphicsSettings';

const RADIUS = 400;
const PEAK = RADIUS * 1.08;
/** A synthetic planet: about half land, relief up to 8% of the radius. */
const ground: GroundRadius = (d) => {
  const n = terrainNoise(d.x, d.y, d.z, 7);
  return n < -0.05 ? RADIUS * 0.96 : RADIUS * (1 + 0.08 * ((n + 0.05) / 1.05));
};

function plan(tier: 0 | 1 | 2 | 3, temperature = 288, water = 0.7, seed = 42): PlantPlan {
  const p = planPlants({ seed, tier, temperature, water, radius: RADIUS, peak: PEAK });
  if (!p) throw new Error('no plants');
  return p;
}

/** The plants of every `step`th cell of the planet. */
function sample(p: PlantPlan, g: GroundRadius = ground, step = 3): PlantData[] {
  const n = plantGridSize(p.radius);
  const out: PlantData[] = [];
  for (let face = 0; face < 6; face++) for (let i = 0; i < n; i += step) for (let j = 0; j < n; j += step) out.push(...generateCell(p, g, face, i, j));
  return out;
}

describe('plant plans', () => {
  it('has no plants on hostile (T0) bodies', () => {
    expect(planPlants({ seed: 1, tier: 0, temperature: 288, water: 0.5, radius: RADIUS, peak: PEAK })).toBeNull();
  });

  it('has more species the higher the tier, of all three kinds', () => {
    const counts = ([1, 2, 3] as const).map((t) => plan(t).species.length);
    expect(counts).toEqual([SPECIES_PER_TIER[1], SPECIES_PER_TIER[2], SPECIES_PER_TIER[3]]);
    expect(counts[0]).toBeLessThan(counts[1]!);
    expect(counts[1]).toBeLessThan(counts[2]!);
    for (const t of [1, 2, 3] as const) expect(new Set(plan(t).species.map((s) => s.kind))).toEqual(new Set(['tree', 'largeBush', 'smallBush']));
  });

  it('is deterministic, and differs between planets', () => {
    expect(plan(3)).toEqual(plan(3));
    expect(plan(3, 288, 0.7, 43).species[0]!.leafColor).not.toBe(plan(3).species[0]!.leafColor);
  });

  it('keeps each species inside its kind\'s size range', () => {
    for (const s of plan(3).species) {
      const info = PLANT_KINDS[s.kind];
      expect(s.height).toBeGreaterThanOrEqual(info.height[0]);
      expect(s.height).toBeLessThanOrEqual(info.height[1]);
      expect(s.crownRadius).toBeGreaterThan(0);
    }
  });

  it('covers more ground the higher the tier', () => {
    expect(COVER_PER_TIER[0]).toBe(0);
    expect(COVER_PER_TIER[1]!).toBeLessThan(COVER_PER_TIER[2]!);
    expect(COVER_PER_TIER[2]!).toBeLessThan(COVER_PER_TIER[3]!);
  });
});

describe('latitude and temperature', () => {
  // docs/research/plants.md: Earth's mean 15 °C (288 K, NASA), 27 °C at the equator, below 0 °C from about 60°.
  const EARTH = 288;
  it('reproduces Earth\'s equator and mid-latitudes', () => {
    expect(localTemperature(EARTH, 0) - 273.15).toBeGreaterThan(25);
    expect(localTemperature(EARTH, 0) - 273.15).toBeLessThan(29);
    expect(Math.abs(localTemperature(EARTH, (60 * Math.PI) / 180) - 273.15)).toBeLessThan(2);
  });

  it('averages to the body\'s mean over the sphere', () => {
    let sum = 0;
    let weight = 0;
    for (let lat = -Math.PI / 2; lat <= Math.PI / 2; lat += 0.001) {
      sum += localTemperature(EARTH, lat) * Math.cos(lat);
      weight += Math.cos(lat);
    }
    expect(sum / weight).toBeCloseTo(EARTH, 1);
    expect(LATITUDE_SWING).toBeGreaterThan(0);
  });

  it('keeps plants off the frozen poles of a cold world, but not its tropics', () => {
    const cold = plan(1, 255);
    const plants = sample(cold, ground, 1);
    expect(plants.length).toBeGreaterThan(50);
    for (const p of plants) expect(Math.abs(p.y)).toBeLessThan(Math.sin((75 * Math.PI) / 180));
    expect(plants.some((p) => Math.abs(p.y) < 0.5)).toBe(true);
  });
});

describe('plant cells', () => {
  const p3 = plan(3);

  it('are the same on every visit and independent of other cells', () => {
    const land = (i: number) => generateCell(p3, () => RADIUS * 1.02, 2, i, 6);
    const a = land(5);
    // Generate a pile of other cells in between: nothing carries over.
    for (let i = 0; i < 8; i++) generateCell(p3, ground, 2, i, i);
    expect(land(5)).toEqual(a);
    expect(a.length).toBeGreaterThan(0);
    expect(generateCell(p3, ground, 2, 5, 6)).toEqual(generateCell(p3, ground, 2, 5, 6));
  });

  it('give every plant a stable, unique id that names its cell', () => {
    const plants = sample(p3, ground, 2);
    const ids = new Set(plants.map((p) => p.id));
    expect(ids.size).toBe(plants.length);
    const p = generateCell(p3, ground, 4, 3, 9)[0]!;
    expect(parsePlantId(p.id)).toMatchObject({ face: 4, i: 3, j: 9 });
    expect(parsePlantId('nonsense')).toBeNull();
    expect(parsePlantId('7:1:1:1')).toBeNull();
  });

  it('stand on the ground, above the beach and never under the sea', () => {
    const relief = PEAK - RADIUS;
    for (const p of sample(p3)) {
      expect(p.radius).toBeCloseTo(ground(p), 6);
      expect(p.radius - RADIUS).toBeGreaterThanOrEqual(MIN_ELEVATION * relief);
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 6);
    }
  });

  it('stay below each species\' tree line', () => {
    const relief = PEAK - RADIUS;
    for (const p of sample(p3, ground, 1)) {
      const kind = p3.species[p.species]!.kind;
      expect((p.radius - RADIUS) / relief).toBeLessThanOrEqual(PLANT_KINDS[kind].maxElevation + 1e-9);
    }
  });

  it('stay inside their cell', () => {
    const n = plantGridSize(RADIUS);
    // A plant of cell (i, j) lies within a cell's diagonal of the cell's centre.
    const face = 0;
    const i = 4;
    const j = 4;
    const centre = generateCell(plan(3), () => RADIUS * 1.02, face, i, j);
    expect(centre.length).toBeGreaterThan(5);
    const c = { x: 0, y: 0, z: 0 };
    // The cell's centre direction, from its plants' mean.
    for (const q of centre) {
      c.x += q.x / centre.length;
      c.y += q.y / centre.length;
      c.z += q.z / centre.length;
    }
    const len = Math.hypot(c.x, c.y, c.z);
    for (const q of centre) expect(RADIUS * Math.acos(Math.min(1, (q.x * c.x + q.y * c.y + q.z * c.z) / len))).toBeLessThan(PLANT_CELL_SIZE * 1.2);
    expect(n).toBeGreaterThan(10);
  });

  it('have more plants the higher the tier, and none of T0', () => {
    const counts = ([1, 2, 3] as const).map((t) => sample(plan(t), ground, 2).length);
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[0]!).toBeLessThan(counts[1]!);
    expect(counts[1]!).toBeLessThan(counts[2]!);
  });

  it('use more of the species on higher tiers', () => {
    const used = (t: 1 | 2 | 3) => new Set(sample(plan(t), ground, 1).map((q) => q.species)).size;
    expect(used(1)).toBeLessThanOrEqual(SPECIES_PER_TIER[1]!);
    expect(used(3)).toBeGreaterThan(used(1));
  });

  it('leave a dry world with fewer plants than a wet one', () => {
    expect(sample(plan(3, 288, 0), ground, 2).length).toBeLessThan(sample(plan(3, 288, 1), ground, 2).length);
  });

  it('grow on real planets: T1 to T3 have plants, on land, at a sane density', () => {
    const ref = generateGalaxy(1337).stars[0]!;
    const planet = generateSystem(ref).planets[0]!;
    const setup = plantSetup(planet)!;
    expect(setup.plan.tier).toBe(planet.climate!.habitability);
    const plants = sample(setup.plan, setup.ground, 2);
    expect(plants.length).toBeGreaterThan(200);
    const R = setup.plan.radius;
    for (const q of plants) expect(q.radius).toBeGreaterThan(R);
    // About 4% to 100% of the candidate spots hold a plant: neither bare nor packed solid.
    const n = plantGridSize(R);
    const cells = Math.ceil(n / 2) ** 2 * 6;
    const perCell = plants.length / cells;
    expect(perCell).toBeGreaterThan(1);
    expect(perCell).toBeLessThan(((PLANT_CELL_SIZE * PLANT_CELL_SIZE) / 25) * 1.6);
  });

  it('are not generated for gas giants or bodies without plants', () => {
    const systems = generateGalaxy(1337).stars.slice(0, 40).map((r) => generateSystem(r));
    const gas = systems.flatMap((s) => s.planets).find((p) => p.type === 'gas')!;
    expect(plantSetup(gas)).toBeNull();
    const barren = systems.flatMap((s) => s.planets).find((p) => p.climate && p.climate.habitability === 0)!;
    expect(plantSetup(barren)).toBeNull();
  });
});

describe('surface changes', () => {
  it('records removals once, and round-trips through JSON', () => {
    const c = new SurfaceChanges();
    expect(c.remove('0:1:2:3')).toBe(true);
    expect(c.remove('0:1:2:3')).toBe(false);
    expect(c.isRemoved('0:1:2:3')).toBe(true);
    expect(c.isRemoved('0:1:2:4')).toBe(false);
    const again = SurfaceChanges.fromJSON(JSON.parse(JSON.stringify(c)));
    expect(again.isRemoved('0:1:2:3')).toBe(true);
    expect(again.removedCount).toBe(1);
  });

  it('keeps one list per planet', () => {
    const store = new SurfaceChangeStore();
    expect(store.forPlanet('a:1')).toBe(store.forPlanet('a:1'));
    store.forPlanet('a:1').remove('x');
    expect(store.forPlanet('b:2').isRemoved('x')).toBe(false);
  });
});

describe('plant meshes', () => {
  it('get cheaper at every level of detail, down to a few dozen triangles', () => {
    for (const s of plan(3).species) {
      const tris = (g: THREE.BufferGeometry) => g.getAttribute('position').count / 3;
      const levels = [0, 1, 2].map((lod) => createPlantGeometry(s, lod));
      expect(tris(levels[1]!)).toBeLessThan(tris(levels[0]!));
      expect(tris(levels[2]!)).toBeLessThan(tris(levels[1]!));
      expect(tris(levels[2]!)).toBeLessThanOrEqual(120);
      expect(levels[0]!.getAttribute('color').count).toBe(levels[0]!.getAttribute('position').count);
      for (const g of levels) g.dispose();
    }
  });
});

describe('graphics settings: plants', () => {
  it('start on for mouse players and off on touch devices, unless saved', () => {
    expect(parseGraphicsSettings(null, false).plants).toBe(true);
    expect(parseGraphicsSettings(null, true).plants).toBe(false);
    expect(parseGraphicsSettings('{"plants":true}', true).plants).toBe(true);
    expect(parseGraphicsSettings('{"plants":false}', false).plants).toBe(false);
    expect(parseGraphicsSettings('{"weather":false}', true)).toEqual({ weather: false, plants: false, animals: false, rocks: true, wireframe: false });
    expect(parseGraphicsSettings('{"plants":"yes"}', false).plants).toBe(true);
  });
});

describe('SurfaceEntities', () => {
  const debug = { folder: () => undefined } as unknown as Debug;
  const p3 = plan(3);
  const flat: GroundRadius = () => RADIUS * 1.02;
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, RADIUS * 1.02 + 25);
  camera.lookAt(0, 0, 0);

  function make(changes = new SurfaceChanges()): { surface: SurfaceEntities; scene: THREE.Scene; changes: SurfaceChanges } {
    const scene = new THREE.Scene();
    const surface = new SurfaceEntities(scene, p3, flat, camera, changes, debug);
    plantParams.enabled = true;
    plantParams.budgetMs = 1000;
    surface.update();
    return { surface, scene, changes };
  }

  it('loads the cells around the camera and draws the plants near it', () => {
    const { surface } = make();
    const s = surface.stats();
    expect(s.cells).toBeGreaterThan(20);
    expect(s.plants).toBeGreaterThan(100);
    expect(s.lods.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(s.drawCalls).toBeGreaterThan(0);
    expect(surface.settled).toBe(true);
    surface.dispose();
  });

  it('loads nothing when the camera is far above the ground, and nothing with the setting off', () => {
    const { surface } = make();
    const far = new THREE.PerspectiveCamera();
    far.position.set(0, 0, RADIUS * 6);
    const scene = new THREE.Scene();
    const empty = new SurfaceEntities(scene, p3, flat, far, new SurfaceChanges(), debug);
    empty.update();
    expect(empty.stats().cells).toBe(0);
    plantParams.enabled = false;
    surface.update();
    expect(surface.stats().cells).toBe(0);
    expect(surface.object.visible).toBe(false);
    plantParams.enabled = true;
    surface.dispose();
    empty.dispose();
  });

  it('picks the plant a ray passes through, and only the nearest', () => {
    const { surface } = make();
    const target = [...(surface as unknown as { cells: Map<string, { plants: PlantData[] }> }).cells.values()]
      .flatMap((c) => c.plants)
      .map((p) => ({ p, d: Math.hypot(p.x * p.radius - camera.position.x, p.y * p.radius - camera.position.y, p.z * p.radius - camera.position.z) }))
      .filter((t) => t.d < 60)
      .sort((a, b) => a.d - b.d)[0]!.p;
    const size = p3.species[target.species]!.height * target.scale;
    const aim = new THREE.Vector3(target.x, target.y, target.z).multiplyScalar(target.radius + size * 0.5);
    const ray = new THREE.Ray(camera.position.clone(), aim.clone().sub(camera.position).normalize());
    const hit = surface.pick(ray)!;
    expect(hit).not.toBeNull();
    // Something on the way may be nearer, but the hit is a plant whose sphere the ray crosses.
    expect(hit.distance).toBeLessThanOrEqual(aim.distanceTo(camera.position) + 1e-6);
    expect(surface.find(hit.id)).toEqual(hit.plant);
    // Looking at the sky hits nothing.
    expect(surface.pick(new THREE.Ray(camera.position.clone(), new THREE.Vector3(0, 0, 1)))).toBeNull();
    surface.dispose();
  });

  it('removes a plant for good, even when the level is built again', () => {
    const changes = new SurfaceChanges();
    const first = make(changes);
    const before = first.surface.stats().plants;
    const cells = (first.surface as unknown as { cells: Map<string, { plants: PlantData[] }> }).cells;
    const id = [...cells.values()].find((c) => c.plants.length > 0)!.plants[0]!.id;
    expect(first.surface.remove(id)).toBe(true);
    expect(first.surface.remove(id)).toBe(false);
    first.surface.update();
    expect(first.surface.stats().plants).toBe(before - 1);
    expect(changes.isRemoved(id)).toBe(true);
    first.surface.dispose();
    // A new planet level on the same change list: the plant is still gone.
    const again = make(changes);
    expect(again.surface.stats().plants).toBe(before - 1);
    expect(again.surface.remove('nonsense')).toBe(false);
    again.surface.dispose();
  });

  it('promotes a plant into a live object of its own, then puts it back or destroys it', () => {
    const changes = new SurfaceChanges();
    const { surface, scene } = make(changes);
    const cells = (surface as unknown as { cells: Map<string, { plants: PlantData[] }> }).cells;
    const plants = [...cells.values()].flatMap((c) => c.plants);
    const before = surface.stats().plants;
    const live = surface.promote(plants[0]!.id)!;
    expect(live).not.toBeNull();
    expect(surface.promote(plants[0]!.id)).toBeNull();
    expect(scene.children).toContain(live.object);
    expect(live.object.position.length()).toBeCloseTo(plants[0]!.radius, 4);
    expect(surface.stats().plants).toBe(before - 1);
    live.restore();
    expect(scene.children).not.toContain(live.object);
    expect(surface.stats().plants).toBe(before);
    expect(changes.isRemoved(plants[0]!.id)).toBe(false);
    const again = surface.promote(plants[1]!.id)!;
    again.destroy();
    expect(changes.isRemoved(plants[1]!.id)).toBe(true);
    expect(surface.stats().plants).toBe(before - 1);
    expect(surface.promote(plants[1]!.id)).toBeNull();
    surface.dispose();
  });

  describe('as obstacles for the ship', () => {
    const plantsOf = (surface: SurfaceEntities) =>
      [...(surface as unknown as { cells: Map<string, { plants: PlantData[] }> }).cells.values()].flatMap((c) => c.plants);
    const topOf = (p: PlantData) => p.radius + p3.species[p.species]!.height * p.scale;
    const dirOf = (p: PlantData) => new THREE.Vector3(p.x, p.y, p.z);
    const touched = (o: { touchAlong: SurfaceEntities['touchAlong'] }, from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
      const out: THREE.Vector3[] = [];
      o.touchAlong(from, to, radius, (x, y, z) => out.push(new THREE.Vector3(x, y, z)));
      return out;
    };
    const tallest = (surface: SurfaceEntities) =>
      plantsOf(surface)
        .filter((p) => p3.species[p.species]!.kind === 'tree')
        .sort((a, b) => topOf(b) - topOf(a))[0]!;

    it('touches a tree the hull goes through, under it or along the way, and not one it passes over', () => {
      const { surface } = make();
      const tree = tallest(surface);
      const over = dirOf(tree);
      const inside = topOf(tree) - 0.5;
      expect(touched(surface, over, over, inside).some((d) => d.distanceTo(over) < 1e-6)).toBe(true);
      // A stretch that passes through it from 15 units one side to 15 the other.
      const side = new THREE.Vector3(0, 0, 1).cross(over).normalize().multiplyScalar(15 / RADIUS);
      const from = over.clone().sub(side).normalize();
      const to = over.clone().add(side).normalize();
      expect(touched(surface, from, to, inside).some((d) => d.distanceTo(over) < 1e-6)).toBe(true);
      // High above every plant, nothing.
      expect(touched(surface, from, to, topOf(tree) + HULL_DEPTH + 0.01)).toEqual([]);
      surface.dispose();
    });

    it('matches checking every plant one by one, wherever the ship is', () => {
      const { surface } = make();
      const plants = plantsOf(surface);
      const at = new THREE.Vector3();
      let some = 0;
      for (let k = 0; k < 40; k++) {
        // Spots round the camera, near the plants it loaded, at heights through the canopy.
        at.set(Math.sin(k * 2.4) * 0.15, Math.cos(k * 2.4) * 0.15, 1).normalize();
        const radius = RADIUS + 1 + (k % 5) * 2;
        const expected = plants
          .filter((p) => {
            const s = p3.species[p.species]!;
            const d = dirOf(p).sub(at).length() * topOf(p) - s.crownRadius * p.scale;
            return d < HULL_RADIUS && radius < topOf(p) + HULL_DEPTH * Math.sqrt(1 - Math.max(0, d / HULL_RADIUS) ** 2);
          })
          .map((p) => p.id)
          .sort();
        const got = touched(surface, at, at, radius);
        expect(got.length).toBe(expected.length);
        if (expected.length > 0) some++;
      }
      // Some of the spots are in plants, some aren't.
      expect(some).toBeGreaterThan(5);
      expect(some).toBeLessThan(40);
      surface.dispose();
    });

    it('stops touching a plant once it is removed or lifted, and touches nothing with plants off', () => {
      const { surface } = make();
      const tree = tallest(surface);
      const over = dirOf(tree);
      const has = () => touched(surface, over, over, topOf(tree) - 0.5).some((d) => d.distanceTo(over) < 1e-6);
      expect(has()).toBe(true);
      const live = surface.promote(tree.id)!;
      expect(has()).toBe(false);
      live.restore();
      expect(has()).toBe(true);
      surface.remove(tree.id);
      expect(has()).toBe(false);
      plantParams.enabled = false;
      surface.update();
      expect(touched(surface, over, over, RADIUS + 1)).toEqual([]);
      plantParams.enabled = true;
      surface.dispose();
    });

    it('touches the plants the player set down too', () => {
      const changes = new SurfaceChanges();
      const plantings = new Plantings(new THREE.Scene(), changes);
      const tree = p3.species.find((s) => s.kind === 'tree')!;
      const up = new THREE.Vector3(0, 1, 0);
      expect(touched(plantings, up, up, RADIUS + 1)).toEqual([]);
      plantings.plant({ speciesKey: 'x#0', species: tree, origin: 'Home', x: 0, y: 1, z: 0, radius: RADIUS, scale: 1, yaw: 0 });
      expect(touched(plantings, up, up, RADIUS + tree.height - 0.1)).toHaveLength(1);
      expect(touched(plantings, up, up, RADIUS + tree.height + HULL_DEPTH + 0.1)).toEqual([]);
      plantings.dispose();
    });

    it('shakes the trees the ship flies through, along its course, knocks leaves off them, and lets them settle', () => {
      const { surface } = make();
      const tree = tallest(surface);
      const over = dirOf(tree);
      const side = new THREE.Vector3(0, 0, 1).cross(over).normalize();
      const ship = { object: new THREE.Object3D(), speed: 30 };
      // The leaves thrown, as the pool would get them.
      const thrown: { position: THREE.Vector3; velocity: THREE.Vector3; color: THREE.Color }[] = [];
      const leaves = {
        live: 0,
        emit: (p: Puff) => thrown.push({ position: p.position.clone(), velocity: p.velocity.clone(), color: (p.color as THREE.Color).clone() }),
        setView: () => {},
        update: () => {},
        dispose: () => {},
      };
      const sun = over.clone();
      const brush = new PlantBrush(ship, new THREE.PerspectiveCamera(), sun, () => [surface, null], leaves, debug);
      const radius = topOf(tree) - 0.5;
      const place = (along: number) => ship.object.position.copy(over).addScaledVector(side, along / RADIUS).normalize().multiplyScalar(radius);
      // From 10 units before the tree to 10 past, at 30 units a second.
      for (let along = -10; along <= 10; along += 0.5) {
        place(along);
        brush.update(1 / 60);
      }
      const u = plantShakeUniforms;
      const count = u.uShakeCount.value;
      expect(count).toBeGreaterThan(0);
      const k = u.uShakeAt.value.slice(0, count).findIndex((a) => new THREE.Vector3(a.x, a.y, a.z).distanceTo(over) < 1e-6);
      expect(k).toBeGreaterThanOrEqual(0);
      const push = u.uShakePush.value[k]!;
      // Pushed along the course, tangent to the ground, as hard as the speed says.
      expect(push.x * side.x + push.y * side.y + push.z * side.z).toBeGreaterThan(0.5);
      expect(Math.abs(push.x * over.x + push.y * over.y + push.z * over.z)).toBeLessThan(1e-6);
      expect(push.w).toBeCloseTo(Math.min(plantShakeParams.maxStrength, plantShakeParams.strength + plantShakeParams.perSpeed * 30));
      // Every plant shaken is inside the zone the shader checks first.
      const zone = u.uShakeZone.value;
      for (const a of u.uShakeAt.value.slice(0, count)) expect(a.x * zone.x + a.y * zone.y + a.z * zone.z).toBeGreaterThanOrEqual(zone.w);
      // Leaves knocked out of the crowns, a burst per plant shaken, thrown along with the ship, in the plants' colours.
      expect(thrown.length).toBeGreaterThanOrEqual(count * Math.min(leafParams.maxCount, Math.round(leafParams.count + leafParams.perSpeed * 30)));
      const s = p3.species[tree.species]!;
      const fromTree = thrown.filter((l) => l.position.clone().normalize().distanceTo(over) * RADIUS < s.crownRadius * tree.scale + 1);
      expect(fromTree.length).toBeGreaterThan(0);
      for (const l of fromTree) expect(l.position.length()).toBeLessThanOrEqual(topOf(tree) + 0.01);
      const along = thrown.reduce((sum, l) => sum + l.velocity.dot(side), 0) / thrown.length;
      expect(along).toBeGreaterThan(30 * leafParams.carry * 0.5);
      const colours = new Set(p3.species.flatMap((x) => [x.leafColor, x.trunkColor]).map((c) => new THREE.Color(c).getHexString()));
      // Under a noon sun, a leaf's colour is its species' a little lighter or darker.
      for (const l of thrown) {
        const near = [...colours].some((c) => {
          const base = new THREE.Color(`#${c}`);
          const k = l.color.r / Math.max(base.r, 1e-3);
          return Math.abs(l.color.g - base.g * k) < 0.02 && Math.abs(l.color.b - base.b * k) < 0.02 && k > 0.75 && k < 1.25;
        });
        expect(near).toBe(true);
      }
      // Flown on, high above it all: the shakes die away and go.
      ship.object.position.multiplyScalar(2);
      for (let t = 0; t < 10; t += 1 / 30) brush.update(1 / 30);
      expect(u.uShakeCount.value).toBe(0);
      brush.dispose();
      surface.dispose();
    });
  });
});

describe('PlantShaker', () => {
  const uniforms = () => ({
    uShakeTime: { value: 0 },
    uShakeCount: { value: 0 },
    uShakeZone: { value: new THREE.Vector4() },
    uShakeAt: { value: Array.from({ length: SHAKE_SLOTS }, () => new THREE.Vector4()) },
    uShakePush: { value: Array.from({ length: SHAKE_SLOTS }, () => new THREE.Vector4()) },
    uShakeRates: { value: new THREE.Vector4() },
  });
  const push = new THREE.Vector3(1, 0, 0);

  it('shakes a plant once, and again only once the last shake is old enough', () => {
    const u = uniforms();
    const shaker = new PlantShaker(u);
    shaker.shake(0, 1, 0, push, 0.2);
    shaker.shake(0, 1, 0, push, 0.2);
    expect(shaker.active).toBe(1);
    shaker.update(plantShakeParams.retrigger + 0.01);
    shaker.shake(0, 1, 0, push, 0.2);
    // Both swing at once: the new one adds to the old, so nothing jumps.
    expect(shaker.active).toBe(2);
    expect(u.uShakeAt.value[1]!.w).toBeCloseTo(plantShakeParams.retrigger + 0.01);
  });

  it('gives the slot of the shake that has died down most to a new one when all are taken', () => {
    const u = uniforms();
    const shaker = new PlantShaker(u);
    for (let k = 0; k < SHAKE_SLOTS; k++) {
      shaker.shake(Math.sin(k), Math.cos(k), 0, push, 0.2);
      shaker.update(0.01);
    }
    shaker.shake(0, 0, 1, push, 0.2);
    expect(shaker.active).toBe(SHAKE_SLOTS);
    // The first one was the oldest.
    expect(u.uShakeAt.value[0]!.z).toBe(1);
  });

  it('lets the shakes go once they have died away, and stops them all on clear', () => {
    const u = uniforms();
    const shaker = new PlantShaker(u);
    shaker.shake(0, 1, 0, push, 0.2);
    shaker.update(0.1);
    shaker.shake(1, 0, 0, push, 0.2);
    shaker.update(plantShakeParams.decay * 6 - 0.05);
    expect(u.uShakeCount.value).toBe(1);
    expect(u.uShakeAt.value[0]!.x).toBe(1);
    shaker.update(0.1);
    expect(u.uShakeCount.value).toBe(0);
    shaker.shake(0, 1, 0, push, 0.2);
    shaker.clear();
    expect(u.uShakeCount.value).toBe(0);
  });
});
