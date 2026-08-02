import { describe, expect, it } from 'vitest';
import type { ColDef, ValueFormatterParams, ValueGetterParams } from 'ag-grid-community';
import {
  baseColumns,
  COL_GROUP,
  defaultColDef,
  findCol,
  fmt,
  pickColumns,
} from './columns';
import type { LabRow } from './types';

const fp = (value: unknown): ValueFormatterParams =>
  ({ value }) as ValueFormatterParams;

const gp = (data: Partial<LabRow> | undefined): ValueGetterParams<LabRow> =>
  ({ data }) as ValueGetterParams<LabRow>;

/** `ColDef.valueGetter` is `string | ValueGetterFunc` — narrow to the callable form. */
const getterOf = (col: ColDef<LabRow> | undefined) => {
  const vg = col?.valueGetter;
  return typeof vg === 'function' ? vg : undefined;
};

describe('fmt', () => {
  it('formats numeric and temporal values', () => {
    expect(fmt.price(fp(100.5))).toBe('100.500');
    expect(fmt.pct(fp(1.234))).toBe('1.234%');
    expect(fmt.num2(fp(12.3))).toBe('12.30');
    expect(fmt.num4(fp(0.1234))).toBe('0.1234');
    expect(fmt.money(fp(1234.56))).toBe('1,235');
    expect(fmt.bps(fp(12.3))).toBe('12.30 bps');
    expect(fmt.date(fp('2024-06-15'))).toBe('2024-06-15');
    expect(fmt.date(fp(Date.parse('2024-06-15')))).toBe('2024-06-15');
    expect(fmt.time(fp(Date.now()))).toMatch(/\d/);
  });

  it('handles nullish formatter inputs', () => {
    expect(fmt.price(fp(null))).toBe('');
    expect(fmt.pct(fp(undefined))).toBe('');
    expect(fmt.num2(fp(null))).toBe('');
    expect(fmt.num4(fp(null))).toBe('');
    expect(fmt.money(fp(null))).toBe('');
    expect(fmt.bps(fp(null))).toBe('');
    expect(fmt.date(fp(null))).toBe('');
    expect(fmt.time(fp(null))).toBe('');
    expect(fmt.time(fp('not-a-date'))).toBe('');
  });

  it('formats signed money with sign and zero', () => {
    expect(fmt.signedMoney(fp(null))).toBe('0');
    expect(fmt.signedMoney(fp(0))).toBe('0');
    expect(fmt.signedMoney(fp(1500))).toBe('+1,500');
    expect(fmt.signedMoney(fp(-250))).toBe('−250');
  });
});

describe('column helpers', () => {
  it('exposes semantic column groups', () => {
    expect(COL_GROUP.pricing).toBe('Pricing');
    expect(COL_GROUP.pnl).toBe('P&L');
  });

  it('finds columns by field or colId', () => {
    expect(findCol('cusip')?.field).toBe('cusip');
    expect(findCol('bidAskWidthBps')?.colId).toBe('bidAskWidthBps');
    expect(findCol('missing')).toBeUndefined();
  });

  it('picks columns in order and unhides them', () => {
    const picked = pickColumns(['cusip', 'dailyPnL', 'missing']);
    expect(picked).toHaveLength(2);
    expect(picked[0].field).toBe('cusip');
    expect(picked[0].hide).toBe(false);
    expect(picked[1].field).toBe('dailyPnL');
  });

  it('runs value getters for synthetic columns', () => {
    const widthCol = findCol('bidAskWidthBps');
    const sparkCol = findCol('krdSparkline');
    expect(getterOf(widthCol)?.(gp({ bidPrice: 100, askPrice: 101 }))).toBe(100);
    expect(getterOf(widthCol)?.(gp({ bidPrice: NaN, askPrice: 101 }))).toBeUndefined();
    expect(
      getterOf(sparkCol)?.(
        gp({ krd1Y: 1, krd2Y: 2, krd5Y: 3, krd10Y: 4, krd30Y: 5 }),
      ),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(getterOf(sparkCol)?.(gp(undefined))).toBeUndefined();
    expect(getterOf(sparkCol)?.(gp({}))).toEqual([0, 0, 0, 0, 0]);
  });

  it('defines base columns and default col def', () => {
    expect(baseColumns.length).toBeGreaterThan(20);
    expect(defaultColDef.resizable).toBe(true);
    expect(defaultColDef.sortable).toBe(true);
  });
});
