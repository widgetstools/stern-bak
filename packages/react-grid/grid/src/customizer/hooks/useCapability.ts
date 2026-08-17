/**
 * Read one `platform.data` capability, live.
 *
 * WHY A HOOK — the parity roadmap's rule is that a control which cannot work
 * in the current row model says so, and never silently no-ops. The verdicts
 * that decide it live on `platform.data.capabilities`, whose `reason` strings
 * are user-facing copy written to name the limit AND what the user can do
 * instead. This is the one place the UI reads them, so a control never
 * re-derives "am I usable here" from anything else — and in particular never
 * from the row model, which binding constraint 3 forbids and which would go
 * stale the moment a provider swapped.
 *
 * WHY IT SUBSCRIBES — `GridDataHub` answers through a getter so the verdict is
 * whatever is true right now, but a getter cannot re-render anything. The hub
 * emits `data:capabilitiesChanged` when a server-side source binds, swaps or
 * detaches; this reads it again on that event. A control disabled while a
 * provider was still binding therefore enables itself when the answer changes,
 * which is what the getter has claimed since Phase 0 of the roadmap.
 *
 * Outside a `<GridProvider>` the answer is "supported, no reason" — an
 * unwired surface disables nothing.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { CapabilityVerdict, DataCapabilities } from '@wellsfargo-starui/core';
import { useOptionalGridPlatform } from './GridProvider';

export type CapabilityName = keyof DataCapabilities;

/** What an unwired surface sees: nothing is refused. */
const UNCONSTRAINED: CapabilityVerdict = { supported: true, reason: '' };

export function useCapability(name: CapabilityName): CapabilityVerdict {
  const platform = useOptionalGridPlatform();

  const subscribe = useCallback(
    (onChange: () => void) =>
      platform ? platform.events.on('data:capabilitiesChanged', onChange) : () => {},
    [platform],
  );

  // The hub returns a STABLE verdict object per adapter (both adapters hold
  // their capability set as a module constant), so `useSyncExternalStore`'s
  // identity check settles rather than re-rendering every commit.
  const getSnapshot = useCallback(
    () => (platform ? platform.data.capabilities[name] : UNCONSTRAINED),
    [platform, name],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * `{ disabled, reason }` for a control that requires a capability.
 *
 * `expect` is which side of the verdict the control needs. Most need the
 * capability to HOLD; a few describe behaviour that only exists where it does
 * not — a setting about rows that are not loaded is meaningless in a grid that
 * loads them all.
 *
 * `reason` is control-specific copy. The verdict's own wording is the default
 * and is right for most controls, but it names ONE consequence of the limit
 * and some controls hit a different one: "scroll the rows into view first"
 * helps someone editing a cell and does not help someone wondering why a
 * column header never lights. It is also the only copy available in the
 * `expect: false` direction, where the verdict is supported and carries an
 * empty reason by contract.
 */
export function useCapabilityGate(
  name: CapabilityName,
  options: { expect?: boolean; reason?: string } = {},
): { disabled: boolean; reason: string } {
  const verdict = useCapability(name);
  const expect = options.expect ?? true;
  if (verdict.supported === expect) return { disabled: false, reason: '' };
  return { disabled: true, reason: options.reason || verdict.reason };
}
