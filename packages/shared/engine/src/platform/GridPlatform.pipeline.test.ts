import { describe, expect, it } from 'vitest';
import type { GridOptions } from 'ag-grid-community';
import { GridPlatform } from './GridPlatform';
import type { Module } from './types';

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
});
