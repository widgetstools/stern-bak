/// <reference path="./fin.d.ts" />

import type {
  IdentitySnapshot,
  SurfaceHandle,
  SurfaceSpec,
  Theme,
  Unsubscribe,
} from '@wellsfargo-starui/types';
import { THEME_STORAGE_KEY } from '@wellsfargo-starui/types';
// Narrow subpath — pulls only the theme writer, none of the design-system
// barrel's ag-grid/primeuix adapter imports (this is a vanilla runtime).
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system/apply-theme';
import type { RuntimePort } from '@wellsfargo-starui/core/host';
import type { IdentityOverrides } from '@wellsfargo-starui/core/host/browser';
import { resolveOpenFinIdentity, getCurrentView, isOpenFin } from './identity.js';
import { openOpenFinPopout } from './popout.js';
import { readThemePayload } from './themeBroadcast.js';

export interface OpenFinRuntimeOptions {
  /** Mount-prop fallbacks for identity resolution. View customData wins when present. */
  readonly identity?: IdentityOverrides;
  /**
   * Optional handler for `kind: 'inpage'` surfaces. The runtime cannot
   * mount an in-page panel itself — register a handler on construct
   * that knows where panels live.
   */
  readonly openInPage?: (spec: SurfaceSpec) => Promise<SurfaceHandle> | SurfaceHandle;
  /**
   * For tests / non-fin environments — let `create()` succeed even
   * when `fin` is missing. The resulting runtime falls back to
   * URL-and-overrides identity and emits no fin lifecycle events.
   */
  readonly allowMissingFin?: boolean;
}

/**
 * `OpenFinRuntime` — `RuntimePort` implementation that wraps `fin.*`.
 *
 * Construction is async because OpenFin's view options are read via a
 * promise. Use:
 *
 *   const runtime = await OpenFinRuntime.create();
 *
 * Identity is resolved from the current view's `customData`, then URL
 * search params, then mount-prop overrides (`OpenFinRuntimeOptions.identity`).
 *
 * Lifecycle bridging:
 *   - `onWindowShown`   → view `'shown'` event
 *   - `onWindowClosing` → view `'destroyed'` event
 *   - `onCustomDataChanged` → polls `view.getOptions()` and emits when
 *     `customData` changes (OpenFin doesn't broadcast a fine-grained
 *     event for it; the rate is configurable but defaults to 250ms).
 *
 * Theme bridging reads `[data-theme]` on `document.documentElement`
 * first (apps wire that during workspace init), and falls back to
 * the platform's `getCurrentTheme()` if available. A MutationObserver
 * tracks subsequent `[data-theme]` flips.
 *
 * Surface support:
 *   - `popout` → `platform.createView(...)` with `customData`
 *   - `modal`  → currently aliased to `popout` (TODO: real OpenFin
 *     dialog window via `createWindow({ frame: false, modalParent })`).
 *   - `inpage` → delegates to `options.openInPage`; throws otherwise.
 */
export class OpenFinRuntime implements RuntimePort {
  readonly name = 'openfin';

  static async create(options: OpenFinRuntimeOptions = {}): Promise<OpenFinRuntime> {
    if (!isOpenFin() && !options.allowMissingFin) {
      throw new Error(
        '[OpenFinRuntime] `fin` is not available. Construct OpenFinRuntime ' +
          'only inside an OpenFin runtime, or pass `allowMissingFin: true` ' +
          'for a degraded mode usable in tests.',
      );
    }
    const identity = await resolveOpenFinIdentity({ overrides: options.identity });
    return new OpenFinRuntime(identity, options);
  }

  private readonly themeListeners = new Set<(theme: Theme) => void>();
  private readonly shownListeners = new Set<() => void>();
  private readonly closingListeners = new Set<() => void>();
  private readonly customDataListeners = new Set<(cd: Readonly<Record<string, unknown>>) => void>();
  private readonly workspaceSaveListeners = new Set<() => void | Promise<void>>();
  private readonly disposers: Array<() => void> = [];
  private currentTheme: Theme;
  private lastCustomData: Readonly<Record<string, unknown>>;
  /** Last savedTitle we wrote to document.title — guards
   *  applyTitleFromCustomData against re-applying on every customData
   *  change (e.g. activeProfileId updates) and clobbering legitimate
   *  dynamic titles (notification badges etc.). */
  private lastAppliedSavedTitle: string | null = null;
  private disposed = false;

