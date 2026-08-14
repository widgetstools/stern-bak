import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PortalContainerProvider } from '@wellsfargo-starui/react';
import { enableCrossRealmNodeInstanceOf } from './crossRealmNodeInstanceOf';

// ─── StrictMode-safe window registry (module-level) ───────────────────
// React StrictMode double-invokes useEffect in dev: mount → cleanup →
// remount. If our cleanup synchronously closed the popout window, the
// remount would try to reopen — under OpenFin that races with the
// still-closing window and hits the "name-uuid already in use" error.
//
// Instead, we keep a live-window cache keyed by window name. On
// cleanup we *schedule* the close via setTimeout. If a remount
// happens before the timer fires, it cancels the close and reuses
// the still-alive window. Clean normal unmounts (popped=false)
// close the window ~50ms later — imperceptible to the user.
//
// We also dedupe in-flight creates so two parallel openWindow calls
// for the same name collapse onto one promise — otherwise the
// second would race the first and collide.
const liveWindows = new Map<string, Window>();
const pendingCloses = new Map<string, ReturnType<typeof setTimeout>>();
const pendingCreates = new Map<string, Promise<Window | null>>();
const STRICTMODE_REMOUNT_GRACE_MS = 50;

// Dev handle so popped documents are reachable from the main-window
// devtools console during debugging:
//   [...window.__gcPopouts.values()][0].document
// Same pattern as `window.__debugOpenFin` in openFin.ts. Harmless in
// production — just a read-only accessor over the module-local map.
if (typeof window !== 'undefined') {
  (window as unknown as { __gcPopouts?: Map<string, Window> }).__gcPopouts = liveWindows;
}

function cancelPendingClose(name: string): boolean {
  const t = pendingCloses.get(name);
  if (t === undefined) return false;
  clearTimeout(t);
  pendingCloses.delete(name);
  return true;
}

function scheduleDeferredClose(name: string): void {
  cancelPendingClose(name); // replace any existing timer
  const t = setTimeout(() => {
    pendingCloses.delete(name);
    const w = liveWindows.get(name);
    liveWindows.delete(name);
    if (w && !w.closed) {
      try { w.close(); } catch { /* already gone / cross-origin */ }
    }
  }, STRICTMODE_REMOUNT_GRACE_MS);
  pendingCloses.set(name, t);
}

/** Test-only helper: clear the module-level window registries so
 *  tests don't leak state between themselves. Not part of the
 *  public API — only exported so unit tests can reset between
 *  runs. */
export function __resetPopoutPortalState(): void {
  for (const t of pendingCloses.values()) clearTimeout(t);
  pendingCloses.clear();
  liveWindows.clear();
  pendingCreates.clear();
}

/**
 * PopoutPortal — render React children into a detached OS window while
 * keeping them in the parent component's React tree.
 *
 * Because the portal keeps the children attached to the parent's React
 * root, they continue to share context (GridProvider, theme, store,
 * profile-manager) and state updates flow instantly between the main
 * window and the popout — no BroadcastChannel or IndexedDB round-trip
 * needed. The popout is effectively "another monitor" for the same
 * React tree.
 *
 * Caveats the caller should know:
 *   - Closing the main window or refreshing it kills the popout (React
 *     runs in the main VM). This is the correct behavior for "popped-
 *     out panels" — Figma, Slack, iTerm, etc. all behave this way.
 *   - The popout has no URL of its own; refreshing the popout blanks
 *     it. The caller should surface this as "close and reopen" UX.
 *   - Popup blockers only let `window.open` through if it's fired
 *     inside a direct user-gesture handler. Always trigger from a
 *     button onClick (never from useEffect on mount).
 *
 * OpenFin support: the optional `openFinOverride` hook lets a caller
 * use `fin.Window.create` instead of `window.open`. The returned
 * promise must resolve to a same-origin `Window` with `document`
 * accessible (OpenFin's `getWebWindow()` gives you that).
 */

