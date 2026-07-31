/**
 * useAutoFormatAction — the "Auto Format" behaviour, extracted from
 * {@link AutoFormatButton} so both the standalone button and the View-menu
 * item can drive it.
 *
 * Reads every column from the live grid, matches each field against the
 * FI/equity field-format catalog (`buildAutoFormatPlan`), and applies the
 * resolved NATIVE formatting in ONE profile-persisted state update (overwrite
 * mode). Self-contained: reaches the live `GridApi` + module store through the
 * platform context, and no-ops harmlessly when mounted outside a
 * `<GridProvider>`.
 */
import { useCallback, useEffect, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import {
  applyAutoFormatPlanReducer,
  buildAutoFormatPlan,
  type AutoFormatColumn,
  type ColumnCustomizationState,
} from '@wellsfargo-starui/engine';
import { useOptionalGridPlatform } from '../customizer/hooks/GridProvider';
import { useFlashConfirm } from './formattingToolbarHooks';

function readColumns(api: GridApi): AutoFormatColumn[] {
  const out: AutoFormatColumn[] = [];
  for (const col of api.getColumns() ?? []) {
    const colId = col.getColId();
    if (!colId) continue;
    const def = col.getColDef();
    out.push({
      colId,
      // colId equals the field path for dotted/nested columns
      // (buildColumnDefs sets `colId = def.colId ?? field`), so colId is a
      // safe fallback when `field` isn't a plain string.
      field: typeof def.field === 'string' ? def.field : colId,
      headerName: typeof def.headerName === 'string' ? def.headerName : undefined,
      cellDataType: typeof def.cellDataType === 'string' ? def.cellDataType : undefined,
    });
  }
  return out;
}

export interface AutoFormatAction {
  /** Apply the auto-format plan to every matched column. No-op until ready. */
  readonly run: () => void;
  /** True for ~the flash window after a successful apply. */
  readonly confirmed: boolean;
  /** True once the grid api is live and the action can do something. */
  readonly available: boolean;
}

export function useAutoFormatAction(): AutoFormatAction {
  const platform = useOptionalGridPlatform();
  const [api, setApi] = useState<GridApi | null>(platform?.api.api ?? null);
  const [confirmed, flash] = useFlashConfirm();

  useEffect(() => {
    if (!platform) return;
    return platform.api.onReady((a) => setApi(a));
  }, [platform]);

  const run = useCallback(() => {
    if (!platform || !api) return;
    const plan = buildAutoFormatPlan(readColumns(api));
    if (Object.keys(plan).length === 0) return;
    // Overwrite mode: re-applies the catalog to ALL matched columns, replacing
    // any prior formatting. Users override individual columns afterward via the
    // formatter toolbar (those edits win until Auto Format runs again).
    platform.store.setModuleState<ColumnCustomizationState>(
      'column-customization',
      applyAutoFormatPlanReducer(plan, { onlyUnstyled: false }),
    );
    flash();
  }, [platform, api, flash]);

  return { run, confirmed, available: Boolean(platform && api) };
}
