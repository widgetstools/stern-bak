import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

const { configStore } = vi.hoisted(() => ({
  configStore: { list: vi.fn(), save: vi.fn() },
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({ configStore }),
  useUserIdFromContext: () => 'dev1',
}));

import {
  LAB_SSRM_PROVIDER_ID,
  buildLabSsrmConfig,
  labSsrmProviderDraft,
  useSeedLabSsrmProvider,
} from './labSsrmProvider';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/**
 * A byte-equal re-save restarts the provider and re-streams the whole
 * snapshot — the cold-start lesson from `stomp-ssrm-minimal`. "Seed once"
 * therefore has to mean once: the hook saves only on a real difference.
 */
describe('useSeedLabSsrmProvider', () => {
  it('seeds the catalog row when nothing is stored', async () => {
    configStore.list.mockResolvedValue([]);
    configStore.save.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSeedLabSsrmProvider());

    await waitFor(() => expect(result.current).toBe(LAB_SSRM_PROVIDER_ID));
    expect(configStore.list).toHaveBeenCalledWith('dev1', { subtype: 'mock-ssrm' });
    expect(configStore.save).toHaveBeenCalledWith(labSsrmProviderDraft, 'dev1');
  });

  it('does not re-save a row that already matches', async () => {
    configStore.list.mockResolvedValue([
      { providerId: LAB_SSRM_PROVIDER_ID, config: buildLabSsrmConfig() },
    ]);

    const { result } = renderHook(() => useSeedLabSsrmProvider());

    await waitFor(() => expect(result.current).toBe(LAB_SSRM_PROVIDER_ID));
    expect(configStore.save).not.toHaveBeenCalled();
  });

  it('re-saves when the stored config has drifted', async () => {
    configStore.list.mockResolvedValue([
      { providerId: LAB_SSRM_PROVIDER_ID, config: { ...buildLabSsrmConfig(), rowCount: 10 } },
    ]);
    configStore.save.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSeedLabSsrmProvider());

    await waitFor(() => expect(result.current).toBe(LAB_SSRM_PROVIDER_ID));
    expect(configStore.save).toHaveBeenCalledTimes(1);
  });

  it('re-saves a stored row that carries no config at all', async () => {
    configStore.list.mockResolvedValue([{ providerId: LAB_SSRM_PROVIDER_ID }]);
    configStore.save.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSeedLabSsrmProvider());

    await waitFor(() => expect(result.current).toBe(LAB_SSRM_PROVIDER_ID));
    expect(configStore.save).toHaveBeenCalledTimes(1);
  });

  it('ignores other providers in the catalog', async () => {
    configStore.list.mockResolvedValue([{ providerId: 'someone-else', config: {} }]);
    configStore.save.mockResolvedValue(undefined);

    renderHook(() => useSeedLabSsrmProvider());

    await waitFor(() => expect(configStore.save).toHaveBeenCalled());
  });

  it('reports no provider id until the seed resolves', () => {
    configStore.list.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSeedLabSsrmProvider());
    // The App shows "Seeding the mock-ssrm provider…" off this null.
    expect(result.current).toBeNull();
  });

  it('does not set state after unmount', async () => {
    let resolve!: (rows: unknown[]) => void;
    configStore.list.mockReturnValue(new Promise((r) => { resolve = r as never; }));
    configStore.save.mockResolvedValue(undefined);

    const { unmount } = renderHook(() => useSeedLabSsrmProvider());
    unmount();
    resolve([]);

    await waitFor(() => expect(configStore.save).toHaveBeenCalled());
  });
});