export interface PopoutPortalProps {
  /** The React subtree to render inside the popout window. */
  children: ReactNode;
  /**
   * Fires when the user closes the popout window (via its OS close
   * button, Cmd-W, or beforeunload). The parent should flip its
   * "popped" state back to false so the sheet re-mounts in the main
   * window.
   */
  onClose: () => void;
  /**
   * Stable window name — passed to `window.open` as the second arg.
   * Prevents duplicate windows: calling with the same name refocuses
   * the existing window instead of opening a second.
   */
  name: string;
  /** Title set on the popout document. Shown in the OS title bar. */
  title?: string;
  /** Initial width in CSS pixels. Default 900. */
  width?: number;
  /** Initial height in CSS pixels. Default 700. */
  height?: number;
  /**
   * If true, asks the window manager to pin the popout on top of
   * other windows. **OpenFin honors this; standards-compliant
   * browsers ignore it** (the web platform has no always-on-top
   * API by design). Only used when `openWindow` supports it; the
   * default `window.open` path discards it silently.
   */
  alwaysOnTop?: boolean;
  /**
   * Render the popout with or without OS chrome (title bar,
   * close button, resize borders). Default: `true` (framed).
   * Set to `false` when the React subtree renders its own
   * title bar with `-webkit-app-region: drag`. OpenFin honors
   * this; browser `window.open` ignores it (browsers always
   * render full chrome — can't be controlled from web pages).
   */
  frame?: boolean;
  /**
   * When provided, the popout grows to `expandedHeight` while a
   * Radix popover / dropdown / menu is open inside it, then shrinks
   * back to the base `height` when the last one closes.
   *
   * Why: a small toolbar-height popout (e.g. 900×120) will clip
   * popovers taller than the window. The user shouldn't have to
   * manually resize the window to read a Templates menu or Format
   * picker.
   *
   * Detection: MutationObserver on `popout.document.body` watching
   * for `[data-radix-popper-content-wrapper]` nodes to appear /
   * disappear. Covers every Radix Popover / AlertDialog /
   * DropdownMenu / Tooltip through the standard wrapper attr.
   * Native createPortal callers (HelpOverlay / Palette) don't use
   * the wrapper, so they're not auto-expanded — but those aren't
   * commonly used inside the tiny toolbar popout anyway.
   *
   * Browsers expose `window.resizeTo()` for popups they opened;
   * most allow it for same-origin named windows. OpenFin picks it
   * up too via the same API.
   */
  expandedHeight?: number;
  /**
   * Optional override for the window-creation mechanism. Return a
   * same-origin `Window` whose `document` can be mutated. Defaults to
   * `window.open(...)`. Pass a custom function when running under
   * OpenFin so `fin.Window.create(...)` is used instead.
   */
  openWindow?: (opts: {
    name: string;
    width: number;
    height: number;
    alwaysOnTop: boolean;
    frame: boolean;
  }) => Window | Promise<Window | null> | null;
  /**
   * Fires once the popout window has been created and its document
   * prepared. Callers that need to programmatically focus / inspect
   * the window later (e.g. the MarketsGrid settings icon wanting to
   * raise the popout when the user re-clicks it) should stash the
   * reference from this callback. Cleared when the portal unmounts.
   */
  onWindowOpened?: (win: Window) => void;
}

