import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import '@wellsfargo-starui/design-system/css';
import { StarGridApp } from '@wellsfargo-starui/app';
import { createConfigManager } from '@wellsfargo-starui/host-config';
import { BrowserRuntime } from '@wellsfargo-starui/host-browser';
import './globals.css';
import { App } from './App';
import { ConfigBrowserPopout } from './ConfigBrowserPopout';

applyTheme(getTheme());

const params = new URLSearchParams(window.location.search);
const isConfigBrowserPopup = params.get('configBrowser') === '1';

const runtime = new BrowserRuntime({
  identity: {
    appId: 'demo-configservice-react',
    userId: 'dev1',
    instanceId: 'demo-blotter-v2',
    componentType: 'MarketsGrid',
  },
});

const configManager = createConfigManager({
  configServiceRestUrl: import.meta.env.VITE_CONFIG_SERVICE_URL || undefined,
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StarGridApp
      appId="demo-configservice-react"
      runtime={runtime}
      configManager={configManager}
      persistence="config"
    >
      {isConfigBrowserPopup ? <ConfigBrowserPopout /> : <App />}
    </StarGridApp>
  </React.StrictMode>,
);
