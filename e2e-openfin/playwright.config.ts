/**
 * Playwright config for the star-demo OpenFin e2e harness.
 *
 * Independent of the root /e2e/ browser config. Two web servers come up
 * first: the STOMP view server (data plane, :8081) and star-demo's vite
 * dev server (:5175, DEV mode so the test bridge installs). The
 * launchOpenFin fixture then boots a real OpenFin runtime from star-demo's
 * manifest via @openfin/node-adapter and attaches Playwright over CDP
 * (:9091).
 *
 * Single worker: one OpenFin runtime owns the CDP port for the whole run.
 * Generous timeout because the first test pays the runtime boot + provider
 * init + STOMP snapshot cost (and, on a cold machine, a one-time runtime
 * download).
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 150_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    headless: true,
  },
  webServer: [
    {
      command: 'npm --prefix .. run dev:stomp',
      url: 'http://localhost:8081/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm --prefix .. run dev:star-demo',
      url: 'http://localhost:5175',
      reuseExistingServer: true,
      timeout: 90_000,
    },
  ],
});
