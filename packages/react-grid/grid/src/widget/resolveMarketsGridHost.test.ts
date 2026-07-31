import { describe, expect, it, vi } from 'vitest';
import type { GridHostContext } from '@wellsfargo-starui/host';
import {
  dataPortAsAppDataLookup,
  resolveMarketsGridHost,
  storagePortAsAdapter,
} from './resolveMarketsGridHost';

describe('resolveMarketsGridHost', () => {
  it('prefers explicit props over host-derived identity', () => {
    const host = {
      runtime: {
        resolveIdentity: () => ({ appId: 'host-app', userId: 'host-user', instanceId: 'host-inst' }),
      },
      storage: { get: vi.fn(), set: vi.fn() },
      data: {
        getSnapshot: () => ({ lookup: vi.fn() }),
        subscribe: vi.fn(() => () => {}),
      },
    } as unknown as GridHostContext;

    const resolved = resolveMarketsGridHost(host, {
      gridId: 'grid-1',
      appId: 'prop-app',
      userId: 'prop-user',
      instanceId: 'prop-inst',
    });

    expect(resolved).toEqual({
      appId: 'prop-app',
      userId: 'prop-user',
      instanceId: 'prop-inst',
      storageAdapter: host.storage,
      appData: expect.any(Object),
    });
  });

  it('falls back to gridId when no instance id is available', () => {
    const resolved = resolveMarketsGridHost(undefined, { gridId: 'grid-1' });
    expect(resolved.instanceId).toBe('grid-1');
    expect(resolved.storageAdapter).toBeUndefined();
    expect(resolved.appData).toBeUndefined();
  });

  it('wraps host ports into engine adapter shapes', () => {
    const lookup = vi.fn();
    const subscribe = vi.fn(() => () => {});
    const storage = { get: vi.fn(), set: vi.fn() };
    const data = { getSnapshot: () => ({ lookup }), subscribe };

    expect(storagePortAsAdapter(storage as never)).toBe(storage);
    const appData = dataPortAsAppDataLookup(data as never);
    appData.get('orders', 'key');
    expect(lookup).toHaveBeenCalledWith('orders', 'key');
    const unsub = appData.subscribe(vi.fn());
    expect(subscribe).toHaveBeenCalled();
    unsub();
  });
});