export function PopoutPortal({
  children,
  onClose,
  name,
  title = 'Grid Customizer',
  width = 900,
  height = 700,
  alwaysOnTop = false,
  frame = true,
  expandedHeight,
  openWindow,
  onWindowOpened,
}: PopoutPortalProps) {
  const [popout, setPopout] = useState<Window | null>(null);
  // Ref holds the latest onClose so the polling effect below doesn't
  // tear down + re-establish its interval every time the caller
  // re-renders with a new closure.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onWindowOpenedRef = useRef(onWindowOpened);
  onWindowOpenedRef.current = onWindowOpened;

  // ── Open the window on mount ──────────────────────────────────────
  // StrictMode-safe: first cancel any pending close from a previous
  // effect run, then either reuse the cached live window or create
  // a fresh one (with in-flight-create dedup). On cleanup, we only
  // *schedule* a close — if a remount happens within
  // STRICTMODE_REMOUNT_GRACE_MS, it cancels the close and reuses the
  // window.
  useEffect(() => {
    // Cancel any pending close from a StrictMode unmount that
    // preceded this remount — we want to reuse, not kill-and-reopen.
    cancelPendingClose(name);

    // Popout DOM lives in a separate window realm; make `instanceof Node`
    // cross-realm aware so Radix popovers/selects dismiss on outside click
    // inside the popout (idempotent).
    enableCrossRealmNodeInstanceOf();

    let cancelled = false;

    const open = async () => {
      // Fast path: a live window already exists under this name
      // (from an earlier mount's create). Reuse it — don't hit
      // OpenFin's Window.create at all. Re-fire onWindowOpened so
      // the caller's window-ref (e.g. Poppable's popoutWindowRef
      // for focusIfPopped) picks up the reference even on a
      // StrictMode remount that hit the cache path.
      const cached = liveWindows.get(name);
      if (cached && !cached.closed) {
        if (!cancelled) {
          setPopout(cached);
          onWindowOpenedRef.current?.(cached);
        }
        return;
      }

      // Dedupe concurrent create requests for the same window name
      // — the second StrictMode mount would otherwise race the
      // first and trigger the "name-uuid already in use" collision.
      let createPromise = pendingCreates.get(name);
      if (!createPromise) {
        createPromise = (async (): Promise<Window | null> => {
          const usingOpenFin = !!openWindow;
          console.info(
            `[PopoutPortal] creating window "${name}" via ${usingOpenFin ? 'openFin (fin.Window.create)' : 'window.open'}`,
          );
          let w: Window | null;
          if (openWindow) {
            w = await openWindow({ name, width, height, alwaysOnTop, frame });
          } else {
            // `window.open` has no always-on-top feature — the web
            // platform deliberately forbids it. `alwaysOnTop` is
            // silently discarded here; only OpenFin honors it via
            // `openFinWindowOpener()`.
            //
            // Diagnostic note: if you see this log line while
            // running INSIDE OpenFin, it means `openFinWindowOpener()`
            // returned undefined — i.e. `isOpenFin()` is false.
            // That happens when `window.fin` isn't populated yet
            // at the time the caller imported / invoked the
            // opener. The caller (Poppable / SettingsSheet) must
            // invoke `openFinWindowOpener()` at CALL time (each
            // pop-out), not at module import time, so the lookup
            // happens after OpenFin has injected `fin`.
            const features = `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no,scrollbars=yes,resizable=yes`;
            w = window.open('', name, features);
          }
          console.info(`[PopoutPortal] openWindow returned:`, {
            name,
            gotWindow: !!w,
            sameOrigin: (() => { try { return w?.location?.origin === window.location.origin; } catch { return 'cross-origin'; } })(),
            readyState: w?.document?.readyState,
          });
          if (w) {
            liveWindows.set(name, w);
            await prepareDocument(w, title);
            console.info(`[PopoutPortal] prepareDocument completed — body children:`, {
              bodyChildCount: w.document?.body?.children.length,
              headChildCount: w.document?.head?.children.length,
              title: w.document?.title,
            });
          }
          return w;
        })();
        pendingCreates.set(name, createPromise);
        // Whether it succeeds or fails, clear the pending entry so
        // future creates can run.
        createPromise.finally(() => {
          if (pendingCreates.get(name) === createPromise) {
            pendingCreates.delete(name);
          }
        });
      }

      const w = await createPromise;
      if (cancelled) return; // cleanup already fired; let its
                             // scheduled close handle w (if we
                             // created it).
      if (!w) {
        // Popup blocker or OpenFin rejection. Bail back to the main
        // window — the caller's onClose will re-mount the sheet there.
        console.warn('[PopoutPortal] unable to open window (popup blocker?)');
        onCloseRef.current();
        return;
      }
      setPopout(w);
      onWindowOpenedRef.current?.(w);
    };

    void open();
    return () => {
      cancelled = true;
      // Schedule the close instead of doing it synchronously. If
      // StrictMode immediately re-runs this effect, the remount's
      // `cancelPendingClose(name)` call at the top kills this timer
      // before the window actually closes.
      scheduleDeferredClose(name);
    };
    // Reason: one-shot popout open on mount. Every reactive prop
    // (features, name, onWindowOpened, etc.) is captured via refs
    // updated in their own effects above, so listing them here would
    // tear down + reopen the popout on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Close detection ───────────────────────────────────────────────
  // The popout window lives outside React; when the user closes it we
  // need to drive a state change back to the parent. Two signals:
  //   1. `beforeunload` on the popout — fires for user-initiated close.
  //   2. Polling `popout.closed` — catches OS-level closes / crashes
  //      where beforeunload didn't fire. 500ms cadence is fine for a
  //      UI flip that only happens once per session.
  //
  // Timing subtleties (caught on OpenFin specifically):
  //   - `about:blank` navigations in the freshly-created window can
  //     fire a synthetic `beforeunload` on the first load tick, which
  //     we'd otherwise read as "user closed the popout" and
  //     immediately tear the window down. We gate the listener on
  //     the popout's `readyState === 'complete'`.
  //   - `popout.closed` can transiently report true during the
  //     window's initial navigation in some OpenFin runtime
  //     versions. A short grace period (1 second) before the first
  //     poll tick avoids the false-positive close-detection that
  //     otherwise makes the window "open and immediately close".
  useEffect(() => {
    if (!popout) return;

    const handleUnload = () => onCloseRef.current();
    const attachUnload = () => {
      try { popout.addEventListener('beforeunload', handleUnload); } catch { /* cross-origin / closed */ }
    };
    // Only start listening once the popout's initial load is done —
    // an early beforeunload from the about:blank → our DOM injection
    // transition would misfire.
    if (popout.document?.readyState === 'complete') {
      attachUnload();
    } else {
      try { popout.addEventListener('load', attachUnload, { once: true }); } catch { /* */ }
    }

    let pollId: ReturnType<typeof setInterval> | null = null;
    // Grace window suppresses `closed`-poll false positives during
    // the OpenFin window's initial navigation lifecycle. 1s is more
    // than enough in practice; tests that need tighter control can
    // stub `setTimeout` or just wait.
    const graceMs = 1000;
    const graceTimer = setTimeout(() => {
      pollId = setInterval(() => {
        let isClosed = false;
        try { isClosed = popout.closed; } catch { isClosed = true; }
        if (isClosed) {
          if (pollId !== null) clearInterval(pollId);
          onCloseRef.current();
        }
      }, 500);
    }, graceMs);

    return () => {
      try { popout.removeEventListener('beforeunload', handleUnload); } catch { /* */ }
      try { popout.removeEventListener('load', attachUnload); } catch { /* */ }
      clearTimeout(graceTimer);
      if (pollId !== null) clearInterval(pollId);
    };
  }, [popout]);

  // ── Close the popout if the main window unmounts us ───────────────
  // Without this, navigating away from / unmounting the parent leaves
  // a zombie popout with stale DOM. Fires both on normal unmount and
  // on main-window close (cleanup runs during `beforeunload` too).
  useEffect(() => {
    if (!popout) return;
    const closeOnMainUnload = () => {
      try { popout.close(); } catch { /* cross-origin or already closed */ }
    };
    window.addEventListener('beforeunload', closeOnMainUnload);
    return () => {
      window.removeEventListener('beforeunload', closeOnMainUnload);
      // Intentional: when the portal unmounts (caller flipped
      // `popped` false, OR React tree tore down), close the window
      // too. If the close was initiated BY the popout itself (user
      // clicked its OS close button), `popout.closed` is already
      // true and `.close()` is a safe no-op.
      try { popout.close(); } catch { /* */ }
    };
  }, [popout]);

  // ── Mirror the main window's <html data-theme="..."> onto the popout's
  // <html> (NOT onto <body>).
  //
  // Why NOT body: the demo loads two stylesheets that both define shadcn
  // tokens — fi-dark.css (design-system, HSL triplets like
  // `--card: 214 26% 10%`) and globals.css (demo, hex like
  // `--card: var(--ds-surface-primary)`). fi-dark.css uses selector `:root, [data-theme="dark"]`
  // while globals.css uses just `:root`.
  //
  // - On <html>: both rules match. globals.css is loaded LAST so its hex
  //   value wins — `--card` resolves correctly, and descendants inherit.
  // - If we ALSO set data-theme on <body>: fi-dark's `[data-theme="dark"]`
  //   rule matches body directly. globals.css's `:root` rule does NOT match
  //   body. So on body, fi-dark wins → `--card` is "214 26% 10%" (HSL
  //   triplet) → the background value is invalid → transparent popovers.
  //
  // Keeping data-theme only on <html> means body inherits the valid hex
  // via the normal CSS-var cascade. The descendant-form selectors in
  // cockpit.ts (`[data-theme='light'] .ds-sheet-v2`) still match because
  // body is a descendant of html.
  useEffect(() => {
    if (!popout) return;
    const syncTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      if (!theme) return;
      const popoutRoot = popout.document.documentElement;
      popoutRoot.setAttribute('data-theme', theme);
      popoutRoot.setAttribute('data-ag-theme-mode', theme);
    };
    syncTheme();
    const obs = new MutationObserver(syncTheme);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-ag-theme-mode', 'class'],
    });
    return () => obs.disconnect();
  }, [popout]);

  // ── Keep the popout's document.title in sync with the `title` prop.
  // prepareDocument seeds the initial title once on window creation;
  // this effect picks up subsequent prop changes (e.g. the caller
  // appends a gridId suffix, or the active profile's name changes).
  useEffect(() => {
    if (!popout) return;
    try { popout.document.title = title; } catch { /* cross-origin / closed */ }
  }, [popout, title]);

  // ── Auto-resize on Radix-popover open/close ──────────────────────
  // When `expandedHeight` is provided, grow the popout to that
  // height while any Radix popover is visible, then shrink back to
  // the base `height` when the last one closes. Implemented as a
  // MutationObserver on the popout body watching for the standard
  // `[data-radix-popper-content-wrapper]` nodes.
  //
  // The observer is the broad net — Radix Popover, AlertDialog,
  // DropdownMenu, and Tooltip all render through the same wrapper,
  // so this one check covers every menu the toolbar can open.
  useEffect(() => {
    if (!popout || !expandedHeight) return;
    const doc = popout.document;
    if (!doc) return;

    let grown = false;
    const resize = (h: number) => {
      try { popout.resizeTo(width, h); } catch { /* cross-origin / closed / blocked */ }
    };
    const check = () => {
      const openCount = doc.querySelectorAll('[data-radix-popper-content-wrapper]').length;
      if (openCount > 0 && !grown) {
        grown = true;
        resize(expandedHeight);
      } else if (openCount === 0 && grown) {
        grown = false;
        resize(height);
      }
    };

    // Initial check in case a popover was open before this effect
    // attached (unlikely but cheap).
    check();

    const obs = new MutationObserver(check);
    obs.observe(doc.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [popout, expandedHeight, width, height]);

  // ── The mount node inside the popout's body ───────────────────────
  // Previously done in a `useMemo` — WRONG: useMemo runs during the
  // render phase where side effects (appendChild) are illegal.
  // React 19 StrictMode double-invokes useMemo in dev, so TWO divs
  // were appended on every mount and the first one (empty, flex
  // sized to 100vh) would overlay the second. Under OpenFin that
  // manifested as "popout opens but no content" — the content was
  // there, hidden behind a same-size empty div from the first run.
  //
  // Correct pattern: a side-effecting useEffect that returns a
  // cleanup. StrictMode's mount-unmount-mount cycle now yields a
  // single mount node in the final committed state, and every
  // mutation of `popout` triggers a clean teardown + recreate.
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!popout) return;
    let node: HTMLElement | null = null;
    try {
      // Diagnostic: log the state of the popout document at mount
      // time. Under OpenFin this is the most common point of
      // failure — if `body` is null or the document is in a weird
      // state, the content never lands.
      const doc = popout.document;
      console.info('[PopoutPortal] mount-node effect — popout state:', {
        hasDocument: !!doc,
        readyState: doc?.readyState,
        hasBody: !!doc?.body,
        bodyTag: doc?.body?.tagName,
        bodyChildCount: doc?.body?.children.length,
        docLocation: doc?.location?.href,
        documentElementOk: !!doc?.documentElement,
      });
      if (!doc?.body) {
        console.warn('[PopoutPortal] popout.document.body unavailable at mount — is the window fully loaded?');
        return;
      }
      node = doc.createElement('div');
      node.setAttribute('data-popout-root', '');
      node.style.cssText = 'width:100%;height:100vh;display:flex;flex-direction:column;';
      doc.body.appendChild(node);
      console.info('[PopoutPortal] mount node appended:', {
        nodeInDoc: !!doc.querySelector('[data-popout-root]'),
        nodeOwnerIsPopout: node.ownerDocument === doc,
      });
    } catch (err) {
      console.warn('[PopoutPortal] failed to create mount node:', err);
      return;
    }
    setMountNode(node);
    return () => {
      try { node?.remove(); } catch { /* document may already be closed */ }
      setMountNode(null);
    };
  }, [popout]);

  if (!popout || !mountNode) return null;
  // Wrap children in the PortalContainerProvider so every downstream
  // Radix Popover / AlertDialog / Tooltip / Select primitive portals
  // into the POPOUT's body instead of the main window's — otherwise
  // dropdowns would render in the main window (invisible to the
  // user sitting in front of the popout) and keyboard focus would
  // bounce across windows. Native `createPortal` callers read the
  // same context.
  return createPortal(
    <PortalContainerProvider container={popout.document.body}>
      {children}
    </PortalContainerProvider>,
    mountNode,
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Prime the popout document: title, viewport meta, base styles that
 * prevent the default body margin, and a clone of every stylesheet
 * currently present in the main document's head.
 *
 * Waits for the popout's initial navigation (about:blank load) to
 * finish before injecting — otherwise under OpenFin a pending load
 * can race our writes and swallow them.
 *
 * Every write is individually try/catch'd so a single failure (e.g.
 * the popout already closed, cross-origin wall) can't leave the
 * document half-initialised + also doesn't throw back up into the
 * React effect where it would unmount the portal.
 */
