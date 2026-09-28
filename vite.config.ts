import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so dist/ can be served from any static host or sub-path.
  base: './',
  server: { port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 5000 },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
