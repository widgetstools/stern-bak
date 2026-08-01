/**
 * Grid-level-data persistence, extracted from {@link MarketsGridContainer}
 * to keep that component under the 800-LOC ceiling.
 *
 * Owns the picker selection / caption / event-binding state plus the three
 * effects that keep it in sync with the storage adapter's
 * `loadGridLevelData` / `saveGridLevelData` row:
 *   1. initial load (falls through to host defaults when the adapter has no
 *      grid-level support or the row is empty),
 *   2. persist-on-mutation (de-duped, bootstrap-once, StrictMode-safe via
 *      `lastSavedRef`),
 *   3. `gridLevelData:imported` re-hydration when a profile import writes the
 *      backing row out-of-band.
 *
 * Behaviour is identical to the inlined version — same effects, same deps.
 * Toolbar date/asOf restore stays in the container because it drives toolbar
 * state, not persistence.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StorageAdapter } from '@wellsfargo-starui/core';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid';
import {
  DEFAULT_PROVIDER_SELECTION,
  normalizeGridLevelData,
  serializeGridLevelData,
  type GridLevelStateV1,
  type ProviderSelection,
} from './gridLevelState.js';

const DEFAULT_SELECTION = DEFAULT_PROVIDER_SELECTION;

/** Structural compare for the event-bindings map — replaces a
 *  JSON.stringify of both sides per save-check, and is key-order
 *  insensitive where the JSON compare wasn't. */
function eventBindingsEqual(
  a: Record<string, string[]> | undefined,
  b: Record<string, string[]> | undefined,
): boolean {
  const ax = a ?? {};
  const bx = b ?? {};
  if (ax === bx) return true;
  const aKeys = Object.keys(ax);
  if (aKeys.length !== Object.keys(bx).length) return false;
  for (const key of aKeys) {
    const av = ax[key];
    const bv = bx[key];
    if (av === bv) continue;
    if (!Array.isArray(av) || !Array.isArray(bv) || av.length !== bv.length) return false;
    for (let i = 0; i < av.length; i++) {
      if (av[i] !== bv[i]) return false;
    }
  }
  return true;
}

/** True when two serialized grid-level blobs carry identical persisted fields. */
function gridLevelEqual(a: GridLevelStateV1 | null, b: GridLevelStateV1): boolean {
  if (!a) return false;
  return (
    a.provider.liveProviderId === b.provider.liveProviderId
    && a.provider.historicalProviderId === b.provider.historicalProviderId
    && a.provider.mode === b.provider.mode
    && a.caption === b.caption
    && eventBindingsEqual(a.eventBindings, b.eventBindings)
  );
}

export interface UseGridLevelPersistenceParams {
  adapter: StorageAdapter | null;
  gridId: string;
  defaultLiveProviderId?: string;
  defaultHistoricalProviderId?: string;
  gridHandle: MarketsGridHandle | null;
}

export interface GridLevelPersistence {
  selection: ProviderSelection;
  setSelection: React.Dispatch<React.SetStateAction<ProviderSelection>>;
  persistedCaption: string | undefined;
  setPersistedCaption: React.Dispatch<React.SetStateAction<string | undefined>>;
  eventBindings: Record<string, string[]>;
  setEventBindings: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  loaded: boolean;
  applyDefaults: (sel: ProviderSelection) => ProviderSelection;
}

