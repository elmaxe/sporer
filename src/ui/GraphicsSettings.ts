import { animalParams } from '../surface/animalParams';
import { plantParams } from '../surface/plantParams';
import { rockParams } from '../surface/GroundRocks';
import { weatherParams } from '../world/weatherLook';
import { wireframeParams } from '../world/wireframe';

const STORAGE_KEY = 'spore2.graphics';

/** Player-facing graphics settings. */
export interface GraphicsSettings {
  /** Clouds, storms, rain and lightning (see gen/weather.ts). Off saves their cost on slow devices. */
  weather: boolean;
  /** Plants standing on habitable planets (see gen/plants.ts). Off by default on touch devices. */
  plants: boolean;
  /** Animals roaming habitable planets (see gen/animals.ts). Off by default on touch devices, like plants. */
  animals: boolean;
  /** Loose rocks on solid ground in low orbit (see gen/rocks.ts). On everywhere by default: they're cheap. */
  rocks: boolean;
  /** Surfaces drawn as their triangles' edges (see world/wireframe.ts): to see the meshes and their level of detail. */
  wireframe: boolean;
}

/** The settings before the player changes any: plants start off on touch devices (`touch`: the main pointer is coarse). */
export function defaultGraphicsSettings(touch: boolean): GraphicsSettings {
  return { weather: true, plants: !touch, animals: !touch, rocks: true, wireframe: false };
}

/** Settings from stored JSON; anything missing or malformed falls back to the defaults. */
export function parseGraphicsSettings(json: string | null, touch = false): GraphicsSettings {
  const out = defaultGraphicsSettings(touch);
  if (!json) return out;
  try {
    const raw: unknown = JSON.parse(json);
    if (typeof raw === 'object' && raw !== null) {
      const { weather, plants, animals, rocks, wireframe } = raw as Record<string, unknown>;
      if (typeof weather === 'boolean') out.weather = weather;
      if (typeof plants === 'boolean') out.plants = plants;
      if (typeof animals === 'boolean') out.animals = animals;
      if (typeof rocks === 'boolean') out.rocks = rocks;
      if (typeof wireframe === 'boolean') out.wireframe = wireframe;
    }
  } catch {
    // Keep the defaults.
  }
  return out;
}

/** Whether the device's main pointer is coarse (a phone or tablet), like the input's starting touch mode. */
export function isTouchDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** Settings saved in this browser, or the defaults. */
export function loadGraphicsSettings(): GraphicsSettings {
  try {
    return parseGraphicsSettings(localStorage.getItem(STORAGE_KEY), isTouchDevice());
  } catch {
    return parseGraphicsSettings(null, isTouchDevice());
  }
}

function saveGraphicsSettings(s: GraphicsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode etc.): settings just won't persist.
  }
}

/** Applies settings to the game's global switches (read by the weather views every frame). */
export function applyGraphicsSettings(s: GraphicsSettings): void {
  weatherParams.enabled = s.weather;
  plantParams.enabled = s.plants;
  animalParams.enabled = s.animals;
  rockParams.enabled = s.rocks;
  wireframeParams.enabled = s.wireframe;
}

/**
 * The graphics settings in the menu's Display section (#graphics-weather,
 * #graphics-plants, #graphics-animals, #graphics-rocks and #graphics-wireframe in index.html,
 * see GameMenu): a Weather toggle for clouds, storms, rain and lightning,
 * Plants, Animals and Rocks toggles and a Wireframe toggle. Changes apply live and are saved to localStorage.
 */
export class GraphicsSettingsControl {
  private readonly weatherButton = document.getElementById('graphics-weather') as HTMLButtonElement;
  private readonly plantsButton = document.getElementById('graphics-plants') as HTMLButtonElement;
  private readonly animalsButton = document.getElementById('graphics-animals') as HTMLButtonElement;
  private readonly rocksButton = document.getElementById('graphics-rocks') as HTMLButtonElement;
  private readonly wireframeButton = document.getElementById('graphics-wireframe') as HTMLButtonElement;

  constructor(private settings: GraphicsSettings) {
    applyGraphicsSettings(settings);
    this.weatherButton.addEventListener('click', this.onWeather);
    this.plantsButton.addEventListener('click', this.onPlants);
    this.animalsButton.addEventListener('click', this.onAnimals);
    this.rocksButton.addEventListener('click', this.onRocks);
    this.wireframeButton.addEventListener('click', this.onWireframe);
    this.render();
  }

  dispose(): void {
    this.weatherButton.removeEventListener('click', this.onWeather);
    this.plantsButton.removeEventListener('click', this.onPlants);
    this.animalsButton.removeEventListener('click', this.onAnimals);
    this.rocksButton.removeEventListener('click', this.onRocks);
    this.wireframeButton.removeEventListener('click', this.onWireframe);
  }

  private render(): void {
    const on = this.settings.weather;
    this.weatherButton.textContent = `Weather: ${on ? 'on' : 'off'}`;
    this.weatherButton.setAttribute('aria-pressed', String(on));
    const plants = this.settings.plants;
    this.plantsButton.textContent = `Plants: ${plants ? 'on' : 'off'}`;
    this.plantsButton.setAttribute('aria-pressed', String(plants));
    const animals = this.settings.animals;
    this.animalsButton.textContent = `Animals: ${animals ? 'on' : 'off'}`;
    this.animalsButton.setAttribute('aria-pressed', String(animals));
    const rocks = this.settings.rocks;
    this.rocksButton.textContent = `Rocks: ${rocks ? 'on' : 'off'}`;
    this.rocksButton.setAttribute('aria-pressed', String(rocks));
    const wireframe = this.settings.wireframe;
    this.wireframeButton.textContent = `Wireframe: ${wireframe ? 'on' : 'off'}`;
    this.wireframeButton.setAttribute('aria-pressed', String(wireframe));
  }

  private onWeather = () => {
    this.change({ weather: !this.settings.weather });
  };

  private onPlants = () => {
    this.change({ plants: !this.settings.plants });
  };

  private onAnimals = () => {
    this.change({ animals: !this.settings.animals });
  };

  private onRocks = () => {
    this.change({ rocks: !this.settings.rocks });
  };

  private onWireframe = () => {
    this.change({ wireframe: !this.settings.wireframe });
  };

  private change(change: Partial<GraphicsSettings>): void {
    this.settings = { ...this.settings, ...change };
    applyGraphicsSettings(this.settings);
    saveGraphicsSettings(this.settings);
    this.render();
  }
}
