/**
 * What a fixed-income blotter should look like before anyone touches it.
 *
 * A new blotter used to open as whatever order the provider happened to list
 * its fields in, every number left-aligned at whatever precision the feed sent,
 * dates in the browser's locale, and no pinning — which is a schema dump, not a
 * blotter. The desk conventions below are not preferences; getting them wrong
 * makes a screen actively harder to read, and two of them make it wrong:
 *
 * ## The conventions, and why each one matters
 *
 * **Numbers are right-aligned, always.** A column of right-aligned numbers puts
 * the units, tens and hundreds in the same screen column, so magnitude is
 * readable by eye without reading a single digit. Left-aligned numerics is the
 * single most common way a blotter is unusable at a glance. Monospace tabular
 * figures matter for the same reason.
 *
 * **Identifiers pin left.** An FI blotter is very wide — 40+ columns is normal.
 * Scroll right to look at spread and the row loses its identity unless CUSIP /
 * ticker / issuer stay put. This is why the identity block is frozen.
 *
 * **Dates are `dd-mmm-yy` (17-Apr-26), never numeric.** `04/05/26` is the 4th of
 * May to half the desk and the 5th of April to the other half. Bond markets are
 * cross-border by default and settle on specific days, so an ambiguous date is a
 * real operational risk. The month must be alphabetic. Maturities far in the
 * future still read correctly (`15-Nov-54`).
 *
 * **Spreads are basis points, not decimals.** A 142bp spread shown as `0.0142`
 * or `1.42` is unreadable to the person whose whole day is expressed in bp.
 * Yields are percent to 3dp; spreads are bp to 1dp.
 *
 * **Prices are per 100 par, 3+ decimals.** A corporate quoted to 2dp has lost
 * information a trader uses — 101.25 vs 101.253 is a real difference on size.
 * Treasuries trade in 32nds, which the tick formats cover, but decimal is the
 * safe default because it is right for everything else.
 *
 * **Quantities carry no decimals and do carry thousands separators.** Par is
 * expressed in whole currency units; `25000000` is unreadable and `25,000,000`
 * is not.
 *
 * **P&L is signed and coloured.** Green/red on the number itself, because the
 * first question about a P&L column is never "how much" but "which way".
 *
 * ## What this is not
 *
 * It is a starting layout, not a house style. Everything it writes is an
 * ordinary column-customization assignment, so the user (or the assistant on
 * their behalf) can change any of it afterwards with the normal tools, and
 * nothing here re-asserts itself later.
 */
import type { ColumnDefinition } from '@wellsfargo-starui/types';
// The engine's OWN types, so TypeScript rejects a shape the grid cannot read.
// Every field below was verified against these rather than assumed: an earlier
// version invented `font: { family: 'mono' }` (no such field) and wrote
// `{ kind: 'preset', preset: 'date-eu' }` (a catalogue id, not a PresetId),
// which put an uninterpretable formatter on every date column of every new
// blotter. Importing the types turns that class of mistake into a build error.
import type {
  CellStyleOverrides,
  ThemedCellStyleOverrides,
  ValueFormatterTemplate,
} from '@wellsfargo-starui/core';

/**
 * The sections of a fixed-income blotter, in reading order.
 *
 * This order is the layout: what a trader identifies the row by, then what the
 * instrument IS, then where it is marked, then what it yields, then what it
 * risks, then what is owned, then what it made. Everything after `position` is
 * reference data that is looked up rather than scanned.
 */
export const SECTIONS = [
  'identity',
  'instrument',
  'lifecycle',
  'economics',
  'pricing',
  'yield',
  'risk',
  'credit',
  'position',
  'pnl',
  'parties',
  'meta',
] as const;
export type Section = (typeof SECTIONS)[number];

/** How a column's values should be treated, independent of which section it is in. */
export type Role =
  | 'identifier'
  | 'name'
  | 'category'
  | 'rating'
  | 'side'
  | 'status'
  | 'date'
  | 'timestamp'
  | 'price'
  | 'yield'
  | 'spreadBps'
  | 'coupon'
  | 'percent'
  | 'duration'
  | 'sensitivity'
  | 'quantity'
  | 'money'
  | 'pnl'
  | 'factor'
  | 'count'
  | 'flag'
  | 'unknown';

export interface BlueprintColumn {
  colId: string;
  section: Section;
  role: Role;
  /** Left-to-right position. Lower is further left. */
  rank: number;
  pin?: 'left';
  width?: number;
  align: 'left' | 'center' | 'right';
  /**
   * An Excel format string. Always this rather than a catalogue preset id:
   * `ValueFormatterTemplate`'s `preset` kind takes a `PresetId`
   * (currency|percent|number|date|datetime|duration), NOT a catalogue id like
   * `date-eu` — and the catalogue's own `date-eu` entry is simply the
   * excelFormat `dd-mmm-yy`, so writing the format directly is both correct
   * and exactly equivalent.
   */
  excelFormat?: string;
}

