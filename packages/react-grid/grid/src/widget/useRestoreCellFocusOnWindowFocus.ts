import { useEffect, type RefObject } from 'react';
import type { GridApi } from 'ag-grid-community';
import {
  subscribeParentWindowFocused,
  focusCurrentOpenFinHost,
} from '@wellsfargo-starui/openfin/host';

/**
 * Restores real DOM focus to the grid's focused cell when the window
 * regains OS focus (alt-tab back).
 *
 * Chromium keeps `document.activeElement` on the cell across a window
 * blur, so after alt-tab-return paste/typing works immediately in a
 * plain browser tab. Inside an OpenFin window the runtime's view focus
 * handling breaks that in two ways:
 *
 *  1. The view regains web-contents focus but the active element is
 *     dropped to `<body>` — sometimes AFTER the DOM `focus` event, so a
 *     one-shot check misses it. Countered with a short retry schedule.
 *  2. The OS window re-activates but NO view regains web-contents
 *     focus, so the view's DOM `window` never fires `focus` at all.
 *     Countered by also subscribing to the parent OpenFin window's
 *     `focused` event (via @wellsfargo-starui/host-openfin; noop in a browser) and
 *     handing web-contents focus back with `fin.me.focus()` before
 *     re-focusing the cell.
 *
 * In both cases AG Grid still paints the focus ring (its focused-cell
 * state is CSS-driven, not activeElement-driven) while Ctrl+V and
 * keystrokes route nowhere until the user clicks — this hook re-asserts
 * browser focus on the cell AG Grid still reports as focused via
 * `api.setFocusedCell`.
 *
 * Guards (all must pass before focus is touched):
 *  - This grid owned DOM focus when the window blurred — tracked via
 *    focusin/focusout on the grid surface, so two grids in one document
 *    never fight over restoration.
 *  - This DOCUMENT was the fleet's most recently focused one — tracked
 *    via a localStorage stamp (same-origin OpenFin views share
 *    localStorage), so two blotter views in one window never steal
 *    web-contents focus from each other.
 *  - Focus fell to `<body>`/`<html>` or somewhere inside this grid
 *    that isn't a cell. If the user (or the browser's own restoration)
 *    put focus on any element outside the grid, never steal it.
 *  - No cell editor is open — forcing cell focus would pull focus off
 *    the editor input.
 */

/** Injection seam for the OpenFin-specific glue (tests pass fakes). */
export interface RestoreCellFocusBridge {
  /** Subscribe to the parent OpenFin window's `focused` event. Noop dispose outside OpenFin. */
  subscribeParentWindowFocused: (cb: () => void) => () => void;
  /** Give web-contents (keyboard) focus back to the current view/window. Noop outside OpenFin. */
  focusHostWebContents: () => void;
}

const DEFAULT_BRIDGE: RestoreCellFocusBridge = {
  subscribeParentWindowFocused,
  focusHostWebContents: focusCurrentOpenFinHost,
};

const LAST_FOCUSED_DOC_KEY = 'starui-grid:last-focused-doc';

// Per-document token: same-origin OpenFin views share localStorage, so
// a random module-scoped token identifies THIS document as the one that
// last held user focus. Multiple grids in one document share the token;
// per-grid ownership is handled by the focusin/focusout tracking.
const DOC_TOKEN = `doc-${Math.random().toString(36).slice(2)}`;

function stampThisDocFocused(): void {
  try {
    localStorage.setItem(LAST_FOCUSED_DOC_KEY, DOC_TOKEN);
  } catch {
    /* storage unavailable — degrade to per-document behaviour */
  }
}

function thisDocWasLastFocused(): boolean {
  try {
    const stamp = localStorage.getItem(LAST_FOCUSED_DOC_KEY);
    return stamp === null || stamp === DOC_TOKEN;
  } catch {
    return true;
  }
}

