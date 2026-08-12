import { defineConfig } from '@playwright/test';

/**
 * Moved here from the platform repo along with the apps the specs drive.
 *
 * Two things changed in the move:
 *
 *  1. `baseURL` was `:5190` (demo-react), which no longer exists. It now points
 *     at star-demo (`:5175`). Specs that do not pin their own port inherit this,
 *     so any spec written against demo-react's markup needs revalidation — see
 *     E2E_STATUS.md for what has actually been confirmed.
 *
 *  2. Servers start via `npm run dev -w <app>` from this repo instead of
 *     `npm --prefix apps run dev -w <app>` in the platform repo.
 *
 * Specs bound to deleted apps (browser-blotter, hosted-markets-grid,
 * platform-hooks-demo, v2-template-create-apply and the seven container-*
 * specs) were removed rather than retargeted; their host apps are gone.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 4,
  use: {
    baseURL: 'http://localhost:5175',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      // Default target for every spec that does not pin its own port.
      command: 'npm run dev -w @wellsfargo-starui/star-demo -- --no-open --force',
      port: 5175,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // `--force` clobbers any stale `.vite/deps` prebundle — required because
      // the suite often runs minutes after a fresh install, when the optimizer
      // prebundle would still reflect whatever subset of @wellsfargo-starui/grid
      // source happened to be on disk during the first dev start. Without it,
      // newly-added grid modules (alerts, etc.) get silently dropped.
      command: 'npm run dev -w @wellsfargo-starui/markets-grid-lab -- --no-open --force',
      port: 5300,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w @wellsfargo-starui/design-system-demo -- --no-open --force',
      port: 5310,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // SSRM lab — drives the server-side row model against the SharedWorker
      // query plane (ssrm-viewport-ticks.spec.ts). Its Vite server pins
      // 127.0.0.1 with strictPort, so the spec addresses it by full URL.
      command: 'npm run dev -w @wellsfargo-starui/markets-grid-ssrm-lab -- --no-open --force',
      port: 5320,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Hosts the DataProvider editor's Columns tab, which lives in
      // @wellsfargo-starui/grid/widgets and resolves to its dist exports —
      // build packages first or the editor serves stale code.
      command: 'npm run dev -w @wellsfargo-starui/stomp-marketsgrid-minimal -- --no-open --force',
      port: 5213,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
