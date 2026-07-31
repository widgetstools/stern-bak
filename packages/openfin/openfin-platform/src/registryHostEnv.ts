/**
 * Registry editor — read the host app's launch env from OpenFin
 * `customData`. Used to pre-fill the `appId` + `configServiceUrl`
 * fields on new registry entries and to lock them when
 * `usesHostConfig === true`.
 *
 * Dev-mode fallback: when `fin` is undefined (vite browser tab,
 * storybook, tests), returns sensible defaults so the editor can
 * still boot without crashing. In that case validations that depend
 * on hostEnv equality may be too lenient — that's the expected
 * trade-off for being able to develop the editor out of OpenFin.
 */

import { resolveBootstrapManifestScope } from './platformBootstrap';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

export interface HostEnv {
  appId: string;
  /**
   * The signed-in user id under which this child window should persist
   * its data. Forwarded by the parent provider via `customData.userId`
   * so child editors save to the same `(appId, userId)` scope the
   * provider operates under. Optional so producers (e.g. demo apps
   * that build a HostEnv manually for `encodeHostEnvForQueryString`)
   * don't have to know about the field — `readHostEnv()` always
   * resolves it to a string (empty when the parent didn't forward it).
   */
  userId?: string;
  configServiceUrl: string;
}

/**
 * Canonical user id when manifest / bootstrap config omits `userId`.
 * Prefer {@link PlatformBootstrapConfig.userId} from manifest
 * `customSettings` or web `app-config.json`.
 */
export const DEFAULT_USER_ID = 'dev1';

/**
 * Canonical app id when manifest / bootstrap config omits `appId`.
 * Prefer {@link PlatformBootstrapConfig.appId} from manifest
 * `customSettings` or web `app-config.json`.
 */
// Re-exported from the leaf constants module (moved to break the
// platformBootstrap ↔ registryHostEnv runtime cycle).
import { DEFAULT_APP_ID } from './defaultAppId.js';
export { DEFAULT_APP_ID } from './defaultAppId.js';

const DEV_FALLBACK: HostEnv = {
  appId: DEFAULT_APP_ID,
  userId: DEFAULT_USER_ID,
  configServiceUrl: 'http://localhost:0000',
};

/**
 * Read `customData.{appId, configServiceUrl}` from the OpenFin window
 * that hosts the editor. Falls back to dev defaults out of OpenFin.
 *
 * NEVER throws — the editor's job is to render even in degraded envs.
 * If host env is genuinely missing in OpenFin, the returned object
 * carries empty strings (for appId / configServiceUrl) and `DEFAULT_USER_ID`
 * for userId, and the editor's UI can detect + surface the missing
 * appId/url case via `isHostEnvMissing()`.
 *
 * Resolution priority:
 *   1. OpenFin `fin.me.customData.{appId, configServiceUrl}` — real
 *      launches inside a workspace window. Empty / missing `userId`
 *      falls through to `DEFAULT_USER_ID` so we never persist rows
 *      under an empty-string userId.
 *   2. URL query param `?hostEnv=<base64(json)>` — used by popups spawned
 *      from non-OpenFin demo apps that need to pass host identity
 *      without a framework. Same userId fallback as path (1).
 *   3. DEV_FALLBACK — only applies when nothing else is available.
 */
export async function readHostEnv(): Promise<HostEnv> {
  // 1. OpenFin — customSettings.appId / userId for deployment identity;
  //    configServiceUrl from customData.
  if (typeof fin !== 'undefined') {
    try {
      const opts = await fin.me.getOptions();
      const cd = opts?.customData;
      const configServiceUrl = typeof cd?.configServiceUrl === 'string' ? cd.configServiceUrl : '';
      let appId = typeof cd?.appId === 'string' && cd.appId.length > 0 ? cd.appId : '';
      let userId = typeof cd?.userId === 'string' && cd.userId.length > 0 ? cd.userId : '';
      if (!appId || !userId) {
        const bootstrap = await resolveBootstrapManifestScope();
        if (bootstrap) {
          if (!appId) appId = bootstrap.appId;
          if (!userId) userId = bootstrap.userId;
        }
      }
      return {
        appId: appId || DEFAULT_APP_ID,
        userId: userId || DEFAULT_USER_ID,
        configServiceUrl,
      };
    } catch {
      const bootstrap = await resolveBootstrapManifestScope();
      if (bootstrap) {
        return { ...bootstrap, configServiceUrl: '' };
      }
      return { appId: DEFAULT_APP_ID, userId: DEFAULT_USER_ID, configServiceUrl: '' };
    }
  }

  // 2. Query string override — for standalone-browser popups spawned
  //    by a parent demo/dev app. Shape:
  //      ?hostEnv=<base64(JSON.stringify({ configServiceUrl }))>
  //    appId / userId are pinned and not honoured from the query.
  const qsEnv = readHostEnvFromQueryString();
  if (qsEnv) return qsEnv;

  // 3. Web bootstrap (`app-config.json`) before dev fallback
  const bootstrap = await resolveBootstrapManifestScope();
  if (bootstrap) {
    return { ...bootstrap, configServiceUrl: DEV_FALLBACK.configServiceUrl };
  }

  // 4. Dev fallback
  return DEV_FALLBACK;
}

function readHostEnvFromQueryString(): HostEnv | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = new URLSearchParams(window.location.search).get('hostEnv');
    if (!raw) return null;
    const decoded = JSON.parse(atob(raw)) as Partial<HostEnv>;
    // appId / userId are pinned — decoded values for them are
    // intentionally ignored (same reason as the OpenFin path).
    const configServiceUrl = typeof decoded.configServiceUrl === 'string' ? decoded.configServiceUrl : '';
    if (!configServiceUrl) return null;
    return { appId: DEFAULT_APP_ID, userId: DEFAULT_USER_ID, configServiceUrl };
  } catch {
    return null;
  }
}

/**
 * Helper — encode a HostEnv for use as the `?hostEnv=` query-string
 * override. Symmetric with the decoder inside `readHostEnv`.
 */
export function encodeHostEnvForQueryString(env: HostEnv): string {
  return btoa(JSON.stringify(env));
}

/** True when readHostEnv returned empty fields inside a real OpenFin
 *  context — the editor should surface a "host manifest not configured"
 *  warning banner when this is true. */
export function isHostEnvMissing(env: HostEnv): boolean {
  return !env.appId || !env.configServiceUrl;
}
