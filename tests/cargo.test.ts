import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { beamEase, beamParams, beamScale, bodyGravity, carriedScale, fallGravity, fallScale, stepFall, tripTime } from '../src/cargo/beam';
import { CARGO_STACKS, Inventory, STACK_SIZE, animalKey, cargoSize, speciesKey } from '../src/cargo/inventory';
import { animalFate, describeAnimalFate, type Fate } from '../src/cargo/animalFate';
import { planAnimals } from '../src/gen/animals';
import { FREEZING, IGNITION_TEMPERATURE, landingTemperature, plantFate, type FateWorld } from '../src/cargo/plantFate';
import { generateGalaxy, solRef } from '../src/gen/galaxy';
import { MIN_ARC_GRAVITY } from '../src/gen/lavaActivity';
import { generateSpecies, PLANT_KINDS, type PlantSpecies } from '../src/gen/plants';
import { Rng } from '../src/gen/rng';
import { generateSystem, type PlanetData } from '../src/gen/system';
import { weatherKind } from '../src/gen/weather';
import { SurfaceChanges } from '../src/surface/changes';
import { underDisc } from '../src/surface/SurfaceEntities';

const sol = generateSystem(solRef(generateGalaxy(1337))!);
const body = (name: string): PlanetData => [...sol.planets, ...sol.planets.flatMap((p) => p.moons)].find((p) => p.name === name)! as PlanetData;
const world = (name: string): FateWorld => {
  const b = body(name);
  return { climate: b.climate ?? null, weather: weatherKind(b.type, b.climate) };
};
const species = (kind: 'tree' | 'largeBush' | 'smallBush', i = 0): PlantSpecies => generateSpecies(new Rng(42).fork('s', i), i, kind, 120, 3);
const tree = species('tree');
const plant = (s: PlantSpecies) => ({ kind: 'plant' as const, species: s });
const shrub = species('smallBush', 1);
const DEG = Math.PI / 180;

describe('what becomes of a plant set down', () => {
  it('takes root on Earth where its kind grows, freezes at the poles and drowns in the sea', () => {
    const earth = world('Earth');
    expect(plantFate('land', earth, 20 * DEG, tree)).toBe('root');
    expect(plantFate('land', earth, 45 * DEG, shrub)).toBe('root');
    // The latitude model puts Earth's pole at 262.7 K: below a tree's window, inside a hardy shrub's.
    expect(landingTemperature(earth, 90 * DEG)!).toBeCloseTo(262.7, 0);
    expect(plantFate('land', earth, 90 * DEG, tree)).toBe(tree.minTemperature - 6 > 262.7 ? 'freeze' : 'root');
    expect(plantFate('sea', earth, 0, tree)).toBe('drown');
    // Polar sea is ice (262.7 K < 273.16 K).
    expect(plantFate('sea', earth, 85 * DEG, tree)).toBe('freeze');
  });

  it('chars on Venus (737 K, past wood\'s 523 K ignition, but no oxygen to burn in) and burns in lava with air', () => {
    expect(body('Venus').climate!.temperature).toBeGreaterThan(IGNITION_TEMPERATURE);
    expect(plantFate('land', world('Venus'), 0, tree)).toBe('char');
    expect(plantFate('lava', world('Earth'), 0, tree)).toBe('burn');
    // Io's lava, under next to no air: chars.
    expect(plantFate('lava', world('Io'), 0, tree)).toBe('char');
  });

  it('withers in a vacuum (the Moon, a comet) and freezes on Titan and Mars', () => {
    expect(plantFate('land', world('Moon'), 0, tree)).toBe('wither');
    expect(plantFate('land', { climate: null, weather: null }, 0, tree)).toBe('wither');
    expect(plantFate('land', world('Titan'), 0, shrub)).toBe('freeze');
    const mars = world('Mars');
    // Mars's 6 mbar is about water's triple point: either way nothing lives there.
    expect(['freeze', 'wither']).toContain(plantFate('land', mars, 0, shrub));
  });

  it('dissolves under an acid sky cool enough not to char, and sinks into a giant\'s clouds', () => {
    const venus = body('Venus').climate!;
    const coolAcid: FateWorld = { climate: { ...venus, temperature: 300 }, weather: 'acid' };
    expect(plantFate('land', coolAcid, 0, tree)).toBe('dissolve');
    expect(plantFate('clouds', world('Jupiter'), 0, tree)).toBe('sink');
  });

  it('withers past its heat limit and in the dark, and keeps to its own species\' window', () => {
    const earth = body('Earth').climate!;
    const hot: FateWorld = { climate: { ...earth, temperature: tree.maxTemperature + 20 }, weather: null };
    expect(plantFate('land', hot, 0, tree)).toBe('wither');
    const dark: FateWorld = { climate: { ...earth, insolation: 0 }, weather: null };
    expect(plantFate('land', dark, 0, tree)).toBe('wither');
    // The kinds' heat limits (318–330 K, 45–57 °C) sit where leaves die of heat (LT50 44–57 °C, docs/research/plant-fates.md).
    for (const k of Object.values(PLANT_KINDS)) {
      expect(k.temperature[1] - 273.15).toBeGreaterThanOrEqual(44);
      expect(k.temperature[1] - 273.15).toBeLessThanOrEqual(57);
    }
    expect(FREEZING).toBeCloseTo(273.16, 2);
  });
});

