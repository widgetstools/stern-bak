/**
 * Pre-configured profile bundles that drive the `?view=fixture&f=<name>`
 * route in `App.tsx`. Each fixture gets:
 *
 *   - a unique gridId (so parallel Playwright workers can't collide
 *     in IndexedDB across fixtures within the same browser context),
 *   - a fresh ExportedProfilePayload that exercises one slice of the
 *     pipeline (formatter / cond-cell / cond-row / calc / groups), or
 *   - a kitchen-sink combo that turns every slice on at once.
 *
 * Profile shape mirrors `showcaseProfile.ts` exactly — the only
 * difference is the gridId and the per-module data, which references
 * dot-notation colIds (`pricing.bid`, `ratings.sp`, …) so the recent
 * `cssEscapeColId` + `getValueByPath` fixes have a target to land on.
 */

import type { ExportedProfilePayload } from '@wellsfargo-starui/engine';

export type FixtureName =
  | 'formatter'
  | 'cond-cell'
  | 'cond-row'
  | 'calc'
  | 'groups'
  | 'kitchen-sink';

export interface FixtureSpec {
  name: FixtureName;
  label: string;
  gridId: string;
  /** Seeded directly into Dexie under `profile.id = `${name}-profile`. */
  profile: ExportedProfilePayload;
}

// ─── Format tokens (shared by formatter + kitchen-sink) ───────────────

const FMT = {
  // Two-decimal price with up/down arrow + colour
  priceArrow: '[Green]▲ #,##0.00;[Red]▼ #,##0.00;[Blue]— 0.00',
  // DV01 thousands with 2 dp
  dv01: '#,##0.00',
  // Convexity 3 dp ratio
  ratio3: '0.000',
} as const;

function envelope(state: Record<string, unknown>): Record<string, { v: number; data: unknown }> {
  const out: Record<string, { v: number; data: unknown }> = {};
  for (const [k, v] of Object.entries(state)) out[k] = { v: 1, data: v };
  return out;
}

function payload(gridId: string, name: string, state: Record<string, unknown>): ExportedProfilePayload {
  return {
    schemaVersion: 1,
    kind: 'gc-profile',
    exportedAt: new Date().toISOString(),
    profile: { name, gridId, state: envelope(state) },
  };
}

// ─── Per-fixture state builders ───────────────────────────────────────

const formatterState = {
  'column-customization': {
    assignments: {
      'pricing.bid': {
        colId: 'pricing.bid',
        valueFormatterTemplate: { kind: 'excelFormat' as const, format: FMT.priceArrow },
        cellStyleOverrides: { alignment: { horizontal: 'right' as const }, typography: { bold: true } },
      },
      'pricing.ask': {
        colId: 'pricing.ask',
        valueFormatterTemplate: { kind: 'excelFormat' as const, format: FMT.priceArrow },
        cellStyleOverrides: { alignment: { horizontal: 'right' as const } },
      },
      'pricing.mid': {
        colId: 'pricing.mid',
        valueFormatterTemplate: { kind: 'excelFormat' as const, format: FMT.priceArrow },
        cellStyleOverrides: { alignment: { horizontal: 'right' as const } },
      },
      'risk.dv01': {
        colId: 'risk.dv01',
        valueFormatterTemplate: { kind: 'excelFormat' as const, format: FMT.dv01 },
        cellStyleOverrides: { alignment: { horizontal: 'right' as const } },
      },
      'risk.convexity': {
        colId: 'risk.convexity',
        valueFormatterTemplate: { kind: 'excelFormat' as const, format: FMT.ratio3 },
        cellStyleOverrides: { typography: { italic: true } },
      },
      // String column: no formatter, just style — proves nested string
      // cells get cssEscapeColId-encoded class even without a formatter.
      'ratings.sp': {
        colId: 'ratings.sp',
        cellStyleOverrides: {
          typography: { bold: true },
          colors: { background: '#fde68a', text: '#92400e' },
          alignment: { horizontal: 'center' as const },
        },
      },
    },
  },
};

