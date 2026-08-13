import { useEffect, useState, type FunctionComponent } from 'react';
import type { CustomStatusPanelProps } from 'ag-grid-react';
import type { StatusPanelDef } from 'ag-grid-community';
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

function formatCommas(n: number): string {
  return Math.trunc(n).toLocaleString('en-US');
}

type SsrmCountVariant = 'totalAndFiltered' | 'total' | 'filtered';

/**
 * Worker-backed row-count panel, one per AG Grid default-status-bar count
 * component. The native components read the client row model, which under
 * SSRM never knows the unfiltered cache total — so all three counts come
 * from `provider.getStatusBar`, which scans the whole worker RowStore.
 * Markup mirrors AG Grid's own panels (same ag-status-* classes + labels:
 * "Rows: a of b", "Total Rows: n", "Filtered Rows: n").
 */
function makeSsrmCountPanel(variant: SsrmCountVariant): FunctionComponent<PanelProps> {
  return function SsrmCountPanel(props: PanelProps) {
    return SsrmRowsStatusPanelBase(props, variant);
  };
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

  const [summary, setSummary] = useState<StatusBarSummary | null>(null);

  useEffect(() => {
    if (!provider) return;
    let cancelled = false;

    const load = () => {
      if (props.api.isDestroyed?.()) return;
      let filterModel: Record<string, unknown> | null = null;
      try {
        filterModel = (props.api.getFilterModel?.() ?? null) as Record<
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
        })
        .then((next) => {
          if (!cancelled && !props.api.isDestroyed?.()) setSummary(next);
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
    let lastLoadAt = 0;
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

    const unsubscribeTick = provider.onSsrmTick?.(scheduleLoad);

    // Slow idle fallback for providers without ticks (or a missed edge) —
    // no longer the primary refresh path, so a long fixed period is fine.
    const fallbackId = setInterval(load, 2_000);

    return () => {
      cancelled = true;
      unsubscribeTick?.();
      if (trailingTimer != null) clearTimeout(trailingTimer);
      clearInterval(fallbackId);
    };
  }, [provider, props.api, refreshThrottleMs, getQuickFilterText]);

  const filtered = summary?.filteredRows ?? 0;
  const total = summary?.totalRows ?? 0;
  const label =
    variant === 'total' ? 'Total Rows' : variant === 'filtered' ? 'Filtered Rows' : 'Rows';
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

  return (
    <div className={`ag-status-panel ${panelClass} ag-status-name-value`}>
      <span className="ag-status-name">{label}</span>
      :&nbsp;
      <span className="ag-status-name-value-value">{value}</span>
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
