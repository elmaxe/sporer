import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

/**
 * Thin wrapper around a Rapier world. Space has no gravity; ships fly by
 * applying impulses. Step it only from the Game's fixed-step loop.
 */
export class Physics {
  private constructor(readonly world: RAPIER.World) {}

  /** Rapier ships as WASM and must be initialised once before use. */
  static async create(timestep: number): Promise<Physics> {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    world.timestep = timestep;
    return new Physics(world);
  }

  step(): void {
    this.world.step();
  }

  dispose(): void {
    this.world.free();
  }
}
