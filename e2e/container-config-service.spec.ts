import { test, expect } from '@playwright/test';
import {
  bootClean,
  openPanel,
  waitForGrid,
  liveProviderTrigger,
  readLoadTimings,
  PROVIDER_A,
  PROVIDER_B,
  GRID_ID,
} from './helpers/containerHost';
import { pickSelectOptionByLocator } from './helpers/shadcnSelect';
import { readAppConfigRows, type AppConfigRowProbe } from './helpers/configSeed';

/**
 * Config-service contract guardrails (marketsgrid-container-e2e, port 5215).
 *
 * These lock in the baseline behaviors documented in
 * `docs/CONFIG_SERVICE_BASELINE.md` §4 (storage contract) and §5 (consumer
 * scope) so a future re-optimization of config-service access cannot silently
 * drop them. The container host is deterministic (mock providers, single
 * worker), which is what makes these assertions stable.
 *
 * Run: `npm run e2e:container`
 */

const DEFAULT_PROFILE_ID = '__default__';

/**
 * The profile-set row's stable identity is `configId === instanceId`
 * (`docs/CONFIG_SERVICE_BASELINE.md` §4). The `appId`/`userId` stamped onto
 * the row are an internal detail (scope normalization can rewrite them), so
 * the guardrails key off `configId` only — that is the persisted contract.
 */
async function findProfileSetRow(
  page: import('@playwright/test').Page,
): Promise<AppConfigRowProbe | undefined> {
  const rows = await readAppConfigRows(page);
  return rows.find((r) => r.configId === GRID_ID && Array.isArray(r.payload?.profiles));
}

async function saveLiveProvider(page: import('@playwright/test').Page, providerName: string): Promise<void> {
  await openPanel(page, 'toolbar-date-settings');
  await pickSelectOptionByLocator(page, liveProviderTrigger(page), providerName);
  await page.locator('[data-testid="tds-save-btn"]').click();
  await waitForGrid(page);
}

/**
 * The profile-set write (RMW through ConfigManager) is async and not gated on
 * the grid remount, so poll Dexie until the row's version reaches `minVersion`
 * before asserting on its contents.
 */
async function waitForProfileSetRow(
  page: import('@playwright/test').Page,
  minVersion = 1,
): Promise<AppConfigRowProbe> {
  await expect
    .poll(async () => (await findProfileSetRow(page))?.payload?.version ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(minVersion);
  return (await findProfileSetRow(page))!;
}

test.describe('config-service contract — MarketsGridContainer host', () => {
  test('window reaches interactive state and the ConfigService placeholder never sticks', async ({ page }) => {
    await bootClean(page);

    // Baseline §4.5(6): the "Connecting to ConfigService…" identity gate must
    // resolve — it must never strand the window.
    await expect(page.getByText('Connecting to ConfigService')).toHaveCount(0);
    expect(await page.locator('.ag-body-viewport .ag-row').count()).toBeGreaterThan(0);
  });

  test('profile-set persists at configId=instanceId with profiles + gridLevelData in ONE row', async ({ page }) => {
    await bootClean(page);
    await saveLiveProvider(page, PROVIDER_B);

    const row = await waitForProfileSetRow(page);

    // §4: configId === instanceId; one bundled row carries both the named
    // profiles and the grid-level state.
    expect(row.configId).toBe(GRID_ID);
    expect(typeof row.payload?.version).toBe('number');
    expect(Array.isArray(row.payload?.profiles)).toBe(true);
    expect(row.payload?.profiles?.some((p) => p.id === DEFAULT_PROFILE_ID)).toBe(true);
    expect(row.payload?.gridLevelData, 'gridLevelData coexists in the same row').toBeTruthy();
  });

  test('payload.version increments monotonically on successive saves (optimistic concurrency)', async ({ page }) => {
    await bootClean(page);

    await saveLiveProvider(page, PROVIDER_B);
    const first = await waitForProfileSetRow(page);
    const v1 = first.payload!.version!;

    await saveLiveProvider(page, PROVIDER_A);
    const second = await waitForProfileSetRow(page, v1 + 1);
    const v2 = second.payload!.version!;

    expect(v2).toBeGreaterThan(v1);
  });

  test('grid-level provider selection survives a warm reload without re-seeding', async ({ page }) => {
    await bootClean(page);
    await saveLiveProvider(page, PROVIDER_B);

    // §5(5) + §4.4: a warm reload reattaches to the persisted gridLevelData
    // and reaches interactive state — no placeholder, rows present.
    await page.reload();
    await waitForGrid(page);
    await expect(page.getByText('Connecting to ConfigService')).toHaveCount(0);
    expect(await page.locator('.ag-body-viewport .ag-row').count()).toBeGreaterThan(0);

    await openPanel(page, 'toolbar-date-settings');
    await expect(liveProviderTrigger(page)).toContainText(PROVIDER_B);
  });
});

/**
 * Phase-0 time-to-interactive budget (measurement guardrail).
 *
 * The container host is deterministic (mock providers, single worker, no
 * network), so the bootstrap load-timing ladder
 * (`packages/data/host-data/src/bootstrap/loadMarks.ts`) is stable enough to
 * fence. These budgets are intentionally generous headroom over the observed
 * baseline — their job is to FAIL LOUD if an optimization (or regression)
 * blows past the envelope, not to track jitter. Tighten them as Workstream C
 * lands. The ladder is logged on every run so the baseline stays visible in CI
 * output.
 */
test.describe('config-service contract — time-to-interactive budget', () => {
  // Cold = empty IndexedDB → full seed; warm = reload over a hydrated store.
  const COLD_PLATFORM_READY_BUDGET_MS = 12_000;
  const WARM_PLATFORM_READY_BUDGET_MS = 8_000;

  test('cold boot reaches platform-ready within budget', async ({ page }) => {
    await bootClean(page);
    const t = await readLoadTimings(page);
    // eslint-disable-next-line no-console
    console.log(`[ttibudget] cold ladder ${JSON.stringify(t)}`);

    // The ladder is monotonic: config → hub → appdata → catalog → platform.
    expect(t.configReady, 'config-ready marked').toBeGreaterThanOrEqual(0);
    expect(t.platformReady, 'platform-ready marked').toBeGreaterThanOrEqual(0);
    expect(t.platformReady!).toBeGreaterThanOrEqual(t.configReady!);
    expect(
      t.platformReady!,
      `cold platform-ready ${Math.round(t.platformReady!)}ms exceeded ${COLD_PLATFORM_READY_BUDGET_MS}ms budget`,
    ).toBeLessThan(COLD_PLATFORM_READY_BUDGET_MS);
  });

  test('warm reload reaches platform-ready within budget', async ({ page }) => {
    await bootClean(page);
    await page.reload();
    await waitForGrid(page);
    const t = await readLoadTimings(page);
    // eslint-disable-next-line no-console
    console.log(`[ttibudget] warm ladder ${JSON.stringify(t)}`);

    expect(t.platformReady, 'platform-ready marked').toBeGreaterThanOrEqual(0);
    expect(
      t.platformReady!,
      `warm platform-ready ${Math.round(t.platformReady!)}ms exceeded ${WARM_PLATFORM_READY_BUDGET_MS}ms budget`,
    ).toBeLessThan(WARM_PLATFORM_READY_BUDGET_MS);
  });
});
