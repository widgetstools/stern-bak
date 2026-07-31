import type { Page, Locator } from '@playwright/test';

/**
 * Open the primary toolbar's View menu — the single dropdown that now holds
 * Columns, Auto Format, and the Formatting / Editing toolbar toggles (they
 * were moved off the toolbar to keep it uncluttered).
 *
 * Menu items portal to <body>, so after opening, click them via
 * `page.locator('[data-testid="…"]')`. Pass a grid-scoped `Locator` for the
 * trigger when more than one grid is on the page.
 *
 * Idempotent + settled: returns only once the menu content is actually
 * visible. A bare trigger click can race a still-animating close (toggling the
 * menu back shut), so we no-op when already open and wait for the content
 * after clicking.
 */
export async function openViewMenu(scope: Page | Locator): Promise<void> {
  const page: Page =
    typeof (scope as Locator).page === 'function' ? (scope as Locator).page() : (scope as Page);
  const menu = page.locator('[data-testid="toolbar-view-menu"]').first();
  if (await menu.isVisible().catch(() => false)) return;
  await scope.locator('[data-testid="toolbar-view-menu-trigger"]').first().click();
  await menu.waitFor({ state: 'visible', timeout: 10_000 });
}

/** Close the View menu if open and wait for it to fully unmount. */
export async function closeViewMenu(page: Page): Promise<void> {
  const menu = page.locator('[data-testid="toolbar-view-menu"]').first();
  if (!(await menu.isVisible().catch(() => false))) return;
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden', timeout: 5_000 });
}
