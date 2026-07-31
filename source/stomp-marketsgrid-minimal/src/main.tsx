/**
 * Entry point — Phase 1 (boot) then Phase 2 (React context).
 *
 * Boot runs before render so ConfigManager + SharedWorker hub are ready
 * before any hook or grid attach. See README.md for the full sequence.
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

// bootstrap() → resolvePlatformBootstrapFromJson + ensurePlatformReady
// (main-thread ConfigManager.init, SharedWorker spawn, catalog/AppData hydrate).
void bootstrap().then(({ config, platform }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/*
        DataHubProvider — exposes hub bundle to React (client, appData,
        configStore). Does not re-run ensurePlatformReady when `platform`
        is passed; bootstrap() already completed above.
      */}
      <DataHubProvider platform={platform} userId={config.userId}>
        <App />
      </DataHubProvider>
    </StrictMode>,
  );
});
