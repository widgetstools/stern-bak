/**
 * Toolbar date → historical mode for {@link BlotterHost}: the as-of date,
 * the toolbar date, the AppData write-through, the historical-view banner
 * inputs and the queued "reload after the mode switch" intent. Same rules
 * as `MarketsGridContainer`.
 */
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { isHistoricalToolbarDate } from '@wellsfargo-starui/grid/customizer';
import type { createMarketsGridContainerEventBus } from '@wellsfargo-starui/grid';
import type { ProviderMode, ProviderSelection } from '../../container/markets-grid-container/gridLevelState.js';

type ContainerEventBus = ReturnType<typeof createMarketsGridContainerEventBus>;
type AppDataStoreLike = { get: (name: string, key: string) => unknown; set: (name: string, key: string, value: unknown) => unknown };

export interface PendingToolbarReload { mode: ProviderMode; asOfDate: string | null }

export interface BlotterToolbarDateArgs {
  loaded: boolean;
  selection: ProviderSelection;
  setSelection: Dispatch<SetStateAction<ProviderSelection>>;
  setMode: (mode: ProviderMode) => void;
  historicalDateAppDataRef?: string;
  defaultHistoricalProviderId?: string;
  appDataStore: AppDataStoreLike;
  containerEventBus: ContainerEventBus;
  onError: (error: Error) => void;
}

export interface BlotterToolbarDate {
  asOfDate: string | null;
  setAsOfDate: Dispatch<SetStateAction<string | null>>;
  toolbarDate: string;
  setAsOfDateAndPersist: (next: string | null) => void;
  handleToolbarDateChange: (next: string) => void;
  /** Intent of a queued reload, consumed by the data feed once state catches up. */
  pendingReloadRef: React.MutableRefObject<PendingToolbarReload | null>;
  effectiveHistoricalProviderId: string | null;
  toolbarDateHistoryEnabled: boolean;
  isHistoricalView: boolean;
  historicalViewMessage: string | undefined;
}

export function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** `'positions.asOfDate'` → `['positions', 'asOfDate']`, or `null` when malformed. */
export function splitAppDataRef(ref: string | undefined): [string, string] | null {
  if (!ref) return null;
  const dot = ref.indexOf('.');
  return dot > 0 ? [ref.slice(0, dot), ref.slice(dot + 1)] : null;
}

export function useBlotterToolbarDate(args: BlotterToolbarDateArgs): BlotterToolbarDate {
  const { loaded, selection, setSelection, setMode, historicalDateAppDataRef, defaultHistoricalProviderId, appDataStore, containerEventBus, onError } = args;
  const [asOfDate, setAsOfDate] = useState<string | null>(null);
  const [toolbarDate, setToolbarDate] = useState(todayIsoDate);
  const pendingReloadRef = useRef<PendingToolbarReload | null>(null);

  // Restore the toolbar date from AppData when the persisted mode is historical.
  // No reload is queued on mount: the provider late-joins a warm hub slot.
  useEffect(() => {
    if (!loaded || selection.mode !== 'historical') return;
    const ref = splitAppDataRef(historicalDateAppDataRef);
    if (!ref) return;
    const val = appDataStore.get(ref[0], ref[1]);
    if (typeof val === 'string' && isHistoricalToolbarDate(val)) {
      setToolbarDate(val);
      setAsOfDate(val);
    }
  }, [loaded, selection.mode, historicalDateAppDataRef, appDataStore]);

  const setAsOfDateAndPersist = useCallback((next: string | null) => {
    setAsOfDate(next);
    if (next) setToolbarDate(next);
    const ref = splitAppDataRef(historicalDateAppDataRef);
    if (next && ref) void appDataStore.set(ref[0], ref[1], next);
  }, [appDataStore, historicalDateAppDataRef]);

  const effectiveHistoricalProviderId = selection.historicalProviderId ?? defaultHistoricalProviderId ?? null;

  const handleToolbarDateChange = useCallback((next: string) => {
    setToolbarDate(next);
    if (isHistoricalToolbarDate(next)) {
      if (!effectiveHistoricalProviderId) {
        onError(new Error('Cannot load historical data: no historical provider is configured.'));
        return;
      }
      setAsOfDateAndPersist(next);
      setSelection((s) => ({ ...s, mode: 'historical', historicalProviderId: s.historicalProviderId ?? defaultHistoricalProviderId ?? null }));
      pendingReloadRef.current = { mode: 'historical', asOfDate: next };
      containerEventBus.emit('toolbar:dateChanged', { date: next, historical: true });
      return;
    }
    if (selection.mode === 'historical') {
      setAsOfDate(null);
      setMode('live');
      pendingReloadRef.current = { mode: 'live', asOfDate: null };
    }
    containerEventBus.emit('toolbar:dateChanged', { date: next, historical: false });
  }, [effectiveHistoricalProviderId, defaultHistoricalProviderId, setAsOfDateAndPersist, setSelection, setMode, selection.mode, onError, containerEventBus]);

  const isHistoricalView = selection.mode === 'historical' && asOfDate != null && isHistoricalToolbarDate(asOfDate);
  return {
    asOfDate,
    setAsOfDate,
    toolbarDate,
    setAsOfDateAndPersist,
    handleToolbarDateChange,
    pendingReloadRef,
    effectiveHistoricalProviderId,
    toolbarDateHistoryEnabled: effectiveHistoricalProviderId != null,
    isHistoricalView,
    historicalViewMessage: isHistoricalView ? `Viewing historical data as of ${asOfDate}. Editing is disabled.` : undefined,
  };
}
