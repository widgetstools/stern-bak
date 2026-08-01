import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeSeedDigest, seedDigestStorageKey, simpleSeedDigest } from './seedDigest';
import type { AppConfigRow, SeedData } from './types';

function seed(overrides: Partial<SeedData> = {}): SeedData {
  return {
    activeAppId: 'TestApp',
    activeUserId: 'alice',
    appRegistry: [],
    userProfiles: [],
    roles: [],
    permissions: [],
    ...overrides,
  };
}

function appConfigRow(overrides: Partial<AppConfigRow> = {}): AppConfigRow {
  return {
    configId: 'c1',
    appId: 'StaleApp',
    userId: 'stale-user',
    displayText: 'Row',
    componentType: 'grid',
    componentSubType: 'default',
    isTemplate: false,
    isPublic: true,
    payload: {},
    createdBy: 'alice',
    updatedBy: 'alice',
    creationTime: '2026-01-01T00:00:00Z',
    updatedTime: '2026-01-01T00:00:00Z',
    ...overrides,
  } as AppConfigRow;
}

const originalCrypto = globalThis.crypto;

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(globalThis, 'crypto', {
    value: originalCrypto,
    configurable: true,
    writable: true,
  });
});

describe('seedDigestStorageKey', () => {
  it('namespaces the key per seed URL so two apps do not share a digest', () => {
    expect(seedDigestStorageKey('/seed.json')).toBe('starui:seed-digest:/seed.json');
    expect(seedDigestStorageKey('https://cdn/x/seed.json'))
      .not.toBe(seedDigestStorageKey('/seed.json'));
  });
});

describe('simpleSeedDigest', () => {
  it('is deterministic for the same input', () => {
    expect(simpleSeedDigest('hello')).toBe(simpleSeedDigest('hello'));
  });

  it('is prefixed so the fallback is distinguishable from a SHA-256 digest', () => {
    expect(simpleSeedDigest('hello')).toMatch(/^djb2-[0-9a-f]+$/);
  });

  it('separates inputs that differ by a single character', () => {
    expect(simpleSeedDigest('hello')).not.toBe(simpleSeedDigest('hellp'));
  });

  it('hashes the empty string to the DJB2 seed value', () => {
    // 5381 → 0x1505; pinned because an empty seed must still produce a
    // stable key rather than an empty/undefined one.
    expect(simpleSeedDigest('')).toBe('djb2-1505');
  });

  it('stays inside 32 unsigned bits for long inputs', () => {
    const hex = simpleSeedDigest('x'.repeat(10_000)).slice('djb2-'.length);
    expect(Number.parseInt(hex, 16)).toBeLessThanOrEqual(0xffffffff);
    expect(Number.parseInt(hex, 16)).toBeGreaterThanOrEqual(0);
  });
});

describe('computeSeedDigest', () => {
  it('produces a 64-char SHA-256 hex digest when crypto.subtle is available', async () => {
    const digest = await computeSeedDigest(seed());
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across calls for an identical bundle', async () => {
    expect(await computeSeedDigest(seed())).toBe(await computeSeedDigest(seed()));
  });

  it('changes when the seed content changes', async () => {
    const a = await computeSeedDigest(seed());
    const b = await computeSeedDigest(seed({ roles: [{ roleId: 'admin' }] as never }));
    expect(a).not.toBe(b);
  });

  it('ignores export drift that normalizeSeedData re-stamps away', async () => {
    // A Config Browser export carries stale appId/userId on its rows.
    // Digesting AFTER normalization is the whole point — otherwise every
    // re-export would look like a content change and force a re-seed.
    const stale = seed({ appConfig: [appConfigRow({ appId: 'StaleApp', userId: 'stale-user' })] });
    const fresh = seed({ appConfig: [appConfigRow({ appId: 'TestApp', userId: 'alice' })] });
    expect(await computeSeedDigest(stale)).toBe(await computeSeedDigest(fresh));
  });

  it('falls back to the DJB2 digest when crypto.subtle is missing', async () => {
    vi.stubGlobal('crypto', {});
    const digest = await computeSeedDigest(seed());
    expect(digest).toMatch(/^djb2-[0-9a-f]+$/);
  });

  it('falls back to the DJB2 digest when crypto itself is missing', async () => {
    vi.stubGlobal('crypto', undefined);
    const digest = await computeSeedDigest(seed());
    expect(digest).toMatch(/^djb2-[0-9a-f]+$/);
  });

  it('the fallback still distinguishes different bundles', async () => {
    vi.stubGlobal('crypto', {});
    const a = await computeSeedDigest(seed());
    const b = await computeSeedDigest(seed({ activeAppId: 'OtherApp' }));
    expect(a).not.toBe(b);
  });
});
