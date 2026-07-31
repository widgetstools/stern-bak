import type { ColDef } from 'ag-grid-community';

let lastPipelineRef: ColDef | undefined;
let lastHostRef: ColDef | undefined;
let lastMerged: ColDef | undefined;

function shallowColDefEqual(a: ColDef, b: ColDef): boolean {
  const aKeys = Object.keys(a) as (keyof ColDef)[];
  const bKeys = Object.keys(b) as (keyof ColDef)[];
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Merge pipeline `defaultColDef` under host overrides while preserving
 * referential stability when the merged result is unchanged — keeps
 * `MarketsGridSurface` memo from firing on no-op pipeline ticks.
 */
export function mergeDefaultColDef<TData>(
  pipelineDef: ColDef<TData> | undefined,
  hostDef: ColDef<TData> | undefined,
): ColDef<TData> | undefined {
  if (!hostDef) return pipelineDef;
  if (!pipelineDef) return hostDef;
  if (
    lastPipelineRef === pipelineDef
    && lastHostRef === hostDef
    && lastMerged
  ) {
    return lastMerged as ColDef<TData>;
  }
  const merged = { ...pipelineDef, ...hostDef } as ColDef<TData>;
  if (lastMerged && shallowColDefEqual(lastMerged, merged as ColDef)) {
    lastPipelineRef = pipelineDef;
    lastHostRef = hostDef;
    return lastMerged as ColDef<TData>;
  }
  lastPipelineRef = pipelineDef;
  lastHostRef = hostDef;
  lastMerged = merged as ColDef;
  return merged;
}

/** @internal test helper — reset module-scoped memo between cases. */
export function resetMergeDefaultColDefCacheForTest(): void {
  lastPipelineRef = undefined;
  lastHostRef = undefined;
  lastMerged = undefined;
}
