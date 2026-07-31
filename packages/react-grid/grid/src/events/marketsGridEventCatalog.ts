export type MarketsGridEventCategory = 'platform' | 'provider' | 'grid' | 'toolbar';

export interface MarketsGridEventCatalogEntry {
  id: MarketsGridEventId;
  label: string;
  description: string;
  category: MarketsGridEventCategory;
}

/** Bindable MarketsGrid / container event ids (stored in gridLevelData). */
export type MarketsGridEventId =
  | 'grid:ready'
  | 'grid:destroyed'
  | 'profile:loaded'
  | 'profile:saved'
  | 'profile:deleted'
  | 'provider:status'
  | 'provider:switched'
  | 'provider:dataStale'
  | 'toolbar:dateChanged'
  | 'grid:firstDataRendered'
  | 'grid:rowDataUpdated'
  | 'grid:cellClicked'
  | 'grid:cellValueChanged'
  | 'grid:filterChanged';

export const MARKETS_GRID_EVENT_CATALOG: readonly MarketsGridEventCatalogEntry[] = [
  { id: 'grid:ready', label: 'Grid ready', description: 'AG-Grid and profile pipeline are ready', category: 'platform' },
  { id: 'grid:destroyed', label: 'Grid destroyed', description: 'Grid instance is tearing down', category: 'platform' },
  { id: 'profile:loaded', label: 'Profile loaded', description: 'Active profile applied to the grid', category: 'platform' },
  { id: 'profile:saved', label: 'Profile saved', description: 'User saved the active profile', category: 'platform' },
  { id: 'profile:deleted', label: 'Profile deleted', description: 'A profile was removed', category: 'platform' },
  { id: 'provider:status', label: 'Provider status', description: 'Live stream status changed (loading / ready / error)', category: 'provider' },
  { id: 'provider:switched', label: 'Provider switched', description: 'Live/historical provider or mode changed', category: 'provider' },
  { id: 'provider:dataStale', label: 'Data stale', description: 'Connection lost or provider error — grid data may be stale', category: 'provider' },
  { id: 'toolbar:dateChanged', label: 'Toolbar date changed', description: 'User picked a new as-of date', category: 'toolbar' },
  { id: 'grid:firstDataRendered', label: 'First data rendered', description: 'AG-Grid rendered rows for the first time', category: 'grid' },
  { id: 'grid:rowDataUpdated', label: 'Row data updated', description: 'Underlying row model changed', category: 'grid' },
  { id: 'grid:cellClicked', label: 'Cell clicked', description: 'User clicked a cell', category: 'grid' },
  { id: 'grid:cellValueChanged', label: 'Cell value changed', description: 'User edited a cell value', category: 'grid' },
  { id: 'grid:filterChanged', label: 'Filter changed', description: 'Column filter model changed', category: 'grid' },
] as const;

const VALID_IDS = new Set<string>(MARKETS_GRID_EVENT_CATALOG.map((e) => e.id));

export function isMarketsGridEventId(id: string): id is MarketsGridEventId {
  return VALID_IDS.has(id);
}

export function marketsGridEventCatalogByCategory(
  category: MarketsGridEventCategory,
): MarketsGridEventCatalogEntry[] {
  return MARKETS_GRID_EVENT_CATALOG.filter((e) => e.category === category);
}
