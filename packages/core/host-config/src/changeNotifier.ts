/**
 * Cross-tab + same-tab change notification for ConfigManager writes.
 *
 * Bridges three event-source paths so subscribers get a single, uniform
 * "this configId changed" callback:
 *
 *   1. Local emit — `notify(configId)` is called inline from
 *      `saveConfig` / `deleteConfig` after a successful write. Same-tab
 *      subscribers fire synchronously on the next microtask.
 *   2. Outbound BroadcastChannel — `notify` also posts to
 *      `BroadcastChannel('marketsui-config-changes')` so other tabs in
 *      the same origin learn about the write.
 *   3. Inbound BroadcastChannel — incoming messages dispatch to local
 *      subscribers WITHOUT re-broadcasting (so the channel doesn't
 *      loop), with the same callback shape.
 *
 * The BroadcastChannel arms are no-ops in environments that don't
 * provide one (Node, older jsdom, browsers in private modes that
 * disable it). Same-tab notifications keep working regardless.
 */
export class ChangeNotifier {
  private channel: BroadcastChannel | undefined;
  private listeners = new Map<string, Set<() => void>>();
  private globalListeners = new Set<(configId: string) => void>();
  private disposed = false;

  constructor(channelName = 'marketsui-config-changes') {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(channelName);
        this.channel.onmessage = (e) => {
          if (this.disposed) return;
          const data = e.data as { type?: string; configId?: string } | null;
          if (data?.type === 'configChanged' && typeof data.configId === 'string') {
            this.dispatchLocal(data.configId);
          }
        };
      } catch {
        this.channel = undefined;
      }
    }
  }

  /** Notify subscribers (local + cross-tab) that `configId` changed. */
  notify(configId: string): void {
    if (this.disposed) return;
    this.dispatchLocal(configId);
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'configChanged', configId });
      } catch {
        /* swallow — broadcast is best-effort */
      }
    }
  }

  /**
   * Subscribe to every config write/delete (same-tab + cross-tab).
   * Returns unsubscribe.
   */
  subscribeAll(fn: (configId: string) => void): () => void {
    this.globalListeners.add(fn);
    return () => {
      this.globalListeners.delete(fn);
    };
  }

  /** Subscribe to changes for a specific `configId`. Returns unsubscribe. */
  subscribe(configId: string, fn: () => void): () => void {
    let set = this.listeners.get(configId);
    if (!set) {
      set = new Set();
      this.listeners.set(configId, set);
    }
    set.add(fn);
    return () => {
      const current = this.listeners.get(configId);
      if (!current) return;
      current.delete(fn);
      if (current.size === 0) this.listeners.delete(configId);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.globalListeners.clear();
    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        /* ignore */
      }
      this.channel = undefined;
    }
  }

  private dispatchLocal(configId: string): void {
    for (const fn of [...this.globalListeners]) {
      try {
        fn(configId);
      } catch (err) {
         
        console.warn('[config-service] global change listener threw:', err);
      }
    }

    const set = this.listeners.get(configId);
    if (!set || set.size === 0) return;
    // Snapshot before iterating so a listener that unsubscribes mid-fire
    // doesn't skip subsequent listeners.
    for (const fn of [...set]) {
      try {
        fn();
      } catch (err) {
        // A listener throwing must not break sibling listeners or the
        // write that triggered the notification.
         
        console.warn('[config-service] change listener threw:', err);
      }
    }
  }
}
