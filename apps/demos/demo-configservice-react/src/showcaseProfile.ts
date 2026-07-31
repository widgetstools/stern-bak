/**
 * Showcase profile seed.
 *
 * A pre-configured profile that exercises every visible feature of the
 * Grid Customizer against the FI trading blotter. Imported on first boot
 * (when no `showcase-demo` profile is present in Dexie) so visitors land
 * directly on a coloured, emoji-labelled, live-ticking grid rather than
 * the plain "200 rows of text" starter state.
 *
 * Contents:
 *   - Excel formatters with emoji + colour on numeric columns
 *     (price ▲/▼, yield % with semaphore, spread bps, notional $).
 *   - Conditional styling rules covering cell scope + row scope,
 *     semaphore badges, flash on tick, and indicator glyphs.
 *   - Calculated columns using SUM / AVG / MIN / MAX column aggregates.
 *
 * Shape matches ExportedProfilePayload so `ProfileManager.import(...)`
 * consumes it directly.
 */

import type { ExportedProfilePayload } from '@wellsfargo-starui/engine';

export const SHOWCASE_PROFILE_ID_HINT = 'showcase';
export const SHOWCASE_PROFILE_NAME = 'Showcase';

// Excel format tokens — square-bracket colour prefixes are an SSF
// convention; the positive / negative / zero / text sections are
// semicolon-separated. Unicode arrows render from the host font.
const fmt = {
  priceArrow: '[Green]▲ #,##0.00;[Red]▼ #,##0.00;[Blue]— 0.00',
  yieldSemaphore: '[Red]#,##0.000"%";[Green]#,##0.000"%";[Blue]0.000"%"',
  spreadBps: '[Green]+#,##0" bps";[Red]#,##0" bps";[Blue]0" bps"',
  // Notional format — the spec never fires a colour because notionals
  // are always positive; the bold-via-style rule handles large trades.
  notionalCcy: '"$"#,##0',
  quantityThousands: '#,##0',
  // Filled / quantity ratio — expression-based since it's a calc column
  pct2: '[Green]0.00"%";[Red]0.00"%";[Blue]0.00"%"',
  // Ratio with 3 decimals for qty_vs_avg — centred around 1.0
  ratio3: '0.000"×"',
};

// ─── State shapes (kept local; the types are structural only) ──────────

interface ShowcaseSnapshot {
  name: string;
  gridId: string;
  state: Record<string, { v: number; data: unknown }>;
}

// ─── Column customization assignments ──────────────────────────────────

const columnCustomizationState = {
  assignments: {
    price: {
      colId: 'price',
      valueFormatterTemplate: { kind: 'excelFormat' as const, format: fmt.priceArrow },
      cellStyleOverrides: {
        alignment: { horizontal: 'right' as const },
        typography: { bold: true },
      },
    },
    yield: {
      colId: 'yield',
      valueFormatterTemplate: { kind: 'excelFormat' as const, format: fmt.yieldSemaphore },
      cellStyleOverrides: {
        alignment: { horizontal: 'right' as const },
      },
    },
    spread: {
      colId: 'spread',
      valueFormatterTemplate: { kind: 'excelFormat' as const, format: fmt.spreadBps },
      cellStyleOverrides: {
        alignment: { horizontal: 'right' as const },
      },
    },
    notional: {
      colId: 'notional',
      valueFormatterTemplate: { kind: 'excelFormat' as const, format: fmt.notionalCcy },
      cellStyleOverrides: {
        alignment: { horizontal: 'right' as const },
        typography: { bold: true },
      },
    },
    quantity: {
      colId: 'quantity',
      valueFormatterTemplate: { kind: 'excelFormat' as const, format: fmt.quantityThousands },
      cellStyleOverrides: {
        alignment: { horizontal: 'right' as const },
      },
    },
    filled: {
      colId: 'filled',
      valueFormatterTemplate: { kind: 'excelFormat' as const, format: fmt.quantityThousands },
      cellStyleOverrides: {
        alignment: { horizontal: 'right' as const },
      },
    },
    side: {
      colId: 'side',
      cellStyleOverrides: {
        alignment: { horizontal: 'center' as const },
        typography: { bold: true },
      },
    },
    status: {
      colId: 'status',
      cellStyleOverrides: {
        alignment: { horizontal: 'center' as const },
        typography: { bold: true },
      },
    },
  },
};

// ─── Conditional styling rules ─────────────────────────────────────────
//
// Rule ordering — lower `priority` runs first, so later rules win on
// conflict. We intentionally stack row-scope BEFORE cell-scope so a
// matching cell paint overrides a row tint on its own column.

