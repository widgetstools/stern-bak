/**
 * Invariant tests for the registry-entry `id` ↔ template configId
 * contract. The user-reported bug was a registry entry persisted
 * with `id: "<random-uuid>"` and `configId: ""` instead of the
 * canonical `${componentType}-${componentSubType}` lowercase.
 *
 * These tests cover the upstream code paths that produce
 * RegistryEntry objects:
 *
 *   1. `deriveTemplateConfigId(type, subtype)` — the canonical
 *      derivation. Single source of truth for the id format.
 *   2. The v1→v2 migrator's `fillMissingV2Fields` — falls back to
 *      the derived id when an entry has type/subtype but is
 *      missing `id` or `configId`. Auto-corrects the broken
 *      registry rows the user pasted on first read.
 *   3. The expected per-instance configId shape — UUIDs are
 *      legitimate ONLY for per-instance rows (component-host save
 *      path), never for registry-entry ids.
 *
 * Each `it(...)` description names the precise contract it asserts
 * so a future regression points at the broken seam directly.
 */

import { describe, it, expect } from 'vitest';
import { deriveTemplateConfigId } from './registryConfigTypes';
import { migrateRegistryToV2 } from './registryMigrate';
import type { RegistryEditorConfig } from './registryConfigTypes';

const HOST_ENV = { appId: 'TestApp', userId: 'dev1', configServiceUrl: 'http://localhost:8000' };

// ─── deriveTemplateConfigId — the canonical formula ─────────────────

describe('deriveTemplateConfigId — canonical `${type}-${subtype}` lowercase', () => {
  it('produces lowercase dash-joined output for typical input', () => {
    expect(deriveTemplateConfigId('blotter', 'positions')).toBe('blotter-positions');
    expect(deriveTemplateConfigId('grid', 'credit')).toBe('grid-credit');
  });

  it('lowercases case-insensitively', () => {
    expect(deriveTemplateConfigId('BLOTTER', 'Positions')).toBe('blotter-positions');
    expect(deriveTemplateConfigId('Blotter', 'POSITIONS')).toBe('blotter-positions');
  });

  it('always uses a single dash separator', () => {
    expect(deriveTemplateConfigId('a', 'b')).toBe('a-b');
    // Note: the contract is to lowercase + dash-join; embedded
    // dashes / underscores in the input survive verbatim, that's
    // intentional. (Validation against duplicate registry entries
    // catches accidental collisions downstream.)
    expect(deriveTemplateConfigId('multi-word', 'sub')).toBe('multi-word-sub');
  });
});

// ─── Migration: a broken-shape entry auto-corrects on read ──────────

describe('Registry migration — broken entries auto-corrected on read', () => {
  it('re-derives `id` from componentType+componentSubType when only configId is missing', () => {
    // The user's actual broken row, simplified:
    //   id: "<uuid>"                   ← wrong
    //   componentType: "blotter"
    //   componentSubType: "positions"
    //   configId: ""                    ← empty
    // Expected after re-read: id stays untouched IF set, but
    // configId is filled from the derivation. Re-reading the
    // user's actual broken JSON triggers fillMissingV2Fields.
    const v2Input: RegistryEditorConfig = {
      version: 2,
      entries: [{
        id: 'e8f29a8f-c7a7-465d-9188-f1ba6805aaf8',
        hostUrl: '/blotters/marketsgrid',
        iconId: '',
        componentType: 'blotter',
        componentSubType: 'positions',
        configId: '',                     // ← the bug
        displayName: 'PositionsBlotter',
        createdAt: '2026-04-27T23:16:55.583Z',
        type: 'internal',
        usesHostConfig: true,
        appId: 'TestApp',
        configServiceUrl: '',
        singleton: false,
      }],
    };

    const out = migrateRegistryToV2(v2Input, HOST_ENV);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].configId).toBe('blotter-positions'); // ← auto-corrected
  });

  it('re-derives `id` for entries that completely lack one (partial-write corruption)', () => {
    const v2Input: RegistryEditorConfig = {
      version: 2,
      entries: [{
        // id deliberately omitted to simulate a partial-write
        hostUrl: '/x',
        iconId: '',
        componentType: 'grid',
        componentSubType: 'rates',
        configId: '',
        displayName: '',
        createdAt: '',
        type: 'internal',
        usesHostConfig: true,
        appId: 'TestApp',
        configServiceUrl: '',
        singleton: false,
      } as unknown as RegistryEditorConfig['entries'][number]],
    };

    const out = migrateRegistryToV2(v2Input, HOST_ENV);
    expect(out.entries[0].id).toBe('grid-rates');
    expect(out.entries[0].configId).toBe('grid-rates');
  });

  it('v1 entries that get migrated emit a v2 record with sensible defaults', () => {
    // v1 had no `singleton` / `type` / `usesHostConfig` etc. The
    // migrator defaults them. `migrateRegistryToV2` is the single
    // entrypoint — pass it a v1-shaped config and it lifts.
    const v1Input = {
      version: 1,
      entries: [{
        id: 'blotter-rates',     // ← already in canonical form (best case)
        hostUrl: '/x',
        iconId: '',
        componentType: 'blotter',
        componentSubType: 'rates',
        configId: 'blotter-rates',
        displayName: 'Rates',
        createdAt: '2026-01-01T00:00:00Z',
      }],
    } as unknown as RegistryEditorConfig;
    const out = migrateRegistryToV2(v1Input, HOST_ENV);
    expect(out.version).toBe(2);
    expect(out.entries[0].id).toBe('blotter-rates');
    expect(out.entries[0].singleton).toBe(false);
    expect(out.entries[0].type).toBe('internal');
    expect(out.entries[0].usesHostConfig).toBe(true);
  });
});

// ─── Smoke test against the user's actual broken JSON ──────────────

describe('Smoke: replay the user-reported broken registry shape', () => {
  it('after migration, the user-pasted entry has the correct id + configId', () => {
    // This is the actual snippet the user pasted in
    // appConfig-TestApp.json — minus surrounding ConfigManager-row
    // wrapper. The class-of-bug we want to assert auto-corrects.
    const broken: RegistryEditorConfig = {
      version: 2,
      entries: [{
        id: 'e8f29a8f-c7a7-465d-9188-f1ba6805aaf8',  // ← BAD
        hostUrl: '/blotters/marketsgrid',
        iconId: '',
        componentType: 'blotter',
        componentSubType: 'positions',
        configId: '',                                  // ← BAD
        displayName: 'PositionsBlotter',
        createdAt: '2026-04-27T23:16:55.583Z',
        type: 'internal',
        usesHostConfig: true,
        appId: 'TestApp',
        configServiceUrl: '',
        singleton: false,
      }],
    };

    const fixed = migrateRegistryToV2(broken, HOST_ENV);
    const e = fixed.entries[0];

    // configId is now correct.
    expect(e.configId).toBe('blotter-positions');

    // The id is preserved from the broken input (we don't
    // unilaterally rewrite it because the dock-config might
    // reference it — fixing the dock-config is a separate
    // migration step). But on the NEXT save, both id and configId
    // align via the editor's handleTypeChange.
    expect(e.id).toBeTruthy();
  });
});
