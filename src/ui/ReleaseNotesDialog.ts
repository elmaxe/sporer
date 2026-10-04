import { buildInfo, formatBuildInfo } from './buildInfo';
import {
  formatReleaseDate,
  isUpdate,
  loadReleases,
  loadSeenRelease,
  parseNotes,
  saveSeenRelease,
  type NoteBlock,
  type NoteSpan,
  type Release,
} from './releaseNotes';
import { currentSiteRoot } from './versions';

/** How long after the start the "updated" notice comes up (once the HUD is drawn), and how long it stays, ms. */
const NOTICE_DELAY_MS = 1500;
const NOTICE_MS = 20000;

/**
 * The game's release notes (releaseNotes.ts), shown in three places:
 * - the menu's What's new section (#menu-notes-section in index.html): the
 *   latest release and a Release notes button, hidden until the list loads;
 * - the dialog that button opens (#notes, over the menu): every release,
 *   newest first, with the one playing marked, and a line saying so when the
 *   build playing isn't a release (preview, pull request, dev);
 * - a notice at the top (#notes-notice) when the game starts on a release
 *   other than the one played last, "Updated to …", whose What's new button
 *   opens the menu and the dialog (on touch, where the HUD is at the top, just
 *   under the HUD). It goes away by itself.
 * The list loads the first time the menu opens (GameMenu calls `refresh`).
 * Keys typed in the dialog don't reach the game; Esc closes it.
 */
export class ReleaseNotesDialog {
  private readonly section = document.getElementById('menu-notes-section')!;
  private readonly latest = document.getElementById('menu-notes-latest')!;
  private readonly openButton = document.getElementById('menu-notes') as HTMLButtonElement;
  private readonly root = document.getElementById('notes')!;
  private readonly close = document.getElementById('notes-close') as HTMLButtonElement;
  private readonly buildLine = document.getElementById('notes-build')!;
  private readonly list = document.getElementById('notes-list')!;
  private readonly notice = document.getElementById('notes-notice')!;
  private readonly noticeText = document.getElementById('notes-notice-text')!;
  private readonly noticeOpen = document.getElementById('notes-notice-open') as HTMLButtonElement;
  private readonly noticeClose = document.getElementById('notes-notice-close') as HTMLButtonElement;
  /** The tag of the release playing, or null for any other build. */
  private readonly playing = buildInfo.pagesPath === '' ? buildInfo.branch : null;
  private releases: Release[] | null = null;
  private loading: Promise<void> | null = null;
  private noticeTimer = 0;

  /** `openMenu`: opens the game's menu, under the dialog, for the notice's button. */
  constructor(private readonly openMenu: () => void) {
    this.section.hidden = true;
    this.root.hidden = true;
    this.notice.hidden = true;
    this.openButton.addEventListener('click', this.onOpen);
    this.close.addEventListener('click', this.onClose);
    this.root.addEventListener('click', this.onBackdrop);
    this.noticeOpen.addEventListener('click', this.onNoticeOpen);
    this.noticeClose.addEventListener('click', this.hideNotice);
    const { playing } = this;
    if (playing === null) return;
    const seen = loadSeenRelease();
    if (isUpdate(playing, seen)) this.noticeTimer = window.setTimeout(() => this.showNotice(playing), NOTICE_DELAY_MS);
    else if (seen === null) saveSeenRelease(playing);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Loads the list if it isn't yet (once per visit; again only after a failure). */
  refresh(): Promise<void> {
    if (this.releases !== null) return Promise.resolve();
    this.loading ??= loadReleases(currentSiteRoot()).then((releases) => {
      this.loading = null;
      if (releases === null) {
        if (this.isOpen) this.list.replaceChildren(paragraph("The release notes can't be loaded right now (offline?)."));
        return;
      }
      this.releases = releases;
      this.render();
    });
    return this.loading;
  }

  open(): void {
    if (this.isOpen) return;
    this.hideNotice();
    if (this.playing !== null) saveSeenRelease(this.playing);
    this.render();
    this.root.hidden = false;
    this.list.scrollTop = 0;
    // Captured at the window, before the game's and the menu's own key handlers.
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.stopKey, true);
    this.close.focus({ preventScroll: true });
    void this.refresh();
  }

