import { test, expect } from '@playwright/test';
import {
  bootCleanPlatformHooksDemo,
  clearEventHandler,
  expectEventLogHandler,
  MARKETS_GRID_EVENT_IDS,
  openCustomSettings,
  PLATFORM_HOOKS_DEMO_URL,
  readPersistedEventBindings,
  selectEventHandler,
  waitForAppDataBootstrap,
  waitForPersistedEventBinding,
  waitForPlatformHooksDemo,
  HOOKS_DEMO_GRID_ID,
} from './helpers/platformHooksDemo';
import { navigateToModule } from './helpers/settingsSheet';

/**
 * Rigorous e2e for `apps/demos/platform-hooks-demo` — AppData bootstrap hooks and
 * MarketsGridContainer event callback bindings (Custom Settings → EVENT CALLBACKS).
 *
 * Targets http://localhost:5214 (see playwright.config webServer entry).
 */
test.describe.configure({ timeout: 60_000, mode: 'serial' });

test.describe('platform-hooks-demo — bootstrap and grid shell', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanPlatformHooksDemo(page);
  });

  test('grid mounts with mock provider rows and Default profile', async ({ page }) => {
    await expect(page.locator(`[data-grid-id="${HOOKS_DEMO_GRID_ID}"]`)).toBeVisible();
    await expect(
      page.locator(`[data-grid-id="${HOOKS_DEMO_GRID_ID}"] .ag-body-viewport .ag-row`),
    ).not.toHaveCount(0);
    await expect(page.locator('[data-testid="profile-selector-trigger"]')).toContainText('Default');
  });

  test('AppData bootstrap seeds SessionContext and positions.asOfDate', async ({ page }) => {
    await waitForAppDataBootstrap(page);
    await expect(page.locator('[data-testid="appdata-row-DeskDefaults"]')).toBeVisible();
    await expect(page.locator('[data-testid="appdata-row-positions"]')).toBeVisible();
    await expect(page.locator('[data-testid="appdata-row-positions"] pre')).toContainText('asOfDate');
  });
});

test.describe('platform-hooks-demo — event callback bindings UI', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanPlatformHooksDemo(page);
    await openCustomSettings(page);
  });

  test('EVENT CALLBACKS section lists every catalog event with a handler dropdown', async ({ page }) => {
    await expect(page.locator('[data-testid="grid-event-bindings-section"]')).toBeVisible();
    for (const eventId of MARKETS_GRID_EVENT_IDS) {
      await expect(page.locator(`[data-testid="grid-event-binding-${eventId}"]`)).toBeVisible();
      await expect(page.locator(`[data-testid="grid-event-handler-select-${eventId}"]`)).toBeVisible();
    }
  });

  test('handler dropdown opens above the settings drawer and selection sticks', async ({ page }) => {
    await selectEventHandler(page, 'profile:saved', 'Log profile saved');
    await selectEventHandler(page, 'grid:cellClicked', 'Log cell click');
    await clearEventHandler(page, 'profile:saved');
  });

  test('each dropdown exposes all registered demo handlers', async ({ page }) => {
    await page.locator('[data-testid="grid-event-handler-select-profile:saved"]').click();
    const expected = [
      '— None —',
      'Log grid ready',
      'Log grid destroyed',
      'Log profile loaded',
      'Log profile saved',
      'Log profile deleted',
      'Log provider status',
      'Log provider switch',
      'Log stale banner',
      'Log toolbar date',
      'Log first data rendered',
      'Log row data updated',
      'Log cell click',
      'Log cell value changed',
      'Log filter change',
    ];
    for (const label of expected) {
      await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();
    }
    await page.keyboard.press('Escape');
  });
});

test.describe('platform-hooks-demo — binding persistence', () => {
  test('selected handler persists in localStorage and survives reload', async ({ page }) => {
    await bootCleanPlatformHooksDemo(page);
    await openCustomSettings(page);
    await selectEventHandler(page, 'profile:saved', 'Log profile saved');
    await waitForPersistedEventBinding(page, 'profile:saved', 'log-profile-saved');

    const bindings = await readPersistedEventBindings(page);
    expect(bindings['profile:saved']).toEqual(['log-profile-saved']);

    await page.reload();
    await waitForPlatformHooksDemo(page);
    await openCustomSettings(page);
    await expect(
      page.locator('[data-testid="grid-event-handler-select-profile:saved"]'),
    ).toContainText('Log profile saved');
  });
});

test.describe('platform-hooks-demo — handler invocation', () => {
  test.beforeEach(async ({ page }) => {
    await bootCleanPlatformHooksDemo(page);
  });

  test('grid:ready binding survives reload in Custom Settings UI', async ({ page }) => {
    await openCustomSettings(page);
    await selectEventHandler(page, 'grid:ready', 'Log grid ready');
    await page.keyboard.press('Escape');
    await waitForPersistedEventBinding(page, 'grid:ready', 'log-grid-ready');
    await page.reload();
    await waitForPlatformHooksDemo(page);
    await openCustomSettings(page);
    await expect(
      page.locator('[data-testid="grid-event-handler-select-grid:ready"]'),
    ).toContainText('Log grid ready');
  });

  test('profile:saved fires when user saves the active profile', async ({ page }) => {
    await openCustomSettings(page);
    await selectEventHandler(page, 'profile:saved', 'Log profile saved');
    await page.keyboard.press('Escape');

    await page.locator('[data-testid="toolbar-more-menu-trigger"]').click();
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
    await navigateToModule(page, 'general-settings');
    await page.locator('[data-testid="go-pagination"]').click();
    await page.locator('[data-testid="go-save-btn"]').click();
    await page.keyboard.press('Escape');

    await expect(page.locator('[data-testid="save-all-btn"]')).toHaveAttribute('data-state', 'dirty');
    await page.locator('[data-testid="save-all-btn"]').click();
    await expectEventLogHandler(page, 'log-profile-saved', { timeout: 10_000 });
  });

  test('grid:cellClicked fires when user clicks a data cell', async ({ page }) => {
    await openCustomSettings(page);
    await selectEventHandler(page, 'grid:cellClicked', 'Log cell click');
    await page.keyboard.press('Escape');

    const cell = page
      .locator(`[data-grid-id="${HOOKS_DEMO_GRID_ID}"] .ag-body-viewport .ag-row`)
      .first()
      .locator('.ag-cell')
      .first();
    await cell.click();
    await expectEventLogHandler(page, 'log-cell-clicked', { timeout: 10_000 });
  });

  test('profile lifecycle — create profile fires log-profile-loaded when bound', async ({ page }) => {
    await openCustomSettings(page);
    await selectEventHandler(page, 'profile:loaded', 'Log profile loaded');
    await page.keyboard.press('Escape');

    const trigger = page.locator('[data-testid="profile-selector-trigger"]');
    await trigger.click();
    await page.locator('[data-testid="profile-name-input"]').fill('E2E-Hooks');
    await page.locator('[data-testid="profile-create-btn"]').click();
    await expect(trigger).toContainText('E2E-Hooks');
    await expectEventLogHandler(page, 'log-profile-loaded', { timeout: 10_000 });
  });
});

test.describe('platform-hooks-demo — smoke', () => {
  test('demo URL responds', async ({ page }) => {
    await page.goto(PLATFORM_HOOKS_DEMO_URL);
    await expect(page.locator('[data-testid="platform-hooks-demo-sidebar"]')).toBeVisible();
  });
});
