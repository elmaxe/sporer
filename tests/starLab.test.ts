import { describe, expect, it } from 'vitest';
import { generateGalaxy, systemRef } from '../src/gen/galaxy';
import { hashSeed } from '../src/gen/rng';
import { kindActivity, starActivity, stormAlive, stormEvent } from '../src/gen/starActivity';
import { generateStar, nominalStar } from '../src/gen/stars';
import { Rng } from '../src/gen/rng';
import { isGiant } from '../src/gen/planets';
import { generateSystem, tuneSystem, type SystemData } from '../src/gen/system';
import {
  DEFAULT_STAR_VIEW,
  STAR_RANGES,
  decodeStarLab,
  encodeStarLab,
  generateLabStars,
  labSystem,
  loadLabStars,
  rerollLook,
  sanitizeStar,
  sanitizeTuning,
  stormsAt,
  toStarRef,
  withKind,
  type StarLabState,
} from '../src/starlab/labStars';

const galaxy = generateGalaxy(1337);
/** Ordinary star systems (not Sol, young or rogue): the ones the tuner changes. */
const ordinary = galaxy.stars.filter((r) => !r.real && !r.young).slice(0, 120);

/** Every planet neighbourhood clear of the stars and of the next one, as tests/universe.test.ts checks the game's. */
function expectClearLayout(system: SystemData): void {
  let edge = system.starZone;
  for (const p of system.planets) {
    expect(p.orbit.radius - p.extent).toBeGreaterThan(edge);
    edge = p.orbit.radius + p.extent;
  }
}

describe('tuneSystem', () => {
  it('with no changes is exactly the game system', () => {
    for (const ref of ordinary.slice(0, 60)) expect(tuneSystem(ref, {})).toEqual(generateSystem(ref));
  });

  it('makes as many planets as asked, keeping the drawn ones where they were', () => {
    for (const ref of ordinary.slice(0, 40)) {
      const drawn = generateSystem(ref);
      for (const planets of [0, 3, 12]) {
        const tuned = tuneSystem(ref, { planets });
        expect(tuned.planets).toHaveLength(planets);
        // The planets they share are the same planets (a belt may push the giants out, so compare all but the orbit).
        const shared = Math.min(planets, drawn.planets.length);
        for (let i = 0; i < shared; i++) {
          const { orbit: _a, ...a } = tuned.planets[i]!;
          const { orbit: _b, ...b } = drawn.planets[i]!;
          expect(a).toEqual(b);
        }
        expectClearLayout(tuned);
      }
    }
  });

  it('spreads or packs the planets by the spacing, and their layout stays clear', () => {
    for (const ref of ordinary.slice(0, 40)) {
      const packed = tuneSystem(ref, { planets: 8, spacing: 0.3, mainBelt: false });
      const spread = tuneSystem(ref, { planets: 8, spacing: 3, mainBelt: false });
      expectClearLayout(packed);
      expectClearLayout(spread);
      expect(spread.planets.at(-1)!.orbit.radius).toBeGreaterThan(packed.planets.at(-1)!.orbit.radius);
    }
  });

  it('gives each planet the moons asked for', () => {
    for (const ref of ordinary.slice(0, 20)) {
      const system = tuneSystem(ref, { planets: 6, moons: 3 });
      for (const p of system.planets) expect(p.moons).toHaveLength(3);
      expectClearLayout(system);
    }
  });

  it('forces the main belt, the comets and the debris disc on or off', () => {
    for (const ref of ordinary.slice(0, 40)) {
      const on = tuneSystem(ref, { planets: 8, mainBelt: true, comets: 5, debris: true });
      const off = tuneSystem(ref, { mainBelt: false, comets: 0, debris: false });
      // A main belt needs a giant to sit inside of.
      expect(on.belts.some((b) => b.kind === 'main')).toBe(on.planets.some((p) => isGiant(p.size)));
      expect(off.belts.some((b) => b.kind === 'main')).toBe(false);
      expect(on.comets).toHaveLength(5);
      expect(off.comets).toHaveLength(0);
      expect(on.dust?.kind).toBe('debris');
      expect(off.dust).toBeNull();
    }
  });

  it("leaves Sol, young stars' and rogue planets' systems as they are", () => {
    const special = [...galaxy.stars.filter((r) => r.real || r.young), galaxy.rogues[0]!];
    for (const ref of special) expect(tuneSystem(ref, { planets: 2, comets: 4, debris: true })).toEqual(generateSystem(ref));
  });
});

describe('star activity', () => {
  it("is the star's own when it has one, else its kind's", () => {
    const star = nominalStar('redDwarf');
    expect(starActivity(star)).toEqual(kindActivity(star));
    const own = { ...kindActivity(star), spots: 0.1 };
    expect(starActivity({ ...star, activity: own })).toBe(own);
  });

  it('lets a main-sequence star be made of a chosen class', () => {
    for (const cls of ['O', 'B', 'A', 'F', 'G', 'K'] as const) {
      expect(generateStar(new Rng(3), 'mainSequence', cls).spectralClass).toBe(cls);
    }
  });
});

