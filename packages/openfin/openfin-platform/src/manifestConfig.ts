// ─── Manifest-driven config service settings ─────────────────────────
//
// Single source of truth for "is REST mode on, and what's the URL?"
// across every window in the platform. Both the Provider window
// (`initWorkspace`) and view-route windows (`<ConfigServiceProvider>`
// hosts) read through this module so a manifest edit can't put the
// two halves of the platform into conflicting modes.
//
// The gate is intentionally explicit: REST mode requires BOTH
// `useRest === true` AND a non-empty `configServiceRestUrl`. Keeping
// the URL configured but `useRest` off lets a single manifest flip
// between local and REST by toggling one boolean.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import type OpenFin from "@openfin/core";

import type { CustomSettings } from "./types";

/**
 * Pure helper: gate the configured REST URL on the `useRest` flag.
 *
 * Returns the URL when REST mode is enabled and a URL is set.
 * Returns `undefined` otherwise — `createConfigManager({...})` treats
 * `undefined` as "stay local," matching the option's JSDoc.
 */
export function resolveRestUrl(
  customSettings: CustomSettings | undefined,
): string | undefined {
  if (!customSettings?.useRest) return undefined;
  const url = customSettings.configServiceRestUrl;
  return typeof url === "string" && url.length > 0 ? url : undefined;
}

/**
 * Read the `customSettings.{useRest, configServiceRestUrl}` pair from
 * the current OpenFin manifest and resolve to a single URL (or
 * `undefined` for local-only mode). Async because OpenFin's manifest
 * read is async.
 *
 * Returns `undefined` when called outside OpenFin (no `fin` global)
 * so plain-browser dev harnesses don't crash on import — the caller
 * can fall back to local-only mode.
 */
export async function getConfigServiceRestUrlFromManifest(): Promise<
  string | undefined
> {
  if (typeof fin === "undefined") return undefined;

  try {
    const app = await fin.Application.getCurrent();
    const manifest = (await app.getManifest()) as OpenFin.Manifest & {
      customSettings?: CustomSettings;
    };
    return resolveRestUrl(manifest.customSettings);
  } catch {
    return undefined;
  }
}
