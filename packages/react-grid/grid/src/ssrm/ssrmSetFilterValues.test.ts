import { describe, expect, it, vi } from 'vitest';
import { withSsrmSetFilterValues } from './ssrmSetFilterValues.js';

function deps(values: string[] = ['A', 'B']) {
  return {
    provider: { getSetFilterValues: vi.fn(async () => values) },
  };
}

async function runValues(col: Record<string, unknown>) {
  const params = { success: vi.fn(), colDef: col };
  const fp = col.filterParams as { values: (p: unknown) => void };
  fp.values(params);
  await new Promise((r) => setTimeout(r, 0));
  return params.success;
}

describe('withSsrmSetFilterValues', () => {
  it('wires async set-filter values that ask the worker for ALL unique values', async () => {
    const d = deps(['X', 'Y', 'Z']);
    const [col] = withSsrmSetFilterValues([{ field: 'book' }], d);

    const success = await runValues(col as Record<string, unknown>);

    // Column only — no filter/quick-filter scoping: the panel must list every
    // distinct value in the whole SSRM cache, not just loaded/visible rows.
    expect(d.provider.getSetFilterValues).toHaveBeenCalledWith({ column: 'book' });
    expect(success).toHaveBeenCalledWith(['X', 'Y', 'Z']);
    expect((col as { filterParams: { refreshValuesOnOpen?: boolean } }).filterParams.refreshValuesOnOpen).toBe(true);
  });

  it('decorates leaf columns inside header groups', async () => {
    const d = deps();
    const [group] = withSsrmSetFilterValues(
      [{ headerName: 'G', children: [{ field: 'desk' }] }],
      d,
    );
    const child = (group as { children: Record<string, unknown>[] }).children[0];
    await runValues(child);
    expect(d.provider.getSetFilterValues).toHaveBeenCalledWith({ column: 'desk' });
  });

  it('leaves filter:false columns and fieldless columns untouched', () => {
    const d = deps();
    const out = withSsrmSetFilterValues(
      [{ field: 'noFilter', filter: false }, { headerName: 'actions' }],
      d,
    );
    expect((out[0] as { filterParams?: unknown }).filterParams).toBeUndefined();
    expect((out[1] as { filterParams?: unknown }).filterParams).toBeUndefined();
  });

  it('merges existing filterParams instead of replacing them', async () => {
    const d = deps();
    const [col] = withSsrmSetFilterValues(
      [{ field: 'px', filterParams: { buttons: ['reset'] } }],
      d,
    );
    expect((col as { filterParams: { buttons: string[] } }).filterParams.buttons).toEqual(['reset']);
    await runValues(col as Record<string, unknown>);
    expect(d.provider.getSetFilterValues).toHaveBeenCalledWith({ column: 'px' });
  });

  it('injects values into the set sub-filter of an agMultiColumnFilter envelope', async () => {
    const d = deps(['A', 'B']);
    const [col] = withSsrmSetFilterValues(
      [{
        field: 'trader',
        filter: 'agMultiColumnFilter',
        filterParams: {
          filters: [
            { filter: 'agTextColumnFilter', filterParams: { buttons: ['reset'] } },
            { filter: 'agSetColumnFilter' },
          ],
        },
      }],
      d,
    );
    const fp = (col as { filterParams: { filters: Array<Record<string, unknown>> } }).filterParams;
    // Text sub-filter untouched.
    expect((fp.filters[0].filterParams as { buttons: string[] }).buttons).toEqual(['reset']);
    expect((fp.filters[0].filterParams as { values?: unknown }).values).toBeUndefined();
    // Set sub-filter got the worker-backed values callback.
    const setParams = fp.filters[1].filterParams as {
      values: (p: { success: (v: string[]) => void }) => void;
      refreshValuesOnOpen: boolean;
    };
    expect(setParams.refreshValuesOnOpen).toBe(true);
    const success = vi.fn();
    setParams.values({ success });
    await new Promise((r) => setTimeout(r, 0));
    expect(d.provider.getSetFilterValues).toHaveBeenCalledWith({ column: 'trader' });
    expect(success).toHaveBeenCalledWith(['A', 'B']);
  });

  it('reports an empty list when the worker call fails (panel stays usable)', async () => {
    const provider = { getSetFilterValues: vi.fn(async () => { throw new Error('down'); }) };
    const [col] = withSsrmSetFilterValues([{ field: 'book' }], { provider });
    const success = await runValues(col as Record<string, unknown>);
    expect(success).toHaveBeenCalledWith([]);
  });
});
