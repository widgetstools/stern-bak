import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  provider: { value: null as unknown },
  installProfiles: vi.fn(),
  lastProfileArgs: null as unknown[] | null,
  lastGridProps: { current: null as Record<string, unknown> | null },
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useSsrmDataProvider: () => ({ provider: mocks.provider.value }),
}));
vi.mock('../../../markets-grid-lab/src/data/useLabDemoProfiles', () => ({
  useLabDemoProfiles: (...args: unknown[]) => {
    mocks.lastProfileArgs = args;
    return mocks.installProfiles;
  },
}));
// Replaces the lab setup's grid mock so this test can read the props;
// `createMarketsGridLocalStorageStorage` is restated because the lab's
// shared `storage.ts` calls it at module load.
vi.mock('@wellsfargo-starui/grid', () => ({
  createMarketsGridLocalStorageStorage: () => () => ({}),
  MarketsGrid: (props: Record<string, unknown>) => {
    mocks.lastGridProps.current = props;
    return <div data-testid="markets-grid" data-grid-id={props.gridId as string} />;
  },
}));

import { SsrmProfilesTab } from './SsrmProfilesTab';
import { PRESETS } from '../../../markets-grid-lab/src/profiles/presets';

beforeEach(() => {
  mocks.provider.value = { id: 'p' };
  mocks.lastGridProps.current = null;
  mocks.lastProfileArgs = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const openFirstPresetWith = (pick: (p: (typeof PRESETS)[number]) => boolean) => {
  const preset = PRESETS.find(pick)!;
  render(<SsrmProfilesTab providerId="p1" />);
  fireEvent.click(screen.getByTestId(`ssrm-preset-${preset.id}`));
  return preset;
};

describe('SsrmProfilesTab — gallery', () => {
  it('offers every preset the CSRM lab does', () => {
    render(<SsrmProfilesTab providerId="p1" />);
    expect(PRESETS.length).toBeGreaterThan(0);
    for (const preset of PRESETS) {
      expect(screen.getByTestId(`ssrm-preset-${preset.id}`)).toHaveTextContent(preset.name);
    }
    expect(screen.queryByTestId('markets-grid')).toBeNull();
  });

  it('opens a preset\'s grid and comes back to the gallery', () => {
    const preset = openFirstPresetWith(() => true);
    expect(screen.getByTestId('markets-grid'))
      .toHaveAttribute('data-grid-id', `${preset.id}-ssrm`);

    fireEvent.click(screen.getByRole('button', { name: /All presets/ }));

    expect(screen.queryByTestId('markets-grid')).toBeNull();
    expect(screen.getByTestId(`ssrm-preset-${preset.id}`)).toBeInTheDocument();
  });
});

describe('SsrmProfilesTab — preset grid', () => {
  it('mounts against the shared provider under the preset\'s SSRM grid id', () => {
    const preset = openFirstPresetWith(() => true);
    expect(mocks.lastGridProps.current).toMatchObject({
      componentName: `${preset.name} (SSRM)`,
      rowIdField: 'id',
      showProfileSelector: true,
      showSaveButton: true,
      showSettingsButton: true,
      ssrm: expect.objectContaining({ keyColumn: 'id', cacheBlockSize: 200 }),
    });
  });

  it('waits for the provider rather than mounting an empty grid', () => {
    mocks.provider.value = null;
    openFirstPresetWith(() => true);
    expect(screen.queryByTestId('markets-grid')).toBeNull();
    expect(screen.getByText('Starting SSRM provider…')).toBeInTheDocument();
  });

  /**
   * The storage adapter is scoped to `<presetId>-ssrm`; a seed built for the
   * CSRM preset id fails the adapter's own gridId check silently.
   */
  it('installs demo profiles for a preset that ships them', () => {
    const withProfiles = PRESETS.find(
      (p) => (p.demoProfiles?.length ?? 0) > 0 && p.activeDemoProfileId,
    );
    if (!withProfiles) return;

    render(<SsrmProfilesTab providerId="p1" />);
    fireEvent.click(screen.getByTestId(`ssrm-preset-${withProfiles.id}`));

    expect(mocks.lastProfileArgs?.[0]).toBe(`${withProfiles.id}-ssrm`);
    (mocks.lastGridProps.current!.onReady as (h: unknown) => void)({ gridApi: {} });
    expect(mocks.installProfiles).toHaveBeenCalled();
  });

  it('wires no onReady for a preset with no demo profiles', () => {
    const without = PRESETS.find(
      (p) => (p.demoProfiles?.length ?? 0) === 0 || !p.activeDemoProfileId,
    );
    if (!without) return;

    render(<SsrmProfilesTab providerId="p1" />);
    fireEvent.click(screen.getByTestId(`ssrm-preset-${without.id}`));

    // Passing a handler that installs nothing would still make the grid
    // wait on a profile round-trip it has no profiles for.
    expect(mocks.lastGridProps.current!.onReady).toBeUndefined();
  });

  it('passes the preset\'s toolbars and row height through', () => {
    const preset = openFirstPresetWith(() => true);
    expect(mocks.lastGridProps.current).toMatchObject({
      rowHeight: preset.rowHeight,
      showFiltersToolbar: preset.toolbars?.showFiltersToolbar,
      showFormattingToolbar: preset.toolbars?.showFormattingToolbar,
      showEditingToolbar: preset.toolbars?.showEditingToolbar,
    });
  });

  it('prefers the preset\'s own default col def, else the lab default', () => {
    const withDef = PRESETS.find((p) => p.defaultColDef);
    if (withDef) {
      render(<SsrmProfilesTab providerId="p1" />);
      fireEvent.click(screen.getByTestId(`ssrm-preset-${withDef.id}`));
      expect(mocks.lastGridProps.current!.defaultColDef).toBe(withDef.defaultColDef);
      cleanup();
    }
    const withoutDef = PRESETS.find((p) => !p.defaultColDef);
    if (withoutDef) {
      render(<SsrmProfilesTab providerId="p1" />);
      fireEvent.click(screen.getByTestId(`ssrm-preset-${withoutDef.id}`));
      expect(mocks.lastGridProps.current!.defaultColDef).toBeDefined();
    }
  });
});
