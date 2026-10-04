import { describe, expect, it } from 'vitest';
import { formatReleaseDate, isUpdate, parseInline, parseNotes, parseReleases } from '../src/ui/releaseNotes';

describe('parseReleases', () => {
  it('reads the releases.json scripts/pages-publish.sh writes, newest first', () => {
    const releases = parseReleases({
      releases: [
        { tag: 'v1', name: 'v1', date: '2026-10-02T15:30:32Z', url: 'https://github.com/elmaxe/sporer/releases/tag/v1', body: 'First release' },
        { tag: 'v2', name: 'Second', date: '2026-10-03T08:33:54Z', url: 'https://github.com/elmaxe/sporer/releases/tag/v2', body: '* x' },
      ],
    });
    expect(releases.map((r) => r.tag)).toEqual(['v2', 'v1']);
    expect(releases[0]).toEqual({ tag: 'v2', name: 'Second', date: '2026-10-03T08:33:54Z', url: 'https://github.com/elmaxe/sporer/releases/tag/v2', body: '* x' });
  });

  it("reads GitHub's API, skipping drafts", () => {
    const releases = parseReleases([
      { tag_name: 'v3', name: null, published_at: null, html_url: 'https://github.com/elmaxe/sporer/releases/tag/v3', body: 'draft', draft: true },
      { tag_name: 'v2', name: '', published_at: '2026-10-03T08:33:54Z', html_url: 'https://github.com/elmaxe/sporer/releases/tag/v2', body: null, draft: false },
    ]);
    expect(releases).toEqual([{ tag: 'v2', name: 'v2', date: '2026-10-03T08:33:54Z', url: 'https://github.com/elmaxe/sporer/releases/tag/v2', body: '' }]);
  });

  it('skips anything that is not a release and makes up a link that is not https', () => {
    expect(parseReleases(null)).toEqual([]);
    expect(parseReleases({ releases: 'no' })).toEqual([]);
    const releases = parseReleases({ releases: [null, { tag: 'v1' }, { tag: 'v2', date: 'soon' }, { tag: 'v3', date: '2026-10-02T00:00:00Z', url: 'javascript:alert(1)' }] });
    expect(releases).toHaveLength(1);
    expect(releases[0].url).toBe('https://github.com/elmaxe/sporer/releases/tag/v3');
  });
});

describe('parseInline', () => {
  it('splits text, bold, code and links', () => {
    expect(parseInline('a **b** `c` [d](https://e.com) f')).toEqual([
      { text: 'a ' },
      { text: 'b', strong: true },
      { text: ' ' },
      { text: 'c', code: true },
      { text: ' ' },
      { text: 'd', href: 'https://e.com' },
      { text: ' f' },
    ]);
  });

  it("shortens this repository's pull requests and issues to their number, and leaves a full stop out of a link", () => {
    expect(parseInline('See https://github.com/elmaxe/sporer/pull/91.')).toEqual([
      { text: 'See ' },
      { text: '#91', href: 'https://github.com/elmaxe/sporer/pull/91' },
      { text: '.' },
    ]);
    expect(parseInline('https://github.com/other/repo/issues/4')).toEqual([{ text: 'https://github.com/other/repo/issues/4', href: 'https://github.com/other/repo/issues/4' }]);
  });

  it('never links anything but http(s)', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ text: '[x](javascript:alert(1))' }]);
  });
});

describe('parseNotes', () => {
  it("turns GitHub's generated notes into items with the pull request's number", () => {
    const body =
      "## What's Changed\r\n* Volcano bomb: a second weapon by @elmaxe in https://github.com/elmaxe/sporer/pull/91\r\n* Fix by @dependabot[bot] in https://github.com/elmaxe/sporer/pull/92\r\n\r\n## New Contributors\r\n* @someone made their first contribution in https://github.com/elmaxe/sporer/pull/93\r\n\r\n**Full Changelog**: https://github.com/elmaxe/sporer/compare/v1...v2";
    expect(parseNotes(body)).toEqual([
      { kind: 'item', spans: [{ text: 'Volcano bomb: a second weapon ' }, { text: '#91', href: 'https://github.com/elmaxe/sporer/pull/91' }] },
      { kind: 'item', spans: [{ text: 'Fix ' }, { text: '#92', href: 'https://github.com/elmaxe/sporer/pull/92' }] },
    ]);
  });

  it('keeps headings, paragraphs (lines joined) and hand-written items', () => {
    expect(parseNotes('First release\nof the game.\n\n### Ships\n- Faster\n- Shinier')).toEqual([
      { kind: 'paragraph', spans: [{ text: 'First release of the game.' }] },
      { kind: 'heading', spans: [{ text: 'Ships' }] },
      { kind: 'item', spans: [{ text: 'Faster' }] },
      { kind: 'item', spans: [{ text: 'Shinier' }] },
    ]);
  });

  it('gives nothing for empty notes', () => {
    expect(parseNotes('')).toEqual([]);
  });
});

describe('isUpdate', () => {
  it('tells only a returning player, playing a release other than the last one seen', () => {
    expect(isUpdate('v2', 'v1')).toBe(true);
    expect(isUpdate('v2', 'v2')).toBe(false);
    expect(isUpdate('v2', null)).toBe(false);
    expect(isUpdate(null, 'v1')).toBe(false);
  });
});

describe('formatReleaseDate', () => {
  it('gives the day of the release, in UTC', () => {
    expect(formatReleaseDate('2026-10-03T23:59:00Z', 'en-GB')).toBe('3 Oct 2026');
  });
});
