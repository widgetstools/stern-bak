/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useCallback, useEffect, useRef } from 'react';

/**
 * Identity of the sender to subscribe to. Use `{ uuid: '*' }` to receive
 * messages from any application; pass `name` as well to narrow to a
 * specific window/view within an application.
 */
export type IabSender =
  | { uuid: '*' }
  | { uuid: string; name?: string };

/** Source identity attached to every received IAB message. */
export interface IabSource {
  uuid: string;
  name?: string;
}

export type IabHandler = (message: unknown, source: IabSource) => void;

/** Returned by `useIab` — stable identity across renders. */
export interface UseIabResult {
  /**
   * Subscribe to `topic` from `sender`. Returns an unsubscribe function
   * the caller may invoke to detach early; any subscription left attached
   * at unmount time is automatically cleaned up.
   *
   * Outside an OpenFin runtime this is a no-op that returns a noop
   * cleanup, so calling code can be environment-agnostic.
   */
  subscribe: (sender: IabSender, topic: string, handler: IabHandler) => () => void;
  /**
   * Publish `payload` to all subscribers of `topic` across the OpenFin
   * runtime. Resolves once OpenFin has accepted the publish; outside an
   * OpenFin runtime resolves immediately.
   */
  publish: (topic: string, payload: unknown) => Promise<void>;
}

function isOpenFin(): boolean {
  return typeof fin !== 'undefined' && fin?.InterApplicationBus;
}

/**
 * Generic OpenFin Inter-Application Bus pub/sub bound to the React
 * lifecycle. Foundation hook for any cross-window broadcast — the
 * dedicated event hooks (workspace-save, color linking, etc.) layer on
 * top of this rather than re-implementing the subscribe/cleanup
 * boilerplate.
 *
 * The returned `subscribe` and `publish` functions are stable across
 * renders, so callers may pass them straight into effect dependency
 * arrays without retriggering.
 */
export function useIab(): UseIabResult {
  // Track every active subscription we created so unmount can detach
  // anything the consumer didn't manually clean up. We store cleanup
  // closures rather than (sender,topic,handler) triples so we don't have
  // to know the IAB unsubscribe shape here twice.
  const cleanupsRef = useRef<Set<() => void>>(new Set());

  const subscribe = useCallback<UseIabResult['subscribe']>(
    (sender, topic, handler) => {
      if (!isOpenFin()) {
        return () => {
          /* noop — nothing to unsubscribe from */
        };
      }
      const wrapped = (msg: unknown, src: IabSource) => handler(msg, src);
      let detached = false;
      try {
        fin.InterApplicationBus.subscribe(sender, topic, wrapped);
      } catch (err) {
        console.warn('[useIab] subscribe failed:', err);
      }
      const cleanup = () => {
        if (detached) return;
        detached = true;
        cleanupsRef.current.delete(cleanup);
        try {
          fin.InterApplicationBus.unsubscribe(sender, topic, wrapped);
        } catch (err) {
          console.warn('[useIab] unsubscribe failed:', err);
        }
      };
      cleanupsRef.current.add(cleanup);
      return cleanup;
    },
    [],
  );

  const publish = useCallback<UseIabResult['publish']>(async (topic, payload) => {
    if (!isOpenFin()) return;
    try {
      await fin.InterApplicationBus.publish(topic, payload);
    } catch (err) {
      console.warn('[useIab] publish failed:', err);
    }
  }, []);

  // On unmount, fire every registered cleanup so the OpenFin runtime
  // doesn't accumulate dead handlers. Empty deps — runs once at unmount.
  useEffect(() => {
    const cleanups = cleanupsRef.current;
    return () => {
      for (const fn of Array.from(cleanups)) fn();
      cleanups.clear();
    };
  }, []);

  return { subscribe, publish };
}
