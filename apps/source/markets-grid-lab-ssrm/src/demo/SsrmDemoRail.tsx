/**
 * Right-hand demo console — the SSRM twin of the lab's `LabScenarioRail`.
 *
 * Same scenarios, different delivery: pause / tick-interval / row-count ride
 * `provider.restart(extra)` (the mock transport soft-restarts for interval
 * and pause, re-seeds only on a row-count change), and a scenario runs the
 * lab's own `apply()` transform over the LOADED block rows and writes the
 * changed rows through `ssrm-apply-edits` — the real SSRM write path, held
 * over the feed by the worker's edit overlay. Differences from CSRM are
 * stated in the rail rather than papered over.
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Sparkles, Zap } from 'lucide-react';
import { Button, Label, Slider } from '@wellsfargo-starui/react';
import type { LabRow } from '../../../markets-grid-lab/src/data/types';
import { scenariosForTab } from '../../../markets-grid-lab/src/demo/scenarios';
import { DEFAULT_STREAM } from '../ssrm/labSsrmProvider';
import { buildScenarioEditBatch } from './ssrmScenarioEdits';
import { useSsrmDemoRegistry } from './SsrmDemoContext';

const ACCENT_DOT: Record<string, string> = {
  positive: 'bg-[color:var(--ds-accent-positive)]',
  negative: 'bg-[color:var(--ds-accent-negative)]',
  warning: 'bg-[color:var(--ds-accent-warning)]',
  info: 'bg-[color:var(--ds-primary)]',
  neutral: 'bg-[color:var(--ds-text-secondary)]',
};

function loadedRowsOf(getGridApi: () => import('ag-grid-community').GridApi | null): LabRow[] {
  const api = getGridApi();
  if (!api) return [];
  const rows: LabRow[] = [];
  try {
    api.forEachNode((node) => {
      if (node.data != null && !node.group) rows.push(node.data as LabRow);
    });
  } catch {
    /* grid mid-destroy */
  }
  return rows;
}

export function SsrmDemoRail({ activeTab }: { activeTab: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tickMs, setTickMs] = useState(DEFAULT_STREAM.updateIntervalMs);
  const [rowCount, setRowCount] = useState(DEFAULT_STREAM.rowCount);
  const [lastInjected, setLastInjected] = useState<string | null>(null);
  const { handle } = useSsrmDemoRegistry();

  const scenarios = useMemo(() => scenariosForTab(activeTab), [activeTab]);

  const restartStream = (next: { paused?: boolean; tickMs?: number; rowCount?: number }) => {
    if (!handle) return;
    const nextPaused = next.paused ?? paused;
    const nextTick = next.tickMs ?? tickMs;
    const nextRows = next.rowCount ?? rowCount;
    setPaused(nextPaused);
    setTickMs(nextTick);
    setRowCount(nextRows);
    void handle.provider.restart({
      updateIntervalMs: nextTick,
      enableUpdates: !nextPaused,
      rowCount: nextRows,
    });
  };

  const inject = (scenarioId: string) => {
    if (!handle) return;
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    const batch = buildScenarioEditBatch(scenario, loadedRowsOf(handle.getGridApi));
    if (batch.rows.length === 0) return;
    setLastInjected(scenario.id);
    void handle.provider.applyEdits?.({ rows: batch.rows, editedColumns: batch.editedColumns });
  };

  if (collapsed) {
    return (
      <aside
        className="flex w-10 shrink-0 flex-col items-center border-l border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] py-3"
        aria-label="Demo console collapsed"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCollapsed(false)}
          aria-label="Expand demo console"
        >
          <ChevronLeft size={16} />
        </Button>
        <Sparkles size={14} className="mt-4 text-[color:var(--ds-text-faint)]" aria-hidden />
      </aside>
    );
  }

  return (
    <aside
      className="flex w-64 shrink-0 flex-col overflow-y-auto border-l border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]"
      aria-label="Demo console"
      data-testid="ssrm-demo-rail"
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--ds-border-primary)] px-3 py-2">
        <Zap size={14} className="text-[color:var(--ds-text-secondary)]" aria-hidden />
        <span className="text-[12px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
          Demo console · SSRM
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse demo console"
        >
          <ChevronRight size={15} />
        </Button>
      </div>

      <div className="flex flex-col gap-3 px-3 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 flex-1 gap-1.5"
            onClick={() => restartStream({ paused: !paused })}
            disabled={!handle}
            data-testid="ssrm-rail-pause"
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}
            {paused ? 'Resume ticks' : 'Pause ticks'}
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
            Tick interval · {tickMs} ms
          </Label>
          <Slider
            min={100}
            max={2000}
            step={100}
            value={[tickMs]}
            onValueChange={([v]) => setTickMs(v)}
            onValueCommit={([v]) => restartStream({ tickMs: v })}
            disabled={!handle}
            aria-label="Tick interval"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
            Book size · {rowCount.toLocaleString()} rows
          </Label>
          <div className="flex gap-1" role="group" aria-label="Book size">
            {[100, 500, 2000, 5000].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => restartStream({ rowCount: n })}
                disabled={!handle}
                data-testid={`ssrm-rail-rows-${n}`}
                className={`flex-1 rounded-md border px-1 py-1 text-[11px] transition-colors ${
                  rowCount === n
                    ? 'border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-text-primary)]'
                    : 'border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] text-[color:var(--ds-text-secondary)] hover:border-[color:var(--ds-text-secondary)]'
                }`}
              >
                {n >= 1000 ? `${n / 1000}k` : n}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-[color:var(--ds-text-faint)]">
            Shrinking the book restarts the provider with a smaller snapshot — the grid
            shows exactly the new rows, stale keys leave as engine removals
            (plan §12 T2 <code>replace_snapshot</code>).
          </p>
        </div>

        <div className="mt-1 flex flex-col gap-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
            Scenarios
          </Label>
          {scenarios.length === 0 ? (
            <p className="text-[12px] text-[color:var(--ds-text-faint)]">
              No scenarios for this tab.
            </p>
          ) : (
            scenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => inject(s.id)}
                disabled={!handle}
                data-testid={`ssrm-scenario-${s.id}`}
                className={`flex flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors ${
                  lastInjected === s.id
                    ? 'border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)]'
                    : 'border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] hover:border-[color:var(--ds-text-secondary)]'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--ds-text-primary)]">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${ACCENT_DOT[s.accent] ?? ACCENT_DOT.neutral}`} aria-hidden />
                  {s.title}
                </span>
                <span className="text-[11px] leading-snug text-[color:var(--ds-text-secondary)]">{s.description}</span>
              </button>
            ))
          )}
        </div>

        <p className="mt-2 border-t border-[color:var(--ds-border-primary)] pt-2 text-[11px] leading-snug text-[color:var(--ds-text-faint)]">
          Scenarios run the lab&apos;s own transforms over the LOADED block rows and write
          the changed rows through <code>ssrm-apply-edits</code>. The worker&apos;s edit overlay
          holds them over stale feed resends; a genuine feed move on the same field
          reclaims it. Pause / interval ride <code>provider.restart</code>.
        </p>
      </div>
    </aside>
  );
}
