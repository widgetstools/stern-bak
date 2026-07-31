import { writeCrossWindowItem, readCrossWindowItem } from './crossWindowStorage.js';

const WORKER_BOOTSTRAP_PREFIX = 'starui:worker-bootstrap:';

/** Deployment fields consumed by the SharedWorker `defaultEntry` at hub boot. */
export interface WorkerBootstrapPayload {
  appId: string;
  userId: string;
  seedConfigUrl?: string;
  seedConfigReload?: 'empty-only' | 'when-changed';
  configServiceRestUrl?: string;
}

function storageKey(appName: string): string {
  return `${WORKER_BOOTSTRAP_PREFIX}${appName}`;
}

/**
 * Persist bootstrap fields for the worker entry to read on first boot.
 * Uses localStorage (not the worker script URL) so Vite dev `@fs/` URLs
 * are not broken by extra query parameters.
 */
export function writeWorkerBootstrapPayload(
  appName: string,
  payload: WorkerBootstrapPayload,
): void {
  writeCrossWindowItem(storageKey(appName), JSON.stringify(payload));
}

/** Read bootstrap fields written by the main thread before worker spawn. */
export function readWorkerBootstrapPayload(
  appName: string,
): WorkerBootstrapPayload | null {
  try {
    const raw = readCrossWindowItem(storageKey(appName));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkerBootstrapPayload>;
    if (
      typeof parsed.appId === 'string'
      && parsed.appId.trim().length > 0
      && typeof parsed.userId === 'string'
      && parsed.userId.trim().length > 0
    ) {
      return {
        appId: parsed.appId.trim(),
        userId: parsed.userId.trim(),
        seedConfigUrl: typeof parsed.seedConfigUrl === 'string'
          ? parsed.seedConfigUrl
          : undefined,
        seedConfigReload: parsed.seedConfigReload === 'when-changed'
          ? 'when-changed'
          : undefined,
        configServiceRestUrl: typeof parsed.configServiceRestUrl === 'string'
          ? parsed.configServiceRestUrl
          : undefined,
      };
    }
  } catch {
    /* corrupt payload */
  }
  return null;
}

/** Parse `appName` from SharedWorker `name` (`mkt-data-services:${appId}`). */
export function appNameFromWorkerName(workerName: string): string | null {
  const prefix = 'mkt-data-services:';
  if (!workerName.startsWith(prefix)) return null;
  const appName = workerName.slice(prefix.length).trim();
  return appName.length > 0 ? appName : null;
}

/** Test-only — clears all worker bootstrap payloads. */
export function _resetWorkerBootstrapPayloadForTests(): void {
  if (typeof localStorage === 'undefined' && typeof sessionStorage === 'undefined') {
    return;
  }
  for (const store of [localStorage, sessionStorage]) {
    if (typeof store === 'undefined') continue;
    try {
      for (let i = store.length - 1; i >= 0; i -= 1) {
        const key = store.key(i);
        if (key?.startsWith(WORKER_BOOTSTRAP_PREFIX)) {
          store.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    }
  }
}
