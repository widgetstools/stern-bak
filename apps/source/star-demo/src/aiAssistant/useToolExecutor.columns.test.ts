/**
 * Executor tests for the column-mutation tools — styling, behaviour, layout
 * and row grouping. Split from `useToolExecutor.test.ts` for size; the mock
 * harness is duplicated because `vi.mock` hoists per file and cannot be
 * shared.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager, ProfileSnapshot } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { dispatchTool, type ToolExecutionContext } from './useToolExecutor';

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({ useDataServices: vi.fn() }));

vi.mock('@wellsfargo-starui/types', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LOGGED_IN_USER_ID: 'dev1',
  getDefaultProviderConfig: (type: string) => ({ providerType: type, updateInterval: 2000 }),
  validateProviderConfig: (config: { providerType?: string }) =>
    config.providerType === 'mock'
      ? { isValid: true, errors: [] }
      : { isValid: false, errors: ['unsupported providerType in test'] },
}));

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
  deriveTemplateConfigId: (type: string, sub: string) => `${type}-${sub}`.toLowerCase(),
}));

const mockAddRegistryEntry = vi.fn();
const mockAddDockButton = vi.fn();
const mockRegistryEntryExists = vi.fn();
vi.mock('./registryOps', () => ({
  addRegistryEntry: (...args: unknown[]) => mockAddRegistryEntry(...args),
  addDockButton: (...args: unknown[]) => mockAddDockButton(...args),
  registryEntryExists: (...args: unknown[]) => mockRegistryEntryExists(...args),
  buildRegistryEntry: (spec: unknown) => spec,
}));

const GRID_ENTRY = {
  id: 'grid-test', configId: 'grid-test', componentType: 'grid', componentSubType: 'test',
  displayName: 'TestGrid', hostUrl: '/#/blotters/marketsgrid', iconId: '', createdAt: '',
  type: 'internal' as const, usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '',
  singleton: true, asWindow: false,
};

/** Builds a ToolExecutionContext over fake ConfigManager + provider-store doubles. */
function fakeCtx() {
  const list = vi.fn().mockResolvedValue([]);
  const save = vi.fn().mockResolvedValue(undefined);
  const loadGridLevelData = vi.fn().mockResolvedValue(null);
  const saveGridLevelData = vi.fn().mockResolvedValue(undefined);
  // Instance rows cloned from the template at dock-launch time. Empty by
  // default — the template-only case.
  const findByComponentType = vi.fn().mockResolvedValue([]);
  const storeList = vi.fn().mockResolvedValue([]);
  const storeGet = vi.fn().mockResolvedValue(null);
  const storeSave = vi.fn().mockResolvedValue({});
  const ctx: ToolExecutionContext = {
    configManager: {
      profiles: { list, save, loadGridLevelData, saveGridLevelData },
      findByComponentType,
    } as unknown as ConfigManager,
    configStore: { list: storeList, get: storeGet, save: storeSave } as unknown as DataProviderConfigStore,
    appId: 'Star-Demo',
  };
  return { ctx, list, save, loadGridLevelData, saveGridLevelData, findByComponentType, storeList, storeGet, storeSave };
}

