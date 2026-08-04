import { useMemo, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { Button, Label, Slider, Switch } from '@wellsfargo-starui/react';
import { scenariosForTab } from './scenarios';
import { useLabDemoRegistry } from './LabDemoContext';

const ACCENT: Record<string, { btn: string; btnActive: string; dotClass: string }> = {
  positive: {
    btn: 'border-[color:var(--ds-accent-positive)] bg-[color:var(--ds-surface-secondary)]',
    btnActive: 'border-[color:var(--ds-accent-positive)] bg-[color:var(--ds-overlay-positive-soft)]',
    dotClass: 'bg-[color:var(--ds-accent-positive)]',
  },
  negative: {
    btn: 'border-[color:var(--ds-accent-negative)] bg-[color:var(--ds-surface-secondary)]',
    btnActive: 'border-[color:var(--ds-accent-negative)] bg-[color:var(--ds-overlay-negative-soft)]',
    dotClass: 'bg-[color:var(--ds-accent-negative)]',
  },
  warning: {
    btn: 'border-[color:var(--ds-accent-warning)] bg-[color:var(--ds-surface-secondary)]',
    btnActive: 'border-[color:var(--ds-accent-warning)] bg-[color:var(--ds-overlay-warning-soft)]',
    dotClass: 'bg-[color:var(--ds-accent-warning)]',
  },
  info: {
    btn: 'border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)]',
    btnActive: 'border-[color:var(--ds-primary)] bg-[color:var(--ds-primary-soft)]',
    dotClass: 'bg-[color:var(--ds-primary)]',
  },
  neutral: {
    btn: 'border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)]',
    btnActive: 'border-[color:var(--ds-text-secondary)] bg-[color:var(--ds-surface-primary)]',
    dotClass: 'bg-[color:var(--ds-text-secondary)]',
  },
};

const TAB_LABELS: Record<string, string> = {
  overview: 'Overview',
  formatting: 'Formatting',
  renderers: 'Renderers',
  toolbar: 'Formatter Toolbar',
  groups: 'Column Groups',
  calc: 'Calculated',
  conditional: 'Conditional Style',
  filters: 'Quick Filters',
  live: 'Live Updates',
  alerts: 'Alerts',
  profiles: 'Profiles',
};

export function LabScenarioRail({ activeTab }: { activeTab: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const { handle } = useLabDemoRegistry();

  const scenarios = useMemo(() => scenariosForTab(activeTab), [activeTab]);
  const tabLabel = TAB_LABELS[activeTab] ?? activeTab;

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
      className="flex w-[min(340px,32vw)] shrink-0 flex-col border-l border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] shadow-[var(--ds-elevation-card)]"
      data-testid="lab-demo-console"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--ds-border-primary)] px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
          <Zap size={16} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold tracking-tight">Demo console</h2>
          <p className="truncate text-[11px] text-[color:var(--ds-text-secondary)]">
            {tabLabel} · inject market moves
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse demo console"
        >
          <ChevronRight size={16} />
        </Button>
      </header>

      <div className="ds-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <section className="rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] p-3">
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--ds-text-secondary)]">
            <Activity size={12} />
            Stream
          </div>
          {handle ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="lab-stream-pause" className="text-xs">
                  Live ticks
                </Label>
                <div className="flex items-center gap-2">
                  {handle.paused ? (
                    <Pause size={12} className="text-[color:var(--ds-text-faint)]" />
                  ) : (
                    <Play size={12} className="text-[color:var(--ds-accent-positive)]" />
                  )}
                  <Switch
                    id="lab-stream-pause"
                    checked={!handle.paused}
                    onCheckedChange={(v) => handle.setPaused(!v)}
                    data-testid="lab-stream-pause"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] text-[color:var(--ds-text-secondary)]">
                  <span>Tick interval</span>
                  <span className="font-mono tabular-nums">{handle.tickMs} ms</span>
                </div>
                <Slider
                  value={[handle.tickMs]}
                  min={100}
                  max={1200}
                  step={50}
                  onValueChange={([v]) => handle.setTickMs(v ?? 500)}
                  data-testid="lab-tick-slider"
                />
              </div>
              <p className="text-[10px] leading-relaxed text-[color:var(--ds-text-faint)]">
                {(handle.snapshotRowCount || handle.getRowCount()).toLocaleString()} rows in view
                {handle.activeScenarioId ? ' · scenario overlay active' : ''}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-[color:var(--ds-text-muted)]">
              Open a feature tab to control the mock stream.
            </p>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-[color:var(--ds-text-secondary)]">
              Scenarios
            </span>
            {handle?.activeScenarioId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => handle.clearScenario()}
                data-testid="lab-scenario-clear"
              >
                <RotateCcw size={12} />
                Reset data
              </Button>
            )}
          </div>
          {handle && handle.scenariosSupported === false ? (
            <p
              className="text-[11px] leading-relaxed text-[color:var(--ds-text-muted)]"
              data-testid="lab-scenarios-unsupported"
            >
              Not available on the Perspective engine. A scenario patches rows through
              the grid&rsquo;s own transaction API, which is a client-side row model&rsquo;s
              write path — under Perspective the book lives in the worker, so the patch
              would have nowhere to land. Switch the row engine back to Client to use
              them.
            </p>
          ) : scenarios.length === 0 ? (
            <p className="text-[11px] text-[color:var(--ds-text-muted)]">
              No scripted scenarios for this tab yet.
            </p>
          ) : (
            <ul className="flex min-w-0 flex-col gap-2">
              {scenarios.map((s) => {
                const accent = ACCENT[s.accent] ?? ACCENT.neutral;
                const active = handle?.activeScenarioId === s.id;
                return (
                  <li key={s.id} className="min-w-0">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handle?.applyScenario(s.id)}
                      disabled={!handle}
                      data-testid={`lab-scenario-${s.id}`}
                      className={`h-auto w-full min-w-0 flex-col items-stretch whitespace-normal p-3 text-left hover:border-[color:var(--ds-text-secondary)] disabled:opacity-50 ${active ? accent.btnActive : accent.btn}`}
                    >
                      <div className="mb-1 flex w-full min-w-0 items-start gap-2">
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${accent.dotClass}`}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 text-left text-[12px] font-semibold leading-snug [overflow-wrap:anywhere]">
                          {s.title}
                        </span>
                        {active && (
                          <span className="shrink-0 text-[9px] uppercase tracking-wider text-[color:var(--ds-primary)]">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="w-full min-w-0 text-left text-[11px] leading-snug text-[color:var(--ds-text-secondary)] [overflow-wrap:anywhere]">
                        {s.description}
                      </p>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