describe('the cargo hold', () => {
  it('stacks a species, caps each stack and the number of stacks', () => {
    const inv = new Inventory();
    const a = speciesKey('home', 0);
    for (let i = 0; i < STACK_SIZE; i++) expect(inv.add(a, plant(tree), 'Home')).not.toBeNull();
    expect(inv.stack(a)!.count).toBe(STACK_SIZE);
    expect(inv.canAdd(a)).toBe(false);
    expect(inv.add(a, plant(tree), 'Home')).toBeNull();
    for (let s = 1; s < CARGO_STACKS; s++) expect(inv.add(speciesKey('home', s), plant(shrub), 'Home')).not.toBeNull();
    expect(inv.canAdd(speciesKey('elsewhere', 0))).toBe(false);
    expect(inv.canAdd(speciesKey('home', 1))).toBe(true);
    expect(inv.full).toBe(false);
    expect(inv.total).toBe(STACK_SIZE + CARGO_STACKS - 1);
  });

  it('counts the plants still on their way up when the beam catches several at once', () => {
    const inv = new Inventory();
    const a = speciesKey('home', 0);
    for (let i = 0; i < STACK_SIZE - 2; i++) inv.add(a, plant(tree), 'Home');
    // Two more of a fit; a third on the way would overflow its stack.
    expect(inv.canAddAfter(a, [])).toBe(true);
    expect(inv.canAddAfter(a, [a])).toBe(true);
    expect(inv.canAddAfter(a, [a, a])).toBe(false);
    // New species each take a stack, counted once however many are on the way.
    const fresh = Array.from({ length: CARGO_STACKS - 2 }, (_, i) => speciesKey('home', i + 1));
    expect(inv.canAddAfter(speciesKey('far', 0), [...fresh, ...fresh])).toBe(true);
    const all = [...fresh, speciesKey('home', 9)];
    expect(inv.canAddAfter(speciesKey('far', 0), all)).toBe(false);
    // A species already on its way has its stack: more fit until it would be full.
    expect(inv.canAddAfter(fresh[0]!, all)).toBe(true);
    expect(inv.canAddAfter(fresh[0]!, [...all, ...Array<string>(STACK_SIZE - 1).fill(fresh[0]!)])).toBe(false);
  });

  it('takes one at a time, drops an empty stack, and round-trips through JSON', () => {
    const inv = new Inventory();
    const k = speciesKey('home', 3);
    inv.add(k, plant(tree), 'Home');
    inv.add(k, plant(tree), 'Home');
    const v = inv.version;
    expect(inv.take(k)!.count).toBe(1);
    expect(inv.version).toBeGreaterThan(v);
    const copy = new Inventory();
    copy.load(JSON.parse(JSON.stringify(inv.toJSON())));
    expect(copy.stack(k)!.count).toBe(1);
    expect(copy.stack(k)!.species.name).toBe(tree.name);
    inv.take(k);
    expect(inv.stack(k)).toBeNull();
    expect(inv.take(k)).toBeNull();
  });

  it('keeps plants set down in the surface change list, with fresh ids, across save/load', () => {
    const changes = new SurfaceChanges();
    const p = changes.plant({ speciesKey: 'x#0', species: tree, origin: 'Home', x: 0, y: 1, z: 0, radius: 400, scale: 1, yaw: 0 });
    changes.plant({ speciesKey: 'x#0', species: tree, origin: 'Home', x: 1, y: 0, z: 0, radius: 400, scale: 1, yaw: 0 });
    expect(changes.plantedCount).toBe(2);
    const back = SurfaceChanges.fromJSON(JSON.parse(JSON.stringify(changes.toJSON())));
    expect(back.plantedCount).toBe(2);
    const next = back.plant({ speciesKey: 'x#0', species: tree, origin: 'Home', x: 0, y: 0, z: 1, radius: 400, scale: 1, yaw: 0 });
    expect(next.id).not.toBe(p.id);
    expect(back.remove(p.id)).toBe(true);
    expect(back.plantedCount).toBe(2);
    // A removed planted plant is forgotten, not listed as removed.
    expect(back.isRemoved(p.id)).toBe(false);
  });
});

