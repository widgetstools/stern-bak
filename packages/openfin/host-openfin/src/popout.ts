/// <reference path="./fin.d.ts" />

/**
 * popout.ts — open or focus a named OpenFin platform window for the
 * `RuntimePort.openSurface({ kind: 'popout' })` contract.
 *
 * Creation goes through `fin.Platform.getCurrentSync().createWindow(...)`
 * so the resulting window is workspace-aware: it participates in
 * `Platform.snapshot()` save/restore, can be docked with platform views,
 * and shows up in workspace tooling. Existing-window dedup still uses
 * `fin.Window.wrapSync({ uuid, name })`, which is identity-based and
 * agnostic to how the window was created.
 *
 * Lives in `runtime-openfin` so the runtime port can implement
 * openSurface without taking a dependency on the platform package —
 * the platform package calls into the runtime, not the other way round.
 *
 * Returns a `SurfaceHandle` whose `close`/`focus` map to OpenFin
 * window APIs and whose `onClosed` listens for the window's
 * `closed` event.
 */

import type { SurfaceHandle, SurfaceKind } from '@wellsfargo-starui/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface OpenFinPopoutOpts {
  /** Stable window name. A second open() with the same name focuses the existing window. */
  readonly name: string;
  /** Absolute URL to load. Caller is responsible for query-string encoding of payload. */
  readonly url: string;
  /** Window size in CSS pixels. */
  readonly width: number;
  /** Window size in CSS pixels. */
  readonly height: number;
  /**
   * Forwarded onto `fin.Window.create({ customData })`. The child
   * window reads it back via `fin.me.getOptions()`.
   */
  readonly customData?: Readonly<Record<string, unknown>>;
  /**
   * Extra `platform.createWindow` options spread AFTER the defaults, so
   * callers can override or extend them (e.g. `contextMenuSettings` for
   * inspectable tool windows). Applies to creation only — an existing
   * window is focused/navigated, not reconfigured.
   */
  readonly windowOptions?: Readonly<Record<string, unknown>>;
}

function urlsSameDocument(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin && ua.pathname === ub.pathname && ua.search === ub.search;
  } catch {
    return false;
  }
}

/**
 * Open or focus an OpenFin child window. Caller passes a fully-formed
 * URL — payload encoding (query string vs `customData`) is the
 * caller's choice.
 */
export async function openOpenFinPopout(
  kind: SurfaceKind,
  opts: OpenFinPopoutOpts,
): Promise<SurfaceHandle> {
  if (typeof fin === 'undefined') {
    throw new Error('[runtime-openfin/popout] fin is not available.');
  }

  // Try to wrap an existing window; if found, navigate it.
  let win: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    win = fin.Window.wrapSync({ uuid: fin.me.identity.uuid, name: opts.name });
    const info = await win.getInfo();
    await win.setAsForeground();
    const currentUrl = typeof info?.url === 'string' ? info.url : '';
    if (!currentUrl || !urlsSameDocument(currentUrl, opts.url)) {
      await win.navigate(opts.url);
    }
  } catch {
    // No existing window — create one via the platform so it's
    // workspace-aware (saveable in Platform snapshots, dockable).
    const platform = fin.Platform.getCurrentSync();
    win = await platform.createWindow({
      name: opts.name,
      url: opts.url,
      defaultWidth: opts.width,
      defaultHeight: opts.height,
      autoShow: true,
      frame: true,
      resizable: true,
      saveWindowState: true,
      contextMenu: true,
      ...(opts.customData ? { customData: opts.customData } : {}),
      ...(opts.windowOptions ?? {}),
    });
  }

  return makeSurfaceHandle(kind, win, opts.name);
}

function makeSurfaceHandle(
  kind: SurfaceKind,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  win: any,
  id: string,
): SurfaceHandle {
  const closedListeners = new Set<() => void>();
  let firedClosed = false;

  const fireClosed = () => {
    if (firedClosed) return;
    firedClosed = true;
    const listeners = [...closedListeners];
    closedListeners.clear();
    for (const fn of listeners) {
      try { fn(); } catch { /* swallow */ }
    }
  };

  // Subscribe to OpenFin's `closed` event. `removeListener` symmetric.
  let removeListener: (() => void) | null = null;
  try {
    const onClosed = () => fireClosed();
    win.on?.('closed', onClosed);
    removeListener = () => {
      try { win.removeListener?.('closed', onClosed); } catch { /* swallow */ }
    };
  } catch {
    /* If `on` isn't available the consumer can poll via close() return. */
  }

  return {
    kind,
    id,
    close: () => {
      try { win.close?.(); } catch { /* swallow */ }
      removeListener?.();
      fireClosed();
    },
    focus: () => {
      try { win.setAsForeground?.(); } catch { /* swallow */ }
    },
    onClosed: (fn) => {
      closedListeners.add(fn);
      return () => {
        closedListeners.delete(fn);
      };
    },
  };
}
