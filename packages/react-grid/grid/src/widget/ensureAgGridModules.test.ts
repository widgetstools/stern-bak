import { describe, expect, it, vi } from 'vitest';
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import {
  ensureAgGridModules,
  resetAgGridModuleRegistrationForTest,
} from './ensureAgGridModules.js';

vi.mock('./agGridSetFilterValidateGuard.js', () => ({
  installAgGridSetFilterValidateGuard: vi.fn(),
}));

describe('ensureAgGridModules', () => {
  it('registers default enterprise modules once', () => {
    resetAgGridModuleRegistrationForTest();
    const registerSpy = vi.spyOn(ModuleRegistry, 'registerModules');

    ensureAgGridModules();
    ensureAgGridModules();

    expect(registerSpy).toHaveBeenCalledTimes(1);
    expect(registerSpy).toHaveBeenCalledWith([AllEnterpriseModule]);
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
