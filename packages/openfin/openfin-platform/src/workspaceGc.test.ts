/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for the workspace-membership GC sweep.
 *
 * Covers all preservation rules + the deletion path. The GC reads the
 * registry via `loadRegistryConfig()`, which delegates to the
 * module-level `configManagerInstance` singleton (set by
 * `setConfigManager`). Each test installs a fresh InMemoryConfigManager
 * as that singleton, so the GC's internal registry lookup hits the same
 * test fixture that we pass in via `opts.cm`.
 *
 * Scope handling: tests run with the platform default scope at
 * `(TestApp, dev1)` so the registry's expected configId is
 * `component-registry::TestApp::system` — the post-Phase-4 global
 * location the production code targets.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { COMPONENT_TYPES } from '@wellsfargo-starui/types';
import type { AppConfigRow, ConfigManager } from '@wellsfargo-starui/host-config';
import { gcOrphanedConfigs } from './workspaceGc';
import { setConfigManager, setPlatformDefaultScope } from './db';
import { deriveSingletonConfigId } from './registryConfigTypes';

// ─── Test fixtures ───────────────────────────────────────────────────

class InMemoryConfigManager {
  rows = new Map<string, AppConfigRow>();

  async getConfig(configId: string): Promise<AppConfigRow | undefined> {
    const row = this.rows.get(configId);
    return row ? { ...row } : undefined;
  }
  async saveConfig(row: AppConfigRow): Promise<void> {
    this.rows.set(row.configId, { ...row });
  }
  async deleteConfig(configId: string): Promise<void> {
    this.rows.delete(configId);
  }
  async getConfigsByUser(userId: string): Promise<AppConfigRow[]> {
    return Array.from(this.rows.values())
      .filter((r) => r.userId === userId)
      .map((r) => ({ ...r }));
  }
  async getConfigsByUserUnfiltered(userId: string): Promise<AppConfigRow[]> {
    return Array.from(this.rows.values())
      .filter((r) => r.userId === userId)
      .map((r) => ({ ...r }));
  }
  async getAllConfigs(): Promise<AppConfigRow[]> {
    return Array.from(this.rows.values()).map((r) => ({ ...r }));
  }
}

const APP_ID = 'TestApp';
const USER_ID = 'dev1';

function row(partial: Partial<AppConfigRow> & Pick<AppConfigRow, 'configId'>): AppConfigRow {
  return {
    appId: APP_ID,
    userId: USER_ID,
    displayText: partial.displayText ?? partial.configId,
    componentType: partial.componentType ?? 'GRID',
    componentSubType: partial.componentSubType ?? 'CREDIT',
    isTemplate: false,
    payload: {},
    createdBy: USER_ID,
    updatedBy: USER_ID,
    creationTime: '2026-04-26T00:00:00Z',
    updatedTime: '2026-04-26T00:00:00Z',
    ...partial,
  };
}

let cm: InMemoryConfigManager;

beforeEach(() => {
  cm = new InMemoryConfigManager();
  // Install our mock as the module-level singleton so loadRegistryConfig
  // (called inside gcOrphanedConfigs) reads from the same in-memory store.
  setConfigManager(cm as unknown as ConfigManager);
  // Pin the platform default scope to (TestApp, dev1). With this:
  //   resolveGlobalScope({TestApp, dev1}) = {TestApp, system}
  // which differs from platformScope in userId, so the registry's
  // configId is suffixed: `component-registry::TestApp::system`.
  setPlatformDefaultScope({ appId: APP_ID, userId: USER_ID });
});

afterEach(() => {
  // Reset platform scope so other test files in the same Vitest run
  // don't inherit it. (Vitest module isolation usually handles this,
  // but explicit reset is cheap and avoids surprise cross-talk.)
  setPlatformDefaultScope({ appId: 'system', userId: 'system' });
});

/**
 * Seed the registry config at the expected post-Phase-4 global
 * location: `component-registry::TestApp::system`. Pass `entries` to
 * populate the singleton-driven preservation set.
 */
