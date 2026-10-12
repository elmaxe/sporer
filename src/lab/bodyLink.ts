import type { PlanetData } from '../gen/system';
import { colonyClock } from '../colony/clock';
import type { Planet } from '../world/Planet';
import { labFromBody, labLink } from './labPlanet';

/**
 * A link to the planet lab (lab.html next to `base`) showing a planet of the
 * game (with its moons), a moon or a comet, with its colonies as grown as
 * they are now.
 */
export function bodyLabLink(body: Planet, base: string = location.href): string {
  const { config, parent } = body;
  const moons = (config as Partial<PlanetData>).moons ?? [];
  const planet = labFromBody(config, parent !== null, moons);
  const sites = body.colonySites.map((c) => c.site);
  if (sites.length === 0) return labLink(planet, base);
  const first = Math.min(...sites.map((s) => s.founded));
  const colonies = sites.map((s) => ({ ...s, founded: s.founded - first }));
  return labLink({ ...planet, colonies }, base, { colonyAge: Math.max(0, Math.round((colonyClock.now() - first) / 1000)) });
}
