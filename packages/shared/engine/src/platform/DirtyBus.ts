import type { DirtyBus as IDirtyBus } from './types';

/**
 * Per-platform dirty-state registry.
 *
 * Replaces v2's file-level `dirtyRegistry = new Set<string>()` +
 * `window.dispatchEvent(new CustomEvent('gc-dirty-change'))` pattern. That
 * pattern had two correctness bugs:
 *   1. File-level state — two `<MarketsGrid>` instances on the same page
 *      share one registry; editing a rule in grid A lit the dirty LED on
 *      grid B.
 *   2. Global `window` event bus — no scoping, no payload, wakes every
 *      listener in the document.
 *
 * This class is owned by `ResourceScope` (one instance per platform).
 * Subscribers wire in via `useSyncExternalStore`; disposers are handled by
 * the ResourceScope's own teardown.
 */
export class DirtyBus implements IDirtyBus {
  private readonly entries = new Set<string>();
  private readonly listeners = new Set<() => void>();

  set(key: string, dirty: boolean): void {
    const was = this.entries.has(key);
    if (was === dirty) return;
    if (dirty) this.entries.add(key);
    else this.entries.delete(key);
    this.notify();
  }

  isDirty(key: string): boolean {
    return this.entries.has(key);
  }

  count(): number {
    return this.entries.size;
  }

  keys(): string[] {
    return Array.from(this.entries);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  reset(): void {
    if (this.entries.size === 0) return;
    this.entries.clear();
    this.notify();
  }

  private notify(): void {
    // Snapshot before iterating so a handler that adds/removes subscribers
    // during its callback doesn't corrupt this run.
    const snapshot = Array.from(this.listeners);
    for (const fn of snapshot) {
      try { fn(); }
      catch (err) { console.warn('[DirtyBus] subscriber threw:', err); }
    }
  }
}
