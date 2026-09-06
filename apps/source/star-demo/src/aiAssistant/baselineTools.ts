/**
 * "What's changed since…" — mark a baseline, then diff against it.
 *
 * This is the question a desk asks all day and the assistant could not answer.
 * `query_grid_data` and `summarize_grid_data` both see one snapshot: the rows on
 * screen right now. Nothing remembered what they looked like earlier, so
 * "what's moved since the open?" had no source to read.
 *
 * The obvious-looking sources don't work, which is worth recording so they
 * aren't tried again:
 *   - `data-change-history` is settings for an UNDO journal of user edits
 *     (`stream: false` by default). It is not a market-data log, and the
 *     journal is in-memory, not persisted.
 *   - `alerts` history is explicitly never persisted — `serialize` writes
 *     `history: []` — and lives in the grid's window, not the assistant's.
 *   - The grid's `historical` provider mode does exist, but `fetchGridRows`
 *     takes a live snapshot with no as-of parameter, and whether a given feed
 *     can serve a prior date is provider-specific.
 *
 * So a baseline is captured explicitly and stored as its own config row. That
 * is honest about what it is — a mark the user set, not a claim about market
 * history — and it works on any provider, including mock, with no feed support.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import { getValueByPath, LOGGED_IN_USER_ID } from '@wellsfargo-starui/types';
import type { QueryResult } from '@wellsfargo-starui/data';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
import { resolveGridEntry, gridScopeId } from './gridProfiles';
import { readColumnCatalogue, resolveColumns, isNumericColumn, type CatalogColumn } from './columnResolver';
import { fetchGridRows, type DataHubClient } from './dataAccess';
import { DATA_CELL, type DataCellPayload } from './dataTools';
import type { ToolExecutionResult } from './toolResult';

/** Own componentType so baselines never show up in blotter-instance discovery. */
const BASELINE_COMPONENT_TYPE = 'markets-grid-baseline';

/**
 * Rows kept per baseline. A blotter can stream far more than this; storing all
 * of them would put megabytes into IndexedDB for a question that is about the
 * big movers. The cap is reported rather than hidden, so a partial baseline is
 * never mistaken for a complete one.
 */
const MAX_BASELINE_ROWS = 5000;

interface Baseline {
  capturedAt: string;
  keyColumn: string;
  columns: string[];
  /** rowKey → { colId: value }. */
  rows: Record<string, Record<string, unknown>>;
  truncated: boolean;
  rowsSeen: number;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'baseline';
}

function baselineConfigId(instanceId: string, name: string): string {
  return `baseline::${instanceId}::${slug(name)}`;
}

/**
 * The column that identifies a row across two snapshots.
 *
 * Without a stable key there is no way to say "this row moved" rather than
 * "a row left and a different one arrived", so this refuses instead of
 * guessing by position — row order is not stable on a live feed.
 */
async function resolveKeyColumn(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  entry: RegistryEntry,
): Promise<string | undefined> {
  const gridLevelData = (await configManager.profiles.loadGridLevelData({ instanceId: gridScopeId(entry) })) as
    | { provider?: { liveProviderId?: string } }
    | null;
  const providerId = gridLevelData?.provider?.liveProviderId;
  if (!providerId) return undefined;
  const provider = await configStore.get(providerId);
  const key = (provider?.config as { keyColumn?: string | readonly string[] } | undefined)?.keyColumn;
  if (typeof key === 'string' && key) return key;
  if (Array.isArray(key) && key.length > 0 && typeof key[0] === 'string') return key[0];
  return undefined;
}

/** Numeric columns are what a "what moved" question is about. */
function defaultColumns(catalogue: CatalogColumn[]): string[] {
  return catalogue.filter(isNumericColumn).map((c) => c.colId);
}

export interface BaselineDeps {
  configManager: ConfigManager;
  configStore: DataProviderConfigStore;
  client?: DataHubClient;
}

