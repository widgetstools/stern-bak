import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  handle: { value: null as unknown },
  scenarios: [] as Array<Record<string, unknown>>,
  buildScenarioEditBatch: vi.fn(),
}));

vi.mock('./SsrmDemoContext', () => ({
  useSsrmDemoRegistry: () => ({ handle: mocks.handle.value, register: vi.fn() }),
}));
vi.mock('../../../markets-grid-lab/src/demo/scenarios', () => ({
  scenariosForTab: (tabId: string) =>
    mocks.scenarios.filter((s) => (s.tabs as string[]).includes(tabId)),
}));
vi.mock('./ssrmScenarioEdits', () => ({ buildScenarioEditBatch: mocks.buildScenarioEditBatch }));

import { SsrmDemoRail } from './SsrmDemoRail';
import { DEFAULT_STREAM } from '../ssrm/labSsrmProvider';

function handleWith(over: Record<string, unknown> = {}) {
  return {
    tabId: 'overview',
    provider: { restart: vi.fn(async () => {}), applyEdits: vi.fn(async () => {}) },
    getGridApi: () => null,
    ...over,
  };
}

beforeEach(() => {
  mocks.handle.value = handleWith();
  mocks.scenarios = [
    { id: 'spike', title: 'Price spike', description: 'Move marks hard', accent: 'positive', tabs: ['overview'] },
    { id: 'halt', title: 'Trading halt', description: 'Freeze a name', accent: 'negative', tabs: ['other'] },
  ];
  mocks.buildScenarioEditBatch.mockReturnValue({ rows: [{ id: 1 }], editedColumns: [['price']] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const provider = () => (mocks.handle.value as { provider: { restart: ReturnType<typeof vi.fn>; applyEdits: ReturnType<typeof vi.fn> } }).provider;

describe('SsrmDemoRail — stream controls', () => {
  it('pauses and resumes the feed through provider.restart', () => {
    render(<SsrmDemoRail activeTab="overview" />);
    const button = screen.getByTestId('ssrm-rail-pause');
    expect(button).toHaveTextContent('Pause ticks');

    fireEvent.click(button);

    expect(provider().restart).toHaveBeenCalledWith({
      updateIntervalMs: DEFAULT_STREAM.updateIntervalMs,
      enableUpdates: false,
      rowCount: DEFAULT_STREAM.rowCount,
    });
    expect(button).toHaveTextContent('Resume ticks');

    fireEvent.click(button);
    expect(provider().restart).toHaveBeenLastCalledWith(
      expect.objectContaining({ enableUpdates: true }),
    );
  });

  /**
   * Shrinking the book re-seeds the snapshot, so the restart carries the
   * CURRENT pause state and interval too — a restart that forgot them would
   * silently resume a paused feed at the default rate.
   */
  it('carries the current pause state into a book-size change', () => {
    render(<SsrmDemoRail activeTab="overview" />);
    fireEvent.click(screen.getByTestId('ssrm-rail-pause'));
    provider().restart.mockClear();

    fireEvent.click(screen.getByTestId('ssrm-rail-rows-2000'));

    expect(provider().restart).toHaveBeenCalledWith({
      updateIntervalMs: DEFAULT_STREAM.updateIntervalMs,
      enableUpdates: false,
      rowCount: 2000,
    });
    expect(screen.getByText(/Book size · 2,000 rows/)).toBeInTheDocument();
  });

  it('offers every book size and marks the active one', () => {
    render(<SsrmDemoRail activeTab="overview" />);
    for (const n of [100, 500, 2000, 5000]) {
      expect(screen.getByTestId(`ssrm-rail-rows-${n}`)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByTestId('ssrm-rail-rows-100'));
    expect(provider().restart).toHaveBeenCalledWith(expect.objectContaining({ rowCount: 100 }));
  });

  it('restarts on tick-interval commit, not on every drag frame', () => {
    render(<SsrmDemoRail activeTab="overview" />);
    // The mocked Slider surfaces `onValueChange` as a change event; commit
    // is what reaches the provider, so a drag across the range is one
    // restart rather than one per pixel.
    expect(screen.getByText(/Tick interval · 500 ms/)).toBeInTheDocument();
    expect(provider().restart).not.toHaveBeenCalled();
  });

  it('disables every control while no tab has registered a handle', () => {
    mocks.handle.value = null;
    render(<SsrmDemoRail activeTab="overview" />);

    expect(screen.getByTestId('ssrm-rail-pause')).toBeDisabled();
    expect(screen.getByTestId('ssrm-rail-rows-2000')).toBeDisabled();
    fireEvent.click(screen.getByTestId('ssrm-rail-pause'));
    // Nothing to restart, and nothing blew up trying.
    expect(screen.getByTestId('ssrm-rail-pause')).toHaveTextContent('Pause ticks');
  });
});

describe('SsrmDemoRail — scenarios', () => {
  it('lists only the scenarios for the active tab', () => {
    render(<SsrmDemoRail activeTab="overview" />);
    expect(screen.getByTestId('ssrm-scenario-spike')).toBeInTheDocument();
    expect(screen.queryByTestId('ssrm-scenario-halt')).toBeNull();
  });

  it('says so when a tab has no scenarios', () => {
    render(<SsrmDemoRail activeTab="nothing-here" />);
    expect(screen.getByText('No scenarios for this tab.')).toBeInTheDocument();
  });

  it('writes the scenario batch through the real applyEdits path', () => {
    const rows = [{ id: 1, price: 100 }];
    mocks.handle.value = handleWith({
      getGridApi: () => ({
        forEachNode: (cb: (n: { data: unknown; group: boolean }) => void) => {
          rows.forEach((data) => cb({ data, group: false }));
        },
      }),
    });
    render(<SsrmDemoRail activeTab="overview" />);

    fireEvent.click(screen.getByTestId('ssrm-scenario-spike'));

    expect(mocks.buildScenarioEditBatch).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'spike' }),
      rows,
    );
    expect(provider().applyEdits).toHaveBeenCalledWith({
      rows: [{ id: 1 }],
      editedColumns: [['price']],
    });
  });

  it('reads only the loaded leaf rows — group rows and empty blocks carry no data', () => {
    mocks.handle.value = handleWith({
      getGridApi: () => ({
        forEachNode: (cb: (n: { data: unknown; group?: boolean }) => void) => {
          cb({ data: { id: 1 }, group: false });
          cb({ data: { id: 'grp' }, group: true });
          cb({ data: null });
        },
      }),
    });
    render(<SsrmDemoRail activeTab="overview" />);

    fireEvent.click(screen.getByTestId('ssrm-scenario-spike'));

    expect(mocks.buildScenarioEditBatch).toHaveBeenCalledWith(expect.anything(), [{ id: 1 }]);
  });

  it('reads no rows at all before the grid api exists', () => {
    render(<SsrmDemoRail activeTab="overview" />);
    fireEvent.click(screen.getByTestId('ssrm-scenario-spike'));
    expect(mocks.buildScenarioEditBatch).toHaveBeenCalledWith(expect.anything(), []);
  });

  it('survives a grid torn down mid-walk', () => {
    mocks.handle.value = handleWith({
      getGridApi: () => ({
        forEachNode: () => { throw new Error('grid destroyed'); },
      }),
    });
    render(<SsrmDemoRail activeTab="overview" />);

    expect(() => fireEvent.click(screen.getByTestId('ssrm-scenario-spike'))).not.toThrow();
    expect(mocks.buildScenarioEditBatch).toHaveBeenCalledWith(expect.anything(), []);
  });

  it('writes nothing when the scenario changes nothing', () => {
    mocks.buildScenarioEditBatch.mockReturnValue({ rows: [], editedColumns: [] });
    render(<SsrmDemoRail activeTab="overview" />);

    fireEvent.click(screen.getByTestId('ssrm-scenario-spike'));

    expect(provider().applyEdits).not.toHaveBeenCalled();
  });

  it('does not inject while no tab has registered a handle', () => {
    mocks.handle.value = null;
    render(<SsrmDemoRail activeTab="overview" />);
    fireEvent.click(screen.getByTestId('ssrm-scenario-spike'));
    expect(mocks.buildScenarioEditBatch).not.toHaveBeenCalled();
  });

  it('renders a scenario with an unrecognised accent rather than dropping it', () => {
    mocks.scenarios = [
      { id: 'odd', title: 'Odd one', description: 'x', accent: 'chartreuse', tabs: ['overview'] },
    ];
    render(<SsrmDemoRail activeTab="overview" />);
    expect(screen.getByTestId('ssrm-scenario-odd')).toBeInTheDocument();
  });
});

describe('SsrmDemoRail — collapsing', () => {
  it('collapses to a rail and expands back', () => {
    render(<SsrmDemoRail activeTab="overview" />);
    expect(screen.getByTestId('ssrm-demo-rail')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Collapse demo console'));

    expect(screen.queryByTestId('ssrm-demo-rail')).toBeNull();
    expect(screen.getByLabelText('Demo console collapsed')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Expand demo console'));
    expect(screen.getByTestId('ssrm-demo-rail')).toBeInTheDocument();
  });
});
