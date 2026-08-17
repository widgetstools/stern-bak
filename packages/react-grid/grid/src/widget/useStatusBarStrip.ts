/**
 * Status-bar ownership, shared by both surfaces.
 *
 * Two AG-Grid facts drive all of this:
 *
 *   1. AG Grid creates the status-bar CONTAINER only when the option is set
 *      at init, and KEEPS the container when the option is cleared at
 *      runtime. So "bar off" cannot be `undefined` — a grid that booted
 *      without one can never gain one, and a grid that had one never loses
 *      it. The surface always passes a container (an empty panel list when
 *      off) and owns the strip's visibility itself.
 *   2. `useGridHost`'s generic option sync iterates `Object.entries(gridOptions)`,
 *      so a key that DISAPPEARS from the pipeline is never visited and never
 *      pushed. `statusBar` is exactly that shape — general-settings drops the
 *      key when SHOW STATUS BAR is off — which is why the client-side bar
 *      stayed visible after being toggled off while the server-side one,
 *      whose surface already owned the option, did not. That reverse gap is
 *      what this hook closes: `statusBar` now joins `hostOverrideKeys` for
 *      every grid, so the generic sync skips it and the surface is the only
 *      writer.
 *
 * A value is recorded as applied ONLY when it actually reached a live grid
 * api. Recording before the api check silently swallowed changes that landed
 * while the grid was still initialising (profile hydration routinely beats
 * gridReady), which made customizer STATUS BAR edits apply intermittently —
 * hence the catch-up push callers run from `onGridReady`.
 */
import { useCallback, useRef, type RefObject } from 'react';
import type { StatusPanelDef } from 'ag-grid-community';

/** Structurally AG-Grid's `StatusBar`; typed loosely here so both surfaces
 *  can hand over a value they built from pipeline output. */
export interface StatusBarValue {
  statusPanels: StatusPanelDef[];
}

/** "Bar off" — a container with no panels, never `undefined`. */
export const EMPTY_STATUS_BAR: StatusBarValue = { statusPanels: [] };

/** Sentinel: no value has reached the grid api yet. */
const UNPUSHED = Symbol('statusBar-unpushed');

/** The two members this hook needs off a `GridApi`. Exported so the
 *  surfaces can cast once, legibly, rather than inline. */
export interface StatusBarApiLike {
  isDestroyed?: () => boolean;
  setGridOption?: (key: string, value: unknown) => void;
}

export interface UseStatusBarStripParams {
  /** Resolved value — host prop if given, else the pipeline's. `undefined`
   *  means the card toggled the bar off. */
  statusBar: StatusBarValue | undefined;
  /** The surface's own root, used to find `.ag-status-bar`. */
  rootRef: RefObject<HTMLElement | null>;
  getApi: () => StatusBarApiLike | null;
}

export interface StatusBarStrip {
  /** Pass to `<AgGridReact statusBar={…}>` — never `undefined`. */
  statusBarProp: StatusBarValue;
  /** Call on change and again from `onGridReady` (catch-up). */
  pushStatusBar: () => void;
}

export function useStatusBarStrip(params: UseStatusBarStripParams): StatusBarStrip {
  const { statusBar, rootRef, getApi } = params;

  const latestRef = useRef<StatusBarValue | undefined>(statusBar);
  latestRef.current = statusBar;
  const appliedRef = useRef<unknown>(UNPUSHED);

  const pushStatusBar = useCallback(() => {
    if (Object.is(appliedRef.current, latestRef.current)) return;
    const api = getApi();
    if (!api || api.isDestroyed?.()) return;
    appliedRef.current = latestRef.current;
    const next = latestRef.current;
    api.setGridOption?.('statusBar', next ?? EMPTY_STATUS_BAR);
    // AG Grid keeps (or re-fills) the container element; the strip's
    // visibility is ours. Hidden entirely when the card toggles the bar off.
    const strip = rootRef.current?.querySelector('.ag-status-bar') as HTMLElement | null;
    if (strip) strip.style.display = next && next.statusPanels.length > 0 ? '' : 'none';
  }, [getApi, rootRef]);

  return { statusBarProp: statusBar ?? EMPTY_STATUS_BAR, pushStatusBar };
}
