import { useCallback } from 'react';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid';
import {
  buildLabDemoBundle,
  type LabDemoProfileEntry,
} from '../profiles/labProfileKit';

/** Bump when catalog contents change so devs get a fresh install. */
export const LAB_DEMO_PROFILES_FLAG_VERSION = 'v2';

/** In-memory guard — survives StrictMode double-mount before localStorage is set. */
const installInFlight = new Set<string>();
const installedMemory = new Set<string>();

/**
 * Installs feature-scoped demo profiles into localStorage on first mount.
 */
export function useLabDemoProfiles(
  gridId: string,
  profiles: LabDemoProfileEntry[],
  activeProfileId: string,
) {
  return useCallback(
    (handle: MarketsGridHandle) => {
      if (import.meta.env?.DEV) {
        (globalThis as Record<string, unknown>).__labGrid = handle;
      }

      const flagKey = `lab-demo-profiles-${LAB_DEMO_PROFILES_FLAG_VERSION}:${gridId}`;
      const seeded =
        typeof localStorage !== 'undefined' && localStorage.getItem(flagKey) === '1';
      if (seeded) {
        installedMemory.add(flagKey);
        return;
      }
      // Storage was cleared (e2e reset) or first visit — drop stale in-memory guard.
      installedMemory.delete(flagKey);
      if (installInFlight.has(flagKey)) {
        return;
      }

      if (!handle.setConfig) {
        // eslint-disable-next-line no-console
        console.warn(
          `[lab] setConfig unavailable for ${gridId} — demo profiles not installed.`,
        );
        return;
      }

      installInFlight.add(flagKey);
      installedMemory.add(flagKey);

      const bundle = buildLabDemoBundle(gridId, profiles, activeProfileId);
      void handle
        .setConfig(bundle)
        .then(() => {
          try {
            localStorage.setItem(flagKey, '1');
          } catch {
            /* quota */
          }
        })
        .catch((err) => {
          installedMemory.delete(flagKey);
          // eslint-disable-next-line no-console
          console.warn(`[lab] demo profile install failed (${gridId})`, err);
        })
        .finally(() => {
          installInFlight.delete(flagKey);
        });
    },
    [gridId, profiles, activeProfileId],
  );
}