  private constructor(
    private readonly identityCache: IdentitySnapshot,
    private readonly options: OpenFinRuntimeOptions,
  ) {
    this.currentTheme = this.detectTheme();
    this.lastCustomData = identityCache.customData;
    if (typeof document !== 'undefined') {
      this.attachThemeWatcher();
      this.applySavedViewTitle();
    }
    if (isOpenFin()) {
      this.attachViewWatchers();
      this.attachPlatformWorkspaceWatcher();
      this.attachThemeBroadcastListener();
    }
  }

  /**
   * Reapply a workspace-persisted view title (set via the "Save Tab As…"
   * action) to `document.title` on view boot, and PIN it against
   * subsequent overwrites by the page's own React tree.
   *
   * Why pinning is necessary. The constructor-time set alone is not
   * enough: most route views run a useEffect that does
   * `document.title = ...` on mount (see `HostedComponent.tsx`,
   * `DataProviders.tsx`, etc.), which fires after the runtime is
   * constructed and clobbers the restored title. A `MutationObserver`
   * on the `<title>` element resets the title back to `savedTitle`
   * whenever anything mutates it, so the user's chosen tab caption
   * always wins. The single source of truth is `customData.savedTitle`
   * — when that key changes (via the customData poll), the observer's
   * pinned value follows automatically because it reads through
   * `lastCustomData` on every firing.
   *
   * Best-effort: no-ops when `document` / `MutationObserver` is
   * unavailable, when `<title>` is missing, when `savedTitle` is
   * absent, or when the value is anything other than a non-empty
   * string.
   */
  private applySavedViewTitle(): void {
    this.applyTitleFromCustomData(this.identityCache.customData);
    this.attachTitlePinObserver();
  }

  /** Read `savedTitle` from a customData payload, return null when
   *  absent, non-string, or empty. */
  private readSavedTitle(cd: Readonly<Record<string, unknown>>): string | null {
    const t = (cd as { savedTitle?: unknown }).savedTitle;
    return typeof t === 'string' && t ? t : null;
  }

  /** Set `document.title` to the customData's `savedTitle` when the
   *  saved value has actually changed since the last apply. The
   *  changed-only guard matters because the customData poll fires for
   *  ANY customData mutation (including unrelated keys like
   *  `activeProfileId`); without it, every profile switch would clobber
   *  whatever dynamic title the page is currently showing. */
  private applyTitleFromCustomData(cd: Readonly<Record<string, unknown>>): void {
    const saved = this.readSavedTitle(cd);
    if (!saved || saved === this.lastAppliedSavedTitle) return;
    this.lastAppliedSavedTitle = saved;
    if (typeof document === 'undefined' || document.title === saved) return;
    try {
      document.title = saved;
    } catch {
      /* best-effort */
    }
  }

