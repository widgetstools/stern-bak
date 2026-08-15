/**
 * Port handover — the window between `defaultEntry` releasing its own
 * temporary listener and the hub attaching its real one.
 *
 * The bug this locks down: `defaultEntry` accepts ports before the hub can
 * exist (it needs the `worker-bootstrap` payload to build the ConfigManager),
 * buffering what they send. Handover used to `removeEventListener` and
 * snapshot the buffer BEFORE calling `installSharedWorkerHub`, which then
 * awaited `hydrateCatalog()` + `hydrateAppData()` — two IndexedDB round-trips
 * — before attaching its own listener. Across that await the port was
 * `start()`ed with NO listener, and a started MessagePort DISCARDS messages
 * rather than re-queueing them.
 *
 * A client posts `worker-bootstrap` and then immediately `appdata-attach`
 * (see `bootstrap.ts`), so the attach routinely landed in that window and was
 * lost for good. `AppDataMirror.ready()` resolves only from the resulting
 * `appdata-snapshot` and has no timeout or retry, so it then hung forever —
 * the "sometimes" in the editor's Test Connection button sitting on
 * "Connecting…". Reproduced in a real browser: `isReady()` false and
 * `list()` empty indefinitely while the grid's own data plane worked fine.
 *
 * Unlike the `pendingPorts` path inside `installSharedWorkerHub` (safe — those
 * ports are never `start()`ed, so the browser queues for them), this handover
 * has to be gap-free. These tests use a real `MessageChannel` and the real
 * hub; only `createConfigManager` is stubbed, so the hydration await is real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createConfigManager = vi.fn();

vi.mock('@wellsfargo-starui/core/host/config', () => ({
  createConfigManager: (...args: unknown[]) => createConfigManager(...args),
}));

interface WorkerGlobal {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
}

type Reply = { kind: string; reqId?: string };

function collect(port: MessagePort): Reply[] {
  const received: Reply[] = [];
  port.addEventListener('message', (ev: MessageEvent) => received.push(ev.data as Reply));
  port.start();
  return received;
}

async function waitForCount(received: unknown[], count: number, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (received.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function settle(times = 8): Promise<void> {
  for (let i = 0; i < times; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('defaultEntry — gap-free port handover', () => {
  beforeEach(() => {
    createConfigManager.mockReset();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (globalThis as unknown as WorkerGlobal).onconnect = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as unknown as WorkerGlobal).onconnect = null;
  });

  it('dispatches a request that arrives while the hub is hydrating', async () => {
    // Hold AppData hydration open so the handover window is wide and
    // deterministic — exactly the real IndexedDB round-trip, just slower.
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => { openGate = resolve; });

    createConfigManager.mockReturnValue({
      init: vi.fn().mockResolvedValue(undefined),
      isRestMode: vi.fn().mockReturnValue(false),
      getConfigsByComponentTypesUnfiltered: async () => {
        await gate;
        return [];
      },
    });

    vi.resetModules();
    await import('./defaultEntry.js');

    const channel = new MessageChannel();
    const received = collect(channel.port1);
    (globalThis as unknown as WorkerGlobal).onconnect?.({ ports: [channel.port2] });

    // A real client posts the handshake and then keeps talking immediately —
    // `bootstrap.ts` fires `appdata-attach` without waiting for anything.
    channel.port1.postMessage({
      kind: 'worker-bootstrap',
      payload: { appId: 'test-app', userId: 'test-user' },
    });
    await settle();

    // This is the message that used to vanish: sent after handover began,
    // while the hub was still awaiting hydration.
    channel.port1.postMessage({ kind: 'hub-ready', reqId: 'during-hydration' });
    await settle();

    openGate();
    await waitForCount(received, 1);

    expect(received.map((m) => m.reqId)).toContain('during-hydration');
  });

  it('still replays what was buffered before the handshake settled', async () => {
    createConfigManager.mockReturnValue({
      init: vi.fn().mockResolvedValue(undefined),
      isRestMode: vi.fn().mockReturnValue(false),
      getConfigsByComponentTypesUnfiltered: async () => [],
    });

    vi.resetModules();
    await import('./defaultEntry.js');

    const channel = new MessageChannel();
    const received = collect(channel.port1);
    (globalThis as unknown as WorkerGlobal).onconnect?.({ ports: [channel.port2] });

    // Pre-bootstrap traffic — buffered by defaultEntry's own listener.
    channel.port1.postMessage({ kind: 'hub-ready', reqId: 'early' });
    await settle();
    channel.port1.postMessage({
      kind: 'worker-bootstrap',
      payload: { appId: 'test-app', userId: 'test-user' },
    });

    await waitForCount(received, 1);
    expect(received.map((m) => m.reqId)).toContain('early');
  });
});