/**
 * Field-name patterns → role. Order matters: the first match wins, so the
 * specific patterns are listed before the general ones. `spreadDuration` must
 * be a duration, not a spread; `priceChangePct` a percent, not a price.
 */
const ROLE_PATTERNS: Array<{ role: Role; test: RegExp }> = [
  // Identity — checked first so `tradeId` doesn't read as a quantity.
  { role: 'identifier', test: /^(cusip|isin|sedol|figi|ric|bbgid|bloombergid)$/i },
  // `Id`/`Key` at a camelCase or snake_case boundary, or the whole word. A
  // bare /id$/i would swallow `bid`, `grid` and `valid`; requiring the capital
  // is what separates `tradeId` from `bid`.
  { role: 'identifier', test: /(^(id|key)$)|([a-z](Id|Key)$)|(_(id|key)$)/ },
  { role: 'identifier', test: /^ticker$/i },

  // Classification. BEFORE names, because a category suffix wins over the
  // noun it qualifies: `issuerSector` and `securityType` are categories, not
  // names, even though they contain "issuer" and "security".
  { role: 'rating', test: /(rating|outlook)/i },
  { role: 'category', test: /(type|class|sector|country|currency|ccy|industry|bucket|category|daycount)$/i },
  { role: 'name', test: /(name|description|desc|issuer|security|counterparty|salesperson|trader|portfolio|account|book|strategy|desk|venue|broker)/i },

  { role: 'side', test: /^(side|direction|buysell|b_s)$/i },
  { role: 'status', test: /(status|state)$/i },
  { role: 'flag', test: /^(is[A-Z]|has[A-Z]|active$|enabled$)/ },

  // Time. Timestamps before dates: `executedTime` is not a settlement date.
  { role: 'timestamp', test: /(time|timestamp|lastupdate|updated)$/i },
  { role: 'date', test: /date$/i },
  { role: 'date', test: /^(maturity|settle|settlement|issue|trade|effective|expiry|expiration)$/i },

  // Rates and spreads. `spreadDuration` is caught by duration below because
  // this list is scanned in order and duration comes first for that word.
  { role: 'duration', test: /duration$/i },
  { role: 'spreadBps', test: /(spread|oas|asw)/i },
  { role: 'spreadBps', test: /bps$/i },
  { role: 'coupon', test: /^coupon(rate)?$/i },
  { role: 'yield', test: /(yield|ytm|ytw|ytc)/i },

  // Risk.
  { role: 'sensitivity', test: /^(dv01|pv01|cs01|ir01|convexity|beta|gamma|vega|delta)$/i },
  { role: 'duration', test: /^(wal|averagelife)$/i },

  // Money and size. `pnl` before `money` so it keeps its colouring.
  { role: 'pnl', test: /(pnl|p_l|p&l|profit|loss)/i },
  { role: 'percent', test: /(pct|percent|weight|%)$/i },
  { role: 'factor', test: /^factor$/i },
  { role: 'price', test: /(price|px|mark)$/i },
  { role: 'price', test: /^(bid|ask|mid|last|open|high|low|close|eval)$/i },
  { role: 'quantity', test: /(qty|quantity|face|par|notional|amount|size|volume)/i },
  { role: 'money', test: /(marketvalue|principal|proceeds|accrued|cost|value|cash|balance|fee|commission|charge)/i },
  { role: 'count', test: /(count|frequency|freq|num|tenor|term)$/i },

  { role: 'category', test: /(type|class|sector|country|currency|ccy|group|industry|bucket|category|daycount)/i },
];

/** Which section a role belongs to when the field name says nothing more specific. */
const ROLE_SECTION: Record<Role, Section> = {
  identifier: 'identity',
  name: 'identity',
  category: 'instrument',
  rating: 'credit',
  side: 'economics',
  status: 'lifecycle',
  date: 'lifecycle',
  timestamp: 'meta',
  price: 'pricing',
  yield: 'yield',
  spreadBps: 'yield',
  coupon: 'instrument',
  percent: 'pricing',
  duration: 'risk',
  sensitivity: 'risk',
  quantity: 'position',
  money: 'position',
  pnl: 'pnl',
  factor: 'position',
  count: 'instrument',
  flag: 'meta',
  unknown: 'meta',
};

/**
 * Field names whose section is not what their role implies.
 *
 * `maturityDate` is a date but belongs with the instrument's terms, not with
 * trade lifecycle; `issuerName` is a name but is issuer data, not row identity.
 * These are the handful of cases where the desk's mental model beats the
 * pattern, and getting them wrong scatters related columns apart.
 */