const animals = planAnimals({ seed: 7, tier: 3, temperature: 288, gravity: 1, radius: 400, peak: 420, sea: true })!.species;
const grazer = animals.find((a) => a.diet === 'herbivore')!;
const animal = { kind: 'animal' as const, species: grazer };

describe('animals in the hold', () => {
  it('stacks an animal species apart from the plant with the same index', () => {
    const inv = new Inventory();
    expect(animalKey('home', 0)).not.toBe(speciesKey('home', 0));
    inv.add(speciesKey('home', 0), plant(tree), 'Home');
    inv.add(animalKey('home', 0), animal, 'Home');
    inv.add(animalKey('home', 0), animal, 'Home');
    expect(inv.stacks.length).toBe(2);
    expect(inv.stack(animalKey('home', 0))!.count).toBe(2);
    expect(inv.stack(animalKey('home', 0))!.kind).toBe('animal');
    expect(inv.total).toBe(3);
  });

  it('round-trips animals through JSON, and loads an older save (plants with no kind) as plants', () => {
    const inv = new Inventory();
    inv.add(animalKey('home', 1), animal, 'Home');
    inv.add(speciesKey('home', 1), plant(shrub), 'Home');
    const copy = new Inventory();
    copy.load(JSON.parse(JSON.stringify(inv.toJSON())));
    const a = copy.stack(animalKey('home', 1))!;
    expect(a.kind).toBe('animal');
    expect(a.species.name).toBe(grazer.name);
    expect(copy.stack(speciesKey('home', 1))!.kind).toBe('plant');
    const old = new Inventory();
    old.load({ stacks: [{ key: 'home#0', species: tree, origin: 'Home', count: 3 }] });
    expect(old.stack('home#0')!.kind).toBe('plant');
    expect(old.total).toBe(3);
  });

  it('sizes an animal from its skeleton: as tall as its back or head, its reach its longest way', () => {
    const { height, radius } = cargoSize(animal);
    expect(height).toBeGreaterThan(0.3 * grazer.length);
    expect(height).toBeLessThan(1.5 * grazer.length);
    expect(radius).toBeGreaterThanOrEqual(0.4 * grazer.length);
    expect(radius).toBeLessThan(1.5 * grazer.length);
    expect(cargoSize(plant(tree))).toEqual({ height: tree.height, radius: tree.crownRadius });
  });
});

