import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  providerId: { value: 'spg-pricing-blotter:positions' as string | null },
  provider: { value: { id: 'inner' } as unknown },
  serverHealth: vi.fn<() => Promise<{ rows: number; ackDelayMs: number } | null>>(
    async () => ({ rows: 10, ackDelayMs: 1 }),
  ),
  trading: {
    stage: vi.fn(async () => {}),
    saveStaged: vi.fn(async () => {}),
    discardStaged: vi.fn(async () => {}),
  },
  lastGridProps: { current: null as Record<string, unknown> | null },
  refreshCells: vi.fn(),
}));

vi.mock('./provider/spgProvider', () => ({ useSpgProviderId: () => mocks.providerId.value }));
vi.mock('./trading/api', () => ({ serverHealth: mocks.serverHealth }));
vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useSsrmDataProvider: () => ({ provider: mocks.provider.value }),
}));
vi.mock('./trading/serverWriteProvider', () => ({
  withServerWrites: (inner: unknown, store: { counts(): unknown }) => ({
    ...mocks.trading, inner, store,
  }),
}));
vi.mock('@wellsfargo-starui/grid', () => ({
  createMarketsGridLocalStorageStorage: () => ({ kind: 'local' }),
  MarketsGrid: (props: Record<string, unknown>) => {
    mocks.lastGridProps.current = props;
    return <div data-testid="markets-grid" />;
  },
}));
vi.mock('./components/ImportPricesDialog', () => ({
  ImportPricesDialog: ({ open }: { open: boolean }) =>
    (open ? <div data-testid="import-dialog" /> : null),
}));

import { App } from './App';
import { CellStateStore } from './trading/cellStates';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.providerId.value = 'spg-pricing-blotter:positions';
  mocks.provider.value = { id: 'inner' };
  mocks.serverHealth.mockResolvedValue({ rows: 10, ackDelayMs: 1 });
  mocks.lastGridProps.current = null;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The CellStateStore the App handed to the (mocked) write wrapper. */
function appStore(): CellStateStore {
  const grid = mocks.lastGridProps.current!;
  return (grid.ssrm as { provider: { store: CellStateStore } }).provider.store;
}

describe('App — connecting', () => {
  it('waits for the provider rather than mounting a grid with nothing behind it', async () => {
    mocks.provider.value = null;
    render(<App />);

    expect(screen.queryByTestId('markets-grid')).toBeNull();
    expect(screen.getByText(/Connecting to the pricing server/)).toBeInTheDocument();
    // Without a provider there is nothing to import into or save, either.
    expect(screen.getByTestId('spg-open-import')).toBeDisabled();
    expect(screen.getByTestId('spg-save-staged')).toBeDisabled();
    await waitFor(() => expect(mocks.serverHealth).toHaveBeenCalled());
  });

  it('mounts the grid against the SSRM provider once it arrives', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('markets-grid')).toBeInTheDocument());

    expect(mocks.lastGridProps.current).toMatchObject({
      gridId: 'spg-pricing-blotter',
      rowIdField: 'cusip',
      ssrm: expect.objectContaining({ keyColumn: 'cusip', cacheBlockSize: 200 }),
    });
  });
});

/**
 * The health chip is the answer to "why is my blotter empty" — a stopped
 * server has to say so, and say what to run, rather than leave the page
 * looking like it is still loading.
 */
describe('App — server health', () => {
  it('reports the server as up when it answers', async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId('spg-server-health')).toHaveTextContent('SQLite server'));
  });

  it('names the command to run when the server is down', async () => {
    mocks.serverHealth.mockResolvedValue(null);
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId('spg-server-health')).toHaveTextContent('npm run server'));
  });

  it('re-checks on an interval and stops on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = render(<App />);
    await waitFor(() => expect(mocks.serverHealth).toHaveBeenCalledTimes(1));

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.serverHealth).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    // A polling timer that outlives the view is the classic OpenFin leak.
    expect(mocks.serverHealth).toHaveBeenCalledTimes(2);
  });
});

