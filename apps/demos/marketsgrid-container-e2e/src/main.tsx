/**
 * Entry point — boot the data-services platform, then mount React.
 *
 * Boot runs before render so ConfigManager + the SharedWorker hub are
 * ready before the grid attaches to a provider.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import '@wellsfargo-starui/design-system/css';
import { DataHubProvider } from '@wellsfargo-starui/host-data-react/runtime';
import { App } from './App.js';
import { bootstrap } from './bootstrap.js';
import './globals.css';

applyTheme(getTheme());

void bootstrap().then(({ config, platform }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <DataHubProvider platform={platform} userId={config.userId}>
        <App />
      </DataHubProvider>
    </StrictMode>,
  );
});
