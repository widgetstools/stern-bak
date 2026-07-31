import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '../platform/GridPlatform';
import { MemoryAdapter } from '../persistence/MemoryAdapter';
import type { Module } from '../platform/types';
import { ProfileManager } from '../profiles/ProfileManager';
import {
  __resetExpressionPolicyForTests,
  configureExpressionPolicy,
} from './expressionPolicy';
import type { ExportedProfilePayload } from '../profiles/types';

/**
 * Integration tests for the expression-policy gate in
 * `ProfileManager.import`. Verifies that strict-mode rejects unsafe
 * payloads before any storage write, that `sanitize: true` strips the
 * offending templates, and that allow / warn modes leave imports
 * untouched.
 */

interface StyleState {
  rules: Array<{ id: string; valueFormatter?: { kind: string; expression?: string } }>;
}

function makeStyleModule(): Module<StyleState> {
  return {
    id: 'style',
    name: 'Style',
    schemaVersion: 1,
    priority: 10,
    getInitialState: () => ({ rules: [] }),
    serialize: (s) => s,
    deserialize: (raw) => {
      if (!raw || typeof raw !== 'object') return { rules: [] };
      const r = (raw as { rules?: unknown }).rules;
      return Array.isArray(r) ? { rules: r as StyleState['rules'] } : { rules: [] };
    },
  };
}

function makeManager() {
  const adapter = new MemoryAdapter();
  const platform = new GridPlatform({ gridId: 'g1', modules: [makeStyleModule()] });
  const manager = new ProfileManager({ platform, adapter, disableAutoSave: true });
  return { adapter, platform, manager };
}

function payloadWithExpression(): ExportedProfilePayload {
  return {
    schemaVersion: 1,
    kind: 'gc-profile',
    exportedAt: new Date().toISOString(),
    profile: {
      name: 'Imported',
      gridId: 'g1',
      state: {
        style: {
          v: 1,
          data: {
            rules: [
              { id: 'r1', valueFormatter: { kind: 'expression', expression: "x+'bp'" } },
            ],
          },
        },
      },
    },
  };
}

function cleanPayload(): ExportedProfilePayload {
  return {
    schemaVersion: 1,
    kind: 'gc-profile',
    exportedAt: new Date().toISOString(),
    profile: {
      name: 'Clean',
      gridId: 'g1',
      state: {
        style: {
          v: 1,
          data: {
            rules: [
              { id: 'r1', valueFormatter: { kind: 'preset' } },
            ],
          },
        },
      },
    },
  };
}

describe('ProfileManager.import — expression policy gate', () => {
  afterEach(() => __resetExpressionPolicyForTests());

  describe('allow mode (default)', () => {
    beforeEach(() => configureExpressionPolicy({ mode: 'allow' }));

    it('imports payloads containing expression templates without complaint', async () => {
      const { manager, adapter } = makeManager();
      await manager.boot();
      const meta = await manager.import(payloadWithExpression());
      const saved = await adapter.loadProfile('g1', meta.id);
      expect(saved).toBeTruthy();
      const rules = (saved!.state.style.data as { rules: Array<{ valueFormatter: { kind: string } }> }).rules;
      expect(rules[0].valueFormatter.kind).toBe('expression');
    });
  });

  describe('warn mode', () => {
    beforeEach(() => {
      const observer = vi.fn();
      configureExpressionPolicy({ mode: 'warn', onViolation: observer });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => vi.restoreAllMocks());

    it('imports payloads unchanged but fires the observer', async () => {
      const observer = vi.fn();
      configureExpressionPolicy({ mode: 'warn', onViolation: observer });

      const { manager, adapter } = makeManager();
      await manager.boot();
      const meta = await manager.import(payloadWithExpression());

      expect(observer).toHaveBeenCalled();
      const kind = observer.mock.calls[0][0].kind;
      expect(kind).toBe('profileImport');
      const saved = await adapter.loadProfile('g1', meta.id);
      const rules = (saved!.state.style.data as { rules: Array<{ valueFormatter: { kind: string } }> }).rules;
      // Still expression — warn mode doesn't rewrite.
      expect(rules[0].valueFormatter.kind).toBe('expression');
    });
  });

  describe('strict mode', () => {
    it('rejects the import and writes nothing to storage', async () => {
      configureExpressionPolicy({ mode: 'strict' });
      const { manager, adapter } = makeManager();
      await manager.boot();

      await expect(manager.import(payloadWithExpression())).rejects.toThrow(
        /strict expression policy/i,
      );

      // Storage contains only the auto-created Default profile.
      const list = await adapter.listProfiles('g1');
      expect(list.find((p) => p.name === 'Imported')).toBeUndefined();
    });

    it('fires the onViolation observer before throwing', async () => {
      const observer = vi.fn();
      configureExpressionPolicy({ mode: 'strict', onViolation: observer });

      const { manager } = makeManager();
      await manager.boot();
      await expect(manager.import(payloadWithExpression())).rejects.toThrow();

      expect(observer).toHaveBeenCalledOnce();
      expect(observer.mock.calls[0][0]).toMatchObject({
        kind: 'profileImport',
        expression: "x+'bp'",
      });
    });

    it('accepts clean payloads under strict mode', async () => {
      configureExpressionPolicy({ mode: 'strict' });
      const { manager, adapter } = makeManager();
      await manager.boot();

      const meta = await manager.import(cleanPayload());
      const saved = await adapter.loadProfile('g1', meta.id);
      expect(saved).toBeTruthy();
      expect(saved!.name).toBe('Clean');
    });

    it('with sanitize:true, rewrites expression templates and completes the import', async () => {
      const observer = vi.fn();
      configureExpressionPolicy({ mode: 'strict', onViolation: observer });

      const { manager, adapter } = makeManager();
      await manager.boot();

      const meta = await manager.import(payloadWithExpression(), { sanitize: true });

      const saved = await adapter.loadProfile('g1', meta.id);
      expect(saved).toBeTruthy();
      const rules = (saved!.state.style.data as {
        rules: Array<{ valueFormatter: { kind: string; preset?: string } }>;
      }).rules;
      expect(rules[0].valueFormatter.kind).toBe('preset');
      expect(rules[0].valueFormatter.preset).toBe('number');
      expect(observer.mock.calls[0][0].reason).toMatch(/sanitized/i);
    });
  });
});