async function prepareDocument(popout: Window, title: string): Promise<void> {
  const waitForReady = () => new Promise<void>((resolve) => {
    try {
      if (!popout.document || popout.document.readyState === 'complete') {
        resolve();
        return;
      }
    } catch {
      resolve();
      return;
    }
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    try { popout.addEventListener('load', done, { once: true }); } catch { /* */ }
    // Safety net: some OpenFin runtimes don't fire `load` reliably
    // for in-process about:blank — cap the wait at 500ms so we
    // don't hang the portal forever.
    setTimeout(done, 500);
  });

  await waitForReady();

  try {
    const doc = popout.document;
    if (!doc || !doc.head) return;

    try { doc.title = title; } catch { /* */ }

    try {
      if (!doc.querySelector('meta[name="viewport"]')) {
        const meta = doc.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1';
        doc.head.appendChild(meta);
      }
    } catch (err) { console.warn('[PopoutPortal] viewport meta inject failed:', err); }

    // Seed the popout's <body> with BOTH the cockpit scope class AND
    // the ds-settings data-attr so every Radix portal target (we pass
    // `popout.document.body` as the container) inherits the full
    // --ds-*, + Tailwind shadcn token stack. Without this, a
    // FormatPopover opened from inside a popped settings sheet would
    // fall back to light-theme shadcn defaults — the user saw a white
    // rectangle in the middle of the Indicator section because the
    // portaled color-picker content had no design-system surface token bound.
    //
    // These are purely scoping hooks (no layout styles bound to them
    // at :root level), so adding them to <body> is harmless for any
    // direct-body consumers and fixes every downstream portal.
    try {
      doc.body.classList.add('ds-sheet-v2');
      doc.body.setAttribute('data-ds-settings', '');
    } catch (err) { console.warn('[PopoutPortal] body scope tag failed:', err); }

    // Clone every stylesheet from the main document so our CSS-in-
    // JS tokens (--ds-*, --primary) + runtime styles
    // + Tailwind bundle all resolve. Done BEFORE the reset so that
    // the popout-specific reset (`body { padding: 0 }`,
    // `[data-popout-root] { overflow: hidden }`) wins the cascade —
    // the main app's `index.css` typically sets `body { padding: 10px }`
    // which would otherwise leak into the popout and produce a 20px
    // shadow scroll.
    try {
      for (const el of Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))) {
        try { doc.head.appendChild(el.cloneNode(true)); } catch { /* single stylesheet fail shouldn't abort the rest */ }
      }
    } catch (err) { console.warn('[PopoutPortal] stylesheet clone failed:', err); }

    try {
      const reset = doc.createElement('style');
      // !important is belt-and-braces against any cloned rule using
      // it too. Cascade order alone (reset appended last) is enough
      // for the common cases, but trader-app stylesheets sometimes
      // arrive late via dynamic imports and would re-clobber a
      // cascade-only reset.
      reset.textContent = `
        html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; width: 100% !important; overflow: hidden !important; }
        body { font-family: inherit; background: var(--ds-surface-ground); color: var(--ds-text-primary); }
        [data-popout-root] { width: 100% !important; height: 100% !important; min-width: 0; min-height: 0; overflow: hidden !important; }
      `;
      doc.head.appendChild(reset);
    } catch (err) { console.warn('[PopoutPortal] reset style inject failed:', err); }
  } catch (err) {
    console.warn('[PopoutPortal] prepareDocument failed:', err);
  }
}
