/**
 * Playwright + CDP smoke test for OpenFin runtime.
 *
 * Proves Playwright can attach to the OpenFin Chromium runtime via
 * connectOverCDP while the node-adapter platform is running.
 * See docs/plans/openfin-e2e-research.md.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser } from '@playwright/test';
import { launchPlatform, type LaunchedPlatform } from '../helpers/platform.js';
import { waitForCdpEndpoint, waitForCdpPage } from '../helpers/cdp.js';

const MANIFEST_URL = process.env.MUI_MANIFEST_URL
  ?? 'http://localhost:5174/platform/manifest.fin.json';
const CDP_PORT = Number(process.env.OPENFIN_CDP_PORT ?? 9090);

let platform: LaunchedPlatform;
let browser: Browser;

beforeAll(async () => {
  platform = await launchPlatform(MANIFEST_URL);
  const cdp = await waitForCdpEndpoint(CDP_PORT);
  browser = await chromium.connectOverCDP(cdp.webSocketDebuggerUrl);
}, 120_000);

afterAll(async () => {
  await browser?.close().catch(() => undefined);
  if (platform) await platform.quit();
});

describe('OpenFin CDP (Playwright attach)', () => {
  it('sees the provider page in CDP targets and Playwright contexts', async () => {
    const provider = await waitForCdpPage(
      (t) => t.type === 'page' && t.url.includes('/platform/provider'),
      { port: CDP_PORT, timeoutMs: 30_000 },
    );
    expect(provider.url).toContain('/platform/provider');

    const contexts = browser.contexts();
    expect(contexts.length).toBeGreaterThan(0);
    const pages = contexts.flatMap((c) => c.pages());
    expect(pages.some((p) => p.url().includes('/platform/provider'))).toBe(true);
  });

  it('test bridge responds to ping over node-adapter', async () => {
    const ping = await platform.bridge.ping();
    expect(ping.ok, ping.error).toBe(true);
    expect(ping.data).toBe('pong');
  });
});
