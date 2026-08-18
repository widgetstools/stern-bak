import { useEffect, useState, type FunctionComponent } from 'react';
import type { CustomStatusPanelProps } from 'ag-grid-react';
import type { StatusPanelDef } from 'ag-grid-community';
import { quickFilterColumnsOf } from '@wellsfargo-starui/core';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { StatusBarSummary } from '@wellsfargo-starui/data/runtime';

export const SSRM_STATUS_CONTEXT_KEY = 'ssrmStatusBar';

export interface CreateSsrmStatusBarOptions {
  provider: ISsrmDataProvider;
  refreshThrottleMs?: number;
  getQuickFilterText?: () => string;
}

export interface SsrmStatusBarContext {
  provider: ISsrmDataProvider;
  refreshThrottleMs: number;
  getQuickFilterText?: () => string;
}

export interface SsrmStatusBarConfig {
  statusBar: { statusPanels: StatusPanelDef[] };
  context: Record<string, SsrmStatusBarContext>;
}

type PanelProps = CustomStatusPanelProps & {
  provider?: ISsrmDataProvider;
  refreshThrottleMs?: number;
  getQuickFilterText?: () => string;
};

/**
 * Grouped digits in the VIEWER's locale, not a hardcoded `'en-US'`.
 * AG-Grid's own count components format through the runtime locale, so
 * pinning one made the worker-backed panels the only numbers on the strip
 * that ignored it — 1.234 vs 1,234 beside each other in de-DE.
 */
function formatCommas(n: number): string {
  return Math.trunc(n).toLocaleString();
}

type SsrmCountVariant = 'totalAndFiltered' | 'total' | 'filtered';

/**
 * Worker-backed row-count panel, one per AG Grid default-status-bar count
 * component. The native components read the client row model, which under
 * SSRM never knows the unfiltered cache total — so all three counts come
 * from `provider.getStatusBar`, which scans the whole worker RowStore.
 *
 * **Whole-dataset counts are the parity answer, including with pagination on.**
 * AG Grid's own three count components (ag-grid-enterprise 36.1.0,
 * `statusBar/providedPanels/`) contain no reference to pagination anywhere:
 * `_getTotalRowCount` walks `rowModel.forEachNode` and `_getFilteredRowCount`
 * walks `rowModel.forEachNodeAfterFilter`, both of which traverse the whole
 * model — `forEachDisplayedNode`/`rowsToDisplay`, the paginated view, is never
 * consulted. A CSRM grid with `pagination: true` therefore shows the same
 * numbers it shows with pagination off, and so must these. Pinned by
 * `createSsrmStatusBar.pagination.test.tsx`, which mounts a real CSRM grid
 * either way and compares.
 *
 * Markup mirrors AG Grid's own panels — same `ag-status-*` classes, same
 * labels ("Rows: a of b", "Total Rows: n", "Filtered: n"), and the same
 * visibility rule on the filtered panel, which AG Grid hides while nothing is
 * narrowing the set (`FilteredRowsComp.onDataChanged` →
 * `setDisplayed(total !== filtered)`).
 */
function makeSsrmCountPanel(variant: SsrmCountVariant): FunctionComponent<PanelProps> {
  return function SsrmCountPanel(props: PanelProps) {
    return SsrmRowsStatusPanelBase(props, variant);
  };
}

/**
 * Keep one panel's summary current: load once, then reload on every provider
 * tick, throttled to `refreshThrottleMs` (leading edge + at most one trailing
 * call per window), with a slow idle fallback for a provider that has no ticks
 * or a missed edge.
 *
 * Lifted out of the panel itself only so the component stays inside the
 * 80-line function ceiling — the polling and the markup are two separable
 * concerns and this is the seam between them.
 */
