/**
 * MarketsGrid — stale-data banner and edit guard when the live stream
 * disconnects.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const setGridOption = vi.fn();
const stopEditing = vi.fn();

vi.mock('ag-grid-react', () => ({
  AgGridReact: React.forwardRef<unknown, any>(() => (
    <div data-testid="ag-grid-stub" />
  )),
}));

vi.mock('ag-grid-enterprise', () => ({
  AllEnterpriseModule: {},
  ModuleRegistry: { registerModules: () => {} },
}));

vi.mock('../customizer/hooks/useModuleState.js', () => ({
  useModuleState: () => [undefined, vi.fn()],
}));

vi.mock('@wellsfargo-starui/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/core')>();
  return {
    ...actual,
    MemoryAdapter: class {
      async loadGridLevelData() { return null; }
      async saveGridLevelData() {}
    },
    LocalStorageBundleAdapter: class LocalStorageBundleAdapter {},
  };
});

vi.mock('../customizer/internal.js', async () => {
  const actual: any = {};
  return {
    ...actual,
    GridProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    ProviderGridHostProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    GridEventBindingsHostProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useGridApi: () => null,
    useGridPlatform: () => ({ events: { on: () => () => {}, emit: () => {} } }),
    useModuleState: () => [undefined, vi.fn()],
    GENERAL_SETTINGS_MODULE_ID: 'general-settings',
    useProfileManager: () => ({
      profiles: [],
      activeProfileId: null,
      isDirty: false,
      saveActiveProfile: vi.fn(),
      loadProfile: vi.fn(),
      createProfile: vi.fn(),
      deleteProfile: vi.fn(),
      cloneProfile: vi.fn(),
      renameProfile: vi.fn(),
      discardActiveProfile: vi.fn(),
    }),
    captureGridStateInto: vi.fn(),
    DirtyDot: () => null,
    ChromeButton: React.forwardRef<HTMLButtonElement, any>(({ children, ...rest }, ref) => (
      <button ref={ref} {...rest}>{children}</button>
    )),
    Input: React.forwardRef<HTMLInputElement, any>((p, ref) => (
      <input ref={ref} {...p} />
    )),
    Popover: ({ children }: any) => <>{children}</>,
    PopoverTrigger: ({ children }: any) => <>{children}</>,
    PopoverContent: ({ children }: any) => <>{children}</>,
    AlertDialog: ({ children }: any) => <>{children}</>,
    AlertDialogAction: ({ children }: any) => <>{children}</>,
    AlertDialogCancel: ({ children }: any) => <>{children}</>,
    AlertDialogContent: ({ children }: any) => <>{children}</>,
    AlertDialogDescription: ({ children }: any) => <>{children}</>,
    AlertDialogFooter: ({ children }: any) => <>{children}</>,
    AlertDialogHeader: ({ children }: any) => <>{children}</>,
    AlertDialogTitle: ({ children }: any) => <>{children}</>,
    calculatedColumnsModule: {},
    columnCustomizationModule: {},
    columnGroupsModule: {},
    columnTemplatesModule: {},
    conditionalStylingModule: {},
    visualExcelModule: {},
    exportVisualExcel: vi.fn(),
    VISUAL_EXCEL_MODULE_ID: 'visual-excel',
    editingModule: {},
    dataChangeHistoryModule: {},
    alertsModule: {},
    AlertsBadge: () => null,
    useAlertsToastBridge: () => undefined,
    useAlertsOpenFinBridge: () => undefined,
    generalSettingsModule: {},
    gridStateModule: {},
    savedFiltersModule: {},
    toolbarVisibilityModule: {},
    toolbarDateSettingsModule: {},
  };
});

vi.mock('../customizer/modules/toolbar-date-settings/useToolbarDateSettingsBridge.js', () => ({
  useToolbarDateSettingsBridge: ({
    toolbarDate,
    onToolbarDateChange,
  }: {
    toolbarDate: string;
    onToolbarDateChange: (next: string) => void;
  }) => ({
    toolbarDate,
    onToolbarDateChange,
    historyEnabled: true,
  }),
}));

vi.mock('./useGridHost', () => ({
  useGridHost: () => ({
    platform: {
      api: {
        api: {
          setGridOption,
          stopEditing,
          isDestroyed: () => false,
        },
      },
    },
    columnDefs: [],
    gridOptions: {},
    onGridReady: vi.fn(),
    onGridPreDestroyed: vi.fn(),
  }),
}));

vi.mock('./FiltersToolbar', () => ({ FiltersToolbar: () => null }));
vi.mock('./FormattingToolbar', () => ({
  FormattingToolbar: React.forwardRef(() => null),
}));
vi.mock('./editingToolbar/EditingToolbar', () => ({
  EditingToolbar: () => null,
}));
vi.mock('./SettingsSheet', () => ({
  SettingsSheet: React.forwardRef(() => null),
}));
vi.mock('./ProfileSelector', () => ({ ProfileSelector: () => null }));

import { MarketsGrid } from './MarketsGrid';

const baseProps = {
  gridId: 'stale-test',
  rowData: [],
  columnDefs: [{ field: 'id' }],
} as const;

describe('MarketsGrid — stale data stream', () => {
  beforeEach(() => {
    setGridOption.mockClear();
    stopEditing.mockClear();
  });

  it('shows the stale banner when dataStale is true', () => {
    const { getByTestId, queryByTestId } = render(
      <MarketsGrid
        {...baseProps}
        dataStale
        dataStaleMessage="Grid data is stale — Provider disconnected."
      />,
    );

    expect(getByTestId('stale-data-banner')).toHaveTextContent('Provider disconnected');
    expect(queryByTestId('stale-data-banner')).toBeTruthy();
  });

  it('hides the stale banner when dataStale is false', () => {
    const { queryByTestId } = render(
      <MarketsGrid {...baseProps} dataStale={false} />,
    );
    expect(queryByTestId('stale-data-banner')).toBeNull();
  });

  it('enables read-only edit guard when dataStale toggles on', async () => {
    const { rerender } = render(
      <MarketsGrid {...baseProps} dataStale={false} />,
    );

    rerender(<MarketsGrid {...baseProps} dataStale />);

    await waitFor(() => {
      expect(setGridOption).toHaveBeenCalledWith('readOnlyEdit', true);
      expect(setGridOption).toHaveBeenCalledWith('suppressClickEdit', true);
      expect(stopEditing).toHaveBeenCalled();
    });
  });

  it('clears read-only edit guard when dataStale toggles off', async () => {
    const { rerender } = render(
      <MarketsGrid {...baseProps} dataStale />,
    );

    setGridOption.mockClear();
    rerender(<MarketsGrid {...baseProps} dataStale={false} />);

    await waitFor(() => {
      expect(setGridOption).toHaveBeenCalledWith('readOnlyEdit', false);
      expect(setGridOption).toHaveBeenCalledWith('suppressClickEdit', false);
    });
  });

  it('shows the historical banner when historicalViewMode is true', () => {
    const { getByTestId } = render(
      <MarketsGrid
        {...baseProps}
        historicalViewMode
        historicalViewMessage="Viewing historical data as of 2026-04-01. Editing is disabled."
      />,
    );
    expect(getByTestId('historical-view-banner')).toHaveTextContent('2026-04-01');
  });

  it('enables read-only edit guard when historicalViewMode toggles on', async () => {
    const { rerender } = render(
      <MarketsGrid {...baseProps} historicalViewMode={false} />,
    );

    rerender(<MarketsGrid {...baseProps} historicalViewMode />);

    await waitFor(() => {
      expect(setGridOption).toHaveBeenCalledWith('readOnlyEdit', true);
      expect(setGridOption).toHaveBeenCalledWith('suppressClickEdit', true);
    });
  });
});
