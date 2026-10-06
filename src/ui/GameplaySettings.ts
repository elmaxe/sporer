import { DEFAULT_TERRAFORM_MODE, TERRAFORM_MODES, type TerraformMode } from '../gen/terraform';

const STORAGE_KEY = 'spore2.gameplay';

/** Player-facing gameplay settings (the menu's Gameplay section). */
export interface GameplaySettings {
  /** How terraforming plays (gen/terraform.ts TERRAFORM_TUNING): Sandbox, Relaxed (the default) or Real. */
  terraform: TerraformMode;
}

export function defaultGameplaySettings(): GameplaySettings {
  return { terraform: DEFAULT_TERRAFORM_MODE };
}

/** Settings from stored JSON; anything missing or malformed falls back to the defaults. */
export function parseGameplaySettings(json: string | null): GameplaySettings {
  const out = defaultGameplaySettings();
  if (!json) return out;
  try {
    const raw: unknown = JSON.parse(json);
    if (typeof raw === 'object' && raw !== null) {
      const { terraform } = raw as Record<string, unknown>;
      if (typeof terraform === 'string' && (TERRAFORM_MODES as readonly string[]).includes(terraform)) out.terraform = terraform as TerraformMode;
    }
  } catch {
    // Keep the defaults.
  }
  return out;
}

export function loadGameplaySettings(): GameplaySettings {
  try {
    return parseGameplaySettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return defaultGameplaySettings();
  }
}

function saveGameplaySettings(s: GameplaySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: the setting just won't persist.
  }
}

export const TERRAFORM_MODE_LABEL: Record<TerraformMode, string> = { sandbox: 'Sandbox', relaxed: 'Relaxed', real: 'Real' };

const TERRAFORM_MODE_HINT: Record<TerraformMode, string> = {
  sandbox: 'The magic rays and no limits; quick to settle, no leaks, free.',
  relaxed: 'Quicker to settle and forgiving: no leaks.',
  real: 'As designed: slower to settle, and small worlds leak their air.',
};

/** The next mode for the button that cycles them. */
export function nextTerraformMode(mode: TerraformMode): TerraformMode {
  return TERRAFORM_MODES[(TERRAFORM_MODES.indexOf(mode) + 1) % TERRAFORM_MODES.length]!;
}

/**
 * The menu's Gameplay section (#gameplay-terraform in index.html): the
 * Terraforming: Sandbox / Relaxed / Real button, which cycles the mode;
 * applied at once (from now on, every body's log plays on in it) and
 * saved to localStorage.
 */
export class GameplaySettingsControl {
  private readonly button = document.getElementById('gameplay-terraform') as HTMLButtonElement;
  private readonly hint = document.getElementById('gameplay-terraform-hint');

  constructor(
    private settings: GameplaySettings,
    private readonly apply: (s: GameplaySettings) => void,
  ) {
    this.button.addEventListener('click', this.onClick);
    this.render();
  }

  dispose(): void {
    this.button.removeEventListener('click', this.onClick);
  }

  private render(): void {
    this.button.textContent = `Terraforming: ${TERRAFORM_MODE_LABEL[this.settings.terraform]}`;
    if (this.hint) this.hint.textContent = TERRAFORM_MODE_HINT[this.settings.terraform];
  }

  private onClick = () => {
    this.settings = { ...this.settings, terraform: nextTerraformMode(this.settings.terraform) };
    this.apply(this.settings);
    saveGameplaySettings(this.settings);
    this.render();
  };
}
