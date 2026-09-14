/**
 * The active provider for {@link BlotterHost}: which provider the selection
 * + mode point at, its catalog row and resolved config, the row-id field(s)
 * and the AG Grid column definitions derived from it. Pure derivation over
 * the data hooks; the state machine reads the result as facts.
 */
import { useEffect, useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import { isSsrmProviderType } from '@wellsfargo-starui/types';
import {
  useDataProviderConfig,
  useDataProvidersList,
  useResolvedCfg,
} from '@wellsfargo-starui/react/data/runtime';
import { buildColumnDefs } from '../../container/markets-grid-container/buildColumnDefs.js';
import type { ProviderSelection } from '../../container/markets-grid-container/gridLevelState.js';

export interface BlotterActiveProviderArgs {
  gridId: string;
  selection: ProviderSelection;
  onRowIdFieldChange?: (rowIdField: string | readonly string[] | null) => void;
}

export interface BlotterActiveProvider<TData> {
  activeId: string | null;
  /** Catalog row state: `loading` / `cfg` / `error` as the config hook reports them. */
  row: ReturnType<typeof useDataProviderConfig>;
  /** Resolved config (template refs substituted), or `null`. */
  cfg: Record<string, unknown> | null;
  /** The raw catalog config, for hub audits. */
  rawCfg: unknown;
  providerName: string | null;
  isSsrm: boolean;
  rowIdField: string | readonly string[] | null;
  /** Stable string form of `rowIdField` (arrays joined with `:`). */
  rowIdFieldKey: string | null;
  columnDefs: ColDef<TData>[] | null;
  /** Every provider in the catalog — the pickers' options. */
  providers: ReturnType<typeof useDataProvidersList>['configs'];
}

export function useBlotterActiveProvider<TData>(args: BlotterActiveProviderArgs): BlotterActiveProvider<TData> {
  const { gridId, selection, onRowIdFieldChange } = args;
  const activeId = selection.mode === 'live' ? selection.liveProviderId : selection.historicalProviderId;
  const row = useDataProviderConfig(activeId);
  const cfg = useResolvedCfg(row.cfg?.config ?? null) as Record<string, unknown> | null;
  // One catalog fetch + subscription serves both pickers.
  const providersList = useDataProvidersList();

  const providerName = row.cfg?.name ?? null;
  useEffect(() => {
    if (row.loading) return;
    console.log('[blotter-host] gridId=%s mode=%s providerId=%s providerName=%s', gridId, selection.mode, activeId ?? '(none)', providerName ?? '(none)');
  }, [gridId, selection.mode, activeId, providerName, row.loading]);

  // `keyColumn` is one column name or an array (composite key, joined with `-`
  // by composeRowId); the raw shape reaches MarketsGrid untouched.
  const rowIdField = row.cfg ? ((cfg as { keyColumn?: string | readonly string[] } | null)?.keyColumn ?? null) : null;
  const rowIdFieldKey = Array.isArray(rowIdField) ? rowIdField.join(':') : (rowIdField as string | null);

  useEffect(() => {
    onRowIdFieldChange?.(rowIdField);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRowIdFieldChange, rowIdFieldKey]);

  const columnDefs = useMemo<ColDef<TData>[] | null>(
    () => buildColumnDefs<TData>((cfg as { columnDefinitions?: ColDef<TData>[] } | null)?.columnDefinitions),
    [cfg],
  );

  return {
    activeId,
    row,
    cfg,
    rawCfg: row.cfg?.config,
    providerName,
    isSsrm: isSsrmProviderType((cfg as { providerType?: string } | null)?.providerType),
    rowIdField,
    rowIdFieldKey,
    columnDefs,
    providers: providersList.configs,
  };
}
