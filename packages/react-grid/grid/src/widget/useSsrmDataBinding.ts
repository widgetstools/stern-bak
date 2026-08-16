/**
 * Binds this grid's server-side data plane to `platform.data`.
 *
 * The platform is constructed once per MarketsGrid instance and deliberately
 * outlives the provider: it exists before AG-Grid mounts, survives a provider
 * swap (the SSRM surface remounts on `provider.id`, the platform does not),
 * and must stay usable when a provider fails to create at all. So the binding
 * moves, not the platform — same shape `ApiHub.attach` already uses for the
 * GridApi.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { GridPlatform, SsrmDataBinding } from '@wellsfargo-starui/core';
import type { MarketsGridSsrmProps } from './types';

/** The platform-facing view of the `ssrm` prop. Stable while the provider,
 *  its key column and its quick-filter reader are. */
export function useSsrmDataBinding(
  ssrm: MarketsGridSsrmProps | undefined,
): SsrmDataBinding | undefined {
  return useMemo(
    () =>
      ssrm?.provider
        ? {
            source: ssrm.provider,
            keyColumn: ssrm.keyColumn,
            getQuickFilterText: ssrm.getQuickFilterText,
          }
        : undefined,
    [ssrm?.provider, ssrm?.keyColumn, ssrm?.getQuickFilterText],
  );
}

/** Keep `platform.data` pointed at the current binding. */
export function useSsrmDataBindingSync(
  platform: GridPlatform,
  binding: SsrmDataBinding | undefined,
): void {
  // Seeded with the binding the platform was CONSTRUCTED with, so the first
  // effect run after mount is a no-op rather than a redundant re-bind.
  const boundRef = useRef(binding);
  useEffect(() => {
    if (boundRef.current === binding) return;
    boundRef.current = binding;
    if (binding) platform.data.bindSsrm(binding);
    else platform.data.unbindSsrm();
  }, [platform, binding]);
}
