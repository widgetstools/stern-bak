/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { openOpenFinPopout } from '@wellsfargo-starui/openfin/host';
import { getPlatformDefaultScope } from './db.js';
import { buildPlatformChildUrl } from './buildPlatformChildUrl.js';

/**
 * Resolve the web app origin for child tool windows (config browser,
 * data providers, etc.). Uses the manifest `platform.providerUrl` —
 * same as the workspace shell — so URLs stay correct when the current
 * script runs inside an OpenFin **View** whose `window.location` may
 * not match the Vite app origin.
 *
 * The manifest never changes for the lifetime of the platform, so the
 * resolved origin is cached after the first successful lookup — repeat
 * opens skip two `fin` IPC round trips. Failed lookups are not cached
 * so a transient manifest error doesn't poison every later open.
 */
let cachedProviderUrl: Promise<string | undefined> | undefined;

/** Test-only: drop the manifest origin cache between vitest cases. */
export function __resetOpenChildToolWindowCacheForTests(): void {
  cachedProviderUrl = undefined;
}

function resolveProviderUrl(): Promise<string | undefined> {
  if (!cachedProviderUrl) {
    cachedProviderUrl = (async (): Promise<string | undefined> => {
      try {
        const app = await fin.Application.getCurrent();
        const manifest: Record<string, unknown> = await app.getManifest();
        const platformConfig = manifest.platform as Record<string, string> | undefined;
        const providerUrl = platformConfig?.providerUrl ?? '';
        // Validate up front so a bad manifest doesn't get cached.
        return new URL(providerUrl).href;
      } catch {
        return undefined;
      }
    })().then((url) => {
      if (url === undefined) cachedProviderUrl = undefined;
      return url;
    });
  }
  return cachedProviderUrl;
}

/**
 * Open or focus a named OpenFin platform window at `path` (may include
 * `?query`). Uses manifest-derived origin (not `window.location`).
 *
 * The open/focus/navigate mechanics live in ONE place —
 * `openOpenFinPopout` (`@wellsfargo-starui/openfin/host`), the same
 * implementation behind `OpenFinRuntime.openSurface`. This wrapper only
 * adds what tool windows need: the manifest-origin resolution above and
 * an inspectable context menu (`contextMenuSettings.devtools` adds the
 * "Inspect" entry, `reload` a "Reload" entry — `contextMenu: true`
 * alone only enables the default menu).
 */
export async function openChildToolWindow(
  name: string,
  path: string,
  width: number,
  height: number,
  extraOptions?: Record<string, any>,
): Promise<void> {
  const providerUrl = await resolveProviderUrl();
  const url = providerUrl ? buildPlatformChildUrl(providerUrl, path) : null;
  if (!url) {
    console.error(`[openChildToolWindow] Could not determine origin for "${name}"`);
    return;
  }

  console.log(`[openChildToolWindow] Opening "${name}" at "${path}"`);

  try {
    await openOpenFinPopout('popout', {
      name,
      url,
      width,
      height,
      windowOptions: {
        contextMenuSettings: { enable: true, devtools: true, reload: true },
        ...extraOptions,
      },
    });
  } catch (err) {
    console.error(`[openChildToolWindow] Failed to open "${name}"`, err);
  }
}

/**
 * Open the Data Providers editor the same way the dock does: manifest
 * origin, named window `data-providers`, and `customData` scope for
 * config rows. Optional `providerId` becomes `?id=` so the editor
 * selects that row (no cross-window messaging — URL only).
 */
export async function openDataProvidersToolWindow(opts?: {
  providerId?: string;
}): Promise<void> {
  const scope = getPlatformDefaultScope();
  const qs = opts?.providerId ? `?id=${encodeURIComponent(opts.providerId)}` : '';
  const path = `/dataproviders${qs}`;
  await openChildToolWindow('data-providers', path, 1180, 760, {
    customData: { appId: scope.appId, userId: scope.userId },
  });
}
