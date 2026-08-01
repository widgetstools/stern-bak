import { describe, expect, it, vi } from 'vitest';
import type { GridOptions } from 'ag-grid-community';
import { GridPlatform } from './GridPlatform';
import type { Module } from './types';

interface CounterState {
  n: number;
}

function counterModule(): Module<CounterState> {
  return {
    id: 'counter',
    name: 'Counter',
    schemaVersion: 2,
    priority: 0,
    getInitialState: () => ({ n: 0 }),
    serialize: (s) => s,
    deserialize: (raw) =>
      raw && typeof raw === 'object' ? { n: Number((raw as CounterState).n) || 0 } : { n: 0 },
    migrate: (raw, fromVersion) => {
      if (fromVersion === 1) return { n: Number((raw as { count?: number }).count) || 0 };
      return { n: 0 };
    },
    transformColumnDefs(defs, state) {
      return defs.map((d) => ({ ...d, headerName: String(state.n) }));
    },
    transformGridOptions(opts: Partial<GridOptions>, state) {
      return { ...opts, rowHeight: state.n + 20 };
    },
    activate(handle) {
      return () => handle.setState((s) => ({ ...s, n: s.n + 1 }));
    },
  };
}

describe('GridPlatform lifecycle and persistence', () => {
  it('serialises and deserialises module envelopes', () => {
    const platform = new GridPlatform({ gridId: 'persist', modules: [counterModule()] });
    platform.store.setModuleState<CounterState>('counter', () => ({ n: 7 }));
    expect(platform.serializeAll()).toEqual({
      counter: { v: 2, data: { n: 7 } },
    });
    platform.deserializeAll({ counter: { v: 2, data: { n: 3 } } });
    expect(platform.store.getModuleState<CounterState>('counter').n).toBe(3);
  });

  it('migrates stored schema versions via module.migrate', () => {
    const platform = new GridPlatform({ gridId: 'migrate', modules: [counterModule()] });
    platform.deserializeAll({ counter: { v: 1, data: { count: 9 } } });
    expect(platform.store.getModuleState<CounterState>('counter').n).toBe(9);
  });

  it('falls back to initial state on deserialize failure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken: Module<CounterState> = {
      ...counterModule(),
      deserialize: () => {
        throw new Error('bad blob');
      },
    };
    const platform = new GridPlatform({ gridId: 'fail', modules: [broken] });
    platform.deserializeAll({ counter: { v: 2, data: {} } });
    expect(platform.store.getModuleState<CounterState>('counter').n).toBe(0);
    warn.mockRestore();
  });

  it('transformColumnDefs runs the pipeline', () => {
    const platform = new GridPlatform({ gridId: 'cols', modules: [counterModule()] });
    platform.store.setModuleState<CounterState>('counter', () => ({ n: 5 }));
    const out = platform.transformColumnDefs([{ colId: 'a', field: 'a' }]);
    expect(out[0].headerName).toBe('5');
  });

  it('onGridReady activates modules once and destroy is idempotent', () => {
    const platform = new GridPlatform({ gridId: 'life', modules: [counterModule()] });
    const api = {} as Parameters<GridPlatform['onGridReady']>[0];
    platform.onGridReady(api);
    expect(platform.api.api).toBe(api);
    platform.onGridReady(api);
    platform.destroy();
    platform.destroy();
    expect(platform.api.api).toBeNull();
  });

  it('resetAll restores every module initial state', () => {
    const platform = new GridPlatform({ gridId: 'reset', modules: [counterModule()] });
    platform.store.setModuleState<CounterState>('counter', () => ({ n: 99 }));
    platform.resetAll();
    expect(platform.store.getModuleState<CounterState>('counter').n).toBe(0);
  });

  it('exposes registered modules and falls back when migrate is absent', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const noMigrate: Module<CounterState> = {
      ...counterModule(),
      migrate: undefined,
    };
    const platform = new GridPlatform({ gridId: 'nomigrate', modules: [noMigrate] });
    expect(platform.getModules()).toHaveLength(1);
    platform.deserializeAll({ counter: { v: 1, data: { count: 4 } } });
    expect(platform.store.getModuleState<CounterState>('counter').n).toBe(0);
    warn.mockRestore();
  });

  it('transform pipeline getRowId uses configured row id field', () => {
    const platform = new GridPlatform({
      gridId: 'rowid',
      modules: [counterModule()],
      rowIdField: 'symbol',
    });
    platform.store.setModuleState<CounterState>('counter', () => ({ n: 1 }));
    const out = platform.transformColumnDefs([{ colId: 'a', field: 'a' }]);
    expect(out[0].headerName).toBe('1');
  });

  it('ignores onGridReady after destroy and deserializes raw blobs without envelopes', () => {
    const platform = new GridPlatform({ gridId: 'destroyed', modules: [counterModule()] });
    platform.destroy();
    platform.onGridReady({} as never);
    expect(platform.api.api).toBeNull();

    platform.deserializeAll(null);
    const bare = new GridPlatform({ gridId: 'bare', modules: [counterModule()] });
    bare.deserializeAll({ counter: { n: 8 } as never });
    expect(bare.store.getModuleState<CounterState>('counter').n).toBe(8);
  });

  it('transformGridOptions preserves a caller-provided getRowId', () => {
    const platform = new GridPlatform({ gridId: 'opts', modules: [counterModule()] });
    const customGetRowId = () => 'custom';
    const out = platform.transformGridOptions({ getRowId: customGetRowId, rowHeight: 30 });
    expect(out.getRowId).toBe(customGetRowId);
    expect(out.rowHeight).toBe(20);
  });
});
