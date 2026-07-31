/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * Module-private subscription manager for the parent OpenFin window's
 * `focused` event, mirroring `windowOptionsSubscription`.
 *
 * Grid surfaces use it to restore cell focus after alt-tab: OpenFin can
 * re-activate the OS window WITHOUT handing web-contents focus back to
 * any view, in which case the view's DOM `window` never fires `focus`
 * — the parent window's `focused` event is the only reliable signal
 * that the user returned. One runtime listener fans out to all
 * subscribed callbacks so N grids in one view don't attach N IPC
 * listeners.
 *
 * Outside an OpenFin runtime both exports are noops.
 */

type FocusedCallback = () => void;

const callbacks = new Set<FocusedCallback>();
let active: { win: any; handler: () => void } | null = null;
let initPromise: Promise<void> | null = null;

function isOpenFinContext(): boolean {
  return typeof fin !== 'undefined' && Boolean(fin?.me?.getCurrentWindow);
}

function fireAll(): void {
  for (const cb of Array.from(callbacks)) {
    try {
      cb();
    } catch (err) {
      console.warn('[windowFocusSubscription] callback threw:', err);
    }
  }
}

function ensureListener(): Promise<void> {
  if (active) return Promise.resolve();
  if (initPromise) return initPromise;
  if (!isOpenFinContext()) return Promise.resolve();

  initPromise = (async () => {
    try {
      const win = await fin.me.getCurrentWindow();
      const handler = () => fireAll();
      try {
        win.on('focused', handler);
      } catch (err) {
        console.warn('[windowFocusSubscription] win.on failed:', err);
        return;
      }
      active = { win, handler };
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function subscribeParentWindowFocused(cb: FocusedCallback): () => void {
  if (!isOpenFinContext()) {
    return () => {
      /* noop — non-OpenFin */
    };
  }

  callbacks.add(cb);
  void ensureListener();

  return () => {
    if (!callbacks.delete(cb)) return;
    if (callbacks.size === 0 && active) {
      try {
        active.win.removeListener('focused', active.handler);
      } catch (err) {
        console.warn('[windowFocusSubscription] removeListener failed:', err);
      }
      active = null;
    }
  };
}

/**
 * Hand web-contents (keyboard) focus to the current OpenFin view or
 * window. After alt-tab the runtime can re-activate the OS window while
 * leaving no view focused — DOM `element.focus()` then updates
 * `document.activeElement` but keystrokes still route nowhere until the
 * view's web contents regain focus. Noop outside OpenFin.
 */
export function focusCurrentOpenFinHost(): void {
  try {
    if (typeof fin !== 'undefined' && typeof fin?.me?.focus === 'function') {
      void fin.me.focus();
    }
  } catch {
    /* noop */
  }
}

export function __resetWindowFocusSubscriptionForTests(): void {
  if (active) {
    try {
      active.win.removeListener('focused', active.handler);
    } catch {
      /* swallow */
    }
  }
  callbacks.clear();
  active = null;
  initPromise = null;
}