const conditionalStylingState = {
  rules: [
    // ─── Row tint: FILLED orders fade to a subtle green wash ───────
    {
      id: 'rule-row-filled',
      name: '✓ FILLED — row tint',
      enabled: true,
      priority: 10,
      scope: { type: 'row' as const },
      expression: "[status] == 'FILLED'",
      style: {
        light: { backgroundColor: 'rgba(20, 184, 166, 0.06)' },
        dark: { backgroundColor: 'rgba(45, 212, 191, 0.08)' },
      },
    },
    // ─── Row tint: CANCELLED orders grey out ───────────────────────
    {
      id: 'rule-row-cancelled',
      name: '✗ CANCELLED — row tint',
      enabled: true,
      priority: 15,
      scope: { type: 'row' as const },
      expression: "[status] == 'CANCELLED'",
      style: {
        light: { backgroundColor: 'rgba(100, 116, 139, 0.08)', color: '#94a3b8' },
        dark: { backgroundColor: 'rgba(71, 85, 105, 0.20)', color: '#64748b' },
      },
    },
    // ─── Cell paint: BUY side — green badge ────────────────────────
    {
      id: 'rule-side-buy',
      name: 'BUY badge',
      enabled: true,
      priority: 20,
      scope: { type: 'cell' as const, columns: ['side'] },
      expression: "[side] == 'BUY'",
      style: {
        light: { backgroundColor: '#059669', color: '#ffffff', fontWeight: '700' },
        dark: { backgroundColor: '#0d9488', color: '#ffffff', fontWeight: '700' },
      },
      indicator: { icon: 'trending-up', color: '#ffffff', target: 'cells' as const, position: 'top-left' as const },
    },
    // ─── Cell paint: SELL side — red badge ─────────────────────────
    {
      id: 'rule-side-sell',
      name: 'SELL badge',
      enabled: true,
      priority: 21,
      scope: { type: 'cell' as const, columns: ['side'] },
      expression: "[side] == 'SELL'",
      style: {
        light: { backgroundColor: '#dc2626', color: '#ffffff', fontWeight: '700' },
        dark: { backgroundColor: '#b91c1c', color: '#ffffff', fontWeight: '700' },
      },
      indicator: { icon: 'trending-down', color: '#ffffff', target: 'cells' as const, position: 'top-left' as const },
    },
    // ─── Cell paint: status column semaphore ───────────────────────
    {
      id: 'rule-status-filled',
      name: 'Status FILLED',
      enabled: true,
      priority: 25,
      scope: { type: 'cell' as const, columns: ['status'] },
      expression: "[status] == 'FILLED'",
      style: {
        light: { color: '#047857', fontWeight: '700' },
        dark: { color: '#34d399', fontWeight: '700' },
      },
      indicator: { icon: 'check', target: 'cells' as const, position: 'top-right' as const },
    },
    {
      id: 'rule-status-partial',
      name: 'Status PARTIAL',
      enabled: true,
      priority: 26,
      scope: { type: 'cell' as const, columns: ['status'] },
      expression: "[status] == 'PARTIAL'",
      style: {
        light: { color: '#b45309', fontWeight: '700' },
        dark: { color: '#fbbf24', fontWeight: '700' },
      },
      indicator: { icon: 'clock', target: 'cells' as const, position: 'top-right' as const },
    },
    {
      id: 'rule-status-open',
      name: 'Status OPEN',
      enabled: true,
      priority: 27,
      scope: { type: 'cell' as const, columns: ['status'] },
      expression: "[status] == 'OPEN'",
      style: {
        light: { color: '#1d4ed8', fontWeight: '700' },
        dark: { color: '#60a5fa', fontWeight: '700' },
      },
    },
    // ─── Flash on tick: price changes pulse with colour ────────────
    {
      id: 'rule-price-flash',
      name: '⚡ Price tick — flash',
      enabled: true,
      priority: 30,
      scope: { type: 'cell' as const, columns: ['price'] },
      // Always true so every tick flashes. The flash config handles
      // the visible pulse; the style section is empty so we don't
      // override the formatter's red/green colour.
      expression: '[price] > 0',
      style: { light: {}, dark: {} },
      flash: { enabled: true, target: 'cells' as const, flashDuration: 300, fadeDuration: 700 },
    },
    // ─── Cell paint: big-money trades (notional > 3M) bold + gold ──
    {
      id: 'rule-notional-big',
      name: '💰 Whale trade (>3M)',
      enabled: true,
      priority: 40,
      scope: { type: 'cell' as const, columns: ['notional'] },
      expression: '[notional] > 3000000',
      style: {
        light: { backgroundColor: '#fef3c7', color: '#92400e', fontWeight: '700' },
        dark: { backgroundColor: 'rgba(245, 158, 11, 0.22)', color: '#fcd34d', fontWeight: '700' },
      },
      indicator: { icon: 'star', color: '#f59e0b', target: 'cells+headers' as const, position: 'top-right' as const },
    },
    // ─── Cell paint: wide spread (>80 bps) — risk flag ─────────────
    {
      id: 'rule-spread-wide',
      name: '🚨 Wide spread (>80 bps)',
      enabled: true,
      priority: 45,
      scope: { type: 'cell' as const, columns: ['spread'] },
      expression: '[spread] > 80',
      style: {
        light: { backgroundColor: '#fecaca', color: '#991b1b', fontWeight: '700' },
        dark: { backgroundColor: 'rgba(220, 38, 38, 0.25)', color: '#fca5a5', fontWeight: '700' },
      },
      indicator: { icon: 'alert-triangle', color: '#ef4444', target: 'cells' as const, position: 'top-right' as const },
      flash: { enabled: true, target: 'cells' as const, flashDuration: 400, fadeDuration: 900 },
    },
    // ─── Cell paint: tight/negative spread — opportunity flag ──────
    {
      id: 'rule-spread-tight',
      name: 'Tight spread (<0 bps)',
      enabled: true,
      priority: 46,
      scope: { type: 'cell' as const, columns: ['spread'] },
      expression: '[spread] < 0',
      style: {
        light: { backgroundColor: '#d1fae5', color: '#065f46' },
        dark: { backgroundColor: 'rgba(16, 185, 129, 0.20)', color: '#6ee7b7' },
      },
    },
    // ─── Yield threshold highlight — HY yields (>5%) ───────────────
    {
      id: 'rule-yield-hy',
      name: 'High yield (>5%)',
      enabled: true,
      priority: 50,
      scope: { type: 'cell' as const, columns: ['yield'] },
      expression: '[yield] > 5',
      style: {
        light: { backgroundColor: '#fef9c3' },
        dark: { backgroundColor: 'rgba(250, 204, 21, 0.18)' },
      },
    },
  ],
};

