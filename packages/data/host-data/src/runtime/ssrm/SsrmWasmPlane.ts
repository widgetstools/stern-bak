import type { StompSsrmProviderConfig } from '@wellsfargo-starui/types';
import { flattenRows } from './flattenRow.js';
import { RustHubHost, type RustHubFactory, type RustHubLike } from './RustHubHost.js';
import type {
  SsrmColumnValuesRequest,
  SsrmColumnValuesResult,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  SsrmAggregatesRequest,
  SsrmAggregatesResult,
  SsrmRowCountRequest,
  SsrmRowCountResult,
  SsrmTickPayload,
  SsrmViewSpec,
  SsrmWatchGroupsRequest,
} from './ssrmTypes.js';
import { toViewSpecResult } from './toViewSpec.js';

const EMPTY_PARAMS = '{}';

/** Distinct-value ceiling for a set filter list. AG Grid renders them all. */
const DEFAULT_COLUMN_VALUES_LIMIT = 1000;

/**
 * Open views held per session (≈ per grid).
 *
 * An engine view is LIVE — maintained on every tick for as long as it is open
 * — so opening one per read and never disposing it is not a slow leak but a
 * compounding cost: the worker ends up recomputing every view it has ever
 * opened and the grid's own block reads stop arriving, which reads as a grid
 * stuck loading forever. Every scrolled block asks the same query with a
 * different window, so a small cache serves nearly all reads from one view.
 *
 * Sized for what one grid holds at once: the level being scrolled, a view per
 * expanded group, one per saved-filter pill, and one per open set-filter value
 * list. Under the cap this never evicts; over it, the cost is a re-open.
 * Scoped per session so a second grid can't evict the first one's views.
 */
const MAX_VIEWS_PER_SESSION = 24;

interface OpenView {
  sessionId: string;
  providerId: string;
  viewId: string;
}

/**
 * Cache key for a view. The filter array is ANDed, so its order carries no
 * meaning — canonicalising it keeps the same query on one view no matter which
 * order the conditions were assembled in. `sort` is left alone: there, order
 * is precedence.
 */
function viewSignature(sessionId: string, providerId: string, spec: SsrmViewSpec): string {
  const filter = [...(spec.filter ?? [])]
    .map((node) => JSON.stringify(node))
    .sort();
  return JSON.stringify([sessionId, providerId, { ...spec, filter }]);
}

export interface SsrmPlaneBootCfg {
  providerId: string;
  cfg: StompSsrmProviderConfig;
}

interface SsrmReadWindow {
  rows?: Record<string, unknown>[];
  rowCount?: number;
  groupData?: Record<string, unknown>;
  grandTotalData?: Record<string, unknown>;
  pivotResultFields?: string[];
}

export interface SsrmControlReply {
  id?: string;
  type?: string;
  payload?: unknown;
  error?: string;
}

