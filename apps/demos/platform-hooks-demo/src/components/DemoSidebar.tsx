import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Button } from '@wellsfargo-starui/ui';
import { useAppDataStore } from '@wellsfargo-starui/host-data-react/runtime';
import { BookOpen, Database, ListTree, Trash2 } from 'lucide-react';
import {
  clearDemoEventLog,
  getDemoEventLog,
  subscribeDemoEventLog,
  type DemoEventLogEntry,
} from '../state/eventLogStore.js';
import { DemoGuidePanel } from './DemoGuidePanel.js';

type SidebarTab = 'guide' | 'appdata' | 'events';

export function DemoSidebar({ gridId }: { gridId: string }): ReactElement {
  const [tab, setTab] = useState<SidebarTab>('guide');
  const [events, setEvents] = useState<readonly DemoEventLogEntry[]>(() => getDemoEventLog());
  const appData = useAppDataStore();

  useEffect(() => subscribeDemoEventLog(() => setEvents(getDemoEventLog())), []);

  const appDataRows = useMemo(() => {
    return appData.store.list().map((row) => ({
      name: row.name,
      values: row.values,
    }));
  }, [appData.store, appData.version]);

  const tabs: { id: SidebarTab; label: string; icon: ReactElement }[] = [
    { id: 'guide', label: 'Guide', icon: <BookOpen size={14} /> },
    { id: 'appdata', label: 'AppData', icon: <Database size={14} /> },
    { id: 'events', label: 'Events', icon: <ListTree size={14} /> },
  ];

  return (
    <aside
      className="flex w-[380px] shrink-0 flex-col border-r border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]"
      data-testid="platform-hooks-demo-sidebar"
    >
      <header className="border-b border-[color:var(--ds-border-primary)] px-4 py-3">
        <h1 className="text-sm font-semibold">Platform Hooks Demo</h1>
        <p className="mt-1 text-[11px] text-[color:var(--ds-text-secondary)]">
          AppData bootstrap + grid event callbacks
        </p>
        <p className="mt-1 font-mono text-[10px] text-[color:var(--ds-text-muted)]">
          gridId={gridId}
        </p>
      </header>

      <div className="flex gap-1 border-b border-[color:var(--ds-border-primary)] p-2">
        {tabs.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={tab === t.id ? 'secondary' : 'ghost'}
            className="h-7 gap-1 px-2 text-[11px]"
            data-testid={`platform-hooks-tab-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.label}
            {t.id === 'events' && events.length > 0 ? (
              <span className="rounded bg-[color:var(--ds-surface-tertiary)] px-1 font-mono text-[10px]">
                {events.length}
              </span>
            ) : null}
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === 'guide' ? <DemoGuidePanel /> : null}
        {tab === 'appdata' ? (
          <div className="space-y-3" data-testid="appdata-panel">
            <p className="text-[11px] text-[color:var(--ds-text-secondary)]">
              Seeded by <code className="font-mono">appDataBootstrap</code> hooks on hub ready
              (<code className="font-mono">runPolicy: if-missing</code>). Open hub inspector with{' '}
              <kbd className="rounded border px-1 font-mono text-[10px]">Alt+Shift+S</kbd>.
            </p>
            {!appData.loaded ? (
              <p className="text-xs text-[color:var(--ds-text-muted)]" data-testid="appdata-loading">
                Loading AppData…
              </p>
            ) : appDataRows.length === 0 ? (
              <p className="text-xs text-[color:var(--ds-text-muted)]">No AppData rows yet.</p>
            ) : (
              appDataRows.map((row) => (
                <div
                  key={row.name}
                  className="rounded border border-[color:var(--ds-border-primary)] p-2"
                  data-testid={`appdata-row-${row.name}`}
                >
                  <div className="mb-1 text-xs font-semibold">{row.name}</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-[color:var(--ds-text-secondary)]">
                    {JSON.stringify(row.values, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        ) : null}
        {tab === 'events' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-[color:var(--ds-text-secondary)]">
                Handler invocations from bound grid events (newest first).
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 px-2 text-[10px]"
                onClick={() => clearDemoEventLog()}
              >
                <Trash2 size={12} />
                Clear
              </Button>
            </div>
            {events.length === 0 ? (
              <p className="text-xs text-[color:var(--ds-text-muted)]">
                No events yet — bind handlers in Custom Settings, then interact with the grid.
              </p>
            ) : (
              events.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded border border-[color:var(--ds-border-primary)] p-2"
                  data-testid="demo-event-log-entry"
                  data-handler-id={entry.handlerId}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-[color:var(--ds-accent-info)]">
                      {entry.handlerId}
                    </span>
                    <time className="font-mono text-[10px] text-[color:var(--ds-text-muted)]">
                      {entry.at.slice(11, 19)}
                    </time>
                  </div>
                  <p className="mt-1 text-[11px]">{entry.summary}</p>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
