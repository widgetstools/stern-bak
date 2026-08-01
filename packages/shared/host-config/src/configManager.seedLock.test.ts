/**
 * Phase 4 — cold-start seed dedup.
 *
 * On a cold start that opens several windows at once, every same-origin
 * context (plus the SharedWorker) used to independently see an empty DB,
 * fetch `seed.json`, and run a bulkPut. `seedIfEmpty` now serializes on a
 * Web Lock keyed by the seed URL and re-checks emptiness *inside* the lock,
 * so the bundle is fetched + written exactly once. These tests pin that
 * behaviour with a serializing mock `navigator.locks`.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createConfigManager, type ConfigManager } from './ConfigManager';
import type { AppConfigRow, SeedData } from './types';

const DB_NAME = 'marketsui-config';
const SEED_URL = 'http://localhost/seed.json';

async function wipeDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

function seedBundle(): SeedData {
  const row: AppConfigRow = {
    configId: 'dp-stomp',
    appId: 'StarDemo',
    userId: 'system',
    isPublic: true,
    displayText: 'row',
    componentType: 'data-provider',
    componentSubType: 'stomp',
    isTemplate: false,
    payload: { url: 'wss://feed.example/stomp' },
    createdBy: 'dev1',
    updatedBy: 'dev1',
    creationTime: '2026-06-01T00:00:00.000Z',
    updatedTime: '2026-06-01T00:00:00.000Z',
  };
  return {
    activeAppId: 'StarDemo',
    activeUserId: 'dev1',
    permissions: [],
    roles: [],
    appRegistry: [
      {
        appId: 'StarDemo',
        displayName: 'Star Demo',
        manifestUrl: 'http://localhost/manifest.json',
        configServiceEnabled: false,
        environment: 'dev',
      },
    ],
    userProfiles: [],
    appConfig: [row],
  };
}

interface LockRequest {
  name: string;
  mode: string;
}

/**
 * A `navigator.locks`-shaped manager that serializes callbacks per lock name
 * (real exclusive-lock semantics) and records the max number of callbacks ever
 * running at once, so a test can assert the seed never ran concurrently.
 */
function makeSerializingLocks() {
  const tails = new Map<string, Promise<void>>();
  const requests: LockRequest[] = [];
  let active = 0;
  let maxActive = 0;
  return {
    requests,
    get maxActive() {
      return maxActive;
    },
    manager: {
      async request(
        name: string,
        options: { mode: 'exclusive' | 'shared' },
        callback: () => Promise<void>,
      ): Promise<void> {
        requests.push({ name, mode: options.mode });
        const prevTail = tails.get(name) ?? Promise.resolve();
        let releaseThis!: () => void;
        const thisTail = new Promise<void>((res) => {
          releaseThis = res;
        });
        tails.set(name, prevTail.then(() => thisTail));
        await prevTail;
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          await callback();
        } finally {
          active -= 1;
          releaseThis();
        }
      },
    },
  };
}

describe('ConfigManager.seedIfEmpty — cold-start seed lock', () => {
  const managers: ConfigManager[] = [];

  afterEach(() => {
    for (const cm of managers) cm.dispose();
    managers.length = 0;
    vi.unstubAllGlobals();
    if ('locks' in globalThis.navigator) {
      // @ts-expect-error — test-injected property
      delete globalThis.navigator.locks;
    }
  });

  it('fetches + seeds exactly once when two contexts boot concurrently', async () => {
    await wipeDatabase();
    const locks = makeSerializingLocks();
    Object.defineProperty(globalThis.navigator, 'locks', {
      value: locks.manager,
      configurable: true,
    });

    const fetchSpy = vi.fn(
      async () => ({ ok: true, status: 200, json: async () => seedBundle() }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchSpy);

    const cm1 = createConfigManager({ appId: 'StarDemo', seedConfigUrl: SEED_URL });
    const cm2 = createConfigManager({ appId: 'StarDemo', seedConfigUrl: SEED_URL });
    managers.push(cm1, cm2);

    // Boot both at the same time — the lock must collapse the duplicate seed.
    await Promise.all([cm1.init(), cm2.init()]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // The seed was never applied concurrently.
    expect(locks.maxActive).toBe(1);
    // Both managers requested an exclusive lock keyed by the seed URL.
    expect(locks.requests.length).toBe(2);
    expect(locks.requests.every((r) => r.mode === 'exclusive')).toBe(true);
    expect(locks.requests.every((r) => r.name === `starui:seed-lock:${SEED_URL}`)).toBe(true);

    // Data landed once, intact.
    const configs = await cm1.getAllConfigsUnfiltered();
    expect(configs.map((c) => c.configId)).toEqual(['dp-stomp']);
  });

  it('does not acquire a lock when no seedConfigUrl is configured', async () => {
    await wipeDatabase();
    const locks = makeSerializingLocks();
    Object.defineProperty(globalThis.navigator, 'locks', {
      value: locks.manager,
      configurable: true,
    });

    const cm = createConfigManager({ appId: 'StarDemo' });
    managers.push(cm);
    await cm.init();

    expect(locks.requests.length).toBe(0);
  });
});