describe('App — write-state chips', () => {
  it('shows nothing while every cell is clean', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('markets-grid')).toBeInTheDocument());
    expect(screen.getByTestId('spg-write-chips')).toBeEmptyDOMElement();
  });

  it('counts staged, pending and failed cells separately', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('markets-grid')).toBeInTheDocument());
    const s = appStore();

    act(() => {
      s.mark('C1', { price: 1, coupon: 2 }, 'staged');
      s.mark('C2', { price: 3 }, 'pending');
      s.mark('C3', { price: 4 }, 'failed');
    });

    const chips = screen.getByTestId('spg-write-chips');
    expect(chips).toHaveTextContent('2 staged');
    expect(chips).toHaveTextContent('1 awaiting server');
    expect(chips).toHaveTextContent('1 failed');
  });

  it('clears the failed markers when the chip is clicked', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('markets-grid')).toBeInTheDocument());
    const s = appStore();
    act(() => { s.mark('C1', { price: 1 }, 'failed'); });

    await userEvent.click(screen.getByRole('button', { name: /failed — click to clear/ }));

    expect(s.counts().failed).toBe(0);
  });

  /**
   * A 500-cell paste marks 500 cells in one flush. Repainting per mark would
   * be 500 full-grid refreshes; the App coalesces them onto one animation
   * frame instead.
   */
  it('repaints once per burst of cell-state changes', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('markets-grid')).toBeInTheDocument());
    const refreshCells = vi.fn();
    act(() => {
      (mocks.lastGridProps.current!.onReady as (h: unknown) => void)({ gridApi: { refreshCells } });
    });
    const s = appStore();

    act(() => {
      for (let i = 0; i < 50; i += 1) s.mark(`C${i}`, { price: i }, 'pending');
    });

    expect(frames).toHaveLength(1);
    act(() => { frames[0](0); });
    expect(refreshCells).toHaveBeenCalledTimes(1);
    expect(refreshCells).toHaveBeenCalledWith({ force: true, suppressFlash: true });
  });

  it('survives a repaint requested while the grid is still mounting', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('markets-grid')).toBeInTheDocument());
    act(() => {
      (mocks.lastGridProps.current!.onReady as (h: unknown) => void)({
        gridApi: { refreshCells: () => { throw new Error('grid not ready'); } },
      });
    });

    expect(() => act(() => { appStore().mark('C1', { price: 1 }, 'pending'); })).not.toThrow();
  });
});

describe('App — save and discard', () => {
  it('enables Save and Discard only once something is staged', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('markets-grid')).toBeInTheDocument());
    expect(screen.getByTestId('spg-save-staged')).toBeDisabled();
    expect(screen.getByTestId('spg-discard-staged')).toBeDisabled();

    act(() => { appStore().mark('C1', { price: 1 }, 'staged'); });

    expect(screen.getByTestId('spg-save-staged')).toBeEnabled();
    expect(screen.getByTestId('spg-save-staged')).toHaveTextContent('Save 1 to server');
    expect(screen.getByTestId('spg-discard-staged')).toBeEnabled();
  });

  it('commits and discards through the write wrapper', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('markets-grid')).toBeInTheDocument());
    act(() => { appStore().mark('C1', { price: 1 }, 'staged'); });

    await userEvent.click(screen.getByTestId('spg-save-staged'));
    expect(mocks.trading.saveStaged).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId('spg-discard-staged'));
    expect(mocks.trading.discardStaged).toHaveBeenCalledTimes(1);
  });
});

describe('App — CSV import', () => {
  it('opens the import dialog from the toolbar', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('markets-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('import-dialog')).toBeNull();

    await userEvent.click(screen.getByTestId('spg-open-import'));

    expect(screen.getByTestId('import-dialog')).toBeInTheDocument();
  });

  it('offers no import dialog at all before the provider connects', () => {
    mocks.provider.value = null;
    render(<App />);
    expect(screen.queryByTestId('import-dialog')).toBeNull();
  });
});
