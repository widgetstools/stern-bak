import { describe, expect, it, vi } from 'vitest';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { withSsrmSetFilterDefaults, withSsrmSetFilterValues } from './withSsrmSetFilterValues.js';

function provider(values: unknown[] = ['A', 'B']) {
  return {
    getColumnValues: vi.fn(async (req: { column: string }) => ({
      column: req.column,
      values,
      truncated: false,
    })),
  } as unknown as ISsrmDataProvider & {
    getColumnValues: ReturnType<typeof vi.fn>;
  };
}

type ValuesFn = (params: {
  success: (v: unknown[]) => void;
  column?: { getColId?: () => string };
  colDef?: { colId?: string; field?: string };
  api?: { getFilterModel?: () => Record<string, unknown> };
}) => void;

function valuesOf(def: unknown): ValuesFn {
  return (def as { filterParams: { values: ValuesFn } }).filterParams.values;
}

describe('withSsrmSetFilterValues', () => {
  it('attaches an async values callback to a set filter column', async () => {
    const p = provider(['DeskA', 'DeskB']);
    const [def] = withSsrmSetFilterValues(
      [{ field: 'desk', filter: 'agSetColumnFilter' }],
      p,
    );

    const success = vi.fn();
    valuesOf(def)({ success });
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith(['DeskA', 'DeskB']));
    expect(p.getColumnValues).toHaveBeenCalledWith({ column: 'desk', filterModel: null });
  });

  it('treats filter: true as a set filter — Enterprise resolves it to one', () => {
    const [def] = withSsrmSetFilterValues([{ field: 'desk', filter: true }], provider());
    expect(typeof valuesOf(def)).toBe('function');
  });

  it('leaves an explicitly configured value list alone', () => {
    const input = [{
      field: 'desk',
      filter: 'agSetColumnFilter',
      filterParams: { values: ['only', 'these'] },
    }];
    expect(withSsrmSetFilterValues(input, provider())[0]).toBe(input[0]);
  });

  it('leaves text and number filters untouched', () => {
    const input = [
      { field: 'desk', filter: 'agTextColumnFilter' },
      { field: 'qty', filter: 'agNumberColumnFilter' },
    ];
    expect(withSsrmSetFilterValues(input, provider())).toEqual(input);
  });

  it('fills only the set slot of a multi filter', () => {
    const [def] = withSsrmSetFilterValues([{
      field: 'desk',
      filter: 'agMultiColumnFilter',
      filterParams: {
        filters: [{ filter: 'agTextColumnFilter' }, { filter: 'agSetColumnFilter' }],
      },
    }], provider());

    const filters = (def as { filterParams: { filters: Array<{ filterParams?: { values?: unknown } }> } })
      .filterParams.filters;
    expect(filters[0].filterParams).toBeUndefined();
    expect(typeof filters[1].filterParams?.values).toBe('function');
  });

  it('leaves a multi filter whose sub-filters are listed without a set slot untouched', () => {
    const input = [{
      field: 'desk',
      filter: 'agMultiColumnFilter',
      filterParams: { filters: [{ filter: 'agTextColumnFilter' }] },
    }];
    expect(withSsrmSetFilterValues(input, provider())[0]).toBe(input[0]);
  });

  // A Multi Filter with no `filters` array still renders a Set Filter — it's
  // AG Grid's default composition, and the column-settings editor emits this
  // shape whenever a Multi kind is picked without hand-listing sub-filters.
  it('materialises the default composition when the sub-filters are implicit', () => {
    const [def] = withSsrmSetFilterValues(
      [{ field: 'desk', filter: 'agMultiColumnFilter' }],
      provider(),
    );
    const filters = (def as { filterParams: { filters: Array<{ filter: string; filterParams?: { values?: unknown } }> } })
      .filterParams.filters;
    expect(filters.map((f) => f.filter)).toEqual(['agTextColumnFilter', 'agSetColumnFilter']);
    expect(typeof filters[1].filterParams?.values).toBe('function');
  });

  it.each([
    ['number', 'agNumberColumnFilter'],
    ['date', 'agDateColumnFilter'],
    ['dateString', 'agDateColumnFilter'],
    ['text', 'agTextColumnFilter'],
    [undefined, 'agTextColumnFilter'],
  ])('pairs the set slot with the %s type filter', (cellDataType, expected) => {
    const [def] = withSsrmSetFilterValues(
      [{ field: 'qty', cellDataType, filter: 'agMultiColumnFilter' }],
      provider(),
    );
    const filters = (def as { filterParams: { filters: Array<{ filter: string }> } })
      .filterParams.filters;
    expect(filters[0].filter).toBe(expected);
  });

  it('keeps the multi filter\'s own params when materialising sub-filters', () => {
    const [def] = withSsrmSetFilterValues(
      [{ field: 'desk', filter: 'agMultiColumnFilter', filterParams: { buttons: ['reset'] } }],
      provider(),
    );
    expect((def as { filterParams: { buttons: string[] } }).filterParams.buttons)
      .toEqual(['reset']);
  });

  it('recurses into column groups', () => {
    const [group] = withSsrmSetFilterValues([{
      headerName: 'Book',
      children: [{ field: 'desk', filter: 'agSetColumnFilter' }],
    }], provider());
    const child = (group as { children: unknown[] }).children[0];
    expect(typeof valuesOf(child)).toBe('function');
  });

  it('passes the live filter model so the list only offers reachable values', async () => {
    const p = provider();
    const [def] = withSsrmSetFilterValues([{ field: 'desk', filter: 'agSetColumnFilter' }], p);
    const model = { trader: { filterType: 'text', type: 'contains', filter: 'ann' } };

    valuesOf(def)({ success: vi.fn(), api: { getFilterModel: () => model } });
    await vi.waitFor(() => expect(p.getColumnValues)
      .toHaveBeenCalledWith({ column: 'desk', filterModel: model }));
  });

  it('opens the list on every open but keeps the current selection', () => {
    const [def] = withSsrmSetFilterValues([{ field: 'desk', filter: 'agSetColumnFilter' }], provider());
    expect((def as { filterParams: Record<string, unknown> }).filterParams).toMatchObject({
      refreshValuesOnOpen: true,
      suppressClearModelOnRefreshValues: true,
    });
  });

  it('honours an explicit limit', async () => {
    const p = provider();
    const [def] = withSsrmSetFilterValues(
      [{ field: 'desk', filter: 'agSetColumnFilter' }],
      p,
      { limit: 25 },
    );
    valuesOf(def)({ success: vi.fn() });
    await vi.waitFor(() => expect(p.getColumnValues)
      .toHaveBeenCalledWith({ column: 'desk', filterModel: null, limit: 25 }));
  });

  it('gives up on a lookup that never answers, so the first block is not held', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      // A saturated worker doesn't reject — it just never replies. AG Grid
      // won't apply a set-filter model until the list lands, so an active
      // saved-filter pill would hold the grid on "loading" forever.
      const p = { getColumnValues: vi.fn(() => new Promise(() => {})) } as unknown as ISsrmDataProvider;
      const [def] = withSsrmSetFilterValues(
        [{ field: 'desk', filter: 'agSetColumnFilter' }],
        p,
        { timeoutMs: 100 },
      );

      const success = vi.fn();
      valuesOf(def)({ success });
      expect(success).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);
      expect(success).toHaveBeenCalledWith([]);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it('succeeds once — a late answer after the timeout is ignored', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      let resolve!: (v: { column: string; values: unknown[]; truncated: boolean }) => void;
      const p = {
        getColumnValues: vi.fn(() => new Promise((res) => { resolve = res as never; })),
      } as unknown as ISsrmDataProvider;
      const [def] = withSsrmSetFilterValues(
        [{ field: 'desk', filter: 'agSetColumnFilter' }],
        p,
        { timeoutMs: 100 },
      );

      const success = vi.fn();
      valuesOf(def)({ success });
      await vi.advanceTimersByTimeAsync(100);
      resolve({ column: 'desk', values: ['A'], truncated: false });
      await vi.advanceTimersByTimeAsync(0);

      expect(success).toHaveBeenCalledTimes(1);
      expect(success).toHaveBeenCalledWith([]);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it('falls back to an empty list rather than hanging when the lookup fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = {
      getColumnValues: vi.fn().mockRejectedValue(new Error('worker gone')),
    } as unknown as ISsrmDataProvider;
    const [def] = withSsrmSetFilterValues([{ field: 'desk', filter: 'agSetColumnFilter' }], p);

    const success = vi.fn();
    valuesOf(def)({ success });
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith([]));
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('skips columns with no id to ask about', () => {
    const input = [{ filter: 'agSetColumnFilter' }];
    expect(withSsrmSetFilterValues(input, provider())[0]).toBe(input[0]);
  });
});

