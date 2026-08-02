import { useEffect, useState } from 'react';
import { marketsGridLocalStorageBundleKey } from '@wellsfargo-starui/core';
import { Badge } from '@wellsfargo-starui/react';
import { Activity, Database } from 'lucide-react';

/**
 * Lightweight status strip. The grid panels manage their own
 * subscriptions internally (via MarketsGridContainer), so this panel
 * inspects localStorage for each grid's persisted picker state and
 * reports it. Polls every second.
 */

const GRID_IDS = ['dataprovider-editor-demo-a', 'dataprovider-editor-demo-b'] as const;

interface PickerState {
  liveProviderId?: string;
  historicalProviderId?: string;
  mode?: 'live' | 'historical';
}

function readPickerState(instanceId: string): PickerState {
  if (typeof localStorage === 'undefined') return {};
  // MarketsGridContainer persists picker state inside its profile
  // bundle's `gridLevelData`. We read the parent bundle and pull the
  // gridLevelData out.
  try {
    const raw = localStorage.getItem(marketsGridLocalStorageBundleKey(instanceId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { gridLevelData?: PickerState };
    return parsed.gridLevelData ?? {};
  } catch {
    return {};
  }
}

export function StatsPanel() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  void tick; // participate in re-render only

  return (
    <div className="flex h-full w-full items-center gap-6 overflow-x-auto bg-[color:var(--ds-surface-primary)] px-4 py-2 text-[12px] text-[color:var(--ds-text-secondary)]">
      {GRID_IDS.map((id, i) => {
        const state = readPickerState(id);
        return (
          <div key={id} className="flex shrink-0 items-center gap-3">
            <Badge className="border-transparent bg-[color:var(--ds-surface-sunken)] font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ds-accent-info)]">
              <Activity size={12} strokeWidth={1.75} className="mr-1" />
              Grid {String.fromCharCode(65 + i)}
            </Badge>
            <span className="font-mono text-[11px]">
              <span className="text-[color:var(--ds-text-faint)]">live </span>
              <span className="text-[color:var(--ds-text-primary)]">
                {state.liveProviderId ?? '—'}
              </span>
            </span>
            <span className="font-mono text-[11px]">
              <span className="text-[color:var(--ds-text-faint)]">hist </span>
              <span className="text-[color:var(--ds-text-primary)]">
                {state.historicalProviderId ?? '—'}
              </span>
            </span>
            <span className="font-mono text-[11px]">
              <span className="text-[color:var(--ds-text-faint)]">mode </span>
              <span className="text-[color:var(--ds-text-primary)]">
                {state.mode ?? 'live'}
              </span>
            </span>
            {i < GRID_IDS.length - 1 ? (
              <span className="h-4 w-px shrink-0 bg-[color:var(--ds-border-primary)]" />
            ) : null}
          </div>
        );
      })}
      <span className="h-4 w-px shrink-0 bg-[color:var(--ds-border-primary)]" />
      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
        <Database size={12} strokeWidth={1.75} className="text-[color:var(--ds-text-faint)]" />
        <span className="text-[color:var(--ds-text-faint)]">IndexedDB:</span>
        <span className="text-[color:var(--ds-text-primary)]">marketsui-config / appConfig</span>
      </div>
    </div>
  );
}
