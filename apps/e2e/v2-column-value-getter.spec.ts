import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Column `valueGetter` expressions — authored in the DataProvider editor's
 * Columns tab, persisted with the provider config, applied by MarketsGrid.
 *
 * Runs against the STOMP minimal app (port 5213), which hosts the provider
 * editor. The expression DSL is the CSP-safe `@wellsfargo-starui/core` one: column
 * refs use bracket syntax with optional-chaining nested paths.
 */

const APP_URL = 'http://localhost:5213/';

/** The Columns-tab row whose Field cell is exactly `field`. */
function columnRow(page: Page, field: string): Locator {
  return page
    .locator('.ag-row')
    .filter({ has: page.locator('[col-id="field"]', { hasText: new RegExp(`^${field}$`) }) });
}

/**
 * Type into the expression editor. Waits for Monaco's hidden textarea
 * (`textarea.inputarea`) and types there; falls back to the plain textarea
 * (the testid'd element) if Monaco never mounts. Never presses Escape —
 * that bubbles to the Radix Dialog and closes it.
 */
async function typeExpression(page: Page, text: string) {
  const monaco = page.locator('textarea.inputarea');
  await monaco.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => {});
  if (await monaco.count()) {
    // Monaco's view-lines overlay intercepts pointer events; force-click the
    // hidden inputarea and focus it programmatically (the shared pattern).
    await monaco.first().click({ force: true });
    await page.evaluate(() =>
      document.querySelector<HTMLTextAreaElement>('textarea.inputarea')?.focus(),
    );
  } else {
    await page.getByTestId('columns-tab-expression-editor').click();
  }
  await page.keyboard.type(text, { delay: 20 });
}

async function openColumnsTab(page: Page) {
  await page.goto(APP_URL);
  // Wait out the STOMP snapshot buffering.
  await expect(page.locator('.ag-grid-scrolling-rows .ag-row').first()).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Data Provider Editor' }).click();
  await expect(page.getByRole('dialog', { name: 'Data Provider Editor' })).toBeVisible();
  await page.getByRole('tab', { name: 'Columns' }).click();
  // The ƒx affordance is present on every column row.
  await expect(
    columnRow(page, 'region').getByTestId('columns-tab-expression-cell'),
  ).toBeVisible({ timeout: 15_000 });
}

test('authors a column valueGetter expression and the grid computes it', async ({ page }) => {
  await openColumnsTab(page);

  // The region column starts with no expression (muted ƒx).
  const regionFx = columnRow(page, 'region').getByTestId('columns-tab-expression-cell');
  await expect(regionFx).toHaveAttribute('data-active', 'false');

  // Open the expression editor for `region`.
  await regionFx.click();
  const dialog = page.getByTestId('columns-tab-expression-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('region');

  // Author a derived value: "<region>/<country>". Monaco overtypes its
  // auto-closed pairs, so typing the literal string yields exact text.
  // NB: never press Escape here — it bubbles to the Radix Dialog and closes
  // it. Wait for Monaco's hidden textarea, then type into it.
  await typeExpression(page, 'CONCAT([region], "/", [country])');

  // Valid expression → no inline error → Save enabled.
  await expect(page.getByTestId('columns-tab-expression-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save expression' }).click();

  // Dialog closes and the row's ƒx flips to active (expression persisted
  // onto the column draft).
  await expect(dialog).toHaveCount(0);
  await expect(regionFx).toHaveAttribute('data-active', 'true');

  // Persist, then reload so the grid re-reads the saved provider config
  // (the live grid resolves columns from activeCfg at provider-load time —
  // same reload-gated path as a headerName edit).
  await page.getByRole('button', { name: 'Update DataProvider' }).click();
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Close' }).click();

  await page.reload();
  await expect(page.locator('.ag-grid-scrolling-rows .ag-row').first()).toBeVisible({
    timeout: 45_000,
  });
  const regionCell = page.locator('.ag-grid-scrolling-cells [col-id="region"]').first();
  await expect(regionCell).toHaveText(/^[A-Za-z ]+\/[A-Za-z ]+$/, { timeout: 20_000 });

  // Clean up so the run is idempotent — clear the expression back out.
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Data Provider Editor' }).click();
  await page.getByRole('tab', { name: 'Columns' }).click();
  await columnRow(page, 'region').getByTestId('columns-tab-expression-cell').click();
  await page.getByRole('button', { name: 'Clear' }).click();
  await page.getByRole('button', { name: 'Update DataProvider' }).click();
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 10_000 });
});

test('accepts CASE WHEN and if/else block syntax (live validation)', async ({ page }) => {
  await openColumnsTab(page);
  const dialog = page.getByTestId('columns-tab-expression-dialog');
  const error = page.getByTestId('columns-tab-expression-error');
  const save = page.getByRole('button', { name: 'Save expression' });

  // SQL-style CASE WHEN … END
  await columnRow(page, 'region').getByTestId('columns-tab-expression-cell').click();
  await expect(dialog).toBeVisible();
  await typeExpression(page, 'CASE WHEN [region] == "APAC" THEN "Asia" ELSE [region] END');
  await expect(error).toHaveCount(0);
  await expect(save).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);

  // JS-style if (…) { … } else { … } block
  await columnRow(page, 'country').getByTestId('columns-tab-expression-cell').click();
  await expect(dialog).toBeVisible();
  await typeExpression(page, 'if ([region] == "APAC") { return [country] } else { return "—" }');
  await expect(error).toHaveCount(0);
  await expect(save).toBeEnabled();
});

test('rejects an invalid expression (Save stays disabled)', async ({ page }) => {
  await openColumnsTab(page);

  await columnRow(page, 'ticker').getByTestId('columns-tab-expression-cell').click();
  const dialog = page.getByTestId('columns-tab-expression-dialog');
  await expect(dialog).toBeVisible();

  // Trailing operator stays invalid even after Monaco auto-closes brackets.
  await typeExpression(page, '[ticker] +');

  await expect(page.getByTestId('columns-tab-expression-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save expression' })).toBeDisabled();
});
