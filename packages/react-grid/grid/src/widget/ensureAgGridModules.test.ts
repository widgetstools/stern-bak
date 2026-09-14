import { describe, expect, it, vi } from 'vitest';
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import type { Module } from 'ag-grid-community';
import {
  EXCLUDED_AG_GRID_MODULES,
  ensureAgGridModules,
  platformAgGridModules,
  resetAgGridModuleRegistrationForTest,
} from './ensureAgGridModules.js';

vi.mock('./agGridSetFilterValidateGuard.js', () => ({
  installAgGridSetFilterValidateGuard: vi.fn(),
}));

const names = (mods: readonly Module[]): string[] => mods.map((m) => m.moduleName);

describe('platformAgGridModules', () => {
  it('is every member of AllEnterpriseModule except the excluded ones, bundles unpacked', () => {
    const enterpriseMembers = (AllEnterpriseModule.dependsOn ?? []).filter((m) => m !== AllCommunityModule);
    const expected = [...(AllCommunityModule.dependsOn ?? []), ...enterpriseMembers]
      .map((m) => m.moduleName)
      .filter((n) => !EXCLUDED_AG_GRID_MODULES.includes(n));
    expect(names(platformAgGridModules()).sort()).toEqual([...new Set(expected)].sort());
  });

  it('leaves Find out and keeps the modules the platform relies on', () => {
    const n = names(platformAgGridModules());
    expect(n).not.toContain('Find');
    expect(n).not.toContain('AllEnterprise');
    expect(n).not.toContain('AllCommunity');
    // ColumnAutoSize stays: the column menu's "Autosize" items are gated on it.
    expect(n).toEqual(expect.arrayContaining([
      'ColumnAutoSize', 'ClientSideRowModel', 'ServerSideRowModel', 'RowGrouping',
      'SetFilter', 'ColumnMenu', 'ContextMenu', 'StatusBar', 'Clipboard', 'CellSelection',
    ]));
  });

  it('honours a custom exclusion list', () => {
    const n = names(platformAgGridModules(['Find', 'ColumnAutoSize']));
    expect(n).not.toContain('ColumnAutoSize');
    expect(n).not.toContain('Find');
    expect(n).toContain('ClientSideRowModel');
  });
});

describe('ensureAgGridModules', () => {
  it('registers the platform module list once', () => {
    resetAgGridModuleRegistrationForTest();
    const registerSpy = vi.spyOn(ModuleRegistry, 'registerModules');

    ensureAgGridModules();
    ensureAgGridModules();

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(registerSpy).toHaveBeenCalledWith(platformAgGridModules());
    expect(names(registerSpy.mock.calls[0][0] as Module[])).not.toContain('Find');
    registerSpy.mockRestore();
  });

  it('registers a custom module subset when provided', () => {
    resetAgGridModuleRegistrationForTest();
    const registerSpy = vi.spyOn(ModuleRegistry, 'registerModules');
    const custom = [{ moduleName: 'Custom' }] as never;

    ensureAgGridModules(custom);

    expect(registerSpy).toHaveBeenCalledWith(custom);
    registerSpy.mockRestore();
  });
});
