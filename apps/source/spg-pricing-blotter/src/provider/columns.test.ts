import { describe, expect, it } from 'vitest';
import type { CellClassParams, ColDef, ValueFormatterParams } from 'ag-grid-community';
import { SPG_DEFAULT_COL_DEF, buildSpgColumnDefs } from './columns';
import { CellStateStore } from '../trading/cellStates';

function build() {
  const store = new CellStateStore();
  const defs = buildSpgColumnDefs(store);
  const by = (field: string) => defs.find((d) => d.field === field)!;
  return { store, defs, by };
}

const format = (def: ColDef, value: unknown) =>
  (def.valueFormatter as (p: ValueFormatterParams) => string)({ value } as ValueFormatterParams);

const classes = (def: ColDef, params: Partial<CellClassParams>) =>
  Object.entries(def.cellClassRules ?? {})
    .filter(([, rule]) => (rule as (p: CellClassParams) => boolean)(params as CellClassParams))
    .map(([name]) => name);

describe('buildSpgColumnDefs', () => {
  it('pins the key column and locks it there', () => {
    const { by } = build();
    expect(by('cusip')).toMatchObject({ pinned: 'left', lockPinned: true });
  });

  it('marks exactly the server-writable columns editable', () => {
    const { defs } = build();
    const editable = defs.filter((d) => d.editable).map((d) => d.field).sort();
    // Same set as WRITABLE_FIELDS — a column editable here but read-only on
    // the server gives the trader a cell that always ends up red.
    expect(editable).toEqual(
      ['coupon', 'price', 'priorPrice', 'spreadDm', 'trader', 'yieldToMaturity'],
    );
  });

  it('hides the original face by default and keeps the rest visible', () => {
    const { defs } = build();
    expect(defs.filter((d) => d.hide).map((d) => d.field)).toEqual(['originalFace']);
  });

  describe('formatting', () => {
    it('shows marks in three decimal points', () => {
      const { by } = build();
      expect(format(by('price'), 99.5)).toBe('99.500');
      expect(format(by('priorPrice'), 100)).toBe('100.000');
    });

    it('shows money in thousands separators, rounded', () => {
      const { by } = build();
      expect(format(by('marketValue'), 1234567.89)).toBe('1,234,568');
      expect(format(by('currentFace'), 0)).toBe('0');
    });

    it('signs PnL so a loss reads as one at a glance', () => {
      const { by } = build();
      expect(format(by('pnl'), 1500.4)).toBe('+1,500');
      expect(format(by('pnl'), -1500.4)).toBe('-1,500');
      expect(format(by('pnl'), 0)).toBe('0');
    });

    it('formats the remaining numerics to their desk precision', () => {
      const { by } = build();
      expect(format(by('priceChangePct'), 1.234)).toBe('1.23%');
      expect(format(by('spreadDm'), 240.6)).toBe('241');
      expect(format(by('yieldToMaturity'), 5.1234)).toBe('5.123');
      expect(format(by('walYears'), 7.456)).toBe('7.46');
      expect(format(by('factor'), 0.1234567)).toBe('0.123457');
    });

    it('shows the time of day from the update stamp', () => {
      const { by } = build();
      expect(format(by('lastUpdate'), '2020-01-02T14:31:05.123Z')).toBe('14:31:05');
    });

    /**
     * A cell with no value has to render EMPTY, not "NaN" or "undefined" —
     * under SSRM an unloaded block hands every formatter an undefined value.
     */
    it('renders nothing for a value that is not a number', () => {
      const { by } = build();
      for (const field of ['price', 'marketValue', 'pnl', 'priceChangePct', 'spreadDm', 'walYears']) {
        expect(format(by(field), undefined)).toBe('');
        expect(format(by(field), null)).toBe('');
        expect(format(by(field), 'n/a')).toBe('');
      }
      expect(format(by('lastUpdate'), 42)).toBe('');
    });
  });

  describe('write-state painting', () => {
    it('paints a cell for the state its own row and column is in', () => {
      const { store, by } = build();
      store.mark('C1', { price: 99.5 }, 'staged');
      const params = { data: { cusip: 'C1' } };

      expect(classes(by('price'), params)).toEqual(['spg-cell-staged']);
      // A different column of the same row is untouched.
      expect(classes(by('coupon'), params)).toEqual([]);

      store.mark('C1', { price: 99.5 }, 'pending');
      expect(classes(by('price'), params)).toEqual(['spg-cell-pending']);

      store.mark('C1', { price: 99.5 }, 'failed');
      expect(classes(by('price'), params)).toEqual(['spg-cell-failed']);

      store.clear('C1');
      expect(classes(by('price'), params)).toEqual([]);
    });

    it('does not paint a row the store knows nothing about', () => {
      const { store, by } = build();
      store.mark('C1', { price: 1 }, 'pending');
      expect(classes(by('price'), { data: { cusip: 'C2' } })).toEqual([]);
    });

    it('treats a row with no cusip as unpainted rather than throwing', () => {
      // Group rows and the SSRM loading placeholder both arrive with no data.
      const { store, by } = build();
      store.mark('', { price: 1 }, 'pending');
      expect(classes(by('price'), {})).toEqual(['spg-cell-pending']);
      expect(classes(by('price'), { data: undefined })).toEqual(['spg-cell-pending']);
    });
  });

  describe('directional colouring', () => {
    it('colours a positive move up and a negative move down', () => {
      const { by } = build();
      for (const field of ['priceChangePct', 'pnl']) {
        expect(classes(by(field), { value: 1 })).toEqual(['spg-num-up']);
        expect(classes(by(field), { value: -1 })).toEqual(['spg-num-down']);
        expect(classes(by(field), { value: 0 })).toEqual([]);
        expect(classes(by(field), { value: undefined })).toEqual([]);
      }
    });
  });
});

describe('SPG_DEFAULT_COL_DEF', () => {
  it('flashes changed cells, which is how a commit echo is visible at all', () => {
    expect(SPG_DEFAULT_COL_DEF).toMatchObject({
      sortable: true,
      resizable: true,
      filter: true,
      floatingFilter: false,
      enableCellChangeFlash: true,
    });
  });
});
