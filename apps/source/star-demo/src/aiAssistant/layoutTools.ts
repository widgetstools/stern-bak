/**
 * Column layout (order / visibility / pinning / width) and row grouping.
 *
 * Both handlers write TWO layers — the `grid-state` snapshot that wins at
 * runtime and the per-column `column-customization` fields that are all a
 * never-saved grid has. See `gridLayout.ts` for why one alone is a coin flip.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
import { patchGridModule, describeFanOut, resolveGridEntry } from './gridProfiles';
import { readColumnCatalogue, resolveColumns, resolveColumnKeys, isNumericColumn } from './columnResolver';
import {
  normalizeColumnLayoutArgs,
  normalizeRowGroupingArgs,
  normalizeSortArgs,
  normalizeGroupExpansionArgs,
  applyColumnLayout,
  applyRowGrouping,
  planGroupedVisibility,
  withGridStateSlices,
  type ColumnLayoutArgs,
  type SavedGridStateEnvelope,
} from './gridLayout';
import type { ToolExecutionResult } from './toolResult';

/**
 * Rewrites every column name in a layout patch to its real colId, so the model
 * can say "Market Value" where the config keys on `marketValue`.
 */
async function resolveLayoutColumns(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  entry: RegistryEntry,
  patch: ColumnLayoutArgs,
): Promise<{ ok: true; value: Partial<ColumnLayoutArgs> } | { ok: false; error: string }> {
  const catalogue = await readColumnCatalogue(configManager, configStore, entry);
  const value: Partial<ColumnLayoutArgs> = {};
  for (const field of ['order', 'hide', 'show', 'pinLeft', 'pinRight', 'unpin'] as const) {
    const list = patch[field];
    if (!list) continue;
    const res = resolveColumns(list, catalogue);
    if (!res.ok) return res;
    value[field] = res.colIds;
  }
  if (patch.width) {
    const res = resolveColumnKeys(patch.width, catalogue);
    if (!res.ok) return res;
    value.width = res.value;
  }
  return { ok: true, value };
}

/**
 * The two-layer write both `set_column_layout` and `set_column_visibility` do:
 * the `grid-state` snapshot that wins at runtime, mirrored into the per-column
 * fields that are all a never-saved grid has.
 */
export async function writeColumnLayout(
  configManager: ConfigManager,
  entry: RegistryEntry,
  patch: ColumnLayoutArgs,
): Promise<Awaited<ReturnType<typeof patchGridModule>>> {
  const now = new Date().toISOString();
  const fan = await patchGridModule(configManager, entry, 'grid-state', (prev) => {
    const prevSaved = (prev as { saved?: SavedGridStateEnvelope } | undefined)?.saved ?? null;
    return { saved: withGridStateSlices(prevSaved, applyColumnLayout(prevSaved?.gridState ?? {}, patch), now) };
  });

  await patchGridModule(configManager, entry, 'column-customization', (prev) => {
    const prevState = (prev as { assignments?: Record<string, Record<string, unknown>> } | undefined) ?? {};
    const assignments = { ...prevState.assignments };
    const touch = (colId: string, fields: Record<string, unknown>) => {
      assignments[colId] = { ...(assignments[colId] ?? { colId }), colId, ...fields };
    };
    for (const colId of patch.hide ?? []) touch(colId, { initialHide: true });
    for (const colId of patch.show ?? []) touch(colId, { initialHide: false });
    for (const colId of patch.pinLeft ?? []) touch(colId, { initialPinned: 'left' });
    for (const colId of patch.pinRight ?? []) touch(colId, { initialPinned: 'right' });
    for (const colId of patch.unpin ?? []) touch(colId, { initialPinned: false });
    for (const [colId, width] of Object.entries(patch.width ?? {})) touch(colId, { initialWidth: width });
    return { ...prevState, assignments };
  });

  return fan;
}

