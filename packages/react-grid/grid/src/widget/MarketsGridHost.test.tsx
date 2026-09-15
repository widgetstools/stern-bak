/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketsGridHost } from './MarketsGridHost';

const controller = vi.hoisted(() => ({
  profiles: { profiles: [{ id: 'a', name: 'Default', updatedAt: 1 }], activeProfileId: 'a' },
  api: { applyColumnState: vi.fn() },
  sheetRef: { current: null },
  toolbarRef: { current: null },
  isDirty: false,
  saveFlash: false,
  settingsOpen: false,
  setSettingsOpen: vi.fn(),
  settingsFocusRequest: null,
  styleToolbarOpen: false,
  pendingSwitch: null,
  setPendingSwitch: vi.fn(),
  handleOpenSettings: vi.fn(),
  openColumnSettings: vi.fn(),
  columnSelectorOpen: false,
  setColumnSelectorOpen: vi.fn(),
  handleOpenColumnSelector: vi.fn(),
  handleToggleStyleToolbar: vi.fn(),
  editingToolbarOpen: false,
  handleToggleEditingToolbar: vi.fn(),
  handleExportVisualExcel: vi.fn(),
  visualExcelExportEnabled: true,
  handleSaveAll: vi.fn(),
  requestLoadProfile: vi.fn(),
  confirmSwitchSave: vi.fn(),
  confirmSwitchDiscard: vi.fn(),
}));

vi.mock('./useMarketsGridController', () => ({
  useMarketsGridController: () => controller,
}));

vi.mock('./useProfileSelectorActions', () => ({
  useProfileSelectorActions: () => ({
    onCreate: vi.fn(),
    onLoad: vi.fn(),
    onDelete: vi.fn(),
    onClone: vi.fn(),
    onRename: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
  }),
}));

vi.mock('./GeneralSettingsContext', () => ({
  useGeneralSettingsFromContext: () => ({ headerCaseUppercase: true }),
}));

vi.mock('../customizer/modules/toolbar-date-settings/useToolbarDateSettingsBridge.js', () => ({
  useToolbarDateSettingsBridge: ({ toolbarDate, onToolbarDateChange }: any) => ({
    toolbarDate,
    onToolbarDateChange,
    toolbarDateHistoryEnabled: true,
  }),
}));

vi.mock('./PrimaryToolbar', () => ({
  PrimaryToolbar: (props: any) => (
    <div data-testid="primary-toolbar">
      <button type="button" data-testid="open-settings" onClick={props.onOpenSettings}>Settings</button>
    </div>
  ),
}));

vi.mock('./editingToolbar/EditingToolbar', () => ({
  EditingToolbar: () => <div data-testid="editing-toolbar" />,
}));

vi.mock('./editingToolbar/useEffectiveEditingToolbarAllow', () => ({
  useEffectiveEditingToolbarAllow: () => ({ rowVisible: true, cellVisible: true }),
}));

vi.mock('./FormattingToolbar', () => ({
  FormattingToolbar: React.forwardRef(() => <div data-testid="formatting-toolbar" />),
}));

const ssrmContexts: {
  rowCounter: ((m: Record<string, unknown>) => Promise<number>) | null;
  tickSubscribe: ((h: () => void) => () => void) | null;
} = { rowCounter: null, tickSubscribe: null };

vi.mock('./MarketsGridSsrmSurface', async () => {
  const { useSsrmRowCounter, useSsrmTickSubscribe } = await import('./useSsrmFilterCounts');
  return {
    MarketsGridSsrmSurface: () => {
      ssrmContexts.rowCounter = useSsrmRowCounter();
      ssrmContexts.tickSubscribe = useSsrmTickSubscribe();
      return <div data-testid="markets-grid-ssrm-surface" />;
    },
  };
});

vi.mock('./MarketsGridSurface', () => ({
  MarketsGridSurface: (props: { getContextMenuItems?: (p: unknown) => unknown[] }) => {
    (globalThis as { __ctxMenu?: typeof props.getContextMenuItems }).__ctxMenu = props.getContextMenuItems;
    return <div data-testid="markets-grid-surface" />;
  },
}));

