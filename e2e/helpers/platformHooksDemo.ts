import { expect, type Page } from '@playwright/test';
import { navigateToModule } from './settingsSheet';

/** Matches `apps/demos/platform-hooks-demo/vite.config.ts`. */
export const PLATFORM_HOOKS_DEMO_URL = 'http://localhost:5214';
export const HOOKS_DEMO_GRID_ID = 'hooks-demo-blotter';

/** Bindable event ids — keep in sync with `MARKETS_GRID_EVENT_CATALOG`. */
export const MARKETS_GRID_EVENT_IDS = [
  'grid:ready',
  'grid:destroyed',
  'profile:loaded',
  'profile:saved',
  'profile:deleted',
  'provider:status',
  'provider:switched',
  'provider:dataStale',
  'toolbar:dateChanged',
  'grid:firstDataRendered',
  'grid:rowDataUpdated',
  'grid:cellClicked',
  'grid:cellValueChanged',
  'grid:filterChanged',
] as const;

export type MarketsGridEventId = (typeof MARKETS_GRID_EVENT_IDS)[number];

export async function clearPlatformHooksDemoStorage(page: Page): Promise<void> {
  await page.evaluate((gridId) => {
    localStorage.removeItem(`markets-grid-bundle:${gridId}`);
    localStorage.removeItem(`gc-active-profile:${gridId}`);
    localStorage.removeItem('platform-hooks-demo.mock-cfg-version');
    localStorage.removeItem('profile-migration-v1');
  }, HOOKS_DEMO_GRID_ID);
}

export async function waitForPlatformHooksDemo(page: Page): Promise<void> {
  await page.waitForSelector(`[data-grid-id="${HOOKS_DEMO_GRID_ID}"]`, { timeout: 30_000 });
  await page.waitForSelector(`[data-grid-id="${HOOKS_DEMO_GRID_ID}"] .ag-body-viewport .ag-row`, {
    timeout: 30_000,
  });
  await page.waitForSelector('[data-testid="profile-selector-trigger"]', { timeout: 15_000 });
}

export async function bootCleanPlatformHooksDemo(page: Page): Promise<void> {
  await page.goto(PLATFORM_HOOKS_DEMO_URL);
  await waitForPlatformHooksDemo(page);
  await clearPlatformHooksDemoStorage(page);
  await page.goto(PLATFORM_HOOKS_DEMO_URL);
  await waitForPlatformHooksDemo(page);
}

export async function openCustomSettings(page: Page): Promise<void> {
  const sheet = page.locator('.ds-sheet');
  const panel = page.locator('[data-testid="toolbar-date-settings-panel"]');
  if (await sheet.isVisible().catch(() => false) && await panel.isVisible().catch(() => false)) {
    return;
  }

  const inlineSettings = page.locator('[data-testid="v2-settings-open-btn"]');
  if (await inlineSettings.isVisible().catch(() => false)) {
    await inlineSettings.click();
  } else {
    await page.locator('[data-testid="toolbar-more-menu-trigger"]').click();
    await page.locator('[data-testid="v2-settings-open-btn"]').click();
  }
  await expect(sheet).toBeVisible();
  if (await panel.isVisible().catch(() => false)) return;
  await navigateToModule(page, 'toolbar-date-settings');
  await expect(panel).toBeVisible();
}

export async function openAppDataTab(page: Page): Promise<void> {
  await page.locator('[data-testid="platform-hooks-tab-appdata"]').click();
}

export async function waitForAppDataBootstrap(page: Page): Promise<void> {
  await openAppDataTab(page);
  await expect(page.locator('[data-testid="appdata-row-SessionContext"]')).toBeVisible({
    timeout: 30_000,
  });
}

export async function selectEventHandler(
  page: Page,
  eventId: MarketsGridEventId,
  handlerLabel: string,
): Promise<void> {
  const trigger = page.locator(`[data-testid="grid-event-handler-select-${eventId}"]`);
  await expect(trigger).toBeVisible();
  await trigger.click();
  await page.getByRole('option', { name: handlerLabel, exact: true }).click();
  await expect(trigger).toContainText(handlerLabel);
}

export async function clearEventHandler(
  page: Page,
  eventId: MarketsGridEventId,
): Promise<void> {
  const trigger = page.locator(`[data-testid="grid-event-handler-select-${eventId}"]`);
  await trigger.click();
  await page.getByRole('option', { name: '— None —', exact: true }).click();
  await expect(trigger).toContainText('— None —');
}

export async function openEventsTab(page: Page): Promise<void> {
  await page.locator('[data-testid="platform-hooks-tab-events"]').click();
}

export async function expectEventLogHandler(
  page: Page,
  handlerId: string,
  options?: { timeout?: number },
): Promise<void> {
  await openEventsTab(page);
  await expect(
    page.locator(`[data-testid="demo-event-log-entry"][data-handler-id="${handlerId}"]`).first(),
  ).toBeVisible(options);
}

export async function readPersistedEventBindings(
  page: Page,
): Promise<Record<string, string[]>> {
  return page.evaluate((gridId) => {
    const raw = localStorage.getItem(`markets-grid-bundle:${gridId}`);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as { gridLevelData?: { eventBindings?: Record<string, string[]> } };
      return parsed.gridLevelData?.eventBindings ?? {};
    } catch {
      return {};
    }
  }, HOOKS_DEMO_GRID_ID);
}

export async function waitForPersistedEventBinding(
  page: Page,
  eventId: MarketsGridEventId,
  handlerId: string,
): Promise<void> {
  await expect.poll(async () => {
    const bindings = await readPersistedEventBindings(page);
    return bindings[eventId]?.[0] ?? null;
  }, { timeout: 10_000 }).toBe(handlerId);
}
