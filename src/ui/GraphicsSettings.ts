import { weatherParams } from '../world/weatherLook';

const STORAGE_KEY = 'spore2.graphics';

/** Player-facing graphics settings. */
export interface GraphicsSettings {
  /** Clouds, storms, rain and lightning (see gen/weather.ts). Off saves their cost on slow devices. */
  weather: boolean;
}

export const DEFAULT_GRAPHICS_SETTINGS: Readonly<GraphicsSettings> = { weather: true };

/** Settings from stored JSON; anything missing or malformed falls back to the defaults. */
export function parseGraphicsSettings(json: string | null): GraphicsSettings {
  const out = { ...DEFAULT_GRAPHICS_SETTINGS };
  if (!json) return out;
  try {
    const raw: unknown = JSON.parse(json);
    if (typeof raw === 'object' && raw !== null && typeof (raw as Record<string, unknown>).weather === 'boolean')
      out.weather = (raw as { weather: boolean }).weather;
  } catch {
    // Keep the defaults.
  }
  return out;
}

/** Settings saved in this browser, or the defaults. */
export function loadGraphicsSettings(): GraphicsSettings {
  try {
    return parseGraphicsSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseGraphicsSettings(null);
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
}

/**
 * The graphics settings in the menu (#graphics in index.html, see GameMenu):
 * a Weather toggle for clouds, storms, rain and lightning. Changes apply
 * live and are saved to localStorage.
 */
export class GraphicsSettingsControl {
  private readonly weatherButton = document.getElementById('graphics-weather') as HTMLButtonElement;

  constructor(private settings: GraphicsSettings) {
    applyGraphicsSettings(settings);
    this.weatherButton.addEventListener('click', this.onWeather);
    this.render();
  }

  dispose(): void {
    this.weatherButton.removeEventListener('click', this.onWeather);
  }

  private render(): void {
    const on = this.settings.weather;
    this.weatherButton.textContent = `Weather: ${on ? 'on' : 'off'}`;
    this.weatherButton.setAttribute('aria-pressed', String(on));
  }

  private onWeather = () => {
    this.settings = { ...this.settings, weather: !this.settings.weather };
    applyGraphicsSettings(this.settings);
    saveGraphicsSettings(this.settings);
    this.render();
  };
}
