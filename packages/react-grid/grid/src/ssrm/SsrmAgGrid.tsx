import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  GridApi,
  GridReadyEvent,
  GridOptions,
  Module,
} from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { ensureAgGridModules } from '../widget/ensureAgGridModules.js';
import { bindSsrmTicks } from './bindSsrmTicks.js';
import { createSsrmDatasource } from './createSsrmDatasource.js';
import { createSsrmStatusBar } from './createSsrmStatusBar.js';
import { ssrmAlertRowClass, ssrmGetChildCount } from './expressionBindings.js';
import { ssrmGetRowId } from './ssrmGetRowId.js';

/** AG Grid 35+: pass modules to the grid instance (plus global registry). */
const SSRM_AG_GRID_MODULES: Module[] = [AllEnterpriseModule];

/**
 * Grid options SSRM owns. `gridOptions` is spread onto the grid, so a caller
 * key here would silently break the data path rather than customise it:
 * `onGridReady` installs the datasource and the tick subscription, `getRowId`
 * is the identity `applyServerSideTransaction` matches ticks on, and
 * `rowModelType` / `serverSideDatasource` define the model itself.
 *
 * `onGridReady` is chained rather than dropped — callers still get their call.
 */
const SSRM_OWNED_GRID_OPTIONS = [
  'rowModelType',
  'serverSideDatasource',
  'getRowId',
  'onGridReady',
  'context',
  'modules',
] as const;

function withoutOwnedOptions<TData>(
  gridOptions: Partial<GridOptions<TData>> | undefined,
): Partial<GridOptions<TData>> | undefined {
  if (!gridOptions) return undefined;
  const rest: Record<string, unknown> = { ...gridOptions };
  for (const key of SSRM_OWNED_GRID_OPTIONS) delete rest[key];
  return rest as Partial<GridOptions<TData>>;
}

export interface SsrmAgGridProps<TData = Record<string, unknown>> {
  provider: ISsrmDataProvider;
  columnDefs: ColDef<TData>[];
  defaultColDef?: ColDef<TData>;
  keyColumn?: string;
  getQuickFilterText?: () => string;
  theme?: GridOptions['theme'];
  sideBar?: GridOptions['sideBar'];
  style?: CSSProperties;
  className?: string;
  /** Extra grid options merged after SSRM defaults. */
  gridOptions?: Partial<GridOptions<TData>>;
  onGridReady?: (event: GridReadyEvent<TData>) => void;
}

/**
 * Thin AG Grid SSRM shell — no `rowData`. Datasource + ticks bind to
 * {@link ISsrmDataProvider}.
 */
function SsrmAgGridInner<TData extends Record<string, unknown>>(
  props: SsrmAgGridProps<TData>,
) {
  // AllEnterpriseModule includes ServerSideRowModelModule (AG Grid 33+).
  ensureAgGridModules();

  const {
    provider,
    columnDefs,
    defaultColDef,
    keyColumn = 'id',
    getQuickFilterText,
    theme,
    sideBar,
    style,
    className,
    gridOptions,
    onGridReady: onGridReadyProp,
  } = props;

  const cacheBlockSize = useMemo(() => {
    try {
      const cfg = provider.getConfig() as { blockSize?: number };
      const n = cfg.blockSize;
      return typeof n === 'number' && n >= 20 ? n : 100;
    } catch {
      return 100;
    }
  }, [provider]);

  const apiRef = useRef<GridApi<TData> | null>(null);
  const unbindRef = useRef<(() => void) | null>(null);

  const statusPack = useMemo(
    () =>
      createSsrmStatusBar({
        provider,
        getQuickFilterText,
      }),
    [provider, getQuickFilterText],
  );

  const mergedDefaultColDef = useMemo(
    () => ({
      sortable: true,
      resizable: true,
      filter: true,
      enableCellChangeFlash: true,
      ...defaultColDef,
    }),
    [defaultColDef],
  );

  const onGridReady = useCallback(
    (e: GridReadyEvent<TData>) => {
      apiRef.current = e.api;
      e.api.setGridOption(
        'serverSideDatasource',
        createSsrmDatasource(provider, {
          keyColumn,
          getQuickFilterText,
        }),
      );
      unbindRef.current?.();
      unbindRef.current = bindSsrmTicks(provider, e.api, {
        keyColumn,
        flash: false,
        getQuickFilterText,
      });
      onGridReadyProp?.(e);
      gridOptions?.onGridReady?.(e);
    },
    [provider, keyColumn, getQuickFilterText, onGridReadyProp, gridOptions],
  );

  const callerGridOptions = useMemo(
    () => withoutOwnedOptions(gridOptions),
    [gridOptions],
  );

  useEffect(() => {
    return () => {
      unbindRef.current?.();
      unbindRef.current = null;
      apiRef.current = null;
    };
  }, []);

  return (
    <div className={className} style={{ height: '100%', width: '100%', ...style }}>
      <AgGridReact<TData>
        theme={theme}
        columnDefs={columnDefs}
        defaultColDef={mergedDefaultColDef}
        rowModelType="serverSide"
        cacheBlockSize={cacheBlockSize}
        maxBlocksInCache={20}
        getChildCount={ssrmGetChildCount}
        getRowClass={ssrmAlertRowClass}
        getRowId={(p) => ssrmGetRowId(p.data, keyColumn)}
        sideBar={sideBar}
        statusBar={statusPack.statusBar}
        context={{ ...statusPack.context, ...(gridOptions?.context as object) }}
        rowSelection={{ mode: 'multiRow', checkboxes: true, headerCheckbox: true }}
        onGridReady={onGridReady}
        // SSRM-owned keys are stripped (see SSRM_OWNED_GRID_OPTIONS) so a
        // caller cannot silently detach the datasource or the tick binding.
        {...callerGridOptions}
        // After gridOptions so callers cannot strip SSRM enterprise modules.
        // https://www.ag-grid.com/react-data-grid/modules/
        modules={SSRM_AG_GRID_MODULES}
      />
    </div>
  );
}

export const SsrmAgGrid = memo(SsrmAgGridInner) as typeof SsrmAgGridInner;
