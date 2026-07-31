import { test, expect, type Page } from '@playwright/test';
import { bootClean, openPanel, waitForGrid, GRID_ID } from './helpers/containerHost';
import { readAppConfigRows } from './helpers/configSeed';

/**
 * Reproduction + guardrail: the Grid Customizer "Custom Settings" editor
 * (ToolbarDateSettingsPanel) must persist its cards to IndexedDB and restore
 * them after a full reload. Two of its four cards travel the module-state →
 * profile path (Toolbar Date, Row Filter); the panel's own "Save" must flush
 * the active profile (via the `settings:save-requested` event) so every card
 * persists on one click — no separate grid Save required.
 *
 * Backed by the deterministic MarketsGridContainer mock host
 * (apps/demos/marketsgrid-container-e2e, port 5215). Run: `npm run e2e:container`.
 */

const DEFAULT_PROFILE_ID = '__default__';
const TDS_MODULE_ID = 'toolbar-date-settings';
const ROW_FILTER_EXPR = '[active] == false';

interface TdsModuleData {
  historicalDateAppDataEnabled?: boolean;
  rowExclusionExpression?: string;
  [k: string]: unknown;
}

/** Pull the persisted toolbar-date-settings module data off the Default
 *  profile in the bundled profile-set row (configId === instanceId). */
async function readTdsModuleData(page: Page): Promise<TdsModuleData | undefined> {
  const rows = await readAppConfigRows(page);
  const row = rows.find(
    (r) => r.configId === GRID_ID && Array.isArray(r.payload?.profiles),
  );
  const profile = row?.payload?.profiles?.find((p) => p.id === DEFAULT_PROFILE_ID);
  const envelope = profile?.state?.[TDS_MODULE_ID] as { data?: TdsModuleData } | undefined;
  return envelope?.data;
}

test('Custom Settings: Toolbar Date + Row Filter persist to IndexedDB and survive reload', async ({ page }) => {
  await bootClean(page);
  await openPanel(page, TDS_MODULE_ID);

  // ── Card 01: Toolbar Date — flip ENABLED on (reveals provider/key rows). ──
  await expect(page.locator('[data-testid="tds-provider"]')).toHaveCount(0);
  await page.locator('[data-testid="tds-enabled-switch"]').click();
  await expect(page.locator('[data-testid="tds-provider"]')).toBeVisible();

  // ── Card 04: Row Filter — set an expression via the first example chip. ──
  await page.locator('[data-testid="tds-row-filter-example"]').first().click();
  await expect(page.locator('[data-testid="tds-row-filter-clear"]')).toBeVisible();

  // The panel's own Save must persist ALL cards — no separate grid Save.
  await page.locator('[data-testid="tds-save-btn"]').click();

  // The profile write (RMW through ConfigManager) is async, so poll Dexie until
  // the Default profile carries the toolbar-date-settings module data.
  await expect
    .poll(async () => (await readTdsModuleData(page))?.historicalDateAppDataEnabled ?? null, {
      timeout: 10_000,
    })
    .toBe(true);

  const persisted = await readTdsModuleData(page);
  expect(persisted?.historicalDateAppDataEnabled, 'ENABLED toggle persisted').toBe(true);
  expect(persisted?.rowExclusionExpression, 'row-filter expression persisted').toBe(ROW_FILTER_EXPR);

  // ── Full reload — settings must restore from IndexedDB into the panel. ──
  await page.reload();
  await waitForGrid(page);
  await openPanel(page, TDS_MODULE_ID);

  await expect(
    page.locator('[data-testid="tds-provider"]'),
    'Toolbar Date ENABLED restored after reload',
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="tds-row-filter-clear"]'),
    'Row Filter expression restored after reload',
  ).toBeVisible();
});
