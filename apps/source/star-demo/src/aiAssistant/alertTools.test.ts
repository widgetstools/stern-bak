import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataProviderConfigStore } from '@wellsfargo-starui/data';

const ENTRY = {
  id: 'grid-axe', configId: 'grid-axe', componentType: 'grid', componentSubType: 'axe',
  displayName: 'Axe Blotter', hostUrl: '', iconId: '', createdAt: '',
  type: 'internal' as const, usesHostConfig: true, appId: 'Star-Demo', configServiceUrl: '',
  singleton: true, asWindow: true,
};

const mockLoadRegistryConfig = vi.fn();
vi.mock('@wellsfargo-starui/openfin/config', () => ({
  loadRegistryConfig: (...args: unknown[]) => mockLoadRegistryConfig(...args),
}));

const CATALOGUE = [
  { colId: 'bidAskWidthBps', headerName: 'Spread' },
  { colId: 'marketValue', headerName: 'Market Value' },
];
vi.mock('./columnResolver', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readColumnCatalogue: async () => CATALOGUE,
}));

import { createAlert } from './alertTools';

/** Captures what `patchGridModule` would have written. */
let written: Record<string, unknown> | undefined;
function fakeManager() {
  written = undefined;
  return {
    profiles: {
      list: vi.fn(async () => [
        { id: '__default__', name: 'Default', gridId: 'grid-axe', state: {}, createdAt: 1, updatedAt: 1 },
      ]),
      save: vi.fn(async (_scope: unknown, snap: { state: Record<string, { data: unknown }> }) => {
        written = snap.state['alerts']?.data as Record<string, unknown>;
      }),
      loadGridLevelData: vi.fn(async () => ({})),
      saveGridLevelData: vi.fn(),
    },
    findByComponentType: vi.fn().mockResolvedValue([]),
    getConfig: vi.fn(),
  } as unknown as ConfigManager;
}
const store = {} as DataProviderConfigStore;

interface Rule {
  id: string; name: string; severity: string; message: string;
  channels: string[]; debounceMs: number; enabled: boolean;
  trigger: Record<string, unknown>;
}
function rules(): Rule[] {
  return (written?.rules ?? []) as Rule[];
}

beforeEach(() => {
  mockLoadRegistryConfig.mockReset().mockResolvedValue({ version: 2, entries: [ENTRY] });
});

describe('create_alert', () => {
  it('compiles a threshold into an expression the evaluator can run', async () => {
    const res = await createAlert(fakeManager(), store, {
      targetGridId: 'grid-axe', name: 'Spread blew out',
      column: 'Spread', operator: 'gt', value: 50,
    });
    expect(res.ok).toBe(true);
    expect(rules()[0].trigger).toEqual({
      kind: 'dataChange', expression: 'value > 50', column: 'bidAskWidthBps',
    });
  });

  /**
   * The bug this tool exists to make unreachable. The alerts feature guide
   * documented `{ operator, value }`, but `evaluateDataChangeRule` calls
   * `parseAndEvaluate(trigger.expression, …)` and swallows the throw — so such
   * a rule saved cleanly, listed normally and never fired.
   */
  it('never emits the operator/value trigger shape that silently never fires', async () => {
    await createAlert(fakeManager(), store, {
      targetGridId: 'grid-axe', name: 'x', column: 'Spread', operator: 'gte', value: 10,
    });
    const trigger = rules()[0].trigger;
    expect(trigger.expression).toBeTypeOf('string');
    expect(trigger).not.toHaveProperty('operator');
    expect(trigger).not.toHaveProperty('value');
  });

  it('quotes a non-numeric threshold so it is not read as a column reference', async () => {
    await createAlert(fakeManager(), store, {
      targetGridId: 'grid-axe', name: 'Downgrades', column: 'marketValue', operator: 'eq', value: 'CCC',
    });
    expect(rules()[0].trigger.expression).toBe('value == "CCC"');
  });

  it('compiles a relative move', async () => {
    await createAlert(fakeManager(), store, {
      targetGridId: 'grid-axe', name: 'Big mover',
      column: 'Market Value', movesBy: 5, mode: 'percent', direction: 'down',
    });
    expect(rules()[0].trigger).toEqual({
      kind: 'relativeChange', column: 'marketValue',
      mode: 'PERCENT_CHANGE', threshold: 5, direction: 'down',
    });
  });

  it('drops the threshold for an any-change alert', async () => {
    await createAlert(fakeManager(), store, {
      targetGridId: 'grid-axe', name: 'Any tick', column: 'marketValue', mode: 'any',
    });
    expect(rules()[0].trigger).toEqual({
      kind: 'relativeChange', column: 'marketValue', mode: 'ANY_CHANGE', direction: 'both',
    });
  });

  it('compiles a row event', async () => {
    await createAlert(fakeManager(), store, {
      targetGridId: 'grid-axe', name: 'New axe', rowEvent: 'added',
    });
    expect(rules()[0].trigger).toEqual({ kind: 'rowChange', event: 'ROW_ADDED' });
  });

  it('passes a raw expression through, scoped to the column when given', async () => {
    await createAlert(fakeManager(), store, {
      targetGridId: 'grid-axe', name: 'Crossed', column: 'Spread', expression: '[bid] > [ask]',
    });
    expect(rules()[0].trigger).toEqual({
      kind: 'dataChange', expression: '[bid] > [ask]', column: 'bidAskWidthBps',
    });
  });

  it('resolves the column the way the user said it', async () => {
    await createAlert(fakeManager(), store, {
      targetGridId: 'grid-axe', name: 'a', column: 'market value', operator: 'lt', value: 0,
    });
    expect((rules()[0].trigger as { column: string }).column).toBe('marketValue');
  });

  describe('defaults', () => {
    it('reaches every channel and debounces slower than the module default', async () => {
      await createAlert(fakeManager(), store, {
        targetGridId: 'grid-axe', name: 'a', column: 'Spread', operator: 'gt', value: 1,
      });
      const rule = rules()[0];
      // `openfin` is a no-op outside OpenFin, so leaving it on costs nothing
      // and is what lets an alert reach someone not looking at the blotter.
      expect(rule.channels).toEqual(['toast', 'badge', 'openfin']);
      expect(rule.debounceMs).toBe(5000);
      expect(rule.severity).toBe('warning');
      expect(rule.enabled).toBe(true);
    });

    it('writes a message with placeholders rather than leaving it blank', async () => {
      await createAlert(fakeManager(), store, {
        targetGridId: 'grid-axe', name: 'a', column: 'Spread', operator: 'gt', value: 1,
      });
      expect(rules()[0].message).toContain('{value}');
    });
  });

  describe('refusals', () => {
    it('refuses when no trigger was described', async () => {
      const res = await createAlert(fakeManager(), store, { targetGridId: 'grid-axe', name: 'a' });
      expect(res.ok).toBe(false);
      expect(res.summary).toMatch(/Nothing to alert on/);
    });

    it('refuses two triggers at once rather than picking one', async () => {
      const res = await createAlert(fakeManager(), store, {
        targetGridId: 'grid-axe', name: 'a', column: 'Spread',
        operator: 'gt', value: 1, movesBy: 5,
      });
      expect(res.ok).toBe(false);
      expect(res.summary).toMatch(/only one trigger/i);
    });

    it('refuses a threshold missing half of itself', async () => {
      const res = await createAlert(fakeManager(), store, {
        targetGridId: 'grid-axe', name: 'a', column: 'Spread', operator: 'gt',
      });
      expect(res.ok).toBe(false);
      expect(res.summary).toMatch(/needs both operator and value/);
    });

    it('refuses a column it cannot resolve', async () => {
      const res = await createAlert(fakeManager(), store, {
        targetGridId: 'grid-axe', name: 'a', column: 'nope', operator: 'gt', value: 1,
      });
      expect(res.ok).toBe(false);
      expect(res.summary).toMatch(/No column matching/);
    });

    it('refuses an empty channel list — an alert with nowhere to go', async () => {
      const res = await createAlert(fakeManager(), store, {
        targetGridId: 'grid-axe', name: 'a', column: 'Spread', operator: 'gt', value: 1, channels: [],
      });
      expect(res.ok).toBe(false);
    });

    it('refuses an unregistered grid', async () => {
      const res = await createAlert(fakeManager(), store, {
        targetGridId: 'nope', name: 'a', rowEvent: 'added',
      });
      expect(res.ok).toBe(false);
      expect(res.summary).toMatch(/No grid registered/);
    });
  });

  it('replaces a rule of the same name rather than stacking duplicates', async () => {
    const cm = fakeManager();
    await createAlert(cm, store, { targetGridId: 'grid-axe', name: 'Dupe', column: 'Spread', operator: 'gt', value: 1 });
    expect(rules()).toHaveLength(1);
    expect(rules()[0].id).toBe('alert-dupe');
  });
});

