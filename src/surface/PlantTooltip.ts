import * as THREE from 'three';
import type { Entity } from '../core/Entity';
import type { Input } from '../core/Input';
import { PLANT_KINDS } from '../gen/plants';
import type { Tooltip } from '../ui/Tooltip';
import type { Plantings } from './Plantings';
import type { SurfaceAnimals } from './SurfaceAnimals';
import type { SurfaceEntities } from './SurfaceEntities';

/** How far past the ground's hit a plant can still be picked: its crown is wider than a point. */
const GROUND_SLACK = 1;

/**
 * Shows the plant (or animal) under the pointer in the tooltip: it proves `pick` works
 * (see SurfaceEntities) and gives the ground something to read. Added after
 * the camera, so the ray is this frame's. Only while `active` (the planet
 * level's HUD has the DOM while it is the level on screen).
 */
export class PlantTooltip implements Entity {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly point = new THREE.Vector3();
  private active = false;
  private shown = false;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    /** The body's own plants (null where none grow), and those the player set down. */
    private readonly plants: SurfaceEntities | null,
    private readonly plantings: Plantings | null,
    private readonly tooltip: Tooltip,
    /** The animals roaming the body (null where none do): they stand in front of the plants. */
    private readonly animals: SurfaceAnimals | null,
    /** Where the ray meets the ground (written into the second argument; the distance, or null): plants behind a hill don't count. */
    private readonly groundHit: (ray: THREE.Ray, out: THREE.Vector3) => number | null,
  ) {}

  activate(): void {
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
    this.hide();
  }

  update(): void {
    if (!this.active) return;
    const { pointer } = this.input;
    const hovering = pointer.inside && !this.input.isDragging && !this.input.blocked;
    if (hovering) {
      this.raycaster.setFromCamera(this.ndc.set(pointer.ndcX, pointer.ndcY), this.camera);
      const { ray } = this.raycaster;
      const ground = this.groundHit(ray, this.point);
      // A plant stands on the ground, so it is hit just before the ray reaches it.
      const limit = ground === null ? Infinity : ground + GROUND_SLACK;
      const animal = this.animals?.pick(ray, limit) ?? null;
      if (animal) {
        const { species, scale, doing } = animal;
        const info = `${species.diet === 'carnivore' ? 'Carnivore' : 'Herbivore'} · ${(species.length * scale).toFixed(1)} u long · ${doing}`;
        this.tooltip.show(animal.id, species.name, info, pointer.clientX, pointer.clientY, animal.origin ? `Brought from ${animal.origin}` : undefined, this.input.touchMode);
        this.shown = true;
        return;
      }
      const hit = this.plants?.pick(ray, limit) ?? null;
      const planted = this.plantings?.pick(ray, hit ? hit.distance : limit) ?? null;
      if (planted) {
        const { species, scale, origin } = planted.plant;
        const info = `${PLANT_KINDS[species.kind].label} · ${(species.height * scale).toFixed(1)} u tall`;
        this.tooltip.show(planted.id, species.name, info, pointer.clientX, pointer.clientY, `Brought from ${origin}`, this.input.touchMode);
        this.shown = true;
        return;
      }
      if (hit) {
        const { species, plant } = hit;
        const height = species.height * plant.scale;
        this.tooltip.show(hit.id, species.name, `${PLANT_KINDS[species.kind].label} · ${height.toFixed(1)} u tall`, pointer.clientX, pointer.clientY, undefined, this.input.touchMode);
        this.shown = true;
        return;
      }
    }
    this.hide();
  }

  private hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.tooltip.hide();
  }

  dispose(): void {
    this.hide();
  }
}
