import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { transformWithOxc, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/** Output of a git command, or null outside a git checkout. */
function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

/** Every file under `dir`, as paths relative to it with forward slashes. */
function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split('\\').join('/'));
}

/**
 * Writes the service worker (src/pwa/sw.ts, compiled) to sw.js once the build
 * is out, with the list of files it saves for offline play (all of them) and a
 * hash of their contents as its version, so any change to the build makes
 * browsers install the new one.
 */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'sporer:service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = listFiles(outDir)
        .filter((f) => f !== 'sw.js')
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(`${f}\0`).update(readFileSync(join(outDir, f)));
      const source = resolve(import.meta.dirname, 'src/pwa/sw.ts');
      const { code } = await transformWithOxc(readFileSync(source, 'utf8'), source, { lang: 'ts' });
      const head = `const VERSION = ${JSON.stringify(hash.digest('hex').slice(0, 16))};\nconst FILES = ${JSON.stringify(files)};\n`;
      writeFileSync(join(outDir, 'sw.js'), head + code);
    },
  };
}

export default defineConfig(({ command }) => {
  const env = process.env;
  // Shown in the menu's footer (src/ui/buildInfo.ts). GitHub Actions checks out a detached commit, so its
  // branch and run number come from the workflow's environment (BUILD_* and PAGES_PATH set by deploy.yml).
  const buildInfo = {
    branch: env.BUILD_BRANCH || env.GITHUB_REF_NAME || git('rev-parse --abbrev-ref HEAD'),
    build: env.GITHUB_RUN_NUMBER ?? null,
    commit: (env.BUILD_COMMIT || env.GITHUB_SHA)?.slice(0, 7) ?? git('rev-parse --short HEAD'),
    dev: command === 'serve',
    pagesPath: env.PAGES_PATH ?? null,
  };
  return {
    // Relative base so dist/ can be served from any static host or sub-path.
    base: './',
    server: { port: 5173 },
    plugins: [serviceWorker()],
    define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 5000,
      // The game, the planet lab (lab.html, a tool for making and checking planets), the plant lab (plants.html) and the animal lab (animals.html).
      rollupOptions: { input: { main: 'index.html', lab: 'lab.html', plants: 'plants.html', animals: 'animals.html' } },
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
