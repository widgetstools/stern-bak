/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * Resolve `seedConfigUrl` for fetch at bootstrap.
 *
 * - Absolute `http(s)://` URLs pass through unchanged.
 * - Relative paths (`/seed.json`) resolve against the manifest
 *   `platform.providerUrl` origin so the same manifest works in dev and
 *   when the app is shipped behind any host/port.
 */
export async function resolveSeedConfigUrl(
  seedUrl: string,
  providerUrl?: string,
): Promise<string> {
  const trimmed = seedUrl.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  let base = providerUrl?.trim();
  if (!base && typeof fin !== 'undefined') {
    try {
      const app = await fin.Application.getCurrent();
      const manifest = (await app.getManifest()) as { platform?: { providerUrl?: string } };
      base = manifest.platform?.providerUrl;
    } catch {
      /* manifest unavailable */
    }
  }

  if (!base) return trimmed;

  try {
    const origin = new URL(base).origin;
    const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return new URL(path, origin).href;
  } catch {
    return trimmed;
  }
}