describe('dispatchTool — columns', () => {
  beforeEach(() => {
    mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [GRID_ENTRY] });
  });

  it('set_column_style merges theme-keyed colors into a fresh assignment when the grid has no profile yet', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([]); // no existing profile — handler creates a default one

    const result = await dispatchTool(
      'set_column_style',
      ctx,
      { targetGridId: 'grid-test', colId: 'spread', colors: { light: { background: '#fee2e2' }, dark: { background: '#3b0d0d' } } },
    );

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const assignments = (snapshot.state['column-customization']?.data as { assignments: Record<string, { cellStyleOverrides?: { light?: { colors?: unknown }; dark?: { colors?: unknown } } }> }).assignments;
    expect(assignments.spread.cellStyleOverrides?.light?.colors).toEqual({ background: '#fee2e2' });
    expect(assignments.spread.cellStyleOverrides?.dark?.colors).toEqual({ background: '#3b0d0d' });
  });

  /** Header styling is a SEPARATE slot — styling cells alone leaves the
   *  header label unmoved, which reads to a user as "alignment didn't work". */
  it('set_column_style aligns cells and headers, in both theme slots', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([]);

    const result = await dispatchTool('set_column_style', ctx, {
      targetGridId: 'grid-test',
      colIds: ['marketValue', 'cleanPrice'],
      target: 'cells+headers',
      align: 'right',
    });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const assignments = (snapshot.state['column-customization']?.data as {
      assignments: Record<string, { cellStyleOverrides?: Record<string, { alignment?: unknown }>; headerStyleOverrides?: Record<string, { alignment?: unknown }> }>;
    }).assignments;

    for (const colId of ['marketValue', 'cleanPrice']) {
      for (const side of ['light', 'dark']) {
        expect(assignments[colId].cellStyleOverrides?.[side]?.alignment).toEqual({ horizontal: 'right' });
        expect(assignments[colId].headerStyleOverrides?.[side]?.alignment).toEqual({ horizontal: 'right' });
      }
    }
  });

  it('set_column_style with allColumns writes the grid-wide baseline instead of per-column entries', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([]);

    const result = await dispatchTool('set_column_style', ctx, {
      targetGridId: 'grid-test',
      allColumns: true,
      target: 'cells+headers',
      align: 'right',
    });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const data = snapshot.state['column-customization']?.data as {
      assignments?: Record<string, unknown>;
      globalCellStyle?: Record<string, { alignment?: unknown }>;
      globalHeaderStyle?: Record<string, { alignment?: unknown }>;
    };
    expect(data.globalCellStyle?.dark?.alignment).toEqual({ horizontal: 'right' });
    expect(data.globalHeaderStyle?.light?.alignment).toEqual({ horizontal: 'right' });
    expect(data.assignments ?? {}).toEqual({});
  });

  it('set_column_style preserves existing colours when only alignment changes', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([
      {
        id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
        state: {
          'column-customization': {
            v: 1,
            data: { assignments: { ticker: { colId: 'ticker', cellStyleOverrides: { dark: { colors: { text: '#7fdf9b' } }, light: { colors: { text: '#1f7a34' } } } } } },
          },
        },
      },
    ]);

    const result = await dispatchTool('set_column_style', ctx, { targetGridId: 'grid-test', colId: 'ticker', align: 'center' });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const assignment = (snapshot.state['column-customization']?.data as {
      assignments: Record<string, { cellStyleOverrides?: Record<string, { colors?: unknown; alignment?: unknown }> }>;
    }).assignments.ticker;
    expect(assignment.cellStyleOverrides?.dark?.colors).toEqual({ text: '#7fdf9b' });
    expect(assignment.cellStyleOverrides?.dark?.alignment).toEqual({ horizontal: 'center' });
  });

  it('set_column_style writes a renderer alongside the styling', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([]);

    const result = await dispatchTool('set_column_style', ctx, {
      targetGridId: 'grid-test',
      colId: 'compositeRating',
      renderer: { id: 'pill', config: { variant: 'soft' } },
    });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const assignment = (snapshot.state['column-customization']?.data as {
      assignments: Record<string, { cellRendererId?: string; cellRendererConfig?: unknown }>;
    }).assignments.compositeRating;
    expect(assignment.cellRendererId).toBe('pill');
    expect(assignment.cellRendererConfig).toEqual({ kind: 'pill', config: { variant: 'soft' } });
  });

  /**
   * A renderer paints the whole cell, so it hides any value format underneath.
   * The engine's own formatter reducer clears the renderer for exactly this
   * reason — otherwise the newly-picked format is invisible and the user is
   * told it was applied.
   */
  it('set_column_style drops a renderer when a value format is applied over it', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([
      {
        id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
        state: {
          'column-customization': {
            v: 1,
            data: { assignments: { marketValue: { colId: 'marketValue', cellRendererId: 'pnl-value', cellRendererConfig: { kind: 'pnl-value', config: {} } } } },
          },
        },
      },
    ]);

    const result = await dispatchTool('set_column_style', ctx, {
      targetGridId: 'grid-test',
      colId: 'marketValue',
      formatter: { kind: 'excelFormat', format: '#,##0.00' },
    });

    expect(result.ok).toBe(true);
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const assignment = (snapshot.state['column-customization']?.data as {
      assignments: Record<string, { cellRendererId?: string; cellRendererConfig?: unknown; valueFormatterTemplate?: unknown }>;
    }).assignments.marketValue;
    expect(assignment.valueFormatterTemplate).toEqual({ kind: 'excelFormat', format: '#,##0.00' });
    expect(assignment.cellRendererId).toBeUndefined();
    expect(assignment.cellRendererConfig).toBeUndefined();
  });

  it('set_column_style keeps a renderer set in the same call as a format', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([]);

    await dispatchTool('set_column_style', ctx, {
      targetGridId: 'grid-test',
      colId: 'marketValue',
      formatPreset: 'currency',
      renderer: 'pnl-value',
    });

    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const assignment = (snapshot.state['column-customization']?.data as {
      assignments: Record<string, { cellRendererId?: string; valueFormatterTemplate?: unknown }>;
    }).assignments.marketValue;
    expect(assignment.cellRendererId).toBe('pnl-value');
    expect(assignment.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'currency' });
  });

  it('set_column_behavior writes an editor, unlocks the cell, and sets a stream-safe filter', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([]);

    const result = await dispatchTool('set_column_behavior', ctx, {
      targetGridId: 'grid-test',
      colId: 'quantity',
      editor: { kind: 'agNumberCellEditor', params: { min: 0 } },
      filter: { kind: 'streamSafeMultiNumberColumnFilter', floatingFilter: true },
      grouping: { enableRowGroup: true, aggFunc: 'sum' },
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('made editable');
    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const assignment = (snapshot.state['column-customization']?.data as {
      assignments: Record<string, Record<string, unknown>>;
    }).assignments.quantity;
    expect(assignment.cellEditor).toEqual({ kind: 'agNumberCellEditor', params: { min: 0 } });
    expect(assignment.editable).toBe(true);
    expect(assignment.filter).toEqual({ kind: 'streamSafeMultiNumberColumnFilter', floatingFilter: true, enabled: true });
    expect(assignment.rowGrouping).toEqual({ enableRowGroup: true, aggFunc: 'sum' });
  });

  /** Style and behaviour share one assignment — writing one must not wipe the
   *  other, since users reach for them in either order. */
  it('set_column_behavior leaves styling written by set_column_style intact', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([
      {
        id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
        state: {
          'column-customization': {
            v: 1,
            data: { assignments: { quantity: { colId: 'quantity', cellStyleOverrides: { dark: { alignment: { horizontal: 'right' } } } } } },
          },
        },
      },
    ]);

    await dispatchTool('set_column_behavior', ctx, { targetGridId: 'grid-test', colId: 'quantity', sortable: false });

    const [, snapshot] = save.mock.calls[0] as [unknown, ProfileSnapshot];
    const assignment = (snapshot.state['column-customization']?.data as {
      assignments: Record<string, Record<string, unknown>>;
    }).assignments.quantity;
    expect(assignment.cellStyleOverrides).toEqual({ dark: { alignment: { horizontal: 'right' } } });
    expect(assignment.sortable).toBe(false);
  });

  /** A dangling template id writes cleanly and changes nothing on screen. */
  it('set_column_behavior refuses a template the grid does not have, naming the ones it does', async () => {
    const { ctx, list, save } = fakeCtx();
    list.mockResolvedValue([
      {
        id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
        state: { 'column-templates': { v: 1, data: { templates: { tpl_numeric: { id: 'tpl_numeric', name: 'Numeric' } } } } },
      },
    ]);

    const result = await dispatchTool('set_column_behavior', ctx, {
      targetGridId: 'grid-test', colId: 'quantity', templateId: 'tpl_missing',
    });

    expect(result.ok).toBe(false);
    expect(result.summary).toContain('tpl_numeric');
    expect(save).not.toHaveBeenCalled();
  });
  describe('column layout and row grouping', () => {
    /** Both layers must agree: the snapshot wins at runtime, but a grid that
     *  was never saved only has the per-column assignment fields. */
    function boundGrid(fake: ReturnType<typeof fakeCtx>) {
      fake.loadGridLevelData.mockResolvedValue({ provider: { liveProviderId: 'p1' } });
      fake.storeGet.mockResolvedValue({
        providerId: 'p1', name: 'feed', providerType: 'mock',
        config: {
          // Declared types matter now: a grouped/pivot view keeps the numeric
          // columns and hides the rest, so the fixture carries real ones.
          columnDefinitions: [
            { field: 'ticker', headerName: 'Ticker', cellDataType: 'text' },
            { field: 'isin', headerName: 'ISIN', cellDataType: 'text' },
            { field: 'marketValue', headerName: 'Market Value', cellDataType: 'number' },
            { field: 'issuerSector', headerName: 'Sector', cellDataType: 'text' },
          ],
        },
      });
    }

    function savedState(save: ReturnType<typeof vi.fn>, moduleId: string) {
      const call = [...save.mock.calls].reverse().find(([, snap]) => (snap as ProfileSnapshot).state[moduleId]);
      return (call?.[1] as ProfileSnapshot).state[moduleId].data as Record<string, never>;
    }

    it('set_column_layout writes the grid-state snapshot and the per-column config together', async () => {
      const fake = fakeCtx();
      boundGrid(fake);
      fake.list.mockResolvedValue([]);

      const result = await dispatchTool('set_column_layout', fake.ctx, {
        targetGridId: 'grid-test',
        order: ['ticker'],
        hide: ['isin'],
        pinLeft: ['ticker'],
        width: { marketValue: 140 },
      });

      expect(result.ok).toBe(true);
      const gridState = savedState(fake.save, 'grid-state') as unknown as { saved: { gridState: Record<string, never> } };
      expect(gridState.saved.gridState).toMatchObject({
        columnOrder: { orderedColIds: ['ticker'] },
        columnVisibility: { hiddenColIds: ['isin'] },
        columnPinning: { leftColIds: ['ticker'], rightColIds: [] },
        columnSizing: { columnSizingModel: [{ colId: 'marketValue', width: 140 }] },
      });

      const assignments = (savedState(fake.save, 'column-customization') as unknown as {
        assignments: Record<string, Record<string, unknown>>;
      }).assignments;
      expect(assignments.isin.initialHide).toBe(true);
      expect(assignments.ticker.initialPinned).toBe('left');
      expect(assignments.marketValue.initialWidth).toBe(140);
    });

    it('set_column_layout refuses a column the grid does not have', async () => {
      const fake = fakeCtx();
      boundGrid(fake);

      const result = await dispatchTool('set_column_layout', fake.ctx, {
        targetGridId: 'grid-test',
        hide: ['bidAskWidthBps'],
      });

      expect(result.ok).toBe(false);
      expect(result.summary).toContain('bidAskWidthBps');
      // The rejection answers the question rather than sending the model off
      // to get_grid_columns and back.
      expect(result.summary).toContain('ticker, isin, marketValue, issuerSector');
      expect(fake.save).not.toHaveBeenCalled();
    });

    it('set_row_grouping records nesting order and flags the grouped columns', async () => {
      const fake = fakeCtx();
      boundGrid(fake);
      fake.list.mockResolvedValue([]);

      const result = await dispatchTool('set_row_grouping', fake.ctx, {
        targetGridId: 'grid-test',
        groupBy: ['issuerSector', 'ticker'],
        aggregations: { marketValue: 'sum' },
      });

      expect(result.ok).toBe(true);
      const gridState = savedState(fake.save, 'grid-state') as unknown as { saved: { gridState: Record<string, never> } };
      expect(gridState.saved.gridState).toMatchObject({
        rowGroup: { groupColIds: ['issuerSector', 'ticker'] },
        aggregation: { aggregationModel: [{ colId: 'marketValue', aggFunc: 'sum' }] },
      });

      const assignments = (savedState(fake.save, 'column-customization') as unknown as {
        assignments: Record<string, { rowGrouping?: Record<string, unknown> }>;
      }).assignments;
      expect(assignments.issuerSector.rowGrouping).toMatchObject({ rowGroup: true, rowGroupIndex: 0 });
      expect(assignments.ticker.rowGrouping).toMatchObject({ rowGroup: true, rowGroupIndex: 1 });
      expect(assignments.marketValue.rowGrouping).toMatchObject({ aggFunc: 'sum' });
    });

    /** Re-grouping must not leave the previous grouping column still flagged. */
    it('set_row_grouping clears the previous grouping columns', async () => {
      const fake = fakeCtx();
      boundGrid(fake);
      fake.list.mockResolvedValue([
        {
          id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
          state: {
            'column-customization': {
              v: 1,
              data: { assignments: { isin: { colId: 'isin', rowGrouping: { rowGroup: true, rowGroupIndex: 0 } } } },
            },
          },
        },
      ]);

      await dispatchTool('set_row_grouping', fake.ctx, { targetGridId: 'grid-test', groupBy: ['issuerSector'] });

      const assignments = (savedState(fake.save, 'column-customization') as unknown as {
        assignments: Record<string, { rowGrouping?: Record<string, unknown> }>;
      }).assignments;
      expect(assignments.isin.rowGrouping).toMatchObject({ rowGroup: false });
      expect(assignments.issuerSector.rowGrouping).toMatchObject({ rowGroup: true, rowGroupIndex: 0 });
    });

    /**
     * The grouped view is a summary, so it shows a summary's columns. Both
     * layers have to agree or a never-saved grid and a saved one disagree
     * about what is on screen.
     */
    it('set_row_grouping hides the grouped column and the non-numeric ones, in both layers', async () => {
      const fake = fakeCtx();
      boundGrid(fake);
      fake.list.mockResolvedValue([]);

      const result = await dispatchTool('set_row_grouping', fake.ctx, {
        targetGridId: 'grid-test',
        groupBy: ['issuerSector'],
        aggregations: { marketValue: 'sum' },
      });

      expect(result.ok).toBe(true);
      const gridState = savedState(fake.save, 'grid-state') as unknown as {
        saved: { gridState: { columnVisibility?: { hiddenColIds: string[] } }; assistantAutoHiddenColIds?: string[] };
      };
      const hidden = gridState.saved.gridState.columnVisibility?.hiddenColIds ?? [];
      // The dimension column plus the text columns; the measure survives.
      expect(hidden.sort()).toEqual(['isin', 'issuerSector', 'ticker']);
      expect(hidden).not.toContain('marketValue');
      expect(gridState.saved.assistantAutoHiddenColIds?.sort()).toEqual(['isin', 'issuerSector', 'ticker']);

      const assignments = (savedState(fake.save, 'column-customization') as unknown as {
        assignments: Record<string, { initialHide?: boolean }>;
      }).assignments;
      expect(assignments.issuerSector.initialHide).toBe(true);
      expect(assignments.ticker.initialHide).toBe(true);
      expect(assignments.marketValue.initialHide).toBeUndefined();
    });

    it('set_row_grouping keeps text columns when the caller opts out', async () => {
      const fake = fakeCtx();
      boundGrid(fake);
      fake.list.mockResolvedValue([]);

      await dispatchTool('set_row_grouping', fake.ctx, {
        targetGridId: 'grid-test',
        groupBy: ['issuerSector'],
        hideNonNumeric: false,
      });

      const gridState = savedState(fake.save, 'grid-state') as unknown as {
        saved: { gridState: { columnVisibility?: { hiddenColIds: string[] } } };
      };
      // Only the dimension column goes — that part is not a preference.
      expect(gridState.saved.gridState.columnVisibility?.hiddenColIds).toEqual(['issuerSector']);
    });

    it('set_row_grouping pivots: rows, columns, measures, and pivot mode on general-settings', async () => {
      const fake = fakeCtx();
      boundGrid(fake);
      fake.list.mockResolvedValue([]);

      const result = await dispatchTool('set_row_grouping', fake.ctx, {
        targetGridId: 'grid-test',
        groupBy: ['issuerSector'],
        pivotBy: ['ticker'],
        aggregations: { marketValue: 'sum' },
      });

      expect(result.ok).toBe(true);
      const gridState = savedState(fake.save, 'grid-state') as unknown as {
        saved: { gridState: { pivot?: { pivotMode: boolean; pivotColIds: string[] } } };
      };
      expect(gridState.saved.gridState.pivot).toEqual({ pivotMode: true, pivotColIds: ['ticker'] });

      const assignments = (savedState(fake.save, 'column-customization') as unknown as {
        assignments: Record<string, { rowGrouping?: Record<string, unknown> }>;
      }).assignments;
      expect(assignments.issuerSector.rowGrouping).toMatchObject({ rowGroup: true, rowGroupIndex: 0 });
      expect(assignments.ticker.rowGrouping).toMatchObject({ pivot: true, pivotIndex: 0 });

      // The Settings drawer's toggle reads general-settings, not the snapshot —
      // writing one alone leaves the panel claiming pivot is off.
      const general = savedState(fake.save, 'general-settings') as unknown as { pivotMode?: boolean };
      expect(general.pivotMode).toBe(true);
    });

    it('set_row_grouping refuses a pivot with no row dimension or no measure', async () => {
      const fake = fakeCtx();
      boundGrid(fake);
      fake.list.mockResolvedValue([]);

      const noRows = await dispatchTool('set_row_grouping', fake.ctx, {
        targetGridId: 'grid-test', groupBy: [], pivotBy: ['ticker'], aggregations: { marketValue: 'sum' },
      });
      expect(noRows.ok).toBe(false);
      expect(noRows.summary).toContain('row group');

      const noMeasure = await dispatchTool('set_row_grouping', fake.ctx, {
        targetGridId: 'grid-test', groupBy: ['issuerSector'], pivotBy: ['ticker'],
      });
      expect(noMeasure.ok).toBe(false);
      expect(noMeasure.summary).toContain('measure');
    });

    it('flattening restores the columns the grouped view hid and clears pivot mode', async () => {
      const fake = fakeCtx();
      boundGrid(fake);
      const profile = {
        id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
        state: {
          'grid-state': {
            v: 1,
            data: {
              saved: {
                schemaVersion: 3,
                savedAt: '',
                viewportAnchor: { firstRowIndex: 0, leftColId: null, horizontalPixel: 0 },
                gridState: {
                  rowGroup: { groupColIds: ['issuerSector'] },
                  // `cusip` was hidden by the user, the rest by the grouping.
                  columnVisibility: { hiddenColIds: ['issuerSector', 'ticker', 'isin', 'cusip'] },
                },
                assistantAutoHiddenColIds: ['issuerSector', 'ticker', 'isin'],
              },
            },
          },
        },
      };
      // This handler writes three modules in sequence and each write re-reads
      // the profile, so the store has to remember the previous one — otherwise
      // the last save replays a stale grid-state over the change under test.
      fake.list.mockImplementation(async () => [profile]);
      fake.save.mockImplementation(async (_target: unknown, snapshot: ProfileSnapshot) => {
        profile.state = snapshot.state as typeof profile.state;
      });

      const result = await dispatchTool('set_row_grouping', fake.ctx, { targetGridId: 'grid-test', groupBy: [] });

      expect(result.ok).toBe(true);
      const gridState = savedState(fake.save, 'grid-state') as unknown as {
        saved: { gridState: { columnVisibility?: { hiddenColIds: string[] }; pivot?: { pivotMode: boolean } } };
      };
      // Everything the view hid is back; the hand-hidden column stays hidden.
      expect(gridState.saved.gridState.columnVisibility?.hiddenColIds).toEqual(['cusip']);
      expect(gridState.saved.gridState.pivot?.pivotMode).toBe(false);

      const assignments = (savedState(fake.save, 'column-customization') as unknown as {
        assignments: Record<string, { initialHide?: boolean }>;
      }).assignments;
      expect(assignments.ticker.initialHide).toBe(false);
      expect(assignments.issuerSector.initialHide).toBe(false);
    });

    /** A user who watches 250 columns become 3 with no explanation reads it as data loss. */
    it('reports how many columns the grouped view hid', async () => {
      const fake = fakeCtx();
      boundGrid(fake);
      fake.list.mockResolvedValue([]);

      const result = await dispatchTool('set_row_grouping', fake.ctx, {
        targetGridId: 'grid-test', groupBy: ['issuerSector'], aggregations: { marketValue: 'sum' },
      });

      expect(result.summary).toContain('3 column(s) are hidden');
      expect(result.summary).toContain('brings them back');
    });

    /**
     * Renaming and hiding are the two most common asks, and both used to mean
     * a get_grid_columns round trip for an exact colId before a one-field
     * write. These cover the shortcut: the user's own words go straight in.
     */
    describe('rename_column', () => {
      it('renames by the header the user can see', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        fake.list.mockResolvedValue([]);

        const result = await dispatchTool('rename_column', fake.ctx, {
          targetGridId: 'grid-test', column: 'Market Value', newName: 'Mkt Val',
        });

        expect(result.ok).toBe(true);
        expect(result.summary).toContain('"Market Value" → "Mkt Val"');
        const assignments = (savedState(fake.save, 'column-customization') as unknown as {
          assignments: Record<string, { headerName?: string }>;
        }).assignments;
        expect(assignments.marketValue.headerName).toBe('Mkt Val');
      });

      it('renames by a loose form of the id', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        fake.list.mockResolvedValue([]);

        await dispatchTool('rename_column', fake.ctx, {
          targetGridId: 'grid-test', column: 'market value', newName: 'MV',
        });

        const assignments = (savedState(fake.save, 'column-customization') as unknown as {
          assignments: Record<string, { headerName?: string }>;
        }).assignments;
        expect(assignments.marketValue.headerName).toBe('MV');
      });

      it('renames several in one call', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        fake.list.mockResolvedValue([]);

        const result = await dispatchTool('rename_column', fake.ctx, {
          targetGridId: 'grid-test', renames: { ISIN: 'ISIN Code', ticker: 'Symbol' },
        });

        expect(result.ok).toBe(true);
        const assignments = (savedState(fake.save, 'column-customization') as unknown as {
          assignments: Record<string, { headerName?: string }>;
        }).assignments;
        expect(assignments.isin.headerName).toBe('ISIN Code');
        expect(assignments.ticker.headerName).toBe('Symbol');
      });

      /** Once renamed, the user calls it by its NEW name — the catalogue has
       *  to see the override, not just the provider's original label. */
      it('finds a column by a name a previous rename gave it', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        fake.list.mockResolvedValue([
          {
            id: '__default__', gridId: 'grid-test', name: 'Default', createdAt: 1, updatedAt: 1,
            state: {
              'column-customization': {
                v: 1,
                data: { assignments: { marketValue: { colId: 'marketValue', headerName: 'Mkt Val' } } },
              },
            },
          },
        ]);

        const result = await dispatchTool('rename_column', fake.ctx, {
          targetGridId: 'grid-test', column: 'Mkt Val', newName: 'Notional',
        });

        expect(result.ok).toBe(true);
        const assignments = (savedState(fake.save, 'column-customization') as unknown as {
          assignments: Record<string, { headerName?: string }>;
        }).assignments;
        expect(assignments.marketValue.headerName).toBe('Notional');
      });

      it('names the near misses when no column matches', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        fake.list.mockResolvedValue([]);

        const result = await dispatchTool('rename_column', fake.ctx, {
          targetGridId: 'grid-test', column: 'issuerx', newName: 'Issuer',
        });

        expect(result.ok).toBe(false);
        expect(result.summary).toContain('issuerSector');
        expect(fake.save).not.toHaveBeenCalled();
      });

      it('rejects a call with nothing to rename', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        const result = await dispatchTool('rename_column', fake.ctx, { targetGridId: 'grid-test' });
        expect(result.ok).toBe(false);
        expect(result.summary).toContain('Nothing to rename');
      });
    });

    describe('set_column_visibility', () => {
      it('hides by header name, writing both layers', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        fake.list.mockResolvedValue([]);

        const result = await dispatchTool('set_column_visibility', fake.ctx, {
          targetGridId: 'grid-test', hide: ['ISIN'],
        });

        expect(result.ok).toBe(true);
        expect(savedState(fake.save, 'grid-state')).toMatchObject({
          saved: { gridState: { columnVisibility: { hiddenColIds: ['isin'] } } },
        });
        const assignments = (savedState(fake.save, 'column-customization') as unknown as {
          assignments: Record<string, { initialHide?: boolean }>;
        }).assignments;
        expect(assignments.isin.initialHide).toBe(true);
      });

      it('shows a column again', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        fake.list.mockResolvedValue([]);

        await dispatchTool('set_column_visibility', fake.ctx, { targetGridId: 'grid-test', show: ['isin'] });

        const assignments = (savedState(fake.save, 'column-customization') as unknown as {
          assignments: Record<string, { initialHide?: boolean }>;
        }).assignments;
        expect(assignments.isin.initialHide).toBe(false);
      });

      /** "just show me X and Y" — the user shouldn't have to enumerate the
       *  other thirty columns to get rid of them. */
      it('showOnly hides everything the user did not name', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        fake.list.mockResolvedValue([]);

        const result = await dispatchTool('set_column_visibility', fake.ctx, {
          targetGridId: 'grid-test', showOnly: ['Ticker', 'Market Value'],
        });

        expect(result.ok).toBe(true);
        const assignments = (savedState(fake.save, 'column-customization') as unknown as {
          assignments: Record<string, { initialHide?: boolean }>;
        }).assignments;
        expect(assignments.ticker.initialHide).toBe(false);
        expect(assignments.marketValue.initialHide).toBe(false);
        expect(assignments.isin.initialHide).toBe(true);
        expect(assignments.issuerSector.initialHide).toBe(true);
      });

      it('refuses showOnly combined with hide or show', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        const result = await dispatchTool('set_column_visibility', fake.ctx, {
          targetGridId: 'grid-test', showOnly: ['ticker'], hide: ['isin'],
        });
        expect(result.ok).toBe(false);
        expect(result.summary).toContain('on its own');
      });

      /** With no catalogue there is no "everything else" to hide, and a silent
       *  degrade to a plain `show` would leave the grid exactly as it was. */
      it('refuses showOnly when the grid has no provider to enumerate', async () => {
        const fake = fakeCtx();
        fake.list.mockResolvedValue([]);
        const result = await dispatchTool('set_column_visibility', fake.ctx, {
          targetGridId: 'grid-test', showOnly: ['ticker'],
        });
        expect(result.ok).toBe(false);
        expect(result.summary).toContain('no data provider bound');
        expect(fake.save).not.toHaveBeenCalled();
      });

      it('rejects a column listed in both hide and show', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        const result = await dispatchTool('set_column_visibility', fake.ctx, {
          targetGridId: 'grid-test', hide: ['isin'], show: ['ISIN'],
        });
        expect(result.ok).toBe(false);
        expect(result.summary).toContain('both hide and show');
      });

      it('rejects a call with nothing to change', async () => {
        const fake = fakeCtx();
        boundGrid(fake);
        const result = await dispatchTool('set_column_visibility', fake.ctx, { targetGridId: 'grid-test' });
        expect(result.ok).toBe(false);
        expect(result.summary).toContain('Nothing to change');
      });
    });

    /** The resolver is wired into every column tool, not only the new ones. */
    it('set_column_style takes a header name too', async () => {
      const fake = fakeCtx();
      boundGrid(fake);
      fake.list.mockResolvedValue([]);

      const result = await dispatchTool('set_column_style', fake.ctx, {
        targetGridId: 'grid-test', colId: 'Market Value', align: 'right',
      });

      expect(result.ok).toBe(true);
      const assignments = (savedState(fake.save, 'column-customization') as unknown as {
        assignments: Record<string, unknown>;
      }).assignments;
      expect(Object.keys(assignments)).toEqual(['marketValue']);
    });

    it('set_row_grouping takes a header name too', async () => {
      const fake = fakeCtx();
      boundGrid(fake);
      fake.list.mockResolvedValue([]);

      const result = await dispatchTool('set_row_grouping', fake.ctx, {
        targetGridId: 'grid-test', groupBy: ['Sector'],
      });

      expect(result.ok).toBe(true);
      expect(result.summary).toContain('issuerSector');
    });
  });


  it('set_column_style rejects a call with no target columns and one with no style to apply', async () => {
    const { ctx, save } = fakeCtx();

    const noTarget = await dispatchTool('set_column_style', ctx, { targetGridId: 'grid-test', align: 'right' });
    expect(noTarget.ok).toBe(false);
    expect(noTarget.summary).toContain('colId');

    const noStyle = await dispatchTool('set_column_style', ctx, { targetGridId: 'grid-test', colId: 'ticker' });
    expect(noStyle.ok).toBe(false);
    expect(noStyle.summary).toContain('align');

    expect(save).not.toHaveBeenCalled();
  });
});
