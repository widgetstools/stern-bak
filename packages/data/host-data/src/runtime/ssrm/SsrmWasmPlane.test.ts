import { describe, expect, it, vi } from 'vitest';
import { publishWindowMsOf, SsrmWasmPlane } from './SsrmWasmPlane.js';
import type { RustHubLike } from './RustHubHost.js';
import type { StompSsrmProviderConfig } from '@wellsfargo-starui/types';

function fakeHub(): RustHubLike & { rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [];
  const sessions = new Set<string>();
  return {
    rows,
    boot_datasource: () => 'ok',
    connect: (sid) => { sessions.add(sid); },
    disconnect: (sid) => {
      sessions.delete(sid);
      return sessions.size === 0 ? JSON.stringify(['p1#{}']) : '[]';
    },
    on_control: (_sid, msgJson) => {
      const msg = JSON.parse(msgJson) as { id: string; type: string; startRow?: number; endRow?: number };
      if (msg.type === 'subscribe' || msg.type === 'watchGroups') {
        return JSON.stringify([{ id: msg.id, type: 'result', payload: { ok: true } }]);
      }
      if (msg.type === 'openView') {
        return JSON.stringify([{ id: msg.id, type: 'result', payload: { viewId: 'v1' } }]);
      }
      if (msg.type === 'readWindow') {
        const start = msg.startRow ?? 0;
        const end = msg.endRow ?? rows.length;
        const page = rows.slice(start, end);
        return JSON.stringify([{
          id: msg.id,
          type: 'result',
          payload: { rows: page, rowCount: rows.length },
        }]);
      }
      return '[]';
    },
    tick: () => '[]',
    apply_message_json: (_ds, _p, raw) => {
      const batch = JSON.parse(raw) as Record<string, unknown>[];
      rows.push(...batch);
      return '[1,0]';
    },
    poll_shared_delta: () => '',
    mem_stats: () => '{"rows":0}',
  };
}

const cfg = {
  providerType: 'stomp-ssrm',
  websocketUrl: 'ws://x',
  listenerTopic: '/t',
  snapshotEndToken: 'Success',
  requestBody: '',
  keyColumn: 'id',
  columnDefinitions: [{ field: 'id' }, { field: 'desk' }],
} as StompSsrmProviderConfig;

