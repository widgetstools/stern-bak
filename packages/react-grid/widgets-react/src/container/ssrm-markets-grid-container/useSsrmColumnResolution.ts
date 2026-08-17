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
 * else. Roadmap Phase 9 owns the two mapping paths below.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { inferFields, resolveSsrmKeyColumn, type ISsrmDataProvider } from '@wellsfargo-starui/data';
import { buildColumnDefs } from '../markets-grid-container/buildColumnDefs.js';

/** `positionId` → `Position Id` — header text for inferred columns. */
function humanizeField(field: string): string {
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
  const [inferredDefs, setInferredDefs] = useState<ColDef[] | null>(null);
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
          .map<ColDef>((f) => ({
            field: f.path,
            headerName: humanizeField(f.path),
            cellDataType:
              f.type === 'number' ? 'number'
              : f.type === 'boolean' ? 'boolean'
              : f.type === 'date' ? 'dateString'
              : 'text',
            enableRowGroup: true,
            enablePivot: true,
            enableValue: true,
          }));
        if (defs.length > 0) setInferredDefs(defs);
      })
      .catch(() => { /* declared-less provider with no rows yet — retry on next ready flip */ });
    return () => { cancelled = true; };
  }, [provider, ready, inferredDefs]);

  const columnDefs = useMemo<ColDef[] | undefined>(() => {
    if (!provider || !ready) return undefined;
    const defs = provider.getColumnDefs();
    if (!defs.length) return inferredDefs ?? undefined;
    const asColDefs = defs.map((c) => ({
      field: c.field,
      headerName: c.headerName ?? c.field,
      width: c.width,
      hide: c.hide,
      enableRowGroup: true,
      enablePivot: true,
      enableValue: true,
    })) as ColDef[];
    return buildColumnDefs(asColDefs) ?? asColDefs;
  }, [provider, ready, inferredDefs]);

  const cacheBlockSize = useMemo(() => {
    if (!provider || !ready) return undefined;
    const cfg = provider.getConfigOrNull?.() as { blockSize?: number } | null;
    const n = cfg?.blockSize;
    return typeof n === 'number' && n >= 20 ? n : undefined;
  }, [provider, ready]);

  return { keyColumn, columnDefs, cacheBlockSize };
}
