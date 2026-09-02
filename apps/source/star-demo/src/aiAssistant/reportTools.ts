/**
 * The two tools that put an analysis somewhere with room to read it.
 *
 * `open_analysis_window` takes a query and shows it full size.
 * `create_live_report` takes a composed report and shows that instead.
 *
 * Both stop at composition. The model chooses blocks, columns and chart kinds
 * from a fixed vocabulary; the renderers are trusted code. Nothing here
 * accepts markup, script or drawing instructions, which is the same posture
 * the expression engine takes (eval-free by construction, with its one
 * `new Function` site gated behind a policy).
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  validateReportSpec,
  type DataProviderConfigStore,
  type DataQuery,
  type ReportBlock,
  type ReportSpec,
} from '@wellsfargo-starui/data';
import {
  openAnalysisSurface,
  reopenAnalysisWindow,
  listAnalysisWindows,
  nextWindowId,
  MAIN_WINDOW_ID,
} from '../analysisPopout';
import { resolveGridEntry } from './gridProfiles';
import { readColumnCatalogue, resolveColumns, resolveColumn } from './columnResolver';
import type { ToolExecutionResult } from './toolResult';

interface ReportToolDeps {
  configManager: ConfigManager;
  configStore: DataProviderConfigStore;
}

type Catalogue = Awaited<ReturnType<typeof readColumnCatalogue>>;

/**
 * Rewrites every column name in a query to a real colId.
 *
 * Column arguments arrive in the USER'S words, the same as every other column
 * tool — "market value", not `marketValue`. Resolving here rather than at
 * render time means a typo becomes one explanation the model can act on,
 * instead of a report block that silently draws nothing.
 */
function resolveQuery(query: DataQuery, catalogue: Catalogue): { ok: true; value: DataQuery } | { ok: false; error: string } {
  const out: DataQuery = { ...query };

  for (const key of ['columns', 'groupBy', 'pivotBy'] as const) {
    const names = query[key];
    if (!names?.length) continue;
    const resolved = resolveColumns(names, catalogue);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    out[key] = resolved.colIds;
  }

  if (query.filter?.length) {
    const clauses = [];
    for (const clause of query.filter) {
      const match = resolveColumn(clause.column, catalogue);
      if (!match.ok) return { ok: false, error: match.error };
      clauses.push({ ...clause, column: match.colId });
    }
    out.filter = clauses;
  }

  if (query.aggregate?.length) {
    const aggs = [];
    for (const agg of query.aggregate) {
      const match = resolveColumn(agg.column, catalogue);
      if (!match.ok) return { ok: false, error: match.error };
      aggs.push({ ...agg, column: match.colId });
    }
    out.aggregate = aggs;
  }

  if (query.sortBy?.column) {
    const match = resolveColumn(query.sortBy.column, catalogue);
    if (!match.ok) return { ok: false, error: match.error };
    out.sortBy = { ...query.sortBy, column: match.colId };
  }

  return { ok: true, value: out };
}

/** Blocks name columns of their own outside the query — a KPI's measure, a
 *  lane's series, a lane's shared axis — and each has to resolve too. */
function resolveBlock(block: ReportBlock, catalogue: Catalogue): { ok: true; value: ReportBlock } | { ok: false; error: string } {
  if (block.kind === 'commentary') return { ok: true, value: block };

  const query = resolveQuery(block.query, catalogue);
  if (!query.ok) return query;

  if (block.kind === 'kpis') {
    const tiles = [];
    for (const tile of block.tiles) {
      const match = resolveColumn(tile.column, catalogue);
      if (!match.ok) return { ok: false, error: match.error };
      tiles.push({ ...tile, column: match.colId });
    }
    return { ok: true, value: { ...block, query: query.value, tiles } };
  }

  if (block.kind === 'lanes') {
    const axis = resolveColumn(block.axis, catalogue);
    if (!axis.ok) return { ok: false, error: axis.error };
    const lanes = [];
    for (const lane of block.lanes) {
      const match = resolveColumn(lane.column, catalogue);
      if (!match.ok) return { ok: false, error: match.error };
      lanes.push({ ...lane, column: match.colId });
    }
    return { ok: true, value: { ...block, query: query.value, axis: axis.colId, lanes } };
  }

  return { ok: true, value: { ...block, query: query.value } };
}

/**
 * Which analysis window a call is addressed to.
 *
 * Three cases, in order: an explicit `windowId` re-targets that window (this is
 * how the assistant updates one it opened earlier); `newWindow` mints an
 * additional one so two cuts of the same book can sit side by side; otherwise
 * the blotter's main analysis window is reused, which is the old behaviour.
 */
function windowFor(args: Record<string, unknown>, gridId: string): { id: string; isNew: boolean } {
  const named = typeof args.windowId === 'string' ? args.windowId.trim() : '';
  if (named) return { id: named, isNew: false };
  if (args.newWindow === true) return { id: nextWindowId(gridId), isNew: true };
  return { id: MAIN_WINDOW_ID, isNew: false };
}

/** So the model can say which window it drew into, and address it again. */
function describeWindow(win: { id: string; isNew: boolean }, gridId: string): string {
  if (win.isNew) {
    const others = listAnalysisWindows(gridId).filter((w) => w.id !== win.id).length;
    return (
      ` Opened as a NEW window, id "${win.id}"${others ? ` (${others} other analysis window(s) already open)` : ''} — ` +
      `pass windowId "${win.id}" to update this one again, or omit it to use the main window.`
    );
  }
  if (win.id !== MAIN_WINDOW_ID) return ` Drawn into analysis window "${win.id}".`;
  return '';
}

