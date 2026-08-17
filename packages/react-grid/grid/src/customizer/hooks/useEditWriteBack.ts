/**
 * Bind a grid's write-back to the per-grid registry the editing funnels read.
 *
 * The indirection through a ref is what lets a consumer write the natural
 * thing — `editWriteBack={{ submit: (s) => api.save(s) }}` — without churning
 * the registry on every render: what gets registered is a stable pair of
 * forwarders, and only the presence of a write-back is a dependency.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { EditWriteBack, GridPlatform } from '@wellsfargo-starui/core';
import { registerEditWriteBack } from '../editing/editWriteBack.js';
import { reportEditFailure } from '../editing/editFailureToast.js';

export function useEditWriteBack(
  platform: GridPlatform,
  writeBack: EditWriteBack | null | undefined,
): void {
  const latest = useRef(writeBack);
  latest.current = writeBack;

  const enabled = Boolean(writeBack);
  const forwarder = useMemo<EditWriteBack>(
    () => ({
      submit: (submission) => latest.current?.submit(submission),
      // The toast is the platform's, the handler is the app's, and the app's
      // runs either way — `finally` so a throw from the surface cannot take
      // the consumer's telemetry down with it.
      onFailure: (failure) => {
        try {
          reportEditFailure(failure);
        } finally {
          latest.current?.onFailure?.(failure);
        }
      },
    }),
    [],
  );

  const { gridId, data } = platform;
  useEffect(() => {
    if (!enabled) return;
    registerEditWriteBack(gridId, { writeBack: forwarder, port: data });
    return () => registerEditWriteBack(gridId, null);
  }, [enabled, forwarder, gridId, data]);
}
