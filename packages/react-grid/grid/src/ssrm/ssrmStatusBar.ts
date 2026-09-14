import { useRef } from 'react';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import {
  SsrmAggregationStatusPanel,
  SsrmFilteredStatusPanel,
  SsrmSelectedStatusPanel,
  SsrmTotalAndFilteredStatusPanel,
  SsrmTotalStatusPanel,
} from './SsrmStatusPanels.js';

const BUILTIN: Record<string, unknown> = {
  agTotalAndFilteredRowCountComponent: SsrmTotalAndFilteredStatusPanel,
  agFilteredRowCountComponent: SsrmFilteredStatusPanel,
  agTotalRowCountComponent: SsrmTotalStatusPanel,
  agSelectedRowCountComponent: SsrmSelectedStatusPanel,
  agAggregationComponent: SsrmAggregationStatusPanel,
};

interface StatusPanelDef {
  statusPanel?: unknown;
  statusPanelParams?: Record<string, unknown>;
  align?: string;
  key?: string;
  [key: string]: unknown;
}

interface StatusBarDef {
  statusPanels?: StatusPanelDef[];
  [key: string]: unknown;
}

/**
 * Swap AG Grid's client-side status panels for provider-backed ones.
 *
 * Same bar, same panel set, same labels — but every count / aggregation
 * is read from the worker cache. The built-in panels walk row nodes, which
 * under SSRM are just the loaded blocks.
 */
export function withSsrmStatusBar(
  statusBar: StatusBarDef | undefined,
  provider: ISsrmDataProvider,
): StatusBarDef | undefined {
  const panels = statusBar?.statusPanels;
  if (!panels?.length) return statusBar;
  return {
    ...statusBar,
    statusPanels: panels.map((panel) => {
      const Comp = typeof panel.statusPanel === 'string' ? BUILTIN[panel.statusPanel] : undefined;
      if (!Comp) return panel;
      return {
        ...panel,
        statusPanel: Comp,
        statusPanelParams: { ...panel.statusPanelParams, provider },
      };
    }),
  };
}

/**
 * Stable id for the enabled panel set.
 * `null` = the pipeline omitted the key (keep the last bar).
 * `''` = explicit empty panels (user turned the bar off).
 */
export function statusBarSignature(statusBar: StatusBarDef | undefined): string | null {
  if (statusBar == null) return null;
  const panels = statusBar.statusPanels;
  if (!panels?.length) return '';
  return panels.map((panel) => {
    const id = typeof panel.statusPanel === 'string'
      ? panel.statusPanel
      : typeof panel.statusPanel === 'function'
        ? (panel.statusPanel as { name?: string }).name ?? 'fn'
        : '?';
    return `${id}@${panel.align ?? ''}`;
  }).join(',');
}

export function applySsrmStatusBar(
  api: object | null | undefined,
  bar: StatusBarDef | undefined,
): void {
  if (!api) return;
  const grid = api as {
    setGridOption?: (key: string, value: unknown) => void;
    getGridOption?: (key: string) => unknown;
    isDestroyed?: () => boolean;
  };
  if (grid.isDestroyed?.()) return;
  const next = bar ?? { statusPanels: [] };
  if (typeof grid.getGridOption === 'function' && Object.is(grid.getGridOption('statusBar'), next)) {
    return;
  }
  grid.setGridOption?.('statusBar', next);
}

/**
 * Remap built-in panels, but keep the same object when the enabled set
 * has not changed. AgGridReact re-processes every new `statusBar` reference
 * and tears the bar down — a fresh remap on each pipeline tick made it
 * flicker or vanish.
 */
export function useSsrmStatusBar(
  statusBar: StatusBarDef | undefined,
  provider: ISsrmDataProvider,
): StatusBarDef | undefined {
  const cacheRef = useRef<{
    sig: string;
    provider: ISsrmDataProvider;
    bar: StatusBarDef | undefined;
  } | null>(null);
  const sig = statusBarSignature(statusBar);
  const cached = cacheRef.current;
  // A missing key is not "off" — general-settings used to omit the
  // property on unrelated ticks and the bar vanished.
  if (sig === null && cached && cached.provider === provider) {
    return cached.bar;
  }
  if (cached && cached.sig === sig && cached.provider === provider) {
    return cached.bar;
  }
  const bar = withSsrmStatusBar(statusBar, provider);
  cacheRef.current = { sig: sig ?? '', provider, bar };
  return bar;
}