async function targetFor(deps: ReportToolDeps, args: Record<string, unknown>) {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false as const, error: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) {
    return { ok: false as const, error: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };
  }
  const catalogue = await readColumnCatalogue(deps.configManager, deps.configStore, entry);
  return { ok: true as const, entry, catalogue };
}

export async function openAnalysisWindow(
  deps: ReportToolDeps,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const target = await targetFor(deps, args);
  if (!target.ok) return { ok: false, summary: target.error };

  const raw = (args.query ?? {}) as DataQuery;
  if (typeof raw !== 'object') return { ok: false, summary: 'query must be an object.' };
  const query = resolveQuery(raw, target.catalogue);
  if (!query.ok) return { ok: false, summary: query.error };

  const title = (args.title as string | undefined) ?? `${target.entry.displayName} analysis`;
  const win = windowFor(args, target.entry.id);
  const opened = await openAnalysisSurface({
    gridId: target.entry.id,
    instanceId: args.instanceId as string | undefined,
    displayName: target.entry.displayName,
    windowId: win.id,
    windowTitle: title,
    payload: { kind: 'query', query: query.value, chart: args.chart as string | undefined, title },
  });
  if (!opened.ok) return { ok: false, summary: `Could not open the analysis window: ${opened.error}` };

  return {
    ok: true,
    // The window re-runs the query itself, so this is fresh data rather than
    // the snapshot any earlier result quoted — saying so keeps the two from
    // being confused when the numbers differ.
    summary:
      `Opened the analysis window for "${target.entry.displayName}". It runs the query itself, ` +
      `so the numbers there are current as of when it loaded rather than a copy of an earlier result.` +
      describeWindow(win, target.entry.id),
  };
}

export async function createLiveReport(
  deps: ReportToolDeps,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const target = await targetFor(deps, args);
  if (!target.ok) return { ok: false, summary: target.error };

  const validated = validateReportSpec({
    title: args.title,
    period: args.period,
    refreshMs: args.refreshMs,
    blocks: args.blocks,
  });
  if (!validated.ok) return { ok: false, summary: validated.error };

  const blocks: ReportBlock[] = [];
  for (const block of validated.value.blocks) {
    const resolved = resolveBlock(block, target.catalogue);
    if (!resolved.ok) return { ok: false, summary: resolved.error };
    blocks.push(resolved.value);
  }
  const spec: ReportSpec = { ...validated.value, blocks };

  const win = windowFor(args, target.entry.id);
  const opened = await openAnalysisSurface({
    gridId: target.entry.id,
    instanceId: args.instanceId as string | undefined,
    displayName: target.entry.displayName,
    windowId: win.id,
    windowTitle: spec.title,
    payload: { kind: 'report', spec },
  });
  if (!opened.ok) return { ok: false, summary: `Could not open the report window: ${opened.error}` };

  const cadence = spec.refreshMs ? `refreshing every ${Math.round(spec.refreshMs / 1000)}s` : 'static (refresh by hand)';
  return {
    ok: true,
    summary:
      `Opened "${spec.title}" over "${target.entry.displayName}" — ${spec.blocks.length} block(s), ${cadence}. ` +
      `Every number in it is computed from the blotter's rows.` +
      describeWindow(win, target.entry.id),
  };
}

/**
 * Reload — or reopen — an analysis window that was already made.
 *
 * Deliberately ONE tool for both. Every open stages a fresh handoff, so the
 * runtime always genuinely navigates: a window still on screen remounts and
 * re-runs its queries, and one the user has closed comes back with the same
 * content. Asking the model to know which case it is in would be asking it
 * something it cannot observe.
 *
 * It re-runs the queries rather than restoring a snapshot, so the numbers are
 * current — which is the usual reason for asking.
 */
export async function reloadAnalysisWindow(
  deps: ReportToolDeps,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const target = await targetFor(deps, args);
  if (!target.ok) return { ok: false, summary: target.error };

  const windowId = typeof args.windowId === 'string' && args.windowId.trim() ? args.windowId.trim() : undefined;
  const outcome = await reopenAnalysisWindow({
    gridId: target.entry.id,
    instanceId: args.instanceId as string | undefined,
    displayName: target.entry.displayName,
    windowId,
  });

  if (!outcome.ok) {
    // Name what IS available rather than just refusing — the model cannot see
    // the window list, so a bare "not found" leaves it guessing.
    const listed = outcome.known.length
      ? ` Analysis windows opened for this blotter: ${outcome.known
          .map((w) => `"${w.id}"${w.title ? ` (${w.title})` : ''}`)
          .join(', ')}.`
      : ' No analysis window has been opened for this blotter yet — use open_analysis_window or create_live_report first.';
    return { ok: false, summary: `${outcome.error}${listed}` };
  }

  const { record } = outcome;
  const what = record.title ? `"${record.title}"` : `window "${record.id}"`;
  return {
    ok: true,
    summary:
      `Reloaded ${what} on "${target.entry.displayName}". It re-ran its queries, so the numbers are ` +
      `current as of now rather than what it showed before — if it had been closed, it is open again.`,
  };
}
