/**
 * openfin-workspace entry — multi-view OpenFin app.
 *
 * The platform manifest spawns this app's URL with `?view=<name>` to
 * select which view component the router mounts:
 *
 *   ?view=provider   → Provider (calls initWorkspace; idle hidden window)
 *   ?view=blotter    → Blotter (HostedMarketsGrid + mock hub provider)
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import { DataHubProvider } from '@wellsfargo-starui/host-data-react/runtime';
import { initPlatformBootstrap } from './platformBootstrap';
import './globals.css';

applyTheme(getTheme());

type View = 'provider' | 'blotter';

function resolveView(): View {
  if (typeof window === 'undefined') return 'blotter';
  const q = new URLSearchParams(window.location.search);
  const v = q.get('view');
  if (v === 'provider' || v === 'blotter') return v;
  return 'blotter';
}

const Provider = React.lazy(() => import('./platform/Provider').then((m) => ({ default: m.Provider })));
const Blotter = React.lazy(() => import('./views/Blotter').then((m) => ({ default: m.Blotter })));

const view = resolveView();
const root = createRoot(document.getElementById('root')!);

void initPlatformBootstrap()
  .then(({ config, platform }) => {
    root.render(
      <React.StrictMode>
        <DataHubProvider platform={platform} userId={config.userId}>
          <React.Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
            {view === 'provider' ? <Provider /> : <Blotter />}
          </React.Suspense>
        </DataHubProvider>
      </React.StrictMode>,
    );
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    root.render(
      <div data-testid="openfin-workspace-bootstrap-error" style={{ padding: 24 }}>
        Data services bootstrap failed: {message}
      </div>,
    );
  });
