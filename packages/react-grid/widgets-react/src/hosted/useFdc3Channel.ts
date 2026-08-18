 
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * FDC3 user-channel facade bound to the React lifecycle. Wraps the
 * minimal slice of `window.fdc3` that hosted features actually use:
 * the current channel id, join/leave, context broadcast, and context
 * listening with automatic cleanup on unmount.
 *
 * Outside an FDC3 runtime (i.e. `window.fdc3` is undefined), every
 * function is a no-op:
 *   - `current` stays `null`
 *   - `join` / `leave` / `broadcast` resolve immediately
 *   - `addContextListener` returns a noop cleanup
 *
 * so call sites compile and run inside `apps/demos/demo-react` and any other
 * non-FDC3 host without conditional branches.
 */

export interface Fdc3Context {
  type: string;
  [key: string]: unknown;
}

export type Fdc3ContextHandler = (context: Fdc3Context) => void;

export interface UseFdc3ChannelResult {
  /** Current user channel id, or `null` when unjoined / unsupported. */
  current: string | null;
  /** Join a user channel by id. */
  join: (channelId: string) => Promise<void>;
  /** Leave the current user channel. */
  leave: () => Promise<void>;
  /**
   * Listen for broadcast contexts of `contextType` (or all contexts when
   * `contextType` is null). Returns a cleanup that detaches the
   * listener; any listeners still attached at unmount are detached
   * automatically.
   */
  addContextListener: (
    contextType: string | null,
    handler: Fdc3ContextHandler,
  ) => () => void;
  /** Broadcast a context onto the joined user channel. */
  broadcast: (context: Fdc3Context) => Promise<void>;
}

interface Fdc3Listener {
  unsubscribe?: () => void;
}

/** Minimal FDC3 surface used by hosted widgets — kept local to avoid clashing with app-level `fdc3` typings (e.g. `@finos/fdc3` globals). */
interface Fdc3Api {
  getCurrentChannel?: () => Promise<{ id: string } | null>;
  joinUserChannel?: (id: string) => Promise<void>;
  leaveCurrentChannel?: () => Promise<void>;
  broadcast?: (context: Fdc3Context) => Promise<void>;
  addContextListener?: (
    contextType: string | null,
    handler: Fdc3ContextHandler,
  ) => Fdc3Listener | Promise<Fdc3Listener>;
  addEventListener?: (event: string, handler: () => void) => void;
  removeEventListener?: (event: string, handler: () => void) => void;
}

function getFdc3(): Fdc3Api | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { fdc3?: Fdc3Api }).fdc3;
}

export function useFdc3Channel(): UseFdc3ChannelResult {
  const [current, setCurrent] = useState<string | null>(null);
  const cleanupsRef = useRef<Set<() => void>>(new Set());

  // Track current channel via the userChannelChanged event when the
  // runtime supports it; otherwise the join/leave wrappers refresh it
  // explicitly after each call.
  const refreshCurrent = useCallback(async () => {
    const fdc3 = getFdc3();
    if (!fdc3?.getCurrentChannel) return;
    try {
      const ch = await fdc3.getCurrentChannel();
      setCurrent(ch?.id ?? null);
    } catch (err) {
      console.warn('[useFdc3Channel] getCurrentChannel failed:', err);
    }
  }, []);

  useEffect(() => {
    const fdc3 = getFdc3();
    if (!fdc3) return;

    void refreshCurrent();

    if (typeof fdc3.addEventListener === 'function') {
      const handler = () => {
        void refreshCurrent();
      };
      try {
        fdc3.addEventListener('userChannelChanged', handler);
      } catch (err) {
        console.warn('[useFdc3Channel] addEventListener failed:', err);
      }
      return () => {
        try {
          fdc3.removeEventListener?.('userChannelChanged', handler);
        } catch (err) {
          console.warn('[useFdc3Channel] removeEventListener failed:', err);
        }
      };
    }
    return undefined;
  }, [refreshCurrent]);

  const join = useCallback<UseFdc3ChannelResult['join']>(
    async (channelId) => {
      const fdc3 = getFdc3();
      if (!fdc3?.joinUserChannel) return;
      try {
        await fdc3.joinUserChannel(channelId);
      } catch (err) {
        console.warn('[useFdc3Channel] joinUserChannel failed:', err);
      }
      // Refresh in case userChannelChanged isn't supported.
      await refreshCurrent();
    },
    [refreshCurrent],
  );

  const leave = useCallback<UseFdc3ChannelResult['leave']>(async () => {
    const fdc3 = getFdc3();
    if (!fdc3?.leaveCurrentChannel) return;
    try {
      await fdc3.leaveCurrentChannel();
    } catch (err) {
      console.warn('[useFdc3Channel] leaveCurrentChannel failed:', err);
    }
    await refreshCurrent();
  }, [refreshCurrent]);

  const broadcast = useCallback<UseFdc3ChannelResult['broadcast']>(async (context) => {
    const fdc3 = getFdc3();
    if (!fdc3?.broadcast) return;
    try {
      await fdc3.broadcast(context);
    } catch (err) {
      console.warn('[useFdc3Channel] broadcast failed:', err);
    }
  }, []);

  const addContextListener = useCallback<UseFdc3ChannelResult['addContextListener']>(
    (contextType, handler) => {
      const fdc3 = getFdc3();
      if (!fdc3?.addContextListener) {
        return () => {
          /* noop */
        };
      }

      let unsubscribed = false;
      let listenerHandle: Fdc3Listener | null = null;

      void (async () => {
        try {
          const result = fdc3.addContextListener!(contextType, handler);
          listenerHandle = result instanceof Promise ? await result : result;
          if (unsubscribed) {
            try {
              listenerHandle?.unsubscribe?.();
            } catch (err) {
              console.warn('[useFdc3Channel] late unsubscribe failed:', err);
            }
            listenerHandle = null;
          }
        } catch (err) {
          console.warn('[useFdc3Channel] addContextListener failed:', err);
        }
      })();

      const cleanup = () => {
        if (unsubscribed) return;
        unsubscribed = true;
        cleanupsRef.current.delete(cleanup);
        try {
          listenerHandle?.unsubscribe?.();
        } catch (err) {
          console.warn('[useFdc3Channel] unsubscribe failed:', err);
        }
        listenerHandle = null;
      };
      cleanupsRef.current.add(cleanup);
      return cleanup;
    },
    [],
  );

  // Tear down any listener the consumer left attached at unmount.
  useEffect(() => {
    const cleanups = cleanupsRef.current;
    return () => {
      for (const fn of Array.from(cleanups)) fn();
      cleanups.clear();
    };
  }, []);

  return { current, join, leave, addContextListener, broadcast };
}
