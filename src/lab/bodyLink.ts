import type { PlanetData } from '../gen/system';
import type { Planet } from '../world/Planet';
import { labFromBody, labLink } from './labPlanet';

/** A link to the planet lab (lab.html next to `base`) showing a planet of the game (with its moons) or a moon. */
export function bodyLabLink(body: Planet, base: string = location.href): string {
  const { config, parent } = body;
  const moons = (config as Partial<PlanetData>).moons ?? [];
  return labLink(labFromBody(config, parent !== null, moons), base);
}
