/// <reference path="./fin.d.ts" />

/**
 * Cross-window theme-sync primitive.
 *
 * The dock theme toggle fans the new scheme out two ways from the platform
 * provider window: it publishes the OpenFin IAB `theme-changed` topic AND it
 * writes the canonical `THEME_STORAGE_KEY` in `localStorage`. A window that
 * lives outside the `StarGridApp` / `OpenFinRuntime` shell (config browser,
 * data-provider editor, workspace setup) receives neither unless it subscribes
 * itself — which is why those tool windows used to freeze on their boot theme.
 *
 * `subscribeThemeBroadcast` listens on BOTH transports so a window stays in
 * sync regardless of how the toggle reached it:
 *   • IAB `theme-changed` with a wildcard sender uuid (`{ uuid: '*' }`) — the
 *     dock publishes from the platform provider, whose uuid may differ from
 *     the listening window's own; the wildcard avoids that mismatch (the same
 *     reason `OpenFinRuntime` uses `'*'`).
 *   • same-origin `storage` events on `THEME_STORAGE_KEY` — fired in every
 *     other window of the origin when the dock writes `localStorage`, so the
 *     sync works even if IAB is unreachable.
 */
import type { Theme } from '@wellsfargo-starui/types';
import { THEME_STORAGE_KEY } from '@wellsfargo-starui/types';

/**
 * Read a theme value out of a `theme-changed` IAB payload. The dock
 * historically published `{ isDark: boolean }`; the runtime publishes
 * `{ theme: 'dark' | 'light', isDark }` for forward compat. Accepts either
 * shape so cross-version windows keep syncing.
 */
export function readThemePayload(msg: unknown): Theme | null {
  if (!msg || typeof msg !== 'object') return null;
  const m = msg as { theme?: unknown; isDark?: unknown };
  if (m.theme === 'dark' || m.theme === 'light') return m.theme;
  if (typeof m.isDark === 'boolean') return m.isDark ? 'dark' : 'light';
  return null;
}

/**
 * Subscribe to dock theme-toggle changes. `onTheme` fires with the new theme
 * each time the dock flips schemes. Returns a disposer that detaches both
 * transports. Safe to call outside OpenFin (the IAB leg is skipped) and
 * outside a DOM (the storage leg is skipped).
 */
export function subscribeThemeBroadcast(onTheme: (theme: Theme) => void): () => void {
  const disposers: Array<() => void> = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finGlobal = (globalThis as any).fin;
  const iab = finGlobal?.InterApplicationBus;
  if (iab?.subscribe) {
    const handler = (msg: unknown) => {
      const next = readThemePayload(msg);
      if (next) onTheme(next);
    };
    try {
      void iab.subscribe({ uuid: '*' }, 'theme-changed', handler);
      disposers.push(() => {
        try {
          void iab.unsubscribe({ uuid: '*' }, 'theme-changed', handler);
        } catch {
          /* swallow — best-effort cleanup */
        }
      });
    } catch {
      /* swallow — IAB not reachable */
    }
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      if (e.newValue === 'dark' || e.newValue === 'light') onTheme(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    disposers.push(() => window.removeEventListener('storage', onStorage));
  }

  return () => {
    for (const dispose of disposers) {
      try {
        dispose();
      } catch {
        /* swallow */
      }
    }
  };
}
