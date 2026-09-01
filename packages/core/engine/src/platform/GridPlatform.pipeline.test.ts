import { describe, expect, it, vi } from 'vitest';
import type { GridOptions } from 'ag-grid-community';
import { GridPlatform } from './GridPlatform';
import type { AnyColDef, Module } from './types';

interface VitalsState {
  animateRows: boolean;
}

function makeVitalsModule(): Module<VitalsState> {
  return {
    id: 'vitals',
    name: 'Vitals',
    schemaVersion: 1,
    priority: 0,
    getInitialState: () => ({ animateRows: true }),
    serialize: (s) => s,
    deserialize: (raw) =>
      raw && typeof raw === 'object'
        ? { animateRows: Boolean((raw as VitalsState).animateRows) }
        : { animateRows: true },
    transformGridOptions(opts: Partial<GridOptions>, state: VitalsState) {
      return { ...opts, animateRows: state.animateRows };
    },
  };
}

describe('GridPlatform transform pipeline stability', () => {
  it('returns the same gridOptions reference on repeated empty-base transforms', () => {
    const platform = new GridPlatform({
      gridId: 'pipeline-stability',
      modules: [makeVitalsModule()],
    });
    const first = platform.transformGridOptions();
    const second = platform.transformGridOptions();
    expect(second).toBe(first);
  });

  it('uses a stable transform base — inline {} must not bust the cache', () => {
    const platform = new GridPlatform({
      gridId: 'pipeline-stability-base',
      modules: [makeVitalsModule()],
    });
    const fromStable = platform.transformGridOptions();
    const fromInline = platform.transformGridOptions({});
    expect(fromInline).toBe(fromStable);
  });

  it('returns a new gridOptions reference after module state changes', () => {
    const platform = new GridPlatform({
      gridId: 'pipeline-stability-mutate',
      modules: [makeVitalsModule()],
    });
    const before = platform.transformGridOptions();
    platform.store.setModuleState<VitalsState>('vitals', (s) => ({
      ...s,
      animateRows: !s.animateRows,
    }));
    const after = platform.transformGridOptions();
    expect(after).not.toBe(before);
    expect(after.animateRows).toBe(!before.animateRows);
  });

  it('a scoped deserializeOne on one module does not re-run a sibling module\'s transform — the fix this test exists for: a single-module config write must not force a full AG Grid columnDefs rebuild', () => {
    const colorTransform = vi.fn((defs: AnyColDef[]) => defs.map((d) => ({ ...d, cellStyle: { color: 'red' } })));
    const colorModule: Module<{ tint: string }> = {
      id: 'color',
      name: 'Color',
      schemaVersion: 1,
      priority: 0,
      getInitialState: () => ({ tint: 'red' }),
      serialize: (s) => s,
      deserialize: (raw) => (raw && typeof raw === 'object' ? (raw as { tint: string }) : { tint: 'red' }),
      transformColumnDefs: colorTransform,
    };

    const widthTransform = vi.fn((defs: AnyColDef[], state: { width: number }) =>
      defs.map((d) => ({ ...d, width: state.width })),
    );
    const widthModule: Module<{ width: number }> = {
      id: 'width',
      name: 'Width',
      schemaVersion: 1,
      priority: 1,
      getInitialState: () => ({ width: 100 }),
      serialize: (s) => s,
      deserialize: (raw) => (raw && typeof raw === 'object' ? (raw as { width: number }) : { width: 100 }),
      transformColumnDefs: widthTransform,
    };

    const platform = new GridPlatform({
      gridId: 'pipeline-scoped',
      modules: [colorModule, widthModule],
    });
    const base = [{ colId: 'a', field: 'a' }];

    const before = platform.transformColumnDefs(base);
    expect(colorTransform).toHaveBeenCalledTimes(1);
    expect(widthTransform).toHaveBeenCalledTimes(1);

    // Simulate a scoped external write (e.g. the AI assistant editing the
    // "width" module) applied via the new deserializeOne primitive instead
    // of a full resetAll()+deserializeAll().
    platform.deserializeOne('width', { v: 1, data: { width: 250 } });
    const after = platform.transformColumnDefs(base);

    expect(widthTransform).toHaveBeenCalledTimes(2);
    // The untouched module's transform is NOT re-invoked — its state
    // reference never changed, so PipelineRunner's memoization holds.
    expect(colorTransform).toHaveBeenCalledTimes(1);
    expect(after[0].width).toBe(250);
    expect(after[0].cellStyle).toEqual(before[0].cellStyle);
  });
});