export async function setColumnLayout(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const parsed = normalizeColumnLayoutArgs(args);
  if (!parsed.ok) return { ok: false, summary: parsed.error };
  const patch = parsed.value;

  const resolved = await resolveLayoutColumns(configManager, configStore, entry, patch);
  if (!resolved.ok) return { ok: false, summary: resolved.error };
  Object.assign(patch, resolved.value);

  const fan = await writeColumnLayout(configManager, entry, patch);

  const parts: string[] = [];
  if (patch.order) parts.push(`reordered (${patch.order.slice(0, 4).join(', ')}${patch.order.length > 4 ? '…' : ''} first)`);
  if (patch.hide) parts.push(`hid ${patch.hide.join(', ')}`);
  if (patch.show) parts.push(`showed ${patch.show.join(', ')}`);
  if (patch.pinLeft) parts.push(`pinned left: ${patch.pinLeft.join(', ')}`);
  if (patch.pinRight) parts.push(`pinned right: ${patch.pinRight.join(', ')}`);
  if (patch.unpin) parts.push(`unpinned ${patch.unpin.join(', ')}`);
  if (patch.width) parts.push(`resized ${Object.keys(patch.width).join(', ')}`);
  return { ok: true, summary: `"${entry.displayName}"${describeFanOut(fan)}: ${parts.join('; ')}.` };
}

/**
 * Sort, filters and row-group expansion all live in the `grid-state`
 * snapshot and reach the live grid the same way: the scoped module sync
 * re-applies the snapshot through `api.setState` (see the grid-state
 * module's `module:stateChanged` listener). Unlike column layout there is no
 * second `column-customization` layer to mirror into — AG-Grid owns sort and
 * filter state natively, and `column-customization` has nowhere to put it.
 */
async function writeGridStateSlice(
  configManager: ConfigManager,
  entry: RegistryEntry,
  patch: Record<string, unknown>,
): Promise<Awaited<ReturnType<typeof patchGridModule>>> {
  const now = new Date().toISOString();
  return patchGridModule(configManager, entry, 'grid-state', (prev) => {
    const prevSaved = (prev as { saved?: SavedGridStateEnvelope } | undefined)?.saved ?? null;
    return { saved: withGridStateSlices(prevSaved, patch, now) };
  });
}

/** "Sort by market value descending", "sort by desk then maturity". */
export async function setSort(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const parsed = normalizeSortArgs(args);
  if (!parsed.ok) return { ok: false, summary: parsed.error };

  // Resolve the user's words to real colIds, same as every other column tool.
  const catalogue = await readColumnCatalogue(configManager, configStore, entry);
  const resolved = resolveColumns(parsed.value.sortModel.map((s) => s.colId), catalogue);
  if (!resolved.ok) return { ok: false, summary: resolved.error };
  const sortModel = parsed.value.sortModel.map((s, i) => ({ colId: resolved.colIds[i], sort: s.sort }));

  const fan = await writeGridStateSlice(configManager, entry, { sort: { sortModel } });
  const label = sortModel.length === 0
    ? 'cleared sorting'
    : `sorted by ${sortModel.map((s) => `${s.colId} ${s.sort}`).join(', then ')}`;
  return { ok: true, summary: `"${entry.displayName}"${describeFanOut(fan)}: ${label}.` };
}

/**
 * The column filter model — the same shape a saved-filter pill carries, so a
 * filter authored here can be lifted straight into one.
 */
export async function setFilterModel(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const raw = args.filterModel;
  if (args.clear !== true && (typeof raw !== 'object' || raw === null || Array.isArray(raw))) {
    return {
      ok: false,
      summary:
        'filterModel must be an AG-Grid filter model keyed by column id, e.g. ' +
        '{ "assetClass": { "filterType": "set", "values": ["Rates"] } }. Pass clear: true to remove all filters.',
    };
  }
  const filterModel = args.clear === true ? {} : (raw as Record<string, unknown>);

  const fan = await writeGridStateSlice(configManager, entry, { filter: { filterModel } });
  const cols = Object.keys(filterModel);
  const label = cols.length === 0 ? 'cleared all column filters' : `filtered on ${cols.join(', ')}`;
  return { ok: true, summary: `"${entry.displayName}"${describeFanOut(fan)}: ${label}.` };
}

/** Free-text search across every column — the grid's own quick filter. */
export async function setQuickFilter(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const text = args.text;
  if (text !== undefined && typeof text !== 'string') {
    return { ok: false, summary: 'text must be a string; omit it (or pass "") to clear the quick filter.' };
  }
  const quickFilter = typeof text === 'string' ? text : '';

  // quickFilter is a sibling of gridState in the envelope, not a state slice.
  const now = new Date().toISOString();
  const fan = await patchGridModule(configManager, entry, 'grid-state', (prev) => {
    const prevSaved = (prev as { saved?: SavedGridStateEnvelope } | undefined)?.saved ?? null;
    return { saved: { ...withGridStateSlices(prevSaved, {}, now), quickFilter } };
  });
  const label = quickFilter ? `quick filter set to "${quickFilter}"` : 'cleared the quick filter';
  return { ok: true, summary: `"${entry.displayName}"${describeFanOut(fan)}: ${label}.` };
}

