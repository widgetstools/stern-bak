import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDataMirror } from '../runtime/mirror/AppDataMirror.js';
import {
  createAppDataBootstrapContext,
  runAppDataBootstrap,
  type AppDataBootstrapHookRegistry,
} from './appDataBootstrap.js';

function createMirror(rows: Array<{ name: string; values: Record<string, unknown> }> = []): AppDataMirror {
  const list = rows.map((r) => ({
    configId: `ad-${r.name}`,
    name: r.name,
    isPublic: false,
    values: r.values,
    userId: 'dev1',
  }));
  return {
    list: () => list,
    upsertConfig: vi.fn(async (cfg) => {
      const idx = list.findIndex((r) => r.name === cfg.name);
      if (idx >= 0) list[idx] = { ...list[idx], ...cfg };
      else list.push({ ...cfg, configId: cfg.configId || `ad-${cfg.name}` });
      return cfg;
    }),
  } as unknown as AppDataMirror;
}

describe('runAppDataBootstrap', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('runs hooks sequentially in manifest order', async () => {
    const order: string[] = [];
    const registry: AppDataBootstrapHookRegistry = {
      a: async () => { order.push('a'); },
      b: async () => { order.push('b'); },
    };
    await runAppDataBootstrap({
      manifest: { onHubReady: ['a', 'b'], runPolicy: 'always' },
      registry,
      appId: 'App',
      userId: 'dev1',
      appData: createMirror(),
      configManager: {} as never,
    });
    expect(order).toEqual(['a', 'b']);
  });

  it('skips unknown hook ids', async () => {
    const ran = vi.fn();
    await runAppDataBootstrap({
      manifest: { onHubReady: ['missing', 'ok'], runPolicy: 'always' },
      registry: { ok: ran },
      appId: 'App',
      userId: 'dev1',
      appData: createMirror(),
      configManager: {} as never,
    });
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('if-missing skips when all target providers have values', async () => {
    const ran = vi.fn();
    await runAppDataBootstrap({
      manifest: {
        onHubReady: ['seed'],
        runPolicy: 'if-missing',
        targets: { seed: ['SessionContext'] },
      },
      registry: { seed: ran },
      appId: 'App',
      userId: 'dev1',
      appData: createMirror([{ name: 'SessionContext', values: { userId: 'x' } }]),
      configManager: {} as never,
    });
    expect(ran).not.toHaveBeenCalled();
  });

  it('if-missing runs when target provider is absent', async () => {
    const ran = vi.fn();
    await runAppDataBootstrap({
      manifest: {
        onHubReady: ['seed'],
        runPolicy: 'if-missing',
        targets: { seed: ['SessionContext'] },
      },
      registry: { seed: ran },
      appId: 'App',
      userId: 'dev1',
      appData: createMirror(),
      configManager: {} as never,
    });
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('once-per-session runs hook only once', async () => {
    const ran = vi.fn();
    const opts = {
      manifest: { onHubReady: ['seed'], runPolicy: 'once-per-session' as const },
      registry: { seed: ran },
      appId: 'App',
      userId: 'dev1',
      appData: createMirror(),
      configManager: {} as never,
    };
    await runAppDataBootstrap(opts);
    await runAppDataBootstrap(opts);
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('upsertAppData merges existing row by name', async () => {
    const mirror = createMirror([{ name: 'SessionContext', values: { a: 1 } }]);
    const ctx = createAppDataBootstrapContext({
      appId: 'App',
      userId: 'dev1',
      appData: mirror,
      configManager: {} as never,
    });
    await ctx.upsertAppData({
      name: 'SessionContext',
      values: { userId: 'dev1', b: 2 },
    });
    expect(mirror.upsertConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'SessionContext',
        configId: 'ad-SessionContext',
        values: { userId: 'dev1', b: 2 },
      }),
    );
  });

  it('runs onUserChange hooks after onHubReady hooks', async () => {
    const order: string[] = [];
    const registry: AppDataBootstrapHookRegistry = {
      hub: async () => { order.push('hub'); },
      user: async () => { order.push('user'); },
    };
    await runAppDataBootstrap({
      manifest: { onHubReady: ['hub'], onUserChange: ['user'], runPolicy: 'always' },
      registry,
      appId: 'App',
      userId: 'dev1',
      appData: createMirror(),
      configManager: {} as never,
    });
    expect(order).toEqual(['hub', 'user']);
  });

  it('if-missing runs when target row exists but has no values', async () => {
    const ran = vi.fn();
    await runAppDataBootstrap({
      manifest: {
        onHubReady: ['seed'],
        runPolicy: 'if-missing',
        targets: { seed: ['SessionContext'] },
      },
      registry: { seed: ran },
      appId: 'App',
      userId: 'dev1',
      appData: createMirror([{ name: 'SessionContext', values: {} }]),
      configManager: {} as never,
    });
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('if-missing with no targets always runs the hook', async () => {
    const ran = vi.fn();
    await runAppDataBootstrap({
      manifest: {
        onHubReady: ['seed'],
        runPolicy: 'if-missing',
        targets: { seed: [] },
      },
      registry: { seed: ran },
      appId: 'App',
      userId: 'dev1',
      appData: createMirror([{ name: 'SessionContext', values: { x: 1 } }]),
      configManager: {} as never,
    });
    expect(ran).toHaveBeenCalledTimes(1);
  });

  it('invokes onError and continues when strict is false', async () => {
    const onError = vi.fn();
    const ok = vi.fn();
    await runAppDataBootstrap({
      manifest: { onHubReady: ['fail', 'ok'], runPolicy: 'always' },
      registry: {
        fail: async () => { throw new Error('boom'); },
        ok,
      },
      appId: 'App',
      userId: 'dev1',
      appData: createMirror(),
      configManager: {} as never,
      onError,
    });
    expect(onError).toHaveBeenCalledWith('fail', expect.any(Error));
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('rejects when strict is true and a hook throws', async () => {
    await expect(runAppDataBootstrap({
      manifest: { onHubReady: ['fail'], runPolicy: 'always' },
      registry: { fail: async () => { throw new Error('strict boom'); } },
      appId: 'App',
      userId: 'dev1',
      appData: createMirror(),
      configManager: {} as never,
      strict: true,
    })).rejects.toThrow(/strict boom/);
  });

  it('createAppDataBootstrapContext fetchJson throws on non-ok responses', async () => {
    const fetchJson = vi.fn(async () => {
      throw new Error('fetchJson failed (500): http://bad');
    });
    const ctx = createAppDataBootstrapContext({
      appId: 'App',
      userId: 'dev1',
      appData: createMirror(),
      configManager: {} as never,
      fetchJson,
    });
    await expect(ctx.fetchJson('http://bad')).rejects.toThrow(/500/);
  });

  it('createAppDataBootstrapContext log includes detail when provided', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const ctx = createAppDataBootstrapContext({
      appId: 'App',
      userId: 'dev1',
      appData: createMirror(),
      configManager: {} as never,
    });
    ctx.log('hello');
    ctx.log('with detail', { x: 1 });
    expect(infoSpy).toHaveBeenCalledWith(
      '[@wellsfargo-starui/host-data appDataBootstrap] hello',
    );
    expect(infoSpy).toHaveBeenCalledWith(
      '[@wellsfargo-starui/host-data appDataBootstrap] with detail',
      { x: 1 },
    );
    infoSpy.mockRestore();
  });

  it('once-per-session still runs when sessionStorage.getItem throws', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const ran = vi.fn();
    await runAppDataBootstrap({
      manifest: { onHubReady: ['seed'], runPolicy: 'once-per-session' },
      registry: { seed: ran },
      appId: 'App',
      userId: 'dev1',
      appData: createMirror(),
      configManager: {} as never,
    });
    expect(ran).toHaveBeenCalledTimes(1);
    getItem.mockRestore();
  });
});
