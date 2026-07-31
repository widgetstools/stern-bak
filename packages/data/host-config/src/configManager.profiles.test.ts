/**
 * Tests for the `ConfigManager.profiles` namespace (Session 3.2 of the
 * profile-state consolidation — see
 * `docs/PROFILE-STATE-CONSOLIDATION.md`).
 *
 * Each test gets its own ConfigManager (and Dexie DB) so isolation is
 * trivial — `fake-indexeddb/auto` in `test/setup.ts` resets state on
 * every `Dexie` open.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ChangeNotifier } from './changeNotifier';
import { createConfigManager, type ConfigManager } from './ConfigManager';
import type { ProfileSnapshot } from '@wellsfargo-starui/engine';

// Each test gets its own instanceId so writes don't bleed between
// tests. The default ConfigManager DB is shared per-file (fake-
// indexeddb only resets on Dexie open, not between tests), so tests
// here lean on unique configIds for isolation — the same pattern that
// `configManager.audit.test.ts` uses.
let nextInstance = 0;
function freshInstanceId(): string {
  nextInstance += 1;
  return `inst-${Date.now()}-${nextInstance}`;
}

// Helper — unique-ish profile snapshot. `gridId` defaults to a
// generic value because the snapshot's gridId is opaque to the
// bundle; the row keys on `instanceId` from the scope, not on this.
function snap(id: string, name = id, gridId = 'opaque'): ProfileSnapshot {
  return {
    id,
    gridId,
    name,
    state: { settings: { v: 1, data: {} } },
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  };
}

describe('ConfigManager.profiles — namespace API', () => {
  let cm: ConfigManager;
  let gridA: string;
  let gridB: string;

  beforeEach(() => {
    cm = createConfigManager({
      appId: 'TestApp',
      identity: { userId: 'alice', displayName: 'Alice' },
    });
    gridA = freshInstanceId();
    gridB = freshInstanceId();
  });

  afterEach(() => {
    cm.dispose();
  });

  it('list returns [] for an empty bundle', async () => {
    const out = await cm.profiles.list({ instanceId: gridA });
    expect(out).toEqual([]);
  });

  it('save round-trips: save → list returns the saved profile', async () => {
    await cm.profiles.save({ instanceId: gridA }, snap('p1', 'First'));
    const list = await cm.profiles.list({ instanceId: gridA });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('p1');
    expect(list[0].name).toBe('First');
  });

  it('save inserts and updates idempotently in the bundle', async () => {
    await cm.profiles.save({ instanceId: gridA }, snap('p1', 'Original'));
    await cm.profiles.save({ instanceId: gridA }, snap('p1', 'Renamed'));

    const list = await cm.profiles.list({ instanceId: gridA });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Renamed');
  });

  it('save preserves siblings + ordering inside the bundle', async () => {
    await cm.profiles.save({ instanceId: gridA }, snap('p1'));
    await cm.profiles.save({ instanceId: gridA }, snap('p2'));
    await cm.profiles.save({ instanceId: gridA }, snap('p3'));

    const list = await cm.profiles.list({ instanceId: gridA });
    expect(list.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('delete removes a profile from subsequent list calls', async () => {
    await cm.profiles.save({ instanceId: gridA }, snap('p1'));
    await cm.profiles.save({ instanceId: gridA }, snap('p2'));

    await cm.profiles.delete({ instanceId: gridA }, 'p1');

    const list = await cm.profiles.list({ instanceId: gridA });
    expect(list.map((p) => p.id)).toEqual(['p2']);
  });

  it('delete on a missing profile is a no-op', async () => {
    await cm.profiles.save({ instanceId: gridA }, snap('p1'));

    await cm.profiles.delete({ instanceId: gridA }, 'never-existed');

    const list = await cm.profiles.list({ instanceId: gridA });
    expect(list.map((p) => p.id)).toEqual(['p1']);
  });

  it('delete on a missing bundle is a no-op (not an error)', async () => {
    await expect(
      cm.profiles.delete({ instanceId: 'never-saved' }, 'whatever'),
    ).resolves.not.toThrow();
  });

  it('two instances of the same app are isolated by instanceId', async () => {
    await cm.profiles.save({ instanceId: gridA }, snap('p1'));
    await cm.profiles.save({ instanceId: gridB }, snap('p2'));

    const a = await cm.profiles.list({ instanceId: gridA });
    const b = await cm.profiles.list({ instanceId: gridB });
    expect(a.map((p) => p.id)).toEqual(['p1']);
    expect(b.map((p) => p.id)).toEqual(['p2']);
  });

  it('loadGridLevelData returns null when no row exists', async () => {
    expect(await cm.profiles.loadGridLevelData({ instanceId: gridA })).toBeNull();
  });

  it('saveGridLevelData round-trips through loadGridLevelData', async () => {
    const data = { liveProviderId: 'rest', mode: 'live' };
    await cm.profiles.saveGridLevelData({ instanceId: gridA }, data);

    const loaded = await cm.profiles.loadGridLevelData({ instanceId: gridA });
    expect(loaded).toEqual(data);
  });

  it('saveGridLevelData preserves existing profiles', async () => {
    await cm.profiles.save({ instanceId: gridA }, snap('p1'));
    await cm.profiles.saveGridLevelData({ instanceId: gridA }, { mode: 'historical' });

    const profiles = await cm.profiles.list({ instanceId: gridA });
    const grid = await cm.profiles.loadGridLevelData({ instanceId: gridA });
    expect(profiles.map((p) => p.id)).toEqual(['p1']);
    expect(grid).toEqual({ mode: 'historical' });
  });

  it('save preserves existing gridLevelData', async () => {
    await cm.profiles.saveGridLevelData({ instanceId: gridA }, { mode: 'live' });
    await cm.profiles.save({ instanceId: gridA }, snap('p1'));

    const grid = await cm.profiles.loadGridLevelData({ instanceId: gridA });
    expect(grid).toEqual({ mode: 'live' });
  });

  it('scope defaults appId / userId to manager identity', async () => {
    // Pass only instanceId — manager should fill in appId + userId.
    await cm.profiles.save({ instanceId: gridA }, snap('p1'));
    await expect(
      cm.profiles.list({ instanceId: gridA }),
    ).resolves.toHaveLength(1);

    // A scope with the wrong userId reads as if the row didn't exist
    // (visibility / ownership at the row level).
    const miss = await cm.profiles.list({
      instanceId: gridA,
      userId: 'someone-else',
    });
    expect(miss).toEqual([]);
  });

  it('subscribe fires on save in the same manager', async () => {
    let fires = 0;
    const off = cm.profiles.subscribe({ instanceId: gridA }, () => {
      fires++;
    });

    await cm.profiles.save({ instanceId: gridA }, snap('p1'));
    expect(fires).toBe(1);

    off();
    await cm.profiles.save({ instanceId: gridA }, snap('p2'));
    expect(fires).toBe(1);
  });

  it('subscribe filters by instanceId — siblings do not fire', async () => {
    let fires = 0;
    cm.profiles.subscribe({ instanceId: gridA }, () => {
      fires++;
    });

    await cm.profiles.save({ instanceId: gridB }, snap('p1'));
    expect(fires).toBe(0);

    await cm.profiles.save({ instanceId: gridA }, snap('p2'));
    expect(fires).toBe(1);
  });

  it('subscribe fires on delete', async () => {
    await cm.profiles.save({ instanceId: gridA }, snap('p1'));

    let fires = 0;
    cm.profiles.subscribe({ instanceId: gridA }, () => {
      fires++;
    });
    await cm.profiles.delete({ instanceId: gridA }, 'p1');
    expect(fires).toBe(1);
  });
});

describe('ChangeNotifier — same-tab event bus', () => {
  it('notify fires local listeners synchronously', () => {
    const n = new ChangeNotifier(`test-${Math.random()}`);
    const fires: string[] = [];
    n.subscribe('cfg-1', () => fires.push('cfg-1'));
    n.subscribe('cfg-2', () => fires.push('cfg-2'));

    n.notify('cfg-1');
    expect(fires).toEqual(['cfg-1']);

    n.notify('cfg-2');
    expect(fires).toEqual(['cfg-1', 'cfg-2']);

    n.dispose();
  });

  it('unsubscribe stops further notifications for that listener', () => {
    const n = new ChangeNotifier(`test-${Math.random()}`);
    let fires = 0;
    const off = n.subscribe('cfg-1', () => fires++);

    n.notify('cfg-1');
    expect(fires).toBe(1);

    off();
    n.notify('cfg-1');
    expect(fires).toBe(1);

    n.dispose();
  });

  it('does not fire after dispose', () => {
    const n = new ChangeNotifier(`test-${Math.random()}`);
    let fires = 0;
    n.subscribe('cfg-1', () => fires++);

    n.dispose();
    n.notify('cfg-1');
    expect(fires).toBe(0);
  });

  it('subscribeAll receives every notify with configId', () => {
    const n = new ChangeNotifier(`test-${Math.random()}`);
    const ids: string[] = [];
    const off = n.subscribeAll((configId) => ids.push(configId));

    n.notify('cfg-1');
    n.notify('cfg-2');
    expect(ids).toEqual(['cfg-1', 'cfg-2']);

    off();
    n.notify('cfg-3');
    expect(ids).toEqual(['cfg-1', 'cfg-2']);

    n.dispose();
  });

  it('one listener throwing does not prevent siblings from firing', () => {
    const n = new ChangeNotifier(`test-${Math.random()}`);
    const fires: string[] = [];
    n.subscribe('cfg-1', () => {
      fires.push('a');
      throw new Error('boom');
    });
    n.subscribe('cfg-1', () => fires.push('b'));

    n.notify('cfg-1');
    expect(fires).toEqual(['a', 'b']);

    n.dispose();
  });
});

describe('ConfigManager.profiles — cross-tab subscribe', () => {
  // BroadcastChannel is available in Node 20+ globally, so two
  // ConfigManager instances in the same process share one channel.
  // This simulates a two-tab scenario.

  // Skip in environments without BroadcastChannel (older Node).
  const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined';

  it.skipIf(!hasBroadcastChannel)(
    'subscribe fires when a sibling manager (= another tab) writes',
    async () => {
      const sharedInstance = freshInstanceId();
      // Both managers must use the same Dexie DB to see each other's
      // writes — fake-indexeddb gives that for free in-process.
      const tabA = createConfigManager({
        appId: 'TestApp',
        identity: { userId: 'alice' },
      });
      const tabB = createConfigManager({
        appId: 'TestApp',
        identity: { userId: 'alice' },
      });

      try {
        let fires = 0;
        tabA.profiles.subscribe({ instanceId: sharedInstance }, () => {
          fires++;
        });

        // Write from tabB. tabB's notifier dispatchesLocal (= no
        // tabA listeners on tabB), then posts to BroadcastChannel.
        // tabA's notifier receives the inbound message and dispatches
        // to its listener.
        await tabB.profiles.save({ instanceId: sharedInstance }, snap('p1'));

        // BroadcastChannel delivery is asynchronous (microtask).
        await new Promise((r) => setTimeout(r, 10));

        expect(fires).toBeGreaterThanOrEqual(1);
      } finally {
        tabA.dispose();
        tabB.dispose();
      }
    },
  );
});
