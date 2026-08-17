/**
 * The historical-date subsystem, shared by both grid containers.
 *
 * Owns the toolbar date, the as-of date, the AppData round-trip, and the
 * three derived values the grid needs (`toolbarDateHistoryEnabled`, the
 * `historicalViewMode` banner flag, its message). Moved out of
 * `MarketsGridContainer` when the server-side container adopted it: every
 * rule here — when a date counts as historical, what happens when no
 * historical provider is configured, whether the banner shows, when a reload
 * is owed — has to mean the same thing in both row models, and two
 * hand-written copies of it would not.
 *
 * What stays at the call site is the RELOAD GATE. A queued reload must not
 * fire until the container is ready to serve it, and "ready" differs: the
 * client-side container waits for a live `GridApi` so its snapshot listeners
 * are attached before `restart()`; the server-side one waits for a started
 * provider. So this hook only says a reload is OWED
 * ({@link ContainerHistoricalDate.consumePendingReload}) — each container
 * gates it and then calls its own reload.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { isHistoricalToolbarDate, todayIsoDate } from '@wellsfargo-starui/grid/customizer';
import type { MarketsGridContainerEventBus } from '@wellsfargo-starui/grid';
import {
  readHistoricalDateFromAppData,
  writeHistoricalDateToAppData,
  type HistoricalDateReader,
  type HistoricalDateWriter,
} from './historicalDateAppData.js';
import type { ProviderMode, ProviderSelection } from './gridLevelState.js';

export interface UseContainerHistoricalDateParams {
  /** False while grid-level data is still loading; gates the AppData restore. */
  loaded: boolean;
  mode: ProviderMode;
  /** The persisted historical slot; `defaultHistoricalProviderId` backs it. */
  historicalProviderId: string | null;
  defaultHistoricalProviderId?: string;
  /** `'appDataProviderName.key'`. Absent = no AppData round-trip. */
  historicalDateAppDataRef?: string;
  appDataStore: HistoricalDateReader & HistoricalDateWriter;
  setSelection: Dispatch<SetStateAction<ProviderSelection>>;
  setMode: (mode: ProviderMode) => void;
  /** Already resolved — no `?? defaultOnError` inside this hook. */
  onError: (error: Error) => void;
  containerEventBus: MarketsGridContainerEventBus;
}

export interface ContainerHistoricalDate {
  asOfDate: string | null;
  /** Custom Settings' as-of picker. Persists and mirrors the toolbar date. */
  setAsOfDate: (next: string | null) => void;
  toolbarDate: string;
  onToolbarDateChange: (next: string) => void;
  toolbarDateHistoryEnabled: boolean;
  isHistoricalView: boolean;
  historicalViewMessage: string | undefined;
  /**
   * `true` exactly once, when a queued reload's intent matches committed
   * state. Call it from an effect that has ALREADY checked the container is
   * ready to reload — a `true` consumes the intent.
   */
  consumePendingReload: () => boolean;
}

/** The queued-reload intent, and the rule for consuming it. */
type PendingReload = { mode: ProviderMode; asOfDate: string | null };

function useDateState(
  loaded: boolean,
  mode: ProviderMode,
  historicalDateAppDataRef: string | undefined,
  appDataStore: HistoricalDateReader & HistoricalDateWriter,
) {
  const [asOfDate, setAsOfDateState] = useState<string | null>(null);
  const [toolbarDate, setToolbarDate] = useState<string>(todayIsoDate);

  // Restore the toolbar date from AppData when the persisted mode is
  // historical. Deliberately does NOT queue a reload: provider wiring
  // late-joins a warm hub slot, and only a cold start needs the restart —
  // that decision lives in `resolveProviderStartPlan`.
  useEffect(() => {
    if (!loaded || mode !== 'historical') return;
    const restored = readHistoricalDateFromAppData(historicalDateAppDataRef, appDataStore);
    if (restored) {
      setToolbarDate(restored);
      setAsOfDateState(restored);
    }
  }, [loaded, mode, historicalDateAppDataRef, appDataStore]);

  const setAsOfDate = useCallback((next: string | null) => {
    setAsOfDateState(next);
    if (next) {
      setToolbarDate(next);
      void writeHistoricalDateToAppData(historicalDateAppDataRef, appDataStore, next);
    }
  }, [appDataStore, historicalDateAppDataRef]);

  return { asOfDate, setAsOfDateState, setAsOfDate, toolbarDate, setToolbarDate };
}

