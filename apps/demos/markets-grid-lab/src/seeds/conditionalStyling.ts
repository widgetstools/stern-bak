import type { ConditionalRule } from '@wellsfargo-starui/grid/customizer';

// ─── Expression syntax ───────────────────────────────────────────────
//
// `value` (also `x`) — the cell's current rendered value (variable).
// `[columnId]`        — read another column's value on the same row.
// `data.fieldPath`    — dotted path into the raw row object.
//
// `[value]` would resolve to a column with id "value" (which doesn't
// exist) and yield null, so the predicate would silently always fail.
// Don't use it.

// ─── Reusable style fragments ────────────────────────────────────────

const styleNegativeBold = {
  dark:  { color: '#ee8e8e', fontWeight: '600' },
  light: { color: '#a02a2a', fontWeight: '600' },
};
const stylePositiveBold = {
  dark:  { color: '#7fdf9b', fontWeight: '600' },
  light: { color: '#1f7a34', fontWeight: '600' },
};
const styleAmberBg = {
  dark:  { backgroundColor: '#3a3010', color: '#f0d878' },
  light: { backgroundColor: '#fbf0cf', color: '#5d4d10' },
};
const styleRoseBg = {
  dark:  { backgroundColor: '#3a1818', color: '#ee8e8e', fontWeight: '600' },
  light: { backgroundColor: '#fcdada', color: '#7a1f1f', fontWeight: '600' },
};
const styleEmeraldBg = {
  dark:  { backgroundColor: '#0f2b1c', color: '#7fdf9b' },
  light: { backgroundColor: '#e8f4ec', color: '#1f5d34' },
};

// ─── Indicator placement rule ────────────────────────────────────────
//
// Indicators sit on the OPPOSITE side of the cell/header content
// alignment so the badge never covers the value or header label:
//
//   numeric / right-aligned cells  → indicator on the LEFT side
//   text / left-aligned cells      → indicator on the RIGHT side
//
// `cells+headers` rules pick the same side as the cell — numeric
// columns have numeric (right-aligned) headers too.

// ─── Overview tab — kitchen-sink ────────────────────────────────────

export const OVERVIEW_CS_RULES: ConditionalRule[] = [
  {
    id: 'losers',
    name: 'Losers',
    enabled: true,
    priority: 10,
    scope: { type: 'cell', columns: ['dailyPnL', 'unrealizedPnL'] },
    expression: 'value < 0',
    style: styleNegativeBold,
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'rose', durationMs: 600 },
    // numeric (right-aligned) → indicator on LEFT
    indicator: { icon: 'arrow-down', position: 'top-left', target: 'cells', color: '#ee8e8e' },
  },
  {
    id: 'winners',
    name: 'Winners',
    enabled: true,
    priority: 10,
    scope: { type: 'cell', columns: ['dailyPnL', 'unrealizedPnL'] },
    expression: 'value > 0',
    style: stylePositiveBold,
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'emerald', durationMs: 600 },
    // numeric (right-aligned) → indicator on LEFT
    indicator: { icon: 'arrow-up', position: 'top-left', target: 'cells', color: '#7fdf9b' },
  },
  {
    id: 'high-yield-watch',
    name: 'High-yield watch',
    enabled: true,
    priority: 20,
    scope: { type: 'cell', columns: ['yieldToWorst'] },
    expression: 'value > 8',
    style: styleAmberBg,
    // numeric (right-aligned) → indicator on LEFT
    indicator: { icon: 'flame', position: 'top-left', target: 'cells+headers', color: '#f0a576' },
  },
  {
    id: 'wide-spread',
    name: 'Wide bid/ask',
    enabled: true,
    priority: 15,
    scope: { type: 'cell', columns: ['bidAskWidthBps'] },
    expression: 'value > 10',
    style: styleAmberBg,
    // numeric (right-aligned) → indicator on LEFT
    indicator: { icon: 'alert-triangle', position: 'bottom-left', target: 'cells', color: '#f0a576' },
  },
  {
    id: 'junk-rating',
    name: 'Junk-rated row',
    enabled: true,
    priority: 30,
    scope: { type: 'row' },
    expression: "data.compositeRating in ['BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC']",
    style: {
      dark:  { backgroundColor: '#2a1010' },
      light: { backgroundColor: '#fbeaea' },
    },
  },
  {
    id: 'price-changed',
    name: 'Price changed (tick flash)',
    enabled: true,
    priority: 8,
    scope: { type: 'cell', columns: ['bidPrice', 'midPrice', 'askPrice', 'lastPrice'] },
    expression: 'value != null',
    style: { dark: {}, light: {} },
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'sky', durationMs: 500 },
    activeDurationMs: 500,
  },
  {
    id: 'wide-spread-expr',
    name: 'Wide spread (cross-field)',
    enabled: true,
    priority: 18,
    scope: { type: 'cell', columns: ['bidAskWidthBps'] },
    expression: '([askPrice] - [bidPrice]) > 0.10',
    style: styleAmberBg,
    indicator: { icon: 'alert-triangle', position: 'bottom-left', target: 'cells', color: '#f0a576' },
  },
  {
    id: 'mtd-loser',
    name: 'MTD loser',
    enabled: true,
    priority: 12,
    scope: { type: 'cell', columns: ['mtdPnL', 'ytdPnL'] },
    expression: 'value < 0',
    style: styleNegativeBold,
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'rose', durationMs: 700 },
  },
];