function useStatusBarSummary(
  provider: ISsrmDataProvider | undefined,
  api: PanelProps['api'],
  refreshThrottleMs: number,
  getQuickFilterText: (() => string) | undefined,
): StatusBarSummary | null {
  const [summary, setSummary] = useState<StatusBarSummary | null>(null);

  useEffect(() => {
    if (!provider) return;
    let cancelled = false;

    const load = () => {
      if (api.isDestroyed?.()) return;
      let filterModel: Record<string, unknown> | null = null;
      try {
        filterModel = (api.getFilterModel?.() ?? null) as Record<
          string,
          unknown
        > | null;
      } catch {
        filterModel = null;
      }
      const quickFilterText = getQuickFilterText?.() ?? '';
      void provider
        .getStatusBar({
          filterModel,
          quickFilterText: quickFilterText || null,
          // Same column scope the datasource sends, so "filtered rows" counts
          // the rows the grid is actually showing rather than rows matched on
          // a column the user has hidden.
          quickFilterColumns: quickFilterText
            ? quickFilterColumnsOf(api) ?? null
            : null,
        })
        .then((next) => {
          if (!cancelled && !api.isDestroyed?.()) setSummary(next);
        })
        .catch(() => {
          /* keep last good summary */
        });
    };

    load();

    // Tick-driven refresh, throttled to `refreshThrottleMs` (leading edge +
    // at most one trailing call per window) — replaces the old free-running
    // `setInterval(load, refreshThrottleMs)`. A burst of ticks inside one
    // window collapses to <= 2 loads; an isolated tick produces exactly 1.
    // Stamped from the MOUNT load above, not left at 0. Leaving it at 0 meant
    // the first tick inside the throttle window saw `elapsed` as the whole
    // epoch, took the leading edge, and issued a second `getStatusBar` for the
    // state the mount load was already fetching — one duplicate RPC per panel,
    // times three panels, on every grid mount.
    let lastLoadAt = Date.now();
    let trailingTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleLoad = () => {
      const now = Date.now();
      const elapsed = now - lastLoadAt;
      if (elapsed >= refreshThrottleMs) {
        lastLoadAt = now;
        load();
        return;
      }
      if (trailingTimer != null) return;
      trailingTimer = setTimeout(() => {
        trailingTimer = null;
        lastLoadAt = Date.now();
        load();
      }, refreshThrottleMs - elapsed);
    };

    // Optional-chained because test doubles and bare embeds supply partial
    // providers; `hasTicks` is the same question asked of the METHOD, since
    // the unsubscribe it returns is always a function and so always truthy.
    const hasTicks = typeof provider.onSsrmTick === 'function';
    const unsubscribeTick = provider.onSsrmTick?.(scheduleLoad);

    // Slow idle fallback for providers that have NO tick stream to drive the
    // refresh. A tick-capable provider does not need it and used to pay a
    // full worker round trip every 2s per panel, forever, while idle.
    const fallbackId = hasTicks ? null : setInterval(load, 2_000);

    return () => {
      cancelled = true;
      unsubscribeTick?.();
      if (trailingTimer != null) clearTimeout(trailingTimer);
      if (fallbackId != null) clearInterval(fallbackId);
    };
  }, [provider, api, refreshThrottleMs, getQuickFilterText]);

  return summary;
}

const SsrmRowsStatusPanelBase = (props: PanelProps, variant: SsrmCountVariant) => {
  const provider =
    props.provider
    ?? (props.context as Record<string, SsrmStatusBarContext> | undefined)?.[
      SSRM_STATUS_CONTEXT_KEY
    ]?.provider;
  const refreshThrottleMs =
    props.refreshThrottleMs
    ?? (props.context as Record<string, SsrmStatusBarContext> | undefined)?.[
      SSRM_STATUS_CONTEXT_KEY
    ]?.refreshThrottleMs
    ?? 150;
  const getQuickFilterText =
    props.getQuickFilterText
    ?? (props.context as Record<string, SsrmStatusBarContext> | undefined)?.[
      SSRM_STATUS_CONTEXT_KEY
    ]?.getQuickFilterText;


  const summary = useStatusBarSummary(provider, props.api, refreshThrottleMs, getQuickFilterText);

  const filtered = summary?.filteredRows ?? 0;
  const total = summary?.totalRows ?? 0;

  // AG Grid's `FilteredRowsComp` displays itself only while a filter is
  // narrowing the set. Rendering unconditionally made an unfiltered SSRM grid
  // claim "Filtered: 20,000" beside "Total Rows: 20,000" — a panel asserting a
  // filter that is not there, which CSRM never shows. Hidden before the first
  // summary arrives too: until the counts are known there is nothing to
  // compare, and flashing the panel for one frame is its own small lie.
  if (variant === 'filtered' && (summary == null || filtered === total)) {
    return null;
  }

  // "Filtered", not "Filtered Rows" — the native default is
  // `getLocaleTextFunc()('filteredRows', 'Filtered')`.
  const label =
    variant === 'total' ? 'Total Rows' : variant === 'filtered' ? 'Filtered' : 'Rows';
  const panelClass =
    variant === 'total'
      ? 'ag-status-panel-total-row-count'
      : variant === 'filtered'
        ? 'ag-status-panel-filtered-row-count'
        : 'ag-status-panel-total-and-filtered-row-count';
  const value =
    summary == null
      ? '…'
      : variant === 'total'
        ? formatCommas(total)
        : variant === 'filtered'
          ? formatCommas(filtered)
          : filtered === total
            ? formatCommas(filtered)
            : `${formatCommas(filtered)} of ${formatCommas(total)}`;

  // The literal spaces reproduce AG Grid's own element template, which emits
  //   <div> <span>Rows</span> :&nbsp;<span>25</span> </div>
  // — JSX would otherwise strip them and render "Rows: 25" beside a native
  // "Selected : 3" in the same strip, since `MarketsGridSsrmSurface` merges
  // these panels with the native ones rather than replacing the whole bar.
  // Same reason `formatCommas` defers to the runtime locale.
  return (
    <div className={`ag-status-panel ${panelClass} ag-status-name-value`}>
      {' '}
      <span className="ag-status-name">{label}</span> :&nbsp;
      <span className="ag-status-name-value-value">{value}</span>{' '}
    </div>
  );
};

