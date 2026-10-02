import { describe, expect, it } from 'vitest';
import { parseVersions, siteRoot, versionId, versionUrl } from '../src/ui/versions';

describe('versionId', () => {
  it('names the release, the preview and pull requests by their folder', () => {
    expect(versionId('')).toBe('release');
    expect(versionId('preview/')).toBe('preview');
    expect(versionId('pr/12/')).toBe('pr-12');
  });
});

describe('siteRoot', () => {
  it('finds the root from a page in each kind of folder', () => {
    expect(siteRoot('https://elmaxe.github.io/sporer/', '')).toBe('https://elmaxe.github.io/sporer/');
    expect(siteRoot('https://elmaxe.github.io/sporer/index.html?seed=4', '')).toBe('https://elmaxe.github.io/sporer/');
    expect(siteRoot('https://elmaxe.github.io/sporer/preview/?star=3', 'preview/')).toBe('https://elmaxe.github.io/sporer/');
    expect(siteRoot('https://elmaxe.github.io/sporer/pr/12/index.html', 'pr/12/')).toBe('https://elmaxe.github.io/sporer/');
  });

  it('gives up when the page is not in the folder the build says', () => {
    expect(siteRoot('https://elmaxe.github.io/sporer/', 'pr/12/')).toBeNull();
    expect(siteRoot('https://elmaxe.github.io/sporer/pr/120/', 'pr/12/')).toBeNull();
  });
});

describe('parseVersions', () => {
  const release = { id: 'release', label: 'Release v1', path: '', ref: 'v1', commit: 'a1b2c3d', date: '2026-10-02T00:00:00Z' };
  const pr = { id: 'pr-3', label: 'PR #3: Foo', path: 'pr/3/', ref: 'foo', commit: 'b2c3d4e', date: '2026-10-02T00:00:00Z' };

  it('reads the list scripts/pages-publish.sh writes', () => {
    expect(parseVersions({ versions: [release, pr] })).toEqual([release, pr]);
  });

  it('skips anything that is not a version, and paths that leave the site', () => {
    expect(parseVersions(null)).toEqual([]);
    expect(parseVersions({ versions: 'x' })).toEqual([]);
    expect(parseVersions({ versions: [release, { id: 'x' }, { ...pr, path: '../x/' }, { ...pr, path: 'https://evil/' }, { ...pr, path: 'pr/3' }] })).toEqual([release]);
  });
});

describe('versionUrl', () => {
  it('keeps the query', () => {
    const pr = { id: 'pr-3', label: '', path: 'pr/3/', ref: '', commit: '', date: '' };
    expect(versionUrl('https://elmaxe.github.io/sporer/', pr, '?seed=4&star=2')).toBe('https://elmaxe.github.io/sporer/pr/3/?seed=4&star=2');
  });
});
