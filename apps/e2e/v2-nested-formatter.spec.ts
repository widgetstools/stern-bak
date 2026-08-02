import { test, expect } from '@playwright/test';
import {
  bootFixture,
  readCellText,
  readCellFontWeight,
  readCellColor,
  readCellBackground,
  cellHasClassMatching,
} from './helpers/nestedFixtures';

/**
 * Static formatter on nested-field columns (`pricing.bid`, `ratings.sp`,
 * etc.). Targets the recent fix where CSS class names containing dots
 * were parsed by browsers as chained class selectors, so styling never
 * landed on cells whose colId was a dotted path.
 *
 * These specs assert on what the fix actually changes:
 *   - the encoded CSS class (`ds-col-c-pricing_2ebid` etc.) is on the
 *     cell DOM,
 *   - cellStyleOverrides (bold/italic/colours) actually paint via that
 *     class — proves selector matches the class,
 *   - nested values still resolve so the cell isn't blank.
 *
 * Edge cases:
 *   - null / undefined / partial nested objects don't crash the grid.
 */

test.describe('v2 — static formatter on nested fields', () => {
  test.beforeEach(async ({ page }) => {
    await bootFixture(page, 'formatter');
  });

  test('happy-path nested numeric cell renders a non-empty value with arrow glyph', async ({ page }) => {
    const text = await readCellText(page, 'N-00007', 'pricing.bid');
    expect(text).not.toBeNull();
    expect(text!).not.toBe('');
    // Excel format `[Green]▲ #,##0.00;[Red]▼ #,##0.00;[Blue]— 0.00`
    // emits a leading arrow + space before the number. Bid values in the
    // generator are always > 0, so we expect the up-arrow section.
    expect(text!).toMatch(/^[▲▼—]\s\d/);
  });

  test('cell style override (bold) applies to nested numeric column via injected CSS', async ({ page }) => {
    const fw = await readCellFontWeight(page, 'N-00007', 'pricing.bid');
    // Browser normalises `bold` → `700`; tolerate either string.
    expect(['bold', '700']).toContain(fw);
  });

  test('encoded class lands on DOM cell (ds-col-c-pricing_2ebid)', async ({ page }) => {
    const has = await cellHasClassMatching(page, 'N-00007', 'pricing.bid', /^ds-col-c-pricing_2ebid$/);
    expect(has).toBe(true);
  });

  test('nested string column gets background + foreground from style override', async ({ page }) => {
    // ratings.sp gets background #fde68a, foreground #92400e, bold.
    const bg = await readCellBackground(page, 'N-00007', 'ratings.sp');
    const color = await readCellColor(page, 'N-00007', 'ratings.sp');
    const fw = await readCellFontWeight(page, 'N-00007', 'ratings.sp');
    expect(bg).toMatch(/rgb\(253,\s?230,\s?138\)/);
    expect(color).toMatch(/rgb\(146,\s?64,\s?14\)/);
    expect(['bold', '700']).toContain(fw);
  });

  test('encoded class lands on nested string column (ds-col-c-ratings_2esp)', async ({ page }) => {
    const has = await cellHasClassMatching(page, 'N-00007', 'ratings.sp', /^ds-col-c-ratings_2esp$/);
    expect(has).toBe(true);
  });

  test('encoded class is present on multiple cells (CSS rule isn\'t per-row)', async ({ page }) => {
    const counts = await page.evaluate(() => {
      return document.querySelectorAll('.ag-cell.ds-col-c-pricing_2ebid').length;
    });
    expect(counts).toBeGreaterThan(1);
  });

  // ─── Edge cases ──────────────────────────────────────────────────

  test('edge: null pricing object — bid cell exists, has the customization class', async ({ page }) => {
    // The cell still renders (column-customization style is class-
    // based, not value-based). The value is just null/empty.
    const exists = await page.evaluate(() => {
      const rows = document.querySelectorAll('.ag-row[row-id="EDGE-NULL-PRICING"]');
      for (const row of rows) {
        if (row.querySelector('.ag-cell[col-id="pricing.bid"]')) return true;
      }
      return false;
    });
    expect(exists).toBe(true);
    // Class still attached even though value is null.
    const has = await cellHasClassMatching(page, 'EDGE-NULL-PRICING', 'pricing.bid', /^ds-col-c-pricing_2ebid$/);
    expect(has).toBe(true);
  });

  test('edge: missing pricing object — grid does NOT crash, other cells render', async ({ page }) => {
    const idCellText = await readCellText(page, 'EDGE-MISS-PRICING', 'id');
    expect(idCellText).toBe('EDGE-MISS-PRICING');
    // bid cell exists in DOM but value is empty.
    const has = await cellHasClassMatching(page, 'EDGE-MISS-PRICING', 'pricing.bid', /^ds-col-c-pricing_2ebid$/);
    expect(has).toBe(true);
  });

  test('edge: partial pricing (bid set, ask undefined) — bid cell renders bid value', async ({ page }) => {
    const bidText = await readCellText(page, 'EDGE-PARTIAL', 'pricing.bid');
    expect(bidText).not.toBeNull();
    expect(bidText!).not.toBe('');
    // Formatted: `▲ 99.50` (positive value → up-arrow section).
    expect(bidText!).toMatch(/^▲\s99\.50$/);
  });

  test('edge: null ratings — sp cell renders empty but still carries customization class', async ({ page }) => {
    const text = await readCellText(page, 'EDGE-NULL-RATINGS', 'ratings.sp');
    // Empty / null / undefined value — but the cell DOM exists.
    expect(['', null]).toContain(text);
    const has = await cellHasClassMatching(page, 'EDGE-NULL-RATINGS', 'ratings.sp', /^ds-col-c-ratings_2esp$/);
    expect(has).toBe(true);
  });

  test('every nested string-column cell with the encoded class also reads computed bg color', async ({ page }) => {
    // Cross-check: the CSS rule `.ds-col-c-ratings_2esp { background: #fde68a }`
    // applies to every cell carrying the class — except for
    // EDGE-NULL-RATINGS where AG-Grid still creates the cell DOM.
    const allHaveBg = await page.evaluate(() => {
      const cells = document.querySelectorAll('.ag-cell.ds-col-c-ratings_2esp');
      let mismatches = 0;
      cells.forEach((c) => {
        const bg = getComputedStyle(c as HTMLElement).backgroundColor;
        if (!/rgb\(253,\s?230,\s?138\)/.test(bg)) mismatches += 1;
      });
      return { total: cells.length, mismatches };
    });
    expect(allHaveBg.total).toBeGreaterThan(0);
    expect(allHaveBg.mismatches).toBe(0);
  });
});
