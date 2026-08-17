/**
 * Historical mode on a server-side grid (roadmap Phase 8 / T3-6).
 *
 * It used to be half-wired: switching mode in Custom Settings rebound the
 * provider, but the toolbar date picker drove nothing, no `historicalViewMode`
 * banner showed, editing was not locked out, and there was no AppData
 * round-trip — so a reload came back live with no sign anything had been asked
 * for. The exit criterion is the whole round trip: pick a date → data reloads
 * with `{ asOfDate }` → banner shows → edits refused → reload restores the
 * same date.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import React from 'react';

const captured = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
const appDataEntries = vi.hoisted(() => ({ map: new Map<string, unknown>() }));
const hub = vi.hoisted(() => ({ running: true, waits: 0 }));

function pastIso(daysAgo = 7): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const fakeProvider = vi.hoisted(() => ({
  id: 'p1',
  getConfig: () => ({ keyColumn: 'positionId' }),
  getConfigOrNull: () => ({ keyColumn: 'positionId' }),
  getColumnDefs: () => [{ field: 'positionId' }],
  getSetFilterValues: vi.fn(async () => []),
  onStatus: () => () => {},
  start: vi.fn(async () => {}),
  restart: vi.fn(async () => {}),
}));

vi.mock('@wellsfargo-starui/grid', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    MarketsGrid: (props: Record<string, unknown>) => {
      captured.props = props;
      return React.createElement('div', { 'data-testid': 'markets-grid' });
    },
  };
});

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({
    client: {
      isProviderRunning: async () => hub.running,
      waitForProviderRunning: async () => {
        hub.waits += 1;
        return hub.running;
      },
    },
  }),
  useSsrmDataProvider: (id: string | null) => ({
    provider: id ? fakeProvider : null,
    error: null,
  }),
  useAppDataStore: () => ({
    store: {
      get: (name: string, key: string) => appDataEntries.map.get(`${name}.${key}`),
      set: (name: string, key: string, value: unknown) => {
        appDataEntries.map.set(`${name}.${key}`, value);
        return Promise.resolve();
      },
      list: () => [],
      subscribe: () => () => {},
    },
  }),
  useDataProvidersList: () => ({
    configs: [
      { providerId: 'p1', name: 'Live One' },
      { providerId: 'hist-1', name: 'Historical One' },
    ],
    loading: false,
    refresh: () => {},
  }),
}));

const wiring = vi.hoisted(() => ({ params: [] as Array<Record<string, unknown>> }));

vi.mock('./useSsrmProviderDataWiring.js', () => ({
  useSsrmProviderDataWiring: (params: Record<string, unknown>) => {
    wiring.params.push(params);
    return { ready: true };
  },
}));

vi.mock('../markets-grid-container/ProviderEditorDialog.js', () => ({
  ProviderEditorDialog: () => null,
}));
vi.mock('../markets-grid-container/ConfigBrowserDialog.js', () => ({
  ConfigBrowserDialog: () => null,
}));

import { SsrmMarketsGridContainer } from './SsrmMarketsGridContainer.js';

type HostApi = {
  mode: string;
  asOfDate: string | null;
  onHistoricalChange(id: string | null): void;
  onModeChange(mode: 'live' | 'historical'): void;
  onAsOfDateChange(date: string | null): void;
};

beforeEach(() => {
  captured.props = {};
  wiring.params.length = 0;
  appDataEntries.map.clear();
  hub.running = true;
  hub.waits = 0;
  fakeProvider.start.mockClear();
  fakeProvider.restart.mockClear();
});

describe('SsrmMarketsGridContainer historical mode', () => {
  it('offers past dates only once a historical provider is configured', async () => {
    const { unmount } = render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.toolbarDate).toBeDefined());
    expect(captured.props.toolbarDate).toBe(todayIso());
    expect(captured.props.toolbarDateHistoryEnabled).toBe(false);
    unmount();

    render(<SsrmMarketsGridContainer providerId="p1" defaultHistoricalProviderId="hist-1" />);
    await waitFor(() => expect(captured.props.toolbarDateHistoryEnabled).toBe(true));
  });

  it('refuses a past date when no historical provider is configured', async () => {
    const onError = vi.fn();
    render(<SsrmMarketsGridContainer providerId="p1" onError={onError} />);
    await waitFor(() => expect(captured.props.onToolbarDateChange).toBeDefined());
    act(() => (captured.props.onToolbarDateChange as (d: string) => void)(pastIso()));
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('no historical provider') }),
    );
    expect(captured.props.historicalViewMode).toBeFalsy();
    expect(fakeProvider.restart).not.toHaveBeenCalled();
  });

  // The exit criterion, in one test: date → reload carrying `{ asOfDate }` →
  // banner → edit lockout (MarketsGrid reads `historicalViewMode` for that)
  // → the date written through to AppData for the next mount.
  it('rounds the trip: date picked → reload with asOfDate → banner → AppData', async () => {
    const iso = pastIso();
    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        defaultHistoricalProviderId="hist-1"
        historicalDateAppDataRef="positions.asOfDate"
      />,
    );
    await waitFor(() => expect(captured.props.onToolbarDateChange).toBeDefined());

    await act(async () => {
      (captured.props.onToolbarDateChange as (d: string) => void)(iso);
    });

    await waitFor(() => expect(fakeProvider.restart).toHaveBeenCalledWith(
      expect.objectContaining({ asOfDate: iso }),
    ));
    expect(captured.props.historicalViewMode).toBe(true);
    expect(captured.props.historicalViewMessage).toMatch(new RegExp(`as of ${iso}`));
    expect(captured.props.historicalViewMessage).toMatch(/Editing is disabled/);
    expect(captured.props.toolbarDate).toBe(iso);
    expect(appDataEntries.map.get('positions.asOfDate')).toBe(iso);
  });

  it('fires the reload exactly once per date commit', async () => {
    const iso = pastIso();
    const { rerender } = render(
      <SsrmMarketsGridContainer providerId="p1" defaultHistoricalProviderId="hist-1" />,
    );
    await waitFor(() => expect(captured.props.onToolbarDateChange).toBeDefined());
    await act(async () => {
      (captured.props.onToolbarDateChange as (d: string) => void)(iso);
    });
    await waitFor(() => expect(fakeProvider.restart).toHaveBeenCalledTimes(1));
    // Unrelated re-renders must not re-consume the queued intent.
    rerender(<SsrmMarketsGridContainer providerId="p1" defaultHistoricalProviderId="hist-1" />);
    await act(async () => {});
    expect(fakeProvider.restart).toHaveBeenCalledTimes(1);
  });

  it('returning to today leaves historical mode and reloads live', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" defaultHistoricalProviderId="hist-1" />);
    await waitFor(() => expect(captured.props.onToolbarDateChange).toBeDefined());
    await act(async () => {
      (captured.props.onToolbarDateChange as (d: string) => void)(pastIso());
    });
    await waitFor(() => expect(captured.props.historicalViewMode).toBe(true));

    fakeProvider.restart.mockClear();
    await act(async () => {
      (captured.props.onToolbarDateChange as (d: string) => void)(todayIso());
    });
    await waitFor(() => expect(captured.props.historicalViewMode).toBe(false));
    expect(fakeProvider.restart).toHaveBeenCalledWith(
      expect.not.objectContaining({ asOfDate: expect.anything() }),
    );
  });

  // Restore-on-mount. The persisted mode is historical and AppData holds the
  // date, so the grid comes back with the banner and the same date — without
  // queueing a reload, because the cold-start arbitration below owns that.
  it('restores the persisted date from AppData on mount', async () => {
    const iso = pastIso(3);
    appDataEntries.map.set('positions.asOfDate', iso);
    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        defaultHistoricalProviderId="hist-1"
        historicalDateAppDataRef="positions.asOfDate"
      />,
    );
    await waitFor(() => expect(captured.props.providerGridHost).toBeDefined());
    await act(async () => {
      (captured.props.providerGridHost as HostApi).onModeChange('historical');
    });
    await waitFor(() => expect(captured.props.historicalViewMode).toBe(true));
    expect(captured.props.toolbarDate).toBe(iso);
    expect(captured.props.historicalViewMessage).toMatch(new RegExp(`as of ${iso}`));
  });

  it('does not restore a stored date that is not in the past', async () => {
    appDataEntries.map.set('positions.asOfDate', todayIso());
    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        defaultHistoricalProviderId="hist-1"
        historicalDateAppDataRef="positions.asOfDate"
      />,
    );
    await waitFor(() => expect(captured.props.providerGridHost).toBeDefined());
    await act(async () => {
      (captured.props.providerGridHost as HostApi).onModeChange('historical');
    });
    await act(async () => {});
    expect(captured.props.historicalViewMode).toBeFalsy();
  });

  it('the Custom Settings as-of picker persists through the same path', async () => {
    const iso = pastIso(5);
    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        defaultHistoricalProviderId="hist-1"
        historicalDateAppDataRef="positions.asOfDate"
      />,
    );
    await waitFor(() => expect(captured.props.providerGridHost).toBeDefined());
    await act(async () => {
      (captured.props.providerGridHost as HostApi).onAsOfDateChange(iso);
    });
    await waitFor(() => expect(appDataEntries.map.get('positions.asOfDate')).toBe(iso));
    expect(captured.props.toolbarDate).toBe(iso);
  });
});

describe('SsrmMarketsGridContainer cold-start arbitration', () => {
  const startProvider = () =>
    wiring.params[wiring.params.length - 1].startProvider as
      (p: typeof fakeProvider) => Promise<void>;

  it('plain-starts when this window wants no as-of date', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(wiring.params.length).toBeGreaterThan(0));
    await startProvider()(fakeProvider);
    expect(fakeProvider.start).toHaveBeenCalled();
    expect(fakeProvider.restart).not.toHaveBeenCalled();
    expect(hub.waits).toBe(0);
  });

  it('attaches to a running slot rather than restarting a peer out from under it', async () => {
    hub.running = true;
    render(<SsrmMarketsGridContainer providerId="p1" defaultHistoricalProviderId="hist-1" />);
    await waitFor(() => expect(captured.props.providerGridHost).toBeDefined());
    await act(async () => {
      (captured.props.providerGridHost as HostApi).onAsOfDateChange(pastIso());
      (captured.props.providerGridHost as HostApi).onModeChange('historical');
    });
    fakeProvider.start.mockClear();
    fakeProvider.restart.mockClear();
    await startProvider()(fakeProvider);
    expect(fakeProvider.start).toHaveBeenCalled();
    expect(fakeProvider.restart).not.toHaveBeenCalled();
  });

  // Without this, a reloaded historical window attached to whatever the plane
  // held — live rows under a historical banner.
  it('restarts a cold slot with the as-of overlay', async () => {
    hub.running = false;
    render(<SsrmMarketsGridContainer providerId="p1" defaultHistoricalProviderId="hist-1" />);
    await waitFor(() => expect(captured.props.providerGridHost).toBeDefined());
    const iso = pastIso();
    await act(async () => {
      (captured.props.providerGridHost as HostApi).onAsOfDateChange(iso);
      (captured.props.providerGridHost as HostApi).onModeChange('historical');
    });
    fakeProvider.start.mockClear();
    fakeProvider.restart.mockClear();
    await startProvider()(fakeProvider);
    expect(fakeProvider.restart).toHaveBeenCalledWith({ asOfDate: iso });
    expect(fakeProvider.start).not.toHaveBeenCalled();
    expect(hub.waits).toBe(1);
  });
});
