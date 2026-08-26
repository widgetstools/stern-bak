/**
 * Turns what a person calls a column into the colId the config actually keys on.
 *
 * Users say "the ISIN column", "Market Value", "market value". The config keys
 * on `isin` and `marketValue`. Without this, every column tool needs an exact
 * id, which means a `get_grid_columns` round trip before every simple request —
 * and a rejection-and-retry whenever the model guesses. That round trip is the
 * whole reason renaming or hiding a column felt like work.
 *
 * Matching is deliberately tiered rather than fuzzy-scored: an exact colId
 * always wins, and anything genuinely ambiguous is refused by name instead of
 * resolved to a coin flip. Acting on the wrong column is worse than asking.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';
import type { RegistryEntry } from '@wellsfargo-starui/openfin/config';
import { readActiveProfile, gridScopeId } from './gridProfiles';

export interface CatalogColumn {
  colId: string;
  /** Effective label: a profile rename wins over the provider's headerName. */
  headerName?: string;
}

/**
 * Every column the grid has, with the label currently on screen.
 *
 * The profile's `headerName` override matters: once the assistant renames
 * "Market Value" to "Mkt Val", the user's next request calls it "Mkt Val", and
 * only the override knows that.
 */
export async function readColumnCatalogue(
  configManager: ConfigManager,
  configStore: DataProviderConfigStore,
  entry: RegistryEntry,
): Promise<CatalogColumn[]> {
  const byId = new Map<string, CatalogColumn>();

  const gridLevelData = (await configManager.profiles.loadGridLevelData({ instanceId: gridScopeId(entry) })) as
    | { provider?: { liveProviderId?: string } }
    | null;
  const providerId = gridLevelData?.provider?.liveProviderId;
  if (providerId) {
    const provider = await configStore.get(providerId);
    const defs =
      (provider?.config as { columnDefinitions?: Array<{ field?: string; headerName?: string }> } | undefined)
        ?.columnDefinitions ?? [];
    for (const def of defs) {
      if (def.field) byId.set(def.field, { colId: def.field, headerName: def.headerName });
    }
  }

  const profile = await readActiveProfile(configManager, gridScopeId(entry));
  const virtual =
    (profile.state['calculated-columns']?.data as { virtualColumns?: Array<{ colId?: string; headerName?: string }> })
      ?.virtualColumns ?? [];
  for (const col of virtual) {
    if (col.colId) byId.set(col.colId, { colId: col.colId, headerName: col.headerName });
  }

  const assignments =
    (profile.state['column-customization']?.data as { assignments?: Record<string, { headerName?: string }> })
      ?.assignments ?? {};
  for (const [colId, assignment] of Object.entries(assignments)) {
    // A rename replaces the label the user sees, so it's the one to match on —
    // and it's added even for a column the provider doesn't list, since an
    // assignment is evidence enough that the grid knows about it.
    if (assignment?.headerName) byId.set(colId, { colId, headerName: assignment.headerName });
  }

  return [...byId.values()];
}

/** Case- and separator-insensitive: "Market Value", "marketValue" and
 *  "market_value" all collapse to "marketvalue". */
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export type ColumnMatch = { ok: true; colId: string } | { ok: false; error: string };

function describe(col: CatalogColumn): string {
  return col.headerName && col.headerName !== col.colId ? `${col.colId} ("${col.headerName}")` : col.colId;
}

/**
 * One user-supplied name → one colId.
 *
 * An empty catalogue means we have nothing to check against (no provider bound
 * yet), so the input passes through untouched — blocking would be worse than
 * proceeding, and it matches how the rest of the column tools behave.
 */
export function resolveColumn(input: string, catalogue: CatalogColumn[]): ColumnMatch {
  if (typeof input !== 'string' || !input.trim()) {
    return { ok: false, error: 'Column names must be non-empty strings.' };
  }
  if (catalogue.length === 0) return { ok: true, colId: input };

  const exactId = catalogue.find((c) => c.colId === input);
  if (exactId) return { ok: true, colId: exactId.colId };

  const tiers: Array<(c: CatalogColumn) => boolean> = [
    (c) => c.headerName === input,
    (c) => normalizeKey(c.colId) === normalizeKey(input),
    (c) => !!c.headerName && normalizeKey(c.headerName) === normalizeKey(input),
  ];
  for (const matches of tiers) {
    const hits = catalogue.filter(matches);
    if (hits.length === 1) return { ok: true, colId: hits[0].colId };
    if (hits.length > 1) {
      return {
        ok: false,
        error: `"${input}" matches several columns: ${hits.map(describe).join(', ')}. Use the exact colId.`,
      };
    }
  }

  // Nothing matched — offer the near misses rather than the whole grid, which
  // on a real blotter is 40+ columns of noise.
  const needle = normalizeKey(input);
  const near = catalogue.filter(
    (c) =>
      normalizeKey(c.colId).includes(needle) ||
      needle.includes(normalizeKey(c.colId)) ||
      (c.headerName ? normalizeKey(c.headerName).includes(needle) : false),
  );
  const hint = near.length
    ? `Did you mean ${near.slice(0, 5).map(describe).join(', ')}?`
    : `This grid has: ${catalogue.slice(0, 25).map((c) => c.colId).join(', ')}${catalogue.length > 25 ? ', …' : ''}.`;
  return { ok: false, error: `No column matching "${input}". ${hint}` };
}

export type ColumnsMatch = { ok: true; colIds: string[] } | { ok: false; error: string };

/** Resolves a list, reporting every failure at once so the model can fix them
 *  in one retry instead of discovering them one call at a time. */
export function resolveColumns(inputs: readonly string[], catalogue: CatalogColumn[]): ColumnsMatch {
  const colIds: string[] = [];
  const errors: string[] = [];
  for (const input of inputs) {
    const match = resolveColumn(input, catalogue);
    if (match.ok) {
      if (!colIds.includes(match.colId)) colIds.push(match.colId);
    } else {
      errors.push(match.error);
    }
  }
  return errors.length ? { ok: false, error: errors.join(' ') } : { ok: true, colIds };
}

/**
 * Resolves the same inputs in place across a record keyed by column name, e.g.
 * `{ "Market Value": 120 }` → `{ "marketValue": 120 }`.
 */
export function resolveColumnKeys<T>(
  record: Record<string, T>,
  catalogue: CatalogColumn[],
): { ok: true; value: Record<string, T> } | { ok: false; error: string } {
  const out: Record<string, T> = {};
  const errors: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    const match = resolveColumn(key, catalogue);
    if (match.ok) out[match.colId] = value;
    else errors.push(match.error);
  }
  return errors.length ? { ok: false, error: errors.join(' ') } : { ok: true, value: out };
}