const condCellState = {
  'conditional-styling': {
    rules: [
      // Bid > 100 — green tint on bid only
      {
        id: 'rule-bid-high',
        name: 'Bid above par',
        enabled: true,
        priority: 10,
        scope: { type: 'cell' as const, columns: ['pricing.bid'] },
        expression: '[pricing.bid] > 100',
        style: {
          light: { backgroundColor: '#d1fae5', color: '#065f46', fontWeight: '700' },
          dark: { backgroundColor: 'rgba(16, 185, 129, 0.20)', color: '#6ee7b7' },
        },
      },
      // Bid > Ask (inverted market) — red flag on bid
      {
        id: 'rule-bid-inverted',
        name: 'Bid above Ask (inverted)',
        enabled: true,
        priority: 11,
        scope: { type: 'cell' as const, columns: ['pricing.bid'] },
        expression: '[pricing.bid] > [pricing.ask]',
        style: {
          light: { backgroundColor: '#fecaca', color: '#991b1b', fontWeight: '700' },
          dark: { backgroundColor: 'rgba(220, 38, 38, 0.30)', color: '#fca5a5' },
        },
      },
      // Rating == AAA  — gold badge on ratings.sp (string equality nested)
      {
        id: 'rule-rating-aaa',
        name: 'AAA rating',
        enabled: true,
        priority: 20,
        scope: { type: 'cell' as const, columns: ['ratings.sp'] },
        expression: "[ratings.sp] == 'AAA'",
        style: {
          light: { backgroundColor: '#fef3c7', color: '#92400e', fontWeight: '700' },
          dark: { backgroundColor: 'rgba(245, 158, 11, 0.22)', color: '#fcd34d' },
        },
      },
    ],
  },
};

const condRowState = {
  'conditional-styling': {
    rules: [
      // Row-scope: high-DV01 rows get a red wash
      {
        id: 'rule-row-high-dv01',
        name: 'High DV01 (>100)',
        enabled: true,
        priority: 10,
        scope: { type: 'row' as const },
        expression: '[risk.dv01] > 100',
        style: {
          light: { backgroundColor: 'rgba(220, 38, 38, 0.06)' },
          dark: { backgroundColor: 'rgba(248, 113, 113, 0.10)' },
        },
      },
      // Row-scope: AND across two nested + a flat field
      {
        id: 'rule-row-buy-aaa',
        name: 'AAA BUY trade',
        enabled: true,
        priority: 11,
        scope: { type: 'row' as const },
        expression: "[ratings.sp] == 'AAA' AND [side] == 'BUY'",
        style: {
          light: { backgroundColor: 'rgba(20, 184, 166, 0.10)' },
          dark: { backgroundColor: 'rgba(45, 212, 191, 0.12)' },
        },
      },
    ],
  },
};

const calcState = {
  'calculated-columns': {
    virtualColumns: [
      // Subtraction across two nested fields
      {
        colId: 'calc_spread',
        headerName: 'Spread (calc)',
        expression: '[pricing.ask] - [pricing.bid]',
        valueFormatterTemplate: { kind: 'excelFormat' as const, format: '0.0000' },
        cellDataType: 'number' as const,
        position: 50,
        initialWidth: 110,
      },
      // Aggregate over a nested field — must hit the dot-walk path in
      // the SUM aggregateColumnRefs branch.
      {
        colId: 'calc_dv01PctTotal',
        headerName: 'DV01 % of Book',
        expression: '[risk.dv01] / SUM([risk.dv01]) * 100',
        valueFormatterTemplate: { kind: 'excelFormat' as const, format: '0.00"%"' },
        cellDataType: 'percent' as const,
        position: 51,
        initialWidth: 110,
      },
      // Mixed flat + nested — proves the evaluator handles both inside
      // one expression.
      {
        colId: 'calc_notionalPerDv01',
        headerName: 'Notional ÷ DV01',
        expression: '[notional] / [risk.dv01]',
        valueFormatterTemplate: { kind: 'excelFormat' as const, format: '#,##0' },
        cellDataType: 'number' as const,
        position: 52,
        initialWidth: 110,
      },
    ],
  },
};