describe('the star lab model', () => {
  const view = { ...DEFAULT_STAR_VIEW };

  it('generates the same stars from the same seed, as asked', () => {
    expect(generateLabStars(5)).toEqual(generateLabStars(5));
    expect(generateLabStars(5).name).not.toBe(generateLabStars(6).name);
    const giant = generateLabStars(9, { kind: 'redGiant', binary: true });
    expect(giant.stars[0]!.kind).toBe('redGiant');
    expect(giant.stars).toHaveLength(2);
    expect(giant.stars[0]!.radius).toBeGreaterThanOrEqual(giant.stars[1]!.radius);
    expect(generateLabStars(9, { spectralClass: 'F', binary: false }).stars.map((s) => s.spectralClass)).toEqual(['F']);
    // Every star carries its full activity, for the panel to edit.
    for (const s of giant.stars) expect(s.activity).toEqual(kindActivity(s));
  });

  it('turns a star into another kind with that kind’s typical numbers and behaviour', () => {
    const star = generateLabStars(4, { kind: 'mainSequence', spectralClass: 'G' }).stars[0]!;
    const dwarf = withKind(star, 'whiteDwarf');
    expect(dwarf.kind).toBe('whiteDwarf');
    expect(dwarf.radius).toBe(nominalStar('whiteDwarf').radius);
    expect(dwarf.activity).toEqual(kindActivity(dwarf));
    expect(withKind(star, 'mainSequence', 'B').spectralClass).toBe('B');
  });

  it('rolls another look round the kind, keeping its size, light and mass', () => {
    const star = generateLabStars(4, { kind: 'mainSequence', spectralClass: 'K' }).stars[0]!;
    const a = rerollLook(star, 1);
    expect(rerollLook(star, 1)).toEqual(a);
    expect(rerollLook(star, 2)).not.toEqual(a);
    expect([a.kind, a.radius, a.luminosity, a.mass]).toEqual([star.kind, star.radius, star.luminosity, star.mass]);
    expect(a.color).toMatch(/^#[0-9a-f]{6}$/);
    const base = kindActivity(star);
    expect(a.activity!.pace / base.pace).toBeGreaterThan(0.5);
    expect(a.activity!.pace / base.pace).toBeLessThan(2);
    expect(a.activity!.spots).toBeLessThanOrEqual(1);
  });

  it('grows the system the game grows from the same star and seed', () => {
    const ref = ordinary[3]!;
    const loaded = loadLabStars('1337', ref.id)!;
    expect(loaded.source).toEqual({ seed: '1337', star: ref.id });
    const state: StarLabState = { ...loaded, view };
    // The lab's stars carry their activity; the game's don't, so compare what the generator reads.
    const system = labSystem(state);
    const game = generateSystem(ref);
    expect(system.planets).toEqual(game.planets);
    expect(system.belts).toEqual(game.belts);
    expect(system.comets).toEqual(game.comets);
    expect(toStarRef(state).seed).toBe(ref.seed);
  });

  it("loads Sol by name and swaps the lab's star into its real system", () => {
    const sol = loadLabStars('1337', 'sol')!;
    expect(sol.real).toBe('sol');
    expect(sol.source?.star).toBe('sol');
    const state: StarLabState = { ...sol, stars: [withKind(sol.stars[0]!, 'redGiant')], view };
    const system = labSystem(state);
    expect(system.stars[0]!.kind).toBe('redGiant');
    expect(system.planets.map((p) => p.name)).toContain('Earth');
  });

  it('has no star to load for a rogue planet or an unknown id', () => {
    expect(loadLabStars('1337', galaxy.stars.length)).toBeNull();
    expect(loadLabStars('1337', 10 ** 7)).toBeNull();
    expect(systemRef(galaxy, galaxy.stars.length)?.stars).toEqual([]);
  });

  it('round-trips a state through its link', () => {
    const state: StarLabState = { ...generateLabStars(12, { binary: true }), tuning: { planets: 4, debris: false }, view: { ...view, view: 'system', speed: 3 } };
    state.stars[0]!.activity!.flare.chance = 0.9;
    expect(decodeStarLab(encodeStarLab(state))).toEqual(state);
  });

  it('turns a damaged or hostile link into a star that draws, or nothing', () => {
    expect(decodeStarLab('not base64 at all!')).toBeNull();
    expect(decodeStarLab(btoa('{"stars":[]}'))).toBeNull();
    const raw = { stars: [{ kind: 'quasar', radius: 1e9, color: 'red', activity: { spots: 7, flare: { life: [5, 1] } } }], tuning: { planets: 99, spacing: -4, nonsense: 1 } };
    const state = decodeStarLab(btoa(JSON.stringify(raw)))!;
    const star = state.stars[0]!;
    expect(star.kind).toBe('mainSequence');
    expect(star.radius).toBe(STAR_RANGES.radius[1]);
    expect(star.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(star.activity!.spots).toBe(1);
    // A range's upper end is never below its lower one.
    expect(star.activity!.flare.life[1]).toBeGreaterThanOrEqual(star.activity!.flare.life[0]);
    expect(state.tuning).toEqual({ planets: 12, spacing: 0.3 });
    expect(sanitizeTuning({ mainBelt: 'yes', comets: 2.6 })).toEqual({ comets: 3 });
    expect(sanitizeStar({ kind: 'redDwarf', spectralClass: 'O' }).spectralClass).toBe('M');
  });

  it('counts the storms under way as the slot grid has them', () => {
    const star = nominalStar('mainSequence', 'G');
    const a = kindActivity(star);
    const seed = hashSeed(77, 'star', 0);
    for (const time of [0, 13.5, 120, 999]) {
      let flares = 0;
      for (let i = Math.floor((time - a.flare.life[1]) / a.flare.interval); i <= Math.floor(time / a.flare.interval); i++) {
        const e = stormEvent(a, seed, 'flare', i);
        if (e && stormAlive(e, time)) flares++;
      }
      expect(stormsAt(a, seed, time).flare).toBe(flares);
    }
  });
});
