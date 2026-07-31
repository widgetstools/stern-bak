import { cellRendererComponents } from '@wellsfargo-starui/design-system';
import { StreamSafeTextFloatingFilter } from './streamSafeFloatingFilter';
import { StreamSafeNumberFloatingFilter } from './streamSafeNumberFloatingFilter';
import { StreamSafeDateFloatingFilter } from './streamSafeDateFloatingFilter';

const BASE_COMPONENTS = {
  streamSafeText: StreamSafeTextFloatingFilter,
  streamSafeNumber: StreamSafeNumberFloatingFilter,
  ...cellRendererComponents,
} as const;

const DATE_COMPONENT = {
  streamSafeDate: StreamSafeDateFloatingFilter,
} as const;

const FULL_COMPONENTS = {
  ...BASE_COMPONENTS,
  ...DATE_COMPONENT,
} as const;

/** Module-scoped full map — default when no column scan is available. */
export const STREAM_SAFE_COMPONENTS_FULL = Object.freeze({ ...FULL_COMPONENTS });

type AnyColDef = {
  floatingFilterComponent?: string;
  filter?: string | boolean | Record<string, unknown>;
  children?: AnyColDef[];
};

function colDefUsesDateFilter(def: AnyColDef): boolean {
  const ff = def.floatingFilterComponent;
  if (ff === 'streamSafeDate') return true;
  const filter = def.filter;
  if (filter === 'agDateColumnFilter') return true;
  if (filter && typeof filter === 'object') {
    const filters = (filter as { filters?: unknown[] }).filters;
    if (Array.isArray(filters)) {
      return filters.some(
        (f) => f && typeof f === 'object' && (f as { filter?: string }).filter === 'agDateColumnFilter',
      );
    }
  }
  return false;
}

function scanColumnDefsForDateFilter(defs: readonly AnyColDef[]): boolean {
  for (const def of defs) {
    if (colDefUsesDateFilter(def)) return true;
    if (def.children?.length && scanColumnDefsForDateFilter(def.children)) return true;
  }
  return false;
}

/**
 * Build the AG Grid `components` map. Includes the date floating filter
 * only when column defs reference it — avoids loading the 700+ LOC date
 * parser on grids with no date columns. When `includeAllFilters` is true
 * (default), always returns the full map for backward compatibility.
 */
export function buildStreamSafeComponents(
  columnDefs: readonly AnyColDef[] | undefined,
  includeAllFilters = true,
): typeof STREAM_SAFE_COMPONENTS_FULL {
  if (includeAllFilters) return STREAM_SAFE_COMPONENTS_FULL;
  if (!columnDefs?.length || !scanColumnDefsForDateFilter(columnDefs)) {
    return BASE_COMPONENTS as typeof STREAM_SAFE_COMPONENTS_FULL;
  }
  return FULL_COMPONENTS;
}