const groupsState = {
  'column-groups': {
    groups: [
      {
        groupId: 'grp-pricing',
        headerName: 'Pricing',
        openByDefault: true,
        marryChildren: false,
        headerStyle: {
          bold: true,
          align: 'center' as const,
          background: '#1e293b',
          color: '#f1f5f9',
        },
        children: [
          { kind: 'col' as const, colId: 'pricing.bid' },
          { kind: 'col' as const, colId: 'pricing.ask' },
          { kind: 'col' as const, colId: 'pricing.mid' },
          { kind: 'col' as const, colId: 'pricing.last' },
        ],
      },
      {
        groupId: 'grp-ratings',
        headerName: 'Ratings',
        openByDefault: false,
        marryChildren: false,
        headerStyle: {
          bold: true,
          align: 'center' as const,
          background: '#312e81',
          color: '#e0e7ff',
        },
        children: [
          { kind: 'col' as const, colId: 'ratings.sp' },
          { kind: 'col' as const, colId: 'ratings.moodys' },
          { kind: 'col' as const, colId: 'ratings.fitch' },
        ],
      },
      {
        groupId: 'grp-risk',
        headerName: 'Risk Metrics',
        openByDefault: true,
        marryChildren: false,
        headerStyle: {
          bold: true,
          italic: true,
          align: 'center' as const,
          background: '#7c2d12',
          color: '#fff7ed',
        },
        children: [
          { kind: 'col' as const, colId: 'risk.dv01' },
          { kind: 'col' as const, colId: 'risk.duration' },
          { kind: 'col' as const, colId: 'risk.convexity' },
        ],
      },
    ],
    openGroupIds: {},
  },
};

const kitchenSinkState = {
  ...formatterState,
  ...condCellState,
  // condCellState's conditional-styling section already covered the
  // 'conditional-styling' key; merge the row rules in afterwards.
  'conditional-styling': {
    rules: [
      ...condCellState['conditional-styling'].rules,
      ...condRowState['conditional-styling'].rules,
    ],
  },
  ...calcState,
  ...groupsState,
};

// ─── Public registry ──────────────────────────────────────────────────

const FIXTURE_DEFS: Array<{ name: FixtureName; label: string; state: Record<string, unknown> }> = [
  { name: 'formatter',     label: 'Static formatter on nested fields',           state: formatterState },
  { name: 'cond-cell',     label: 'Conditional cell rules on nested fields',     state: condCellState },
  { name: 'cond-row',      label: 'Conditional row rules referencing nested',    state: condRowState },
  { name: 'calc',          label: 'Calculated columns referencing nested',       state: calcState },
  { name: 'groups',        label: 'Column groups wrapping nested cols',          state: groupsState },
  { name: 'kitchen-sink',  label: 'All features composed (kitchen sink)',        state: kitchenSinkState },
];

export const FIXTURES: Record<FixtureName, FixtureSpec> = Object.fromEntries(
  FIXTURE_DEFS.map(({ name, label, state }) => {
    const gridId = `fixture-${name}`;
    return [
      name,
      { name, label, gridId, profile: payload(gridId, `Fixture: ${label}`, state) },
    ];
  }),
) as Record<FixtureName, FixtureSpec>;

export function isFixtureName(s: string | null | undefined): s is FixtureName {
  return !!s && (FIXTURES as Record<string, unknown>)[s] !== undefined;
}

export const FIXTURE_NAMES: FixtureName[] = FIXTURE_DEFS.map((f) => f.name);
