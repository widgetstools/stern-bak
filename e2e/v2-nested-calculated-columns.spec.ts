import { test, expect } from '@playwright/test';
import {
  bootFixture,
  readCellText,
  readAllColumnIds,
  scrollGridToEnd,
} from './helpers/nestedFixtures';

/**
 * Calculated columns whose expressions reference nested-field colIds.
 * Validates the recent expression-evaluator fix that switched the
 * `columnRef` and aggregate-columnRef cases to dot-walk via
 * `getValueByPath` — without it, `[pricing.bid]` resolved to `null` and
 * every calc column rendered empty.
 *
 * Note on AG-Grid column virtualisation: the calc cols sit at the far
 * right of the column model, so DOM-only header scans miss them. We
 * use `readAllColumnIds()` (via fiber → GridApi) to assert presence,
 * and `scrollGridToEnd()` to mount the cells before asserting on cell
 * content.
 */

test.describe('v2 — calculated columns referencing nested fields', () => {
  test.beforeEach(async ({ page }) => {
    await bootFixture(page, 'calc');
  });

  test('all three calculated columns are registered in the grid model', async ({ page }) => {
    const cols = await readAllColumnIds(page);
    expect(cols).toContain('calc_spread');
    expect(cols).toContain('calc_dv01PctTotal');
    expect(cols).toContain('calc_notionalPerDv01');
  });

  test('subtraction across two nested paths renders a numeric result', async ({ page }) => {
    await scrollGridToEnd(page);
    const text = await readCellText(page, 'N-00007', 'calc_spread');
    expect(text).not.toBeNull();
    expect(text!).not.toBe('');
    // Format `0.0000` should produce ≥3 digits/decimal.
    expect(text!).toMatch(/\d/);
  });

  test('cross-row aggregate (SUM) over nested DV01 renders a percentage cell', async ({ page }) => {
    await scrollGridToEnd(page);
    const text = await readCellText(page, 'N-00007', 'calc_dv01PctTotal');
    expect(text).not.toBeNull();
    expect(text!).not.toBe('');
    expect(text!).toMatch(/%$/);
    const pct = parseFloat(text!.replace('%', ''));
    expect(Number.isFinite(pct)).toBe(true);
    // Strict assertion: a per-row share of the total cannot be 100%
    // unless there is exactly one row contributing — which is not the
    // fixture state. A regression that makes `SUM([risk.dv01])` return
    // the per-row scalar (because `[risk.dv01]` parsed as an array
    // literal instead of a columnRef) yields exactly 100.00% here.
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
  });

  test('mixed flat+nested expression renders integer value', async ({ page }) => {
    await scrollGridToEnd(page);
    const text = await readCellText(page, 'N-00007', 'calc_notionalPerDv01');
    expect(text).not.toBeNull();
    expect(text!).not.toBe('');
    // Format `#,##0` — digits with optional commas.
    expect(text!).toMatch(/^[\d,]+$/);
    const cleaned = text!.replace(/,/g, '');
    expect(parseInt(cleaned, 10)).toBeGreaterThan(0);
  });

  // ─── Edge cases ─────────────────────────────────────────────────

  test('edge: null pricing object — calc_spread renders empty/zero, no crash', async ({ page }) => {
    await scrollGridToEnd(page);
    const text = await readCellText(page, 'EDGE-NULL-PRICING', 'calc_spread');
    // null - null → coerced to NaN/null → formatter renders empty,
    // OR ssf renders "0.0000" for the zero/text fallback.
    expect(text).not.toBeNull();
    expect(text!.length).toBeLessThan(20);
  });

  test('edge: missing pricing parent — calc_spread doesn\'t crash', async ({ page }) => {
    await scrollGridToEnd(page);
    const text = await readCellText(page, 'EDGE-MISS-PRICING', 'calc_spread');
    expect(text).not.toBeNull();
    expect(text!.length).toBeLessThan(20);
  });

  test('edge: partial pricing (bid only) — calc_spread is empty/zero', async ({ page }) => {
    await scrollGridToEnd(page);
    const text = await readCellText(page, 'EDGE-PARTIAL', 'calc_spread');
    expect(text).not.toBeNull();
  });

  test('edge: zero ask doesn\'t affect calc_notionalPerDv01 (uses risk.dv01)', async ({ page }) => {
    await scrollGridToEnd(page);
    const text = await readCellText(page, 'EDGE-ZERO-ASK', 'calc_notionalPerDv01');
    expect(text).not.toBeNull();
    expect(text!).not.toBe('');
  });

  test('edge: inverted market still computes spread (potentially negative)', async ({ page }) => {
    await scrollGridToEnd(page);
    const text = await readCellText(page, 'EDGE-INVERTED', 'calc_spread');
    expect(text).not.toBeNull();
    // ask=100.75, bid=101.25 → spread = -0.50. Format `0.0000` may or
    // may not include a sign; just assert numeric content.
    expect(text!).toMatch(/-?\d/);
  });

  test('headers for every calc column appear after scrolling into view', async ({ page }) => {
    await scrollGridToEnd(page);
    for (const id of ['calc_spread', 'calc_dv01PctTotal', 'calc_notionalPerDv01']) {
      const visible = await page.evaluate(
        (i) => !!document.querySelector(`.ag-header-cell[col-id="${i}"]`),
        id,
      );
      expect(visible, `calc column header ${id} should be visible`).toBe(true);
    }
  });

  test('calc_spread expression with nested refs evaluates to non-zero on regular row', async ({ page }) => {
    await scrollGridToEnd(page);
    // Generator guarantees ask > bid for all regular rows, so spread > 0.
    const text = await readCellText(page, 'N-00007', 'calc_spread');
    expect(text).not.toBeNull();
    const num = parseFloat((text ?? '').replace(/[^\d.\-]/g, ''));
    expect(num).toBeGreaterThan(0);
  });
});