function parseJson<T>(raw: string, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Engine group rows stamp `__path` / `__group`; AG Grid keys off the column. */
function stampGroupKey(row: Record<string, unknown>, groupCol: string): Record<string, unknown> {
  const path = row.__path;
  const fromPath = Array.isArray(path) ? path[path.length - 1] : undefined;
  const key = row[groupCol] ?? row.__ssrmGroupKey ?? fromPath ?? '';
  return {
    ...row,
    [groupCol]: row[groupCol] ?? key,
    __ssrmGroupKey: String(key),
  };
}

function resultOf(replies: SsrmControlReply[], id: string): SsrmControlReply {
  const match = replies.find((r) => r.id === id) ?? replies.find((r) => r.type === 'result');
  if (!match) throw new Error('[ssrm] wasm control returned no result');
  if (match.error) throw new Error(String(match.error));
  return match;
}

function bootJson(providerId: string, cfg: StompSsrmProviderConfig): string {
  const keyCol = cfg.keyColumn;
  const keyColumns = Array.isArray(keyCol)
    ? [...keyCol]
    : keyCol
      ? [keyCol]
      : ['positionId'];
  const columns = (cfg.columnDefinitions ?? []).map((c) => ({
    name: c.field,
    type: c.cellDataType === 'number' ? 'f64' : c.cellDataType === 'boolean' ? 'bool' : 'string',
  }));
  return JSON.stringify({
    id: providerId,
    schemaRef: `${providerId}@v1`,
    keyColumns,
    columns,
    searchColumns: cfg.searchColumns ?? [],
  });
}

/**
 * Per-provider façade over one shared {@link RustHubLike}.
 * One WASM cache per `providerId`; each subscriber is a rust session.
 */
export class SsrmWasmPlane {
  private readonly host: RustHubHost;
  private readonly booted = new Set<string>();
  private readonly subscribed = new Set<string>();
  /** Quick filter needs `searchColumns` at getRows time, not just at boot. */
  private readonly searchColumns = new Map<string, readonly string[]>();
  /** Live engine views by query signature, insertion-ordered least-recent first. */
  private readonly views = new Map<string, OpenView>();
  private nextCtl = 1;

  constructor(factory?: RustHubFactory) {
    this.host = new RustHubHost(factory);
  }

  async boot(providerId: string, cfg: StompSsrmProviderConfig): Promise<void> {
    const hub = await this.host.ensure();
    // Views held over a re-boot point at a datasource that no longer exists.
    this.dropViews((v) => v.providerId === providerId);
    hub.boot_datasource(bootJson(providerId, cfg));
    this.booted.add(providerId);
    this.searchColumns.set(providerId, cfg.searchColumns ?? []);
  }

  async reset(providerId: string, cfg: StompSsrmProviderConfig): Promise<void> {
    this.booted.delete(providerId);
    await this.boot(providerId, cfg);
  }

  async attachSession(sessionId: string): Promise<void> {
    const hub = await this.host.ensure();
    hub.connect(sessionId);
  }

  async detachSession(sessionId: string): Promise<string[]> {
    const hub = this.host.current;
    if (!hub) return [];
    this.subscribed.delete(sessionId);
    this.dropViews((v) => v.sessionId === sessionId);
    return parseJson<string[]>(hub.disconnect(sessionId), []);
  }

  async ingest(providerId: string, rows: readonly unknown[], replace: boolean): Promise<void> {
    const hub = await this.host.ensure();
    if (replace && rows.length === 0) {
      // Empty replace = restart flush. Re-boot so stale keys drop.
      if (this.booted.has(providerId)) {
        this.dropViews((v) => v.providerId === providerId);
        hub.boot_datasource(JSON.stringify({ id: providerId, schemaRef: `${providerId}@v1`, keyColumns: [], columns: [] }));
      }
      return;
    }
    const flat = flattenRows(rows);
    if (flat.length === 0) return;
    hub.apply_message_json(providerId, EMPTY_PARAMS, JSON.stringify(flat));
  }

  async getRows(
    sessionId: string,
    providerId: string,
    req: SsrmGetRowsRequest,
  ): Promise<SsrmGetRowsResult> {
    const hub = await this.host.ensure();
    await this.ensureSubscribed(hub, sessionId, providerId);
    const { spec, unsupported } = toViewSpecResult(req, {
      searchColumns: this.searchColumns.get(providerId),
    });
    if (unsupported.length > 0) {
      // Loud on purpose: a dropped condition renders MORE rows than asked for,
      // which is indistinguishable from working software.
      // eslint-disable-next-line no-console
      console.warn(`[ssrm] ${providerId}: untranslatable filter conditions —`, unsupported);
    }
    const win = this.readView(hub, sessionId, providerId, spec, req.startRow ?? 0, req.endRow);
    let rowData = win.rows ?? [];
    const groupCol = spec.groupBy?.[0];
    if (groupCol) {
      rowData = rowData.map((r) => stampGroupKey(r, groupCol));
    }
    return {
      rowData,
      rowCount: typeof win.rowCount === 'number' ? win.rowCount : rowData.length,
      groupData: win.groupData,
      grandTotalData: win.grandTotalData,
      pivotResultFields: win.pivotResultFields,
    };
  }

  /**
   * Distinct values for one column — AG Grid set filters can't derive them
   * under SSRM (no rows on the main thread), so they must be supplied.
   *
   * Implemented as a one-level grouped view: the engine already returns one
   * row per distinct group key, so this needs no new WASM entry point. The
   * other columns' filters are honoured so a set filter offers only values
   * that are actually reachable, matching AG Grid's own SSRM example.
   */
  async getColumnValues(
    sessionId: string,
    providerId: string,
    req: SsrmColumnValuesRequest,
  ): Promise<SsrmColumnValuesResult> {
    const hub = await this.host.ensure();
    await this.ensureSubscribed(hub, sessionId, providerId);
    const limit = req.limit && req.limit > 0 ? req.limit : DEFAULT_COLUMN_VALUES_LIMIT;

    // Its own filters must not narrow its own value list, or de-selecting a
    // value would make it disappear from the list.
    const scoped: Record<string, unknown> = { ...(req.filterModel ?? {}) };
    delete scoped[req.column];
    const { spec } = toViewSpecResult(
      { filterModel: scoped, sortModel: [{ colId: req.column, sort: 'asc' }] },
      { searchColumns: this.searchColumns.get(providerId) },
    );
    spec.groupBy = [req.column];
    spec.aggregates = {};
    spec.depth = 1;

    // One extra row distinguishes "exactly at the cap" from "truncated".
    const win = this.readView(hub, sessionId, providerId, spec, 0, limit + 1);
    const rows = win.rows ?? [];
    const seen = new Set<string>();
    const values: unknown[] = [];
    for (const row of rows) {
      // Group rows carry the key under the grouped column, but fall back to
      // `__ssrmGroupKey` the same way `getRows` does. A nullish key is not a
      // value the user can pick — AG Grid renders blanks on its own.
      const value = row[req.column] ?? row.__ssrmGroupKey;
      if (value == null) continue;
      const key = String(value);
      if (seen.has(key)) continue;
      seen.add(key);
      values.push(value);
      if (values.length >= limit) break;
    }
    return { column: req.column, values, truncated: rows.length > limit };
  }

  /**
   * Total rows matching a filter model, without loading any of them.
   *
   * Reads a one-row window: the engine reports the view's `rowCount` whatever
   * window was asked for, so the count costs no row materialisation. One row
   * rather than none because an empty range is the kind of edge an engine may
   * read as "unbounded" — which would materialise the whole view every poll.
   */
  async getRowCount(
    sessionId: string,
    providerId: string,
    req: SsrmRowCountRequest,
  ): Promise<SsrmRowCountResult> {
    const hub = await this.host.ensure();
    await this.ensureSubscribed(hub, sessionId, providerId);
    const { spec } = toViewSpecResult(req, {
      searchColumns: this.searchColumns.get(providerId),
    });
    const win = this.readView(hub, sessionId, providerId, spec, 0, 1);
    return { rowCount: typeof win.rowCount === 'number' ? win.rowCount : 0 };
  }

  /**
   * Dataset-level aggregations for the SSRM status bar. The grid only holds
   * loaded blocks, so a client-side sum would be a block statistic.
   */
  async getAggregates(
    sessionId: string,
    providerId: string,
    req: SsrmAggregatesRequest,
  ): Promise<SsrmAggregatesResult> {
    if (req.specs.length === 0) return { values: {} };
    const hub = await this.host.ensure();
    await this.ensureSubscribed(hub, sessionId, providerId);
    const { spec } = toViewSpecResult(req, {
      searchColumns: this.searchColumns.get(providerId),
    });
    const id = this.ctlId();
    const opened = resultOf(
      this.control(hub, sessionId, {
        id,
        type: 'aggregates',
        ref: { datasourceId: providerId, params: {} },
        specs: req.specs.map((s) => ({
          column: s.column,
          fn: s.fn,
          as: s.as ?? `${s.column}_${s.fn}`,
        })),
        spec: { filter: spec.filter },
      }),
      id,
    );
    const raw = (opened.payload ?? {}) as Record<string, unknown>;
    const values: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw)) {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isNaN(n)) values[key] = n;
    }
    return { values };
  }

  async watchGroups(
    sessionId: string,
    providerId: string,
    req: SsrmWatchGroupsRequest,
  ): Promise<void> {
    const hub = await this.host.ensure();
    await this.ensureSubscribed(hub, sessionId, providerId);
    const id = this.ctlId();
    resultOf(
      this.control(hub, sessionId, {
        id,
        type: 'watchGroups',
        ref: { datasourceId: providerId, params: {} },
        groupBy: req.groupBy,
        aggregates: req.aggregates ?? {},
      }),
      id,
    );
  }

  pollTicks(providerId: string): SsrmTickPayload[] {
    const hub = this.host.current;
    if (!hub) return [];
    const out: SsrmTickPayload[] = [];
    const perSession = parseJson<Array<{ sessionId: string; messages?: unknown[] }>>(hub.tick(), []);
    for (const rec of perSession) {
      for (const raw of rec.messages ?? []) {
        const m = raw as { type?: string; groups?: Record<string, unknown>[]; removed?: string[] };
        if (m.type === 'groupDelta') {
          out.push({ kind: 'groupDelta', groups: m.groups, removed: m.removed });
        }
      }
    }
    const dstr = hub.poll_shared_delta(providerId, EMPTY_PARAMS);
    if (dstr) {
      const m = parseJson<{
        type?: string;
        upserts?: Record<string, unknown>[];
        removals?: string[];
        reset?: boolean;
      }>(dstr, {});
      if (m.type === 'rowDelta' || m.upserts || m.removals) {
        out.push({
          kind: 'rowDelta',
          upserts: m.upserts,
          removals: m.removals,
          reset: m.reset,
        });
      }
    }
    return out;
  }

  memStats(): unknown {
    const hub = this.host.current;
    if (!hub) return null;
    return parseJson(hub.mem_stats(), null);
  }

  /** `openView` + `readWindow` for one spec — shared by rows, counts and value lists. */
  private readView(
    hub: RustHubLike,
    sessionId: string,
    providerId: string,
    spec: SsrmViewSpec,
    startRow: number,
    endRow: number | undefined,
  ): SsrmReadWindow {
    const viewId = this.acquireView(hub, sessionId, providerId, spec);

    const readId = this.ctlId();
    const window = resultOf(
      this.control(hub, sessionId, {
        id: readId,
        type: 'readWindow',
        viewId,
        startRow,
        endRow,
      }),
      readId,
    );
    return (window.payload ?? {}) as SsrmReadWindow;
  }

  /**
   * The view for this query, opening one only if it isn't already held.
   *
   * Reads run to completion synchronously inside the wasm call, so unlike an
   * async host there's no window in which an eviction can dispose a view
   * another read is part-way through — recency ordering alone is enough.
   */
  private acquireView(
    hub: RustHubLike,
    sessionId: string,
    providerId: string,
    spec: SsrmViewSpec,
  ): string {
    const key = viewSignature(sessionId, providerId, spec);
    const cached = this.views.get(key);
    if (cached) {
      // Re-insert so the map stays ordered least-recently-used first.
      this.views.delete(key);
      this.views.set(key, cached);
      return cached.viewId;
    }

    const openId = this.ctlId();
    const opened = resultOf(
      this.control(hub, sessionId, {
        id: openId,
        type: 'openView',
        ref: { datasourceId: providerId, params: {} },
        view: spec,
      }),
      openId,
    );
    const viewId = ((opened.payload ?? {}) as { viewId?: string }).viewId;
    if (!viewId) throw new Error('[ssrm] openView returned no viewId');

    this.views.set(key, { sessionId, providerId, viewId });
    this.evictSession(hub, sessionId);
    return viewId;
  }

  /** Release this session's least recently used views down to the cap. */
  private evictSession(hub: RustHubLike, sessionId: string): void {
    const mine = [...this.views].filter(([, v]) => v.sessionId === sessionId);
    // Clamped: a negative end would make `slice` count back from the end and
    // evict while under the cap.
    const excess = Math.max(0, mine.length - MAX_VIEWS_PER_SESSION);
    for (const [key, view] of mine.slice(0, excess)) {
      this.views.delete(key);
      this.disposeView(hub, view);
    }
  }

  /** Drop every held view matching `match`, telling the engine to release it. */
  private dropViews(match: (v: OpenView) => boolean): void {
    const hub = this.host.current;
    for (const [key, view] of [...this.views]) {
      if (!match(view)) continue;
      this.views.delete(key);
      if (hub) this.disposeView(hub, view);
    }
  }

  private disposeView(hub: RustHubLike, view: OpenView): void {
    // Best-effort: a view the engine has already dropped (provider reboot,
    // worker replaced) is not worth failing a teardown over.
    try {
      this.control(hub, view.sessionId, {
        id: this.ctlId(),
        type: 'disposeView',
        viewId: view.viewId,
      });
    } catch {
      /* engine already released it */
    }
  }

  private async ensureSubscribed(hub: RustHubLike, sessionId: string, providerId: string): Promise<void> {
    if (this.subscribed.has(sessionId)) return;
    const id = this.ctlId();
    this.control(hub, sessionId, {
      id,
      type: 'subscribe',
      ref: { datasourceId: providerId, params: {} },
      delivery: 'rows',
    });
    this.subscribed.add(sessionId);
  }

  private control(hub: RustHubLike, sessionId: string, msg: Record<string, unknown>): SsrmControlReply[] {
    return parseJson<SsrmControlReply[]>(hub.on_control(sessionId, JSON.stringify(msg)), []);
  }

  private ctlId(): string {
    return `ssrm-${this.nextCtl++}`;
  }
}

export function publishWindowMsOf(cfg: SsrmPlaneBootCfg['cfg']): number {
  const n = cfg.publishWindowMs;
  return typeof n === 'number' && n > 0 ? n : 100;
}