export async function captureBaseline(
  deps: BaselineDeps,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const a = args as { targetGridId?: string; name?: string; columns?: string[] };
  if (!a.targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${a.targetGridId}". Call list_grids to see valid ids.` };

  const keyColumn = await resolveKeyColumn(deps.configManager, deps.configStore, entry);
  if (!keyColumn) {
    return {
      ok: false,
      summary:
        `"${entry.displayName}" has no keyColumn on its provider, so rows cannot be matched between two snapshots. ` +
        'Set one in the Data Provider Editor (or with update_data_provider) and capture again.',
    };
  }

  const catalogue = await readColumnCatalogue(deps.configManager, deps.configStore, entry);
  let columns: string[];
  if (a.columns?.length) {
    const resolved = resolveColumns(a.columns, catalogue);
    if (!resolved.ok) return { ok: false, summary: resolved.error };
    columns = resolved.colIds;
  } else {
    columns = defaultColumns(catalogue);
    if (columns.length === 0) {
      return {
        ok: false,
        summary:
          `No numeric columns are declared on "${entry.displayName}", so there is nothing to measure a move against. ` +
          'Name the columns to capture explicitly, or declare cellDataType on the provider.',
      };
    }
  }

  const fetched = await fetchGridRows(deps.configManager, deps.configStore, entry, deps.client, {});
  if (!fetched.ok) return { ok: false, summary: fetched.error };
  const rowSet = fetched.value;

  const rows: Record<string, Record<string, unknown>> = {};
  let kept = 0;
  for (const row of rowSet.rows) {
    if (kept >= MAX_BASELINE_ROWS) break;
    const key = getValueByPath(row, keyColumn);
    if (key === null || key === undefined) continue;
    const picked: Record<string, unknown> = {};
    for (const col of columns) picked[col] = getValueByPath(row, col);
    rows[String(key)] = picked;
    kept += 1;
  }

  const name = a.name ?? 'baseline';
  const baseline: Baseline = {
    capturedAt: new Date().toISOString(),
    keyColumn,
    columns,
    rows,
    truncated: rowSet.rows.length > kept,
    rowsSeen: rowSet.rows.length,
  };

  const instanceId = gridScopeId(entry);
  const now = new Date().toISOString();
  const configId = baselineConfigId(instanceId, name);
  const existing = await deps.configManager.getConfig(configId);
  await deps.configManager.saveConfig({
    configId,
    appId: existing?.appId ?? 'Star-Demo',
    userId: LOGGED_IN_USER_ID,
    isPublic: existing?.isPublic ?? true,
    displayText: `Baseline "${name}": ${entry.displayName}`,
    componentType: BASELINE_COMPONENT_TYPE,
    componentSubType: instanceId,
    isTemplate: false,
    singleton: false,
    payload: baseline as unknown as Record<string, unknown>,
    createdBy: existing?.createdBy ?? LOGGED_IN_USER_ID,
    updatedBy: LOGGED_IN_USER_ID,
    creationTime: existing?.creationTime ?? now,
    updatedTime: now,
  });

  return {
    ok: true,
    summary:
      `Captured baseline "${name}" on "${entry.displayName}": ${kept} row(s) keyed by ${keyColumn}, ` +
      `tracking ${columns.length} column(s) (${columns.slice(0, 8).join(', ')}${columns.length > 8 ? ', …' : ''})` +
      `${baseline.truncated ? `. Only the first ${MAX_BASELINE_ROWS} of ${rowSet.rows.length} rows were kept` : ''}` +
      `. Ask "what's changed since ${name}" later to compare (${rowSet.provenance}).`,
    data: { name, capturedAt: baseline.capturedAt, keyColumn, columns, rowCount: kept },
  };
}

interface DiffRow extends Record<string, unknown> {
  status: 'changed' | 'added' | 'removed';
}

export async function compareToBaseline(
  deps: BaselineDeps,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const a = args as {
    targetGridId?: string;
    name?: string;
    columns?: string[];
    minChangePercent?: number;
    limit?: number;
    includeUnchanged?: boolean;
  };
  if (!a.targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(a.targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${a.targetGridId}". Call list_grids to see valid ids.` };

  const name = a.name ?? 'baseline';
  const instanceId = gridScopeId(entry);
  const row = await deps.configManager.getConfig(baselineConfigId(instanceId, name));
  if (!row) {
    const available = await listBaselineNames(deps.configManager, instanceId);
    return {
      ok: false,
      summary:
        `No baseline called "${name}" on "${entry.displayName}". ` +
        (available.length
          ? `Available: ${available.join(', ')}.`
          : 'Capture one first with capture_baseline — a comparison needs a mark to measure from.'),
    };
  }
  const baseline = row.payload as unknown as Baseline;

  const catalogue = await readColumnCatalogue(deps.configManager, deps.configStore, entry);
  let columns = baseline.columns;
  if (a.columns?.length) {
    const resolved = resolveColumns(a.columns, catalogue);
    if (!resolved.ok) return { ok: false, summary: resolved.error };
    const missing = resolved.colIds.filter((c) => !baseline.columns.includes(c));
    if (missing.length) {
      return {
        ok: false,
        summary:
          `Baseline "${name}" doesn't hold ${missing.join(', ')} — it captured ${baseline.columns.join(', ')}. ` +
          'A column has to have been captured to be compared; re-capture naming it.',
      };
    }
    columns = resolved.colIds;
  }

  const fetched = await fetchGridRows(deps.configManager, deps.configStore, entry, deps.client, {});
  if (!fetched.ok) return { ok: false, summary: fetched.error };
  const rowSet = fetched.value;

  const seen = new Set<string>();
  const diffs: DiffRow[] = [];
  let changedCount = 0;
  let addedCount = 0;

  for (const current of rowSet.rows) {
    const key = getValueByPath(current, baseline.keyColumn);
    if (key === null || key === undefined) continue;
    const k = String(key);
    seen.add(k);
    const before = baseline.rows[k];
    if (!before) {
      addedCount += 1;
      const added: DiffRow = { [baseline.keyColumn]: k, status: 'added' };
      for (const col of columns) added[col] = getValueByPath(current, col);
      diffs.push(added);
      continue;
    }
    const entryRow: DiffRow = { [baseline.keyColumn]: k, status: 'changed' };
    let moved = false;
    let biggestPct = 0;
    for (const col of columns) {
      const now = getValueByPath(current, col);
      const then = before[col];
      entryRow[col] = now;
      if (typeof now === 'number' && typeof then === 'number') {
        const delta = now - then;
        entryRow[`${col} Δ`] = delta;
        if (then !== 0) {
          const pct = (delta / Math.abs(then)) * 100;
          entryRow[`${col} Δ%`] = Math.round(pct * 100) / 100;
          biggestPct = Math.max(biggestPct, Math.abs(pct));
        }
        if (delta !== 0) moved = true;
      } else if (now !== then) {
        entryRow[`${col} was`] = then;
        moved = true;
      }
    }
    if (!moved && !a.includeUnchanged) continue;
    if (a.minChangePercent !== undefined && biggestPct < a.minChangePercent) continue;
    if (moved) changedCount += 1;
    diffs.push(entryRow);
  }

  // Rows in the baseline that no longer appear — a position closed, an axe
  // pulled. Reported rather than silently dropped: a disappearance is usually
  // the most interesting thing that happened.
  let removedCount = 0;
  for (const [k, before] of Object.entries(baseline.rows)) {
    if (seen.has(k)) continue;
    removedCount += 1;
    const gone: DiffRow = { [baseline.keyColumn]: k, status: 'removed' };
    for (const col of columns) gone[col] = before[col];
    diffs.push(gone);
  }

  // Biggest absolute move first — the answer to "what changed" is a ranking,
  // not a dump.
  const rankCol = columns[0];
  diffs.sort((x, y) => Math.abs(Number(y[`${rankCol} Δ`] ?? 0)) - Math.abs(Number(x[`${rankCol} Δ`] ?? 0)));

  const limit = Math.min(a.limit ?? 50, 500);
  const shown = diffs.slice(0, limit);
  const tableColumns = [
    baseline.keyColumn,
    'status',
    ...columns.flatMap((c) => [c, `${c} Δ`, `${c} Δ%`]),
  ].filter((c) => shown.some((r) => r[c] !== undefined));

  const table: QueryResult = {
    columns: tableColumns,
    rows: shown.map((r) => Object.fromEntries(tableColumns.map((c) => [c, r[c]]))),
    grouped: false,
    matched: diffs.length,
    scanned: rowSet.rows.length,
    truncated: diffs.length > shown.length,
  };

  const since = new Date(baseline.capturedAt);
  const ran =
    `vs baseline "${name}" (${since.toLocaleString()}) · ` +
    `${changedCount} changed, ${addedCount} added, ${removedCount} removed`;

  const payload: DataCellPayload = {
    kind: DATA_CELL,
    gridName: entry.displayName,
    source: rowSet.source,
    provenance: `${rowSet.provenance}; compared against baseline "${name}" captured ${baseline.capturedAt}`,
    rowCount: diffs.length,
    table,
    ran,
  };

  return {
    ok: true,
    summary:
      `"${entry.displayName}" vs baseline "${name}" (captured ${baseline.capturedAt}): ` +
      `${changedCount} row(s) changed, ${addedCount} added, ${removedCount} removed, of ${rowSet.rows.length} scanned` +
      `${table.truncated ? `, showing the first ${shown.length}` : ''}` +
      `${baseline.truncated ? '. NOTE: the baseline was capped, so rows beyond that cap read as "added"' : ''}.`,
    data: payload,
  };
}

async function listBaselineNames(configManager: ConfigManager, instanceId: string): Promise<string[]> {
  const rows = await configManager.findByComponentType(BASELINE_COMPONENT_TYPE, instanceId);
  return rows
    .map((r) => r.configId.slice(`baseline::${instanceId}::`.length))
    .filter(Boolean);
}

export async function listBaselines(
  configManager: ConfigManager,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const targetGridId = args.targetGridId as string | undefined;
  if (!targetGridId) return { ok: false, summary: 'Missing required field: targetGridId.' };
  const entry = await resolveGridEntry(targetGridId);
  if (!entry) return { ok: false, summary: `No grid registered with id "${targetGridId}". Call list_grids to see valid ids.` };

  const instanceId = gridScopeId(entry);
  const rows = await configManager.findByComponentType(BASELINE_COMPONENT_TYPE, instanceId);
  if (rows.length === 0) {
    return { ok: true, summary: `No baselines captured on "${entry.displayName}" yet.`, data: [] };
  }
  const prefix = `baseline::${instanceId}::`;
  const listed = rows.map((r) => {
    const p = r.payload as unknown as Baseline;
    return {
      name: r.configId.slice(prefix.length),
      capturedAt: p.capturedAt,
      rowCount: Object.keys(p.rows ?? {}).length,
      columns: p.columns,
    };
  });
  return {
    ok: true,
    summary: listed
      .map((b) => `"${b.name}" — ${b.rowCount} rows, captured ${b.capturedAt}`)
      .join('; '),
    data: listed,
  };
}
