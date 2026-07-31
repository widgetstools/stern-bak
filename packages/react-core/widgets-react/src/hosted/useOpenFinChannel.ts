/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useCallback, useEffect, useRef } from 'react';

/**
 * Action handler registered on a Channel provider. The return value (or
 * its resolved promise) is sent back to the caller of
 * `client.dispatch(action, payload)`.
 */
export type ChannelActionFn = (
  payload: unknown,
  identity: { uuid: string; name?: string },
) => unknown | Promise<unknown>;

/**
 * Minimal shape we need from an OpenFin Channel provider — kept loose
 * because the real `@openfin/core` types are not pulled in at build
 * time (consistent with the rest of `hosted/`).
 */
export interface ChannelProviderHandle {
  register: (action: string, fn: ChannelActionFn) => boolean;
  publish: (action: string, payload: unknown) => Promise<unknown[]>;
  dispatch: (
    target: { uuid: string; name?: string },
    action: string,
    payload: unknown,
  ) => Promise<unknown>;
  destroy: () => Promise<void>;
  connections: Array<{ uuid: string; name?: string }>;
}

export interface ChannelClientHandle {
  register: (action: string, fn: ChannelActionFn) => boolean;
  dispatch: (action: string, payload: unknown) => Promise<unknown>;
  disconnect: () => Promise<void>;
}

export interface UseOpenFinChannelResult {
  /**
   * Create a Channel provider listening on `channelName`. Each entry in
   * `actions` is registered via `provider.register`. The returned handle
   * is tracked internally; on unmount the hook calls `destroy()` so the
   * OpenFin runtime releases the channel.
   *
   * Outside an OpenFin runtime this rejects with an explicit error —
   * unlike `useIab.subscribe` which is a passive no-op, callers of this
   * factory are explicitly opting in to OpenFin RPC and should know.
   */
  createProvider: (
    channelName: string,
    actions?: Record<string, ChannelActionFn>,
  ) => Promise<ChannelProviderHandle>;
  /**
   * Connect to a Channel provider listening on `channelName`. The
   * returned client is tracked internally; on unmount the hook calls
   * `disconnect()`.
   */
  connect: (channelName: string) => Promise<ChannelClientHandle>;
}

function isOpenFin(): boolean {
  return typeof fin !== 'undefined' && fin?.InterApplicationBus?.Channel;
}

/**
 * React-lifecycle wrapper around the OpenFin Channel API
 * (`fin.InterApplicationBus.Channel.create` / `.connect`). Used directly
 * by features that need awaited request/response between windows, and
 * indirectly by `useWorkspaceSaveEvent` for the awaited save fan-out.
 *
 * The returned `createProvider` and `connect` functions are stable
 * across renders.
 */
export function useOpenFinChannel(): UseOpenFinChannelResult {
  const providersRef = useRef<Set<ChannelProviderHandle>>(new Set());
  const clientsRef = useRef<Set<ChannelClientHandle>>(new Set());

  const createProvider = useCallback<UseOpenFinChannelResult['createProvider']>(
    async (channelName, actions) => {
      if (!isOpenFin()) {
        throw new Error('OpenFin runtime not present');
      }
      const provider = (await fin.InterApplicationBus.Channel.create(
        channelName,
      )) as ChannelProviderHandle;
      if (actions) {
        for (const [action, fn] of Object.entries(actions)) {
          provider.register(action, fn);
        }
      }
      providersRef.current.add(provider);
      return provider;
    },
    [],
  );

  const connect = useCallback<UseOpenFinChannelResult['connect']>(
    async (channelName) => {
      if (!isOpenFin()) {
        throw new Error('OpenFin runtime not present');
      }
      const client = (await fin.InterApplicationBus.Channel.connect(
        channelName,
      )) as ChannelClientHandle;
      clientsRef.current.add(client);
      return client;
    },
    [],
  );

  // Tear down providers and clients on unmount. Best-effort — a failing
  // destroy/disconnect must not throw past unmount.
  useEffect(() => {
    const providers = providersRef.current;
    const clients = clientsRef.current;
    return () => {
      for (const p of Array.from(providers)) {
        p.destroy().catch((err) => {
          console.warn('[useOpenFinChannel] provider.destroy failed:', err);
        });
      }
      providers.clear();
      for (const c of Array.from(clients)) {
        c.disconnect().catch((err) => {
          console.warn('[useOpenFinChannel] client.disconnect failed:', err);
        });
      }
      clients.clear();
    };
  }, []);

  return { createProvider, connect };
}
