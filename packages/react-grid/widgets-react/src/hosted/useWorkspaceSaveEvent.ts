/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useEffect, useRef } from 'react';

const WORKSPACE_SAVE_CHANNEL = 'marketsui-workspace-save-channel';

/**
 * Async flush callback. The promise this returns is awaited by the
 * platform-side dispatch — keep its work bounded (a single
 * `saveActiveProfile` call, etc.) so workspace save doesn't stall.
 */
export type WorkspaceSaveCallback = () => void | Promise<void>;

/**
 * Optional post-save listener. Fired fire-and-forget after the workspace
 * row has been written, so this runs after `saveCb` resolves on the
 * platform side. Receives the saved `workspaceId`.
 */
export type WorkspaceSavedCallback = (workspaceId: string) => void;

export interface UseWorkspaceSaveEventOptions {
  /**
   * Optional listener for the post-save `workspace-saved` broadcast.
   * Useful for components that want to refresh derived state once the
   * snapshot row has committed.
   */
  onSaved?: WorkspaceSavedCallback;
}

function isOpenFin(): boolean {
  return typeof fin !== 'undefined' && !!fin?.InterApplicationBus?.Channel?.connect;
}

/**
 * Connects to the platform-side workspace-save Channel provider and
 * registers `saveCb` as the awaited `workspace-saving` handler. The
 * platform `dispatch`es to every connected client before capturing the
 * OpenFin snapshot, so the promise this hook's handler returns blocks
 * snapshot capture until each view has flushed its state.
 *
 * Pass `options.onSaved` to listen for the post-save broadcast.
 *
 * Outside an OpenFin runtime this is a no-op — no connection is opened
 * and no handler is registered. Pass `undefined` for `saveCb` to
 * deliberately skip registration even inside OpenFin (e.g., gated by a
 * feature flag).
 */
export function useWorkspaceSaveEvent(
  saveCb: WorkspaceSaveCallback | undefined,
  options?: UseWorkspaceSaveEventOptions,
): void {
  // Stable refs so the effect can stay one-shot — re-running on every
  // callback identity change would tear down + rebuild the channel
  // connection on every parent render.
  const saveRef = useRef<WorkspaceSaveCallback | undefined>(saveCb);
  const savedRef = useRef<WorkspaceSavedCallback | undefined>(options?.onSaved);

  useEffect(() => {
    saveRef.current = saveCb;
  }, [saveCb]);
  useEffect(() => {
    savedRef.current = options?.onSaved;
  }, [options?.onSaved]);

  useEffect(() => {
    if (!isOpenFin() || !saveCb) return;

    let cancelled = false;
    let client: any | null = null;

    (async () => {
      try {
        client = await fin.InterApplicationBus.Channel.connect(WORKSPACE_SAVE_CHANNEL);
        if (cancelled) {
          // Hook unmounted before the connection resolved — drop it.
          try {
            await client.disconnect();
          } catch {
            /* noop */
          }
          return;
        }

        client.register('workspace-saving', async () => {
          // Returning the awaited promise is what makes the platform
          // `dispatch` block until the flush completes.
          const cb = saveRef.current;
          if (!cb) return;
          try {
            await cb();
          } catch (err) {
            console.warn('[useWorkspaceSaveEvent] flush callback threw:', err);
          }
        });

        client.register('workspace-saved', (payload: any) => {
          const cb = savedRef.current;
          if (!cb) return;
          try {
            cb(payload?.workspaceId);
          } catch (err) {
            console.warn('[useWorkspaceSaveEvent] onSaved listener threw:', err);
          }
        });
      } catch (err) {
        console.warn('[useWorkspaceSaveEvent] connect failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (client) {
        client.disconnect().catch((err: unknown) => {
          console.warn('[useWorkspaceSaveEvent] disconnect failed:', err);
        });
      }
    };
    // We deliberately depend only on whether saveCb is provided. The
    // *value* of saveCb is read through the ref at dispatch time, so a
    // callback identity change should not rebuild the channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(saveCb)]);
}