// ─── Conditional Styling tab — one rule per feature ─────────────────

export const CONDITIONAL_TAB_CS_RULES: ConditionalRule[] = [
  {
    id: 'demo-cell-color',
    name: '1 · Cell color rule (winners)',
    enabled: true,
    priority: 10,
    scope: { type: 'cell', columns: ['dailyPnL', 'unrealizedPnL'] },
    expression: 'value > 0',
    style: styleEmeraldBg,
  },
  {
    id: 'demo-cell-color-loser',
    name: '2 · Cell color rule (losers)',
    enabled: true,
    priority: 10,
    scope: { type: 'cell', columns: ['dailyPnL', 'unrealizedPnL'] },
    expression: 'value < 0',
    style: styleRoseBg,
  },
  {
    id: 'demo-flash-oneshot',
    name: '3 · One-shot flash on big tick',
    enabled: true,
    priority: 5,
    scope: { type: 'cell', columns: ['priceChangePct'] },
    expression: 'value > 0.02 || value < -0.02',
    style: { dark: {}, light: {} },
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'sky', durationMs: 500 },
  },
  {
    id: 'demo-flash-pulse',
    name: '4 · Pulse flash while in alarm (YTW > 8)',
    enabled: true,
    priority: 15,
    scope: { type: 'cell', columns: ['yieldToWorst'] },
    expression: 'value > 8',
    style: styleAmberBg,
    flash: { enabled: true, target: 'cells', mode: 'pulse', color: 'amber', durationMs: 1200 },
    // yieldToWorst is numeric (right-aligned) → indicator LEFT
    indicator: { icon: 'flame', position: 'top-left', target: 'cells+headers', color: '#f0a576' },
  },
  {
    id: 'demo-row-rule',
    name: '5 · Row-level rule (junk rating row)',
    enabled: true,
    priority: 30,
    scope: { type: 'row' },
    expression: "data.compositeRating in ['BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC']",
    style: {
      dark:  { backgroundColor: '#2a1010' },
      light: { backgroundColor: '#fbeaea' },
    },
  },
  {
    id: 'demo-indicator-tr',
    name: '6 · Indicator top-right on text col (callable bonds)',
    enabled: true,
    priority: 20,
    scope: { type: 'cell', columns: ['compositeRating'] },
    expression: 'data.callable == true',
    style: { dark: {}, light: {} },
    // compositeRating is text (left-aligned) → indicator RIGHT
    indicator: { icon: 'bell', position: 'top-right', target: 'cells', color: '#7cc7f9' },
  },
  {
    id: 'demo-indicator-bl',
    name: '7 · Indicator bottom-left + header on numeric col (wide spread)',
    enabled: true,
    priority: 18,
    scope: { type: 'cell', columns: ['bidAskWidthBps'] },
    expression: 'value > 10',
    style: styleAmberBg,
    // bidAskWidthBps is numeric (right-aligned) → indicator LEFT
    indicator: { icon: 'alert-triangle', position: 'bottom-left', target: 'cells+headers', color: '#f0a576' },
  },
  {
    id: 'demo-headers-only',
    name: '8 · Headers-only indicator (negative YTD P&L)',
    enabled: true,
    priority: 25,
    scope: { type: 'cell', columns: ['ytdPnL'] },
    expression: 'value < 0',
    style: { dark: {}, light: {} },
    // ytdPnL header is right-aligned (numericColumn) → indicator LEFT
    indicator: { icon: 'trending-down', position: 'left-middle', target: 'headers', color: '#ee8e8e' },
  },
  {
    id: 'demo-active-window',
    name: '9 · activeDurationMs — style window on tick',
    enabled: true,
    priority: 8,
    scope: { type: 'cell', columns: ['midPrice'] },
    expression: 'value > 102',
    style: {
      dark:  { backgroundColor: '#0e3046', color: '#7cc7f9' },
      light: { backgroundColor: '#dbeefd', color: '#0f4d75' },
    },
    activeDurationMs: 1500,
  },
  // ─── Diff-aware rules (column.old vs column.new) ──────────────
  {
    id: 'demo-diff-up',
    name: '10 · Diff up — midPrice ticked higher (1.5 s window)',
    enabled: true,
    priority: 6,
    scope: { type: 'cell', columns: ['midPrice'] },
    expression: '[midPrice.new] > [midPrice.old]',
    style: {
      dark:  { backgroundColor: '#0f2b1c', color: '#7fdf9b', fontWeight: '600' },
      light: { backgroundColor: '#e8f4ec', color: '#1f7a34', fontWeight: '600' },
    },
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'emerald', durationMs: 500 },
    indicator: { icon: 'arrow-up', position: 'top-left', target: 'cells', color: '#7fdf9b' },
    // Style + indicator live for 1.5 s after the tick, then revert.
    activeDurationMs: 1500,
  },
  {
    id: 'demo-diff-down',
    name: '11 · Diff down — midPrice ticked lower (1.5 s window)',
    enabled: true,
    priority: 6,
    scope: { type: 'cell', columns: ['midPrice'] },
    expression: '[midPrice.new] < [midPrice.old]',
    style: {
      dark:  { backgroundColor: '#3a1818', color: '#ee8e8e', fontWeight: '600' },
      light: { backgroundColor: '#fcdada', color: '#a02a2a', fontWeight: '600' },
    },
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'rose', durationMs: 500 },
    indicator: { icon: 'arrow-down', position: 'top-left', target: 'cells', color: '#ee8e8e' },
    activeDurationMs: 1500,
  },
  {
    id: 'demo-diff-big',
    name: '12 · Big tick — |Δ| > 0.05 (2.5 s window, header indicator)',
    enabled: true,
    priority: 7,
    scope: { type: 'cell', columns: ['midPrice', 'bidPrice', 'askPrice'] },
    expression: 'ABS([midPrice.new] - [midPrice.old]) > 0.05',
    style: {
      dark:  { backgroundColor: '#3a3010', color: '#f0d878', fontWeight: '700' },
      light: { backgroundColor: '#fbf0cf', color: '#5d4d10', fontWeight: '700' },
    },
    flash: { enabled: true, target: 'cells+headers', mode: 'oneShot', color: 'amber', durationMs: 800 },
    indicator: { icon: 'zap', position: 'top-left', target: 'cells+headers', color: '#f0a576' },
    activeDurationMs: 2500,
  },
  {
    id: 'demo-diff-yield',
    name: '13 · Yield direction — colour cell + flash header on every tick',
    enabled: true,
    priority: 7,
    scope: { type: 'cell', columns: ['yieldToMaturity'] },
    expression: '[yieldToMaturity.new] != [yieldToMaturity.old]',
    style: { dark: {}, light: {} },
    flash: { enabled: true, target: 'cells+headers', mode: 'oneShot', color: 'sky', durationMs: 600 },
    activeDurationMs: 600,
  },
];

