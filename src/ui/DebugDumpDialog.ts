import { clampMark, markNear, type DumpMark } from '../debug/dumpFormat';

/** What the player chose in the dialog. */
export interface DumpChoice {
  action: 'save' | 'share' | 'cancel';
  note: string;
  marks: DumpMark[];
}

/** How close (in picture widths) a tap must be to a mark to remove it rather than add one. */
const HIT_RADIUS = 0.04;

/**
 * The debug dump's dialog (#dump in index.html, over the menu): the
 * screenshot to tap on to mark the problem (numbered rings; tapping one
 * removes it), a note, and Share (where the device can share files, e.g. a
 * phone), Save file and Cancel. Keys typed here don't reach the game (M
 * would mute, N fold the map). `ask` resolves with the choice; `status`
 * shows progress while the file is made.
 */
export class DebugDumpDialog {
  private readonly root = document.getElementById('dump')!;
  private readonly picture = document.getElementById('dump-picture')!;
  private readonly image = document.getElementById('dump-image') as HTMLImageElement;
  private readonly marksEl = document.getElementById('dump-marks')!;
  private readonly note = document.getElementById('dump-note') as HTMLTextAreaElement;
  private readonly share = document.getElementById('dump-share') as HTMLButtonElement;
  private readonly save = document.getElementById('dump-save') as HTMLButtonElement;
  private readonly cancel = document.getElementById('dump-cancel') as HTMLButtonElement;
  private readonly close = document.getElementById('dump-close') as HTMLButtonElement;
  private readonly clear = document.getElementById('dump-clear') as HTMLButtonElement;
  private readonly statusEl = document.getElementById('dump-status')!;
  private marks: DumpMark[] = [];
  private resolve: ((choice: DumpChoice) => void) | null = null;

  constructor() {
    this.picture.addEventListener('click', this.onPicture);
    this.share.addEventListener('click', this.onShare);
    this.save.addEventListener('click', this.onSave);
    this.cancel.addEventListener('click', this.onCancel);
    this.close.addEventListener('click', this.onCancel);
    this.clear.addEventListener('click', this.onClear);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /**
   * Shows `src` (the screen) and waits for the player. `canShare`: offer the
   * Share button. The dialog stays open (buttons disabled) until `hide`.
   */
  ask(src: string, canShare: boolean): Promise<DumpChoice> {
    this.marks = [];
    this.renderMarks();
    this.note.value = '';
    this.image.src = src;
    this.share.hidden = !canShare;
    // Where sharing works (phones), it's the way to get the file to someone; saving is the fallback.
    this.save.classList.toggle('primary', !canShare);
    this.setBusy(false);
    this.status('');
    this.root.hidden = false;
    // Captured at the window, before the game's own key handlers (typing still reaches the note).
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.stopKey, true);
    return new Promise((resolve) => (this.resolve = resolve));
  }

  /** A line under the buttons (e.g. "Saving…", or what went wrong). */
  status(text: string): void {
    this.statusEl.textContent = text;
    this.statusEl.hidden = !text;
  }

  setBusy(busy: boolean): void {
    for (const b of [this.share, this.save, this.cancel, this.close, this.clear]) b.disabled = busy;
  }

  hide(): void {
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.stopKey, true);
    this.image.removeAttribute('src');
    (document.activeElement as HTMLElement | null)?.blur();
  }

  dispose(): void {
    this.hide();
    this.picture.removeEventListener('click', this.onPicture);
    this.share.removeEventListener('click', this.onShare);
    this.save.removeEventListener('click', this.onSave);
    this.cancel.removeEventListener('click', this.onCancel);
    this.close.removeEventListener('click', this.onCancel);
    this.clear.removeEventListener('click', this.onClear);
  }

  /** Waits for the next button after a save or share that didn't go through (the marks and note are kept). */
  next(): Promise<DumpChoice> {
    return new Promise((resolve) => (this.resolve = resolve));
  }

  private finish(action: DumpChoice['action']): void {
    const resolve = this.resolve;
    if (!resolve) return;
    this.resolve = null;
    // Cancelling closes at once; saving keeps the dialog up (busy) while the file is made.
    if (action === 'cancel') this.hide();
    else this.setBusy(true);
    resolve({ action, note: this.note.value, marks: this.marks.slice() });
  }

  private renderMarks(): void {
    this.marksEl.replaceChildren(
      ...this.marks.map((m, i) => {
        const el = document.createElement('div');
        el.className = 'dump-mark';
        el.style.left = `${m.x * 100}%`;
        el.style.top = `${m.y * 100}%`;
        el.appendChild(document.createElement('span')).textContent = String(i + 1);
        return el;
      }),
    );
    this.clear.hidden = this.marks.length === 0;
  }

  private onPicture = (e: MouseEvent) => {
    const r = this.image.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const hit = markNear(this.marks, x, y, HIT_RADIUS, r.height / r.width);
    if (hit >= 0) this.marks.splice(hit, 1);
    else this.marks.push(clampMark(x, y));
    this.renderMarks();
  };

  private onShare = () => this.finish('share');

  private onSave = () => this.finish('save');

  private onCancel = () => this.finish('cancel');

  private onClear = () => {
    this.marks = [];
    this.renderMarks();
  };

  private onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.code === 'Escape') {
      e.preventDefault();
      this.onCancel();
    }
  };

  private stopKey = (e: KeyboardEvent) => e.stopPropagation();
}