describe('SsrmWasmPlane', () => {
  it('ingests flattened rows and returns a getRows page', async () => {
    const hub = fakeHub();
    const plane = new SsrmWasmPlane(() => hub);
    await plane.boot('p1', cfg);
    await plane.attachSession('s1');
    await plane.ingest('p1', [{ id: '1', desk: 'A' }, { id: '2', desk: 'B' }], false);
    const page = await plane.getRows('s1', 'p1', { startRow: 0, endRow: 1 });
    expect(page.rowCount).toBe(2);
    expect(page.rowData).toHaveLength(1);
    expect(page.rowData[0]).toMatchObject({ id: '1' });
  });

  it('reboots on empty replace, skips empty ingest, and stamps group keys', async () => {
    const hub = fakeHub();
    const boot = vi.spyOn(hub, 'boot_datasource');
    const plane = new SsrmWasmPlane(() => hub);
    await plane.boot('p1', {
      ...cfg,
      keyColumn: ['id', 'desk'],
      columnDefinitions: [
        { field: 'id', cellDataType: 'number' },
        { field: 'ok', cellDataType: 'boolean' },
        { field: 'desk' },
      ],
    } as StompSsrmProviderConfig);
    await plane.ingest('p1', [], true);
    expect(boot).toHaveBeenCalledTimes(2);
    await plane.ingest('p1', [], false);
    await plane.ingest('p1', [{ id: 1, nested: { a: 2 } }], false);
    await plane.reset('p1', cfg);
    await plane.watchGroups('s1', 'p1', { groupBy: ['desk'], aggregates: { qty: 'sum' } });
    hub.rows.length = 0;
    hub.rows.push({ desk: 'A', id: '1' });
    const grouped = await plane.getRows('s1', 'p1', {
      startRow: 0,
      endRow: 10,
      rowGroupCols: [{ id: 'desk' }],
    });
    expect(grouped.rowData[0]).toMatchObject({ __ssrmGroupKey: 'A' });
    expect(plane.memStats()).toEqual({ rows: 0 });
    await expect(plane.detachSession('s1')).resolves.toEqual(['p1#{}']);
  });

  it('polls group and row ticks and ignores a hub-less plane', () => {
    const empty = new SsrmWasmPlane(() => {
      throw new Error('unused');
    });
    expect(empty.pollTicks('p1')).toEqual([]);
    expect(empty.memStats()).toBeNull();
  });

  it('polls tick payloads from tick() and poll_shared_delta', async () => {
    const hub = fakeHub();
    hub.tick = () => JSON.stringify([
      { sessionId: 's1', messages: [{ type: 'groupDelta', groups: [{ desk: 'A' }], removed: [] }] },
    ]);
    hub.poll_shared_delta = () => JSON.stringify({
      type: 'rowDelta',
      upserts: [{ id: '1' }],
      removals: [],
      reset: false,
    });
    const plane = new SsrmWasmPlane(() => hub);
    await plane.boot('p1', cfg);
    await plane.attachSession('s1');
    await plane.getRows('s1', 'p1', { startRow: 0, endRow: 1 });
    expect(plane.pollTicks('p1')).toEqual([
      { kind: 'groupDelta', groups: [{ desk: 'A' }], removed: [] },
      { kind: 'rowDelta', upserts: [{ id: '1' }], removals: [], reset: false },
    ]);
  });

  it('routes each session\'s group deltas to its own provider in one drain', async () => {
    const hub = fakeHub();
    let drains = 0;
    hub.tick = () => {
      drains += 1;
      return JSON.stringify([
        { sessionId: 's1', messages: [{ type: 'groupDelta', groups: [{ desk: 'A' }], removed: [] }] },
        { sessionId: 's2', messages: [{ type: 'groupDelta', groups: [{ desk: 'B' }], removed: [] }] },
        { sessionId: 'gone', messages: [{ type: 'groupDelta', groups: [{ desk: 'Z' }], removed: [] }] },
      ]);
    };
    const polled: string[] = [];
    hub.poll_shared_delta = (ds) => {
      polled.push(ds);
      return ds === 'p2' ? JSON.stringify({ type: 'rowDelta', upserts: [{ id: 'x' }] }) : '';
    };
    const plane = new SsrmWasmPlane(() => hub);
    await plane.boot('p1', cfg);
    await plane.boot('p2', cfg);
    await plane.attachSession('s1');
    await plane.attachSession('s2');
    await plane.getRows('s1', 'p1', { startRow: 0, endRow: 1 });
    await plane.getRows('s2', 'p2', { startRow: 0, endRow: 1 });

    const buckets = plane.pollAllTicks();
    expect(drains).toBe(1);
    expect(polled.sort()).toEqual(['p1', 'p2']);
    expect(buckets.get('p1')).toEqual([
      { kind: 'groupDelta', groups: [{ desk: 'A' }], removed: [] },
    ]);
    expect(buckets.get('p2')).toEqual([
      { kind: 'groupDelta', groups: [{ desk: 'B' }], removed: [] },
      { kind: 'rowDelta', upserts: [{ id: 'x' }], removals: undefined, reset: undefined },
    ]);
    expect([...buckets.keys()]).not.toContain('gone');

    // A detached session's deltas are no longer routed anywhere.
    await plane.detachSession('s2');
    expect(plane.pollAllTicks().has('p2')).toBe(true); // shared row delta still polls
    expect(plane.pollAllTicks().get('p2')).toEqual([
      { kind: 'rowDelta', upserts: [{ id: 'x' }], removals: undefined, reset: undefined },
    ]);
  });

  describe('quick filter columns and date shapes', () => {
    function capturingHub() {
      const hub = fakeHub();
      const views: Array<{ filter?: unknown[] }> = [];
      const orig = hub.on_control;
      hub.on_control = (sid, json) => {
        const msg = JSON.parse(json) as { type?: string; view?: { filter?: unknown[] } };
        if (msg.type === 'openView' && msg.view) views.push(msg.view);
        return orig(sid, json);
      };
      return { hub, views };
    }

    it('searches every non-numeric column when no searchColumns are configured', async () => {
      const { hub, views } = capturingHub();
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', {
        ...cfg,
        searchColumns: undefined,
        columnDefinitions: [
          { field: 'id' },
          { field: 'desk', cellDataType: 'text' },
          { field: 'px', cellDataType: 'number' },
          { field: 'live', cellDataType: 'boolean' },
          { field: 'maturity', cellDataType: 'dateString' },
        ],
      } as StompSsrmProviderConfig);
      await plane.attachSession('s1');
      await plane.getRows('s1', 'p1', { startRow: 0, endRow: 1, quickFilterText: 'gov' });
      expect(views[0]?.filter).toEqual([{
        op: 'or',
        conditions: [
          { column: 'id', op: 'contains', value: 'gov' },
          { column: 'desk', op: 'contains', value: 'gov' },
          { column: 'maturity', op: 'contains', value: 'gov' },
        ],
      }]);
    });

    it('boots an epoch shadow per date column, stamps it at ingest, and filters / sorts dates on it', async () => {
      const { hub, views } = capturingHub();
      const boot = vi.spyOn(hub, 'boot_datasource');
      const apply = vi.spyOn(hub, 'apply_message_json');
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', {
        ...cfg,
        columnDefinitions: [{ field: 'id' }, { field: 'maturity', cellDataType: 'dateString' }],
      } as StompSsrmProviderConfig);
      const schema = JSON.parse(boot.mock.calls[0][0] as string) as { columns: Array<{ name: string; type: string }> };
      expect(schema.columns).toContainEqual({ name: 'maturity__epoch', type: 'f64' });

      await plane.attachSession('s1');
      await plane.ingest('p1', [{ id: '1', maturity: null }, { id: '2', maturity: '2031-06-30' }], false);
      const ingested = JSON.parse(apply.mock.calls[0][2] as string) as Array<Record<string, unknown>>;
      expect(ingested[0]).toMatchObject({ id: '1', maturity: null, maturity__epoch: null });
      expect(ingested[1]).toMatchObject({ id: '2', maturity: '2031-06-30', maturity__epoch: Date.UTC(2031, 5, 30) });

      await plane.getRows('s1', 'p1', {
        startRow: 0,
        endRow: 1,
        filterModel: { maturity: { filterType: 'date', type: 'greaterThan', dateFrom: '2030-01-05 00:00:00', dateTo: null } },
        sortModel: [{ colId: 'maturity', sort: 'desc' }],
      });
      const view = views[0] as { filter?: unknown[]; sort?: unknown[] };
      expect(view.filter).toEqual([
        { column: 'maturity__epoch', op: 'greaterThan', value: Date.UTC(2030, 0, 5) + 86_400_000 - 1 },
      ]);
      expect(view.sort).toEqual([{ column: 'maturity__epoch', sort: 'desc' }]);
    });
  });

  describe('getColumnValues', () => {
    it('reads distinct values from a one-level grouped view', async () => {
      const hub = fakeHub();
      const specs: unknown[] = [];
      const inner = hub.on_control;
      hub.on_control = (sid, msgJson) => {
        const msg = JSON.parse(msgJson) as { type: string; view?: unknown };
        if (msg.type === 'openView') specs.push(msg.view);
        return inner(sid, msgJson);
      };
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);
      await plane.attachSession('s1');
      await plane.ingest('p1', [{ id: '1', desk: 'A' }, { id: '2', desk: 'B' }], false);

      const result = await plane.getColumnValues('s1', 'p1', { column: 'desk' });
      expect(result).toEqual({ column: 'desk', values: ['A', 'B'], truncated: false });
      expect(specs.at(-1)).toMatchObject({
        groupBy: ['desk'],
        depth: 1,
        sort: [{ column: 'desk', sort: 'asc' }],
      });
    });

    it('excludes the column\'s own filter so de-selecting a value keeps it listed', async () => {
      const hub = fakeHub();
      const specs: Array<{ filter?: unknown[] }> = [];
      const inner = hub.on_control;
      hub.on_control = (sid, msgJson) => {
        const msg = JSON.parse(msgJson) as { type: string; view?: { filter?: unknown[] } };
        if (msg.type === 'openView' && msg.view) specs.push(msg.view);
        return inner(sid, msgJson);
      };
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);
      await plane.getColumnValues('s1', 'p1', {
        column: 'desk',
        filterModel: {
          desk: { filterType: 'set', values: ['A'] },
          id: { filterType: 'text', type: 'contains', filter: '7' },
        },
      });
      expect(specs.at(-1)?.filter).toEqual([{ column: 'id', op: 'contains', value: '7' }]);
    });

    it('falls back to the group key field and skips rows with no value', async () => {
      const hub = fakeHub();
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);
      await plane.ingest(
        'p1',
        [{ id: '1', __ssrmGroupKey: 'A' }, { id: '2' }, { id: '3', desk: 'B' }],
        false,
      );
      const result = await plane.getColumnValues('s1', 'p1', { column: 'desk' });
      expect(result.values).toEqual(['A', 'B']);
    });

    it('de-duplicates, caps at the limit and reports truncation', async () => {
      const hub = fakeHub();
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);
      await plane.ingest(
        'p1',
        [{ id: '1', desk: 'A' }, { id: '2', desk: 'A' }, { id: '3', desk: 'B' }, { id: '4', desk: 'C' }],
        false,
      );
      const capped = await plane.getColumnValues('s1', 'p1', { column: 'desk', limit: 2 });
      expect(capped.values).toEqual(['A', 'B']);
      expect(capped.truncated).toBe(true);
    });
  });

  describe('getAggregates', () => {
    it('asks the engine for dataset totals, not a window of loaded rows', async () => {
      const hub = fakeHub();
      let captured: Record<string, unknown> | undefined;
      const inner = hub.on_control;
      hub.on_control = (sid, msgJson) => {
        const msg = JSON.parse(msgJson) as { id: string; type: string; specs?: unknown; spec?: unknown };
        if (msg.type === 'aggregates') {
          captured = msg;
          return JSON.stringify([{
            id: msg.id,
            type: 'result',
            payload: { marketValue_sum: 12.5 },
          }]);
        }
        return inner(sid, msgJson);
      };
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);
      const result = await plane.getAggregates('s1', 'p1', {
        filterModel: { desk: { filterType: 'set', values: ['Govies'] } },
        specs: [{ column: 'marketValue', fn: 'sum' }],
      });
      expect(result).toEqual({ values: { marketValue_sum: 12.5 } });
      expect(captured?.specs).toEqual([{ column: 'marketValue', fn: 'sum', as: 'marketValue_sum' }]);
      expect((captured?.spec as { filter?: unknown[] })?.filter).toEqual([
        { column: 'desk', op: 'equalsIgnoreCase', value: 'Govies' },
      ]);
    });

    it('returns nothing when no specs are asked for', async () => {
      const plane = new SsrmWasmPlane(() => fakeHub());
      await plane.boot('p1', cfg);
      expect(await plane.getAggregates('s1', 'p1', { specs: [] })).toEqual({ values: {} });
    });
  });

  describe('getRowCount', () => {
    it('reports the view total without materialising it', async () => {
      const hub = fakeHub();
      const windows: Array<{ startRow?: number; endRow?: number }> = [];
      const inner = hub.on_control;
      hub.on_control = (sid, msgJson) => {
        const msg = JSON.parse(msgJson) as { type: string; startRow?: number; endRow?: number };
        if (msg.type === 'readWindow') windows.push(msg);
        return inner(sid, msgJson);
      };
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);
      await plane.ingest('p1', [{ id: '1', desk: 'A' }, { id: '2', desk: 'B' }], false);

      // The whole point of the RPC: a count without paying for the rows.
      expect(await plane.getRowCount('s1', 'p1', {})).toEqual({ rowCount: 2 });
      expect(windows.at(-1)).toMatchObject({ startRow: 0, endRow: 1 });
    });

    it('counts against the pill\'s filter model', async () => {
      const hub = fakeHub();
      const specs: Array<{ filter?: unknown[] }> = [];
      const inner = hub.on_control;
      hub.on_control = (sid, msgJson) => {
        const msg = JSON.parse(msgJson) as { type: string; view?: { filter?: unknown[] } };
        if (msg.type === 'openView' && msg.view) specs.push(msg.view);
        return inner(sid, msgJson);
      };
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);
      await plane.getRowCount('s1', 'p1', {
        filterModel: { desk: { filterType: 'set', values: ['Govies'] } },
      });
      expect(specs.at(-1)?.filter).toEqual([{ column: 'desk', op: 'equalsIgnoreCase', value: 'Govies' }]);
    });

    it('reports zero when the engine omits a count', async () => {
      const hub = fakeHub();
      const inner = hub.on_control;
      hub.on_control = (sid, msgJson) => {
        const msg = JSON.parse(msgJson) as { id: string; type: string };
        if (msg.type === 'readWindow') {
          return JSON.stringify([{ id: msg.id, type: 'result', payload: { rows: [] } }]);
        }
        return inner(sid, msgJson);
      };
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);
      expect(await plane.getRowCount('s1', 'p1', {})).toEqual({ rowCount: 0 });
    });
  });

  describe('view lifecycle', () => {
    // A view is live — the engine maintains it every tick — so opening one per
    // read and never disposing it compounds until the worker stops answering.
    function countingHub() {
      const hub = fakeHub();
      const opened: unknown[] = [];
      const disposed: string[] = [];
      let n = 0;
      const inner = hub.on_control;
      hub.on_control = (sid, msgJson) => {
        const msg = JSON.parse(msgJson) as { id: string; type: string; view?: unknown; viewId?: string };
        if (msg.type === 'openView') {
          opened.push(msg.view);
          n += 1;
          return JSON.stringify([{ id: msg.id, type: 'result', payload: { viewId: `v${n}` } }]);
        }
        if (msg.type === 'disposeView') {
          disposed.push(String(msg.viewId));
          return JSON.stringify([{ id: msg.id, type: 'result', payload: {} }]);
        }
        return inner(sid, msgJson);
      };
      return { hub, opened, disposed };
    }

    it('reuses one view for a repeated query instead of opening another', async () => {
      const { hub, opened } = countingHub();
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);

      // The pill count poll: same filter, over and over.
      const req = { filterModel: { desk: { filterType: 'set', values: ['Govies'] } } };
      for (let i = 0; i < 5; i += 1) await plane.getRowCount('s1', 'p1', req);

      expect(opened).toHaveLength(1);
    });

    it('reuses the view across the windows of one scroll', async () => {
      const { hub, opened } = countingHub();
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);

      await plane.getRows('s1', 'p1', { startRow: 0, endRow: 100 });
      await plane.getRows('s1', 'p1', { startRow: 100, endRow: 200 });
      await plane.getRows('s1', 'p1', { startRow: 200, endRow: 300 });

      expect(opened).toHaveLength(1);
    });

    it('keys on the query, not on the order its filters were assembled', async () => {
      const { hub, opened } = countingHub();
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);

      const a = { desk: { filterType: 'set', values: ['Govies'] } };
      const b = { id: { filterType: 'text', type: 'contains', filter: '7' } };
      await plane.getRowCount('s1', 'p1', { filterModel: { ...a, ...b } });
      await plane.getRowCount('s1', 'p1', { filterModel: { ...b, ...a } });

      expect(opened).toHaveLength(1);
    });

    async function countDistinctQueries(
      plane: SsrmWasmPlane,
      sessionId: string,
      n: number,
    ): Promise<void> {
      for (let i = 0; i < n; i += 1) {
        await plane.getRowCount(sessionId, 'p1', {
          filterModel: { id: { filterType: 'text', type: 'contains', filter: String(i) } },
        });
      }
    }

    it('caps the held views and disposes the ones it drops', async () => {
      const { hub, opened, disposed } = countingHub();
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);

      await countDistinctQueries(plane, 's1', 27);

      expect(opened).toHaveLength(27);
      // 24 held, so the three least recently used are released.
      expect(disposed).toEqual(['v1', 'v2', 'v3']);
    });

    it('caps each session separately, so one grid cannot evict another\'s', async () => {
      const { hub, disposed } = countingHub();
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);

      await plane.getRowCount('s1', 'p1', {});
      await countDistinctQueries(plane, 's2', 26);

      // s2 blew through its own cap; s1's single view is untouched.
      expect(disposed).not.toContain('v1');
      expect(disposed).toHaveLength(2);
    });

    it('releases a session\'s views when it detaches', async () => {
      const { hub, disposed } = countingHub();
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);
      await plane.attachSession('s1');
      await plane.getRowCount('s1', 'p1', {});
      await plane.getRowCount('s2', 'p1', {});

      await plane.detachSession('s1');
      expect(disposed).toEqual(['v1']);
    });

    it('drops views over a re-boot, since they point at a dead datasource', async () => {
      const { hub, opened, disposed } = countingHub();
      const plane = new SsrmWasmPlane(() => hub);
      await plane.boot('p1', cfg);
      await plane.getRowCount('s1', 'p1', {});

      await plane.reset('p1', cfg);
      expect(disposed).toEqual(['v1']);

      await plane.getRowCount('s1', 'p1', {});
      expect(opened).toHaveLength(2);
    });
  });

  it('throws when openView omits viewId or returns an error', async () => {
    const hub = fakeHub();
    hub.on_control = (_sid, msgJson) => {
      const msg = JSON.parse(msgJson) as { id: string; type: string };
      if (msg.type === 'openView') {
        return JSON.stringify([{ id: msg.id, type: 'result', payload: {} }]);
      }
      return JSON.stringify([{ id: msg.id, type: 'result', payload: { ok: true } }]);
    };
    const plane = new SsrmWasmPlane(() => hub);
    await plane.boot('p1', cfg);
    await expect(plane.getRows('s1', 'p1', { startRow: 0, endRow: 1 })).rejects.toThrow(/no viewId/);

    hub.on_control = (_sid, msgJson) => {
      const msg = JSON.parse(msgJson) as { id: string };
      return JSON.stringify([{ id: msg.id, error: 'bad spec' }]);
    };
    await expect(plane.getRows('s1', 'p1', { startRow: 0 })).rejects.toThrow(/bad spec/);

    hub.on_control = () => 'not-json';
    await expect(plane.getRows('s1', 'p1', { startRow: 0 })).rejects.toThrow(/no result/);
  });
});

describe('publishWindowMsOf', () => {
  it('defaults to 100 and honours a positive override', () => {
    expect(publishWindowMsOf({} as StompSsrmProviderConfig)).toBe(100);
    expect(publishWindowMsOf({ publishWindowMs: 0 } as StompSsrmProviderConfig)).toBe(100);
    expect(publishWindowMsOf({ publishWindowMs: 250 } as StompSsrmProviderConfig)).toBe(250);
  });
});
