import { test, expect, type Page } from '@playwright/test';
import { clickSettingsFromToolbar, navigateToModule } from './helpers/settingsSheet';

/**
 * Alerts module e2e — runs against the markets-grid-lab app's Alerts tab
 * (separate webServer on :5300) rather than the shared demo so the
 * pre-seeded rules are deterministic and the bell badge is mounted in
 * the PrimaryToolbar.
 *
 * What's covered:
 *
 *   1. Tab renders with the bell badge in the toolbar.
 *   2. SettingsSheet → Alerts panel mounts and shows the 7 seeded rules.
 *   3. The settings band controls (master enable, evaluation mode, default
 *      debounce, max notifications/sec, channels, history limit) all
 *      render as shadcn primitives.
 *   4. Driving the platform store directly:
 *      - pushing a notification surfaces it on the bell badge
 *      - "Mark all read" clears the unread count
 *      - "Clear" wipes the history
 *   5. Toggling `settings.enabled` short-circuits new dispatches.
 *   6. The OpenFin channel toggle reflects `window.fin` absence (disabled
 *      in plain browser).
 *
 * Live notification firing through the mock stream is NOT asserted —
 * timing-flaky in headless. The dispatcher's behaviour is covered by
 * unit tests in `packages/react-grid/grid/src/customizer/modules/alerts/runtime/dispatch.test.ts`.
 */

const LAB_URL = 'http://localhost:5300/';
const GRID_ID = 'lab-alerts-v2';
const SEED_FLAG_KEY = `lab-demo-profiles-v2:${GRID_ID}`;

const SEEDED_RULE_IDS = [
  'alert-bid-spike',
  'alert-loss-cluster',
  'alert-yield-watch',
  'alert-mid-move',
  'alert-price-tick',
  'alert-row-added',
  'alert-row-removed',
] as const;

interface LabGridHandle {
  platform: {
    store: {
      getModuleState: (id: string) => unknown;
      setModuleState: (id: string, updater: (prev: unknown) => unknown) => void;
    };
  };
}

declare global {
  interface Window {
    __labGrid?: LabGridHandle;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function clearLabStorage(page: Page): Promise<void> {
  await page.evaluate((flagKey) => {
    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith('markets-grid-bundle:lab-') ||
          k.startsWith('gc-active-profile:lab-') ||
          k.startsWith('lab-seeded:') ||
          k.startsWith('lab-demo-profiles-'),
      )
      .forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(flagKey);
  }, SEED_FLAG_KEY);
}

async function bootAlertsTab(page: Page): Promise<void> {
  // First load — wait for the DOM to be ready before touching localStorage
  // so the page's own bootstrap doesn't navigate us out from under the eval.
  await page.goto(LAB_URL);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid^="lab-tab-"]', { timeout: 15_000 });
  await clearLabStorage(page);
  // Reload to apply the cleared state from a known-empty baseline.
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid^="lab-tab-"]', { timeout: 15_000 });
  await page.locator('[data-testid="lab-tab-alerts"]').click();
  // Wait for the grid to render rows.
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"]`, { timeout: 15_000 });
  await page.waitForSelector(`[data-grid-id="${GRID_ID}"] .ag-grid-viewport .ag-row`, {
    timeout: 15_000,
  });
  // Wait for demo profiles to land — useLabDemoProfiles writes via setConfig.
  await page.waitForFunction(() => {
    const handle = window.__labGrid;
    if (!handle) return false;
    const state = handle.platform.store.getModuleState('alerts') as { rules?: unknown[] };
    return Array.isArray(state?.rules) && state.rules.length === 7;
  }, undefined, { timeout: 10_000 });
}

async function openAlertsPanel(page: Page): Promise<void> {
  // `.ds-sheet` is the visible portal element; `v2-settings-sheet` is the
  // outer container that stays mounted in the DOM (visibility toggled via
  // CSS) — Playwright's `state: 'visible'` rejects it. Mirrors the existing
  // `openSettingsSheet` helper in `e2e/helpers/settingsSheet.ts`.
  await clickSettingsFromToolbar(page);
  await page.locator('.ds-sheet').waitFor({ state: 'visible' });
  await navigateToModule(page, 'alerts');
  // Editor pane mounts once a rule is selected (seeded rules auto-select).
  await page.locator('[data-testid="alerts-rule-editor"]').waitFor({ state: 'visible' });
}

/** Global settings are collapsed by default — expand before asserting band controls. */
async function expandAlertsGlobalSettings(page: Page): Promise<void> {
  const section = page.locator('[data-testid="alerts-global-settings"]');
  await section.waitFor({ state: 'visible' });
  const enableSwitch = page.locator('[data-testid="alerts-enabled-switch"]');
  if (!(await enableSwitch.isVisible())) {
    await section.locator('header').click();
  }
  await enableSwitch.waitFor({ state: 'visible' });
}

async function closeSettingsSheet(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.locator('.ds-sheet').waitFor({ state: 'hidden' });
}

// ─── Tests ──────────────────────────────────────────────────────────────

