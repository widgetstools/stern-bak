import { describe, expect, it } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { ApiHub } from './ApiHub';
import { GridDataHub } from './GridDataHub';
import { GridPlatform } from './GridPlatform';
import type { SsrmDataSource } from './types';

/** A grid holding one row, enough to tell the two adapters apart by answer. */
function fakeApi(): GridApi {
  const node = { id: 'r1', data: { id: 'r1', px: 1 } };
  return {
    forEachNode: (fn: (n: unknown) => void) => fn(node),
    forEachNodeAfterFilter: (fn: (n: unknown) => void) => fn(node),
    getFilterModel: () => ({}),
    getGridOption: () => '',
    getRowNode: () => node,
    getDisplayedRowAtIndex: () => node,
  } as unknown as GridApi;
}

/** A worker plane holding a different number of rows, for the same reason. */
function fakeSource(rowCount: number): SsrmDataSource {
  return {
    getRows: async () => ({ rowData: [], rowCount }),
    getSetFilterValues: async () => ['from-worker'],
    getStatusBar: async () => ({
      totalRows: rowCount,
      filteredRows: rowCount,
      aggregations: [{ field: 'px', value: 42 }],
    }),
  };
}

describe('GridDataHub', () => {
  it('answers from the client-side row model until a server-side source is bound', async () => {
    const api = new ApiHub();
    api.attach(fakeApi());
    const hub = new GridDataHub(api);

    await expect(hub.count()).resolves.toEqual({ count: 1, complete: true });
    expect(hub.capabilities.canAddressUnloadedRows.supported).toBe(true);
  });

  it('routes at the worker plane once bound — including its capabilities', async () => {
    const api = new ApiHub();
    api.attach(fakeApi());
    const hub = new GridDataHub(api);

    hub.bindSsrm({ source: fakeSource(99), keyColumn: 'id' });

    await expect(hub.count()).resolves.toEqual({ count: 99, complete: true });
    await expect(hub.aggregate('px', 'sum')).resolves.toEqual({ value: 42, complete: true });
    expect(hub.capabilities.canAddressUnloadedRows.supported).toBe(false);
  });

  it('re-binds to a replacement provider without the platform being rebuilt', async () => {
    const api = new ApiHub();
    api.attach(fakeApi());
    const hub = new GridDataHub(api);

    hub.bindSsrm({ source: fakeSource(10) });
    await expect(hub.count()).resolves.toMatchObject({ count: 10 });

    hub.bindSsrm({ source: fakeSource(20) });
    await expect(hub.count()).resolves.toMatchObject({ count: 20 });
  });

  it('falls back to the client-side row model when the source detaches', async () => {
    const api = new ApiHub();
    api.attach(fakeApi());
    const hub = new GridDataHub(api);

    hub.bindSsrm({ source: fakeSource(99) });
    hub.unbindSsrm();

    await expect(hub.count()).resolves.toEqual({ count: 1, complete: true });
    expect(hub.capabilities.mutationsReachSource.supported).toBe(true);
  });

  it('is one stable reference across a re-bind — modules capture it in activate()', () => {
    const hub = new GridDataHub(new ApiHub());
    const captured = hub;
    hub.bindSsrm({ source: fakeSource(1) });
    hub.unbindSsrm();
    expect(captured).toBe(hub);
  });

  it('forwards reads and writes rather than answering them itself', async () => {
    const api = new ApiHub();
    api.attach(fakeApi());
    const hub = new GridDataHub(api);
    hub.bindSsrm({ source: fakeSource(3), keyColumn: 'id' });

    // `distinct` reaches the worker RPC…
    await expect(hub.distinct('book')).resolves.toMatchObject({
      values: ['from-worker'],
      stringProjected: true,
    });
    // …while addressed reads and writes go through the grid, which is where
    // the loaded rows live under either row model.
    await expect(hub.getRowsById(['r1'])).resolves.toMatchObject({ missing: [] });
    await expect(hub.getRowsInRange(0, 0)).resolves.toMatchObject({ missingIndices: [] });

    const scanned: string[] = [];
    await expect(hub.scan((r) => void scanned.push(r.id))).resolves.toMatchObject({
      complete: true,
    });
  });
});

describe('GridPlatform wiring', () => {
  it('exposes the port on the platform and on every module handle', () => {
    let handleData: unknown = null;
    const platform = new GridPlatform({
      gridId: 'g1',
      modules: [
        {
          id: 'probe',
          name: 'probe',
          schemaVersion: 1,
          priority: 0,
          getInitialState: () => ({}),
          serialize: (s: unknown) => s,
          deserialize: (r: unknown) => r,
          activate: (p) => {
            handleData = p.data;
            return () => {};
          },
        },
      ],
    });

    platform.onGridReady(fakeApi());
    expect(handleData).toBe(platform.data);
    platform.destroy();
  });

  it('takes a server-side binding at construction', async () => {
    const platform = new GridPlatform({
      gridId: 'g2',
      modules: [],
      ssrm: { source: fakeSource(7), keyColumn: 'id' },
    });
    await expect(platform.data.count()).resolves.toEqual({ count: 7, complete: true });
    platform.destroy();
  });
});