function seedRegistry(entries: Array<{ configId?: string; singleton?: boolean }>): void {
  cm.rows.set('component-registry::TestApp::system', row({
    configId: 'component-registry::TestApp::system',
    appId: APP_ID,
    userId: 'system',  // global registry — userId forced to system
    componentType: COMPONENT_TYPES.COMPONENT_REGISTRY,
    componentSubType: '',
    displayText: 'Component Registry',
    payload: { entries, version: 1 },
  }));
}

// ─── Rule 1: workspace rows are skipped entirely ─────────────────────

describe('Rule 1 — workspace rows', () => {
  it('skips workspace rows (not scanned, not deleted)', async () => {
    cm.rows.set('WS_eod', row({
      configId: 'WS_eod',
      componentType: COMPONENT_TYPES.WORKSPACE,
      payload: { instanceIds: [] },
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    expect(r.scanned).toBe(0);
    expect(r.deleted).toBe(0);
    expect(cm.rows.has('WS_eod')).toBe(true);
  });
});

// ─── Rule 2: isTemplate=true preserved ───────────────────────────────

describe('Rule 2 — isTemplate', () => {
  it('preserves rows with isTemplate=true', async () => {
    cm.rows.set('grid-credit', row({
      configId: 'grid-credit',
      isTemplate: true,
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    expect(r.preservedTemplate).toBe(1);
    expect(r.deleted).toBe(0);
    expect(cm.rows.has('grid-credit')).toBe(true);
  });
});

// ─── Rule 2 (cont.): non-template, non-shape rows are reaped ────────

describe('Rule 2 — non-template, non-shape rows are NOT preserved', () => {
  it('does NOT preserve rows that lack isTemplate and have no singleton-shape match', async () => {
    // Both rows have componentType/subType that don't form a singleton-shape
    // configId AND isTemplate is false — only an explicit rule could save
    // them, and there is none post-Session-16.
    cm.rows.set('orphan-1', row({
      configId: 'orphan-1', componentType: 'X', componentSubType: 'Y',
    }));
    cm.rows.set('orphan-2', row({
      configId: 'orphan-2', componentType: 'X', componentSubType: 'Y',
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    // Deletion is disabled at the module level — `deleted` stays at 0,
    // `wouldDelete` reports what the sweep WOULD have reaped, and the
    // rows remain in the store.
    expect(r.deleted).toBe(0);
    expect(r.wouldDelete).toBe(2);
    expect(cm.rows.has('orphan-1')).toBe(true);
    expect(cm.rows.has('orphan-2')).toBe(true);
  });
});

// ─── Rule 3: well-known shared config ids preserved ──────────────────

describe('Rule 3 — well-known shared ids', () => {
  it.each(['dock-config', 'component-registry', 'workspace-setup'])(
    'preserves %s',
    async (id) => {
      cm.rows.set(id, row({ configId: id }));
      const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
      expect(r.preservedKnown).toBe(1);
      expect(cm.rows.has(id)).toBe(true);
    },
  );
});

// ─── Rule 4: registry singleton keys ─────────────────────────────────

describe('Rule 4 — singleton keys from registry', () => {
  it('preserves rows whose configId matches a singleton entry in the registry', async () => {
    seedRegistry([
      { configId: 'custom-singleton', singleton: true },
      { configId: 'non-singleton-templ', singleton: false },
    ]);
    // configId is custom (not the canonical 'x-y' shape) AND the row
    // has no flag — only the registry lookup can save it.
    cm.rows.set('custom-singleton', row({
      configId: 'custom-singleton', componentType: 'X', componentSubType: 'Y',
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    expect(r.preservedSingleton).toBe(1);
    expect(cm.rows.has('custom-singleton')).toBe(true);
  });

  it('ignores entries where singleton=false even if configId is set', async () => {
    seedRegistry([{ configId: 'custom-not-singleton', singleton: false }]);
    cm.rows.set('custom-not-singleton', row({
      configId: 'custom-not-singleton', componentType: 'X', componentSubType: 'Y',
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    expect(r.preservedSingleton).toBe(0);
    // Deletion disabled — would have been 1, actually 0
    expect(r.wouldDelete).toBe(1);
    expect(r.deleted).toBe(0);
    expect(cm.rows.has('custom-not-singleton')).toBe(true);
  });

  it('does not crash when registry load fails — shape rule still applies', async () => {
    // Force loadRegistryConfig to throw by making getConfig blow up only
    // for the registry id. Other lookups continue to work.
    const original = cm.getConfig.bind(cm);
    cm.getConfig = async (id: string) => {
      if (id.startsWith('component-registry')) throw new Error('boom');
      return original(id);
    };
    cm.rows.set('grid-credit', row({
      configId: 'grid-credit', componentType: 'GRID', componentSubType: 'CREDIT',
    }));

    // Even with the registry lookup broken, the singleton-shape rule
    // still protects the row.
    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    expect(r.preservedSingletonShape).toBe(1);
    expect(cm.rows.has('grid-credit')).toBe(true);
  });
});

// ─── Rule 5: singleton-shape fallback ────────────────────────────────

describe('Rule 5 — singleton-shape fallback', () => {
  it('preserves rows whose configId == deriveSingletonConfigId(type, subType)', async () => {
    // 'GRID' + 'CREDIT' → 'grid-credit' (lowercase, dash-joined)
    const id = deriveSingletonConfigId('GRID', 'CREDIT');
    expect(id).toBe('grid-credit');

    cm.rows.set(id, row({
      configId: id,
      componentType: 'GRID',
      componentSubType: 'CREDIT',
      // no flag, no template, not in registry — only rule 6 can save it
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    expect(r.preservedSingletonShape).toBe(1);
    expect(cm.rows.has(id)).toBe(true);
  });

  it('does NOT preserve when configId differs from the canonical derivation', async () => {
    cm.rows.set('grid-credit-XXX', row({
      configId: 'grid-credit-XXX',
      componentType: 'GRID',
      componentSubType: 'CREDIT',
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    // Would be reaped if deletion were on; currently disabled.
    expect(r.wouldDelete).toBe(1);
    expect(r.deleted).toBe(0);
    expect(r.preservedSingletonShape).toBe(0);
    expect(cm.rows.has('grid-credit-XXX')).toBe(true);
  });
});

// ─── Rule 6: workspace-referenced instances ──────────────────────────

describe('Rule 6 — workspace-referenced instances', () => {
  it('preserves a row whose configId is in some workspace.instanceIds', async () => {
    cm.rows.set('WS_a', row({
      configId: 'WS_a',
      componentType: COMPONENT_TYPES.WORKSPACE,
      payload: { instanceIds: ['inst-keep'] },
    }));
    cm.rows.set('inst-keep', row({
      configId: 'inst-keep', componentType: 'X', componentSubType: 'Y',
    }));
    cm.rows.set('inst-drop', row({
      configId: 'inst-drop', componentType: 'X', componentSubType: 'Y',
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    expect(r.preservedReferenced).toBe(1);
    // Deletion disabled — `inst-drop` is identified for would-delete
    // but stays in the store.
    expect(r.wouldDelete).toBe(1);
    expect(r.deleted).toBe(0);
    expect(cm.rows.has('inst-keep')).toBe(true);
    expect(cm.rows.has('inst-drop')).toBe(true);
  });
});

// ─── Default: orphans deleted ────────────────────────────────────────

describe('default — orphan rows identified but NOT deleted (deletion disabled)', () => {
  it('identifies an orphan as wouldDelete and leaves it in the store', async () => {
    cm.rows.set('orphan-uuid-123', row({
      configId: 'orphan-uuid-123',
      componentType: 'X', componentSubType: 'Y',
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    // `wouldDelete` reflects what the sweep would have reaped if armed;
    // `deleted` stays at 0 because DELETION_ENABLED === false.
    expect(r.wouldDelete).toBe(1);
    expect(r.deleted).toBe(0);
    expect(r.scanned).toBe(1);
    expect(cm.rows.has('orphan-uuid-123')).toBe(true);
  });
});

// ─── Scope filtering ─────────────────────────────────────────────────

describe('scope filtering', () => {
  it('ignores rows belonging to other appIds', async () => {
    cm.rows.set('other-app-row', row({
      configId: 'other-app-row',
      appId: 'OtherApp',
      componentType: 'X', componentSubType: 'Y',
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    expect(r.scanned).toBe(0);
    expect(cm.rows.has('other-app-row')).toBe(true);
  });

  it('ignores rows belonging to other userIds', async () => {
    cm.rows.set('other-user-row', row({
      configId: 'other-user-row',
      userId: 'someoneElse',
      componentType: 'X', componentSubType: 'Y',
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    expect(r.scanned).toBe(0);
    expect(cm.rows.has('other-user-row')).toBe(true);
  });
});

// ─── Counter accuracy / mixed scenario ───────────────────────────────

describe('counter accuracy across mixed scenarios', () => {
  it('reports correct counts for a heterogeneous batch', async () => {
    seedRegistry([{ configId: 'reg-singleton-X', singleton: true }]);

    // Workspace (skipped, not scanned)
    cm.rows.set('WS_w1', row({
      configId: 'WS_w1',
      componentType: COMPONENT_TYPES.WORKSPACE,
      payload: { instanceIds: ['ref-me'] },
    }));
    // Rule 2 — template
    cm.rows.set('tpl', row({ configId: 'tpl', isTemplate: true }));
    // Rule 3 — well-known
    cm.rows.set('dock-config', row({ configId: 'dock-config' }));
    // Rule 4 — registry singleton
    cm.rows.set('reg-singleton-X', row({
      configId: 'reg-singleton-X', componentType: 'A', componentSubType: 'B',
    }));
    // Rule 5 — singleton-shape
    cm.rows.set('grid-credit', row({
      configId: 'grid-credit', componentType: 'GRID', componentSubType: 'CREDIT',
    }));
    // Rule 6 — referenced
    cm.rows.set('ref-me', row({ configId: 'ref-me', componentType: 'A', componentSubType: 'B' }));
    // Default — orphan, deleted
    cm.rows.set('lonely', row({ configId: 'lonely', componentType: 'A', componentSubType: 'B' }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });

    expect(r.preservedTemplate).toBe(1);
    expect(r.preservedKnown).toBe(1);
    expect(r.preservedSingleton).toBe(1);
    expect(r.preservedSingletonShape).toBe(1);
    expect(r.preservedReferenced).toBe(1);
    // Deletion disabled — orphan is identified (wouldDelete=1) but kept.
    expect(r.wouldDelete).toBe(1);
    expect(r.deleted).toBe(0);
    // 6 non-workspace rows scanned (workspace is skipped pre-scan)
    expect(r.scanned).toBe(6);

    expect(cm.rows.has('lonely')).toBe(true);
    expect(cm.rows.has('tpl')).toBe(true);
    expect(cm.rows.has('dock-config')).toBe(true);
    expect(cm.rows.has('reg-singleton-X')).toBe(true);
    expect(cm.rows.has('grid-credit')).toBe(true);
    expect(cm.rows.has('ref-me')).toBe(true);
  });

  it('counts a row under the FIRST matching rule (rules are short-circuit ordered)', async () => {
    // Row is both `isTemplate: true` AND has `well-known` configId. Rule
    // order is template → well-known, so it should land in preservedTemplate.
    cm.rows.set('dock-config', row({
      configId: 'dock-config',
      isTemplate: true,
    }));

    const r = await gcOrphanedConfigs({ cm: cm as unknown as ConfigManager, appId: APP_ID, userId: USER_ID });
    expect(r.preservedTemplate).toBe(1);
    expect(r.preservedKnown).toBe(0);
  });
});