export const SsrmRowsStatusPanel = makeSsrmCountPanel('totalAndFiltered');
export const SsrmTotalRowsStatusPanel = makeSsrmCountPanel('total');
export const SsrmFilteredRowsStatusPanel = makeSsrmCountPanel('filtered');

/** Native count components whose client-row-model numbers are wrong under
 *  SSRM (they only see loaded blocks) → worker-backed replacements. */
const NATIVE_COUNT_TO_SSRM: Record<string, FunctionComponent<PanelProps>> = {
  agTotalAndFilteredRowCountComponent: SsrmRowsStatusPanel,
  agTotalRowCountComponent: SsrmTotalRowsStatusPanel,
  agFilteredRowCountComponent: SsrmFilteredRowsStatusPanel,
};

/**
 * Map a native AG Grid `statusBar` option (e.g. the customizer's Grid
 * Options → STATUS BAR selection) onto its SSRM equivalent: the three
 * row-count components become worker-backed panels (same markup and
 * labels, whole-cache numbers); everything else — selected count,
 * aggregation, custom panels — passes through untouched, keeping each
 * panel's align and order.
 *
 * Returns `undefined` when the option is absent or carries no panels —
 * the caller renders no status bar, exactly like CSRM with the card
 * toggled off.
 */
export function mapNativeStatusBarToSsrm(
  statusBarOpt: unknown,
  options: CreateSsrmStatusBarOptions,
): { statusPanels: StatusPanelDef[] } | undefined {
  if (!statusBarOpt || typeof statusBarOpt !== 'object') return undefined;
  const panels = (statusBarOpt as { statusPanels?: unknown }).statusPanels;
  if (!Array.isArray(panels) || panels.length === 0) return undefined;

  const refreshThrottleMs = options.refreshThrottleMs ?? 150;
  const statusPanelParams = {
    provider: options.provider,
    refreshThrottleMs,
    getQuickFilterText: options.getQuickFilterText,
  };

  const statusPanels = panels.map((raw, i) => {
    const def = raw as StatusPanelDef;
    const replacement =
      typeof def.statusPanel === 'string'
        ? NATIVE_COUNT_TO_SSRM[def.statusPanel]
        : undefined;
    if (!replacement) return def;
    return {
      key: def.key ?? `ssrm-${String(def.statusPanel)}-${i}`,
      align: def.align,
      statusPanel: replacement,
      statusPanelParams,
    } as StatusPanelDef;
  });

  return { statusPanels };
}

/**
 * Simplified SSRM status bar — worker-backed row counts + native selected panel.
 */
export function createSsrmStatusBar(
  options: CreateSsrmStatusBarOptions,
): SsrmStatusBarConfig {
  const refreshThrottleMs = options.refreshThrottleMs ?? 150;
  const ctx: SsrmStatusBarContext = {
    provider: options.provider,
    refreshThrottleMs,
    getQuickFilterText: options.getQuickFilterText,
  };

  return {
    statusBar: {
      statusPanels: [
        {
          key: 'ssrm-rows',
          statusPanel: SsrmRowsStatusPanel,
          align: 'left',
          statusPanelParams: {
            provider: options.provider,
            refreshThrottleMs,
            getQuickFilterText: options.getQuickFilterText,
          },
        },
        {
          key: 'ssrm-total-rows',
          statusPanel: SsrmTotalRowsStatusPanel,
          align: 'center',
          statusPanelParams: {
            provider: options.provider,
            refreshThrottleMs,
            getQuickFilterText: options.getQuickFilterText,
          },
        },
        {
          key: 'ssrm-filtered-rows',
          statusPanel: SsrmFilteredRowsStatusPanel,
          align: 'center',
          statusPanelParams: {
            provider: options.provider,
            refreshThrottleMs,
            getQuickFilterText: options.getQuickFilterText,
          },
        },
        {
          key: 'ssrm-selected',
          statusPanel: 'agSelectedRowCountComponent',
          align: 'center',
        },
        {
          // Native range aggregations (avg / count / min / max / sum) —
          // computed over the selected cell range, which is always loaded
          // client-side, so the built-in component is correct under SSRM.
          key: 'ssrm-aggregation',
          statusPanel: 'agAggregationComponent',
          align: 'right',
        },
      ],
    },
    context: { [SSRM_STATUS_CONTEXT_KEY]: ctx },
  };
}
