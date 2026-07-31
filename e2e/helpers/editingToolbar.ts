import type { Page } from '@playwright/test';
import { openViewMenu } from './viewMenu';

/** Open the unified editing toolbar via the primary-row View menu. */
export async function openEditingToolbar(page: Page): Promise<void> {
  if (!(await page.getByTestId('editing-toolbar-pinned').isVisible())) {
    await openViewMenu(page);
    const toggle = page.getByTestId('editing-toolbar-toggle');
    await toggle.waitFor({ state: 'visible', timeout: 20_000 });
    await toggle.click();
    // Selecting the item closes the menu — wait for it to fully unmount so a
    // follow-up View-menu open doesn't race the close animation.
    await page.locator('[data-testid="toolbar-view-menu"]').first()
      .waitFor({ state: 'hidden', timeout: 5_000 });
  }
  await page.waitForSelector('[data-testid="editing-toolbar-pinned"]', { timeout: 5_000 });
}
