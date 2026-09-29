import type { Input } from '../core/Input';

/**
 * A level's controls help in the shared #hud-help line, in mouse/keyboard
 * or touch wording to match how the player is playing.
 */
export class HelpText {
  private readonly el = document.getElementById('hud-help')!;
  private shown: string | null = null;

  constructor(
    private readonly input: Input,
    private readonly mouse: string,
    private readonly touch: string,
  ) {}

  /** Writes the help if the input mode changed; `force` after another level's HUD wrote the line. */
  refresh(force = false): void {
    const text = this.input.touchMode ? this.touch : this.mouse;
    if (!force && text === this.shown) return;
    this.shown = text;
    this.el.textContent = text;
  }
}
