import type { ClimateData, Habitability } from '../gen/climate';
import { weatherKind } from '../gen/weather';
import type { MoonType, PlanetType } from '../gen/planets';

/*
 * Terraforming's milestones (docs/design/terraforming.md, "Milestones"):
 * the moments a world crosses on its way, each announced once with a banner
 * (and a sound cue, silent until its files exist), and every tier reached
 * or lost. Pure: what a climate has (`milestoneFlags`) and, per body, what
 * was announced (`Milestones`, JSON-able, kept by the SceneManager). A
 * "first" is only announced if the body didn't have it to begin with (an
 * ocean world never gets "first rain"). "First roots" comes with plants that
 * matter (phase 6).
 */

export type FirstId = 'firstAir' | 'firstRain' | 'seasThaw' | 'breathable';
export const FIRSTS: readonly FirstId[] = ['firstAir', 'firstRain', 'seasThaw', 'breathable'];

export const FIRST_TITLE: Record<FirstId, string> = {
  firstAir: 'First breath of air',
  firstRain: 'First rain',
  seasThaw: 'The seas thaw',
  breathable: 'Breathable air',
};

/** Air thick enough to see: the atmosphere's glow shows from 5 mbar (gen/climate.ts atmosphereTint). */
export const FIRST_AIR_PRESSURE = 0.005;

export type MilestoneFlags = Record<FirstId, boolean> & { tier: Habitability };

/** What a climate has, as the milestones count it. */
export function milestoneFlags(type: PlanetType | MoonType, climate: ClimateData): MilestoneFlags {
  return {
    firstAir: climate.composition !== 'none' && climate.pressure >= FIRST_AIR_PRESSURE,
    firstRain: weatherKind(type, climate) === 'water' && climate.waterState === 'liquid',
    seasThaw: climate.waterState === 'liquid',
    breathable: climate.composition === 'oxygenNitrogen',
    tier: climate.habitability,
  };
}

/** A milestone reached: a first, or a tier reached or lost. */
export interface MilestoneEvent {
  /** Game time, s. */
  time: number;
  id: FirstId | 'tierUp' | 'tierDown';
  /** The tier it's at now (tier events). */
  tier?: Habitability;
}

/** The banner's line for a milestone, e.g. "T2 reached", "Back to T1". */
export function milestoneTitle(e: Pick<MilestoneEvent, 'id' | 'tier'>): string {
  if (e.id === 'tierUp') return `T${e.tier} reached`;
  if (e.id === 'tierDown') return e.tier === 0 ? 'No longer habitable (T0)' : `Back to T${e.tier}`;
  return FIRST_TITLE[e.id];
}

interface BodyMilestones {
  /** The firsts announced (or there to begin with). */
  firsts: FirstId[];
  tier: Habitability;
  /** Every milestone reached, oldest first. */
  log: MilestoneEvent[];
}

export interface MilestonesData {
  bodies: Record<string, BodyMilestones>;
}

/** Every body's milestones: what was announced, and when. */
export class Milestones {
  private readonly bodies = new Map<string, BodyMilestones>();

  /**
   * Checks a body against its climate now (`flags`) and the one it was
   * generated with (`base`): returns the milestones it has just reached (and
   * logs them). The first check of a body starts it from `base`.
   */
  check(key: string, base: MilestoneFlags, flags: MilestoneFlags, time: number): MilestoneEvent[] {
    let body = this.bodies.get(key);
    if (!body) {
      body = { firsts: FIRSTS.filter((f) => base[f]), tier: base.tier, log: [] };
      this.bodies.set(key, body);
    }
    const out: MilestoneEvent[] = [];
    for (const f of FIRSTS) {
      if (flags[f] && !body.firsts.includes(f)) {
        body.firsts.push(f);
        out.push({ time, id: f });
      }
    }
    if (flags.tier !== body.tier) {
      out.push({ time, id: flags.tier > body.tier ? 'tierUp' : 'tierDown', tier: flags.tier });
      body.tier = flags.tier;
    }
    body.log.push(...out);
    return out;
  }

  /** A body's milestones so far, oldest first. */
  log(key: string): readonly MilestoneEvent[] {
    return this.bodies.get(key)?.log ?? [];
  }

  toJSON(): MilestonesData {
    return { bodies: Object.fromEntries([...this.bodies].map(([k, v]) => [k, { firsts: [...v.firsts], tier: v.tier, log: v.log.map((e) => ({ ...e })) }])) };
  }

  load(data: MilestonesData): void {
    this.bodies.clear();
    for (const [k, v] of Object.entries(data.bodies ?? {})) this.bodies.set(k, { firsts: [...v.firsts], tier: v.tier, log: v.log.map((e) => ({ ...e })) });
  }
}
