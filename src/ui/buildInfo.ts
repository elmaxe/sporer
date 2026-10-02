/**
 * Which build is running, for the menu's footer. The values are baked in by
 * vite.config.ts (`__BUILD_INFO__`): in GitHub Actions the branch, run number,
 * commit and Pages folder of the workflow; elsewhere the local git branch and commit, with
 * no build number (a dev server or a local build).
 */
export interface BuildInfo {
  /** Git branch, or null if unknown. */
  branch: string | null;
  /** The CI run number, or null for a local build or the dev server. */
  build: string | null;
  /** Short commit hash, or null if unknown. */
  commit: string | null;
  /** True when served by the dev server. */
  dev: boolean;
  /**
   * Where this build sits on the GitHub Pages site, from its root: '' for the
   * release, 'preview/' for main, 'pr/<n>/' for a pull request (see
   * versions.ts), or null for a build that isn't published there.
   */
  pagesPath: string | null;
}

declare const __BUILD_INFO__: BuildInfo;

export const buildInfo: BuildInfo = __BUILD_INFO__;

/** One line for the menu, e.g. "main · build 42 · a1b2c3d" or "claude/x · dev · a1b2c3d". */
export function formatBuildInfo(info: BuildInfo): string {
  const parts = [info.branch ?? 'unknown branch'];
  parts.push(info.build !== null ? `build ${info.build}` : info.dev ? 'dev' : 'local build');
  if (info.commit) parts.push(info.commit);
  return parts.join(' · ');
}
