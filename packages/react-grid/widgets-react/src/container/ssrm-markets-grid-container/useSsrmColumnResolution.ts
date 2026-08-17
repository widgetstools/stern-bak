/**
 * Everything {@link SsrmMarketsGridContainer} derives from the provider's
 * resolved config: the row-key column, the column definitions (declared or
 * inferred), and the block size.
 *
 * All three refine once `start()` resolves the config — pre-start the
 * null-safe reads simply yield the defaults, and the surface's late-bound
 * key column applies the resolved value without remounting the grid.
 *
 * Extracted from the container when it adopted MarketsGridContainer's prop
 * surface: these are the members a host may NOT override (they are facts
 * about the provider, not preferences), so keeping them in one module is
 * what lets the container's own body be a straight forward of everything
 * else. Roadmap Phase 9 collapsed the declared and inferred mappings onto
 * the single `toSsrmColumnDefs` path below.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { inferFields, resolveSsrmKeyColumn, type ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { ColumnDefinition } from '@wellsfargo-starui/types/shared';
import { buildColumnDefs } from '../markets-grid-container/buildColumnDefs.js';

/** `positionId` → `Position Id` — header text for inferred columns. */
function humanizeField(field: string): string {
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Column capabilities every SSRM column gets. The query plane can group,
 * aggregate and pivot server-side, so the columns have to be draggable into
 * those zones; `MarketsGridContainer` leaves this to the host because a
 * client-side grid's tool panel is the host's call. A deliberate divergence
 * in SSRM's favour, so constraint 1 keeps it.
 */
const SSRM_COLUMN_CAPABILITIES = {
  enableRowGroup: true,
  enablePivot: true,
  enableValue: true,
} as const;

/**
 * The ONE mapping path, `ColumnDefinition[]` → `ColDef[]`, for declared and
 * inferred columns alike.
 *
 * Everything the provider declared is SPREAD through. The old declared path
 * cherry-picked five members and dropped `cellDataType`, `valueGetter`,
 * `valueFormatter`, `cellRenderer`, `filter`, `sortable`, `resizable` and
 * `type` — so a DSL `valueGetter` never reached the compiler in
 * `buildColumnDefs` (the column rendered its raw field value) and every
 * column fell to `agTextColumnFilter`, because the multi-filter's first tab
 * is chosen from `cellDataType` and there was none. Declaring your columns
 * therefore produced WORSE typing than not declaring them, since the inferred
 * path did set `cellDataType`.
 *
 * The inferred path had the opposite hole: it never called `buildColumnDefs`
 * at all, so inferred columns got no multi-filter (and their worker-backed
 * set-filter values were attached to an envelope that was not there), and a
 * dotted inferred field got AG-Grid's native dot-walk instead of the
 * `getPathAccessor` that can tell `row.a.b` from `row['a.b']`.
 *
 * `buildColumnDefs` is the same function `MarketsGridContainer` hands its
 * persisted `columnDefinitions` to, unmodified — which is the whole point:
 * one compiler, one filter default, one nested-path rule, both row models.
 */
function toSsrmColumnDefs(defs: readonly ColumnDefinition[]): ColDef[] | null {
  return buildColumnDefs(
    defs.map((c) => ({
      ...c,
      // Defensive: `headerName` is required on the type, but a persisted
      // config is only as good as whatever wrote it.
      headerName: c.headerName ?? c.field,
      ...SSRM_COLUMN_CAPABILITIES,
    })) as ColDef[],
  );
}

export interface SsrmColumnResolution {
  /** Drives `getRowId`; `'id'` until the provider's config resolves. */
  keyColumn: string;
  /** `undefined` until ready — the surface renders chrome meanwhile. */
  columnDefs: ColDef[] | undefined;
  /** `undefined` leaves the surface's own default (100). */
  cacheBlockSize: number | undefined;
}

export function useSsrmColumnResolution(
  provider: ISsrmDataProvider | null,
  ready: boolean,
): SsrmColumnResolution {
  const keyColumn = useMemo(() => {
    if (!provider || !ready) return 'id';
    const cfg = provider.getConfigOrNull?.() as {
      keyColumn?: string | readonly string[];
    } | null;
    return resolveSsrmKeyColumn(cfg?.keyColumn);
  }, [provider, ready]);

  // Providers without declared columnDefinitions (createStarui drafts,
  // hand-seeded rows) infer their columns from a sampled block — the SSRM
  // analog of the CSRM container's snapshot inference. A declared list
  // always wins; inference only fills the empty case, where the previous
  // behavior was a headerless, cell-less grid.
  const [inferredDefs, setInferredDefs] = useState<ColumnDefinition[] | null>(null);
  useEffect(() => {
    // Inference belongs to one provider instance — a rebind starts clean.
    setInferredDefs(null);
  }, [provider]);
  useEffect(() => {
    if (!provider || !ready || inferredDefs) return;
    // Explicit not-started guard: getColumnDefs() is null-safe now and
    // returns [] pre-start — inferring against an unstarted provider
    // would sample an empty plane.
    if (!provider.getConfigOrNull?.()) return;
    if (provider.getColumnDefs().length > 0) return;
    let cancelled = false;
    provider
      .getRows({ startRow: 0, endRow: 50 })
      .then((result) => {
        if (cancelled) return;
        const { fields } = inferFields(result.rowData);
        const defs = fields
          .filter((f) => !f.path.startsWith('__') && f.type !== 'object' && f.type !== 'array')
          .map<ColumnDefinition>((f) => ({
            field: f.path,
            headerName: humanizeField(f.path),
            cellDataType:
              f.type === 'number' ? 'number'
              : f.type === 'boolean' ? 'boolean'
              : f.type === 'date' ? 'dateString'
              : 'text',
          }));
        if (defs.length > 0) setInferredDefs(defs);
      })
      .catch(() => { /* declared-less provider with no rows yet — retry on next ready flip */ });
    return () => { cancelled = true; };
  }, [provider, ready, inferredDefs]);

  const columnDefs = useMemo<ColDef[] | undefined>(() => {
    if (!provider || !ready) return undefined;
    const declared = provider.getColumnDefs();
    // A declared list always wins; inference only fills the empty case.
    const source = declared.length > 0 ? declared : inferredDefs;
    if (!source || source.length === 0) return undefined;
    return toSsrmColumnDefs(source) ?? undefined;
  }, [provider, ready, inferredDefs]);

  const cacheBlockSize = useMemo(() => {
    if (!provider || !ready) return undefined;
    const cfg = provider.getConfigOrNull?.() as { blockSize?: number } | null;
    const n = cfg?.blockSize;
    return typeof n === 'number' && n >= 20 ? n : undefined;
  }, [provider, ready]);

  return { keyColumn, columnDefs, cacheBlockSize };
}
