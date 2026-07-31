import { useCallback, useEffect, useState } from 'react';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import { Button } from '@wellsfargo-starui/ui';
import { useDataServices, useUserIdFromContext } from '@wellsfargo-starui/host-data-react/runtime';
import { Moon, Radio, Sun, Table2 } from 'lucide-react';
import { ensureStompProvider } from './ensureStompProvider';
import { PositionsBlotter } from './views/PositionsBlotter';
import { ProviderSetupPage } from './views/ProviderSetupPage';

type AppTab = 'grid' | 'editor';

export function App() {
  const { configStore } = useDataServices();
  const userId = useUserIdFromContext();
  const [tab, setTab] = useState<AppTab>('grid');
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => getTheme().theme as 'dark' | 'light');
  const isDark = theme === 'dark';

  useEffect(() => {
    let cancelled = false;
    ensureStompProvider(configStore, userId)
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  const handleToggleTheme = useCallback(() => {
    const next: 'dark' | 'light' = isDark ? 'light' : 'dark';
    applyTheme({ theme: next });
    setTheme(next);
  }, [isDark]);

  if (initError) {
    return (
      <div className="flex h-screen items-center justify-center bg-[color:var(--ds-surface-ground)] p-6">
        <div className="max-w-lg rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-4 font-mono text-[13px] text-[color:var(--ds-text-secondary)]">
          Failed to seed STOMP provider: {initError}
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-[color:var(--ds-surface-ground)]">
        <p className="font-mono text-[13px] text-[color:var(--ds-text-secondary)]">
          Seeding STOMP provider…
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[color:var(--ds-surface-ground)] text-[color:var(--ds-text-primary)]">
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-4">
        <span className="font-mono text-[13px] font-semibold tracking-tight">my-stomp-app</span>
        <span className="text-[color:var(--ds-text-faint)]">·</span>
        <span className="text-[12px] text-[color:var(--ds-text-secondary)]">
          STOMP DataProvider + MarketsGrid
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={tab === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('grid')}
            className="h-7 gap-1.5 font-mono text-[11px]"
          >
            <Table2 size={13} strokeWidth={1.75} />
            Positions Blotter
          </Button>
          <Button
            variant={tab === 'editor' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab('editor')}
            className="h-7 gap-1.5 font-mono text-[11px]"
          >
            <Radio size={13} strokeWidth={1.75} />
            Provider Editor
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={handleToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="h-7 w-7 border-[color:var(--ds-border-primary)]"
          >
            {isDark ? <Sun size={13} strokeWidth={1.75} /> : <Moon size={13} strokeWidth={1.75} />}
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        {tab === 'grid' ? <PositionsBlotter /> : <ProviderSetupPage />}
      </main>

      <footer className="shrink-0 border-t border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-4 py-1.5">
        <p className="font-mono text-[10px] text-[color:var(--ds-text-faint)]">
          Start stomp-view-server: <code className="text-[color:var(--ds-text-secondary)]">npm run dev:stomp</code>
          {' · '}
          Press <strong className="text-[color:var(--ds-text-secondary)]">Alt+Shift+P</strong> (Win/Linux) or{' '}
          <strong className="text-[color:var(--ds-text-secondary)]">Option+Shift+P</strong> /{' '}
          <strong className="text-[color:var(--ds-text-secondary)]">Cmd+Shift+P</strong> (Mac) to show the Provider toolbar, then select{' '}
          <strong className="text-[color:var(--ds-text-secondary)]">STOMP Positions (local)</strong>
        </p>
      </footer>
    </div>
  );
}
