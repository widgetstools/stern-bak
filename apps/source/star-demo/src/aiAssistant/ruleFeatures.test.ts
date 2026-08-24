import { describe, expect, it } from 'vitest';
import { INDICATOR_ICONS } from '@wellsfargo-starui/core';
import {
  normalizeRuleFeatures,
  DIRECTION_ICON_KEYS,
  INDICATOR_ICON_KEYS,
} from './ruleFeatures';
import type { RuleScope } from '@wellsfargo-starui/core';

const CELL: RuleScope = { type: 'cell', columns: ['marketValue'] };
const ROW: RuleScope = { type: 'row' };

/**
 * `ruleFeatures.ts` copies the engine's icon catalog instead of importing it
 * (see the note there — it would pull the customizer engine into a window
 * that mounts no grid). This is the guard that makes the copy safe: the real
 * catalog is imported HERE, where the cost is paid once, in a test.
 */
describe('icon catalog parity with @wellsfargo-starui/core', () => {
  it('lists exactly the engine\'s icon keys', () => {
    expect([...INDICATOR_ICON_KEYS].sort()).toEqual(INDICATOR_ICONS.map((i) => i.key).sort());
  });

  it('lists exactly the engine\'s direction-group keys', () => {
    const fromEngine = INDICATOR_ICONS.filter((i) => i.group === 'direction').map((i) => i.key);
    expect([...DIRECTION_ICON_KEYS].sort()).toEqual(fromEngine.sort());
  });
});

describe('normalizeRuleFeatures', () => {
  it('returns nothing when no rich fields are supplied', () => {
    const res = normalizeRuleFeatures({ name: 'plain' }, CELL);
    expect(res).toEqual({ ok: true, features: {} });
  });

  it('accepts the tick-arrow shape end to end', () => {
    const res = normalizeRuleFeatures(
      {
        activeDurationMs: 700,
        indicator: { icon: 'arrow-up', color: '#16a34a', target: 'cells', position: 'right-middle' },
      },
      CELL,
    );
    expect(res).toEqual({
      ok: true,
      features: {
        activeDurationMs: 700,
        indicator: { icon: 'arrow-up', color: '#16a34a', target: 'cells', position: 'right-middle' },
      },
    });
  });

  it('defaults flash.enabled and picks a scope-appropriate target', () => {
    expect(normalizeRuleFeatures({ flash: { color: 'emerald' } }, CELL)).toEqual({
      ok: true,
      features: { flash: { enabled: true, target: 'cells', color: 'emerald' } },
    });
    expect(normalizeRuleFeatures({ flash: {} }, ROW)).toEqual({
      ok: true,
      features: { flash: { enabled: true, target: 'row' } },
    });
  });

  it('rejects a flash target that contradicts the rule scope', () => {
    const res = normalizeRuleFeatures({ flash: { target: 'row' } }, CELL);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('row-scope rule');
  });

  it('rejects an unknown icon and names the direction icons in the error', () => {
    const res = normalizeRuleFeatures({ indicator: { icon: 'arrow-upwards' } }, CELL);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('arrow-up');
  });

  it('rejects a non-positive active window', () => {
    for (const bad of [0, -1, 'soon']) {
      const res = normalizeRuleFeatures({ activeDurationMs: bad }, CELL);
      expect(res.ok).toBe(false);
    }
  });

  it('rejects an out-of-palette flash colour', () => {
    const res = normalizeRuleFeatures({ flash: { color: '#ff0000' } }, CELL);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toContain('amber');
  });

  it('rounds fractional durations the runtime would floor anyway', () => {
    const res = normalizeRuleFeatures({ activeDurationMs: 699.6 }, CELL);
    expect(res.ok === true && res.features.activeDurationMs).toBe(700);
  });
});
