/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';

const ensurePlatformReady = vi.fn();
const subscribe = vi.fn();
const getProviderConfig = vi.fn();

vi.mock('@wellsfargo-starui/data', () => ({
  ensurePlatformReady: (...args: unknown[]) => ensurePlatformReady(...args),
}));

vi.mock('@wellsfargo-starui/data/runtime/client', () => ({}));

describe('installChannelDataHub', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('registers attach on the OpenFin channel', async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
    const provider = {
      register: vi.fn((action: string, fn: (payload: unknown) => Promise<unknown>) => {
        handlers.set(action, fn);
      }),
      publish: vi.fn(() => [] as unknown[]),
    };

    (globalThis as any).fin = {
      InterApplicationBus: {
        Channel: {
          create: vi.fn(async () => provider),
        },
      },
    };

    subscribe.mockReturnValue({
      snapshot: Promise.resolve([{ cusip: 'x' }]),
      onRowsReceived: vi.fn(),
      onStatus: vi.fn(),
      onUpdate: vi.fn(),
      onReset: vi.fn(),
      onSnapshotCommit: vi.fn(),
      unsubscribe: vi.fn(),
    });
    getProviderConfig.mockResolvedValue({
      config: { providerType: 'stomp', websocketUrl: 'ws://x', listenerTopic: '/t' },
    });
    ensurePlatformReady.mockResolvedValue({
      catalogReady: Promise.resolve(),
      client: { subscribe, getProviderConfig },
    });

    const { __resetChannelDataHubForTests, installChannelDataHub } = await import('./install.js');
    __resetChannelDataHubForTests();

    await installChannelDataHub({
      bootstrap: { appId: 'TestApp', userId: 'dev1' },
    });

    expect((globalThis as any).fin.InterApplicationBus.Channel.create).toHaveBeenCalledWith(
      'marketsui-data-hub',
    );

    const attach = handlers.get('attach');
    expect(attach).toBeDefined();
    const reply = await attach!({ providerId: 'p1' });
    expect(reply).toEqual({
      ok: true,
      data: expect.objectContaining({
        subscriptionId: expect.any(String),
        snapshot: [{ cusip: 'x' }],
      }),
    });
  });

  it('attach succeeds when publish returns a non-Promise (OpenFin runtime quirk)', async () => {
    const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
    const provider = {
      register: vi.fn((action: string, fn: (payload: unknown) => Promise<unknown>) => {
        handlers.set(action, fn);
      }),
      publish: vi.fn(() => [] as unknown[]),
    };

    (globalThis as any).fin = {
      InterApplicationBus: {
        Channel: {
          create: vi.fn(async () => provider),
        },
      },
    };

    subscribe.mockReturnValue({
      snapshot: Promise.resolve([{ id: '1' }]),
      onRowsReceived: vi.fn(),
      onStatus: vi.fn((cb: (status: string, error?: string) => void) => {
        cb('loading');
      }),
      onUpdate: vi.fn(),
      onReset: vi.fn(),
      onSnapshotCommit: vi.fn(),
      unsubscribe: vi.fn(),
    });
    getProviderConfig.mockResolvedValue({
      config: { providerType: 'stomp', websocketUrl: 'ws://x', listenerTopic: '/t' },
    });
    ensurePlatformReady.mockResolvedValue({
      catalogReady: Promise.resolve(),
      client: { subscribe, getProviderConfig },
    });

    const { __resetChannelDataHubForTests, installChannelDataHub } = await import('./install.js');
    __resetChannelDataHubForTests();
    await installChannelDataHub({ bootstrap: { appId: 'TestApp', userId: 'dev1' } });

    const reply = await handlers.get('attach')!({ providerId: 'p1' });
    expect(reply).toMatchObject({ ok: true });
    expect(provider.publish).toHaveBeenCalledWith('hub-event', expect.objectContaining({ type: 'status' }));
  });
});
