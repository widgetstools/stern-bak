/**
 * Tick fan-out is trimmed per session: a grid that has read a flat block
 * gets only the changed rows it holds plus counts of the rest; a session
 * that never read a block still gets the whole row delta.
 */

import { describe, expect, it } from 'vitest';
import { SharedWorkerDataServicesHub, type PortLike } from './SharedWorkerDataServicesHub.js';
import type { RustHubLike } from '../ssrm/RustHubHost.js';
import type { MockSsrmProviderConfig } from '@wellsfargo-starui/types';
import { registerProvider } from '../providers/registry.js';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider.js';
import type { SsrmTickEvent } from '../protocol.js';

function makePort() {
  const messages: unknown[] = [];
  const port: PortLike & { messages: unknown[] } = { messages, postMessage(m: unknown) { messages.push(m); } };
  return port;
}

function fakeHub(deltas: string[]): RustHubLike {
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
    poll_shared_delta: () => deltas.shift() ?? '',
    mem_stats: () => '{}',
  };
}

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const ticksOn = (port: { messages: unknown[] }) =>
  port.messages.filter((m): m is SsrmTickEvent => (m as { kind?: string }).kind === 'ssrm-tick');

describe('HubSsrmRpc — per-session tick trimming', () => {
  it('trims the row delta to the rows a session loaded and leaves an unread session on full ticks', async () => {
    let emit: ProviderEmit | null = null;
    registerProvider('mock-ssrm' as MockSsrmProviderConfig['providerType'], (_cfg, e) => {
      emit = e;
      const handle: ProviderHandle = { stop() {}, restart() {} };
      return handle;
    });
    const deltas: string[] = [];
    const timers: Array<() => void> = [];
    const hub = new SharedWorkerDataServicesHub({
      createRustHub: () => fakeHub(deltas),
      setTimer: (cb) => { timers.push(cb); return timers.length; },
      clearTimer: () => {},
    });
    const cfg = { providerType: 'mock-ssrm', keyColumn: 'id', columnDefinitions: [{ field: 'id' }] } as unknown as MockSsrmProviderConfig;
    const reader = makePort();
    const idle = makePort();
    hub.handleRequest(reader, { kind: 'attach', subId: 'reader', providerId: 'p1', mode: 'ssrm', cfg });
    hub.handleRequest(idle, { kind: 'attach', subId: 'idle', providerId: 'p1', mode: 'ssrm', cfg });
    await flush();
    emit!({ rows: [{ id: 'r1', px: 1 }, { id: 'r2', px: 1 }], replace: true });
    emit!({ status: 'ready' });
    await flush();

    // The reader loads one flat block: r1 + r2.
    hub.handleRequest(reader, {
      kind: 'ssrm-get-rows', reqId: 'g1', providerId: 'p1', subId: 'reader',
      request: { startRow: 0, endRow: 200, sortModel: [], filterModel: {}, rowGroupCols: [], groupKeys: [], valueCols: [] } as never,
    });
    await flush();

    // The whole table churns: r1 (loaded) and r9 (not) change; r2 (loaded) and r7 (not) go.
    deltas.push(JSON.stringify({ type: 'rowDelta', upserts: [{ id: 'r1', px: 2 }, { id: 'r9', px: 3 }], removals: ['r2', 'r7'] }));
    for (const cb of timers) cb();

    const toReader = ticksOn(reader);
    expect(toReader).toHaveLength(1);
    expect(toReader[0].payload).toEqual({
      kind: 'rowDelta',
      upserts: [{ id: 'r1', px: 2 }],
      removals: ['r2'],
      unloaded: { upserts: 1, removals: 1 },
    });
    const toIdle = ticksOn(idle);
    expect(toIdle).toHaveLength(1);
    expect(toIdle[0].payload).toEqual({ kind: 'rowDelta', upserts: [{ id: 'r1', px: 2 }, { id: 'r9', px: 3 }], removals: ['r2', 'r7'], reset: undefined });

    const stats = hub.buildIntrospectSnapshot().ssrm!.tickFlush;
    expect(stats.ticksPosted).toBe(2);
    expect(stats.upsertsPosted).toBe(3);
    expect(stats.upsertsWithheld).toBe(1);

    // A tick that touches nothing the reader holds still carries the counts it needs.
    deltas.push(JSON.stringify({ type: 'rowDelta', upserts: [{ id: 'r9', px: 4 }], removals: [] }));
    for (const cb of timers) cb();
    expect(ticksOn(reader)).toHaveLength(2);
    expect(ticksOn(reader)[1].payload).toEqual({ kind: 'rowDelta', upserts: [], removals: [], unloaded: { upserts: 1, removals: 0 } });

    // Detach forgets the window: a re-attached session is unread again.
    hub.handleRequest(reader, { kind: 'detach', subId: 'reader' });
    await flush();
    await hub.dispose();
  });
});