export function useGridLevelPersistence(
  params: UseGridLevelPersistenceParams,
): GridLevelPersistence {
  const { adapter, gridId, defaultLiveProviderId, defaultHistoricalProviderId, gridHandle } = params;

  // `loaded === false` while we wait for the first load. Once it
  // flips, MarketsGrid mounts with the persisted selection in place
  // — no second mount required when the load resolves.
  const [selection, setSelection] = useState<ProviderSelection>(DEFAULT_SELECTION);
  const [persistedCaption, setPersistedCaption] = useState<string | undefined>(undefined);
  const [eventBindings, setEventBindings] = useState<Record<string, string[]>>({});
  const [loaded, setLoaded] = useState(false);
  const lastSavedRef = useRef<GridLevelStateV1 | null>(null);
  /** False when disk has no provider link yet — bootstrap should write once. */
  const diskHadProviderLinkRef = useRef<boolean | null>(null);
  const persistChainRef = useRef<Promise<void>>(Promise.resolve());

  // Live mirrors of the persisted fields so `flush` (called from a stable
  // event listener) always serializes the latest committed values without
  // re-subscribing on every keystroke.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const captionRef = useRef(persistedCaption);
  captionRef.current = persistedCaption;
  const eventBindingsRef = useRef(eventBindings);
  eventBindingsRef.current = eventBindings;
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;

  // Fill empty provider slots from the configured defaults. Shared by the
  // initial load and the import-restore handler so both reconcile the
  // persisted selection against host defaults identically.
  const applyDefaults = useCallback(
    (sel: ProviderSelection): ProviderSelection => {
      let next = sel;
      if (!next.liveProviderId && defaultLiveProviderId) {
        next = { ...next, liveProviderId: defaultLiveProviderId, mode: 'live' };
      }
      if (!next.historicalProviderId && defaultHistoricalProviderId) {
        next = { ...next, historicalProviderId: defaultHistoricalProviderId };
      }
      return next;
    },
    [defaultLiveProviderId, defaultHistoricalProviderId],
  );

  // Initial load. If the adapter doesn't implement grid-level data
  // (older third-party adapters), or there's no adapter at all, we
  // fall through to the default selection and mark as loaded.
  useEffect(() => {
    let cancelled = false;

    if (!adapter?.loadGridLevelData) {
      diskHadProviderLinkRef.current = false;
      if (defaultLiveProviderId || defaultHistoricalProviderId) {
        setSelection(applyDefaults({ ...DEFAULT_SELECTION }));
      }
      setLoaded(true);
      return;
    }
    void adapter
      .loadGridLevelData(gridId)
      .then((raw) => {
        if (cancelled) return;
        const state = normalizeGridLevelData(raw);
        diskHadProviderLinkRef.current = Boolean(
          state.provider.liveProviderId || state.provider.historicalProviderId,
        );
        setSelection(applyDefaults(state.provider));
        setPersistedCaption(state.caption);
        setEventBindings(state.eventBindings ?? {});
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        diskHadProviderLinkRef.current = false;
        setSelection({ ...DEFAULT_SELECTION });
        setPersistedCaption(undefined);
        setEventBindings({});
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [adapter, gridId, applyDefaults, defaultLiveProviderId, defaultHistoricalProviderId]);

  // Persist on mutation. `lastSavedRef` skips the initial sync when
  // `loaded` flips (state just came FROM disk; saving back would be a
  // no-op write) AND handles React StrictMode's double-effect correctly
  // across remounts. Tracks both the picker selection and the persisted
  // caption — they share the same gridLevelData blob.
  useEffect(() => {
    if (!loaded) return;
    const next = serializeGridLevelData({
      v: 1,
      provider: selection,
      caption: persistedCaption,
      eventBindings: Object.keys(eventBindings).length > 0 ? eventBindings : undefined,
    });
    const enqueuePersist = (payload: GridLevelStateV1) => {
      if (!adapter?.saveGridLevelData) return;
      persistChainRef.current = persistChainRef.current
        .then(() => adapter.saveGridLevelData!(gridId, payload))
        .catch((err) => {
          console.warn('[markets-grid-container] gridLevelData save failed:', err);
        });
    };

    if (lastSavedRef.current === null) {
      lastSavedRef.current = next;
      const shouldBootstrapPersist =
        diskHadProviderLinkRef.current === false
        && Boolean(next.provider.liveProviderId || next.provider.historicalProviderId);
      if (shouldBootstrapPersist) {
        diskHadProviderLinkRef.current = true;
        enqueuePersist(next);
      }
      return;
    }
    if (gridLevelEqual(lastSavedRef.current, next)) {
      return;
    }
    lastSavedRef.current = next;
    enqueuePersist(next);
  }, [selection, persistedCaption, eventBindings, loaded, adapter, gridId]);

  // Flush the current grid-level data to storage. Called on every profile
  // save so a registered/ConfigService component always stores its
  // `gridLevelData.provider.liveProviderId` (and caption / event-bindings)
  // alongside the profile — even if a just-changed selection hadn't yet been
  // flushed by the effect above. Writes unconditionally (profiles are
  // explicit-save-only, so this is at most one extra row write per user Save);
  // `lastSavedRef` is primed so the reactive effect treats it as already
  // persisted and skips a redundant write. The adapter's OCC read-modify-write
  // keeps this coherent with the concurrent profile write to the same row.
  const flush = useCallback(() => {
    if (!loadedRef.current || !adapter?.saveGridLevelData) return;
    const next = serializeGridLevelData({
      v: 1,
      provider: selectionRef.current,
      caption: captionRef.current,
      eventBindings:
        Object.keys(eventBindingsRef.current).length > 0 ? eventBindingsRef.current : undefined,
    });
    lastSavedRef.current = next;
    persistChainRef.current = persistChainRef.current
      .then(() => adapter.saveGridLevelData!(gridId, next))
      .catch((err) => {
        console.warn('[markets-grid-container] gridLevelData flush-on-save failed:', err);
      });
  }, [adapter, gridId]);

  // Apply grid-level data restored by a profile import (schemaVersion 2).
  // The ProfileManager has already written the blob to the same backing
  // row and emitted `gridLevelData:imported`; this mirrors it into live
  // picker/caption/binding state so the view updates without a reload.
  // `lastSavedRef` is primed to the applied value so the persist effect
  // above treats it as already-on-disk and skips a redundant write (which
  // would also bump the row version unnecessarily).
  const applyImportedGridLevelData = useCallback(
    (raw: unknown) => {
      const state = normalizeGridLevelData(raw);
      const provider = applyDefaults(state.provider);
      const bindings = state.eventBindings ?? {};
      lastSavedRef.current = serializeGridLevelData({
        v: 1,
        provider,
        caption: state.caption,
        eventBindings: Object.keys(bindings).length > 0 ? bindings : undefined,
      });
      setSelection(provider);
      setPersistedCaption(state.caption);
      setEventBindings(bindings);
    },
    [applyDefaults],
  );

  // Subscribe to the grid's `gridLevelData:imported` event per mounted
  // handle. A provider-switch remount swaps `gridHandle` (new platform),
  // so re-binding on its identity keeps the listener on the live bus and
  // cleans up the stale one.
  useEffect(() => {
    const events = gridHandle?.platform?.events;
    if (!events) return;
    const offImported = events.on('gridLevelData:imported', ({ data }) => {
      applyImportedGridLevelData(data);
    });
    // Co-persist grid-level data on every profile save. ProfileManager emits
    // `profile:saved` from every save path (toolbar Save, customizer card
    // Save, save-on-switch, external `saveAll`), so the provider selection is
    // always written alongside the profile.
    const offSaved = events.on('profile:saved', () => {
      flush();
    });
    return () => {
      offImported();
      offSaved();
    };
  }, [gridHandle, applyImportedGridLevelData, flush]);

  return {
    selection,
    setSelection,
    persistedCaption,
    setPersistedCaption,
    eventBindings,
    setEventBindings,
    loaded,
    applyDefaults,
  };
}
