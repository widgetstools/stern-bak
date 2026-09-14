import { describe, expect, it } from 'vitest';
import { normalizePayload } from './profileBundle';

/**
 * The profile-set normaliser rebuilds each snapshot from a fixed field list;
 * `isTemplate` must survive that or Workspace Setup's template marks vanish
 * on every read (found live: the row carried the flag, the picker never saw
 * it). Tri-state on purpose — absent stays absent.
 */
describe('normalizePayload — ProfileSnapshot.isTemplate', () => {
  it('keeps true, false and absent apart', () => {
    const payload = normalizePayload({
      version: 3,
      profiles: [
        { id: '__default__', gridId: 'g', name: 'Default', state: {}, createdAt: 1, updatedAt: 1, isTemplate: true },
        { id: 'default-copy', gridId: 'g', name: 'Default (copy)', state: {}, createdAt: 2, updatedAt: 2, isTemplate: false },
        { id: 'legacy', gridId: 'g', name: 'Legacy', state: {}, createdAt: 3, updatedAt: 3 },
        { id: 'junk', gridId: 'g', name: 'Junk', state: {}, createdAt: 4, updatedAt: 4, isTemplate: 'yes' },
      ],
    });
    const byId = Object.fromEntries(payload.profiles.map((p) => [p.id, p]));
    expect(byId.__default__.isTemplate).toBe(true);
    expect(byId['default-copy'].isTemplate).toBe(false);
    expect('isTemplate' in byId.legacy).toBe(false);
    expect('isTemplate' in byId.junk).toBe(false);
  });
});