describe('withSsrmSetFilterDefaults', () => {
  it('resolves the column from the params, since the default serves them all', async () => {
    const p = provider();
    const defaults = withSsrmSetFilterDefaults({ filter: true }, p);

    valuesOf(defaults)({ success: vi.fn(), column: { getColId: () => 'trader' } });
    await vi.waitFor(() => expect(p.getColumnValues)
      .toHaveBeenCalledWith({ column: 'trader', filterModel: null }));
  });

  it('falls back to the colDef when no column proxy is supplied', async () => {
    const p = provider();
    const defaults = withSsrmSetFilterDefaults({ filter: 'agSetColumnFilter' }, p);

    valuesOf(defaults)({ success: vi.fn(), colDef: { field: 'region' } });
    await vi.waitFor(() => expect(p.getColumnValues)
      .toHaveBeenCalledWith({ column: 'region', filterModel: null }));
  });

  it('succeeds with nothing when the column cannot be identified', () => {
    const p = provider();
    const success = vi.fn();
    valuesOf(withSsrmSetFilterDefaults({ filter: true }, p))({ success });
    expect(success).toHaveBeenCalledWith([]);
    expect(p.getColumnValues).not.toHaveBeenCalled();
  });

  it('leaves a default with no set filter alone, including undefined', () => {
    const input = { filter: 'agTextColumnFilter' };
    expect(withSsrmSetFilterDefaults(input, provider())).toBe(input);
    expect(withSsrmSetFilterDefaults(undefined, provider())).toBeUndefined();
  });
});
