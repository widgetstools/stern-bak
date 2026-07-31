/**
 * Regression tests for the worker bootstrap handshake.
 *
 * The bug these lock down: deployment fields were written to localStorage by
 * the main thread and read back inside the SharedWorker — where no Storage
 * API exists — so `appId`, `userId`, `seedConfigUrl` and
 * `configServiceRestUrl` were ALWAYS `undefined` and the worker's
 * ConfigManager silently ran local/anonymous. Any consumer pointing at a
 * REST config service was quietly ignored.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createConfigManager = vi.fn();
const installSharedWorkerHub = vi.fn();

vi.mock('@wellsfargo-starui/host-config', () => ({
  createConfigManager: (...args: unknown[]) => createConfigManager(...args),
}));

vi.mock('./index.js', () => ({
  installSharedWorkerHub: (...args: unknown[]) => installSharedWorkerHub(...args),
}));

interface WorkerGlobal {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
}

const flush = async (times = 4) => {
  for (let i = 0; i < times; i += 1) await new Promise((r) => setTimeout(r, 0));
};

/** Import the entry fresh — it registers `onconnect` and boots on import. */
async function loadEntry(): Promise<void> {
  vi.resetModules();
  await import('./defaultEntry.js');
}

function connect(): MessageChannel {
  const channel = new MessageChannel();
  (globalThis as unknown as WorkerGlobal).onconnect?.({ ports: [channel.port2] });
  return channel;
}

const fakeConfigManager = {
  init: vi.fn().mockResolvedValue(undefined),
  isRestMode: vi.fn().mockReturnValue(true),
};

describe('defaultEntry — worker bootstrap handshake', () => {
  beforeEach(() => {
    createConfigManager.mockReset().mockReturnValue(fakeConfigManager);
    installSharedWorkerHub.mockReset().mockResolvedValue({ hub: {}, stop: vi.fn() });
    fakeConfigManager.init.mockClear();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    (globalThis as unknown as WorkerGlobal).onconnect = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the ConfigManager from the payload the client sends over the port', async () => {
    await loadEntry();
    const channel = connect();

    channel.port1.postMessage({
      kind: 'worker-bootstrap',
      payload: {
        appId: 'Star-Demo',
        userId: 'k151344',
        seedConfigUrl: '/seed.json',
        seedConfigReload: 'when-changed',
        configServiceRestUrl: 'http://localhost:3001/api/v1',
      },
    });
    await flush();

    expect(createConfigManager).toHaveBeenCalledWith({
      appId: 'Star-Demo',
      identity: { userId: 'k151344', displayName: 'k151344' },
      seedConfigUrl: '/seed.json',
      seedConfigReload: 'when-changed',
      configServiceRestUrl: 'http://localhost:3001/api/v1',
    });
    expect(fakeConfigManager.init).toHaveBeenCalledTimes(1);
  });

  it('hands the connected port to the hub so the client is not dropped', async () => {
    await loadEntry();
    const channel = connect();

    channel.port1.postMessage({
      kind: 'worker-bootstrap',
      payload: { appId: 'app', userId: 'u1' },
    });
    await flush();

    expect(installSharedWorkerHub).toHaveBeenCalledTimes(1);
    const opts = installSharedWorkerHub.mock.calls[0][0] as {
      configManager: unknown;
      adoptPorts: Array<{ port: MessagePort; buffered: unknown[] }>;
    };
    expect(opts.configManager).toBe(fakeConfigManager);
    expect(opts.adoptPorts).toHaveLength(1);
    expect(opts.adoptPorts[0].port).toBe(channel.port2);
  });

  it('buffers requests the client sends before the hub exists, in order', async () => {
    await loadEntry();
    const channel = connect();

    // A real client fires appdata-attach immediately after connecting —
    // before the worker has even built its ConfigManager.
    channel.port1.postMessage({ kind: 'appdata-attach', reqId: 'a1', userId: 'u1' });
    channel.port1.postMessage({ kind: 'hub-ready', reqId: 'a2' });
    channel.port1.postMessage({
      kind: 'worker-bootstrap',
      payload: { appId: 'app', userId: 'u1' },
    });
    await flush();

    const opts = installSharedWorkerHub.mock.calls[0][0] as {
      adoptPorts: Array<{ buffered: Array<{ reqId?: string }> }>;
    };
    expect(opts.adoptPorts[0].buffered.map((m) => m.reqId)).toEqual(['a1', 'a2']);
  });

  it('adopts a second window that connects while the ConfigManager is initialising', async () => {
    let releaseInit: () => void = () => {};
    fakeConfigManager.init.mockImplementationOnce(
      () => new Promise<void>((resolve) => { releaseInit = () => resolve(); }),
    );

    await loadEntry();
    const first = connect();
    first.port1.postMessage({
      kind: 'worker-bootstrap',
      payload: { appId: 'app', userId: 'u1' },
    });
    await flush();

    // Second window shows up mid-init.
    const second = connect();
    second.port1.postMessage({ kind: 'hub-ready', reqId: 'late' });
    await flush();

    releaseInit();
    await flush();

    const opts = installSharedWorkerHub.mock.calls[0][0] as {
      adoptPorts: Array<{ port: MessagePort; buffered: Array<{ reqId?: string }> }>;
    };
    expect(opts.adoptPorts).toHaveLength(2);
    expect(opts.adoptPorts[1].port).toBe(second.port2);
    expect(opts.adoptPorts[1].buffered.map((m) => m.reqId)).toEqual(['late']);
  });

  it('boots local/anonymous when the handshake carries no identity', async () => {
    await loadEntry();
    const channel = connect();

    // sendWorkerBootstrap emits userId: '' when the caller has no user.
    channel.port1.postMessage({
      kind: 'worker-bootstrap',
      payload: { appId: 'app', userId: '' },
    });
    await flush();

    expect(createConfigManager).toHaveBeenCalledWith({
      appId: undefined,
      identity: undefined,
      seedConfigUrl: undefined,
      seedConfigReload: undefined,
      configServiceRestUrl: undefined,
    });
  });

  it('does not build the ConfigManager until the handshake arrives', async () => {
    await loadEntry();
    connect();
    await flush();

    expect(createConfigManager).not.toHaveBeenCalled();
    expect(installSharedWorkerHub).not.toHaveBeenCalled();
  });
});
