/**
 * Browser-blotter entry — single-page e2e target.
 *
 * URL routing: `?mode=<standalone|provider|config|full>`. Default = full.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import { DataHubProvider } from '@wellsfargo-starui/host-data-react/runtime';
import { App, type AppMode } from './App';
import { initPlatformBootstrap } from './platformBootstrap';
import './globals.css';

applyTheme(getTheme());

function resolveMode(): AppMode {
  if (typeof window === 'undefined') return 'full';
  const q = new URLSearchParams(window.location.search);
  const m = q.get('mode');
  if (m === 'standalone' || m === 'provider' || m === 'config' || m === 'full') return m;
  return 'full';
}

const mode = resolveMode();
const root = createRoot(document.getElementById('root')!);

function renderApp() {
  root.render(
    <React.StrictMode>
      <App mode={mode} />
    </React.StrictMode>,
  );
}

if (mode === 'standalone') {
  renderApp();
} else {
  void initPlatformBootstrap()
    .then(({ config, platform }) => {
      root.render(
        <React.StrictMode>
          <DataHubProvider platform={platform} userId={config.userId}>
            <App mode={mode} />
          </DataHubProvider>
        </React.StrictMode>,
      );
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      root.render(
        <div data-testid="browser-blotter-bootstrap-error" style={{ padding: 24 }}>
          Data services bootstrap failed: {message}
        </div>,
      );
    });
}
