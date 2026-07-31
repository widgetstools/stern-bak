import React from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import '@wellsfargo-starui/design-system/css';
import { StarGridApp } from '@wellsfargo-starui/app';
import { createConfigManager, migrateLegacyProfilesIfNeeded } from '@wellsfargo-starui/host-config';
import { App, APP_ID, DEMO_USER_ID, GRID_ID } from './App';
import './globals.css';

applyTheme(getTheme());

const configManager = createConfigManager({
  appId: APP_ID,
  identity: { userId: DEMO_USER_ID, displayName: DEMO_USER_ID },
});

const root = createRoot(document.getElementById('root')!);

async function boot(): Promise<void> {
  await configManager.init();
  try {
    const result = await migrateLegacyProfilesIfNeeded(configManager);
    if (result.ranThisBoot && result.copied > 0) {
      console.info(
        `[profile-migration-v1] copied ${result.copied} legacy profile(s) ` +
          `across ${Object.keys(result.perGrid).length} grid(s) into ConfigService.`,
      );
    }
  } catch (err) {
    console.warn('[profile-migration-v1] unexpected failure:', err);
  }

  root.render(
    <React.StrictMode>
      <StarGridApp
        appId={APP_ID}
        userId={DEMO_USER_ID}
        instanceId={GRID_ID}
        persistence="config"
        configManager={configManager}
      >
        <App />
      </StarGridApp>
    </React.StrictMode>,
  );
}

void boot().catch((err: unknown) => {
  console.error('[demo-react] boot failed:', err);
});
