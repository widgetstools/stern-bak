/**
 * AppDataMirror tests — wire two mirrors against ONE in-process
 * SharedWorkerDataServicesHub via direct calls (no MessageChannel
 * needed; the hub doesn't care where the request came from). The
 * test verifies cross-mirror convergence: a write on mirror A is
 * visible on mirror B after the broadcast round-trip.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDataMirror } from './AppDataMirror';
import { SharedWorkerDataServicesHub } from '../worker/SharedWorkerDataServicesHub';
import type { AppDataEvent, AppDataRequest, PortLike } from '../worker/index';
import type { ConfigManager, AppConfigRow } from '@wellsfargo-starui/host-config';

// ─── Stub ConfigManager ────────────────────────────────────────────

function stubConfigManager(): ConfigManager & { _rows: Map<string, AppConfigRow> } {
  const rows = new Map<string, AppConfigRow>();
  return {
    _rows: rows,
    getAppId() { return 'TestApp'; },
    async getConfigsByUser(userId: string) {
      return [...rows.values()].filter((r) => r.userId === userId);
    },
    async getAllConfigs() { return [...rows.values()]; },
    async getAllConfigsUnfiltered() { return [...rows.values()]; },
    async getConfigsByComponentTypesUnfiltered(types: string[]) { return [...rows.values()].filter((r) => types.includes(r.componentType)); },
    async getConfig(id: string) { return rows.get(id); },
    async saveConfig(row: AppConfigRow) { rows.set(row.configId, row); },
    async deleteConfig(id: string) { rows.delete(id); },
  } as unknown as ConfigManager & { _rows: Map<string, AppConfigRow> };
}

// ─── Test rig — wires N mirrors to one hub ─────────────────────────

interface Rig {
  hub: SharedWorkerDataServicesHub;
  cm: ConfigManager & { _rows: Map<string, AppConfigRow> };
  /**
   * Re-hydrate the hub from the ConfigManager (used by tests that
   * pre-populate `cm._rows` and need the hub to reflect those rows
   * before any mirror attaches). Idempotent because the hub guards
   * with isHydrated() — call after initial buildRig() returned and
   * after every cm._rows mutation if you want the hub to re-load.
   */
  hydrate(): Promise<void>;
  mountMirror(opts?: { userId?: string; subId?: string }): AppDataMirror;
}