// ─── Live updates tab ───────────────────────────────────────────────

export const LIVE_TAB_CS_RULES: ConditionalRule[] = [
  {
    id: 'live-tick-flash',
    name: 'Tick flash · prices',
    enabled: true,
    priority: 5,
    scope: { type: 'cell', columns: ['bidPrice', 'midPrice', 'askPrice', 'lastPrice'] },
    expression: 'value != null',
    style: { dark: {}, light: {} },
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'sky', durationMs: 400 },
    activeDurationMs: 400,
  },
  {
    id: 'live-winners',
    name: 'Winners',
    enabled: true,
    priority: 10,
    scope: { type: 'cell', columns: ['dailyPnL', 'unrealizedPnL', 'mtdPnL', 'ytdPnL', 'priceChangePct'] },
    expression: 'value > 0',
    style: stylePositiveBold,
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'emerald', durationMs: 600 },
    indicator: { icon: 'arrow-up', position: 'top-left', target: 'cells', color: '#7fdf9b' },
  },
  {
    id: 'live-losers',
    name: 'Losers',
    enabled: true,
    priority: 10,
    scope: { type: 'cell', columns: ['dailyPnL', 'unrealizedPnL', 'mtdPnL', 'ytdPnL', 'priceChangePct'] },
    expression: 'value < 0',
    style: styleNegativeBold,
    flash: { enabled: true, target: 'cells', mode: 'oneShot', color: 'rose', durationMs: 600 },
    indicator: { icon: 'arrow-down', position: 'top-left', target: 'cells', color: '#ee8e8e' },
  },
  {
    id: 'live-big-tick',
    name: 'Big mid tick (|Δ| > 0.08)',
    enabled: true,
    priority: 7,
    scope: { type: 'cell', columns: ['midPrice'] },
    expression: 'ABS([midPrice.new] - [midPrice.old]) > 0.08',
    style: {
      dark:  { backgroundColor: '#3a3010', color: '#f0d878', fontWeight: '700' },
      light: { backgroundColor: '#fbf0cf', color: '#5d4d10', fontWeight: '700' },
    },
    flash: { enabled: true, target: 'cells+headers', mode: 'oneShot', color: 'amber', durationMs: 700 },
    activeDurationMs: 2000,
  },
];