describe('what becomes of an animal set down', () => {
  it('roams where it can live and plants grow, starves where none do, and meets a plant\'s hazards', () => {
    const earth = world('Earth');
    const lat = Math.asin(0.3);
    const fine = animalFate('land', earth, lat, grazer, true);
    expect(fine).toBe(plantFate('land', earth, lat, grazer));
    if (fine === 'root') expect(animalFate('land', earth, lat, grazer, false)).toBe('starve');
    expect(animalFate('sea', earth, 0, grazer, true)).toBe('drown');
    expect(animalFate('lava', earth, 0, grazer, true)).toBe('burn');
    expect(animalFate('land', world('Moon'), 0, grazer, true)).toBe('wither');
    expect(animalFate('clouds', world('Jupiter'), 0, grazer, true)).toBe('sink');
    // Somewhere in its own window on Earth it lives.
    const fates = [0, 15, 30, 45, 60].map((d) => animalFate('land', earth, d * DEG, grazer, true));
    expect(fates).toContain('root');
  });

  it('has words for every fate', () => {
    const fates: Fate[] = ['root', 'drown', 'burn', 'char', 'freeze', 'wither', 'dissolve', 'sink', 'starve'];
    for (const f of fates) expect(describeAnimalFate(f, 'Grazer')).toMatch(/^Grazer /);
  });
});

describe('animals removed and set down in the surface change list', () => {
  it('keeps removed animals and those set down, with fresh ids, across save/load', () => {
    const changes = new SurfaceChanges();
    expect(changes.removeAnimal('0:1:2:3')).toBe(true);
    expect(changes.removeAnimal('0:1:2:3')).toBe(false);
    const a = changes.release({ speciesKey: animalKey('far', 0), species: grazer, origin: 'Far', x: 0, y: 1, z: 0, scale: 1, seed: 5 });
    expect(a.id).toMatch(/^released:/);
    const back = SurfaceChanges.fromJSON(JSON.parse(JSON.stringify(changes.toJSON())));
    expect(back.isAnimalRemoved('0:1:2:3')).toBe(true);
    expect(back.releasedCount).toBe(1);
    expect([...back.releasedAnimals][0]!.species.name).toBe(grazer.name);
    const b = back.release({ speciesKey: animalKey('far', 0), species: grazer, origin: 'Far', x: 1, y: 0, z: 0, scale: 1, seed: 6 });
    expect(b.id).not.toBe(a.id);
    // Removing an animal set down (its animal is `<id>:0`) forgets it rather than listing it.
    expect(back.removeAnimal(`${a.id}:0`)).toBe(true);
    expect(back.releasedCount).toBe(1);
    expect(back.isAnimalRemoved(`${a.id}:0`)).toBe(false);
    // Older saves have no animal changes.
    expect(SurfaceChanges.fromJSON({ removed: [] }).removedAnimalCount).toBe(0);
  });
});

