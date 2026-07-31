import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = {
  saveWorkspace: vi.fn(),
  getWorkspaces: vi.fn(),
  getWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
};

vi.mock('@openfin/workspace-platform', () => ({
  getCurrentSync: () => ({ Storage: storage }),
}));

const { __resetTestBridgeForTests, installTestBridge } = await import('./install.js');

describe('installTestBridge', () => {
  let handlers: Record<string, (payload?: unknown) => Promise<unknown>>;
  let create: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetTestBridgeForTests();
    handlers = {};
    create = vi.fn().mockResolvedValue({
      register: (name: string, fn: (payload?: unknown) => Promise<unknown>) => {
        handlers[name] = fn;
      },
    });
    Object.values(storage).forEach((fn) => fn.mockReset());
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('no-ops when fin is absent', async () => {
    vi.stubGlobal('fin', undefined);
    await installTestBridge();
    expect(create).not.toHaveBeenCalled();
  });

  it('registers channel actions and is idempotent', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { Channel: { create } },
    });
    await installTestBridge();
    await installTestBridge();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('marketsui-test-bridge');
    expect(Object.keys(handlers).sort()).toEqual([
      'deleteWorkspace',
      'getWorkspace',
      'getWorkspaces',
      'ping',
      'saveWorkspace',
    ]);
  });

  it('ping returns a structured ok reply', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { Channel: { create } },
    });
    await installTestBridge();
    await expect(handlers.ping()).resolves.toEqual({ ok: true, data: 'pong' });
  });

  it('safe() wraps storage successes and failures', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { Channel: { create } },
    });
    await installTestBridge();

    storage.getWorkspaces.mockResolvedValue([{ id: 'w1' }]);
    await expect(handlers.getWorkspaces()).resolves.toEqual({
      ok: true,
      data: [{ id: 'w1' }],
    });

    storage.getWorkspace.mockRejectedValue(new Error('missing'));
    await expect(handlers.getWorkspace({ id: 'x' })).resolves.toEqual({
      ok: false,
      error: 'missing',
    });

    storage.saveWorkspace.mockResolvedValue(undefined);
    await expect(handlers.saveWorkspace({ id: 'w' })).resolves.toEqual({
      ok: true,
      data: null,
    });

    storage.deleteWorkspace.mockRejectedValue('boom');
    await expect(handlers.deleteWorkspace({ id: 'w' })).resolves.toEqual({
      ok: false,
      error: 'boom',
    });
  });
});