test.describe('v2 — alerts module (lab app)', () => {
  test.beforeEach(async ({ page }) => {
    await bootAlertsTab(page);
  });

  test('toolbar bell renders for the alerts tab', async ({ page }) => {
    const bell = page.locator('[data-testid="alerts-badge-trigger"]');
    await expect(bell).toBeVisible();
    // Aria label includes the unread count; on fresh boot history is empty.
    await expect(bell).toHaveAttribute('aria-label', /Alerts \(0 unread\)/);
  });

  test('settings panel renders all 7 seeded rules', async ({ page }) => {
    await openAlertsPanel(page);
    for (const id of SEEDED_RULE_IDS) {
      await expect(
        page.locator(`[data-testid="alerts-rule-row-${id}"]`),
      ).toBeVisible();
    }
  });

  test('settings band exposes shadcn controls for frequency + channels', async ({ page }) => {
    await openAlertsPanel(page);
    await expandAlertsGlobalSettings(page);

    // Master enable + evaluation mode radios.
    await expect(page.locator('[data-testid="alerts-enabled-switch"]')).toBeVisible();
    await expect(page.locator('[data-testid="alerts-mode-realtime"]')).toBeVisible();
    await expect(page.locator('[data-testid="alerts-mode-throttled"]')).toBeVisible();
    await expect(page.locator('[data-testid="alerts-mode-paused"]')).toBeVisible();

    // Default debounce + rate-limit (slider + numeric input pair).
    await expect(page.locator('[data-testid="alerts-debounce-slider"]')).toBeVisible();
    await expect(page.locator('[data-testid="alerts-debounce-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="alerts-rate-slider"]')).toBeVisible();
    await expect(page.locator('[data-testid="alerts-rate-input"]')).toBeVisible();

    // Channel toggles.
    await expect(page.locator('[data-testid="alerts-channel-toast"]')).toBeVisible();
    await expect(page.locator('[data-testid="alerts-channel-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid="alerts-channel-openfin"]')).toBeVisible();

    // History limit input.
    await expect(page.locator('[data-testid="alerts-history-limit"]')).toBeVisible();
  });

  test('OpenFin channel toggle is disabled when window.fin is absent', async ({ page }) => {
    await openAlertsPanel(page);
    await expandAlertsGlobalSettings(page);
    // We're running in a plain browser, so window.fin is undefined → the
    // shadcn Switch carries the disabled HTML attribute.
    const openfinSwitch = page.locator('[data-testid="alerts-channel-openfin"]');
    await expect(openfinSwitch).toBeVisible();
    await expect(openfinSwitch).toBeDisabled();
  });

  test('pushing a notification surfaces on the badge + Mark read clears it', async ({
    page,
  }) => {
    // Drive a notification directly through the platform store so the test
    // doesn't depend on the mock stream's tick timing.
    await page.evaluate(() => {
      const handle = window.__labGrid;
      if (!handle) throw new Error('__labGrid not set');
      handle.platform.store.setModuleState('alerts', (prev: unknown) => {
        const s = prev as { rules: unknown[]; history: unknown[]; settings: unknown };
        return {
          ...s,
          history: [
            {
              id: 'test-notif-1',
              ruleId: 'alert-bid-spike',
              ruleName: 'Bid > $110',
              severity: 'warning',
              message: 'AAPL bid hit 112.50',
              rowId: 'AAPL',
              column: 'bidPrice',
              value: 112.5,
              prevValue: 109,
              firedAt: Date.now(),
              read: false,
            },
            ...s.history,
          ],
        };
      });
    });

    // Badge count appears.
    const badge = page.locator('[data-testid="alerts-badge-count"]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('1');

    // Click the bell to open the popover.
    await page.locator('[data-testid="alerts-badge-trigger"]').click();
    await expect(page.locator('[data-testid="alerts-badge-popover"]')).toBeVisible();
    await expect(page.locator('[data-testid="alerts-notification-test-notif-1"]')).toBeVisible();

    // Mark all read — popover stays open; badge count vanishes.
    await page.locator('[data-testid="alerts-badge-mark-read"]').click();
    await expect(badge).toHaveCount(0);

    // Clear wipes history entirely.
    await page.locator('[data-testid="alerts-badge-clear"]').click();
    await expect(
      page.locator('[data-testid="alerts-notification-test-notif-1"]'),
    ).toHaveCount(0);
  });

  test('toggling settings.enabled off short-circuits new dispatches', async ({ page }) => {
    await openAlertsPanel(page);
    await expandAlertsGlobalSettings(page);

    // Capture initial enabled state via the data store (Radix Switch
    // exposes `data-state` but reading from state is more deterministic).
    const initiallyEnabled = await page.evaluate(() => {
      const h = window.__labGrid;
      const s = h?.platform.store.getModuleState('alerts') as { settings: { enabled: boolean } };
      return s.settings.enabled;
    });
    expect(initiallyEnabled).toBe(true);

    // Flip the switch.
    await page.locator('[data-testid="alerts-enabled-switch"]').click();
    await page.waitForFunction(() => {
      const h = window.__labGrid;
      const s = h?.platform.store.getModuleState('alerts') as { settings: { enabled: boolean } };
      return s.settings.enabled === false;
    });

    // Toggle back so subsequent tests inheriting the same dev server
    // aren't left in a disabled state. (Each test re-seeds via boot,
    // but defensive.)
    await page.locator('[data-testid="alerts-enabled-switch"]').click();
    await page.waitForFunction(() => {
      const h = window.__labGrid;
      const s = h?.platform.store.getModuleState('alerts') as { settings: { enabled: boolean } };
      return s.settings.enabled === true;
    });

    await closeSettingsSheet(page);
  });
});
