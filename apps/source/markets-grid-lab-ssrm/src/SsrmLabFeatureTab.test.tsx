import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { LabFeatureConfig } from '../../markets-grid-lab/src/tabs/labFeatureConfigs';

const mocks = vi.hoisted(() => ({
  provider: { value: null as unknown },
  register: vi.fn(),
  installProfiles: vi.fn(),
  lastGridProps: { current: null as Record<string, unknown> | null },
  lastProviderArgs: null as unknown[] | null,
  lastProfileArgs: null as unknown[] | null,
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useSsrmDataProvider: (...args: unknown[]) => {
    mocks.lastProviderArgs = args;
    return { provider: mocks.provider.value };
  },
}));
vi.mock('./demo/SsrmDemoContext', () => ({
  useSsrmDemoRegistry: () => ({ handle: null, register: mocks.register }),
}));
vi.mock('../../markets-grid-lab/src/data/useLabDemoProfiles', () => ({
  useLabDemoProfiles: (...args: unknown[]) => {
    mocks.lastProfileArgs = args;
    return mocks.installProfiles;
  },
}));
// Replaces the lab setup's own grid mock so this test can see the props;
// `createMarketsGridLocalStorageStorage` is restated because the lab's
// shared `storage.ts` calls it at module load.
vi.mock('@wellsfargo-starui/grid', () => ({
  createMarketsGridLocalStorageStorage: () => () => ({}),
  MarketsGrid: (props: Record<string, unknown>) => {
    mocks.lastGridProps.current = props;
    return <div data-testid="markets-grid" data-grid-id={props.gridId as string} />;
  },
}));

import { SsrmLabFeatureTab } from './SsrmLabFeatureTab';

function config(over: Partial<LabFeatureConfig> = {}): LabFeatureConfig {
  return {
    tabId: 'overview',
    gridId: 'lab-overview',
    componentName: 'Overview',
    title: 'Overview',
    subtitle: 'The book',
    help: 'help text',
    getColumnDefs: () => [{ field: 'id' }, { field: 'price' }],
    profiles: [],
    activeProfileId: '',
    ...over,
  } as LabFeatureConfig;
}

const restartingProvider = () => ({ id: 'p', restart: vi.fn(async () => {}) });

