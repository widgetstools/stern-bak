import { describe, expect, it } from 'vitest';
import {
  buildBlotterBlueprint,
  blueprintAssignments,
  blueprintGroupsState,
  classifyRole,
  classifySection,
  describeBlueprint,
} from './blotterBlueprint';

const f = (...fields: string[]) => fields.map((field) => ({ field }));

/** Fields as the real mock positions catalogue names them. */
const POSITIONS = f(
  'dailyPnL', 'marketValue', 'dv01', 'oas', 'yieldToMaturity', 'maturityDate',
  'cusip', 'ticker', 'issuerName', 'compositeRating', 'quantityFace',
  'modifiedDuration', 'bidPrice', 'couponRate', 'currency', 'lastUpdate',
);

describe('role classification', () => {
  it.each([
    ['cusip', 'identifier'],
    ['isin', 'identifier'],
    ['tradeId', 'identifier'],
    ['positionKey', 'identifier'],
    ['issuerName', 'name'],
    ['counterparty', 'name'],
    ['compositeRating', 'rating'],
    ['side', 'side'],
    ['tradeStatus', 'status'],
    ['maturityDate', 'date'],
    ['settlementDate', 'date'],
    ['executedTime', 'timestamp'],
    ['bidPrice', 'price'],
    ['cleanPrice', 'price'],
    ['midPrice', 'price'],
    ['yieldToMaturity', 'yield'],
    ['yieldToWorst', 'yield'],
    ['couponRate', 'coupon'],
    ['oas', 'spreadBps'],
    ['zSpread', 'spreadBps'],
    ['spreadBps', 'spreadBps'],
    ['modifiedDuration', 'duration'],
    ['effectiveDuration', 'duration'],
    ['convexity', 'sensitivity'],
    ['dv01', 'sensitivity'],
    ['quantityFace', 'quantity'],
    ['principal', 'money'],
    ['accruedInterest', 'money'],
    ['dailyPnL', 'pnl'],
    ['unrealizedPnL', 'pnl'],
    ['priceChangePct', 'percent'],
    ['factor', 'factor'],
    ['issuerSector', 'category'],
    ['currency', 'category'],
  ])('reads %s as %s', (field, role) => {
    expect(classifyRole(field)).toBe(role);
  });

  /**
   * The ordering trap: `spreadDuration` contains "spread" but is a duration,
   * and would otherwise be formatted in basis points.
   */
  it('reads spreadDuration as a duration, not a spread', () => {
    expect(classifyRole('spreadDuration')).toBe('duration');
  });

  it('reads priceChangePct as a percent, not a price', () => {
    expect(classifyRole('priceChangePct')).toBe('percent');
  });
});

describe('section placement', () => {
  it('keeps a maturity date with the instrument, not with trade lifecycle', () => {
    expect(classifySection('maturityDate', classifyRole('maturityDate'))).toBe('instrument');
  });

  it('keeps a settlement date in lifecycle', () => {
    expect(classifySection('settlementDate', classifyRole('settlementDate'))).toBe('lifecycle');
  });

  it('files issuer data with the instrument rather than row identity', () => {
    expect(classifySection('issuerName', classifyRole('issuerName'))).toBe('instrument');
  });

  it('files people and books under parties', () => {
    expect(classifySection('counterparty', classifyRole('counterparty'))).toBe('parties');
    expect(classifySection('trader', classifyRole('trader'))).toBe('parties');
  });
});

