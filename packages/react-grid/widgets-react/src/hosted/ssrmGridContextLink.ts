/**
 * SSRM-aware colour-link publishing. CSRM's builder reads everything from
 * loaded row nodes; under SSRM a selected group's descendants may not be
 * loaded (`allLeafChildren` empty) and select-all reports
 * `{ selectAll, toggledNodes }` with `getSelectedNodes()` unusable. Both
 * cases resolve through the worker's group-scoped set-filter values, so the
 * broadcast carries the exact leaf keys — identical wire shape to CSRM.
 */
import type { GridApi, IRowNode } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import {
  GRID_LINK_CONTEXT_TYPE,
  type GridLinkSelectionBuilder,
} from './gridContextLink.js';

export interface SsrmSelectionBuilderDeps {
  provider: Pick<ISsrmDataProvider, 'getSetFilterValues'>;
  keyColumn: string;
  /** Current quick-filter text, if the surface has one. */
  getQuickFilterText?: () => string;
}

interface SsrmSelectAllState {
  selectAll: boolean;
  toggledNodes: string[];
}

function rowGroupColsOf(api: GridApi): Array<{ field: string }> {
  const cols =
    (api as unknown as {
      getRowGroupColumns?: () => Array<{ getColDef(): { field?: string } }>;
    }).getRowGroupColumns?.() ?? [];
  return cols
    .map((c) => ({ field: c.getColDef().field ?? '' }))
    .filter((c) => c.field);
}

export function createSsrmSelectionContextBuilder(
  deps: SsrmSelectionBuilderDeps,
): GridLinkSelectionBuilder {
  const { provider, keyColumn, getQuickFilterText } = deps;

  return async (api, opts) => {
    const quickFilterText = getQuickFilterText?.() ?? '';
    const filterModel = (api.getFilterModel() ?? {}) as Record<string, unknown>;
    const values = new Set<string>();

    const fetchKeys = (
      groupKeys: string[],
      rowGroupCols: Array<{ field: string }>,
    ) =>
      provider.getSetFilterValues({
        column: keyColumn,
        filterModel,
        quickFilterText,
        groupKeys,
        rowGroupCols,
      });

    const selectionState =
      (api as unknown as {
        getServerSideSelectionState?: () => SsrmSelectAllState | null;
      }).getServerSideSelectionState?.() ?? null;

    if (selectionState?.selectAll) {
      // Whole current query, minus explicitly deselected rows.
      const toggled = new Set(selectionState.toggledNodes ?? []);
      for (const v of await fetchKeys([], [])) {
        if (!toggled.has(v)) values.add(v);
      }
    } else {
      for (const node of api.getSelectedNodes() as IRowNode[]) {
        if (node.group) {
          const route =
            (node as unknown as { getRoute?: () => string[] | undefined })
              .getRoute?.() ?? [];
          for (const v of await fetchKeys(route, rowGroupColsOf(api))) {
            values.add(v);
          }
          continue;
        }
        const data = node.data as Record<string, unknown> | undefined;
        for (const field of opts.rowIdField) {
          const v = data?.[field];
          if (v !== undefined && v !== null) values.add(String(v));
        }
      }
    }

    return {
      type: GRID_LINK_CONTEXT_TYPE,
      source: opts.instanceId,
      criteria: values.size > 0 ? { [keyColumn]: [...values] } : {},
    };
  };
}