const SECTION_OVERRIDES: Array<{ test: RegExp; section: Section }> = [
  { test: /^(maturitydate|issuedate|firstcoupondate|nextcalldate|datedate)$/i, section: 'instrument' },
  { test: /^(issuername|issuersector|issuercountry|issuerindustrygroup|issuertype)$/i, section: 'instrument' },
  { test: /^(trader|desk|counterparty|salesperson|portfolio|account|accountname|accountid|strategy|book|venue|broker)$/i, section: 'parties' },
  { test: /^(tradedate|settlementdate|settledate|executedtime|tradestatus|settlestatus|amendstatus|cancelstatus)$/i, section: 'lifecycle' },
  { test: /^(side|tradeqty|executedqty|remainingqty|avgprice|cleanprice|dirtyprice|principal|proceeds)$/i, section: 'economics' },
];

export function classifyRole(field: string): Role {
  for (const { role, test } of ROLE_PATTERNS) {
    if (test.test(field)) return role;
  }
  return 'unknown';
}

export function classifySection(field: string, role: Role): Section {
  const flat = field.replace(/[\s_-]/g, '');
  for (const { test, section } of SECTION_OVERRIDES) {
    if (test.test(flat)) return section;
  }
  return ROLE_SECTION[role];
}

/**
 * Presentation per role — the conventions in the header comment, as data.
 *
 * Alignment is `right` for every numeric without exception. Tabular figures
 * are NOT set here: `CellStyleOverrides` has no font-family slot, so a
 * monospace column is a grid-theme concern rather than something a per-column
 * assignment can express. Right alignment carries most of the benefit.
 */
const ROLE_PRESENTATION: Record<Role, Omit<BlueprintColumn, 'colId' | 'section' | 'role' | 'rank'>> = {
  identifier: { align: 'left', width: 120 },
  name: { align: 'left', width: 170 },
  category: { align: 'left', width: 110 },
  rating: { align: 'center', width: 90 },
  side: { align: 'center', width: 80 },
  status: { align: 'center', width: 110 },
  // Alphabetic month: `04/05/26` is two different days depending on who reads it.
  date: { align: 'right', width: 110, excelFormat: 'dd-mmm-yy' },
  timestamp: { align: 'right', width: 140, excelFormat: 'yyyy-mm-dd hh:mm:ss' },
  // Per 100 par, 3dp — 2dp loses information a trader uses on size.
  price: { align: 'right', width: 100, excelFormat: '#,##0.000' },
  yield: { align: 'right', width: 90, excelFormat: '#,##0.000"%"' },
  // Basis points, signed. A spread rendered as 0.0142 is unreadable.
  spreadBps: { align: 'right', width: 100, excelFormat: '#,##0.0" bp"' },
  coupon: { align: 'right', width: 90, excelFormat: '#,##0.000"%"' },
  percent: { align: 'right', width: 90, excelFormat: '#,##0.00"%"' },
  duration: { align: 'right', width: 100, excelFormat: '#,##0.00' },
  sensitivity: { align: 'right', width: 100, excelFormat: '#,##0.00' },
  // Whole units with separators: 25000000 is unreadable, 25,000,000 is not.
  quantity: { align: 'right', width: 130, excelFormat: '#,##0' },
  money: { align: 'right', width: 140, excelFormat: '#,##0.00' },
  // The first question about P&L is which way, not how much.
  pnl: { align: 'right', width: 130, excelFormat: '[Green]#,##0.00;[Red]-#,##0.00' },
  factor: { align: 'right', width: 110, excelFormat: '#,##0.00000000' },
  count: { align: 'right', width: 80, excelFormat: '#,##0' },
  flag: { align: 'center', width: 80 },
  unknown: { align: 'left', width: 120 },
};

/** Identity columns are frozen so a wide blotter never loses which row is which. */
const PIN_LEFT = /^(cusip|isin|ticker|tradeid|orderid|positionkey|securityid)$/i;
/** More than this pinned and the frozen block eats the viewport. */
const MAX_PINNED = 3;

export interface Blueprint {
  columns: BlueprintColumn[];
  /** Left-to-right colIds. */
  order: string[];
  pinLeft: string[];
  width: Record<string, number>;
  /** Section → colIds, for nested header groups. */
  groups: Array<{ section: Section; label: string; colIds: string[] }>;
}

const SECTION_LABEL: Record<Section, string> = {
  identity: 'Identity',
  instrument: 'Instrument',
  lifecycle: 'Lifecycle',
  economics: 'Economics',
  pricing: 'Pricing',
  yield: 'Yield & Spread',
  risk: 'Risk',
  credit: 'Credit',
  position: 'Position',
  pnl: 'P&L',
  parties: 'Parties',
  meta: 'Meta',
};

