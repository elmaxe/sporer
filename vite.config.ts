import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

/** Output of a git command, or null outside a git checkout. */
function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

export default defineConfig(({ command }) => {
  const env = process.env;
  // Shown in the menu's footer (src/ui/buildInfo.ts). GitHub Actions checks out a detached commit, so its
  // branch and run number come from the workflow's environment.
  const buildInfo = {
    branch: env.GITHUB_REF_NAME ?? git('rev-parse --abbrev-ref HEAD'),
    build: env.GITHUB_RUN_NUMBER ?? null,
    commit: env.GITHUB_SHA?.slice(0, 7) ?? git('rev-parse --short HEAD'),
    dev: command === 'serve',
  };
  return {
    // Relative base so dist/ can be served from any static host or sub-path.
    base: './',
    server: { port: 5173 },
    define: { __BUILD_INFO__: JSON.stringify(buildInfo) },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 5000,
      // The game, and the planet lab (lab.html, a tool for making and checking planets).
      rollupOptions: { input: { main: 'index.html', lab: 'lab.html' } },
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
