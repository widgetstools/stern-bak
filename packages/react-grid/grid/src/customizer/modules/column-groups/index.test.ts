import { describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import { columnGroupsModule, COLUMN_GROUPS_MODULE_ID } from './index';
import type { ColumnGroupsState } from '@wellsfargo-starui/core';

describe('columnGroupsModule', () => {
  it('registers with expected metadata', () => {
    expect(columnGroupsModule.id).toBe(COLUMN_GROUPS_MODULE_ID);
    expect(columnGroupsModule.ListPane).toBeTruthy();
  });

  it('transformColumnDefs is no-op with empty groups', () => {
    const defs = [{ field: 'qty' }];
    const out = columnGroupsModule.transformColumnDefs!(defs, { groups: [], openGroupIds: {} }, {
      resources: { css: () => ({ clear: vi.fn(), addRule: vi.fn() }) },
    } as never);
    expect(out).toBe(defs);
  });

  it('deserialize prunes stale openGroupIds', () => {
    const state = columnGroupsModule.deserialize!({
      groups: [{ groupId: 'g1', headerName: 'G1', children: [], openByDefault: true }],
      openGroupIds: { g1: true, stale: false },
    });
    expect(state.openGroupIds).toEqual({ g1: true });
  });

  it('transformColumnDefs composes groups and injects header CSS', () => {
    const css = { clear: vi.fn(), addRule: vi.fn() };
    const defs = [{ field: 'qty', colId: 'qty' }];
    const state = {
      groups: [{
        groupId: 'g1',
        headerName: 'Metrics',
        openByDefault: true,
        headerStyle: { bold: true },
        children: [{ kind: 'col' as const, colId: 'qty' }],
      }],
      openGroupIds: { g1: true },
    };
    const out = columnGroupsModule.transformColumnDefs!(defs, state, {
      resources: { css: () => css },
    } as never);
    expect(out).not.toBe(defs);
    expect(css.clear).toHaveBeenCalled();
    expect(css.addRule).toHaveBeenCalled();
  });

  it('exports SettingsPanel for flat embeds', () => {
    expect(columnGroupsModule.SettingsPanel).toBeTruthy();
  });

  it('activate wires columnGroupOpened listener on grid ready', () => {
    const platform = new GridPlatform({ gridId: 'g', modules: [columnGroupsModule] });
    const listeners = new Map<string, Set<(e: unknown) => void>>();
    const api = {
      addEventListener: (evt: string, fn: (e: unknown) => void) => {
        if (!listeners.has(evt)) listeners.set(evt, new Set());
        listeners.get(evt)!.add(fn);
      },
      removeEventListener: (evt: string, fn: (e: unknown) => void) => {
        listeners.get(evt)?.delete(fn);
      },
    };
    platform.onGridReady(api as never);

    expect((listeners.get('columnGroupOpened')?.size ?? 0)).toBeGreaterThan(0);

    const handler = [...listeners.get('columnGroupOpened')!][0]!;
    handler({
      columnGroup: {
        getGroupId: () => 'g1',
        isExpanded: () => false,
      },
    });
    expect(platform.store.getModuleState<ColumnGroupsState>('column-groups').openGroupIds.g1).toBe(false);
  });

  it('activate ignores events without columnGroup payload', () => {
    const platform = new GridPlatform({ gridId: 'g2', modules: [columnGroupsModule] });
    const listeners = new Map<string, Set<(e: unknown) => void>>();
    const api = {
      addEventListener: (evt: string, fn: (e: unknown) => void) => {
        if (!listeners.has(evt)) listeners.set(evt, new Set());
        listeners.get(evt)!.add(fn);
      },
      removeEventListener: (evt: string, fn: (e: unknown) => void) => {
        listeners.get(evt)?.delete(fn);
      },
    };
    platform.onGridReady(api as never);
    const handler = [...listeners.get('columnGroupOpened')!][0]!;
    handler({});
    expect(platform.store.getModuleState<ColumnGroupsState>('column-groups').openGroupIds).toEqual({});
  });

  it('activate ignores duplicate open state and uses provided-column fallback', () => {
    const platform = new GridPlatform({ gridId: 'g3', modules: [columnGroupsModule] });
    platform.store.setModuleState<ColumnGroupsState>('column-groups', () => ({
      groups: [{ groupId: 'g1', headerName: 'G1', children: [], openByDefault: true }],
      openGroupIds: { g1: true },
    }));
    const listeners = new Map<string, Set<(e: unknown) => void>>();
    const api = {
      addEventListener: (evt: string, fn: (e: unknown) => void) => {
        if (!listeners.has(evt)) listeners.set(evt, new Set());
        listeners.get(evt)!.add(fn);
      },
      removeEventListener: (evt: string, fn: (e: unknown) => void) => {
        listeners.get(evt)?.delete(fn);
      },
    };
    platform.onGridReady(api as never);
    const handler = [...listeners.get('columnGroupOpened')!][0]!;
    handler({
      columnGroup: {
        getGroupId: () => 'g1',
        isExpanded: () => true,
        getProvidedColumnGroup: () => ({ isExpanded: () => true }),
      },
    });
    expect(platform.store.getModuleState<ColumnGroupsState>('column-groups').openGroupIds).toEqual({ g1: true });

    handler({
      columnGroup: {
        getGroupId: () => 'g1',
        getProvidedColumnGroup: () => ({ isExpanded: () => false }),
      },
    });
    expect(platform.store.getModuleState<ColumnGroupsState>('column-groups').openGroupIds.g1).toBe(false);
    platform.destroy();
  });

  it('deserialize returns empty state for malformed payloads', () => {
    expect(columnGroupsModule.deserialize!('bad')).toEqual({ groups: [], openGroupIds: {} });
  });

  it('transformColumnDefs injects nested group header border CSS', () => {
    const css = { clear: vi.fn(), addRule: vi.fn() };
    const defs = [{ field: 'qty', colId: 'qty' }];
    const state = {
      groups: [{
        groupId: 'outer',
        headerName: 'Outer',
        openByDefault: true,
        headerStyle: {
          bold: true,
          borders: { bottom: { width: 2, color: 'red' } },
        },
        children: [{
          kind: 'group' as const,
          group: {
            groupId: 'inner',
            headerName: 'Inner',
            openByDefault: true,
            children: [{ kind: 'col' as const, colId: 'qty' }],
          },
        }],
      }],
      openGroupIds: { outer: true, inner: true },
    };
    columnGroupsModule.transformColumnDefs!(defs, state, {
      resources: { css: () => css },
    } as never);
    expect(css.addRule).toHaveBeenCalled();
  });
});