export function useContainerHistoricalDate(
  params: UseContainerHistoricalDateParams,
): ContainerHistoricalDate {
  const {
    loaded,
    mode,
    historicalProviderId,
    defaultHistoricalProviderId,
    historicalDateAppDataRef,
    appDataStore,
    setSelection,
    setMode,
    onError,
    containerEventBus,
  } = params;

  const { asOfDate, setAsOfDateState, setAsOfDate, toolbarDate, setToolbarDate } =
    useDateState(loaded, mode, historicalDateAppDataRef, appDataStore);

  // Carries the *intent* of a queued reload — the mode + asOfDate the reload
  // should run against — not a bare boolean. The ref is set synchronously in
  // the handler while the matching state updates commit a render later;
  // keying off the intent lets the reload fire exactly once, when committed
  // state catches up, with the correct payload.
  const pendingReloadRef = useRef<PendingReload | null>(null);

  const effectiveHistoricalProviderId =
    historicalProviderId ?? defaultHistoricalProviderId ?? null;
  const isHistoricalView =
    mode === 'historical' && asOfDate != null && isHistoricalToolbarDate(asOfDate);

  const onToolbarDateChange = useCallback((next: string) => {
    setToolbarDate(next);

    if (isHistoricalToolbarDate(next)) {
      if (!effectiveHistoricalProviderId) {
        onError(new Error(
          'Cannot load historical data: no historical provider is configured.',
        ));
        return;
      }
      setAsOfDate(next);
      setSelection((s) => ({
        ...s,
        mode: 'historical',
        historicalProviderId: s.historicalProviderId ?? defaultHistoricalProviderId ?? null,
      }));
      pendingReloadRef.current = { mode: 'historical', asOfDate: next };
      containerEventBus.emit('toolbar:dateChanged', { date: next, historical: true });
      return;
    }

    if (mode === 'historical') {
      setAsOfDateState(null);
      setMode('live');
      pendingReloadRef.current = { mode: 'live', asOfDate: null };
    }
    containerEventBus.emit('toolbar:dateChanged', { date: next, historical: false });
  }, [
    effectiveHistoricalProviderId,
    defaultHistoricalProviderId,
    setAsOfDate,
    setAsOfDateState,
    setToolbarDate,
    setSelection,
    setMode,
    mode,
    onError,
    containerEventBus,
  ]);

  const consumePendingReload = useCallback(() => {
    const pending = pendingReloadRef.current;
    if (!pending) return false;
    // Fire only once the committed state matches the intent that queued this
    // reload. The ref is set synchronously in the handler, but the matching
    // date / mode updates commit a render later — an unrelated render (a grid
    // becoming ready, say) can otherwise run the caller's effect with stale
    // state, consume the intent with the wrong payload, and skip the
    // historical restart that carries `{ asOfDate }`.
    if (mode !== pending.mode) return false;
    if (pending.mode === 'historical' && asOfDate !== pending.asOfDate) return false;
    pendingReloadRef.current = null;
    return true;
  }, [mode, asOfDate]);

  return {
    asOfDate,
    setAsOfDate,
    toolbarDate,
    onToolbarDateChange,
    toolbarDateHistoryEnabled: effectiveHistoricalProviderId != null,
    isHistoricalView,
    historicalViewMessage: isHistoricalView
      ? `Viewing historical data as of ${asOfDate}. Editing is disabled.`
      : undefined,
    consumePendingReload,
  };
}
