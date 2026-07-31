import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // `container-*.spec.ts` need the single-server mock host on :5215 and run
  // under `playwright.container.config.ts` (own baseURL + 1 worker). Exclude
  // them here so the main multi-server suite doesn't collect + fail them
  // against demo-react's :5190. Run them with `npm run e2e:container`.
  testIgnore: 'container-*.spec.ts',
  timeout: 30_000,
  retries: 0,
  workers: 4,
  use: {
    baseURL: 'http://localhost:5190',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'npm --prefix apps run dev -w @wellsfargo-starui/demo-react',
      port: 5190,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm --prefix apps run dev -w @wellsfargo-starui/demo-configservice-react',
      port: 5191,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm --prefix apps run dev -w @wellsfargo-starui/markets-ui-react-reference',
      port: 5174,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      command: 'npm --prefix apps run dev -w @wellsfargo-starui/e2e-browser-blotter',
      port: 5180,
      reuseExistingServer: true,
      timeout: 90_000,
    },
    {
      // Apps build from source by default — vite aliases @wellsfargo-starui/grid straight
      // out of `packages/` source (no tarballs). `--no-open` keeps CI
      // from popping a browser tab. `--force` clobbers any stale `.vite/deps`
      // prebundle — required because the e2e suite often runs minutes
      // after a fresh install, when the optimizer prebundle would still
      // reflect whatever subset of `@wellsfargo-starui/grid` source happened to be on
      // disk during the first dev start. Without it, newly-added grid
      // modules (alerts, etc.) get silently dropped from the served bundle.
      // Port matches `apps/demos/markets-grid-lab/vite.config.ts`.
      command: 'npm --prefix apps run dev -w @wellsfargo-starui/markets-grid-lab -- --no-open --force',
      port: 5300,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Design-system demo app — FI terminal + component gallery.
      // Port matches `apps/demos/design-system/vite.config.ts`.
      command: 'npm --prefix apps run dev -w @wellsfargo-starui/design-system-demo -- --no-open --force',
      port: 5310,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Platform hooks demo — AppData bootstrap + grid event bindings.
      // Port matches `apps/demos/platform-hooks-demo/vite.config.ts`.
      // host-data resolves to dist exports — build before dev so bootstrap JSON parsing is current.
      command: 'npm run build --workspace=@wellsfargo-starui/host-data && npm run build --workspace=@wellsfargo-starui/widgets-react && npm --prefix apps run dev -w @wellsfargo-starui/platform-hooks-demo -- --no-open --force',
      port: 5214,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // STOMP minimal app — hosts the DataProvider editor's Columns tab,
      // which lives in `@wellsfargo-starui/widgets-react`. That package resolves to its
      // dist exports (only `@wellsfargo-starui/grid` is consumed as source), so build it
      // first or the editor serves stale code. Port matches
      // `apps/demos/stomp-marketsgrid-minimal/vite.config.ts`.
      command: 'npm run build --workspace=@wellsfargo-starui/widgets-react && npm --prefix apps run dev -w @wellsfargo-starui/stomp-marketsgrid-minimal -- --no-open --force',
      port: 5213,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
