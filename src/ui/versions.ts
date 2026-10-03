import { availableOffline, registrationStarted } from '../pwa/serviceWorker';
import { buildInfo } from './buildInfo';

/**
 * The versions of the game on the GitHub Pages site, for the menu's version
 * picker (VersionPicker.ts): the release at the site's root, main's preview in
 * preview/, each open pull request in pr/<n>/. They're listed in the root's
 * versions.json, written by scripts/pages-publish.sh when one is published.
 * Every build knows where it sits (buildInfo.pagesPath), so it can find the
 * root from its own URL.
 *
 * The version picked is remembered, and an installed app (which always starts
 * at the root, the release) goes straight on to it: openChosenVersion().
 * Offline, the list is the last one seen (the service worker keeps it) and
 * the app goes on only to a version saved on the device.
 */
export interface SiteVersion {
  /** 'release', 'preview' or 'pr-<n>'. */
  id: string;
  /** e.g. 'Release v1.2.0', 'Preview (main)', 'PR #12: Gas giants'. */
  label: string;
  /** Folder from the site's root: '', 'preview/', 'pr/<n>/'. */
  path: string;
  /** Tag or branch it was built from. */
  ref: string;
  /** Short commit hash. */
  commit: string;
  /** When it was published, ISO 8601. */
  date: string;
}

const STORAGE_KEY = 'spore2.version';
/** How long to wait for versions.json before giving up on it, ms. */
const FETCH_TIMEOUT_MS = 3000;

/** The id of the version at a folder path: '' → 'release', 'preview/' → 'preview', 'pr/12/' → 'pr-12'. */
export function versionId(pagesPath: string): string {
  if (pagesPath === '') return 'release';
  return pagesPath.replace(/\/$/, '').replace('/', '-');
}

/**
 * The site's root URL from a page of a build at `pagesPath` (e.g. 'pr/12/'),
 * or null if the page isn't in such a folder.
 */
export function siteRoot(pageUrl: string, pagesPath: string): string | null {
  const folder = new URL('.', pageUrl);
  if (!folder.pathname.endsWith(`/${pagesPath}`)) return null;
  return `${folder.origin}${folder.pathname.slice(0, folder.pathname.length - pagesPath.length)}`;
}

/** The versions listed in a versions.json, skipping any entry that isn't one. */
export function parseVersions(data: unknown): SiteVersion[] {
  const list = (data as { versions?: unknown } | null)?.versions;
  if (!Array.isArray(list)) return [];
  return list.filter((v): v is SiteVersion => {
    const o = v as Record<string, unknown> | null;
    return typeof o?.id === 'string' && typeof o.label === 'string' && typeof o.path === 'string' && /^(|[\w./-]+\/)$/.test(o.path) && !o.path.includes('..');
  });
}

/** Where a version's game is, keeping this page's query (?seed, ?star…). */
export function versionUrl(root: string, version: SiteVersion, search: string): string {
  return `${root}${version.path}${search}`;
}

/** The site's root for this build, or null outside the Pages site (dev server, local build). */
export function currentSiteRoot(): string | null {
  return buildInfo.pagesPath === null ? null : siteRoot(location.href, buildInfo.pagesPath);
}

/** The versions on the site, or null if the list can't be had. */
export async function loadVersions(root: string): Promise<SiteVersion[] | null> {
  try {
    const res = await fetch(`${root}versions.json`, { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return res.ok ? parseVersions(await res.json()) : null;
  } catch {
    return null;
  }
}

/** The id of the version picked last, or null for the release. */
export function loadChosenVersion(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Remembers the version picked ('release' forgets it). */
export function saveChosenVersion(id: string): void {
  try {
    if (id === 'release') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private mode or storage off: the pick lasts only this visit.
  }
}

/** True when launched as an installed app (home screen, desktop app). */
function isInstalledApp(): boolean {
  return (
    matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Started as an installed app on the release with another version picked:
 * goes to that version and returns true (the page is leaving, don't start the
 * game). A version that's gone (its pull request closed) is forgotten and the
 * release plays, as it does offline when the version picked isn't saved on
 * the device.
 */
export async function openChosenVersion(): Promise<boolean> {
  const chosen = loadChosenVersion();
  if (chosen === null || buildInfo.pagesPath !== '' || !isInstalledApp()) return false;
  const root = currentSiteRoot();
  const versions = root === null ? null : await loadVersions(root);
  if (root === null || versions === null) return false;
  const version = versions.find((v) => v.id === chosen);
  if (!version || version.id === 'release') {
    saveChosenVersion('release');
    return false;
  }
  if (!navigator.onLine && !(await availableOffline(root + version.path))) return false;
  // The release's own worker, which the app needs to start offline, must get going before the page leaves.
  await registrationStarted();
  location.replace(versionUrl(root, version, location.search));
  return true;
}