describe('the beam\'s motion', () => {
  it('catches a plant under the beam by its trunk or half its crown', () => {
    expect(underDisc(0, 2, 3)).toBe(true);
    expect(underDisc(3, 0, 3)).toBe(true);
    expect(underDisc(3.9, 2, 3)).toBe(true);
    expect(underDisc(4.1, 2, 3)).toBe(false);
  });

  it('shrinks a tree to fit the ship on the way up and grows it back on the way down', () => {
    const small = carriedScale(10, 1);
    expect(10 * small).toBeCloseTo(beamParams.carriedHeight);
    expect(carriedScale(0.5, 1)).toBe(1);
    expect(beamScale(0, 1, small)).toBe(1);
    expect(beamScale(1, 1, small)).toBeCloseTo(small);
    expect(beamEase(0)).toBe(0);
    expect(beamEase(1)).toBe(1);
    expect(beamEase(0.5)).toBeCloseTo(0.5);
  });

  it('takes longer the longer the beam, never less than the minimum', () => {
    expect(tripTime(0)).toBe(beamParams.minTime);
    expect(tripTime(90)).toBeCloseTo(90 / beamParams.speed);
    expect(tripTime(0, true)).toBe(beamParams.lowerMinTime);
    expect(tripTime(90, true)).toBeCloseTo(90 / beamParams.lowerSpeed);
  });

  it('sets cargo down slower than it lifts it', () => {
    for (const length of [0, 10, 30, 70]) expect(tripTime(length, true)).toBeGreaterThan(tripTime(length));
  });

  /** Drops a fall onto a flat ball of radius 1000 from 20 up with `velocity`; where and when it lands. */
  const drop = (velocity: THREE.Vector3, gravity = fallGravity(1)) => {
    const f = { position: new THREE.Vector3(0, 1020, 0), velocity };
    let t = 0;
    let height = 20;
    while (height > 0 && t < 30) {
      height = stepFall(f, gravity, () => 1000, 1 / 120);
      t += 1 / 120;
    }
    return { height, t, position: f.position };
  };

  it('falls faster and faster, lands, and is full size when it does', () => {
    const { height, t, position } = drop(new THREE.Vector3());
    expect(height).toBe(0);
    expect(position.length()).toBeCloseTo(1000);
    expect(position.x).toBeCloseTo(0);
    // h = g t²/2 → t = √(2h/g).
    expect(t).toBeCloseTo(Math.sqrt((2 * 20) / beamParams.gravity), 1);
    expect(fallScale(0, 20, 0.1, 1)).toBe(1);
    expect(fallScale(20, 20, 0.1, 1)).toBeCloseTo(0.1);
  });

  it('keeps the velocity it was let go with: carried on across, thrown up or down', () => {
    const still = drop(new THREE.Vector3());
    const across = drop(new THREE.Vector3(15, 0, 0));
    // Over the same time, about as far as its speed takes it (the ground curves away a little).
    expect(across.t).toBeCloseTo(still.t, 1);
    expect(across.position.x).toBeCloseTo(15 * across.t, 0);
    const up = drop(new THREE.Vector3(0, 10, 0));
    const down = drop(new THREE.Vector3(0, -10, 0));
    // Up: rises, comes back and falls 20; t solves 20 + 10t − g t²/2 = 0.
    const g = beamParams.gravity;
    expect(up.t).toBeCloseTo((10 + Math.sqrt(100 + 40 * g)) / g, 1);
    expect(down.t).toBeLessThan(still.t);
  });

  it('never falls faster than its fastest speed down, whatever it carries across', () => {
    const f = { position: new THREE.Vector3(0, 5000, 0), velocity: new THREE.Vector3(30, -beamParams.maxFallSpeed * 2, 0) };
    stepFall(f, fallGravity(1), () => 1000, 1 / 60);
    const up = f.position.clone().normalize();
    expect(-f.velocity.dot(up)).toBeLessThanOrEqual(beamParams.maxFallSpeed + 1e-6);
    expect(f.velocity.x).toBeCloseTo(30, 0);
  });

  it('falls slower on weaker bodies, never so slow a comet takes minutes', () => {
    expect(fallGravity(1)).toBe(beamParams.gravity);
    expect(fallGravity(2.5)).toBeGreaterThan(fallGravity(1));
    expect(fallGravity(0.16)).toBeLessThan(fallGravity(1));
    expect(fallGravity(1e-5)).toBe(fallGravity(MIN_ARC_GRAVITY));
    expect(drop(new THREE.Vector3(), fallGravity(0)).t).toBeLessThan(5);
  });

  it('knows each body\'s gravity: its climate\'s, or a giant\'s or a comet\'s from its size', () => {
    expect(bodyGravity(body('Earth'))).toBeCloseTo(body('Earth').climate!.gravity);
    const giant = sol.planets.find((p) => p.size === 'gasGiant')!;
    expect(bodyGravity(giant)).toBeGreaterThan(1);
    expect(bodyGravity({ type: 'barren', radius: 0.5, size: undefined, climate: null })).toBeLessThan(0.01);
  });
});
