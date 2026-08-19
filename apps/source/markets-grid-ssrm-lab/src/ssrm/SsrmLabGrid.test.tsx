/**
 * `tabs.test.tsx` reaches this component through the tabs, but the shared
 * setup mock always answers `provider: null`, so only the placeholder branch
 * ever ran. Everything this file decides once a provider IS live — which
 * column defs to use, what key column to ask for, whether a block size is
 * usable — went unexercised.
 *
 * These mocks override the setup-file ones for this file only: the seam is
 * the three hooks the component consumes, and the assertions are on what the
 * grid renders, per RTL.
 */
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { SsrmLabGrid } from './SsrmLabGrid.js';

const useSsrmLabProvider = vi.fn();
const useSsrmDataProvider = vi.fn();
const useSsrmProviderDataWiring = vi.fn();
const resolveSsrmKeyColumn = vi.fn();

vi.mock('./SsrmLabProviderContext.js', () => ({
  useSsrmLabProvider: () => useSsrmLabProvider(),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useSsrmDataProvider: (...args: unknown[]) => useSsrmDataProvider(...args),
}));

vi.mock('@wellsfargo-starui/grid/widgets/ssrm-markets-grid-container', () => ({
  useSsrmProviderDataWiring: (...args: unknown[]) => useSsrmProviderDataWiring(...args),
}));

vi.mock('@wellsfargo-starui/data', () => ({
  resolveSsrmKeyColumn: (...args: unknown[]) => resolveSsrmKeyColumn(...args),
}));

vi.mock('../data/storage.js', () => ({ labStorage: { tag: 'lab-storage' } }));

/**
 * Render the props this component's decisions actually live in, so the tests
 * can read them off the DOM rather than off a spy's call record.
 */
vi.mock('@wellsfargo-starui/grid/core', () => ({
  MarketsGrid: (props: Record<string, any>) =>
    React.createElement(
      'div',
      {
        'data-testid': 'markets-grid',
        'data-grid-id': props.gridId,
        'data-key-column': props.ssrm?.keyColumn,
        'data-cache-block-size': String(props.ssrm?.cacheBlockSize),
        'data-has-provider': String(Boolean(props.ssrm?.provider)),
        'data-storage': (props.storage as { tag?: string })?.tag,
        'data-row-count': String(props.rowData?.length),
        'data-chrome': [
          props.showProfileSelector,
          props.showSaveButton,
          props.showSettingsButton,
        ].join(','),
      },
      props.columnDefs.map((c: Record<string, unknown>) =>
        React.createElement(
          'span',
          {
            key: String(c.field),
            'data-testid': `col-${c.field}`,
            'data-header': String(c.headerName),
            'data-width': String(c.width),
            'data-hide': String(c.hide),
            'data-sortable': String(c.sortable),
          },
          String(c.field),
        ),
      ),
    ),
}));

const PLACEHOLDER = /Starting SSRM provider/;

/** A provider whose config answers are set per test. */
function makeProvider(cfg: Record<string, unknown> | null, columnDefs: unknown[] = []) {
  return {
    getConfigOrNull: vi.fn(() => cfg),
    getColumnDefs: vi.fn(() => columnDefs),
  };
}

/** Point the three hooks at one scenario. */
function scenario(opts: {
  seeding?: boolean;
  ready?: boolean;
  provider?: unknown;
}) {
  useSsrmLabProvider.mockReturnValue({
    providerId: 'mock-ssrm-lab',
    inlineCfg: { providerType: 'mock-ssrm' },
    seeding: opts.seeding ?? false,
  });
  useSsrmDataProvider.mockReturnValue({ provider: opts.provider ?? null });
  useSsrmProviderDataWiring.mockReturnValue({ ready: opts.ready ?? false });
}

function renderGrid(props: Partial<React.ComponentProps<typeof SsrmLabGrid>> = {}) {
  return render(
    <SsrmLabGrid gridId="lab-grid" componentName="LabGrid" {...props} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveSsrmKeyColumn.mockImplementation((k: unknown) =>
    typeof k === 'string' && k.trim() ? k : 'id',
  );
});

// Clean up through THIS file's RTL import. The shared setup calls `cleanup()`
// too, but the tarball track installs a second copy of @testing-library/react
// per app, so the setup file's copy holds a different container registry and
// leaves these renders mounted — every query then finds two of everything.
afterEach(cleanup);

describe('SsrmLabGrid — before the plane is usable', () => {
  it('shows the placeholder while the catalog row is still seeding', () => {
    scenario({ seeding: true, ready: true, provider: makeProvider(null, [{ field: 'a' }]) });
    renderGrid();

    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
    expect(screen.queryByTestId('markets-grid')).not.toBeInTheDocument();
  });

  it('shows the placeholder while the data wiring is not ready', () => {
    scenario({ ready: false, provider: makeProvider({ keyColumn: 'positionId' }) });
    renderGrid();

    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
  });

  it('shows the placeholder when there is no provider at all', () => {
    scenario({ ready: true, provider: null });
    renderGrid();

    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
  });

  it('shows the placeholder when the provider is ready but has no columns to show', () => {
    scenario({ ready: true, provider: makeProvider({ keyColumn: 'id' }, []) });
    renderGrid();

    // A grid with zero columns renders as an empty box; the placeholder is the
    // honest thing to show instead.
    expect(screen.getByText(PLACEHOLDER)).toBeInTheDocument();
  });
});

