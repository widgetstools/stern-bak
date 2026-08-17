import { describe, expect, it } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { ApiHub } from './ApiHub';
import { GridDataHub, type CapabilityChangeSink } from './GridDataHub';
import { GridPlatform } from './GridPlatform';
import type { RowChangeSink, RowNodeDelta, SsrmDataSource } from './types';

/** A recording {@link RowChangeSink} — where an adapter reports its writes. */
function sink(): RowChangeSink & { deltas: RowNodeDelta[] } {
  const deltas: RowNodeDelta[] = [];
  return { deltas, transactionApplied: (d) => { deltas.push(d); } };
}

/** A recording capability-change announcer. */
function announcer(): CapabilityChangeSink & { announced: number } {
  const rec = {
    gridId: 'test-grid',
    announced: 0,
    emit: () => { rec.announced += 1; },
  };
  return rec;
}

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
    applyServerSideTransaction: () => ({ status: 'Applied', update: [node] }),
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
    const hub = new GridDataHub(api, sink(), announcer());

    await expect(hub.count()).resolves.toEqual({ count: 1, complete: true });
    expect(hub.capabilities.canAddressUnloadedRows.supported).toBe(true);
  });

  it('routes at the worker plane once bound — including its capabilities', async () => {
    const api = new ApiHub();
    api.attach(fakeApi());
    const hub = new GridDataHub(api, sink(), announcer());

    hub.bindSsrm({ source: fakeSource(99), keyColumn: 'id' });

    await expect(hub.count()).resolves.toEqual({ count: 99, complete: true });
    await expect(hub.aggregate('px', 'sum')).resolves.toEqual({ value: 42, complete: true });
    expect(hub.capabilities.canAddressUnloadedRows.supported).toBe(false);
  });

  it('re-binds to a replacement provider without the platform being rebuilt', async () => {
    const api = new ApiHub();
    api.attach(fakeApi());
    const hub = new GridDataHub(api, sink(), announcer());

    hub.bindSsrm({ source: fakeSource(10) });
    await expect(hub.count()).resolves.toMatchObject({ count: 10 });

    hub.bindSsrm({ source: fakeSource(20) });
    await expect(hub.count()).resolves.toMatchObject({ count: 20 });
  });

  it('falls back to the client-side row model when the source detaches', async () => {
    const api = new ApiHub();
    api.attach(fakeApi());
    const hub = new GridDataHub(api, sink(), announcer());

    hub.bindSsrm({ source: fakeSource(99) });
    hub.unbindSsrm();

    await expect(hub.count()).resolves.toEqual({ count: 1, complete: true });
    expect(hub.capabilities.mutationsReachSource.supported).toBe(true);
  });

  it('is one stable reference across a re-bind — modules capture it in activate()', () => {
    const hub = new GridDataHub(new ApiHub(), sink(), announcer());
    const captured = hub;
    hub.bindSsrm({ source: fakeSource(1) });
    hub.unbindSsrm();
    expect(captured).toBe(hub);
  });

  it('forwards reads and writes rather than answering them itself', async () => {
    const api = new ApiHub();
    api.attach(fakeApi());
    const hub = new GridDataHub(api, sink(), announcer());
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

  it('hands the row-change sink to the server-side adapter, so a write is not silent', async () => {
    const api = new ApiHub();
    api.attach(fakeApi());
    const rows = sink();
    const hub = new GridDataHub(api, rows, announcer());
    hub.bindSsrm({ source: fakeSource(3), keyColumn: 'id' });

    await expect(hub.mutate([{ rowId: 'r1', fields: { px: 2 } }])).resolves.toMatchObject({
      applied: ['r1'],
    });

    // `applyServerSideTransaction` fires no flush event, so this report is the
    // ONLY way alerts, timed activations and the filter badges learn the row
    // moved. Under the client-side adapter the flush event carries it and
    // nothing is reported by hand — hence no sink on that side at all.
    expect(rows.deltas).toHaveLength(1);
    expect(rows.deltas[0].update?.map((n) => n.id)).toEqual(['r1']);
  });

  it('announces a capability change on bind and on unbind, but not on a no-op unbind', () => {
    // The getter makes the answer current; the announcement is what makes a
    // rendered control notice. Without it a toolbar button disabled while the
    // source was binding stays disabled after it binds.
    const api = new ApiHub();
    api.attach(fakeApi());
    const events = announcer();
    const hub = new GridDataHub(api, sink(), events);

    hub.bindSsrm({ source: fakeSource(1) });
    expect(events.announced).toBe(1);
    hub.bindSsrm({ source: fakeSource(2) });
    expect(events.announced).toBe(2);
    hub.unbindSsrm();
    expect(events.announced).toBe(3);
    // Already client-side: nothing changed, so nothing is claimed to have.
    hub.unbindSsrm();
    expect(events.announced).toBe(3);
  });

  it('re-binding carries the same sink to the replacement adapter', async () => {
    const api = new ApiHub();
    api.attach(fakeApi());
    const rows = sink();
    const hub = new GridDataHub(api, rows, announcer());

    hub.bindSsrm({ source: fakeSource(1) });
    hub.bindSsrm({ source: fakeSource(2) });
    await hub.mutate([{ rowId: 'r1', fields: { px: 3 } }]);

    expect(rows.deltas).toHaveLength(1);
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
