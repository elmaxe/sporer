import { buildInfo } from './buildInfo';
import { currentSiteRoot, loadVersions, saveChosenVersion, versionId, versionUrl, type SiteVersion } from './versions';

/**
 * The menu's Version section (#menu-version-section in index.html): a list of
 * the versions on the site (versions.ts) to switch to, the one playing picked.
 * Picking one goes there, keeping the galaxy and system in the URL, and
 * remembers it so an installed app opens it from then on. Hidden outside the
 * Pages site (dev server, local builds) or when the list can't be had.
 * GameMenu refreshes it each time the menu opens.
 */
export class VersionPicker {
  private readonly section = document.getElementById('menu-version-section')!;
  private readonly select = document.getElementById('menu-version') as HTMLSelectElement;
  private readonly root = currentSiteRoot();
  private versions: SiteVersion[] = [];

  constructor() {
    this.section.hidden = true;
    this.select.addEventListener('change', this.onChange);
  }

  async refresh(): Promise<void> {
    if (this.root === null || buildInfo.pagesPath === null) return;
    const versions = await loadVersions(this.root);
    if (versions === null) return;
    const current = versionId(buildInfo.pagesPath);
    // This build, should the list not have caught up with it yet.
    if (!versions.some((v) => v.id === current)) {
      versions.unshift({ id: current, label: buildInfo.branch ?? current, path: buildInfo.pagesPath, ref: '', commit: '', date: '' });
    }
    this.versions = versions;
    this.select.replaceChildren(
      ...versions.map((v) => {
        const option = new Option(v.commit ? `${v.label} · ${v.commit}` : v.label, v.id);
        option.selected = v.id === current;
        return option;
      }),
    );
    this.section.hidden = versions.length < 2;
  }

  dispose(): void {
    this.select.removeEventListener('change', this.onChange);
  }

  private onChange = () => {
    const version = this.versions.find((v) => v.id === this.select.value);
    if (!version || this.root === null) return;
    saveChosenVersion(version.id);
    location.href = versionUrl(this.root, version, location.search);
  };
}
