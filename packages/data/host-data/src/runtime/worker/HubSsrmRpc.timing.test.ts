/**
 * `hub-introspect.ssrm` — the data worker's SSRM accounting: queue wait
 * (from the client's `sentAt` stamp) and engine time per block read, tick
 * flush cost with the session count, ingest cost. Driven through the hub
 * with the fake WASM engine the integration suite uses.
 */

import { describe, expect, it } from 'vitest';
import { SharedWorkerDataServicesHub, type PortLike } from './SharedWorkerDataServicesHub.js';
import type { RustHubLike } from '../ssrm/RustHubHost.js';
import type { MockSsrmProviderConfig } from '@wellsfargo-starui/types';
import { registerProvider } from '../providers/registry.js';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider.js';

function makePort() {
  const messages: unknown[] = [];
  const port: PortLike & { messages: unknown[] } = { messages, postMessage(m: unknown) { messages.push(m); } };
  return port;
}

function fakeHub(): RustHubLike {
  const rows: Record<string, unknown>[] = [];
  return {
    boot_datasource: () => 'ok',
    connect: () => undefined,
    disconnect: () => '[]',
    on_control: (_sid, msgJson) => {
      const msg = JSON.parse(msgJson) as { id: string; type: string };
      if (msg.type === 'openView') return JSON.stringify([{ id: msg.id, type: 'result', payload: { viewId: 'v1' } }]);
      if (msg.type === 'readWindow') return JSON.stringify([{ id: msg.id, type: 'result', payload: { rows, rowCount: rows.length } }]);
      return JSON.stringify([{ id: msg.id, type: 'result', payload: { ok: true } }]);
    },
    tick: () => '[]',
    apply_message_json: (_ds, _p, raw) => { rows.push(...JSON.parse(raw) as Record<string, unknown>[]); return '[1,0]'; },
    delete_rows: () => '[0]',
    truncate: () => '[0]',
    replace_snapshot: (_ds, _p, raw) => { rows.length = 0; rows.push(...JSON.parse(raw) as Record<string, unknown>[]); return `[${rows.length},0]`; },
    drop_table: () => 'true',
    poll_shared_delta: () => '',
    mem_stats: () => '{}',
  };
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('hub-introspect.ssrm — SSRM plane accounting', () => {
  it('records queue wait + engine time per block read, tick flushes with the session count, and ingest', async () => {
    let emit: ProviderEmit | null = null;
    registerProvider('mock-ssrm' as MockSsrmProviderConfig['providerType'], (_cfg, e) => {
      emit = e;
      const handle: ProviderHandle = { stop() {}, restart() {} };
      return handle;
    });
    const timers: Array<() => void> = [];
    const hub = new SharedWorkerDataServicesHub({
      createRustHub: () => fakeHub(),
      setTimer: (cb) => { timers.push(cb); return timers.length; },
      clearTimer: () => {},
    });
    const cfg = { providerType: 'mock-ssrm', keyColumn: 'id', columnDefinitions: [{ field: 'id' }] } as unknown as MockSsrmProviderConfig;
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'ssrm', cfg });
    await flush();

    // Fresh hub: nothing accounted yet.
    const empty = hub.buildIntrospectSnapshot().ssrm!;
    expect(empty.getRows.queueMs.n).toBe(0);
    expect(empty.tickFlush.n).toBe(0);

    emit!({ rows: [{ id: 'r1' }, { id: 'r2' }], replace: true });
    emit!({ status: 'ready' });
    await flush();

    // A block read stamped as sent 40 ms ago.
    hub.handleRequest(port, {
      kind: 'ssrm-get-rows', reqId: 'g1', providerId: 'p1', subId: 's1',
      sentAt: Date.now() - 40,
      request: { startRow: 0, endRow: 200, sortModel: [], filterModel: {}, rowGroupCols: [], groupKeys: [], valueCols: [] } as never,
    });
    await flush();
    // A tick flush from the ticker the SSRM boot armed.
    for (const cb of timers) cb();

    const s = hub.buildIntrospectSnapshot().ssrm!;
    expect(s.getRows.queueMs.n).toBe(1);
    expect(s.getRows.queueMs.p50).toBeGreaterThanOrEqual(40);
    expect(s.getRows.engineMs.n).toBe(1);
    expect(s.getRows.engineMs.max).toBeGreaterThanOrEqual(0);
    expect(s.otherRpc.queueMs.n).toBe(0);
    expect(s.tickFlush.n).toBeGreaterThanOrEqual(1);
    expect(s.tickFlush.sessions).toBe(1);
    expect(s.ingest.n).toBe(1);
    expect(s.windowSeconds).toBeGreaterThanOrEqual(0);
    await hub.dispose();
  });

  it('a request without a send stamp still counts engine time but no queue wait', async () => {
    registerProvider('mock-ssrm' as MockSsrmProviderConfig['providerType'], () => ({ stop() {}, restart() {} }));
    const hub = new SharedWorkerDataServicesHub({ createRustHub: () => fakeHub(), setTimer: () => 1, clearTimer: () => {} });
    const cfg = { providerType: 'mock-ssrm', keyColumn: 'id', columnDefinitions: [{ field: 'id' }] } as unknown as MockSsrmProviderConfig;
    const port = makePort();
    hub.handleRequest(port, { kind: 'attach', subId: 's1', providerId: 'p1', mode: 'ssrm', cfg });
    await flush();
    hub.handleRequest(port, { kind: 'ssrm-row-count', reqId: 'c1', providerId: 'p1', subId: 's1', request: {} as never });
    await flush();
    const s = hub.buildIntrospectSnapshot().ssrm!;
    expect(s.otherRpc.queueMs.n).toBe(0);
    expect(s.otherRpc.engineMs.n).toBe(1);
    await hub.dispose();
  });
});
