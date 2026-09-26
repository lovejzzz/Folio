import { defineConfig } from 'vitest/config';

// One config, glob-based: every test file in the repo runs. No allowlists.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