  hide(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.stopKey, true);
    this.openButton.focus({ preventScroll: true });
  }

  dispose(): void {
    this.hide();
    this.hideNotice();
    this.openButton.removeEventListener('click', this.onOpen);
    this.close.removeEventListener('click', this.onClose);
    this.root.removeEventListener('click', this.onBackdrop);
    this.noticeOpen.removeEventListener('click', this.onNoticeOpen);
    this.noticeClose.removeEventListener('click', this.hideNotice);
  }

  /** Told once: dismissing the notice counts as seeing the notes. */
  private showNotice(tag: string): void {
    saveSeenRelease(tag);
    this.noticeText.textContent = `Updated to ${tag}`;
    const hud = document.getElementById('hud');
    const touch = document.documentElement.classList.contains('touch');
    this.notice.style.top = touch && hud ? `${Math.round(hud.getBoundingClientRect().bottom) + 8}px` : '';
    this.notice.hidden = false;
    this.noticeTimer = window.setTimeout(this.hideNotice, NOTICE_MS);
  }

  private hideNotice = () => {
    clearTimeout(this.noticeTimer);
    this.notice.hidden = true;
  };

  private render(): void {
    const releases = this.releases;
    this.section.hidden = releases === null;
    if (releases === null) {
      this.list.replaceChildren(paragraph('Loading the release notes…'));
      this.buildLine.hidden = true;
      return;
    }
    const newest = releases[0];
    this.latest.textContent = `Latest: ${newest.name}, ${formatReleaseDate(newest.date)}.`;
    const isRelease = releases.some((r) => r.tag === this.playing);
    this.buildLine.hidden = isRelease;
    this.buildLine.textContent = `You're playing ${formatBuildInfo(buildInfo)}, not a release: it may have changes these notes don't list yet.`;
    this.list.replaceChildren(...releases.map((r) => this.renderRelease(r)));
  }

  private renderRelease(release: Release): HTMLElement {
    const article = document.createElement('article');
    article.className = 'notes-release';
    const head = article.appendChild(document.createElement('h3'));
    const title = head.appendChild(document.createElement('a'));
    title.textContent = release.name;
    title.href = release.url;
    title.target = '_blank';
    title.rel = 'noopener';
    if (release.tag === this.playing) {
      const badge = head.appendChild(document.createElement('span'));
      badge.className = 'notes-playing';
      badge.textContent = 'Playing';
    }
    const date = head.appendChild(document.createElement('time'));
    date.dateTime = release.date;
    date.textContent = formatReleaseDate(release.date);
    const blocks = parseNotes(release.body);
    if (blocks.length === 0) article.appendChild(paragraph('No notes.'));
    let list: HTMLUListElement | null = null;
    for (const block of blocks) {
      if (block.kind === 'item') {
        list ??= article.appendChild(document.createElement('ul'));
        list.appendChild(renderBlock('li', block));
      } else {
        list = null;
        article.appendChild(renderBlock(block.kind === 'heading' ? 'h4' : 'p', block));
      }
    }
    return article;
  }

  private onOpen = () => this.open();

  private onClose = () => this.hide();

  private onBackdrop = (e: MouseEvent) => {
    if (e.target === this.root) this.hide();
  };

  private onNoticeOpen = () => {
    this.openMenu();
    this.open();
  };

  private onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.code === 'Escape') {
      e.preventDefault();
      this.hide();
    }
  };

  private stopKey = (e: KeyboardEvent) => e.stopPropagation();
}

function paragraph(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function renderBlock<K extends 'li' | 'h4' | 'p'>(tag: K, block: NoteBlock): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.append(...block.spans.map(renderSpan));
  return el;
}

/** Text only through textContent and links only to http(s), so nothing in the notes runs as HTML. */
function renderSpan(span: NoteSpan): Node {
  if (span.href) {
    const a = document.createElement('a');
    a.href = span.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = span.text;
    return a;
  }
  if (span.strong || span.code) {
    const el = document.createElement(span.strong ? 'strong' : 'code');
    el.textContent = span.text;
    return el;
  }
  return document.createTextNode(span.text);
}
