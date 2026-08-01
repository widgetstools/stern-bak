/**
 * MarketsGrid — characterisation tests (Session 1.1 of the deferred
 * refactor worklog).
 *
 * These tests lock down the CURRENT observable behaviour of
 * MarketsGrid.tsx so Sessions 1.2 (controller hook extraction) and 1.3
 * (view sub-component extraction) can refactor without regression.
 *
 * Assertions deliberately match EXACT `console.log` / `console.warn`
 * prefix strings from the production code — silently rewriting a log
 * line during the refactor must surface here, not in production.
 *
 * Note on the runbook: groups labelled below align with
 * Characterisation tests for MarketsGrid surface behavior.
 *  - Group G (`onEditProvider`) is INTENTIONALLY OMITTED — the
 *    runbook's reference is fictional; no such prop exists on
 *    `MarketsGridProps` (see types.ts) and there is no
 *    edit-provider button in MarketsGrid's toolbar JSX.
 *  - Group J was adapted: the production code captures the storage
 *    adapter ONCE in `adapterRef` (MarketsGrid.tsx:461-462) and never
 *    rebuilds the ProfileManager when the prop changes. The test
 *    locks that actual behaviour down, not the runbook's hypothetical.
 *  - Group K asserts DOM-node identity is preserved across theme
 *    rerender (proxy for "no AG-Grid remount") because the AG-Grid
 *    stub used here doesn't expose a `setColumnDefs` to spy on.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';

afterEach(() => cleanup());

// ── Hoisted shared state ──────────────────────────────────────────────
// `vi.mock` factories are hoisted above imports — they cannot close
// over module-scope variables defined later. `vi.hoisted` lets us share
// mutable test state with those factories. Each test resets the slots
// it touches in beforeEach.
const mocks = vi.hoisted(() => {
  return {
    profile: {
      profiles: [] as any[],
      activeProfileId: null as string | null,
      isDirty: false,
      saveActiveProfile: vi.fn(async () => {}),
      loadProfile: vi.fn(async () => {}),
      createProfile: vi.fn(async () => {}),
      deleteProfile: vi.fn(async () => {}),
      cloneProfile: vi.fn(async () => {}),
      renameProfile: vi.fn(async () => {}),
      discardActiveProfile: vi.fn(async () => {}),
      exportProfile: vi.fn(async () => ({ profile: { name: 'sample' } })),
      importProfile: vi.fn(async () => {}),
    },
    api: { sizeColumnsToFit: vi.fn() } as any,
    captureGridStateInto: vi.fn(),
    profileSelectorPropsRef: { current: null as any },
    useGridHostInvocations: { count: 0 },
    gridIdSeenByProfileManager: { current: null as string | null },
    useProfileManagerOpts: { current: null as any },
  };
});

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
    MemoryAdapter: class MemoryAdapter {
      async loadGridLevelData() { return null; }
      async saveGridLevelData() {}
    },
    LocalStorageBundleAdapter: class LocalStorageBundleAdapter {},
  };
});

vi.mock('@wellsfargo-starui/grid/customizer', () => ({
  GridProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ProviderGridHostProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GridEventBindingsHostProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGridApi: () => mocks.api,
  useGridPlatform: () => ({ store: {}, gridId: 'test-grid', events: { on: () => () => {}, emit: () => {} } }),
  useModuleState: () => [undefined, vi.fn()],
  GENERAL_SETTINGS_MODULE_ID: 'general-settings',
  useProfileManager: (opts: any) => {
    mocks.useProfileManagerOpts.current = opts;
    return mocks.profile;
  },
  captureGridStateInto: (...args: any[]) =>
    (mocks.captureGridStateInto as any)(...args),
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
  // The grid mounts the AlertDialog only when `open` is true (the host
  // controls it via `pendingSwitch !== null`). The real shadcn dialog
  // mounts on demand; our shell mirrors that so the action buttons
  // only exist in the DOM when the prompt is up.
  AlertDialog: ({ children, open }: any) => (open ? <>{children}</> : null),
  AlertDialogContent: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: any) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...rest }: any) => (
    <button {...rest}>{children}</button>
  ),
  AlertDialogCancel: ({ children, ...rest }: any) => (
    <button {...rest}>{children}</button>
  ),
  calculatedColumnsModule: {},
  columnCustomizationModule: {},
  columnGroupsModule: {},
  columnTemplatesModule: {},
  conditionalStylingModule: {},
  visualExcelModule: {},
  exportVisualExcel: vi.fn(),
  VISUAL_EXCEL_MODULE_ID: 'visual-excel',
  smartEditModule: {},
  bulkUpdateModule: {},
  plusMinusModule: {},
  shortcutsModule: {},
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
}));

vi.mock('./useGridHost', () => ({
  useGridHost: (_opts: any) => {
    mocks.useGridHostInvocations.count += 1;
    return {
      platform: { store: {}, api: { api: null } },
      columnDefs: [],
      gridOptions: {},
      onGridReady: vi.fn(),
      onGridPreDestroyed: vi.fn(),
    };
  },
}));

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
vi.mock('./ProfileSelector', () => ({
  ProfileSelector: (props: any) => {
    mocks.profileSelectorPropsRef.current = props;
    return <div data-testid="profile-selector-mock" />;
  },
}));

import { MarketsGrid } from './MarketsGrid';

const baseProps = {
  gridId: 'characterisation-test',
  rowData: [] as unknown[],
  columnDefs: [] as any[],
} as const;

function resetMocks() {
  mocks.profile.profiles = [];
  mocks.profile.activeProfileId = null;
  mocks.profile.isDirty = false;
  mocks.profile.saveActiveProfile = vi.fn(async () => {});
  mocks.profile.loadProfile = vi.fn(async () => {});
  mocks.profile.createProfile = vi.fn(async () => {});
  mocks.profile.deleteProfile = vi.fn(async () => {});
  mocks.profile.cloneProfile = vi.fn(async () => {});
  mocks.profile.renameProfile = vi.fn(async () => {});
  mocks.profile.discardActiveProfile = vi.fn(async () => {});
  mocks.profile.exportProfile = vi.fn(async () => ({ profile: { name: 'sample' } }));
  mocks.profile.importProfile = vi.fn(async () => {});
  mocks.api = { sizeColumnsToFit: vi.fn() };
  mocks.captureGridStateInto = vi.fn();
  mocks.profileSelectorPropsRef.current = null;
  mocks.useGridHostInvocations.count = 0;
  mocks.useProfileManagerOpts.current = null;
}

describe('MarketsGrid — characterisation', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The profile CRUD failure paths call `window.alert(...)`. jsdom
    // implements alert as a noop that throws "not implemented" — stub it
    // so the tests can exercise the failure paths without crashing.
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    alertSpy.mockRestore();
  });

  // ── Group A — Mount with no active profile ──────────────────────────
  describe('Group A — mount with no active profile', () => {
    it('renders the toolbar + AG-Grid stub via existing data-testids', () => {
      const { getByTestId, container } = render(<MarketsGrid {...baseProps} />);
      expect(getByTestId('ag-grid-stub')).toBeTruthy();
      expect(getByTestId('save-all-btn')).toBeTruthy();
      expect(getByTestId('toolbar-more-menu-trigger')).toBeTruthy();
      // Root carries the consumer-supplied gridId attribute.
      expect(
        container.querySelector('[data-grid-id="characterisation-test"]'),
      ).toBeTruthy();
    });

    it('initialises useProfileManager with the current adapter', () => {
      render(<MarketsGrid {...baseProps} />);
      // useProfileManager receives adapter, autoSaveDebounceMs,
      // disableAutoSave, activeIdSource — see MarketsGrid.tsx:547-552.
      expect(mocks.useProfileManagerOpts.current).toBeTruthy();
      expect(mocks.useProfileManagerOpts.current.adapter).toBeTruthy();
      expect(mocks.useProfileManagerOpts.current.disableAutoSave).toBe(true);
    });

    it('does not fire console.warn on a clean mount', () => {
      render(<MarketsGrid {...baseProps} />);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  // ── Group B — Mount with active profile ─────────────────────────────
  describe('Group B — mount with active profile', () => {
    it('passes activeProfileId + profile list down to ProfileSelector', () => {
      mocks.profile.profiles = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ];
      mocks.profile.activeProfileId = 'a';
      render(<MarketsGrid {...baseProps} />);
      const props = mocks.profileSelectorPropsRef.current;
      expect(props.activeProfileId).toBe('a');
      expect(props.profiles).toHaveLength(2);
      expect(props.isDirty).toBe(false);
    });

    it('does NOT auto-call captureGridStateInto on mount (capture is explicit-save-only)', () => {
      // Locks down the load path: the host re-applies state via the
      // module pipeline (driven by useProfileManager), NOT by calling
      // captureGridStateInto. Capture is reserved for save (button or
      // save-and-switch). This prevents a future refactor from
      // accidentally re-introducing an auto-capture-on-mount that
      // would clobber the freshly-applied snapshot.
      mocks.profile.profiles = [{ id: 'a', name: 'Alpha' }];
      mocks.profile.activeProfileId = 'a';
      render(<MarketsGrid {...baseProps} />);
      expect(mocks.captureGridStateInto).not.toHaveBeenCalled();
    });
  });

  // ── Group C — onReady callback contract ─────────────────────────────
  describe('Group C — onReady callback contract', () => {
    it('fires exactly once with { gridApi, platform, profiles, saveAll, ... }', async () => {
      const onReady = vi.fn();
      render(<MarketsGrid {...baseProps} onReady={onReady} />);
      await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
      const handle = onReady.mock.calls[0][0];
      expect(handle.gridApi).toBe(mocks.api);
      expect(handle.platform).toBeTruthy();
      expect(handle.profiles).toBe(mocks.profile);
      expect(typeof handle.saveAll).toBe('function');
    });

    it('logs the exact onReady-delivered string from MarketsGrid.tsx:599', async () => {
      const onReady = vi.fn();
      render(<MarketsGrid {...baseProps} onReady={onReady} />);
      await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
      const matched = consoleLogSpy.mock.calls.some(
        (args) =>
          args[0] ===
          '[v2/markets-grid] handle delivered to onReady (gridApi alive — consumer can now subscribe)',
      );
      expect(matched).toBe(true);
    });

    it('does NOT fire onReady when useGridApi() returns null', () => {
      const onReady = vi.fn();
      mocks.api = null;
      render(<MarketsGrid {...baseProps} onReady={onReady} />);
      expect(onReady).not.toHaveBeenCalled();
    });
  });

  // ── Group D — Profile switch lifecycle ─────────────────────────────
  describe('Group D — profile switch lifecycle', () => {
    it('routes a clean (non-dirty) switch directly to profiles.loadProfile, no save', async () => {
      mocks.profile.profiles = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ];
      mocks.profile.activeProfileId = 'a';
      mocks.profile.isDirty = false;
      render(<MarketsGrid {...baseProps} />);

      await act(async () => {
        mocks.profileSelectorPropsRef.current.onLoad('b');
      });

      expect(mocks.profile.loadProfile).toHaveBeenCalledWith('b');
      expect(mocks.profile.saveActiveProfile).not.toHaveBeenCalled();
      expect(mocks.captureGridStateInto).not.toHaveBeenCalled();
    });

    it('opens the unsaved-changes prompt when dirty (no immediate load)', async () => {
      mocks.profile.profiles = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ];
      mocks.profile.activeProfileId = 'a';
      mocks.profile.isDirty = true;
      const { getByTestId, queryByTestId } = render(<MarketsGrid {...baseProps} />);

      expect(queryByTestId('profile-switch-confirm')).toBeNull();

      await act(async () => {
        mocks.profileSelectorPropsRef.current.onLoad('b');
      });

      expect(getByTestId('profile-switch-confirm')).toBeTruthy();
      expect(mocks.profile.loadProfile).not.toHaveBeenCalled();
    });

    it('save-and-switch fires captureGridStateInto → saveActiveProfile → loadProfile in order', async () => {
      mocks.profile.profiles = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ];
      mocks.profile.activeProfileId = 'a';
      mocks.profile.isDirty = true;
      const { getByTestId } = render(<MarketsGrid {...baseProps} />);

      await act(async () => {
        mocks.profileSelectorPropsRef.current.onLoad('b');
      });

      await act(async () => {
        fireEvent.click(getByTestId('profile-switch-save'));
      });

      expect(mocks.captureGridStateInto).toHaveBeenCalledTimes(1);
      expect(mocks.profile.saveActiveProfile).toHaveBeenCalledTimes(1);
      expect(mocks.profile.loadProfile).toHaveBeenCalledWith('b');

      const captureOrder =
        mocks.captureGridStateInto.mock.invocationCallOrder[0];
      const saveOrder =
        mocks.profile.saveActiveProfile.mock.invocationCallOrder[0];
      const loadOrder = mocks.profile.loadProfile.mock.invocationCallOrder[0];
      expect(captureOrder).toBeLessThan(saveOrder);
      expect(saveOrder).toBeLessThan(loadOrder);
    });

    it('discard-and-switch fires discardActiveProfile then loadProfile in order', async () => {
      mocks.profile.profiles = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ];
      mocks.profile.activeProfileId = 'a';
      mocks.profile.isDirty = true;
      const { getByTestId } = render(<MarketsGrid {...baseProps} />);

      await act(async () => {
        mocks.profileSelectorPropsRef.current.onLoad('b');
      });
      await act(async () => {
        fireEvent.click(getByTestId('profile-switch-discard'));
      });

      expect(mocks.profile.discardActiveProfile).toHaveBeenCalledTimes(1);
      expect(mocks.profile.loadProfile).toHaveBeenCalledWith('b');
      const discardOrder =
        mocks.profile.discardActiveProfile.mock.invocationCallOrder[0];
      const loadOrder = mocks.profile.loadProfile.mock.invocationCallOrder[0];
      expect(discardOrder).toBeLessThan(loadOrder);
    });
  });

  // ── Group E — saveActiveProfile failure path ────────────────────────
  describe('Group E — saveActiveProfile failure', () => {
    it('warns with the exact `[markets-grid] saveActiveProfile failed:` prefix (line 664)', async () => {
      mocks.profile.saveActiveProfile = vi.fn(async () => {
        throw new Error('boom');
      });
      const onSavingChange = vi.fn();
      const { getByTestId } = render(
        <MarketsGrid {...baseProps} onSavingChange={onSavingChange} />,
      );

      await act(async () => {
        fireEvent.click(getByTestId('save-all-btn'));
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[markets-grid] saveActiveProfile failed:',
        expect.any(Error),
      );
      // onSavingChange flips true → false even on failure (line 665).
      expect(onSavingChange.mock.calls[0][0]).toBe(true);
      expect(onSavingChange.mock.calls.at(-1)![0]).toBe(false);
    });
  });

  // ── Group F — Profile clone / rename / export / import ──────────────
  describe('Group F — profile CRUD success + failure paths', () => {
    beforeEach(() => {
      mocks.profile.profiles = [{ id: 'a', name: 'Alpha' }];
      mocks.profile.activeProfileId = 'a';
    });

    it('clone success calls profiles.cloneProfile with a unique " (copy)" name', async () => {
      render(<MarketsGrid {...baseProps} />);
      await act(async () => {
        await mocks.profileSelectorPropsRef.current.onClone('a');
      });
      expect(mocks.profile.cloneProfile).toHaveBeenCalledWith(
        'a',
        'Alpha (copy)',
      );
    });

    it('clone failure warns with `[markets-grid] profile clone failed:` (line 845)', async () => {
      mocks.profile.cloneProfile = vi.fn(async () => {
        throw new Error('clone-fail');
      });
      render(<MarketsGrid {...baseProps} />);
      await act(async () => {
        await mocks.profileSelectorPropsRef.current.onClone('a');
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[markets-grid] profile clone failed:',
        expect.any(Error),
      );
    });

    it('rename success calls profiles.renameProfile(id, name)', async () => {
      render(<MarketsGrid {...baseProps} />);
      await act(async () => {
        await mocks.profileSelectorPropsRef.current.onRename('a', 'A2');
      });
      expect(mocks.profile.renameProfile).toHaveBeenCalledWith('a', 'A2');
    });

    it('rename failure warns with `[markets-grid] profile rename failed:` (line 853)', async () => {
      mocks.profile.renameProfile = vi.fn(async () => {
        throw new Error('rename-fail');
      });
      render(<MarketsGrid {...baseProps} />);
      await act(async () => {
        await mocks.profileSelectorPropsRef.current.onRename('a', 'A2');
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[markets-grid] profile rename failed:',
        expect.any(Error),
      );
    });

    it('export success calls profiles.exportProfile(id) and triggers a download', async () => {
      const createObjectURL = vi
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:test');
      const revokeObjectURL = vi
        .spyOn(URL, 'revokeObjectURL')
        .mockImplementation(() => {});
      render(<MarketsGrid {...baseProps} />);
      await act(async () => {
        await mocks.profileSelectorPropsRef.current.onExport('a');
      });
      expect(mocks.profile.exportProfile).toHaveBeenCalledWith('a');
      expect(createObjectURL).toHaveBeenCalled();
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    });

    it('export failure warns with `[markets-grid] profile export failed:` (line 878)', async () => {
      mocks.profile.exportProfile = vi.fn(async () => {
        throw new Error('export-fail');
      });
      render(<MarketsGrid {...baseProps} />);
      await act(async () => {
        await mocks.profileSelectorPropsRef.current.onExport('a');
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[markets-grid] profile export failed:',
        expect.any(Error),
      );
    });

    it('import success calls profiles.importProfile with parsed JSON', async () => {
      render(<MarketsGrid {...baseProps} />);
      const file = new File(['{"profile":{"name":"x"}}'], 'p.json', {
        type: 'application/json',
      });
      await act(async () => {
        await mocks.profileSelectorPropsRef.current.onImport(file);
      });
      expect(mocks.profile.importProfile).toHaveBeenCalledWith({
        profile: { name: 'x' },
      });
    });

    it('import failure warns with `[markets-grid] profile import failed:` (line 888)', async () => {
      mocks.profile.importProfile = vi.fn(async () => {
        throw new Error('import-fail');
      });
      render(<MarketsGrid {...baseProps} />);
      const file = new File(['{"profile":{"name":"x"}}'], 'p.json', {
        type: 'application/json',
      });
      await act(async () => {
        await mocks.profileSelectorPropsRef.current.onImport(file);
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[markets-grid] profile import failed:',
        expect.any(Error),
      );
    });
  });

  // ── Group G — INTENTIONALLY OMITTED ─────────────────────────────────
  // The runbook references an `onEditProvider` prop and an
  // edit-provider button. Neither exists on `MarketsGridProps` (see
  // types.ts) nor in the toolbar JSX. Provider editing is owned by
  // the `<MarketsGridContainer>` / `<DataProvidersToolbar>` shell that
  // wraps MarketsGrid via `headerExtras`, not MarketsGrid itself.
  // Adding a fictional test here would lock down behaviour that does
  // not exist — defeating the purpose of characterisation.

  // ── Group H — gridLevelData save / load ─────────────────────────────
  describe('Group H — gridLevelData persistence', () => {
    it('logs the no-method branch when adapter lacks loadGridLevelData (line 489)', () => {
      const minimalAdapter = {} as any;
      const onLoad = vi.fn();
      render(
        <MarketsGrid
          {...baseProps}
          storageAdapter={minimalAdapter}
          onGridLevelDataLoad={onLoad}
        />,
      );
      const matched = consoleLogSpy.mock.calls.some(
        (args) =>
          args[0] ===
          '[v2/markets-grid] gridLevelData: adapter has no loadGridLevelData method (using null)',
      );
      expect(matched).toBe(true);
      expect(onLoad).toHaveBeenCalledWith(null);
    });

    it('logs load → adapter call and loaded result (lines 495 + 502)', async () => {
      const adapter = {
        loadGridLevelData: vi.fn(async () => ({ flag: true })),
        saveGridLevelData: vi.fn(async () => {}),
      } as any;
      const onLoad = vi.fn();
      render(
        <MarketsGrid
          {...baseProps}
          storageAdapter={adapter}
          onGridLevelDataLoad={onLoad}
        />,
      );

      // Synchronous "load → adapter.loadGridLevelData(%s)" log.
      const loadInvokedLogged = consoleLogSpy.mock.calls.some(
        (args) =>
          args[0] ===
          '[v2/markets-grid] gridLevelData: load → adapter.loadGridLevelData(%s)',
      );
      expect(loadInvokedLogged).toBe(true);

      // Async "loaded" log fires after the adapter promise resolves.
      await waitFor(() => {
        const loadedLogged = consoleLogSpy.mock.calls.some(
          (args) => args[0] === '[v2/markets-grid] gridLevelData: loaded',
        );
        expect(loadedLogged).toBe(true);
      });

      expect(adapter.loadGridLevelData).toHaveBeenCalledWith(
        'characterisation-test',
      );
      await waitFor(() => expect(onLoad).toHaveBeenCalledWith({ flag: true }));
    });

    it('warns when loadGridLevelData rejects (line 509)', async () => {
      const adapter = {
        loadGridLevelData: vi.fn(async () => {
          throw new Error('disk-down');
        }),
      } as any;
      const onLoad = vi.fn();
      render(
        <MarketsGrid
          {...baseProps}
          storageAdapter={adapter}
          onGridLevelDataLoad={onLoad}
        />,
      );

      await waitFor(() => {
        const failedLogged = consoleWarnSpy.mock.calls.some(
          (args) =>
            args[0] === '[v2/markets-grid] gridLevelData: load failed',
        );
        expect(failedLogged).toBe(true);
      });
      // Falls back to null payload.
      await waitFor(() => expect(onLoad).toHaveBeenCalledWith(null));
    });

    it('logs `gridLevelData: save` when the prop changes after load (line 528)', async () => {
      const adapter = {
        loadGridLevelData: vi.fn(async () => null),
        saveGridLevelData: vi.fn(async () => {}),
      } as any;
      const { rerender } = render(
        <MarketsGrid
          {...baseProps}
          storageAdapter={adapter}
          gridLevelData={undefined}
        />,
      );
      // Wait until initial load resolves so lastPersistedRef = null.
      await waitFor(() => {
        const loadedLogged = consoleLogSpy.mock.calls.some(
          (args) => args[0] === '[v2/markets-grid] gridLevelData: loaded',
        );
        expect(loadedLogged).toBe(true);
      });

      const next = { newValue: 1 };
      rerender(
        <MarketsGrid
          {...baseProps}
          storageAdapter={adapter}
          gridLevelData={next}
        />,
      );

      await waitFor(() => {
        const saveLogged = consoleLogSpy.mock.calls.some(
          (args) => args[0] === '[v2/markets-grid] gridLevelData: save',
        );
        expect(saveLogged).toBe(true);
      });
      expect(adapter.saveGridLevelData).toHaveBeenCalledWith(
        'characterisation-test',
        next,
      );
    });
  });

  // ── Group I — Save-and-switch / discard-and-switch failures ─────────
  describe('Group I — switch-flow failure paths', () => {
    it('save-and-switch warns with `[markets-grid] save-and-switch failed:` (line 727)', async () => {
      mocks.profile.profiles = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ];
      mocks.profile.activeProfileId = 'a';
      mocks.profile.isDirty = true;
      // handleSaveAll's own catch swallows saveActiveProfile failures
      // (line 663-667), so the OUTER save-and-switch catch only fires
      // when `loadProfile` itself rejects after a clean save.
      mocks.profile.loadProfile = vi.fn(async () => {
        throw new Error('load-fail');
      });
      const { getByTestId } = render(<MarketsGrid {...baseProps} />);

      await act(async () => {
        mocks.profileSelectorPropsRef.current.onLoad('b');
      });
      await act(async () => {
        fireEvent.click(getByTestId('profile-switch-save'));
      });

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[markets-grid] save-and-switch failed:',
          expect.any(Error),
        );
      });
    });

    it('discard-and-switch warns with `[markets-grid] discard-and-switch failed:` (line 743)', async () => {
      mocks.profile.profiles = [
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ];
      mocks.profile.activeProfileId = 'a';
      mocks.profile.isDirty = true;
      mocks.profile.discardActiveProfile = vi.fn(async () => {
        throw new Error('discard-fail');
      });
      const { getByTestId } = render(<MarketsGrid {...baseProps} />);

      await act(async () => {
        mocks.profileSelectorPropsRef.current.onLoad('b');
      });
      await act(async () => {
        fireEvent.click(getByTestId('profile-switch-discard'));
      });

      await waitFor(() => {
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          '[markets-grid] discard-and-switch failed:',
          expect.any(Error),
        );
      });
    });
  });

  // ── Group J — storageAdapter prop swap (LOCKED-DOWN ACTUAL behaviour) ─
  describe('Group J — storageAdapter is captured ONCE on mount', () => {
    it('does not re-initialise useProfileManager when storageAdapter prop changes', () => {
      // The Host component captures `storageAdapter` into `adapterRef`
      // via `if (!adapterRef.current) adapterRef.current = ... ;` (line
      // 461-462). After mount, swapping the storageAdapter prop does
      // NOT rebuild ProfileManager — useProfileManager keeps receiving
      // the same adapter reference. This locks that behaviour down so
      // a future refactor that switches to a useMemo/useEffect-driven
      // rebuild surfaces here for explicit review.
      const adapterA = {
        loadGridLevelData: vi.fn(async () => null),
        saveGridLevelData: vi.fn(async () => {}),
      } as any;
      const adapterB = {
        loadGridLevelData: vi.fn(async () => null),
        saveGridLevelData: vi.fn(async () => {}),
      } as any;

      const { rerender } = render(
        <MarketsGrid {...baseProps} storageAdapter={adapterA} />,
      );
      const adapterSeenFirst = mocks.useProfileManagerOpts.current.adapter;

      rerender(<MarketsGrid {...baseProps} storageAdapter={adapterB} />);
      const adapterSeenAfter = mocks.useProfileManagerOpts.current.adapter;

      expect(adapterSeenAfter).toBe(adapterSeenFirst);
      // Adapter B's loadGridLevelData should NOT have been called —
      // the once-captured adapterA is what owns persistence.
      expect(adapterB.loadGridLevelData).not.toHaveBeenCalled();
    });
  });

  // ── Group K — Theme prop changes do not remount AG-Grid ─────────────
  describe('Group K — theme prop change preserves AG-Grid mount', () => {
    it('reuses the same AG-Grid DOM node across a theme rerender', () => {
      const themeA = { variant: 'a' } as any;
      const themeB = { variant: 'b' } as any;
      const { rerender, getByTestId } = render(
        <MarketsGrid {...baseProps} theme={themeA} />,
      );
      const before = getByTestId('ag-grid-stub');

      rerender(<MarketsGrid {...baseProps} theme={themeB} />);
      const after = getByTestId('ag-grid-stub');

      // Same DOM node ⇒ React reused the AG-Grid element instead of
      // unmounting and remounting it. Defends against a future
      // refactor that wraps AG-Grid in a `key={theme}` (which would
      // tear down and rebuild the entire grid on every theme flip).
      expect(after).toBe(before);
    });
  });
});
