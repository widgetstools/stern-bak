/**
 * The two things people ask for most, as one obvious tool each.
 *
 * Both were already possible: renaming was a `headerName` field on
 * `set_column_style`, hiding was a `hide` array on `set_column_layout`. Neither
 * is a name a model reaches for when asked to "rename this header" or "hide
 * ISIN" — one says *style*, the other *layout* — so the model went hunting
 * through modules, or through `get_grid_columns` for an exact id, before it
 * could do a one-field write. These exist so the obvious request maps to the
 * obviously-named tool, taking a column by whatever name the user used.
 *
 * They are thin on purpose: both delegate to the same writers the general
 * tools use, so there is one implementation of each behaviour, not two.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { patchGridModule, describeFanOut, resolveGridEntry } from './gridProfiles';
import { readColumnCatalogue, resolveColumn, resolveColumns } from './columnResolver';
import { writeColumnLayout } from './layoutTools';
import type { ToolExecutionResult } from './toolResult';

/** `{ column, newName }` for one, or `renames` for several in a single call. */
function collectRenames(args: Record<string, unknown>): Record<string, string> | string {
  const out: Record<string, string> = {};
  const { column, newName, renames } = args;

  if (column !== undefined || newName !== undefined) {
    if (typeof column !== 'string' || !column.trim()) return 'column must be the name or id of a column to rename.';
    if (typeof newName !== 'string' || !newName.trim()) return 'newName must be the label to show in the header.';
    out[column] = newName;
  }
  if (renames !== undefined) {
    if (typeof renames !== 'object' || renames === null || Array.isArray(renames)) {
      return 'renames must be an object mapping each column to its new header label, e.g. { "isin": "ISIN Code" }.';
    }
    for (const [key, value] of Object.entries(renames as Record<string, unknown>)) {
      if (typeof value !== 'string' || !value.trim()) return `renames["${key}"] must be a non-empty header label.`;
      out[key] = value;
    }
  }
  if (Object.keys(out).length === 0) {
    return 'Nothing to rename — pass column + newName, or a renames object.';
  }
  return out;
}

export async function renameColumn(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const collected = collectRenames(args);
  if (typeof collected === 'string') return { ok: false, summary: collected };

  const catalogue = await readColumnCatalogue(configManager, configStore, entry);
  const resolved: Array<{ colId: string; from: string; to: string }> = [];
  for (const [input, newName] of Object.entries(collected)) {
    const match = resolveColumn(input, catalogue);
    if (!match.ok) return { ok: false, summary: match.error };
    const current = catalogue.find((c) => c.colId === match.colId);
    resolved.push({ colId: match.colId, from: current?.headerName ?? match.colId, to: newName });
  }

  const fan = await patchGridModule(configManager, entry, 'column-customization', (prev) => {
    const prevState = (prev as { assignments?: Record<string, Record<string, unknown>> } | undefined) ?? {};
    const assignments = { ...prevState.assignments };
    for (const { colId, to } of resolved) {
      assignments[colId] = { ...(assignments[colId] ?? { colId }), colId, headerName: to };
    }
    return { ...prevState, assignments };
  });

  return {
    ok: true,
    summary:
      `"${entry.displayName}"${describeFanOut(fan)}: ` +
      resolved.map((r) => `${r.colId} header "${r.from}" → "${r.to}"`).join(', ') + '.',
  };
}

export async function setColumnVisibility(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  for (const field of ['hide', 'show', 'showOnly'] as const) {
    const value = args[field];
    if (value !== undefined && (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))) {
      return { ok: false, summary: `${field} must be an array of column names or ids.` };
    }
  }
  const hideIn = (args.hide as string[] | undefined) ?? [];
  const showIn = (args.show as string[] | undefined) ?? [];
  const showOnlyIn = args.showOnly as string[] | undefined;
  if (showOnlyIn !== undefined && (hideIn.length > 0 || showIn.length > 0)) {
    return { ok: false, summary: 'Pass showOnly on its own — it already decides every column\'s visibility.' };
  }
  if (showOnlyIn === undefined && hideIn.length === 0 && showIn.length === 0) {
    return { ok: false, summary: 'Nothing to change — pass hide, show, or showOnly.' };
  }

  const catalogue = await readColumnCatalogue(configManager, configStore, entry);

  let hide: string[];
  let show: string[];
  if (showOnlyIn) {
    const keep = resolveColumns(showOnlyIn, catalogue);
    if (!keep.ok) return { ok: false, summary: keep.error };
    if (catalogue.length === 0) {
      // Without a catalogue there is no "everything else" to hide, and
      // silently degrading to a plain `show` would leave the grid as it was.
      return {
        ok: false,
        summary: `Grid "${targetGridId}" has no columns to read yet (no data provider bound), so "only these" can't be resolved. Bind a provider, or pass hide/show explicitly.`,
      };
    }
    show = keep.colIds;
    hide = catalogue.map((c) => c.colId).filter((colId) => !show.includes(colId));
  } else {
    const hidden = resolveColumns(hideIn, catalogue);
    if (!hidden.ok) return { ok: false, summary: hidden.error };
    const shown = resolveColumns(showIn, catalogue);
    if (!shown.ok) return { ok: false, summary: shown.error };
    const clash = hidden.colIds.filter((id) => shown.colIds.includes(id));
    if (clash.length) return { ok: false, summary: `Column(s) listed in both hide and show: ${clash.join(', ')}.` };
    hide = hidden.colIds;
    show = shown.colIds;
  }

  const fan = await writeColumnLayout(configManager, entry, {
    ...(hide.length ? { hide } : {}),
    ...(show.length ? { show } : {}),
  });

  const parts: string[] = [];
  if (show.length) parts.push(`showed ${show.join(', ')}`);
  if (hide.length) parts.push(`hid ${hide.length > 8 ? `${hide.length} other columns` : hide.join(', ')}`);
  return { ok: true, summary: `"${entry.displayName}"${describeFanOut(fan)}: ${parts.join('; ')}.` };
}
