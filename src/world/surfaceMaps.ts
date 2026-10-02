import { decodeSurface, registerSurface, surfaceFile, SURFACE_NAMES, type SurfaceName } from '../gen/realSurface';

/*
 * Fetches the real bodies' surface maps (gen/realSurface.ts) and registers
 * them. Started once at load; a level built before they arrive (or if they
 * fail) draws those bodies from their noise instead.
 */

let loading: Promise<void> | null = null;

/** Starts loading every map (once) and resolves when they're all registered or have failed. */
export function loadSurfaceMaps(): Promise<void> {
  loading ??= Promise.all(SURFACE_NAMES.map(loadOne)).then(() => undefined);
  return loading;
}

async function loadOne(name: SurfaceName): Promise<void> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}${surfaceFile(name)}`);
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const inflated = response.body.pipeThrough(new DecompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(inflated).arrayBuffer());
    registerSurface(decodeSurface(name, bytes));
  } catch (error) {
    console.warn(`Surface map ${name} failed to load; it falls back to noise.`, error);
  }
}
