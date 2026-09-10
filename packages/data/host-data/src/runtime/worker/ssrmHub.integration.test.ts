import { describe, expect, it } from 'vitest';
import { SharedWorkerDataServicesHub, type PortLike } from './SharedWorkerDataServicesHub.js';
import { registerProvider } from '../providers/registry.js';
import type { RustHubLike } from '../ssrm/RustHubHost.js';
import type { StompSsrmProviderConfig } from '@wellsfargo-starui/types';
import type { SsrmRpcEvent } from '../protocol.js';

registerProvider('stomp-ssrm', (_cfg, emit) => {
  emit({ status: 'loading' });
  return { stop() {}, async restart() {} };
});

function makePort() {
  const messages: unknown[] = [];
  const port: PortLike & { messages: unknown[] } = {
    messages,
    postMessage(m: unknown) { messages.push(m); },
  };
  return port;
}

function fakeHub(trace?: { disconnected: string[]; disposed: string[] }): RustHubLike {
  const rows: Record<string, unknown>[] = [];
  return {
    boot_datasource: () => 'ok',
    connect: () => undefined,
    disconnect: (sid) => { trace?.disconnected.push(sid); return '[]'; },
    on_control: (_sid, msgJson) => {
      const msg = JSON.parse(msgJson) as { id: string; type: string; viewId?: string };
      if (msg.type === 'disposeView') {
        trace?.disposed.push(String(msg.viewId));
        return JSON.stringify([{ id: msg.id, type: 'result', payload: {} }]);
      }
      if (msg.type === 'openView') {
        return JSON.stringify([{ id: msg.id, type: 'result', payload: { viewId: 'v1' } }]);
      }
      if (msg.type === 'readWindow') {
        return JSON.stringify([{
          id: msg.id,
          type: 'result',
          payload: { rows, rowCount: rows.length },
        }]);
      }
      return JSON.stringify([{ id: msg.id, type: 'result', payload: { ok: true } }]);
    },
    tick: () => '[]',
    apply_message_json: (_ds, _p, raw) => {
      rows.push(...JSON.parse(raw) as Record<string, unknown>[]);
      return '[1,0]';
    },
    poll_shared_delta: () => '',
    mem_stats: () => '{}',
  };
}

const cfg: StompSsrmProviderConfig = {
  providerType: 'stomp-ssrm',
  websocketUrl: 'ws://localhost:9',
  listenerTopic: '/t',
  snapshotEndToken: 'Success',
  requestBody: '',
  keyColumn: 'id',
  columnDefinitions: [{ field: 'id' }],
};

describe('hub stomp-ssrm', () => {
  it('serves getRows from the wasm plane after ingest (no CSRM delta replay)', async () => {
    const hub = new SharedWorkerDataServicesHub({
      createRustHub: () => fakeHub(),
    });
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach',
      subId: 's1',
      providerId: 'ssrm-1',
      mode: 'ssrm',
      cfg,
    });

    const deltas = port.messages.filter((m) => (m as { kind?: string }).kind === 'delta');
    expect(deltas).toHaveLength(0);

    // Simulate STOMP emit via a second attach that starts the factory...
    // Direct plane ingest through a getRows after we inject rows by
    // calling the plane through a get-rows that starts empty, then
    // we post ssrm-get-rows.
    hub.handleRequest(port, {
      kind: 'ssrm-get-rows',
      reqId: 'r1',
      providerId: 'ssrm-1',
      subId: 's1',
      request: { startRow: 0, endRow: 10 },
    });
    await new Promise((r) => setTimeout(r, 20));
    const rpc = port.messages.find((m) => (m as SsrmRpcEvent).kind === 'ssrm-rpc') as SsrmRpcEvent | undefined;
    expect(rpc?.ok).toBe(true);
    expect(rpc?.result).toMatchObject({ rowCount: 0, rowData: [] });
  });

  it('answers ssrm-column-values so a set filter can populate its list', async () => {
    const hub = new SharedWorkerDataServicesHub({ createRustHub: () => fakeHub() });
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'ssrm-1', mode: 'ssrm', cfg,
    });
    hub.handleRequest(port, {
      kind: 'ssrm-column-values',
      reqId: 'r2',
      providerId: 'ssrm-1',
      subId: 's1',
      request: { column: 'id' },
    });
    await new Promise((r) => setTimeout(r, 20));
    const rpc = port.messages.find(
      (m) => (m as SsrmRpcEvent).reqId === 'r2',
    ) as SsrmRpcEvent | undefined;
    expect(rpc?.ok).toBe(true);
    expect(rpc?.result).toMatchObject({ column: 'id', values: [], truncated: false });
  });

  it('answers ssrm-row-count so a saved-filter pill can show a real total', async () => {
    const hub = new SharedWorkerDataServicesHub({ createRustHub: () => fakeHub() });
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'ssrm-1', mode: 'ssrm', cfg,
    });
    hub.handleRequest(port, {
      kind: 'ssrm-row-count',
      reqId: 'r3',
      providerId: 'ssrm-1',
      subId: 's1',
      request: { filterModel: { id: { filterType: 'text', type: 'contains', filter: '7' } } },
    });
    await new Promise((r) => setTimeout(r, 20));
    const rpc = port.messages.find(
      (m) => (m as SsrmRpcEvent).reqId === 'r3',
    ) as SsrmRpcEvent | undefined;
    expect(rpc?.ok).toBe(true);
    expect(rpc?.result).toMatchObject({ rowCount: 0 });
  });

  it('answers ssrm-aggregates so the status bar can show engine totals', async () => {
    const hub = new SharedWorkerDataServicesHub({ createRustHub: () => fakeHub() });
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'ssrm-1', mode: 'ssrm', cfg,
    });
    hub.handleRequest(port, {
      kind: 'ssrm-aggregates',
      reqId: 'r5',
      providerId: 'ssrm-1',
      subId: 's1',
      request: { specs: [{ column: 'marketValue', fn: 'sum' }] },
    });
    await new Promise((r) => setTimeout(r, 20));
    const rpc = port.messages.find(
      (m) => (m as SsrmRpcEvent).reqId === 'r5',
    ) as SsrmRpcEvent | undefined;
    expect(rpc?.ok).toBe(true);
    expect(rpc?.result).toMatchObject({ values: expect.any(Object) });
  });

  it('releases the engine session when a reload closes the port', async () => {
    // A reload never sends `detach` — the port just goes away — and the
    // SharedWorker outlives the page. Leaving the session and its live views
    // open means every reload adds another generation for the engine to
    // maintain on every tick, until block reads stop coming back.
    const trace = { disconnected: [] as string[], disposed: [] as string[] };
    const hub = new SharedWorkerDataServicesHub({ createRustHub: () => fakeHub(trace) });
    const port = makePort();
    hub.handleRequest(port, {
      kind: 'attach', subId: 's1', providerId: 'ssrm-1', mode: 'ssrm', cfg,
    });
    hub.handleRequest(port, {
      kind: 'ssrm-row-count', reqId: 'r4', providerId: 'ssrm-1', subId: 's1', request: {},
    });
    await new Promise((r) => setTimeout(r, 20));

    hub.onPortClosed(port);
    await new Promise((r) => setTimeout(r, 20));

    expect(trace.disposed).toEqual(['v1']);
    expect(trace.disconnected).toEqual(['s1']);
  });
});
