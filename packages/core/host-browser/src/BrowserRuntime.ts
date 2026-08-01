import type { RuntimePort } from '@wellsfargo-starui/host';
import type {
  IdentitySnapshot,
  SurfaceHandle,
  SurfaceSpec,
  Theme,
  Unsubscribe,
} from '@wellsfargo-starui/types';
import { THEME_BROADCAST_CHANNEL, THEME_STORAGE_KEY } from '@wellsfargo-starui/types';
import { resolveBrowserIdentity, type IdentityOverrides } from './identity.js';

export interface BrowserRuntimeOptions {
  readonly identity?: IdentityOverrides;
  readonly url?: string;
  readonly openInPage?: (spec: SurfaceSpec) => Promise<SurfaceHandle> | SurfaceHandle;
}

export class BrowserRuntime implements RuntimePort {
  readonly name = 'browser';

  private readonly identityCache: IdentitySnapshot;
  private readonly themeListeners = new Set<(theme: Theme) => void>();
  private readonly shownListeners = new Set<() => void>();
  private readonly closingListeners = new Set<() => void>();
  private readonly disposers: Array<() => void> = [];
  private currentTheme: Theme;
  private disposed = false;
  private themeBroadcast: BroadcastChannel | null = null;

  constructor(private readonly options: BrowserRuntimeOptions = {}) {
    const url = options.url ?? (typeof window !== 'undefined' ? window.location.href : '');
    const search = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    this.identityCache = resolveBrowserIdentity(search, options.identity);
    this.currentTheme = this.detectTheme();

    if (typeof window !== 'undefined') {
      this.attachThemeWatchers();
      this.attachThemeBroadcast();
      this.attachVisibilityWatcher();
      this.attachUnloadWatcher();
    }
  }

  resolveIdentity(): IdentitySnapshot {
    return this.identityCache;
  }

  async openSurface(spec: SurfaceSpec): Promise<SurfaceHandle> {
    if (spec.kind === 'inpage') {
      if (!this.options.openInPage) {
        throw new Error(
          '[BrowserRuntime] in-page surface requested but no openInPage handler was registered.',
        );
      }
      return this.options.openInPage(spec);
    }

    if (typeof window === 'undefined') {
      throw new Error('[BrowserRuntime] cannot open a surface outside a browser.');
    }

    const url = this.appendCustomDataToUrl(spec.url, spec.customData);
    const features: string[] = [];
    if (spec.width !== undefined) features.push(`width=${spec.width}`);
    if (spec.height !== undefined) features.push(`height=${spec.height}`);
    const name = spec.windowName ?? spec.title ?? '_blank';
    const win = window.open(url, name, features.join(','));

    if (!win) {
      throw new Error('[BrowserRuntime] window.open returned null (popup blocked?).');
    }

    try { win.focus(); } catch { /* swallow */ }
    return this.makeSurfaceHandle(spec.kind, win, name);
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  setTheme(theme: Theme): void {
    if (this.disposed || theme === this.currentTheme) return;
    this.writeTheme(theme);
    if (this.themeBroadcast) {
      try { this.themeBroadcast.postMessage(theme); } catch { /* swallow */ }
    }
    this.applyThemeChange(theme);
  }

  onThemeChanged(fn: (theme: Theme) => void): Unsubscribe {
    this.themeListeners.add(fn);
    return () => { this.themeListeners.delete(fn); };
  }

  onWindowShown(fn: () => void): Unsubscribe {
    this.shownListeners.add(fn);
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      queueMicrotask(() => {
        if (this.shownListeners.has(fn)) fn();
      });
    }
    return () => { this.shownListeners.delete(fn); };
  }

  onWindowClosing(fn: () => void): Unsubscribe {
    this.closingListeners.add(fn);
    return () => { this.closingListeners.delete(fn); };
  }

  onCustomDataChanged(_fn: (customData: Readonly<Record<string, unknown>>) => void): Unsubscribe {
    void _fn;
    return () => {};
  }

