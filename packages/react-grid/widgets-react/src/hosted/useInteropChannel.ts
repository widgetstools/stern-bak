 
/**
 * useInteropChannel — context channel backed by the OpenFin **interop** API,
 * shape-compatible with {@link useFdc3Channel} so it drops into
 * `useGridContextLink` unchanged.
 *
 * Why not FDC3 for color linking: the workspace dock "Link" button joins a
 * window/view to an **interop context group**. `window.fdc3`'s
 * `getCurrentChannel()` / `userChannelChanged` event do NOT reliably reflect
 * that membership — a view linked (e.g.) purple can report "no channel" and
 * silently drop every broadcast. Interop's `setContext` / `addContextHandler`
 * operate on whatever group the dock linked the entity to, with no channel
 * bookkeeping, so they work where the FDC3 layer doesn't.
 *
 * Outside an OpenFin runtime (`fin.me.interop` absent) every method no-ops,
 * mirroring `useFdc3Channel`'s graceful degradation.
 */

import { useCallback, useEffect, useRef } from 'react';
import { getInteropClient, isInteropAvailable } from '@wellsfargo-starui/openfin/host';
import { useColorLinking } from './useColorLinking.js';
import type { Fdc3Context, UseFdc3ChannelResult } from './useFdc3Channel.js';

// Re-exported for API stability — consumers import it from this module.
export { isInteropAvailable };

const getInterop = getInteropClient;

export interface UseInteropChannelOptions {
  /** Emit verbose `[interop]` diagnostics. Off by default. */
  debug?: boolean;
}

export function useInteropChannel(opts: UseInteropChannelOptions = {}): UseFdc3ChannelResult {
  // Best-effort channel label for diagnostics only — the transport itself
  // needs no channel id (interop routes by current group membership).
  const { color, linked } = useColorLinking();
  const current = linked ? (color ?? 'linked') : null;

  const cleanupsRef = useRef<Set<() => void>>(new Set());

  // Ref-bridge the debug flag so callbacks below stay referentially stable.
  const debugRef = useRef(false);
  debugRef.current = opts.debug === true;

  const broadcast = useCallback<UseFdc3ChannelResult['broadcast']>(async (context) => {
    const interop = getInterop();
    if (!interop?.setContext) return;
    try {
      await interop.setContext(context);
      if (debugRef.current) {
         
        console.debug('[interop] setContext ok', context);
      }
    } catch (err) {
      // The usual cause: this entity isn't in a context group (not linked) —
      // diagnostic, not a hard error, so only surfaced when debugging.
      if (debugRef.current) {
        console.warn('[useInteropChannel] setContext failed (entity not in a context group?):', err);
      }
    }
  }, []);

  const addContextListener = useCallback<UseFdc3ChannelResult['addContextListener']>(
    (contextType, handler) => {
      const interop = getInterop();
      if (!interop?.addContextHandler) {
        return () => {
          /* noop */
        };
      }

      let unsubscribed = false;
      let listenerHandle: { unsubscribe?: () => void } | null = null;

      void (async () => {
        try {
          const result = interop.addContextHandler!(
            (ctx) => handler(ctx as Fdc3Context),
            contextType ?? undefined,
          );
          listenerHandle = result instanceof Promise ? await result : result;
          if (unsubscribed) {
            try {
              listenerHandle?.unsubscribe?.();
            } catch {
              /* already gone */
            }
            listenerHandle = null;
          }
        } catch (err) {
          console.warn('[useInteropChannel] addContextHandler failed:', err);
        }
      })();

      const cleanup = () => {
        if (unsubscribed) return;
        unsubscribed = true;
        cleanupsRef.current.delete(cleanup);
        try {
          listenerHandle?.unsubscribe?.();
        } catch {
          /* already gone */
        }
        listenerHandle = null;
      };
      cleanupsRef.current.add(cleanup);
      return cleanup;
    },
    [],
  );

  const join = useCallback<UseFdc3ChannelResult['join']>(async (channelId) => {
    const interop = getInterop();
    if (!interop?.joinContextGroup) return;
    try {
      await interop.joinContextGroup(channelId);
    } catch (err) {
      console.warn('[useInteropChannel] joinContextGroup failed:', err);
    }
  }, []);

  const leave = useCallback<UseFdc3ChannelResult['leave']>(async () => {
    const interop = getInterop();
    if (!interop?.removeFromContextGroup) return;
    try {
      await interop.removeFromContextGroup();
    } catch (err) {
      console.warn('[useInteropChannel] removeFromContextGroup failed:', err);
    }
  }, []);

  // Detach any listener still attached at unmount.
  useEffect(() => {
    const cleanups = cleanupsRef.current;
    return () => {
      for (const fn of Array.from(cleanups)) fn();
      cleanups.clear();
    };
  }, []);

  return { current, join, leave, addContextListener, broadcast };
}