function buildRig(): Rig {
  const cm = stubConfigManager();
  const hub = new SharedWorkerDataServicesHub({ configManager: cm });
  const ports = new Map<AppDataMirror, PortLike>();

  return {
    hub, cm,
    hydrate: () => hub.hydrateAppData('alice'),
    mountMirror(opts = {}) {
      const userId = opts.userId ?? 'alice';
      const subId = opts.subId ?? `sub-${Math.random().toString(36).slice(2)}`;

      // Each mirror has its own port so the hub can address it
      // directly. The port routes events back to the right mirror's
      // handleEvent. We resolve the mirror reference after creation
      // by capturing it.
      let mirror!: AppDataMirror;
      const port: PortLike = {
        postMessage(message: unknown) {
          // The hub posts AppDataEvents back here; route them.
          mirror.handleEvent(message as AppDataEvent);
        },
      };

      mirror = new AppDataMirror({
        subId,
        userId,
        send: (req: AppDataRequest) => {
          // Mirror sends requests to the hub via the same port object
          // — hub uses port identity for fan-out.
          hub.handleAppDataRequest(port, req);
        },
      });
      ports.set(mirror, port);
      return mirror;
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

let rig: Rig;
beforeEach(() => { rig = buildRig(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('AppDataMirror — single-mirror', () => {
  it('attach + ready resolves after snapshot delivery (empty seed)', async () => {
    const m = rig.mountMirror();
    await m.attach();
    await m.ready();
    expect(m.isReady()).toBe(true);
    expect(m.list()).toEqual([]);
    expect(m.get('positions', 'asOfDate')).toBeUndefined();
  });

  it('hub hydrates from existing ConfigManager rows; mirror sees them on attach', async () => {
    rig.cm._rows.set('ad-1', {
      configId: 'ad-1', appId: 'TestApp', userId: 'alice',
      componentType: 'appdata', componentSubType: 'appdata',
      isTemplate: false, displayText: 'positions',
      payload: { values: { asOfDate: '2026-04-01' } },
      createdBy: 'alice', updatedBy: 'alice',
      creationTime: '0', updatedTime: '0',
    } as AppConfigRow);

    // Hydrate the hub before any mirror attaches — this is what the
    // worker entry script does at boot in production.
    await rig.hydrate();

    const m = rig.mountMirror();
    await m.attach();
    await m.ready();
    expect(m.get('positions', 'asOfDate')).toBe('2026-04-01');
  });

  it('set goes through the hub which persists to ConfigManager; sync get reflects the new value', async () => {
    await rig.hydrate();
    const m = rig.mountMirror();
    await m.attach();
    await m.ready();

    await m.set('positions', 'asOfDate', '2026-05-08');

    expect(m.get('positions', 'asOfDate')).toBe('2026-05-08');
    // Hub persisted to ConfigManager — exactly one row visible.
    expect([...rig.cm._rows.values()][0]).toMatchObject({
      componentType: 'appdata',
      payload: { values: { asOfDate: '2026-05-08' } },
    });
  });

  it('publishNamedRow merges keys in a single hub upsert', async () => {
    await rig.hydrate();
    const hub = rig.hub;
    let hubUpserts = 0;
    const orig = hub.handleAppDataRequest.bind(hub);
    hub.handleAppDataRequest = (port, req) => {
      if (req.kind === 'appdata-set') hubUpserts++;
      return orig(port, req);
    };
    try {
      const m = rig.mountMirror();
      await m.attach();
      await m.ready();

      hubUpserts = 0;
      await m.publishNamedRow('ApplicationContext', {
        hostName: 'h',
        hostVersion: 'v',
        appName: 'a',
        appVersion: '1',
      });
      expect(hubUpserts).toBe(1);
      expect(m.get('ApplicationContext', 'hostName')).toBe('h');
      expect(m.get('ApplicationContext', 'appVersion')).toBe('1');

      hubUpserts = 0;
      await m.set('Other', 'x', 1);
      await m.set('Other', 'y', 2);
      await m.set('Other', 'z', 3);
      expect(hubUpserts).toBe(3);
    } finally {
      hub.handleAppDataRequest = orig;
    }
  });

  it('subscribe fires after each mutation', async () => {
    const m = rig.mountMirror();
    await m.attach();
    await m.ready();

    const listener = vi.fn();
    m.subscribe(listener);
    await m.set('positions', 'asOfDate', '2026-05-08');
    expect(listener).toHaveBeenCalled();
    listener.mockClear();
    await m.set('positions', 'asOfDate', '2026-05-09');
    expect(listener).toHaveBeenCalled();
  });

  it('remove deletes from mirror and ConfigManager (via the hub)', async () => {
    rig.cm._rows.set('ad-1', {
      configId: 'ad-1', appId: 'TestApp', userId: 'alice',
      componentType: 'appdata', componentSubType: 'appdata',
      isTemplate: false, displayText: 'positions',
      payload: { values: { asOfDate: '2026-04-01' } },
      createdBy: 'alice', updatedBy: 'alice',
      creationTime: '0', updatedTime: '0',
    } as AppConfigRow);

    await rig.hydrate();
    const m = rig.mountMirror();
    await m.attach();
    await m.ready();
    expect(m.list()).toHaveLength(1);

    await m.remove('ad-1');
    expect(m.list()).toEqual([]);
    expect(rig.cm._rows.size).toBe(0);
  });
});

describe('AppDataMirror — cross-mirror convergence', () => {
  it('write on A is observable on B (sync get) after the broadcast', async () => {
    const a = rig.mountMirror({ subId: 'a' });
    const b = rig.mountMirror({ subId: 'b' });
    await a.attach();
    await b.attach();
    await Promise.all([a.ready(), b.ready()]);

    await a.set('positions', 'asOfDate', '2026-05-08');

    expect(b.get('positions', 'asOfDate')).toBe('2026-05-08');
  });

  it('B subscribe listener fires when A writes', async () => {
    const a = rig.mountMirror({ subId: 'a' });
    const b = rig.mountMirror({ subId: 'b' });
    await a.attach();
    await b.attach();
    await Promise.all([a.ready(), b.ready()]);

    const bListener = vi.fn();
    b.subscribe(bListener);
    await a.set('positions', 'asOfDate', '2026-05-08');
    expect(bListener).toHaveBeenCalled();
  });

  it('removal on A propagates to B', async () => {
    const a = rig.mountMirror({ subId: 'a' });
    await a.attach();
    await a.ready();
    await a.set('positions', 'asOfDate', '2026-05-08');

    const aRow = a.list()[0];
    expect(aRow).toBeDefined();

    const b = rig.mountMirror({ subId: 'b' });
    await b.attach();
    await b.ready();
    expect(b.list()).toHaveLength(1);

    await a.remove(aRow.configId);
    expect(b.list()).toEqual([]);
  });

  it('three-way convergence — A writes, B and C both see it', async () => {
    const a = rig.mountMirror({ subId: 'a' });
    const b = rig.mountMirror({ subId: 'b' });
    const c = rig.mountMirror({ subId: 'c' });
    await a.attach();
    await b.attach();
    await c.attach();
    await Promise.all([a.ready(), b.ready(), c.ready()]);

    await a.set('positions', 'asOfDate', '2026-05-08');
    expect(b.get('positions', 'asOfDate')).toBe('2026-05-08');
    expect(c.get('positions', 'asOfDate')).toBe('2026-05-08');
  });
});