/**
 * Closes the loop the guide bug left open: it is not enough that the trigger
 * has the right SHAPE — the expression has to actually evaluate. This runs what
 * `create_alert` produced through the same engine `evaluateDataChangeRule`
 * calls, with the same context (`{ x, value, data }`), so a rule that saves but
 * never fires would fail here.
 */
describe('the compiled expression really evaluates', () => {
  async function expressionFor(args: Record<string, unknown>): Promise<string> {
    await createAlert(fakeManager(), store, { targetGridId: 'grid-axe', name: 'a', ...args });
    return (rules()[0].trigger as { expression: string }).expression;
  }

  it('a numeric threshold fires above it and stays quiet below', async () => {
    const { ExpressionEngine } = await import('@wellsfargo-starui/core');
    const engine = new ExpressionEngine();
    const expr = await expressionFor({ column: 'Spread', operator: 'gt', value: 50 });
    const evalWith = (v: unknown) => engine.parseAndEvaluate(expr, { x: v, value: v, data: {}, columns: {} });
    expect(evalWith(75)).toBeTruthy();
    expect(evalWith(25)).toBeFalsy();
  });

  it('a quoted threshold compares as a string instead of resolving a column', async () => {
    const { ExpressionEngine } = await import('@wellsfargo-starui/core');
    const engine = new ExpressionEngine();
    const expr = await expressionFor({ column: 'marketValue', operator: 'eq', value: 'CCC' });
    const evalWith = (v: unknown) => engine.parseAndEvaluate(expr, { x: v, value: v, data: {}, columns: {} });
    expect(evalWith('CCC')).toBeTruthy();
    expect(evalWith('AAA')).toBeFalsy();
  });

  /** The shape the guide used to teach: no expression at all to evaluate. */
  it('the old operator/value rule had nothing to evaluate', async () => {
    const { ExpressionEngine } = await import('@wellsfargo-starui/core');
    const engine = new ExpressionEngine();
    const legacyTrigger = { kind: 'dataChange', column: 'bidAskWidthBps', operator: 'greaterThan', value: 50 } as {
      expression?: string;
    };
    expect(legacyTrigger.expression).toBeUndefined();
    expect(() =>
      engine.parseAndEvaluate(legacyTrigger.expression as unknown as string, { x: 75, value: 75, data: {}, columns: {} }),
    ).toThrow();
  });
});
