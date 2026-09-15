import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

const { configStore, userId } = vi.hoisted(() => ({
  configStore: { list: vi.fn(), save: vi.fn() },
  userId: { value: 'dev1' },
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({ configStore }),
  useUserIdFromContext: () => userId.value,
}));

import {
  SPG_PROVIDER_ID,
  buildSpgProviderConfig,
  spgProviderDraft,
  useSpgProviderId,
} from './spgProvider';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  userId.value = 'dev1';
});

describe('buildSpgProviderConfig', () => {
  const config = buildSpgProviderConfig();
  const columns = config.columnDefinitions ?? [];

  it('points at the SPG server\'s snapshot topic and keys rows by cusip', () => {
    expect(config).toMatchObject({
      providerType: 'stomp-ssrm',
      websocketUrl: 'ws://localhost:8091',
      listenerTopic: '/snapshot/positions/SPGDESK',
      keyColumn: 'cusip',
      dataType: 'positions',
    });
  });

  it('does not auto-start — the app starts it once the catalog row is seeded', () => {
    // Starting before `useSpgProviderId` has saved the row would stream a
    // snapshot into an engine the grid is not attached to.
    expect(config.autoStart).toBe(false);
  });

  it('asks for ambient drift and a snapshot window long enough for the full book', () => {
    expect(config.requestMessage).toBe('/snapshot/positions/SPGDESK/4/500');
    expect(config.snapshotEndToken).toBe('Success');
    expect(config.snapshotTimeoutMs).toBe(60_000);
  });

  /**
   * This is the ENGINE schema, not the grid's. Getting a type wrong here is
   * not cosmetic: a number typed as text sorts lexicographically and
   * range-filters not at all, and `maturityDate` only compares as an instant
   * because it is declared `dateString`.
   */
  describe('engine column types', () => {
    const typeOf = (field: string) =>
      columns.find((c) => c.field === field)?.cellDataType;

    it('types every numeric column as a number', () => {
      for (const field of [
        'coupon', 'spreadDm', 'yieldToMaturity', 'walYears', 'factor', 'originalFace',
        'currentFace', 'price', 'priorPrice', 'priceChangePct', 'marketValue', 'pnl',
      ]) {
        expect(typeOf(field)).toBe('number');
      }
    });

    it('types the maturity as a date string so day-range filters work', () => {
      expect(typeOf('maturityDate')).toBe('dateString');
      expect(columns.find((c) => c.field === 'maturityDate')?.filter)
        .toBe('agDateColumnFilter');
    });

    it('leaves the update stamp unfiltered', () => {
      expect(columns.find((c) => c.field === 'lastUpdate')?.filter).toBe(false);
    });

    it('covers every field the grid shows', () => {
      const engineFields = new Set(columns.map((c) => c.field));
      for (const field of ['cusip', 'dealName', 'assetClass', 'tranche', 'rating', 'desk', 'trader']) {
        expect(engineFields.has(field)).toBe(true);
      }
    });
  });

  it('builds a fresh config object each call', () => {
    // The draft below is compared by JSON against the stored row; a shared
    // mutable object would let a caller's edit look like a server change.
    expect(buildSpgProviderConfig()).not.toBe(config);
    expect(buildSpgProviderConfig()).toEqual(config);
  });
});

describe('spgProviderDraft', () => {
  it('is the catalog row for this app\'s single provider', () => {
    expect(spgProviderDraft).toMatchObject({
      providerId: SPG_PROVIDER_ID,
      providerType: 'stomp-ssrm',
      public: false,
    });
    expect(spgProviderDraft.config).toEqual(buildSpgProviderConfig());
  });
});

/**
 * A byte-equal re-save restarts the provider and re-streams the whole
 * snapshot, so "seed once" has to mean once: the hook saves only when the
 * stored config genuinely differs.
 */
describe('useSpgProviderId', () => {
  it('seeds the catalog row when nothing is stored yet', async () => {
    configStore.list.mockResolvedValue([]);
    configStore.save.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSpgProviderId());

    await waitFor(() => expect(result.current).toBe(SPG_PROVIDER_ID));
    expect(configStore.list).toHaveBeenCalledWith('dev1', { subtype: 'stomp-ssrm' });
    expect(configStore.save).toHaveBeenCalledWith(spgProviderDraft, 'dev1');
  });

  it('does not re-save a row that already matches', async () => {
    configStore.list.mockResolvedValue([
      { providerId: SPG_PROVIDER_ID, config: buildSpgProviderConfig() },
    ]);

    const { result } = renderHook(() => useSpgProviderId());

    await waitFor(() => expect(result.current).toBe(SPG_PROVIDER_ID));
    expect(configStore.save).not.toHaveBeenCalled();
  });

  it('re-saves when the stored config has drifted', async () => {
    configStore.list.mockResolvedValue([
      { providerId: SPG_PROVIDER_ID, config: { ...buildSpgProviderConfig(), blockSize: 50 } },
    ]);
    configStore.save.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSpgProviderId());

    await waitFor(() => expect(result.current).toBe(SPG_PROVIDER_ID));
    expect(configStore.save).toHaveBeenCalledTimes(1);
  });

  it('ignores other providers in the catalog', async () => {
    configStore.list.mockResolvedValue([{ providerId: 'someone-else', config: {} }]);
    configStore.save.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSpgProviderId());

    await waitFor(() => expect(configStore.save).toHaveBeenCalled());
    expect(result.current).toBe(SPG_PROVIDER_ID);
  });

  it('has no provider id until the seed resolves', () => {
    configStore.list.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSpgProviderId());
    // The app renders "Connecting…" off this null; a premature id would
    // attach the grid to a provider the catalog does not have yet.
    expect(result.current).toBeNull();
  });

  it('does not set state after unmount', async () => {
    let resolve!: (rows: unknown[]) => void;
    configStore.list.mockReturnValue(new Promise((r) => { resolve = r as never; }));
    configStore.save.mockResolvedValue(undefined);

    const { unmount } = renderHook(() => useSpgProviderId());
    unmount();
    resolve([]);

    await waitFor(() => expect(configStore.save).toHaveBeenCalled());
    // Nothing to assert beyond "no act() warning / no state update on an
    // unmounted hook" — the cancelled flag is what makes that true.
  });
});
