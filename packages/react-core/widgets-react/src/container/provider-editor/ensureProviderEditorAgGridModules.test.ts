import { afterEach, describe, expect, it, vi } from 'vitest';

const registerModules = vi.fn();

vi.mock('ag-grid-community', () => ({
  ModuleRegistry: { registerModules },
}));

vi.mock('ag-grid-enterprise', () => ({
  AllEnterpriseModule: { name: 'AllEnterpriseModule' },
}));

describe('ensureProviderEditorAgGridModules', () => {
  afterEach(async () => {
    vi.resetModules();
    registerModules.mockReset();
  });

  it('registers enterprise modules exactly once', async () => {
    const { ensureProviderEditorAgGridModules } = await import('./ensureProviderEditorAgGridModules.js');
    ensureProviderEditorAgGridModules();
    ensureProviderEditorAgGridModules();
    expect(registerModules).toHaveBeenCalledTimes(1);
    expect(registerModules).toHaveBeenCalledWith([{ name: 'AllEnterpriseModule' }]);
  });
});
