import type { EventBus as IEventBus } from './types';

/**
 * Typed, framework-free pub-sub. One instance per GridPlatform.
 *
 * Handlers registered via `on` always see events emitted after registration;
 * `emit` is synchronous — listeners run before `emit` returns.
 */
export class EventBus<M> implements IEventBus<M> {
  private handlers = new Map<keyof M, Set<(payload: unknown) => void>>();

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  on<K extends keyof M>(event: K, handler: (payload: M[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as (payload: unknown) => void);
    return () => set?.delete(handler as (payload: unknown) => void);
  }
}
