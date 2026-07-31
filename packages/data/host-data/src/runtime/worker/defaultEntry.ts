/**
 * Default SharedWorker entry for `@wellsfargo-starui/host-data`.
 *
 * Bootstrap fields (`appId`, `userId`, seed URL, REST URL) are read from
 * localStorage (written by `createDataServicesWorker` before spawn) — not
 * from the script URL — so Vite dev `@fs/` worker URLs stay clean.
 *
 * Apps that need bespoke worker setup should keep their own worker file and
 * call `installSharedWorkerHub({...})` directly.
 */

import { installSharedWorkerHub } from './index.js';
import { createConfigManager } from '@wellsfargo-starui/host-config';
import {
  appNameFromWorkerName,
  readWorkerBootstrapPayload,
} from '../../bootstrap/workerBootstrapPayload.js';

function readWorkerBootstrapParams(): {
  configServiceRestUrl: string | undefined;
  appId: string | undefined;
  userId: string | undefined;
  seedConfigUrl: string | undefined;
  seedConfigReload: 'empty-only' | 'when-changed' | undefined;
} {
  const workerName = typeof self.name === 'string' ? self.name : '';
  const appName = appNameFromWorkerName(workerName);
  if (!appName) {
    return {
      configServiceRestUrl: undefined,
      appId: undefined,
      userId: undefined,
      seedConfigUrl: undefined,
      seedConfigReload: undefined,
    };
  }

  const payload = readWorkerBootstrapPayload(appName);
  if (!payload) {
    return {
      configServiceRestUrl: undefined,
      appId: undefined,
      userId: undefined,
      seedConfigUrl: undefined,
      seedConfigReload: undefined,
    };
  }

  return {
    configServiceRestUrl: payload.configServiceRestUrl,
    appId: payload.appId,
    userId: payload.userId,
    seedConfigUrl: payload.seedConfigUrl,
    seedConfigReload: payload.seedConfigReload,
  };
}

async function boot(): Promise<void> {
  const {
    configServiceRestUrl,
    appId,
    userId,
    seedConfigUrl,
    seedConfigReload,
  } = readWorkerBootstrapParams();

  const configManager = createConfigManager({
    configServiceRestUrl,
    appId,
    identity: userId
      ? { userId, displayName: userId }
      : undefined,
    seedConfigUrl,
    seedConfigReload,
  });
  // Full init (including seedIfEmpty) is intentional and must stay. The
  // worker is the deterministic seeder + the stale-warm safety net: a
  // SharedWorker has no localStorage/sessionStorage, so it cannot read
  // the cross-window "warm" marker and therefore cannot attach the way a
  // warm main-thread window does. seedIfEmpty's in-lock emptiness check
  // makes this a no-op (no fetch, no write) whenever the DB is already
  // populated, so there is no redundant work to "optimize away" here —
  // converting this to attach mode would silently break recovery after a
  // wiped IndexedDB. See docs/CONFIG_SERVICE_BASELINE.md §4.5.
  await configManager.init();
  await installSharedWorkerHub({ configManager });
  // eslint-disable-next-line no-console
  console.info(
    `[@wellsfargo-starui/host-data worker] ConfigManager initialised (mode: ${configManager.isRestMode() ? 'REST' : 'local'})`,
  );
  // eslint-disable-next-line no-console
  console.info('[@wellsfargo-starui/host-data worker] catalog + AppData hydrated; hub waiting for ports');
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[@wellsfargo-starui/host-data worker] boot failed', err);
  throw err;
});
