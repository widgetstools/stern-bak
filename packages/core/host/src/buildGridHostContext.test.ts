import { describe, expect, it, vi } from 'vitest';
import type { StorageAdapter, StorageAdapterFactory } from '@wellsfargo-starui/core';
import type { IdentitySnapshot } from '@wellsfargo-starui/types';
import type { RuntimePort } from './RuntimePort.js';
import type { DataPort } from './DataPort.js';
import { buildGridHostContext, storageFactoryForPersistence } from './buildGridHostContext.js';

/**
 * These decide where a grid's profile bundle is persisted and under what
 * scope. Getting the scope wrong makes one grid load another's saved layout,
 * so the identity/instanceId threading is the part worth pinning.
 */

const identity: IdentitySnapshot = {
  instanceId: 'win-1',
  appId: 'Star-Demo',
  userId: 'k151344',
  componentType: 'MarketsGrid',
} as IdentitySnapshot;

function fakeRuntime(over: Partial<RuntimePort> = {}): RuntimePort {
  return {
    name: 'fake',
    resolveIdentity: () => identity,
    getTheme: () => 'dark',
    setTheme: () => {},
    onThemeChanged: () => () => {},
    onWindowShown: () => () => {},
    onWindowClosing: () => () => {},
    onCustomDataChanged: () => () => {},
    onWorkspaceSave: () => () => {},
    dispose: () => {},
    ...over,
  } as RuntimePort;
}

const fakeAdapter = () => ({ load: vi.fn(), save: vi.fn() }) as unknown as StorageAdapter;

describe('storageFactoryForPersistence', () => {
  it('returns a memory-backed factory for "memory"', () => {
    const factory = storageFactoryForPersistence('memory');
    expect(typeof factory).toBe('function');
    // Each call yields a fresh in-memory adapter, so grids never share state.
    const a = factory({ gridId: 'g', instanceId: 'i', appId: 'a', userId: 'u' });
    const b = factory({ gridId: 'g', instanceId: 'i', appId: 'a', userId: 'u' });
    expect(a).not.toBe(b);
  });

  it('returns a localStorage-backed factory for "localStorage"', () => {
    expect(typeof storageFactoryForPersistence('localStorage')).toBe('function');
  });

  it('returns the supplied config factory for "config"', () => {
    const configFactory = vi.fn() as unknown as StorageAdapterFactory;
    expect(storageFactoryForPersistence('config', configFactory)).toBe(configFactory);
  });

  it('throws an actionable error when "config" is requested without a factory', () => {
    // Silently downgrading to localStorage here would lose profiles on another
    // machine, so this must fail loudly.
    expect(() => storageFactoryForPersistence('config')).toThrow(/ConfigManager/i);
  });

  it('ignores a config factory for the non-config modes', () => {
    const configFactory = vi.fn() as unknown as StorageAdapterFactory;
    expect(storageFactoryForPersistence('memory', configFactory)).not.toBe(configFactory);
    expect(storageFactoryForPersistence('localStorage', configFactory)).not.toBe(configFactory);
  });
});

describe('buildGridHostContext', () => {
  it('scopes storage by gridId plus the runtime identity', () => {
    const factory = vi.fn(fakeAdapter) as unknown as StorageAdapterFactory;
    buildGridHostContext(fakeRuntime(), factory, { gridId: 'blotter' });

    expect(factory).toHaveBeenCalledWith({
      gridId: 'blotter',
      instanceId: 'blotter',
      appId: 'Star-Demo',
      userId: 'k151344',
    });
  });

  it('defaults instanceId to gridId when the scope omits it', () => {
    const factory = vi.fn(fakeAdapter) as unknown as StorageAdapterFactory;
    buildGridHostContext(fakeRuntime(), factory, { gridId: 'only-grid' });
    expect((factory as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].instanceId).toBe('only-grid');
  });

  it('honours an explicit instanceId so two grids of one type stay separate', () => {
    const factory = vi.fn(fakeAdapter) as unknown as StorageAdapterFactory;
    buildGridHostContext(fakeRuntime(), factory, { gridId: 'blotter', instanceId: 'pane-2' });
    expect((factory as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].instanceId).toBe('pane-2');
  });

  it('returns a context carrying the runtime and storage', () => {
    const ctx = buildGridHostContext(
      fakeRuntime(), vi.fn(fakeAdapter) as unknown as StorageAdapterFactory, { gridId: 'g' },
    );
    expect(ctx.runtime).toBeDefined();
    expect(ctx.storage).toBeDefined();
  });

  it('omits data when not supplied', () => {
    const ctx = buildGridHostContext(
      fakeRuntime(), vi.fn(fakeAdapter) as unknown as StorageAdapterFactory, { gridId: 'g' },
    );
    expect(ctx.data).toBeUndefined();
  });

  it('threads through the data port when supplied', () => {
    const data = { subscribe: vi.fn() } as unknown as DataPort;
    const ctx = buildGridHostContext(
      fakeRuntime(), vi.fn(fakeAdapter) as unknown as StorageAdapterFactory,
      { gridId: 'g' }, { data },
    );
    expect(ctx.data).toBe(data);
  });

  it('reads identity from the runtime on every build', () => {
    const resolveIdentity = vi.fn(() => identity);
    buildGridHostContext(
      fakeRuntime({ resolveIdentity }), vi.fn(fakeAdapter) as unknown as StorageAdapterFactory,
      { gridId: 'g' },
    );
    expect(resolveIdentity).toHaveBeenCalledTimes(1);
  });
});
