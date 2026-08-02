import { test, expect } from '@playwright/test';

const LAB_URL = 'http://localhost:5300/';

test.describe('markets-grid-lab onboarding', () => {
  test('home is the default landing and shows the feature map', async ({ page }) => {
    await page.goto(LAB_URL);
    await expect(page.getByTestId('lab-home')).toBeVisible();
    await expect(page.getByRole('heading', { name: /config-driven enterprise data grid/i })).toBeVisible();
    await expect(page.getByTestId('lab-home-card-overview')).toBeVisible();
  });

  test('sidebar groups render and a feature tab mounts its grid + inspector', async ({ page }) => {
    await page.goto(LAB_URL);
    await expect(page.getByTestId('lab-nav-group-formatting-display')).toBeVisible();

    await page.getByTestId('lab-tab-conditional').click();

    // Grid surface mounts.
    await expect(page.locator('.ag-root-wrapper').first()).toBeVisible({ timeout: 20_000 });

    // Inspector is present; switch to the Config tab and confirm a code block.
    await expect(page.getByTestId('lab-inspector')).toBeVisible();
    await page.getByTestId('lab-inspector-tab-config').click();
    await expect(page.getByText('Mount props (chrome)')).toBeVisible();
  });

  test('sidebar filter narrows the nav', async ({ page }) => {
    await page.goto(LAB_URL);
    await page.getByTestId('lab-sidebar-filter').fill('alerts');
    await expect(page.getByTestId('lab-tab-alerts')).toBeVisible();
    await expect(page.getByTestId('lab-tab-overview')).toHaveCount(0);
  });
});