describe('SsrmLabGrid — column defs', () => {
  it('derives lab column defs from the provider when the caller supplies none', () => {
    const provider = makeProvider({ keyColumn: 'id' }, [
      { field: 'symbol', headerName: 'Symbol', width: 120, hide: false },
      { field: 'qty', width: 80, hide: true },
    ]);
    scenario({ ready: true, provider });
    renderGrid();

    expect(screen.getByTestId('col-symbol')).toHaveAttribute('data-header', 'Symbol');
    expect(screen.getByTestId('col-symbol')).toHaveAttribute('data-width', '120');
    // No headerName on the wire → the field name stands in for it.
    expect(screen.getByTestId('col-qty')).toHaveAttribute('data-header', 'qty');
    expect(screen.getByTestId('col-qty')).toHaveAttribute('data-hide', 'true');
    // Every derived column is made interactive — that is the point of the lab.
    expect(screen.getByTestId('col-qty')).toHaveAttribute('data-sortable', 'true');
  });

  it('prefers caller-supplied column defs and never asks the provider', () => {
    const provider = makeProvider({ keyColumn: 'id' }, [{ field: 'fromProvider' }]);
    scenario({ ready: true, provider });
    renderGrid({ columnDefs: [{ field: 'fromCaller', headerName: 'Caller' }] });

    expect(screen.getByTestId('col-fromCaller')).toBeInTheDocument();
    expect(screen.queryByTestId('col-fromProvider')).not.toBeInTheDocument();
    expect(provider.getColumnDefs).not.toHaveBeenCalled();
  });

  it('falls back to the provider when the caller passes an empty list', () => {
    const provider = makeProvider({ keyColumn: 'id' }, [{ field: 'fromProvider' }]);
    scenario({ ready: true, provider });
    renderGrid({ columnDefs: [] });

    expect(screen.getByTestId('col-fromProvider')).toBeInTheDocument();
  });
});

describe('SsrmLabGrid — key column and block size', () => {
  const columns = [{ field: 'symbol' }];

  it("hands the provider's configured key column to the resolver", () => {
    scenario({ ready: true, provider: makeProvider({ keyColumn: 'positionId' }, columns) });
    renderGrid();

    expect(resolveSsrmKeyColumn).toHaveBeenCalledWith('positionId');
    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-key-column', 'positionId');
  });

  it('asks the resolver for a default when the config has no key column', () => {
    scenario({ ready: true, provider: makeProvider(null, columns) });
    renderGrid();

    expect(resolveSsrmKeyColumn).toHaveBeenCalledWith(undefined);
    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-key-column', 'id');
  });

  it('survives a provider that does not implement getConfigOrNull', () => {
    scenario({
      ready: true,
      provider: { getColumnDefs: vi.fn(() => columns) },
    });
    renderGrid();

    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-key-column', 'id');
    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-cache-block-size', 'undefined');
  });

  it('passes a workable block size through', () => {
    scenario({ ready: true, provider: makeProvider({ blockSize: 500 }, columns) });
    renderGrid();

    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-cache-block-size', '500');
  });

  it('drops a block size too small to be worth a round trip', () => {
    scenario({ ready: true, provider: makeProvider({ blockSize: 19 }, columns) });
    renderGrid();

    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-cache-block-size', 'undefined');
  });

  it('drops a block size that is not a number', () => {
    scenario({ ready: true, provider: makeProvider({ blockSize: '500' }, columns) });
    renderGrid();

    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-cache-block-size', 'undefined');
  });
});

describe('SsrmLabGrid — what it hands the grid', () => {
  const columns = [{ field: 'symbol' }];

  it('wires the provider, lab storage and an empty client row set', () => {
    scenario({ ready: true, provider: makeProvider({ keyColumn: 'id' }, columns) });
    renderGrid();

    const grid = screen.getByTestId('markets-grid');
    expect(grid).toHaveAttribute('data-has-provider', 'true');
    expect(grid).toHaveAttribute('data-storage', 'lab-storage');
    // SSRM owns the rows; a non-empty rowData here would fight the row model.
    expect(grid).toHaveAttribute('data-row-count', '0');
    expect(grid).toHaveAttribute('data-grid-id', 'lab-grid');
  });

  it('turns the lab chrome on by default and lets a caller turn it off', () => {
    scenario({ ready: true, provider: makeProvider({ keyColumn: 'id' }, columns) });
    const { rerender } = renderGrid();
    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-chrome', 'true,true,true');

    rerender(
      <SsrmLabGrid
        gridId="lab-grid"
        componentName="LabGrid"
        showProfileSelector={false}
        showSaveButton={false}
        showSettingsButton={false}
      />,
    );
    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-chrome', 'false,false,false');
  });

  it('starts the provider lazily and does not track its status', () => {
    scenario({ ready: true, provider: makeProvider({ keyColumn: 'id' }, columns) });
    renderGrid();

    expect(useSsrmDataProvider).toHaveBeenCalledWith('mock-ssrm-lab', {
      inlineCfg: { providerType: 'mock-ssrm' },
      trackStatus: false,
      autoStart: false,
    });
  });
});
