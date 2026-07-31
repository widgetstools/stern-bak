import { test, expect } from '@playwright/test';
import { bootClean, openPanel, waitForGrid, liveProviderTrigger, PROVIDER_B, GRID_ID } from './helpers/containerHost';
import { pickSelectOptionByLocator } from './helpers/shadcnSelect';
import { expectGridLevelProviderId, exportBundleFromDexie, injectAppConfigBundle, wipeDexie } from './helpers/configSeed';

/**
 * Provider selection is grid-level state (persists across profile switches,
 * stored via the storage adapter's gridLevelData — see current-features
 * "Provider selection"). These cover the switch re-attaching cleanly and the
 * selection surviving a full reload.
 */

test('switching the live provider re-attaches and keeps rows on screen', async ({ page }) => {
  await bootClean(page);

  await openPanel(page, 'toolbar-date-settings');
  await pickSelectOptionByLocator(page, liveProviderTrigger(page), PROVIDER_B);
  await page.locator('[data-testid="tds-save-btn"]').click();

  // The grid remounts on provider B and must come back with data.
  await waitForGrid(page);
  expect(await page.locator('.ag-body-viewport .ag-row').count()).toBeGreaterThan(0);
});

test('the live-provider selection persists across a full reload', async ({ page }) => {
  await bootClean(page);

  await openPanel(page, 'toolbar-date-settings');
  await pickSelectOptionByLocator(page, liveProviderTrigger(page), PROVIDER_B);
  await page.locator('[data-testid="tds-save-btn"]').click();
  await waitForGrid(page);

  // gridLevelData persisted the selection → it survives a reload.
  await page.reload();
  await waitForGrid(page);
  await openPanel(page, 'toolbar-date-settings');
  await expect(liveProviderTrigger(page)).toContainText(PROVIDER_B);
});

test('gridLevelData.liveProviderId is written to Dexie on provider save', async ({ page }) => {
  await bootClean(page);
  const APP_ID = 'marketsgrid-container-e2e';
  const USER_ID = 'dev1';

  await openPanel(page, 'toolbar-date-settings');
  await pickSelectOptionByLocator(page, liveProviderTrigger(page), PROVIDER_B);
  await page.locator('[data-testid="tds-save-btn"]').click();
  await waitForGrid(page);

  await expectGridLevelProviderId(page, GRID_ID, APP_ID, USER_ID, 'marketsgrid-container-e2e:positions-b');
});

test('export bundle re-seed restores gridLevelData provider link', async ({ page }) => {
  await bootClean(page);
  const APP_ID = 'marketsgrid-container-e2e';
  const USER_ID = 'dev1';

  await openPanel(page, 'toolbar-date-settings');
  await pickSelectOptionByLocator(page, liveProviderTrigger(page), PROVIDER_B);
  await page.locator('[data-testid="tds-save-btn"]').click();
  await waitForGrid(page);

  const bundle = await exportBundleFromDexie(page);
  expect(bundle.appConfig.some((r) => r.payload?.gridLevelData)).toBe(true);

  await page.goto('about:blank');
  await page.goto('/');
  await waitForGrid(page);
  await injectAppConfigBundle(page, bundle.appConfig);
  await page.reload();
  await waitForGrid(page);
  await openPanel(page, 'toolbar-date-settings');
  await expect(liveProviderTrigger(page)).toContainText(PROVIDER_B);
  await expectGridLevelProviderId(page, GRID_ID, APP_ID, USER_ID, 'marketsgrid-container-e2e:positions-b');
});

test('workspace instance drift: save on stable id, open ephemeral id → empty state', async ({ page }) => {
  await bootClean(page);
  const APP_ID = 'marketsgrid-container-e2e';
  const USER_ID = 'dev1';

  // Commit provider B on the stable instance row (mock-blotter).
  await openPanel(page, 'toolbar-date-settings');
  await pickSelectOptionByLocator(page, liveProviderTrigger(page), PROVIDER_B);
  await page.locator('[data-testid="tds-save-btn"]').click();
  await waitForGrid(page);
  await expectGridLevelProviderId(page, GRID_ID, APP_ID, USER_ID, 'marketsgrid-container-e2e:positions-b');

  const bundle = await exportBundleFromDexie(page);
  const saved = bundle.appConfig.find((r) => r.configId === GRID_ID);
  expect(saved?.payload?.gridLevelData).toBeTruthy();

  // Workspace snapshot points at a different instanceId with an empty shell row.
  const ephemeralId = 'ephemeral-workspace-instance';
  await injectAppConfigBundle(page, [{
    ...saved!,
    configId: ephemeralId,
    payload: {
      version: 1,
      profiles: [{ id: '__default__', gridId: GRID_ID, name: 'Default', state: {}, createdAt: 1, updatedAt: 1 }],
    },
  }]);

  await page.goto(`/?instanceId=${ephemeralId}`);
  await waitForGrid(page);
  await openPanel(page, 'toolbar-date-settings');
  await expect(liveProviderTrigger(page)).toContainText('Mock Positions A');
});
