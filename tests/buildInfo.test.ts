import { describe, expect, it } from 'vitest';
import { buildInfo, formatBuildInfo } from '../src/ui/buildInfo';

describe('formatBuildInfo', () => {
  it('shows the branch, the CI build number and the commit', () => {
    expect(formatBuildInfo({ branch: 'main', build: '42', commit: 'a1b2c3d', dev: false })).toBe('main · build 42 · a1b2c3d');
  });

  it('says dev or local build when there is no build number', () => {
    expect(formatBuildInfo({ branch: 'claude/x', build: null, commit: 'a1b2c3d', dev: true })).toBe('claude/x · dev · a1b2c3d');
    expect(formatBuildInfo({ branch: 'main', build: null, commit: 'a1b2c3d', dev: false })).toBe('main · local build · a1b2c3d');
  });

  it('copes with no git at all', () => {
    expect(formatBuildInfo({ branch: null, build: null, commit: null, dev: false })).toBe('unknown branch · local build');
  });

  it('is baked in by the Vite config', () => {
    expect(typeof buildInfo.dev).toBe('boolean');
  });
});