beforeEach(() => {
  mocks.provider.value = restartingProvider();
  mocks.lastGridProps.current = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SsrmLabFeatureTab', () => {
  it('waits for the provider rather than mounting an empty grid', () => {
    mocks.provider.value = null;
    render(<SsrmLabFeatureTab config={config()} providerId="p1" />);

    expect(screen.queryByTestId('markets-grid')).toBeNull();
    expect(screen.getByText('Starting SSRM provider…')).toBeInTheDocument();
  });

  it('mounts the grid against the shared provider under the SSRM grid id', () => {
    render(<SsrmLabFeatureTab config={config()} providerId="p1" />);

    expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-grid-id', 'lab-overview-ssrm');
    expect(mocks.lastGridProps.current).toMatchObject({
      componentName: 'Overview (SSRM)',
      rowIdField: 'id',
      ssrm: expect.objectContaining({ keyColumn: 'id', cacheBlockSize: 200 }),
    });
  });

  /**
   * The storage adapter is scoped to `<gridId>-ssrm`. A demo-profile seed
   * built for the lab's CSRM grid id fails the adapter's own gridId check
   * silently — caught live as "demo profile install failed".
   */
  it('seeds demo profiles against the SSRM grid id, not the lab\'s', () => {
    const profiles = [{ id: 'p1' }] as never;
    render(<SsrmLabFeatureTab config={config({ profiles, activeProfileId: 'p1' })} providerId="p1" />);

    expect(mocks.lastProfileArgs).toEqual(['lab-overview-ssrm', profiles, 'p1']);
  });

  it('installs the demo profiles once the grid is ready', () => {
    render(<SsrmLabFeatureTab config={config()} providerId="p1" />);
    const handle = { gridApi: { id: 'api' } };

    (mocks.lastGridProps.current!.onReady as (h: unknown) => void)(handle);

    expect(mocks.installProfiles).toHaveBeenCalledWith(handle);
  });

  it('starts the shared provider automatically', () => {
    render(<SsrmLabFeatureTab config={config()} providerId="p1" />);
    expect(mocks.lastProviderArgs).toEqual(['p1', { autoStart: true }]);
  });

  describe('stream options', () => {
    it('does not restart a provider already running at the tab\'s settings', () => {
      render(<SsrmLabFeatureTab config={config()} providerId="p1" />);
      // Every default tab shares one warm engine cache; restarting here
      // would re-seed the snapshot on each tab switch.
      expect((mocks.provider.value as { restart: ReturnType<typeof vi.fn> }).restart)
        .not.toHaveBeenCalled();
    });

    it('restarts with an overlay for a tab that runs hotter', async () => {
      const stream = { rowCount: 5000, updateIntervalMs: 100 };
      render(<SsrmLabFeatureTab config={config({ stream } as never)} providerId="p1" />);

      await waitFor(() =>
        expect((mocks.provider.value as { restart: ReturnType<typeof vi.fn> }).restart)
          .toHaveBeenCalledWith({ rowCount: 5000, updateIntervalMs: 100, enableUpdates: true }));
    });

    it('does not touch a provider that has not arrived', () => {
      mocks.provider.value = null;
      expect(() =>
        render(<SsrmLabFeatureTab config={config({ stream: { rowCount: 5000 } } as never)} providerId="p1" />))
        .not.toThrow();
    });
  });

  describe('demo-rail registration', () => {
    it('publishes this tab\'s handle, and withdraws it on unmount', () => {
      const { unmount } = render(<SsrmLabFeatureTab config={config()} providerId="p1" />);

      expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ tabId: 'overview' }));
      const published = mocks.register.mock.calls[0][0] as { getGridApi: () => unknown };
      expect(published.getGridApi()).toBeNull();

      (mocks.lastGridProps.current!.onReady as (h: unknown) => void)({ gridApi: { id: 'api' } });
      expect(published.getGridApi()).toEqual({ id: 'api' });

      unmount();
      expect(mocks.register).toHaveBeenLastCalledWith(null);
    });

    it('registers nothing while the provider is missing', () => {
      mocks.provider.value = null;
      render(<SsrmLabFeatureTab config={config()} providerId="p1" />);
      expect(mocks.register).not.toHaveBeenCalled();
    });
  });

  describe('grid options', () => {
    it('turns the profile, save and settings affordances on by default', () => {
      render(<SsrmLabFeatureTab config={config()} providerId="p1" />);
      expect(mocks.lastGridProps.current).toMatchObject({
        showProfileSelector: true,
        showSaveButton: true,
        showSettingsButton: true,
      });
    });

    it('lets a tab config turn them off and pass its own toolbars through', () => {
      const grid = {
        showProfileSelector: false, showSaveButton: false, showSettingsButton: false,
        showFiltersToolbar: true, showEditingToolbar: true, rowHeight: 30, sideBar: true,
      };
      render(<SsrmLabFeatureTab config={config({ grid } as never)} providerId="p1" />);
      expect(mocks.lastGridProps.current).toMatchObject(grid);
    });

    it('prefers the tab\'s own defaultColDef over the lab default', () => {
      const defaultColDef = { sortable: false, resizable: false };
      render(<SsrmLabFeatureTab config={config({ defaultColDef } as never)} providerId="p1" />);
      expect(mocks.lastGridProps.current!.defaultColDef).toBe(defaultColDef);
    });

    it('falls back to the lab default col def', () => {
      render(<SsrmLabFeatureTab config={config()} providerId="p1" />);
      expect(mocks.lastGridProps.current!.defaultColDef).toBeDefined();
    });
  });

  it('shows the tab title and the parity verdict above the grid', () => {
    render(<SsrmLabFeatureTab config={config()} providerId="p1" />);
    expect(screen.getByText(/Overview · SSRM/)).toBeInTheDocument();
  });

  it('renders a tab with no parity entry and no guide', () => {
    render(<SsrmLabFeatureTab config={config({ tabId: 'not-a-real-tab' })} providerId="p1" />);
    expect(screen.getByTestId('markets-grid')).toBeInTheDocument();
  });
});
