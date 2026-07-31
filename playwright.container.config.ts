import { defineConfig } from '@playwright/test';

/**
 * Isolated e2e config for the MarketsGridContainer mock host
 * (apps/demos/marketsgrid-container-e2e, port 5215).
 *
 * Separate from the main `playwright.config.ts` on purpose: it starts ONLY
 * the single mock-backed dev server and runs the `container-*.spec.ts` specs
 * with ONE worker. That removes the multi-server / parallel-worker
 * contention that makes the shared customizer/profile suite flaky, giving a
 * deterministic signal for the provider-host + customizer slice.
 *
 *   npx playwright test -c playwright.container.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'container-*.spec.ts',
  timeout: 45_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:5215',
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npm --prefix apps run dev -w @wellsfargo-starui/marketsgrid-container-e2e -- --no-open',
      port: 5215,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