/**
 * Expand / collapse row groups. Two mechanisms, deliberately behind one tool
 * so the model doesn't have to know which is which — see
 * `normalizeGroupExpansionArgs`.
 */
export async function setGroupExpansion(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const parsed = normalizeGroupExpansionArgs(args);
  if (!parsed.ok) return { ok: false, summary: parsed.error };
  const { expandedRowGroupIds, groupDefaultExpanded } = parsed.value;

  const fan = await writeGridStateSlice(configManager, entry, {
    rowGroupExpansion: { expandedRowGroupIds },
  });

  // expand-all / collapse-all is a general-settings default, not a snapshot —
  // it keeps applying to groups that don't exist yet, which is what "expand
  // all" has to mean on a streaming blotter.
  if (groupDefaultExpanded !== undefined) {
    await patchGridModule(configManager, entry, 'general-settings', (prev) => ({
      ...(prev as Record<string, unknown> | undefined),
      groupDefaultExpanded,
    }));
  }

  const label =
    groupDefaultExpanded === -1
      ? 'expanded every row group'
      : groupDefaultExpanded === 0
        ? 'collapsed every row group'
        : `expanded ${expandedRowGroupIds.length} row group(s)`;
  return { ok: true, summary: `"${entry.displayName}"${describeFanOut(fan)}: ${label}.` };
}

/**
 * Row grouping — rolling ROWS up under one or more columns, which is a
 * different feature from column groups (nested header bands).
 */
