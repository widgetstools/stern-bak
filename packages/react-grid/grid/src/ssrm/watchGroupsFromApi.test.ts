import { describe, expect, it, vi } from 'vitest';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { watchGroupsFromApi } from './watchGroupsFromApi.js';

function col(id: string, agg?: string) {
  return { getColId: () => id, getAggFunc: () => agg };
}

function provider(): ISsrmDataProvider & { watchGroups: ReturnType<typeof vi.fn> } {
  return {
    id: 'p1',
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    getConfig: vi.fn(),
    getColumnDefs: vi.fn(() => []),
    getRows: vi.fn(),
    getColumnValues: vi.fn(),
    getRowCount: vi.fn(),
    getAggregates: vi.fn(),
    watchGroups: vi.fn().mockResolvedValue(undefined),
    onSsrmTick: vi.fn(() => () => undefined),
    onRowsReceived: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
    onError: vi.fn(() => () => undefined),
  };
}

describe('watchGroupsFromApi', () => {
  it('pushes current group + value columns and re-pushes on change', () => {
    const listeners = new Map<string, () => void>();
    const api = {
      getRowGroupColumns: vi.fn(() => [col('desk')]),
      getValueColumns: vi.fn(() => [col('qty', 'sum'), col('notional')]),
      addEventListener: vi.fn((name: string, fn: () => void) => { listeners.set(name, fn); }),
      removeEventListener: vi.fn(),
    };
    const p = provider();
    p.watchGroups.mockRejectedValueOnce(new Error('ignored'));
    const off = watchGroupsFromApi(p, api as never);
    expect(p.watchGroups).toHaveBeenCalledWith({
      groupBy: ['desk'],
      aggregates: { qty: 'sum', notional: 'sum' },
    });
    listeners.get('columnRowGroupChanged')?.();
    listeners.get('columnValueChanged')?.();
    expect(p.watchGroups).toHaveBeenCalledTimes(3);
    off();
    expect(api.removeEventListener).toHaveBeenCalledWith('columnRowGroupChanged', expect.any(Function));
    expect(api.removeEventListener).toHaveBeenCalledWith('columnValueChanged', expect.any(Function));
  });

  it('treats missing group/value column APIs as empty', () => {
    const p = provider();
    const off = watchGroupsFromApi(p, {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as never);
    expect(p.watchGroups).toHaveBeenCalledWith({ groupBy: [], aggregates: {} });
    off();
  });
});
