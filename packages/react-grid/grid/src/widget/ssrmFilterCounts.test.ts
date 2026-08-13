import { describe, expect, it, vi } from 'vitest';
import { computeSsrmFilterCounts } from './ssrmFilterCounts.js';

const filters = [
  { id: 'f1', filterModel: { book: { filterType: 'text', type: 'equals', filter: 'A' } } },
  { id: 'f2', filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'FX' } } },
];

describe('computeSsrmFilterCounts', () => {
  it('counts each pill against the WHOLE cache via the worker rowCount', async () => {
    const getRows = vi.fn(async (req: { filterModel: unknown }) => ({
      rowData: [],
      rowCount:
        JSON.stringify(req.filterModel).includes('"A"') ? 42_000 : 7,
    }));

    const counts = await computeSsrmFilterCounts(filters, { getRows });

    expect(counts).toEqual({ f1: 42_000, f2: 7 });
    // Zero-row window: the worker filters everything but materialises nothing.
    for (const call of getRows.mock.calls) {
      expect(call[0]).toMatchObject({ startRow: 0, endRow: 0 });
    }
  });

  it('carries the active quick filter so counts match what the grid shows', async () => {
    const getRows = vi.fn(async () => ({ rowData: [], rowCount: 1 }));
    await computeSsrmFilterCounts(filters, {
      getRows,
      getQuickFilterText: () => 'alpha',
    });
    expect(getRows.mock.calls[0][0]).toMatchObject({ quickFilterText: 'alpha' });
  });

  it('returns 0 for a pill whose query fails instead of rejecting the batch', async () => {
    const getRows = vi.fn(async (req: { filterModel: unknown }) => {
      if (JSON.stringify(req.filterModel).includes('FX')) throw new Error('down');
      return { rowData: [], rowCount: 3 };
    });
    const counts = await computeSsrmFilterCounts(filters, { getRows });
    expect(counts).toEqual({ f1: 3, f2: 0 });
  });

  it('returns an empty record for no filters without touching the worker', async () => {
    const getRows = vi.fn();
    expect(await computeSsrmFilterCounts([], { getRows })).toEqual({});
    expect(getRows).not.toHaveBeenCalled();
  });
});