const preloadSettingsSheet = vi.fn();

vi.mock('./LazySettingsSheet', () => ({
  LazySettingsSheet: React.forwardRef((_props: any, ref) => {
    React.useImperativeHandle(ref, () => ({}));
    return <div data-testid="settings-sheet" data-open={String(_props.open)} />;
  }),
  preloadSettingsSheet: (...args: unknown[]) => preloadSettingsSheet(...args),
}));

vi.mock('./UnsavedSwitchDialog', () => ({
  UnsavedSwitchDialog: (props: any) =>
    props.open ? (
      <div data-testid="unsaved-switch-dialog">
        <button type="button" data-testid="switch-cancel" onClick={props.onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock('./column-selector', () => ({
  ColumnSelectorDialog: (props: any) =>
    props.open ? <div data-testid="column-selector-dialog" /> : null,
}));

vi.mock('./StaleDataBanner', () => ({
  StaleDataBanner: ({ message }: { message: string }) => (
    <div data-testid="stale-banner">{message}</div>
  ),
}));

vi.mock('./HistoricalViewBanner', () => ({
  HistoricalViewBanner: ({ message }: { message: string }) => (
    <div data-testid="historical-banner">{message}</div>
  ),
}));

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    rowData: [],
    columnDefs: [],
    gridOptions: {},
    hostOverrideKeys: new Set<string>(),
    handleGridReady: vi.fn(),
    onGridPreDestroyed: vi.fn(),
    theme: undefined,
    gridId: 'host-grid',
    sideBar: undefined,
    statusBar: undefined,
    defaultColDef: undefined,
    showToolbar: true,
    showFiltersToolbar: true,
    showFormattingToolbar: true,
    editingToolbarHostProps: {},
    showSaveButton: true,
    showSettingsButton: true,
    showColumnSelector: true,
    showVisualExcelExport: true,
    showProfileSelector: true,
    modules: [],
    className: 'host-root',
    rootStyle: {},
    gridRef: { current: null },
    storageAdapter: undefined,
    autoSaveDebounceMs: undefined,
    forwardedRef: { current: null },
    onReady: undefined,
    adminActions: undefined,
    gridLevelData: null,
    onGridLevelDataLoad: undefined,
    headerExtras: undefined,
    componentName: undefined,
    instanceId: undefined,
    appId: undefined,
    userId: undefined,
    caption: undefined,
    tabsHidden: undefined,
    onCaptionChange: undefined,
    onSavingChange: undefined,
    dataStale: false,
    dataStaleMessage: undefined,
    historicalViewMode: false,
    historicalViewMessage: undefined,
    showToolbarDatePicker: false,
    toolbarDate: '2024-01-01',
    onToolbarDateChange: vi.fn(),
    toolbarDateHistoryEnabled: true,
    toolbarActionsLayout: 'inline' as const,
    includeAllStreamSafeFilters: false,
    ...overrides,
  };
}

describe('MarketsGridHost', () => {
  beforeEach(() => {
    controller.settingsOpen = false;
    controller.styleToolbarOpen = false;
    controller.editingToolbarOpen = false;
    controller.pendingSwitch = null;
    controller.columnSelectorOpen = false;
    controller.setSettingsOpen.mockClear();
    controller.handleOpenSettings.mockClear();
    controller.openColumnSettings.mockClear();
  });

  it('renders stale and historical banners with default messages', () => {
    render(
      <MarketsGridHost
        {...baseProps({
          dataStale: true,
          historicalViewMode: true,
        })}
      />,
    );
    expect(screen.getByTestId('stale-banner')).toHaveTextContent('provider disconnected');
    expect(screen.getByTestId('historical-banner')).toHaveTextContent('editing is disabled');
  });

  it('renders custom banner messages when provided', () => {
    render(
      <MarketsGridHost
        {...baseProps({
          dataStale: true,
          dataStaleMessage: 'Custom stale',
          historicalViewMode: true,
          historicalViewMessage: 'Custom historical',
        })}
      />,
    );
    expect(screen.getByTestId('stale-banner')).toHaveTextContent('Custom stale');
    expect(screen.getByTestId('historical-banner')).toHaveTextContent('Custom historical');
  });

  it('renders header extras row when supplied', () => {
    render(
      <MarketsGridHost
        {...baseProps({
          headerExtras: <span data-testid="header-extra">Extra</span>,
        })}
      />,
    );
    expect(screen.getByTestId('header-extra')).toBeInTheDocument();
  });

  it('hides primary toolbar when showToolbar is false', () => {
    render(<MarketsGridHost {...baseProps({ showToolbar: false })} />);
    expect(screen.queryByTestId('primary-toolbar')).toBeNull();
  });

  it('shows pinned formatting toolbar when open', () => {
    controller.styleToolbarOpen = true;
    render(<MarketsGridHost {...baseProps()} />);
    expect(screen.getByTestId('formatting-toolbar-pinned')).toBeInTheDocument();
  });

  it('shows editing toolbar when toggled open', () => {
    controller.editingToolbarOpen = true;
    render(<MarketsGridHost {...baseProps()} />);
    expect(screen.getByTestId('editing-toolbar')).toBeInTheDocument();
  });

  it('mounts settings sheet after first open and keeps it mounted', () => {
    controller.settingsOpen = false;
    const { rerender } = render(<MarketsGridHost {...baseProps()} />);
    expect(screen.queryByTestId('settings-sheet')).toBeNull();

    fireEvent.click(screen.getByTestId('open-settings'));
    controller.settingsOpen = true;
    rerender(<MarketsGridHost {...baseProps()} />);
    expect(screen.getByTestId('settings-sheet')).toBeInTheDocument();

    controller.settingsOpen = false;
    rerender(<MarketsGridHost {...baseProps()} />);
    expect(screen.getByTestId('settings-sheet')).toBeInTheDocument();
  });

  it('shows unsaved switch dialog when pendingSwitch is set', () => {
    controller.pendingSwitch = { id: 'b' };
    render(<MarketsGridHost {...baseProps()} />);
    expect(screen.getByTestId('unsaved-switch-dialog')).toBeInTheDocument();
  });

  it('shows column selector dialog when open', () => {
    controller.columnSelectorOpen = true;
    render(<MarketsGridHost {...baseProps()} />);
    expect(screen.getByTestId('column-selector-dialog')).toBeInTheDocument();
  });

  it('preloads settings sheet via requestIdleCallback when available', () => {
    preloadSettingsSheet.mockClear();
    const ric = vi.fn((cb: () => void) => {
      cb();
      return 1;
    });
    const cic = vi.fn();
    vi.stubGlobal('requestIdleCallback', ric);
    vi.stubGlobal('cancelIdleCallback', cic);

    const { unmount } = render(<MarketsGridHost {...baseProps()} />);
    expect(preloadSettingsSheet).toHaveBeenCalled();
    unmount();
    expect(cic).toHaveBeenCalledWith(1);

    vi.unstubAllGlobals();
  });

  it('falls back to setTimeout preload when requestIdleCallback is missing', () => {
    vi.useFakeTimers();
    preloadSettingsSheet.mockClear();
    vi.stubGlobal('requestIdleCallback', undefined);

    render(<MarketsGridHost {...baseProps()} />);
    expect(preloadSettingsSheet).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(preloadSettingsSheet).toHaveBeenCalled();

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sets header-case and stale data attributes on root', () => {
    const { container } = render(
      <MarketsGridHost {...baseProps({ dataStale: true, historicalViewMode: true })} />,
    );
    const root = container.querySelector('[data-grid-id="host-grid"]');
    expect(root?.getAttribute('data-header-case')).toBe('upper');
    expect(root?.getAttribute('data-stale')).toBe('true');
    expect(root?.getAttribute('data-historical-view')).toBe('true');
  });

  it('skips settings preload when settings button hidden', () => {
    preloadSettingsSheet.mockClear();
    render(<MarketsGridHost {...baseProps({ showSettingsButton: false })} />);
    expect(preloadSettingsSheet).not.toHaveBeenCalled();
  });

  it('wires context menu to open column settings', () => {
    render(<MarketsGridHost {...baseProps()} />);
    const getItems = (globalThis as { __ctxMenu?: (p: unknown) => unknown[] }).__ctxMenu;
    expect(getItems).toBeTruthy();
    const items = getItems?.({
      column: { getColId: () => 'price' },
      defaultItems: ['copy'],
    });
    expect(items?.length).toBeGreaterThan(0);
    controller.openColumnSettings.mockClear();
    const settingsItem = (items as Array<{ name?: string; action?: () => void }>)
      .find((i) => i.name === 'Settings');
    settingsItem?.action?.();
    expect(controller.openColumnSettings).toHaveBeenCalledWith('price');
  });
});

/**
 * Saved-filter pills badge a row count. Under SSRM a client-side row walk can
 * only see the LOADED blocks, so the number changes as you scroll and pins to
 * the block size the moment the pill goes active. The host therefore publishes
 * an engine-backed counter instead — and a tick subscription, so an idle
 * blotter's pills cost zero RPCs rather than polling the engine forever.
 */
describe('MarketsGridHost — SSRM pill counting', () => {
  const ssrmProvider = () => ({
    id: 'p-ssrm',
    getRowCount: vi.fn(async () => ({ rowCount: 42 })),
    onSsrmTick: vi.fn(() => vi.fn()),
    onRefresh: vi.fn(() => vi.fn()),
  });

  beforeEach(() => {
    ssrmContexts.rowCounter = null;
    ssrmContexts.tickSubscribe = null;
  });

  it('publishes nothing to count with under CSRM', () => {
    render(<MarketsGridHost {...(baseProps() as any)} />);
    expect(screen.queryByTestId('markets-grid-ssrm-surface')).toBeNull();
    expect(screen.getByTestId('markets-grid-surface')).toBeInTheDocument();
  });

  it('counts a pill against the engine, not the loaded blocks', async () => {
    const provider = ssrmProvider();
    render(<MarketsGridHost {...(baseProps({ ssrm: { provider, keyColumn: 'id' } }) as any)} />);
    expect(screen.getByTestId('markets-grid-ssrm-surface')).toBeInTheDocument();

    const filterModel = { ccy: { type: 'equals', filter: 'USD' } };
    await expect(ssrmContexts.rowCounter!(filterModel)).resolves.toBe(42);
    expect(provider.getRowCount).toHaveBeenCalledWith({ filterModel });
  });

  it('subscribes to both ticks and refreshes, and detaches both on unsubscribe', () => {
    const provider = ssrmProvider();
    const offTick = vi.fn();
    const offRefresh = vi.fn();
    provider.onSsrmTick.mockReturnValue(offTick);
    provider.onRefresh.mockReturnValue(offRefresh);
    render(<MarketsGridHost {...(baseProps({ ssrm: { provider, keyColumn: 'id' } }) as any)} />);

    const handler = vi.fn();
    const unsubscribe = ssrmContexts.tickSubscribe!(handler);

    expect(provider.onSsrmTick).toHaveBeenCalledWith(handler);
    // A refresh moves the engine just as a tick does; missing it leaves the
    // pills showing pre-refresh counts until the next stream message.
    expect(provider.onRefresh).toHaveBeenCalledWith(handler);

    unsubscribe();
    expect(offTick).toHaveBeenCalledTimes(1);
    expect(offRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('MarketsGridHost — unsaved-switch dialog', () => {
  it('clears the pending switch when the user backs out', () => {
    controller.pendingSwitch = { id: 'b' } as never;
    render(<MarketsGridHost {...(baseProps() as any)} />);

    fireEvent.click(screen.getByTestId('switch-cancel'));

    expect(controller.setPendingSwitch).toHaveBeenCalledWith(null);
    controller.pendingSwitch = null;
  });
});