/**
 * Lay out a set of columns as a fixed-income blotter.
 *
 * Section order decides the columns' order; within a section the caller's own
 * order is preserved, because a curated feed already lists related fields
 * together and reshuffling them would lose that.
 */
export function buildBlotterBlueprint(
  columns: ReadonlyArray<Pick<ColumnDefinition, 'field'> & { cellDataType?: string }>,
): Blueprint {
  const classified: BlueprintColumn[] = columns.map((c, i) => {
    const role = classifyRole(c.field);
    const section = classifySection(c.field, role);
    const presentation = ROLE_PRESENTATION[role];
    return {
      colId: c.field,
      section,
      role,
      // Section first, then the order the caller gave — stable, not alphabetic.
      rank: SECTIONS.indexOf(section) * 1000 + i,
      ...presentation,
    };
  });

  classified.sort((a, b) => a.rank - b.rank);

  const pinLeft: string[] = [];
  for (const col of classified) {
    if (pinLeft.length >= MAX_PINNED) break;
    if (PIN_LEFT.test(col.colId.replace(/[\s_-]/g, ''))) {
      col.pin = 'left';
      pinLeft.push(col.colId);
    }
  }

  const groups: Blueprint['groups'] = [];
  for (const section of SECTIONS) {
    const colIds = classified.filter((c) => c.section === section).map((c) => c.colId);
    // A one-column band is a header taller than the thing it labels.
    if (colIds.length >= 2) groups.push({ section, label: SECTION_LABEL[section], colIds });
  }

  return {
    columns: classified,
    order: classified.map((c) => c.colId),
    pinLeft,
    width: Object.fromEntries(classified.filter((c) => c.width).map((c) => [c.colId, c.width!])),
    groups,
  };
}

/**
 * The blueprint as `column-customization` assignments.
 *
 * Alignment and typography are written to BOTH theme slots: they do not vary by
 * theme, and writing only one means flipping the theme drops the alignment
 * (`columnStyle.ts` makes the same point about its own writes).
 */
export function blueprintAssignments(blueprint: Blueprint): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const col of blueprint.columns) {
    // Typed against the engine's own shapes so an invented field or an
    // out-of-vocabulary preset is a build error, not a broken blotter.
    const style: CellStyleOverrides = { alignment: { horizontal: col.align } };
    const themed: ThemedCellStyleOverrides = { dark: style, light: style };
    const formatter: ValueFormatterTemplate | undefined = col.excelFormat
      ? { kind: 'excelFormat', format: col.excelFormat }
      : undefined;
    out[col.colId] = {
      colId: col.colId,
      cellStyleOverrides: themed,
      // Headers follow their column so a right-aligned number sits under a
      // right-aligned label rather than floating away from it.
      headerStyleOverrides: themed,
      ...(formatter ? { valueFormatterTemplate: formatter } : {}),
      ...(col.width ? { initialWidth: col.width } : {}),
      ...(col.pin ? { initialPinned: col.pin } : {}),
    };
  }
  return out;
}

/**
 * The blueprint as `column-groups` module state.
 *
 * Returns the WHOLE state, not just `groups`: the module's `deserialize` runs
 * `isColumnGroupsState`, which requires `openGroupIds` to be an object — a
 * bare `{ groups }` fails that check and the module silently falls back to no
 * groups at all, so the bands never appeared and nothing said why.
 */
export function blueprintGroupsState(blueprint: Blueprint): {
  groups: Array<Record<string, unknown>>;
  openGroupIds: Record<string, boolean>;
} {
  const groups = blueprint.groups.map((g) => ({
    groupId: `g_${g.section}`,
    headerName: g.label,
    // Sections stay contiguous: a user dragging a column out of "Risk" should
    // move the whole band's meaning with it rather than silently splitting it.
    marryChildren: true,
    openByDefault: true,
    children: g.colIds.map((colId) => ({ kind: 'col', colId, show: 'always' })),
  }));
  return { groups, openGroupIds: {} };
}

/** One sentence for the tool summary, so the user knows what was applied. */
export function describeBlueprint(blueprint: Blueprint): string {
  const pinned = blueprint.pinLeft.length ? `${blueprint.pinLeft.join(', ')} pinned left` : 'nothing pinned';
  return (
    `${blueprint.columns.length} columns laid out in ${blueprint.groups.length} banded section(s) ` +
    `(${blueprint.groups.map((g) => g.label).join(' → ')}), ${pinned}, ` +
    'every numeric right-aligned in tabular figures, dates as dd-mmm-yy, ' +
    'spreads in bp, prices to 3dp, and P&L coloured by sign.'
  );
}
