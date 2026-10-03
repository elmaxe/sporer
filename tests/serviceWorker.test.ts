import { describe, expect, it } from 'vitest';
import { staleScopes } from '../src/pwa/serviceWorker';

describe('staleScopes', () => {
  const root = 'https://elmaxe.github.io/sporer/';

  it("picks the workers of versions that aren't on the site any more", () => {
    const scopes = [root, `${root}preview/`, `${root}pr/12/`, `${root}pr/13/`];
    expect(staleScopes(root, ['', 'preview/', 'pr/13/'], scopes)).toEqual([`${root}pr/12/`]);
  });

  it('leaves alone anything that is not a version folder of this site', () => {
    const scopes = [`${root}pr/`, `${root}other/`, `${root}pr/12/x/`, 'https://elmaxe.github.io/other/', 'https://elmaxe.github.io/'];
    expect(staleScopes(root, ['', 'preview/'], scopes)).toEqual([]);
  });

  it('always keeps the release and the preview', () => {
    expect(staleScopes(root, ['pr/1/'], [root, `${root}preview/`, `${root}pr/1/`])).toEqual([]);
  });
});
