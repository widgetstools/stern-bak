/**
 * The two handlers behind `set_column_style` and `set_column_behavior`.
 *
 * Both write one place — a column assignment in `column-customization` — but
 * disjoint halves of it: style owns appearance, behaviour owns editor, filter,
 * grouping flags and template reference. Split out of `useToolExecutor.ts` for
 * size, alongside `layoutTools` and `simpleColumnTools`.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import type { ThemedCellStyleOverrides } from '@wellsfargo-starui/core';
import { readActiveProfile, patchGridModule, describeFanOut, resolveGridEntry, gridScopeId } from './gridProfiles';
import { readColumnCatalogue, resolveColumns } from './columnResolver';
import {
  normalizeColumnStyleArgs,
  mergeThemedStyle,
  describeColumnStyle,
  wantsCells,
  wantsHeaders,
  type FormatPreset,
} from './columnStyle';
import {
  normalizeColumnBehaviorArgs,
  applyColumnBehavior,
  describeColumnBehavior,
} from './columnBehavior';
import type { ToolExecutionResult } from './toolResult';
/** Which global formatter slot a preset belongs in — headers carry no value. */
function globalFormatterKey(preset: FormatPreset): 'globalCellNumberFormatter' | 'globalCellDateFormatter' {
  return preset === 'date' || preset === 'datetime' ? 'globalCellDateFormatter' : 'globalCellNumberFormatter';
}

interface ColumnCustomizationShape {
  assignments?: Record<string, Record<string, unknown>>;
  globalCellStyle?: ThemedCellStyleOverrides;
  globalHeaderStyle?: ThemedCellStyleOverrides;
  globalCellNumberFormatter?: unknown;
  globalCellDateFormatter?: unknown;
}

export async function setColumnStyle(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const parsed = normalizeColumnStyleArgs(args);
  if (!parsed.ok) return { ok: false, summary: parsed.error };
  const style = parsed.value;
  // Columns may be named however the user named them; the config keys on colId.
  if (style.colIds.length > 0) {
    const resolved = resolveColumns(style.colIds, await readColumnCatalogue(configManager, configStore, entry));
    if (!resolved.ok) return { ok: false, summary: resolved.error };
    style.colIds = resolved.colIds;
  }
  // The full formatter union wins over the `formatPreset` shorthand when both
  // are supplied — the shorthand exists only because most asks are a preset.
  const formatter =
    style.formatter ?? (style.formatPreset ? { kind: 'preset' as const, preset: style.formatPreset } : undefined);

  const fan = await patchGridModule(configManager, entry, 'column-customization', (prev) => {
    const prevState = (prev as ColumnCustomizationShape | undefined) ?? { assignments: {} };

    // "Every column" is one global-baseline write, not N per-column writes.
    // The engine layers global → per-column, so existing per-column styling
    // still wins where it was set explicitly.
    if (style.allColumns) {
      return {
        ...prevState,
        ...(wantsCells(style.target) ? { globalCellStyle: mergeThemedStyle(prevState.globalCellStyle, style) } : {}),
        ...(wantsHeaders(style.target) ? { globalHeaderStyle: mergeThemedStyle(prevState.globalHeaderStyle, style) } : {}),
        ...(formatter && style.formatPreset ? { [globalFormatterKey(style.formatPreset)]: formatter } : {}),
      };
    }

    const assignments = { ...prevState.assignments };
    for (const colId of style.colIds) {
      const existing = assignments[colId] ?? { colId };
      const next: Record<string, unknown> = {
        ...existing,
        colId,
        ...(wantsCells(style.target)
          ? { cellStyleOverrides: mergeThemedStyle(existing.cellStyleOverrides as ThemedCellStyleOverrides | undefined, style) }
          : {}),
        ...(wantsHeaders(style.target)
          ? { headerStyleOverrides: mergeThemedStyle(existing.headerStyleOverrides as ThemedCellStyleOverrides | undefined, style) }
          : {}),
        ...(formatter ? { valueFormatterTemplate: formatter } : {}),
        ...(style.headerName !== undefined ? { headerName: style.headerName } : {}),
        ...(style.editable !== undefined ? { editable: style.editable } : {}),
        ...(style.renderer ?? {}),
      };
      // Both fields go together — leaving a stale config behind would feed the
      // next renderer someone else's params.
      //
      // The formatter slot is template XOR renderer (the same invariant the
      // engine's `applyFormatterReducer` enforces): an opaque renderer keeps
      // painting the cell and the newly-picked format never shows. Setting a
      // format therefore drops any renderer, unless this same call is what set
      // the renderer.
      if (style.clearRenderer || (formatter && !style.renderer)) {
        delete next.cellRendererId;
        delete next.cellRendererConfig;
      }
      assignments[colId] = next;
    }
    return { ...prevState, assignments };
  });

  const what = describeColumnStyle(style);
  return {
    ok: true,
    summary:
      (style.allColumns
        ? `All columns on "${targetGridId}"`
        : `${style.colIds.length} column(s) on "${targetGridId}" (${style.colIds.join(', ')})`) +
      `${describeFanOut(fan)}: ${what}.`,
  };
}

/**
 * The behavioural half of a column assignment — editor, filter, grouping
 * flags, template reference. Same storage as `set_column_style`
 * (`column-customization.assignments`), different fields, so the two compose
 * on one column without clobbering each other.
 */
export async function setColumnBehavior(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const parsed = normalizeColumnBehaviorArgs(args);
  if (!parsed.ok) return { ok: false, summary: parsed.error };
  const behavior = parsed.value;
  const resolvedCols = resolveColumns(behavior.colIds, await readColumnCatalogue(configManager, configStore, entry));
  if (!resolvedCols.ok) return { ok: false, summary: resolvedCols.error };
  behavior.colIds = resolvedCols.colIds;

  // A template reference that doesn't resolve renders as "nothing happened",
  // so check it against the module that owns the templates before writing.
  if (behavior.templateId) {
    const profile = await readActiveProfile(configManager, gridScopeId(entry));
    const templates =
      (profile.state?.['column-templates']?.data as { templates?: Record<string, unknown> } | undefined)?.templates ?? {};
    if (!Object.prototype.hasOwnProperty.call(templates, behavior.templateId)) {
      const known = Object.keys(templates);
      return {
        ok: false,
        summary:
          `No column template "${behavior.templateId}" on "${targetGridId}". ` +
          (known.length ? `Existing: ${known.join(', ')}.` : 'This grid has none — create one with add_module_item on column-templates.'),
      };
    }
  }

  const fan = await patchGridModule(configManager, entry, 'column-customization', (prev) => {
    const prevState = (prev as ColumnCustomizationShape | undefined) ?? { assignments: {} };
    const assignments = { ...prevState.assignments };
    for (const colId of behavior.colIds) {
      assignments[colId] = applyColumnBehavior(
        (assignments[colId] ?? { colId }) as Record<string, unknown>,
        behavior,
      ) as (typeof assignments)[string];
    }
    return { ...prevState, assignments };
  });

  return {
    ok: true,
    summary:
      `${behavior.colIds.length} column(s) on "${targetGridId}" (${behavior.colIds.join(', ')})` +
      `${describeFanOut(fan)}: ${describeColumnBehavior(behavior)}.`,
  };
}

