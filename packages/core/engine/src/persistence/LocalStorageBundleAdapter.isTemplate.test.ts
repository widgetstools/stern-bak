import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageBundleAdapter } from './LocalStorageBundleAdapter';

/** `isTemplate` must round-trip through the bundle normaliser (tri-state). */
describe('LocalStorageBundleAdapter — ProfileSnapshot.isTemplate', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips true / false and leaves absent absent', async () => {
    const adapter = new LocalStorageBundleAdapter('grid-T');
    await adapter.saveProfile({ id: 'tpl', gridId: 'grid-T', name: 'Template', state: {}, createdAt: 1, updatedAt: 1, isTemplate: true });
    await adapter.saveProfile({ id: 'copy', gridId: 'grid-T', name: 'Template (copy)', state: {}, createdAt: 2, updatedAt: 2, isTemplate: false });
    await adapter.saveProfile({ id: 'plain', gridId: 'grid-T', name: 'Plain', state: {}, createdAt: 3, updatedAt: 3 });

    // A fresh adapter reads the persisted bundle back through the normaliser.
    const reread = new LocalStorageBundleAdapter('grid-T');
    expect((await reread.loadProfile('grid-T', 'tpl'))?.isTemplate).toBe(true);
    expect((await reread.loadProfile('grid-T', 'copy'))?.isTemplate).toBe(false);
    expect('isTemplate' in ((await reread.loadProfile('grid-T', 'plain')) ?? {})).toBe(false);
    const listed = await reread.listProfiles('grid-T');
    expect(listed.find((p) => p.id === 'tpl')?.isTemplate).toBe(true);
  });
});
