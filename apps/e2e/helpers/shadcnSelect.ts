import { expect, type Locator, type Page } from '@playwright/test';

/** Visible labels for NativeOptionsSelect values used across settings panels. */
const VALUE_LABELS: Record<string, string> = {
  off: 'Off',
  left: 'Pinned left',
  right: 'Pinned right',
  on: 'On',
  default: 'Host default',
  cell: 'CELL',
  row: 'ROW',
  agSetColumnFilter: 'Set (Enterprise)',
  agMultiColumnFilter: 'Multi (Enterprise)',
  custom: 'Custom expression…',
};

/** Demo blotter colId → headerName when option labels differ from colId. */
const DEMO_COL_HEADER: Record<string, string> = {
  quantity: 'Qty',
  currency: 'CCY',
  settlementDate: 'Settle Date',
};

function resolveOptionLabel(valueOrLabel: string): string {
  return (
    VALUE_LABELS[valueOrLabel]
    ?? DEMO_COL_HEADER[valueOrLabel]
    ?? valueOrLabel
  );
}

/** Radix Select popover — exclude cmdk suggestion listboxes in the sheet header. */
function openSelectListbox(page: Page): Locator {
  return page.locator('[role="listbox"][data-state="open"]');
}

async function clickSelectOption(
  listbox: Locator,
  valueOrLabel: string,
): Promise<void> {
  const label = resolveOptionLabel(valueOrLabel);

  const byDataValue = listbox.locator(
    `[role="option"][data-value="${valueOrLabel}"]`,
  );
  if (await byDataValue.count()) {
    await byDataValue.first().click();
    return;
  }

  const byLabel = listbox.getByRole('option', { name: label, exact: true });
  if (await byLabel.count()) {
    await byLabel.click();
    return;
  }

  const byPartialLabel = listbox.getByRole('option', { name: new RegExp(label, 'i') });
  if (await byPartialLabel.count()) {
    await byPartialLabel.first().click();
    return;
  }

  // Column pickers expose headerName labels while tests pass colId.
  const byValueInText = listbox.getByRole('option', {
    name: new RegExp(valueOrLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
  });
  if (await byValueInText.count()) {
    await byValueInText.first().click();
    return;
  }

  throw new Error(`Select option not found: ${valueOrLabel}`);
}

/**
 * Opens a NativeOptionsSelect (Radix combobox) and picks an option by
 * value or visible label. Accepts raw option values (`right`, `off`) and
 * maps them to the rendered label when known.
 */
export async function pickSelectOption(
  page: Page,
  testId: string,
  valueOrLabel: string,
): Promise<void> {
  await pickSelectOptionByLocator(
    page,
    page.locator(`[data-testid="${testId}"]`),
    valueOrLabel,
  );
}

export async function pickSelectOptionByLocator(
  page: Page,
  trigger: Locator,
  valueOrLabel: string,
): Promise<void> {
  await trigger.click();
  const listbox = openSelectListbox(page);
  await expect(listbox).toBeVisible();
  await clickSelectOption(listbox, valueOrLabel);
}

/** Asserts the combobox trigger shows the expected option label. */
export async function expectSelectDisplay(
  page: Page,
  testId: string,
  valueOrLabel: string,
): Promise<void> {
  const label = resolveOptionLabel(valueOrLabel);
  await expect(page.locator(`[data-testid="${testId}"]`)).toContainText(label);
}

/** Clicks a Radix `@wellsfargo-starui/react` Switch wired with `data-testid`. */
export async function clickSwitch(page: Page, testId: string): Promise<void> {
  await page.locator(`[data-testid="${testId}"]`).click();
}