  onWorkspaceSave(_fn: () => void | Promise<void>): Unsubscribe {
    void _fn;
    return () => {};
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
  }

  private detectTheme(): Theme {
    if (typeof document !== 'undefined') {
      const explicit = document.documentElement.getAttribute('data-theme');
      if (explicit === 'dark' || explicit === 'light') return explicit;
    }
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'dark' || stored === 'light') return stored;
      } catch { /* swallow */ }
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }

  private writeTheme(theme: Theme): void {
    if (typeof document !== 'undefined') {
      try { document.documentElement.setAttribute('data-theme', theme); } catch { /* swallow */ }
      // AG Grid v33+ theme modes read `data-ag-theme-mode` on an ancestor.
      try { document.documentElement.setAttribute('data-ag-theme-mode', theme); } catch { /* swallow */ }
      try { document.body.dataset['agThemeMode'] = theme; } catch { /* swallow */ }
    }
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* swallow */ }
    }
  }

  private applyThemeChange(theme: Theme): void {
    if (theme === this.currentTheme) return;
    this.currentTheme = theme;
    for (const fn of this.themeListeners) {
      try { fn(theme); } catch { /* swallow */ }
    }
  }

  private attachThemeWatchers(): void {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => { this.applyThemeChange(this.detectTheme()); };
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', handler);
        this.disposers.push(() => mq.removeEventListener('change', handler));
      }
    }
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      const observer = new MutationObserver(() => { this.applyThemeChange(this.detectTheme()); });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      this.disposers.push(() => observer.disconnect());
    }
  }

  private attachThemeBroadcast(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.themeBroadcast = new BroadcastChannel(THEME_BROADCAST_CHANNEL);
      this.themeBroadcast.addEventListener('message', (ev: MessageEvent) => {
        const next = ev.data;
        if (next !== 'dark' && next !== 'light') return;
        this.writeTheme(next);
        this.applyThemeChange(next);
      });
      this.disposers.push(() => {
        try { this.themeBroadcast?.close(); } catch { /* swallow */ }
        this.themeBroadcast = null;
      });
    } catch { /* swallow */ }
  }

  private attachVisibilityWatcher(): void {
    if (typeof document === 'undefined') return;
    const handler = () => {
      if (document.visibilityState !== 'visible') return;
      for (const fn of this.shownListeners) {
        try { fn(); } catch { /* swallow */ }
      }
    };
    document.addEventListener('visibilitychange', handler);
    this.disposers.push(() => document.removeEventListener('visibilitychange', handler));
  }

  private attachUnloadWatcher(): void {
    if (typeof window === 'undefined') return;
    const handler = () => {
      for (const fn of this.closingListeners) {
        try { fn(); } catch { /* swallow */ }
      }
    };
    window.addEventListener('beforeunload', handler);
    this.disposers.push(() => window.removeEventListener('beforeunload', handler));
  }

  private appendCustomDataToUrl(
    url: string,
    customData: Readonly<Record<string, unknown>> | undefined,
  ): string {
    if (!customData || Object.keys(customData).length === 0) return url;
    try {
      const encoded = btoa(JSON.stringify(customData));
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}data=${encodeURIComponent(encoded)}`;
    } catch {
      return url;
    }
  }

  private makeSurfaceHandle(kind: SurfaceSpec['kind'], win: Window, id: string): SurfaceHandle {
    const closedListeners = new Set<() => void>();
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const fireClosed = () => {
      if (pollTimer !== undefined) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
      const listeners = [...closedListeners];
      closedListeners.clear();
      for (const fn of listeners) {
        try { fn(); } catch { /* swallow */ }
      }
    };

    pollTimer = setInterval(() => {
      if (win.closed) fireClosed();
    }, 250);

    return {
      kind,
      id,
      close: () => {
        try { win.close(); } catch { /* swallow */ }
        fireClosed();
      },
      focus: () => {
        try { win.focus(); } catch { /* swallow */ }
      },
      onClosed: (fn) => {
        closedListeners.add(fn);
        return () => { closedListeners.delete(fn); };
      },
    };
  }
}
