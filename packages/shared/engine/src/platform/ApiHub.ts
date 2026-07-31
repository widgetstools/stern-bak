import type { GridApi } from 'ag-grid-community';
import type { ApiEventName, ApiHub as IApiHub } from './types';

/**
 * Thin reactive wrapper over AG-Grid's api. Lives on the GridPlatform and
 * is the ONLY way UI + modules reach the live api.
 *
 * Three contracts it enforces:
 *  1. No api access before `onGridReady` — `whenReady()` exists for that.
 *  2. No ad-hoc listener wiring — every `on(evt, fn)` returns a disposer
 *     and all listeners are torn down by `destroy()` even if callers
 *     forget their disposer.
 *  3. No `as unknown as { … }` — the public surface is typed.
 *
 * v2 had `setInterval(300)` polling for the api in FormattingToolbar +
 * ad-hoc `addEventListener` pairs scattered across 10+ files. Replaced by
 * this.
 */
export class ApiHub implements IApiHub {
  private _api: GridApi | null = null;
  private readyResolvers: Array<(api: GridApi) => void> = [];
  private readyHandlers = new Set<(api: GridApi) => void>();
  private activeListeners = new Set<() => void>();

  get api(): GridApi | null {
    return this._api;
  }

  /** Called by the host once AG-Grid fires `onGridReady`. */
  attach(api: GridApi): void {
    this._api = api;
    const resolvers = this.readyResolvers;
    this.readyResolvers = [];
    for (const fn of resolvers) fn(api);
    for (const fn of this.readyHandlers) fn(api);
  }

  /** Called when the grid tears down. Detaches every listener registered
   *  through `on()`, then drops the api reference. */
  detach(): void {
    for (const dispose of this.activeListeners) dispose();
    this.activeListeners.clear();
    this._api = null;
  }

  whenReady(): Promise<GridApi> {
    if (this._api) return Promise.resolve(this._api);
    return new Promise((resolve) => this.readyResolvers.push(resolve));
  }

  onReady(fn: (api: GridApi) => void): () => void {
    this.readyHandlers.add(fn);
    if (this._api) fn(this._api);
    return () => this.readyHandlers.delete(fn);
  }

  on(evt: ApiEventName, fn: (event?: unknown) => void): () => void {
    const attach = (api: GridApi): (() => void) => {
      try {
        // AG-Grid's addEventListener typing accepts known names via string
        // literal types; we narrow via the ApiEventName union. AG calls the
        // listener with the event object — forwarded so delta-carrying events
        // (asyncTransactionsFlushed) can read their payload.
        (api.addEventListener as (e: string, f: (event?: unknown) => void) => void)(evt, fn);
      } catch {
        /* api mid-teardown / event unsupported — degrade silently */
      }
      return () => {
        // AG-Grid v35 logs warning #26 if removeEventListener is called
        // on an already-destroyed grid, even when wrapped in try/catch.
        // Skip the call when the api reports itself destroyed.
        const maybeDestroyed = (api as unknown as { isDestroyed?: () => boolean }).isDestroyed;
        if (typeof maybeDestroyed === 'function' && maybeDestroyed.call(api)) return;
        try {
          (api.removeEventListener as (e: string, f: (event?: unknown) => void) => void)(evt, fn);
        } catch { /* ignore */ }
      };
    };

    let dispose: (() => void) | null = this._api ? attach(this._api) : null;
    // If the api isn't ready yet, attach when it becomes ready.
    const readyDispose = this._api
      ? null
      : this.onReady((api) => {
          dispose = attach(api);
        });

    const combined = () => {
      dispose?.();
      readyDispose?.();
      this.activeListeners.delete(combined);
    };
    this.activeListeners.add(combined);
    return combined;
  }

  use<T>(fn: (api: GridApi) => T, fallback: T): T {
    if (!this._api) return fallback;
    try {
      return fn(this._api);
    } catch {
      return fallback;
    }
  }
}
