import type {
  ColumnAssignment,
  ColumnCustomizationState,
} from '@wellsfargo-starui/grid/customizer';
import type { ValueFormatterTemplate } from '@wellsfargo-starui/core';

// Helper builders so seed entries stay readable.
function tpl(t: ValueFormatterTemplate): ValueFormatterTemplate { return t; }

// ─── Preset formatters (Intl.*) ──────────────────────────────────────

const number2 = tpl({ kind: 'preset', preset: 'number',
  options: { minimumFractionDigits: 2, maximumFractionDigits: 2 } });
const number3 = tpl({ kind: 'preset', preset: 'number',
  options: { minimumFractionDigits: 3, maximumFractionDigits: 3 } });
const number4 = tpl({ kind: 'preset', preset: 'number',
  options: { minimumFractionDigits: 4, maximumFractionDigits: 4 } });
const dateISO = tpl({ kind: 'preset', preset: 'date',
  options: { year: 'numeric', month: '2-digit', day: '2-digit' } });
const tick32 = tpl({ kind: 'tick', tick: 'TICK32' });

// ─── Excel format strings ────────────────────────────────────────────
//
// Each string showcases a different ssf/Excel capability. Section
// rules: `positive ; negative ; zero ; text`. Color tags `[Red]`,
// `[Green]`, `[Blue]`, `[Yellow]`, `[Cyan]`, `[Magenta]`, `[Black]`,
// `[White]` resolve to design-system tokens (positive/negative/info/
// warning) so they look right under both dark and light themes.

const xlSignedArrows = tpl({ kind: 'excelFormat',
  format: '[Green]"▲ "#,##0.00;[Red]"▼ "#,##0.00;"—"' });
const xlMoneyEmoji = tpl({ kind: 'excelFormat',
  format: '"💰 "$#,##0' });
const xlPercentColored = tpl({ kind: 'excelFormat',
  format: '[Green]+0.000%;[Red]-0.000%;"·"' });
const xlBpsFlame = tpl({ kind: 'excelFormat',
  format: '[Yellow]"🔥 "0.00" bps"' });
const xlTieredM = tpl({ kind: 'excelFormat',
  // Magnitude tiers: ≥1M renders as "💎 12.3M", ≥1K renders as "12.3K",
  // otherwise plain integer. Comma-after-token = "divide by thousand".
  format: '[>=1000000][Green]"💎 "#,##0.0,,"M";[>=1000][Blue]#,##0.0,"K";#,##0' });
const xlCheckCross = tpl({ kind: 'excelFormat',
  format: '[Green]"✓ "#,##0;[Red]"✗ "#,##0;"-"' });
const xlBoltBps = tpl({ kind: 'excelFormat',
  format: '"⚡ "0.00" bps"' });
const xlChartPercent = tpl({ kind: 'excelFormat',
  format: '"📊 "0.000%' });
const xlConvexity = tpl({ kind: 'excelFormat',
  format: '[Cyan]"~ "0.00;[Magenta]"~ "-0.00;"~"' });
const xlAccrued = tpl({ kind: 'excelFormat',
  format: '"💵 "$#,##0.0000' });
const xlMaturityDate = tpl({ kind: 'excelFormat',
  format: '"📅 "yyyy-mm-dd' });

import { bgText } from './styleHelpers';

// ─── Formatting tab — Excel + preset showcase ────────────────────────
//
// Every assignment demonstrates a different formatter facet. Header
// names are renamed to call out the kind of format in use, so the
// user can SEE what each column is doing without opening the editor.

