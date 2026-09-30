import type { AudioManager } from '../audio/AudioManager';
import { parseAudioSettings, type AudioSettings } from '../audio/settings';

const STORAGE_KEY = 'spore2.audio';
const SLIDERS = ['master', 'music', 'ambience', 'sfx'] as const;

/** Volume settings saved in this browser, or the defaults. */
export function loadAudioSettings(): AudioSettings {
  try {
    return parseAudioSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseAudioSettings(null);
  }
}

function saveAudioSettings(s: AudioSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode etc.): settings just won't persist.
  }
}

/**
 * The volume settings in the menu (#audio in index.html, see GameMenu):
 * master, music, ambience and effects sliders plus mute. M toggles mute
 * anywhere; the menu button shows a muted badge. Changes apply live and are
 * saved to localStorage.
 */
export class VolumeControl {
  private readonly root = document.getElementById('audio')!;
  private readonly menuButton = document.getElementById('menu-toggle');
  private readonly muteBtn = document.getElementById('audio-mute') as HTMLButtonElement;
  private readonly sliders = SLIDERS.map((key) => ({
    key,
    input: this.root.querySelector<HTMLInputElement>(`input[data-key="${key}"]`)!,
    value: this.root.querySelector<HTMLElement>(`output[data-key="${key}"]`)!,
  }));

  constructor(
    private readonly audio: AudioManager,
    private settings: AudioSettings,
  ) {
    for (const s of this.sliders) {
      s.input.value = String(settings[s.key]);
      s.input.addEventListener('input', this.onSlider);
    }
    this.muteBtn.addEventListener('click', this.onMute);
    window.addEventListener('keydown', this.onKey);
    this.render();
  }

  dispose(): void {
    for (const s of this.sliders) s.input.removeEventListener('input', this.onSlider);
    this.muteBtn.removeEventListener('click', this.onMute);
    window.removeEventListener('keydown', this.onKey);
  }

  private update(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.audio.apply(this.settings);
    saveAudioSettings(this.settings);
    this.render();
  }

  private render(): void {
    const { muted } = this.settings;
    for (const s of this.sliders) s.value.textContent = `${Math.round(this.settings[s.key] * 100)}%`;
    this.root.classList.toggle('muted', muted);
    this.menuButton?.classList.toggle('muted', muted);
    this.muteBtn.textContent = muted ? 'Unmute (M)' : 'Mute (M)';
    this.muteBtn.setAttribute('aria-pressed', String(muted));
  }

  private onSlider = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const key = input.dataset.key as (typeof SLIDERS)[number];
    // Moving a slider while muted means you want to hear it.
    this.update({ [key]: Number(input.value), muted: false });
  };

  private onMute = () => {
    this.update({ muted: !this.settings.muted });
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyM' && !e.repeat) this.onMute();
  };
}