export async function setRowGrouping(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const parsed = normalizeRowGroupingArgs(args);
  if (!parsed.ok) return { ok: false, summary: parsed.error };
  const patch = parsed.value;

  const catalogue = await readColumnCatalogue(configManager, configStore, entry);
  const groupBy = resolveColumns(patch.groupBy, catalogue);
  if (!groupBy.ok) return { ok: false, summary: groupBy.error };
  patch.groupBy = groupBy.colIds;
  if (patch.pivotBy?.length) {
    const pivotBy = resolveColumns(patch.pivotBy, catalogue);
    if (!pivotBy.ok) return { ok: false, summary: pivotBy.error };
    patch.pivotBy = pivotBy.colIds;
  }
  if (patch.aggregations) {
    const aggregations = resolveColumnKeys(patch.aggregations, catalogue);
    if (!aggregations.ok) return { ok: false, summary: aggregations.error };
    patch.aggregations = aggregations.value;
  }

  const columns = catalogue.map((c) => ({ colId: c.colId, numeric: isNumericColumn(c) }));

  const now = new Date().toISOString();
  let plan = { hiddenColIds: [] as string[], autoHiddenColIds: [] as string[] };
  // Columns the PREVIOUS grouped view hid, across every row this call patches.
  // Their `initialHide` has to be cleared when this view no longer hides them.
  const previouslyAutoHidden = new Set<string>();
  const fan = await patchGridModule(configManager, entry, 'grid-state', (prev) => {
    const prevSaved = (prev as { saved?: SavedGridStateEnvelope } | undefined)?.saved ?? null;
    for (const colId of prevSaved?.assistantAutoHiddenColIds ?? []) previouslyAutoHidden.add(colId);
    // Planned per instance: each window carries its own hidden set, and the
    // auto-hidden bookkeeping has to be released against ITS previous view.
    plan = planGroupedVisibility(patch, {
      columns,
      previouslyHidden: prevSaved?.gridState?.columnVisibility?.hiddenColIds ?? [],
      previouslyAutoHidden: prevSaved?.assistantAutoHiddenColIds ?? [],
    });
    return {
      saved: {
        ...withGridStateSlices(prevSaved, applyRowGrouping(prevSaved?.gridState ?? {}, patch, plan), now),
        assistantAutoHiddenColIds: plan.autoHiddenColIds,
      },
    };
  });

  // Pivot mode also lives on general-settings, which is what the Settings
  // drawer's toggle reads. Writing only the snapshot leaves the panel claiming
  // pivot is off while the grid is pivoting.
  await patchGridModule(configManager, entry, 'general-settings', (prev) => ({
    ...((prev as Record<string, unknown> | undefined) ?? {}),
    pivotMode: patch.pivotMode === true,
  }));

  await patchGridModule(configManager, entry, 'column-customization', (prev) => {
    const prevState = (prev as { assignments?: Record<string, Record<string, unknown>> } | undefined) ?? {};
    const assignments = { ...prevState.assignments };
    // Drop grouping AND pivoting from every column first so a re-group doesn't
    // leave the previous dimension columns still flagged.
    for (const [colId, assignment] of Object.entries(assignments)) {
      const rowGrouping = assignment.rowGrouping as Record<string, unknown> | undefined;
      if (rowGrouping?.rowGroup || rowGrouping?.pivot) {
        assignments[colId] = {
          ...assignment,
          rowGrouping: { ...rowGrouping, rowGroup: false, rowGroupIndex: undefined, pivot: false, pivotIndex: undefined },
        };
      }
    }
    patch.groupBy.forEach((colId, index) => {
      const existing = assignments[colId] ?? { colId };
      assignments[colId] = {
        ...existing,
        colId,
        rowGrouping: { ...((existing.rowGrouping as object) ?? {}), rowGroup: true, rowGroupIndex: index },
      };
    });
    (patch.pivotBy ?? []).forEach((colId, index) => {
      const existing = assignments[colId] ?? { colId };
      assignments[colId] = {
        ...existing,
        colId,
        rowGrouping: { ...((existing.rowGrouping as object) ?? {}), pivot: true, pivotIndex: index },
      };
    });
    for (const [colId, aggFunc] of Object.entries(patch.aggregations ?? {})) {
      const existing = assignments[colId] ?? { colId };
      assignments[colId] = {
        ...existing,
        colId,
        rowGrouping: { ...((existing.rowGrouping as object) ?? {}), aggFunc },
      };
    }

    // Mirror the snapshot's visibility onto `initialHide`, the only layer a
    // never-saved grid reads. Only columns this view hides, plus the ones the
    // PREVIOUS view hid and this one doesn't, are touched — so a column the
    // user hid by hand keeps its `initialHide` either way.
    const autoHidden = new Set(plan.autoHiddenColIds);
    for (const colId of new Set([...autoHidden, ...previouslyAutoHidden])) {
      const existing = assignments[colId];
      assignments[colId] = { ...(existing ?? { colId }), colId, initialHide: autoHidden.has(colId) };
    }
    return { ...prevState, assignments };
  });

  const aggNote = Object.keys(patch.aggregations ?? {}).length
    ? `, aggregating ${Object.entries(patch.aggregations ?? {}).map(([c, f]) => `${c}=${f}`).join(', ')}`
    : '';
  const where = `"${entry.displayName}"${describeFanOut(fan)}`;

  if (!patch.groupBy.length && patch.pivotMode !== true) {
    const restored = previouslyAutoHidden.size;
    return {
      ok: true,
      summary:
        `${where}: row grouping and pivot cleared` +
        (restored > 0 ? `, and the ${restored} column(s) the grouped view had hidden are back` : '') +
        '.',
    };
  }

  // The hiding is a visible side effect, so it is reported rather than left for
  // the user to discover as "where did my columns go?".
  const hiddenNote = plan.autoHiddenColIds.length
    ? ` ${plan.autoHiddenColIds.length} column(s) are hidden while this view is on — the ` +
      `${patch.groupBy.length + (patch.pivotBy?.length ?? 0)} dimension column(s), which now read from the group ` +
      'and pivot headers' +
      (patch.hideNonNumeric === false ? '' : ', plus the non-numeric ones, which have nothing to aggregate') +
      '. Clearing the grouping brings them back.'
    : '';

  return {
    ok: true,
    summary: patch.pivotMode === true
      ? `${where}: pivoting — rows by ${patch.groupBy.join(' > ')}, columns by ${(patch.pivotBy ?? []).join(' > ')}${aggNote}.${hiddenNote}`
      : `${where}: rows grouped by ${patch.groupBy.join(' > ')}${aggNote}.${hiddenNote}`,
  };
}