// ─── Calculated columns — aggregate-driven ratios ──────────────────────

const calculatedColumnsState = {
  virtualColumns: [
    {
      colId: 'notionalPctOfTotal',
      headerName: '% of Book',
      expression: '[notional] / SUM([notional]) * 100',
      valueFormatterTemplate: { kind: 'excelFormat' as const, format: fmt.pct2 },
      cellDataType: 'percent' as const,
      position: 20,
      initialWidth: 110,
    },
    {
      colId: 'qtyVsAvg',
      headerName: 'Qty ÷ Avg',
      expression: '[quantity] / AVG([quantity])',
      valueFormatterTemplate: { kind: 'excelFormat' as const, format: fmt.ratio3 },
      cellDataType: 'number' as const,
      position: 21,
      initialWidth: 100,
    },
    {
      colId: 'pxVsMax',
      headerName: 'Px ÷ Max',
      expression: '[price] / MAX([price]) * 100',
      valueFormatterTemplate: { kind: 'excelFormat' as const, format: fmt.pct2 },
      cellDataType: 'percent' as const,
      position: 22,
      initialWidth: 100,
    },
    {
      colId: 'spreadVsMin',
      headerName: 'Spread − Min',
      expression: '[spread] - MIN([spread])',
      valueFormatterTemplate: { kind: 'excelFormat' as const, format: fmt.spreadBps },
      cellDataType: 'number' as const,
      position: 23,
      initialWidth: 120,
    },
    {
      colId: 'fillPct',
      headerName: '% Filled',
      expression: '[filled] / [quantity] * 100',
      valueFormatterTemplate: { kind: 'excelFormat' as const, format: fmt.pct2 },
      cellDataType: 'percent' as const,
      position: 24,
      initialWidth: 100,
    },
  ],
};

// ─── Assembled snapshot ────────────────────────────────────────────────

function buildSnapshot(gridId: string): ShowcaseSnapshot {
  return {
    name: SHOWCASE_PROFILE_NAME,
    gridId,
    state: {
      'column-customization': { v: 1, data: columnCustomizationState },
      'conditional-styling': { v: 1, data: conditionalStylingState },
      'calculated-columns': { v: 1, data: calculatedColumnsState },
    },
  };
}

/**
 * Produce an ExportedProfilePayload ready to hand to
 * `ProfileManager.import(payload, { name: 'Showcase' })`.
 */
export function buildShowcasePayload(gridId: string): ExportedProfilePayload {
  const snap = buildSnapshot(gridId);
  return {
    schemaVersion: 1,
    kind: 'gc-profile',
    exportedAt: new Date().toISOString(),
    profile: snap,
  };
}
