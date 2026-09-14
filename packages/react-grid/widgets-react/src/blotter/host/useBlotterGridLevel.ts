/**
 * Grid-level persistence for {@link BlotterHost}: the storage adapter, the
 * persisted provider selection / caption / event bindings, and the
 * selection setters that flush the grid before a provider switch remounts
 * it. Same behaviour as `MarketsGridContainer`; the load/persist effects
 * themselves stay in `useGridLevelPersistence`.
 */
import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import type { StorageAdapter } from '@wellsfargo-starui/core';
import type { MarketsGridHandle, StorageAdapterFactory } from '@wellsfargo-starui/grid';
import { useGridLevelPersistence } from '../../container/markets-grid-container/useGridLevelPersistence.js';
import type { ProviderMode, ProviderSelection } from '../../container/markets-grid-container/gridLevelState.js';
import { isOpenFinRuntime } from '../../container/markets-grid-container/openFinRuntime.js';

export interface BlotterGridLevelArgs {
  storage: StorageAdapterFactory | null;
  gridId: string;
  instanceId: string;
  appId?: string;
  userId?: string;
  defaultLiveProviderId?: string;
  defaultHistoricalProviderId?: string;
  gridHandle: MarketsGridHandle | null;
  /** Latest grid handle, for the save-before-switch flush. */
  gridHandleRef: React.MutableRefObject<MarketsGridHandle | null>;
  /** The caption prop (initial / fallback; under OpenFin the live tab name). */
  propCaption: string | undefined;
  onCaptionChange?: (next: string) => void;
}

export interface BlotterGridLevel {
  adapter: StorageAdapter | null;
  loaded: boolean;
  selection: ProviderSelection;
  setSelection: Dispatch<SetStateAction<ProviderSelection>>;
  setLiveId: (id: string | null) => void;
  setHistoricalId: (id: string | null) => void;
  setMode: (mode: ProviderMode) => void;
  effectiveCaption: string | undefined;
  handleCaptionChange: (next: string) => void;
  eventBindings: Record<string, string[]>;
  setEventBindings: Dispatch<SetStateAction<Record<string, string[]>>>;
}

/**
 * Under OpenFin the caption prop is the live tab name. A genuine post-mount
 * change to it means the tab was renamed externally ("Save Tab As…") — adopt
 * it into the persisted caption. The initial value is never adopted, so an
 * existing persisted caption survives until the tab is actually renamed.
 */
function useAdoptExternalRename(
  propCaption: string | undefined,
  persistedCaption: string | undefined,
  setPersistedCaption: Dispatch<SetStateAction<string | undefined>>,
): void {
  const lastPropCaptionRef = useRef(propCaption);
  useEffect(() => {
    if (lastPropCaptionRef.current === propCaption) return;
    lastPropCaptionRef.current = propCaption;
    if (!isOpenFinRuntime()) return;
    if (propCaption && propCaption !== persistedCaption) setPersistedCaption(propCaption);
  }, [propCaption, persistedCaption, setPersistedCaption]);
}

export function useBlotterGridLevel(args: BlotterGridLevelArgs): BlotterGridLevel {
  const { storage, gridId, instanceId, appId, userId, gridHandleRef, propCaption, onCaptionChange } = args;

  // One adapter per identity tuple — the same row MarketsGrid uses for profiles.
  const adapter = useMemo<StorageAdapter | null>(
    () => (storage ? storage({ instanceId, gridId, appId, userId }) : null),
    [storage, instanceId, gridId, appId, userId],
  );

  const persistence = useGridLevelPersistence({
    adapter,
    gridId,
    defaultLiveProviderId: args.defaultLiveProviderId,
    defaultHistoricalProviderId: args.defaultHistoricalProviderId,
    gridHandle: args.gridHandle,
  });
  const { selection, setSelection, persistedCaption, setPersistedCaption, eventBindings, setEventBindings, loaded } = persistence;

  const handleCaptionChange = useCallback((next: string) => {
    setPersistedCaption(next);
    onCaptionChange?.(next);
  }, [setPersistedCaption, onCaptionChange]);
  useAdoptExternalRename(propCaption, persistedCaption, setPersistedCaption);

  // Save-and-switch: a provider change is part of the grid `key`, so the grid
  // remounts and re-hydrates the customizer from disk; flush the working set
  // first so per-card saves survive the remount (a clean save is a no-op).
  const applyProviderSelection = useCallback(async (apply: (s: ProviderSelection) => ProviderSelection) => {
    const handle = gridHandleRef.current;
    if (handle) {
      try { await handle.saveAll(); } catch (err) { console.warn('[blotter-host] save-before-provider-switch failed:', err); }
    }
    setSelection(apply);
  }, [gridHandleRef, setSelection]);
  const setLiveId = useCallback((id: string | null) => { void applyProviderSelection((s) => ({ ...s, liveProviderId: id })); }, [applyProviderSelection]);
  const setHistoricalId = useCallback((id: string | null) => { void applyProviderSelection((s) => ({ ...s, historicalProviderId: id })); }, [applyProviderSelection]);
  const setMode = useCallback((mode: ProviderMode) => { void applyProviderSelection((s) => ({ ...s, mode })); }, [applyProviderSelection]);

  return {
    adapter,
    loaded,
    selection,
    setSelection,
    setLiveId,
    setHistoricalId,
    setMode,
    effectiveCaption: persistedCaption ?? propCaption,
    handleCaptionChange,
    eventBindings,
    setEventBindings,
  };
}