/**
 * Attempt schedule after a focus trigger. OpenFin can drop the active
 * element to <body> shortly AFTER the view's focus event, so a single
 * deferred check can run too early; later attempts catch it. Each
 * attempt re-evaluates every guard, and the sequence stops as soon as
 * focus is verified healthy or found to belong elsewhere.
 */
const RESTORE_ATTEMPT_DELAYS_MS = [0, 150, 400] as const;

export function useRestoreCellFocusOnWindowFocus(
  rootRef: RefObject<HTMLElement | null>,
  getApi: () => GridApi | null | undefined,
  bridge: RestoreCellFocusBridge = DEFAULT_BRIDGE,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let ownsFocus = false;
    let timers: ReturnType<typeof setTimeout>[] = [];

    const clearTimers = () => {
      for (const t of timers) clearTimeout(t);
      timers = [];
    };

    const onFocusIn = () => {
      // Stamp only on OWNERSHIP TRANSITION. focusin bubbles from every
      // cell focus change — every click and every arrow-key step during
      // keyboard navigation (~30/sec on key-repeat) — and each
      // localStorage write dispatches a `storage` event into every
      // same-origin sibling view in the OpenFin fleet. Intra-grid focus
      // moves keep ownership, so they must not write.
      if (!ownsFocus) stampThisDocFocused();
      ownsFocus = true;
    };

    const onFocusOut = (event: FocusEvent) => {
      // relatedTarget === null means focus left the document entirely
      // (window blur / alt-tab) — keep ownership so the restore path
      // can act on return. A real element outside the surface means the
      // user moved focus deliberately; release ownership.
      const next = event.relatedTarget;
      if (next instanceof Node && !root.contains(next)) ownsFocus = false;
    };

    // One guarded restore attempt. Returns true when the sequence
    // should stop (focus healthy, focus legitimately elsewhere, or
    // nothing to restore).
    const attemptRestore = (): boolean => {
      if (!ownsFocus) return true;
      if (!thisDocWasLastFocused()) return true;

      const active = document.activeElement;
      const fellToBody =
        !active || active === document.body || active === document.documentElement;
      const insideGrid = !!active && root.contains(active);
      // Focus on a real element outside the grid (toolbar input,
      // another widget) is never ours to take.
      if (!fellToBody && !insideGrid) return true;

      const api = getApi();
      if (!api || api.isDestroyed()) return true;
      const focused = api.getFocusedCell();
      if (!focused) return true;
      if (api.getEditingCells().length > 0) return true;

      const activeInCell = insideGrid && !!active && active.closest('.ag-cell') !== null;
      const hasDocFocus = document.hasFocus();
      if (activeInCell && hasDocFocus) return true;

      // OpenFin: the OS window can re-activate with no view holding
      // web-contents focus — element.focus() alone updates
      // activeElement but keys still route nowhere.
      if (!hasDocFocus) bridge.focusHostWebContents();
      if (!activeInCell) {
        api.setFocusedCell(focused.rowIndex, focused.column, focused.rowPinned);
      }
      return false; // verify again on the next scheduled attempt
    };

    const scheduleRestoreAttempts = () => {
      clearTimers();
      for (const delay of RESTORE_ATTEMPT_DELAYS_MS) {
        const timer = setTimeout(() => {
          timers = timers.filter((t) => t !== timer);
          if (attemptRestore()) clearTimers();
        }, delay);
        timers.push(timer);
      }
    };

    const onWindowFocus = () => {
      // This document is receiving real web-contents focus — record it
      // as the fleet's most recently focused document.
      stampThisDocFocused();
      scheduleRestoreAttempts();
    };

    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    window.addEventListener('focus', onWindowFocus);
    const unsubscribeParentFocus = bridge.subscribeParentWindowFocused(scheduleRestoreAttempts);

    return () => {
      clearTimers();
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('focus', onWindowFocus);
      unsubscribeParentFocus();
    };
  }, [rootRef, getApi, bridge]);
}
