import { defineConfig } from 'vitest/config';

/**
 * Vitest config for OpenFin-driven end-to-end tests.
 *
 * Run: npm run test:e2e:openfin  (from repo root)
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    globalSetup: ['./globalSetup.ts'],
    globalTeardown: './globalSetup.ts',
    env: {
      E2E_OPENFIN_DEV_PORT: '5197',
      OPENFIN_CDP_PORT: '9190',
      MUI_MANIFEST_URL: 'http://localhost:5197/platform/manifest.e2e.fin.json',
    },

    testTimeout: 60_000,
    hookTimeout: 120_000,

    // One OpenFin platform at a time — shared CDP port + Dexie DB
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,

    include: ['specs/**/*.e2e.spec.ts'],
    retry: 0,
    reporters: ['verbose'],
    teardownTimeout: 15_000,
  },
});