describe('layout', () => {
  it('orders sections the way a blotter is read, whatever order the feed gave', () => {
    const { order } = buildBlotterBlueprint(POSITIONS);
    const at = (c: string) => order.indexOf(c);
    // identity → instrument → pricing → yield → risk → credit → position → P&L
    expect(at('cusip')).toBeLessThan(at('maturityDate'));
    expect(at('maturityDate')).toBeLessThan(at('bidPrice'));
    expect(at('bidPrice')).toBeLessThan(at('yieldToMaturity'));
    expect(at('yieldToMaturity')).toBeLessThan(at('dv01'));
    expect(at('dv01')).toBeLessThan(at('compositeRating'));
    expect(at('compositeRating')).toBeLessThan(at('marketValue'));
    expect(at('marketValue')).toBeLessThan(at('dailyPnL'));
  });

  it('puts identity first even though the feed listed P&L first', () => {
    expect(buildBlotterBlueprint(POSITIONS).order[0]).toBe('cusip');
  });

  /** A 40-column blotter scrolled right loses which row is which without this. */
  it('freezes the identity block on the left', () => {
    expect(buildBlotterBlueprint(POSITIONS).pinLeft).toEqual(['cusip', 'ticker']);
  });

  it('never pins so much that the frozen block eats the viewport', () => {
    const many = f('cusip', 'isin', 'ticker', 'tradeId', 'orderId', 'positionKey');
    expect(buildBlotterBlueprint(many).pinLeft.length).toBeLessThanOrEqual(3);
  });

  it('preserves the feed order within a section', () => {
    const { order } = buildBlotterBlueprint(f('askPrice', 'bidPrice', 'midPrice'));
    expect(order).toEqual(['askPrice', 'bidPrice', 'midPrice']);
  });

  it('bands sections but never a lone column', () => {
    const { groups } = buildBlotterBlueprint(f('cusip', 'ticker', 'dv01'));
    const labels = groups.map((g) => g.label);
    expect(labels).toContain('Identity');
    // Risk has one member here, so it gets no band.
    expect(labels).not.toContain('Risk');
  });
});

/**
 * The conventions themselves. These are the reason the feature exists, so each
 * is asserted directly rather than inferred from a snapshot.
 */
describe('fixed-income conventions', () => {
  const byId = (fields: string[]) =>
    Object.fromEntries(buildBlotterBlueprint(f(...fields)).columns.map((c) => [c.colId, c]));

  it('right-aligns EVERY numeric, without exception', () => {
    const cols = buildBlotterBlueprint(POSITIONS).columns;
    const numericRoles = new Set([
      'price', 'yield', 'spreadBps', 'coupon', 'percent', 'duration',
      'sensitivity', 'quantity', 'money', 'pnl', 'factor', 'count', 'date', 'timestamp',
    ]);
    const numerics = cols.filter((c) => numericRoles.has(c.role));
    expect(numerics.length).toBeGreaterThan(5);
    expect(numerics.every((c) => c.align === 'right')).toBe(true);
  });

  /** `04/05/26` is two different days depending on who reads it. */
  it('formats dates as dd-mmm-yy, never numerically', () => {
    expect(byId(['maturityDate']).maturityDate.excelFormat).toBe('dd-mmm-yy');
  });

  it('shows spreads in basis points', () => {
    expect(byId(['oas']).oas.excelFormat).toContain('bp');
  });

  it('shows yields and coupons as percent to 3dp', () => {
    expect(byId(['yieldToMaturity']).yieldToMaturity.excelFormat).toBe('#,##0.000"%"');
    expect(byId(['couponRate']).couponRate.excelFormat).toBe('#,##0.000"%"');
  });

  it('prices to 3dp — 2dp loses information a trader uses on size', () => {
    expect(byId(['bidPrice']).bidPrice.excelFormat).toBe('#,##0.000');
  });

  it('quantities carry thousands separators and no decimals', () => {
    expect(byId(['quantityFace']).quantityFace.excelFormat).toBe('#,##0');
  });

  it('colours P&L by sign — the first question is which way, not how much', () => {
    const fmt = byId(['dailyPnL']).dailyPnL.excelFormat!;
    expect(fmt).toContain('[Green]');
    expect(fmt).toContain('[Red]');
  });

  it('left-aligns identifiers and names, and centres ratings', () => {
    const cols = byId(['cusip', 'issuerName', 'compositeRating']);
    expect(cols.cusip.align).toBe('left');
    expect(cols.issuerName.align).toBe('left');
    expect(cols.compositeRating.align).toBe('center');
  });

  it('shows an MBS factor to 8dp', () => {
    expect(byId(['factor']).factor.excelFormat).toBe('#,##0.00000000');
  });
});

