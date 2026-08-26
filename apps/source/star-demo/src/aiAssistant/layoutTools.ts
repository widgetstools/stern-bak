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
import { readColumnCatalogue, resolveColumns, resolveColumnKeys } from './columnResolver';
import {
  normalizeColumnLayoutArgs,
  normalizeRowGroupingArgs,
  applyColumnLayout,
  applyRowGrouping,
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
  if (patch.aggregations) {
    const aggregations = resolveColumnKeys(patch.aggregations, catalogue);
    if (!aggregations.ok) return { ok: false, summary: aggregations.error };
    patch.aggregations = aggregations.value;
  }

  const now = new Date().toISOString();
  const fan = await patchGridModule(configManager, entry, 'grid-state', (prev) => {
    const prevSaved = (prev as { saved?: SavedGridStateEnvelope } | undefined)?.saved ?? null;
    return { saved: withGridStateSlices(prevSaved, applyRowGrouping(prevSaved?.gridState ?? {}, patch), now) };
  });

  await patchGridModule(configManager, entry, 'column-customization', (prev) => {
    const prevState = (prev as { assignments?: Record<string, Record<string, unknown>> } | undefined) ?? {};
    const assignments = { ...prevState.assignments };
    // Drop grouping from every column first so a re-group doesn't leave the
    // previous grouping columns still flagged.
    for (const [colId, assignment] of Object.entries(assignments)) {
      const rowGrouping = assignment.rowGrouping as Record<string, unknown> | undefined;
      if (rowGrouping?.rowGroup) {
        assignments[colId] = { ...assignment, rowGrouping: { ...rowGrouping, rowGroup: false, rowGroupIndex: undefined } };
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
    for (const [colId, aggFunc] of Object.entries(patch.aggregations ?? {})) {
      const existing = assignments[colId] ?? { colId };
      assignments[colId] = {
        ...existing,
        colId,
        rowGrouping: { ...((existing.rowGrouping as object) ?? {}), aggFunc },
      };
    }
    return { ...prevState, assignments };
  });

  const aggNote = Object.keys(patch.aggregations ?? {}).length
    ? `, aggregating ${Object.entries(patch.aggregations ?? {}).map(([c, f]) => `${c}=${f}`).join(', ')}`
    : '';
  return {
    ok: true,
    summary: patch.groupBy.length
      ? `"${entry.displayName}"${describeFanOut(fan)}: rows grouped by ${patch.groupBy.join(' > ')}${aggNote}.`
      : `"${entry.displayName}"${describeFanOut(fan)}: row grouping cleared.`,
  };
}
