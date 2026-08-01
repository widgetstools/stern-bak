/**
 * Saved Filters — opaque-ish state holder.
 *
 * Core does not interpret the FILTER MODEL inside each record (that is
 * AG-Grid-specific and lives in the host's `<FiltersToolbar>`), but it
 * DOES validate the wrapper shape (`id`, `label`, `active`, `filterModel`)
 * so legacy / malformed entries from older profile snapshots are dropped
 * or normalized at load time instead of poisoning runtime state.
 */
import type { Module } from '@wellsfargo-starui/core';

export const SAVED_FILTERS_MODULE_ID = 'saved-filters';

export interface SavedFiltersState {
  /** Saved-filter records. Each entry's `filterModel` is opaque to core. */
  filters: unknown[];
}

export const INITIAL_SAVED_FILTERS: SavedFiltersState = { filters: [] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate one persisted record against the SavedFilter contract:
 *   { id: string, label: string, active: boolean, filterModel: object }
 *
 * Coerces `active` to boolean (legacy snapshots sometimes wrote `0`/`1`
 * or omitted it entirely). Drops the entry when required fields are
 * missing — better to lose a single broken pill than crash the toolbar
 * on every render.
 */
function validateFilter(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const id = raw.id;
  const label = raw.label;
  const filterModel = raw.filterModel;
  if (typeof id !== 'string' || id.length === 0) return null;
  if (typeof label !== 'string' || label.length === 0) return null;
  if (!isPlainObject(filterModel)) return null;
  return {
    ...raw,
    id,
    label,
    active: Boolean(raw.active),
    filterModel,
  };
}

function validateFilters(raw: unknown): unknown[] {
  if (!Array.isArray(raw)) return [];
  const out: unknown[] = [];
  for (const item of raw) {
    const ok = validateFilter(item);
    if (ok) out.push(ok);
  }
  return out;
}

export const savedFiltersModule: Module<SavedFiltersState> = {
  id: SAVED_FILTERS_MODULE_ID,
  name: 'Saved Filters',
  // v1 → v2: added structural validation. The on-disk shape is
  // unchanged, but v1 snapshots may carry malformed entries (missing
  // `active`, null `filterModel`, etc.) — `migrate` runs them through
  // the same validator as v2 so legacy profiles load cleanly.
  schemaVersion: 2,
  priority: 1001,

  getInitialState: () => ({ filters: [] }),

  serialize: (state) => state,

  deserialize: (raw) => {
    if (!isPlainObject(raw)) return { filters: [] };
    return { filters: validateFilters((raw as Partial<SavedFiltersState>).filters) };
  },

  migrate: (raw) => {
    // v1 had the same wire shape; the only difference is that v2
    // validates entries on load. Run the validator and we're done.
    if (!isPlainObject(raw)) return { filters: [] };
    return { filters: validateFilters((raw as Partial<SavedFiltersState>).filters) };
  },
};
