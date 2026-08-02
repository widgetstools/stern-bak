import { describe, expect, it, vi } from 'vitest';
import { ModuleRegistry } from 'ag-grid-community';

describe('agGridSetup', () => {
  it('registers ag-grid community modules once', async () => {
    vi.resetModules();
    await import('./agGridSetup');
    expect(ModuleRegistry.registerModules).toHaveBeenCalled();
  });
});
