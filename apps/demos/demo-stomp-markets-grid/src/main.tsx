import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
/** Tokens + shadcn channels — safe as a standalone Vite CSS entry (includes @tailwind). */
import '@wellsfargo-starui/design-system/css';
import { Alert, AlertDescription, AlertTitle } from '@wellsfargo-starui/ui';
import { DataHubProvider } from '@wellsfargo-starui/host-data-react/runtime';
import { initPlatformBootstrap } from './platformBootstrap.js';
import { BrowserApp } from './BrowserApp.js';
import './globals.css';

applyTheme(getTheme());

type View = 'browser' | 'provider' | 'blotter';

function resolveView(): View {
  if (typeof window === 'undefined') return 'browser';
  const v = new URLSearchParams(window.location.search).get('view');
  if (v === 'provider') return 'provider';
  if (v === 'blotter') return 'blotter';
  return 'browser';
}

const Provider = lazy(() => import('./platform/Provider.js').then((m) => ({ default: m.Provider })));
const BlotterView = lazy(() => import('./views/BlotterView.js').then((m) => ({ default: m.BlotterView })));

function BootstrapError({ error }: { error: Error }) {
  return (
    <div className="flex h-screen items-center justify-center bg-[color:var(--ds-surface-ground)] p-8">
      <Alert variant="destructive" className="max-w-lg">
        <AlertTitle>Data services unavailable</AlertTitle>
        <AlertDescription>
          <pre className="mt-2 overflow-x-auto text-[12px]">{error.message}</pre>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function AppShell({ view }: { view: View }) {
  if (view === 'browser') return <BrowserApp />;
  if (view === 'provider') return <Provider />;
  return <BlotterView />;
}

const rootElement = document.getElementById('root')!;
const view = resolveView();

void initPlatformBootstrap()
  .then(({ config, platform }) => {
    createRoot(rootElement).render(
      <StrictMode>
        <DataHubProvider platform={platform} userId={config.userId}>
          <Suspense fallback={<div className="p-4 text-sm">Loading…</div>}>
            <AppShell view={view} />
          </Suspense>
        </DataHubProvider>
      </StrictMode>,
    );
  })
  .catch((err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));
    createRoot(rootElement).render(
      <StrictMode>
        <BootstrapError error={error} />
      </StrictMode>,
    );
  });
