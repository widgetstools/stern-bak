import { describe, expect, it, vi } from 'vitest';
import { PipelineRunner } from './PipelineRunner';
import type { AnyColDef, AnyModule, TransformContext } from './types';

function ctx(state: unknown): TransformContext {
  return {
    gridId: 'g',
    getRowId: () => 'r1',
    getModuleState: () => state,
    resources: {} as TransformContext['resources'],
    api: null,
  };
}

describe('PipelineRunner', () => {
  it('memoises column-def transforms on stable state and input refs', () => {
    const runner = new PipelineRunner();
    const state = { on: true };
    const transform = vi.fn((defs: AnyColDef[]) => defs.map((d) => ({ ...d, pinned: 'left' as const })));
    const module: AnyModule = {
      id: 'pin',
      name: 'Pin',
      schemaVersion: 1,
      priority: 0,
      getInitialState: () => state,
      serialize: (s) => s,
      deserialize: (raw) => raw,
      transformColumnDefs: transform,
    };
    const base = [{ colId: 'a', field: 'a' }];
    const first = runner.runColumnDefs([module], base, ctx(state));
    const second = runner.runColumnDefs([module], base, ctx(state));
    expect(transform).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('re-runs when module state reference changes', () => {
    const runner = new PipelineRunner();
    const transform = vi.fn((defs: AnyColDef[]) => defs);
    const module: AnyModule = {
      id: 'm',
      name: 'M',
      schemaVersion: 1,
      priority: 0,
      getInitialState: () => ({}),
      serialize: (s) => s,
      deserialize: (raw) => raw,
      transformColumnDefs: transform,
    };
    const base = [{ colId: 'a' }];
    runner.runColumnDefs([module], base, ctx({ a: 1 }));
    runner.runColumnDefs([module], base, ctx({ a: 2 }));
    expect(transform).toHaveBeenCalledTimes(2);
  });

  it('returns stable gridOptions output when shallow-equal', () => {
    const runner = new PipelineRunner();
    const state = { animateRows: true };
    const module: AnyModule = {
      id: 'vitals',
      name: 'Vitals',
      schemaVersion: 1,
      priority: 0,
      getInitialState: () => state,
      serialize: (s) => s,
      deserialize: (raw) => raw,
      transformGridOptions: (opts, s) => ({ ...opts, animateRows: (s as typeof state).animateRows }),
    };
    const first = runner.runGridOptions([module], { suppressMovableColumns: true }, ctx(state));
    const second = runner.runGridOptions([module], { suppressMovableColumns: true }, ctx(state));
    expect(second).toBe(first);
  });

  it('invalidate and dispose drop caches', () => {
    const runner = new PipelineRunner();
    const module: AnyModule = {
      id: 'm',
      name: 'M',
      schemaVersion: 1,
      priority: 0,
      getInitialState: () => ({}),
      serialize: (s) => s,
      deserialize: (raw) => raw,
      transformColumnDefs: (defs) => defs,
    };
    runner.runColumnDefs([module], [{ colId: 'a' }], ctx({}));
    runner.invalidate('m');
    runner.runColumnDefs([module], [{ colId: 'a' }], ctx({}));
    runner.dispose();
    expect(() => runner.runColumnDefs([module], [{ colId: 'a' }], ctx({}))).not.toThrow();
  });
});
