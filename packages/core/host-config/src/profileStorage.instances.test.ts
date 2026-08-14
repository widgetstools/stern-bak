import { describe, expect, it } from 'vitest';
import type { ConfigManager } from './ConfigManager';
import { createConfigServiceStorage } from './profileBundle';

/**
 * One adapter instance per row identity. A container + grid pair over the
 * same bundled row must share one adapter (one version cache — the
 * intra-window dual-writer hazard is structurally impossible); different
 * rows or different registered identities get their own instances.
 */

const cm = {
  getConfig: async () => undefined,
  saveConfig: async () => undefined,
  onRowChanged: () => () => {},
} as unknown as ConfigManager;

describe('createConfigServiceStorage — instance memoization', () => {
  it('returns the SAME adapter for the same row identity', () => {
    const factory = createConfigServiceStorage({ configManager: cm });
    const a = factory({ instanceId: 'g1', appId: 'A', userId: 'u1' });
    const b = factory({ instanceId: 'g1', appId: 'A', userId: 'u1' });
    expect(b).toBe(a);
  });

  it('returns distinct adapters for distinct rows', () => {
    const factory = createConfigServiceStorage({ configManager: cm });
    const a = factory({ instanceId: 'g1', appId: 'A', userId: 'u1' });
    const b = factory({ instanceId: 'g2', appId: 'A', userId: 'u1' });
    const c = factory({ instanceId: 'g1', appId: 'A', userId: 'u2' });
    expect(b).not.toBe(a);
    expect(c).not.toBe(a);
  });

  it('keys on the registered identity (it stamps componentType on saves)', () => {
    const factory = createConfigServiceStorage({ configManager: cm });
    const plain = factory({ instanceId: 'g1', appId: 'A', userId: 'u1' });
    const branded = factory({
      instanceId: 'g1',
      appId: 'A',
      userId: 'u1',
      registeredIdentity: {
        componentType: 'blotter',
        componentSubType: '',
        isTemplate: false,
        singleton: false,
      },
    });
    expect(branded).not.toBe(plain);
  });

  it('separate factories keep separate instance caches (cross-window model)', () => {
    const a = createConfigServiceStorage({ configManager: cm })({
      instanceId: 'g1', appId: 'A', userId: 'u1',
    });
    const b = createConfigServiceStorage({ configManager: cm })({
      instanceId: 'g1', appId: 'A', userId: 'u1',
    });
    expect(b).not.toBe(a);
  });
});
