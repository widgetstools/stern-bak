import type { GridOptions } from 'ag-grid-community';
import type { AnyColDef, AnyModule, TransformContext } from './types';

/**
 * Cached runner for `transformColumnDefs` + `transformGridOptions`.
 *
 * Per-module cache: the output of module M is memoised on the tuple
 * `(M's state ref, previous output ref)`. When neither changed from the
 * last run, we return the previous output and skip M's transform.
 *
 * Because `setModuleState` preserves the same reference on no-op updates,
 * toggling an unrelated module's state (e.g. a saved-filter pill)
 * short-circuits every other module's transform. The whole pipeline is
 * O(1) for the modules whose state didn't move.
 */
interface CacheEntry<T> {
  state: unknown;
  input: T;
  output: T;
}

export class PipelineRunner {
  private columnDefCache = new Map<string, CacheEntry<AnyColDef[]>>();
  private gridOptionCache = new Map<string, CacheEntry<Partial<GridOptions>>>();
  /** Last emitted outputs — returned when a full run produces deep-equal results. */
  private lastColumnDefsOutput: AnyColDef[] | null = null;
  private lastGridOptionsOutput: Partial<GridOptions> | null = null;

  runColumnDefs(
    modules: readonly AnyModule[],
    base: AnyColDef[],
    ctx: TransformContext,
  ): AnyColDef[] {
    let defs = base;
    for (const m of modules) {
      if (!m.transformColumnDefs) continue;
      const state = ctx.getModuleState(m.id);
      const cached = this.columnDefCache.get(m.id);
      if (cached && cached.state === state && cached.input === defs) {
        defs = cached.output;
        continue;
      }
      const next = m.transformColumnDefs(defs, state, ctx);
      this.columnDefCache.set(m.id, { state, input: defs, output: next });
      defs = next;
    }
    if (
      this.lastColumnDefsOutput
      && defs.length === this.lastColumnDefsOutput.length
      && defs.every((d, i) => d === this.lastColumnDefsOutput![i])
    ) {
      return this.lastColumnDefsOutput;
    }
    this.lastColumnDefsOutput = defs;
    return defs;
  }

  runGridOptions(
    modules: readonly AnyModule[],
    base: Partial<GridOptions>,
    ctx: TransformContext,
  ): Partial<GridOptions> {
    let opts = base;
    for (const m of modules) {
      if (!m.transformGridOptions) continue;
      const state = ctx.getModuleState(m.id);
      const cached = this.gridOptionCache.get(m.id);
      if (cached && cached.state === state && cached.input === opts) {
        opts = cached.output;
        continue;
      }
      const next = m.transformGridOptions(opts, state, ctx);
      this.gridOptionCache.set(m.id, { state, input: opts, output: next });
      opts = next;
    }
    if (
      this.lastGridOptionsOutput
      && shallowGridOptionsEqual(opts, this.lastGridOptionsOutput)
    ) {
      return this.lastGridOptionsOutput;
    }
    this.lastGridOptionsOutput = opts;
    return opts;
  }

  /** Drop cache for one module — used when a module is unregistered.
   *  In normal operation the cache self-manages. */
  invalidate(moduleId: string): void {
    this.columnDefCache.delete(moduleId);
    this.gridOptionCache.delete(moduleId);
  }

  dispose(): void {
    this.columnDefCache.clear();
    this.gridOptionCache.clear();
    this.lastColumnDefsOutput = null;
    this.lastGridOptionsOutput = null;
  }
}

function shallowGridOptionsEqual(
  a: Partial<GridOptions>,
  b: Partial<GridOptions>,
): boolean {
  const aKeys = Object.keys(a) as (keyof GridOptions)[];
  const bKeys = Object.keys(b) as (keyof GridOptions)[];
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}
