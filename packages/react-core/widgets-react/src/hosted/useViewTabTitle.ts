/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react';

declare const fin: any;

/**
 * useViewTabTitle — two-way binding between the grid caption and the
 * host OpenFin view's tab name.
 *
 * The tab name is the value the workspace tabstrip shows. It is driven
 * by `document.title` (default `titlePriority: 'document'`) and
 * persisted in the view's `customData.savedTitle` — the same key the
 * "Save Tab As…" rename popout writes (see `RenameViewTab.tsx` /
 * `viewTabRename.ts`). `OpenFinRuntime` reapplies `savedTitle` to
 * `document.title` on boot, so it survives workspace save/restore.
 *
 * Behaviour:
 *   - Seeds the caption from `customData.savedTitle`, falling back to
 *     `fallback` (the component name) when no tab name has been chosen.
 *   - Listens for the view's `options-changed` event so an external
 *     "Save Tab As…" rename flows back into the caption immediately —
 *     no standing IPC. Runtimes without the event API fall back to a
 *     1 s `getOptions` poll (one IPC round-trip per second per view,
 *     which is why the event path is preferred).
 *   - `setTitle` writes BOTH `document.title` (drives the tabstrip
 *     immediately) and `customData.savedTitle` (persistence), mirroring
 *     the rename popout's own write — so a caption edit seeds the tab
 *     name.
 *
 * Outside an OpenFin runtime it returns `fallback` and `setTitle` only
 * updates local state (there is no tab to drive).
 */

const POLL_MS = 1000;

function isOpenFin(): boolean {
  return typeof (globalThis as { fin?: unknown }).fin !== 'undefined';
}

function readSavedTitle(customData: unknown): string | null {
  if (!customData || typeof customData !== 'object') return null;
  const value = (customData as { savedTitle?: unknown }).savedTitle;
  return typeof value === 'string' && value.trim() ? value : null;
}

export interface ViewTabTitle {
  /** Current tab name — `savedTitle` when set, else `fallback`. */
  title: string;
  /** Persist a new tab name: drives `document.title` + `savedTitle`. */
  setTitle: (next: string) => void;
}

export function useViewTabTitle(fallback: string): ViewTabTitle {
  const [title, setTitleState] = useState(fallback);
  // Last value we observed or wrote — lets the poll react only to
  // genuine external changes and avoids fighting our own writes.
  const lastSeenRef = useRef<string>(fallback);

  useEffect(() => {
    if (!isOpenFin() || typeof fin?.me?.getOptions !== 'function') return;
    let cancelled = false;

    const applySaved = (customData: unknown): void => {
      const saved = readSavedTitle(customData);
      if (cancelled || !saved || saved === lastSeenRef.current) return;
      lastSeenRef.current = saved;
      setTitleState(saved);
    };

    const sync = async (): Promise<void> => {
      try {
        const opts = await fin.me.getOptions();
        applySaved(opts?.customData);
      } catch {
        /* view not reachable yet — the next event/tick retries */
      }
    };

    void sync();

    // Event-driven path: `options-changed` fires with the updated
    // options whenever anything (the rename popout, workspace restore)
    // writes them — zero standing IPC.
    if (typeof fin?.me?.on === 'function' && typeof fin?.me?.removeListener === 'function') {
      const handler = (evt: { options?: { customData?: unknown } }): void => {
        const customData = evt?.options?.customData;
        if (customData !== undefined) applySaved(customData);
        else void sync();
      };
      try {
        fin.me.on('options-changed', handler);
        return () => {
          cancelled = true;
          try { fin.me.removeListener('options-changed', handler); } catch { /* view gone */ }
        };
      } catch {
        /* subscription unsupported — fall through to the poll */
      }
    }

    const timer = setInterval(() => void sync(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const setTitle = useCallback((next: string) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === lastSeenRef.current) return;
    lastSeenRef.current = trimmed;
    setTitleState(trimmed);

    if (!isOpenFin() || typeof fin?.me?.updateOptions !== 'function') return;
    try {
      if (typeof document !== 'undefined') document.title = trimmed;
    } catch {
      /* best-effort */
    }
    void (async () => {
      try {
        const opts = await fin.me.getOptions();
        const cd = (opts?.customData ?? {}) as Record<string, unknown>;
        if (cd.savedTitle !== trimmed) {
          await fin.me.updateOptions({ customData: { ...cd, savedTitle: trimmed } });
        }
      } catch {
        /* best-effort — document.title already drives the tabstrip */
      }
    })();
  }, []);

  return { title, setTitle };
}