  /** Watch `<title>` mutations during a short post-boot window and
   *  reset to `customData.savedTitle` whenever the page's React tree
   *  clobbers it. The window is needed because most route views run
   *  `document.title = ...` in a mount `useEffect`, which fires AFTER
   *  the runtime's constructor-time apply. After the window expires
   *  the observer disconnects so live rename + dynamic title updates
   *  (notification badges, unread counts, etc.) work freely. */
  private attachTitlePinObserver(): void {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const titleEl = document.querySelector('title');
    if (!titleEl) return;
    const observer = new MutationObserver(() => {
      const saved = this.readSavedTitle(this.lastCustomData);
      if (!saved || document.title === saved) return;
      try {
        document.title = saved;
      } catch {
        /* best-effort */
      }
    });
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });
    // Pin window long enough to cover initial React mount + first
    // useEffect title set in slow boot scenarios. After this, the page
    // owns document.title — live renames go through the popout's
    // executeJavaScript path and customData write, not the observer.
    const PIN_WINDOW_MS = 3000;
    const timer = setTimeout(() => observer.disconnect(), PIN_WINDOW_MS);
    this.disposers.push(() => {
      clearTimeout(timer);
      observer.disconnect();
    });
  }

  resolveIdentity(): IdentitySnapshot {
    return this.identityCache;
  }

  async openSurface(spec: SurfaceSpec): Promise<SurfaceHandle> {
    if (spec.kind === 'inpage') {
      if (!this.options.openInPage) {
        throw new Error(
          '[OpenFinRuntime] in-page surface requested but no `openInPage` ' +
            'handler was registered.',
        );
      }
      return this.options.openInPage(spec);
    }

    if (!isOpenFin()) {
      throw new Error('[OpenFinRuntime] cannot open a fin surface — `fin` is not available.');
    }

    // `kind: 'popout' | 'modal'` both open a child window. Modal is
    // currently aliased to popout (no `frame: false, modalParent`
    // wiring yet — separate TODO at file head).
    const name = spec.windowName ?? spec.title ?? '_blank';
    return openOpenFinPopout(spec.kind, {
      name,
      url: spec.url,
      // Sensible defaults match the platform's tool windows (1180×760
      // for data-providers, etc.). Callers passing explicit dimensions
      // win.
      width: spec.width ?? 1180,
      height: spec.height ?? 760,
      customData: spec.customData,
    });
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  onThemeChanged(fn: (theme: Theme) => void): Unsubscribe {
    this.themeListeners.add(fn);
    return () => {
      this.themeListeners.delete(fn);
    };
  }

  onWindowShown(fn: () => void): Unsubscribe {
    this.shownListeners.add(fn);
    return () => {
      this.shownListeners.delete(fn);
    };
  }

  onWindowClosing(fn: () => void): Unsubscribe {
    this.closingListeners.add(fn);
    return () => {
      this.closingListeners.delete(fn);
    };
  }

  onCustomDataChanged(fn: (customData: Readonly<Record<string, unknown>>) => void): Unsubscribe {
    this.customDataListeners.add(fn);
    return () => {
      this.customDataListeners.delete(fn);
    };
  }

  onWorkspaceSave(fn: () => void | Promise<void>): Unsubscribe {
    this.workspaceSaveListeners.add(fn);
    return () => {
      this.workspaceSaveListeners.delete(fn);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    while (this.disposers.length > 0) {
      const fn = this.disposers.pop();
      if (fn) {
        try { fn(); } catch { /* swallow */ }
      }
    }
    this.themeListeners.clear();
    this.shownListeners.clear();
    this.closingListeners.clear();
    this.customDataListeners.clear();
    this.workspaceSaveListeners.clear();
  }

  // ─── internals ───────────────────────────────────────────────────────

  /**
   * Resolve the initial theme value at construct time. Precedence:
   *   1. `[data-theme]` on `<html>` — explicit programmatic write
   *      (design-system's `applyTheme()` runs before us).
   *   2. localStorage `THEME_STORAGE_KEY` — last persisted choice.
   *   3. `'light'` — final fallback (OpenFin has no OS `prefers-color-scheme`
   *      semantic; dock/IAB owns runtime updates).
   */
  private detectTheme(): Theme {
    if (typeof document !== 'undefined') {
      const explicit = document.documentElement.getAttribute('data-theme');
      if (explicit === 'dark' || explicit === 'light') return explicit;
    }
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') return stored;
      } catch {
        /* swallow */
      }
    }
    return 'light';
  }

  /**
   * Public `RuntimePort.setTheme` — single writer. Writes DOM +
   * storage, broadcasts to peer windows via the OpenFin IAB topic
   * `theme-changed`, then fires local subscribers. Idempotent.
   */
  setTheme(theme: Theme): void {
    if (this.disposed) return;
    if (theme === this.currentTheme) return;
    this.writeTheme(theme);
    this.broadcastTheme(theme);
    this.applyThemeChange(theme);
  }

  private writeTheme(theme: Theme): void {
    // Route through the design-system's applyTheme — the ONE theme writer.
    // It stamps data-theme / data-ag-theme-mode / body.dataset.agThemeMode /
    // the canonical THEME_STORAGE_KEY, AND keeps the sibling cvd/variant
    // keys + data-variant consistent (spreading getTheme() preserves the
    // user's cvd/variant choices across a runtime toggle) — previously a
    // runtime toggle left data-variant stale (WORKLOG item 17).
    try {
      applyTheme({ ...getTheme(), theme });
    } catch { /* swallow — non-DOM context */ }
  }

  private broadcastTheme(theme: Theme): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finGlobal = (globalThis as any).fin;
    const iab = finGlobal?.InterApplicationBus;
    if (!iab?.publish) return;
    try {
      void iab.publish('theme-changed', { theme, isDark: theme === 'dark' });
    } catch {
      /* swallow — best-effort broadcast */
    }
  }

  private applyThemeChange(theme: Theme): void {
    if (theme === this.currentTheme) return;
    this.currentTheme = theme;
    for (const fn of this.themeListeners) {
      try { fn(theme); } catch { /* swallow */ }
    }
  }

  private attachThemeWatcher(): void {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
    const observer = new MutationObserver(() => this.applyThemeChange(this.detectTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.disposers.push(() => observer.disconnect());
  }

  /**
   * Subscribe to the OpenFin IAB `theme-changed` topic. Peer windows
   * publishing through `setTheme()` reach us here; we write DOM +
   * storage locally so other watchers (CSS-driven UI, MutationObserver)
   * see a consistent state, then update internal state. No re-publish
   * (IAB already fanned out to all subscribers).
   */
  private attachThemeBroadcastListener(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finGlobal = (globalThis as any).fin;
    const iab = finGlobal?.InterApplicationBus;
    if (!iab?.subscribe || !finGlobal?.me?.identity?.uuid) return;
    const handler = (msg: unknown) => {
      const next = readThemePayload(msg);
      if (!next) return;
      this.writeTheme(next);
      this.applyThemeChange(next);
    };
    try {
      void iab.subscribe({ uuid: '*' }, 'theme-changed', handler);
      this.disposers.push(() => {
        try { void iab.unsubscribe({ uuid: '*' }, 'theme-changed', handler); } catch { /* swallow */ }
      });
    } catch {
      /* swallow — IAB not reachable */
    }
  }

  private attachViewWatchers(): void {
    const view = getCurrentView() as unknown as {
      on?: (event: string, fn: () => void) => void;
      removeListener?: (event: string, fn: () => void) => void;
      getOptions?: () => Promise<{ customData?: unknown }>;
    } | null;
    if (!view) return;

    const onShown = () => {
      for (const fn of this.shownListeners) {
        try { fn(); } catch { /* swallow */ }
      }
    };
    const onDestroyed = () => {
      for (const fn of this.closingListeners) {
        try { fn(); } catch { /* swallow */ }
      }
    };

    if (typeof view.on === 'function') {
      try {
        view.on('shown', onShown);
        view.on('destroyed', onDestroyed);
        if (typeof view.removeListener === 'function') {
          this.disposers.push(() => {
            try { view.removeListener!('shown', onShown); } catch { /* swallow */ }
            try { view.removeListener!('destroyed', onDestroyed); } catch { /* swallow */ }
          });
        }
      } catch {
        // Some view stubs lack the event API — degrade silently.
      }
    }

    // CustomData polling. OpenFin doesn't broadcast options-updated, so
    // we sample on a slow interval. Stops as soon as listeners drop or
    // the runtime is disposed.
    const intervalMs = 500;
    const timer = setInterval(() => {
      if (this.disposed || this.customDataListeners.size === 0) return;
      void (async () => {
        try {
          const options = await view.getOptions?.();
          const cd = options?.customData;
          if (!cd || typeof cd !== 'object' || Array.isArray(cd)) return;
          if (sameShallow(cd as Record<string, unknown>, this.lastCustomData)) return;
          this.lastCustomData = cd as Readonly<Record<string, unknown>>;
          // Live rename: when the popout writes a new savedTitle into
          // this view's customData, reflect it in document.title.
          this.applyTitleFromCustomData(this.lastCustomData);
          for (const fn of this.customDataListeners) {
            try { fn(this.lastCustomData); } catch { /* swallow */ }
          }
        } catch {
          // View not reachable any more — keep polling so the runtime
          // recovers if the view becomes available again.
        }
      })();
    }, intervalMs);
    this.disposers.push(() => clearInterval(timer));
  }

  /**
   * Bridge OpenFin's `'workspace-saved'` platform event to the local
   * onWorkspaceSave subscribers. The platform handle is reachable via
   * `fin.Platform.getCurrentSync()` — `.on('workspace-saved', fn)`
   * registers the listener.
   *
   * Best-effort: if the platform handle isn't reachable (e.g., this
   * view is loaded before the platform finished init, or the runtime
   * is constructed in a non-platform context), the bridge silently
   * skips. Once the platform exists in subsequent OpenFin runtime
   * versions the listener will start firing on its own.
   */
  private attachPlatformWorkspaceWatcher(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finGlobal = (globalThis as any).fin;
    if (!finGlobal?.Platform?.getCurrentSync) return;

    let platform: { on?: (event: string, fn: () => void) => void; removeListener?: (event: string, fn: () => void) => void } | null = null;
    try {
      platform = finGlobal.Platform.getCurrentSync();
    } catch {
      return;
    }
    if (!platform || typeof platform.on !== 'function') return;

    const handler = () => {
      for (const fn of this.workspaceSaveListeners) {
        try {
          // Fire and don't await — workspace-saved is a notification.
          // Handlers may be async; the runtime doesn't coordinate on
          // their completion.
          void fn();
        } catch {
          // Swallow — one buggy listener can't break the others.
        }
      }
    };

    try {
      platform.on('workspace-saved', handler);
      if (typeof platform.removeListener === 'function') {
        this.disposers.push(() => {
          try { platform!.removeListener!('workspace-saved', handler); } catch { /* swallow */ }
        });
      }
    } catch {
      // Older fin versions may not have `workspace-saved` — degrade
      // silently. Apps can still emit on a custom IAB topic and bridge
      // it themselves until they upgrade.
    }
  }
}

/** Shallow-equal helper — sufficient for customData payloads which are
 *  generally flat key/value records. */
function sameShallow(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}