describe('what gets written', () => {
  it('writes alignment to BOTH theme slots so a theme flip cannot drop it', () => {
    const a = blueprintAssignments(buildBlotterBlueprint(f('marketValue')));
    const entry = a.marketValue as { cellStyleOverrides: { dark: unknown; light: unknown } };
    expect(entry.cellStyleOverrides.dark).toEqual(entry.cellStyleOverrides.light);
    expect(entry.cellStyleOverrides.dark).toMatchObject({ alignment: { horizontal: 'right' } });
  });

  it('aligns the header with its column', () => {
    const a = blueprintAssignments(buildBlotterBlueprint(f('marketValue')));
    const entry = a.marketValue as { headerStyleOverrides: { dark: { alignment: { horizontal: string } } } };
    expect(entry.headerStyleOverrides.dark.alignment.horizontal).toBe('right');
  });

  it('writes an excel format as a formatter template', () => {
    const a = blueprintAssignments(buildBlotterBlueprint(f('dailyPnL')));
    expect((a.dailyPnL as { valueFormatterTemplate: { kind: string } }).valueFormatterTemplate.kind).toBe('excelFormat');
  });

  /**
   * `ValueFormatterTemplate`'s `preset` kind takes a PresetId
   * (currency|percent|number|date|datetime|duration), NOT a catalogue id. An
   * earlier version wrote `{ kind: 'preset', preset: 'date-eu' }`, which the
   * engine cannot interpret — so every date column of every new blotter
   * carried a broken formatter.
   */
  it('never emits a preset template — the catalogue id is not a PresetId', () => {
    const a = blueprintAssignments(buildBlotterBlueprint(f('maturityDate', 'executedTime', 'marketValue')));
    for (const entry of Object.values(a)) {
      const t = (entry as { valueFormatterTemplate?: { kind: string } }).valueFormatterTemplate;
      if (t) expect(t.kind).toBe('excelFormat');
    }
  });

  /**
   * `isColumnGroupsState` requires `openGroupIds` to be an object. Without it
   * the module's deserialize discards the WHOLE state and no bands appear,
   * silently.
   */
  it('emits column-groups state the module will actually accept', () => {
    const state = blueprintGroupsState(buildBlotterBlueprint(POSITIONS));
    expect(Array.isArray(state.groups)).toBe(true);
    expect(state.openGroupIds).toEqual({});
    expect(typeof state.openGroupIds).toBe('object');
  });

  it('carries pinning and width into the assignment', () => {
    const a = blueprintAssignments(buildBlotterBlueprint(POSITIONS));
    expect(a.cusip).toMatchObject({ initialPinned: 'left' });
    expect(a.marketValue).toMatchObject({ initialWidth: 140 });
  });

  it('keeps a section contiguous so a band cannot be split apart', () => {
    const { groups } = blueprintGroupsState(buildBlotterBlueprint(POSITIONS));
    expect(groups.every((g) => g.marryChildren === true)).toBe(true);
  });

  it('names the sections in the summary the user reads', () => {
    const text = describeBlueprint(buildBlotterBlueprint(POSITIONS));
    expect(text).toContain('Identity');
    expect(text).toContain('right-aligned');
    expect(text).toContain('dd-mmm-yy');
  });
});

describe('an unfamiliar feed', () => {
  it('lays out what it recognises and leaves the rest alone rather than guessing', () => {
    const { columns } = buildBlotterBlueprint(f('wibble', 'marketValue'));
    const wibble = columns.find((c) => c.colId === 'wibble')!;
    expect(wibble.role).toBe('unknown');
    expect(wibble.align).toBe('left');
    expect(wibble.excelFormat).toBeUndefined();
  });

  it('produces a usable layout from an empty column list', () => {
    const blueprint = buildBlotterBlueprint([]);
    expect(blueprint.order).toEqual([]);
    expect(blueprint.groups).toEqual([]);
  });
});
