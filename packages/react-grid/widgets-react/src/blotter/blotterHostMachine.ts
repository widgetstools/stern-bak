/**
 * blotterHostMachine — the explicit state machine behind {@link BlotterHost}
 * (refactor plan D1).
 *
 * A blotter needs five things before its grid can exist, in this order:
 *
 *   identity  → the per-instance id (OpenFin customData, URL param or the host default)
 *   storage   → the host ConfigManager and, when persistence is on, its storage factory
 *   selection → the persisted provider selection (grid-level data) has been read
 *   config    → the chosen provider's catalog row has arrived
 *   grid      → the row was usable (key column + column definitions), or there is
 *               definitely no provider to show — either way exactly ONE grid
 *
 * The machine is pure: the component gathers the facts, the machine says which
 * phase the blotter is in and what to render. No phase renders a grid that a
 * later phase would replace — WORKLOG 20's double mount was a render that fell
 * through to the "no provider" grid while the provider's config was still on
 * its way, and that combination is unrepresentable here: a chosen provider
 * whose row is neither present nor failed is `config`, never `grid`.
 */

export interface BlotterHostFacts {
  /** The instance id has resolved (never true while OpenFin customData is still in flight). */
  identityReady: boolean;
  /** The host ConfigManager is available (the blotter always needs one for the data plane). */
  configManagerReady: boolean;
  /** Persistence is on and its storage factory is still being built. */
  storagePending: boolean;
  /** The grid-level data row (provider selection, caption, bindings) has been read. */
  gridLevelLoaded: boolean;
  /** Provider chosen by the selection + mode; `null` when none. */
  activeProviderId: string | null;
  /** The chosen provider's catalog row. */
  providerConfig: { loading: boolean; present: boolean; error: boolean };
  /** Stable key of the resolved row-id field(s); `null` when the row lacks a key column. */
  rowIdFieldKey: string | null;
  /** The row's column definitions produced AG Grid column defs. */
  columnDefsReady: boolean;
  /** The chosen provider is server-side (SSRM). */
  ssrm: boolean;
}

export type BlotterHostStep =
  | { phase: 'identity' }
  | { phase: 'storage' }
  | { phase: 'selection' }
  | { phase: 'config'; providerId: string }
  | { phase: 'grid'; grid: 'data'; providerId: string; key: string; ssrm: boolean }
  | { phase: 'grid'; grid: 'empty'; reason: 'no-provider' | 'config-error' | 'config-unusable' };

/** The `key` that mounts one data grid per provider + key column (a change remounts on purpose). */
export function blotterGridKey(providerId: string, rowIdFieldKey: string, ssrm: boolean): string {
  return `${ssrm ? 'ssrm' : 'csrm'}::${providerId}::${rowIdFieldKey}`;
}

/** The key of the grid shown when there is no provider to attach — Custom Settings can pick one. */
export const EMPTY_GRID_KEY = '__no_provider__';
/** Sentinel row-id field for the empty grid (the provider's key column is unknown). */
export const EMPTY_GRID_ROW_ID_FIELD = '__none__';

export function resolveBlotterHostStep(f: BlotterHostFacts): BlotterHostStep {
  if (!f.identityReady) return { phase: 'identity' };
  if (!f.configManagerReady || f.storagePending) return { phase: 'storage' };
  if (!f.gridLevelLoaded) return { phase: 'selection' };
  const id = f.activeProviderId;
  if (id === null) return { phase: 'grid', grid: 'empty', reason: 'no-provider' };
  const cfg = f.providerConfig;
  // "Provider chosen, no row, no error" is still loading whatever a stale
  // `loading` flag says — the render that once fell through here built a
  // throwaway grid (WORKLOG 20).
  if (cfg.loading || (!cfg.present && !cfg.error)) return { phase: 'config', providerId: id };
  if (!cfg.present) return { phase: 'grid', grid: 'empty', reason: 'config-error' };
  if (f.rowIdFieldKey === null || !f.columnDefsReady) {
    return { phase: 'grid', grid: 'empty', reason: 'config-unusable' };
  }
  return { phase: 'grid', grid: 'data', providerId: id, key: blotterGridKey(id, f.rowIdFieldKey, f.ssrm), ssrm: f.ssrm };
}

/** Copy for the single loading state shown before the grid; `null` once a grid renders. */
export function blotterHostLoadingMessage(step: BlotterHostStep, providerName: string | null): string | null {
  switch (step.phase) {
    case 'identity':
    case 'storage':
      return 'Connecting to ConfigService…';
    case 'selection':
      return 'Loading…';
    case 'config':
      return providerName ? `Loading ${providerName}…` : 'Loading provider configuration…';
    default:
      return null;
  }
}

/** True when the step renders a MarketsGrid (data or empty). */
export function isGridStep(step: BlotterHostStep): step is Extract<BlotterHostStep, { phase: 'grid' }> {
  return step.phase === 'grid';
}
