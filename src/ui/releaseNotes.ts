/**
 * The game's release notes, for the menu's What's new section and dialog
 * (ReleaseNotesDialog.ts): the notes of its GitHub Releases. The Pages site
 * keeps them in releases.json at its root (written by scripts/pages-publish.sh
 * at each publish, and when a release is published or edited); a build
 * outside the site (dev server, local build), or one whose site has no list
 * yet, asks GitHub's API instead. Offline, the service worker hands out the
 * last releases.json seen.
 *
 * A release's notes are GitHub's Markdown, usually the list GitHub writes for
 * it ("* Volcano bomb by @someone in https://github.com/…/pull/91"); parseNotes
 * turns that into plain blocks to draw: headings, paragraphs and list items,
 * the pull request's link shortened to its number.
 */
export interface Release {
  /** The tag, e.g. 'v2026.10.03.3'. */
  tag: string;
  /** The release's title (its tag when it has none). */
  name: string;
  /** When it was published, ISO 8601. */
  date: string;
  /** Its page on GitHub. */
  url: string;
  /** The notes, GitHub Markdown. */
  body: string;
}

/** A run of text in a block: plain, bold, code, or a link. */
export interface NoteSpan {
  text: string;
  href?: string;
  strong?: boolean;
  code?: boolean;
}

export interface NoteBlock {
  kind: 'heading' | 'paragraph' | 'item';
  spans: NoteSpan[];
}

/** The repository the releases are on. */
export const REPO = 'elmaxe/sporer';
const API_URL = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
const STORAGE_KEY = 'spore2.notesSeen';
/** How long to wait for the list before giving up on it, ms. */
const FETCH_TIMEOUT_MS = 5000;

const isText = (v: unknown): v is string => typeof v === 'string';

/**
 * The releases in a releases.json ({releases: [{tag, name, date, url, body}]})
 * or GitHub's API (an array of {tag_name, name, published_at, html_url, body,
 * draft}), newest first, skipping drafts and anything that isn't a release.
 */
export function parseReleases(data: unknown): Release[] {
  const list = Array.isArray(data) ? data : (data as { releases?: unknown } | null)?.releases;
  if (!Array.isArray(list)) return [];
  const releases: Release[] = [];
  for (const item of list) {
    const o = item as Record<string, unknown> | null;
    if (!o || o.draft === true) continue;
    const tag = o.tag ?? o.tag_name;
    const date = o.date ?? o.published_at;
    if (!isText(tag) || !tag || !isText(date) || Number.isNaN(Date.parse(date))) continue;
    const url = o.url ?? o.html_url;
    releases.push({
      tag,
      name: isText(o.name) && o.name.trim() ? o.name.trim() : tag,
      date,
      url: isText(url) && /^https:\/\//.test(url) ? url : `https://github.com/${REPO}/releases/tag/${encodeURIComponent(tag)}`,
      body: isText(o.body) ? o.body : '',
    });
  }
  return releases.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

/** A link to a pull request or issue of this repository, as its number ('#91'), else null. */
function shortLink(url: string): string | null {
  const m = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:pull|issues)\/(\d+)\/?$/.exec(url);
  return m && m[1].toLowerCase() === REPO ? `#${m[2]}` : null;
}

const INLINE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*(.+?)\*\*|`([^`]+)`|(https?:\/\/[^\s)<>]+)/g;

/** A line's text split into plain text, bold, code and links (only http(s) ones). */
export function parseInline(text: string): NoteSpan[] {
  const spans: NoteSpan[] = [];
  const plain = (s: string) => {
    if (!s) return;
    const last = spans[spans.length - 1];
    if (last && !last.href && !last.strong && !last.code) last.text += s;
    else spans.push({ text: s });
  };
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    plain(text.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[1] !== undefined) spans.push({ text: m[1], href: m[2] });
    else if (m[3] !== undefined) spans.push({ text: m[3], strong: true });
    else if (m[4] !== undefined) spans.push({ text: m[4], code: true });
    else {
      // A sentence's full stop or comma after a bare link isn't part of it.
      const url = m[5].replace(/[.,;:!?]+$/, '');
      spans.push({ text: shortLink(url) ?? url, href: url });
      plain(m[5].slice(url.length));
    }
  }
  plain(text.slice(at));
  return spans;
}

/** GitHub's own headings and lines that mean nothing in the game. */
const SKIP_HEADING = /^(what's changed|new contributors)$/i;
const SKIP_LINE = /^\*\*full changelog\*\*|made their first contribution in /i;
/** GitHub's generated item: "<title> by @<author> in <pull request URL>". */
const GENERATED_ITEM = /^(.*?)\s+by\s+@[\w-]+(?:\[bot\])?\s+in\s+(https:\/\/\S+)$/;

/** A release's Markdown notes as blocks to draw. */
export function parseNotes(body: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', spans: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || SKIP_LINE.test(line)) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^[*-]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      if (!SKIP_HEADING.test(heading[1].trim())) blocks.push({ kind: 'heading', spans: parseInline(heading[1]) });
    } else if (item) {
      flush();
      const generated = GENERATED_ITEM.exec(item[1]);
      const text = generated ? `${generated[1]} ${generated[2]}` : item[1];
      blocks.push({ kind: 'item', spans: parseInline(text) });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** The list from `url`, or null if it can't be had. */
async function fetchReleases(url: string): Promise<Release[] | null> {
  try {
    const res = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const releases = parseReleases(await res.json());
    return releases.length ? releases : null;
  } catch {
    return null;
  }
}

/** The releases, from the site at `root` (null: not on the site) or else GitHub's API; null if neither answers. */
export async function loadReleases(root: string | null): Promise<Release[] | null> {
  return (root !== null ? await fetchReleases(`${root}releases.json`) : null) ?? (await fetchReleases(API_URL));
}

/** The tag of the release whose notes the player saw last, or null. */
export function loadSeenRelease(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveSeenRelease(tag: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, tag);
  } catch {
    // Private mode or storage off: the notice may show again next time.
  }
}

/**
 * Whether to tell the player, as the game starts, that it has been updated:
 * playing a release (`playing`, its tag) other than the one seen last. Someone
 * playing for the first time (nothing seen) isn't told.
 */
export function isUpdate(playing: string | null, seen: string | null): boolean {
  return playing !== null && seen !== null && playing !== seen;
}

/** e.g. '3 Oct 2026'. */
export function formatReleaseDate(date: string, locale?: string): string {
  return new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