export const FORMATTING_ASSIGNMENTS: Record<string, ColumnAssignment> = {
  // ── Preset · Number ────────────────────────────────────────────
  bidPrice:  { colId: 'bidPrice',  valueFormatterTemplate: number3, initialWidth: 100, headerName: 'Bid (3dp)' },
  midPrice:  { colId: 'midPrice',  valueFormatterTemplate: number3, initialWidth: 100, headerName: 'Mid (3dp)' },
  askPrice:  { colId: 'askPrice',  valueFormatterTemplate: number4, initialWidth: 110, headerName: 'Ask (4dp)' },

  // ── Tick · US-Treasury 32nds ──────────────────────────────────
  lastPrice: { colId: 'lastPrice', valueFormatterTemplate: tick32,  initialWidth: 120, headerName: 'Last (32nds)' },

  // ── Excel · Directional arrows with colour ────────────────────
  priceChange: { colId: 'priceChange', valueFormatterTemplate: xlSignedArrows, initialWidth: 130, headerName: 'Δ Px (▲/▼)' },

  // ── Excel · Coloured percent with sign prefix ─────────────────
  priceChangePct: { colId: 'priceChangePct', valueFormatterTemplate: xlPercentColored, initialWidth: 130, headerName: 'Δ % (signed)' },

  // ── Excel · Chart emoji prefix on percent ─────────────────────
  yieldToMaturity: { colId: 'yieldToMaturity', valueFormatterTemplate: xlChartPercent, initialWidth: 130, headerName: 'YTM 📊' },
  yieldToWorst:    { colId: 'yieldToWorst',    valueFormatterTemplate: xlChartPercent, initialWidth: 130, headerName: 'YTW 📊' },
  currentYield:    { colId: 'currentYield',    valueFormatterTemplate: xlChartPercent, initialWidth: 130, headerName: 'Curr Yld 📊' },

  // ── Excel · Coloured BPS with fire/bolt emoji ────────────────
  oas:     { colId: 'oas',     valueFormatterTemplate: xlBpsFlame, initialWidth: 120, headerName: 'OAS 🔥' },
  zSpread: { colId: 'zSpread', valueFormatterTemplate: xlBoltBps,  initialWidth: 120, headerName: 'Z-spr ⚡' },

  // ── Excel · Diverging colours (Cyan/Magenta) ─────────────────
  convexity: { colId: 'convexity', valueFormatterTemplate: xlConvexity, initialWidth: 110, headerName: 'Convex ~' },

  // ── Preset · Number, 2-dp default for risk ────────────────────
  modifiedDuration: { colId: 'modifiedDuration', valueFormatterTemplate: number2, initialWidth: 90, headerName: 'Dur' },
  dv01:             { colId: 'dv01',             valueFormatterTemplate: number4, initialWidth: 100, headerName: 'DV01' },

  // ── Excel · Money emoji + tiered K/M ──────────────────────────
  marketValue:  { colId: 'marketValue',  valueFormatterTemplate: xlTieredM,  initialWidth: 150, headerName: 'Mkt Val 💎' },
  quantityFace: { colId: 'quantityFace', valueFormatterTemplate: xlMoneyEmoji, initialWidth: 140, headerName: 'Qty 💰' },
  avgCost:      { colId: 'avgCost',      valueFormatterTemplate: number3,      initialWidth: 110, headerName: 'Avg Cost' },
  accruedInterest: { colId: 'accruedInterest', valueFormatterTemplate: xlAccrued, initialWidth: 130, headerName: 'Accrued 💵' },

  // ── Excel · Check/cross on P&L ─────────────────────────────────
  unrealizedPnL: { colId: 'unrealizedPnL', valueFormatterTemplate: xlCheckCross, initialWidth: 150, headerName: 'Unreal ✓/✗' },
  dailyPnL:      { colId: 'dailyPnL',      valueFormatterTemplate: xlCheckCross, initialWidth: 130, headerName: 'P&L (D) ✓/✗' },
  mtdPnL:        { colId: 'mtdPnL',        valueFormatterTemplate: xlCheckCross, initialWidth: 140, headerName: 'P&L (MTD) ✓/✗' },
  ytdPnL:        { colId: 'ytdPnL',        valueFormatterTemplate: xlSignedArrows, initialWidth: 150, headerName: 'P&L (YTD) ▲/▼' },

  // ── Excel · Calendar emoji on dates ───────────────────────────
  maturityDate: { colId: 'maturityDate', valueFormatterTemplate: xlMaturityDate, initialWidth: 150, headerName: 'Maturity 📅' },
  issueDate:    { colId: 'issueDate',    valueFormatterTemplate: dateISO,        initialWidth: 130, headerName: 'Issued' },

  // ── Color overrides — themed (no formatter — just style) ──────
  compositeRating: {
    colId: 'compositeRating',
    cellStyleOverrides: bgText('#0e3046', '#dbeefd', '#7cc7f9', '#0f4d75'),
    headerStyleOverrides: {
      dark:  { colors: { background: '#0e3046', text: '#7cc7f9' }, typography: { bold: true } },
      light: { colors: { background: '#dbeefd', text: '#0f4d75' }, typography: { bold: true } },
    },
    initialWidth: 95,
  },
  issuerSector: {
    colId: 'issuerSector',
    cellStyleOverrides: bgText('#102e22', '#d8edd9', '#79d3a3', '#1d5b2f'),
    initialWidth: 140,
  },
  currency: {
    colId: 'currency',
    cellStyleOverrides: bgText('#23123a', '#ebdcf8', '#b88bf0', '#4e1b86'),
    initialWidth: 80,
  },
};

export const FORMATTING_CC_STATE: ColumnCustomizationState = {
  assignments: FORMATTING_ASSIGNMENTS,
  // Default formatter for any NUMBER column that doesn't carry its own.
  globalCellNumberFormatter: number2,
  // Default date formatter applied to date columns without an explicit setting.
  globalCellDateFormatter: dateISO,
};

// ─── Overview tab — lighter touch (Excel-coloured P&L) ──────────────

const xlPnlSignedCurrency = tpl({ kind: 'excelFormat',
  format: '[Green]"+"$#,##0;[Red]-$#,##0;$0' });

export const OVERVIEW_CC_STATE: ColumnCustomizationState = {
  assignments: {
    bidPrice:        { colId: 'bidPrice',        valueFormatterTemplate: number3 },
    midPrice:        { colId: 'midPrice',        valueFormatterTemplate: number3 },
    askPrice:        { colId: 'askPrice',        valueFormatterTemplate: number3 },
    yieldToMaturity: { colId: 'yieldToMaturity', valueFormatterTemplate: xlChartPercent },
    yieldToWorst:    { colId: 'yieldToWorst',    valueFormatterTemplate: xlChartPercent },
    oas:             { colId: 'oas',             valueFormatterTemplate: xlBpsFlame },
    unrealizedPnL:   { colId: 'unrealizedPnL',   valueFormatterTemplate: xlPnlSignedCurrency },
    dailyPnL:        { colId: 'dailyPnL',        valueFormatterTemplate: xlPnlSignedCurrency },
    mtdPnL:          { colId: 'mtdPnL',          valueFormatterTemplate: xlPnlSignedCurrency },
    ytdPnL:          { colId: 'ytdPnL',          valueFormatterTemplate: xlPnlSignedCurrency },
    maturityDate:    { colId: 'maturityDate',    valueFormatterTemplate: dateISO },
  },
};
