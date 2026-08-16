import { describe, expect, it } from 'vitest';
import { COMPUTED_FIELDS_KEY, ExpressionEngine } from '@wellsfargo-starui/core';
import { ExpressionRuleStore } from './expressionRules.js';
import type { ExpressionRule } from './types.js';

/**
 * A fake `ExpressionEngine` whose `compile(expression)` looks the source up
 * in a fixed table instead of parsing real expression syntax. `ExpressionRuleStore`
 * only ever calls `.compile()` — it doesn't care what language produced the
 * closure — so this lets each test pin an exact return value (including a
 * plain object, which the real expression language has no literal syntax
 * for) or an exact throw, without fighting expression syntax to get there.
 * An expression string with no entry in the table throws from `compile()`
 * itself, modelling a genuinely invalid expression.
 */
function fakeEngine(
  table: Record<string, (ctx: { data: Record<string, unknown> }) => unknown>,
): ExpressionEngine {
  return {
    compile: (expression: string) => {
      const fn = table[expression];
      if (!fn) throw new Error(`[fakeEngine] no compiler registered for "${expression}"`);
      return fn;
    },
  } as unknown as ExpressionEngine;
}

function calcRule(id: string, field: string, expression: string): ExpressionRule {
  return { id, field, expression, kind: 'calculated' };
}

describe('ExpressionRuleStore', () => {
  describe('style rules', () => {
    it('merges an object return into __ssrmStyle', () => {
      const store = new ExpressionRuleStore(
        fakeEngine({ STYLE_OBJ: () => ({ backgroundColor: 'red', color: 'white' }) }),
      );
      store.configure([{ id: 's1', expression: 'STYLE_OBJ', kind: 'style' }]);
      const out = store.enrich({ id: 'a' });
      expect(out.__ssrmStyle).toEqual({ backgroundColor: 'red', color: 'white' });
    });

    it('treats a string return as backgroundColor', () => {
      const store = new ExpressionRuleStore(fakeEngine({ STYLE_STR: () => 'blue' }));
      store.configure([{ id: 's1', expression: 'STYLE_STR', kind: 'style' }]);
      const out = store.enrich({ id: 'a' });
      expect(out.__ssrmStyle).toEqual({ backgroundColor: 'blue' });
    });

    it('merges two style rules rather than letting the second clobber the first', () => {
      const store = new ExpressionRuleStore(
        fakeEngine({
          STYLE_OBJ: () => ({ backgroundColor: 'red' }),
          STYLE_STR: () => 'blue',
        }),
      );
      store.configure([
        { id: 's1', expression: 'STYLE_OBJ', kind: 'style' },
        { id: 's2', expression: 'STYLE_STR', kind: 'style' },
      ]);
      const out = store.enrich({ id: 'a' });
      // Second rule's backgroundColor (from the string branch) wins over the
      // first's object entry — same key, later rule applied later.
      expect(out.__ssrmStyle).toEqual({ backgroundColor: 'blue' });
    });
  });

  describe('alert rules', () => {
    it('keeps a truthy string return as the alert message', () => {
      const store = new ExpressionRuleStore(fakeEngine({ ALERT_STR: () => 'High risk' }));
      store.configure([{ id: 'a1', expression: 'ALERT_STR', kind: 'alert' }]);
      const out = store.enrich({ id: 'a' });
      expect(out.__ssrmAlert).toBe('High risk');
    });

    it('collapses a truthy non-string return to true', () => {
      const store = new ExpressionRuleStore(fakeEngine({ ALERT_NUM: () => 42 }));
      store.configure([{ id: 'a1', expression: 'ALERT_NUM', kind: 'alert' }]);
      const out = store.enrich({ id: 'a' });
      expect(out.__ssrmAlert).toBe(true);
    });

    it('leaves __ssrmAlert unset when the rule evaluates falsy', () => {
      const store = new ExpressionRuleStore(fakeEngine({ ALERT_FALSE: () => false }));
      store.configure([{ id: 'a1', expression: 'ALERT_FALSE', kind: 'alert' }]);
      const out = store.enrich({ id: 'a' });
      expect(out.__ssrmAlert).toBeUndefined();
    });
  });

  describe('editable rules', () => {
    it('a field-scoped rule populates the per-field editable map', () => {
      const store = new ExpressionRuleStore(fakeEngine({ EDIT_FIELD: () => true }));
      store.configure([{ id: 'e1', field: 'price', expression: 'EDIT_FIELD', kind: 'editable' }]);
      const out = store.enrich({ id: 'a' });
      expect(out.__ssrmEditable).toEqual({ price: true });
    });

    it('a fieldless rule sets row-level __ssrmEditable directly', () => {
      const store = new ExpressionRuleStore(fakeEngine({ EDIT_ROW: () => true }));
      store.configure([{ id: 'e1', expression: 'EDIT_ROW', kind: 'editable' }]);
      const out = store.enrich({ id: 'a' });
      expect(out.__ssrmEditable).toBe(true);
    });

    it('a row-level boolean wins over per-field entries when both are configured', () => {
      // Both an unscoped ("whole row") editable rule and a field-scoped one
      // fire in the same enrich() pass. The row-level boolean is set first
      // (directly on `out`); the merge step at the end of enrich() sees
      // `out.__ssrmEditable` is already a boolean and keeps it as-is rather
      // than folding the per-field map in — pinning current behaviour.
      const store = new ExpressionRuleStore(
        fakeEngine({ EDIT_ROW: () => true, EDIT_FIELD: () => true }),
      );
      store.configure([
        { id: 'e1', expression: 'EDIT_ROW', kind: 'editable' },
        { id: 'e2', field: 'price', expression: 'EDIT_FIELD', kind: 'editable' },
      ]);
      const out = store.enrich({ id: 'a' });
      expect(out.__ssrmEditable).toBe(true);
    });

    it('merges into a pre-existing __ssrmEditable object on the input row', () => {
      // The row arrives already carrying an object-shaped __ssrmEditable
      // (e.g. re-enriched from a prior tick). A field-scoped rule this pass
      // should fold into that object rather than replace it.
      const store = new ExpressionRuleStore(fakeEngine({ EDIT_FIELD: () => true }));
      store.configure([{ id: 'e1', field: 'qty', expression: 'EDIT_FIELD', kind: 'editable' }]);
      const out = store.enrich({ id: 'a', __ssrmEditable: { price: false } });
      expect(out.__ssrmEditable).toEqual({ price: false, qty: true });
    });
  });

  describe('per-row expression errors are swallowed', () => {
    it('a rule whose compiled fn throws leaves the row usable and later rules still run', () => {
      const store = new ExpressionRuleStore(
        fakeEngine({
          THROWS: () => {
            throw new Error('boom');
          },
          DOUBLE: (ctx) => (ctx.data.px as number) * 2,
        }),
      );
      store.configure([calcRule('bad', 'x', 'THROWS'), calcRule('good', 'y', 'DOUBLE')]);
      const out = store.enrich({ id: 'a', px: 5 });
      expect(out.x).toBeUndefined();
      expect(out.y).toBe(10);
    });
  });

  describe('compile-time errors are skipped at configure', () => {
    it('an unregistered/invalid expression is dropped, not thrown, and the row still enriches from the rest', () => {
      const store = new ExpressionRuleStore(
        fakeEngine({ DOUBLE: (ctx) => (ctx.data.px as number) * 2 }),
      );
      expect(() =>
        store.configure([calcRule('bad', 'z', 'BROKEN'), calcRule('good', 'y', 'DOUBLE')]),
      ).not.toThrow();
      const out = store.enrich({ id: 'a', px: 5 });
      expect(out.z).toBeUndefined();
      expect(out.y).toBe(10);
    });
  });

  describe('calculatedFields()', () => {
    it('reports fields from the global rule set, including for a session with no rules of its own', () => {
      const store = new ExpressionRuleStore(fakeEngine({ DOUBLE: () => 0 }));
      store.configure([
        calcRule('g1', 'g', 'DOUBLE'),
        { id: 's1', expression: 'DOUBLE', kind: 'style' }, // non-calculated, must be filtered out
      ]);
      expect(store.calculatedFields()).toEqual(['g']);
      expect(store.calculatedFields('anySession')).toEqual(['g']);
    });

    it('reports a session\'s own calculated fields instead of the global set', () => {
      const store = new ExpressionRuleStore(fakeEngine({ DOUBLE: () => 0, HALF: () => 0 }));
      store.configure([calcRule('g1', 'g', 'DOUBLE')]);
      store.configure([calcRule('s1', 's', 'HALF')], 'sessA');
      expect(store.calculatedFields('sessA')).toEqual(['s']);
      expect(store.calculatedFields()).toEqual(['g']);
    });
  });

  describe('session rule resolution', () => {
    it('a session configured with an empty rule set gets NO rules, even though global rules exist', () => {
      const store = new ExpressionRuleStore(fakeEngine({ DOUBLE: (ctx) => (ctx.data.px as number) * 2 }));
      store.configure([calcRule('g1', 'g', 'DOUBLE')]);
      store.configure([], 'sessA');

      const globalRow = store.enrich({ id: 'a', px: 10 });
      const sessARow = store.enrich({ id: 'a', px: 10 }, 'sessA');

      expect(globalRow.g).toBe(20);
      expect(sessARow.g).toBeUndefined();
      expect(store.calculatedFields('sessA')).toEqual([]);
    });

    it('clearSession drops a session\'s rules and falls back to global', () => {
      const store = new ExpressionRuleStore(fakeEngine({ DOUBLE: (ctx) => (ctx.data.px as number) * 2 }));
      store.configure([calcRule('g1', 'g', 'DOUBLE')]);
      store.configure([calcRule('s1', 's', 'DOUBLE')], 'sessA');
      expect(store.enrich({ id: 'a', px: 10 }, 'sessA').s).toBe(20);

      store.clearSession('sessA');

      const out = store.enrich({ id: 'a', px: 10 }, 'sessA');
      expect(out.s).toBeUndefined();
      expect(out.g).toBe(20);
    });
  });

  // ── Column-wide aggregates ────────────────────────────────────────────
  //
  // These use the REAL engine: what is under test is how the evaluator's
  // aggregate path (`evalOps.buildCallArgs`) resolves `[col]`, and the fake
  // engine's table of closures cannot express that.

  describe('aggregate calculated columns', () => {
    const store = () => new ExpressionRuleStore(new ExpressionEngine());
    const dataset = [{ px: 10 }, { px: 20 }, { px: 30 }];
    const scope = () => ({
      allRows: dataset,
      allRowsColumnCache: new Map<string, unknown[]>(),
      allRowsAggregateCache: new Map<string, unknown>(),
    });

    it('folds the WHOLE dataset, not the row it is enriching', () => {
      const s = store();
      s.configure([calcRule('c1', 'total', 'SUM([px])')]);
      // Same answer on every row — that is what "the same value at any
      // scroll position" means once these rows reach a grid.
      for (const row of dataset) {
        expect(s.enrich({ ...row }, undefined, scope()).total).toBe(60);
      }
    });

    it('without the scope it degrades to the row\'s own value — the defect', () => {
      // Pinned deliberately: this is what every SSRM block returned before
      // the scope existed, and it is indistinguishable from a correct total
      // on a one-row dataset.
      const s = store();
      s.configure([calcRule('c1', 'total', 'SUM([px])')]);
      expect(s.enrich({ px: 10 }).total).toBe(10);
    });

    it('reuses one column pass across every row of a block', () => {
      const s = store();
      s.configure([calcRule('c1', 'total', 'SUM([px])')]);
      const shared = scope();
      for (const row of dataset) s.enrich({ ...row }, undefined, shared);
      expect(shared.allRowsColumnCache.get('px')).toEqual([10, 20, 30]);
      expect(shared.allRowsColumnCache.size).toBe(1);
    });

    it('folds the column ONCE per block, not once per row', () => {
      // Memoising the column ARRAY without memoising the fold left every row
      // of a 100-row block re-reducing a 100,000-element array — 223 ms per
      // block, measured. The result cache is what makes it 1.7.
      const s = store();
      s.configure([calcRule('c1', 'total', 'SUM([px])')]);
      const shared = scope();
      s.enrich({ px: 10 }, undefined, shared);
      expect([...shared.allRowsAggregateCache.values()]).toEqual([60]);
    });

    it('caches the aggregate sub-call but not the row-local arithmetic around it', () => {
      const s = store();
      s.configure([calcRule('c1', 'share', '[px] / SUM([px])')]);
      const shared = scope();
      expect(s.enrich({ px: 30 }, undefined, shared).share).toBe(0.5);
      expect(s.enrich({ px: 10 }, undefined, shared).share).toBeCloseTo(1 / 6);
      expect([...shared.allRowsAggregateCache.values()]).toEqual([60]);
    });

    it('keeps two folds of the same column apart', () => {
      const s = store();
      s.configure([
        calcRule('c1', 'lo', 'MIN([px])'),
        calcRule('c2', 'hi', 'MAX([px])'),
      ]);
      const out = s.enrich({ px: 20 }, undefined, scope());
      expect(out.lo).toBe(10);
      expect(out.hi).toBe(30);
    });

    it('does not memoise a fold whose arguments are literals', () => {
      // `aggregateColumnRefs` is true for MIN, but `MIN(5, 2, 9)` is a plain
      // vararg reducer over its own arguments — nothing column-wide to cache.
      const s = store();
      s.configure([calcRule('c1', 'm', 'MIN(5, 2, 9)')]);
      const shared = scope();
      expect(s.enrich({ px: 1 }, undefined, shared).m).toBe(2);
      expect(shared.allRowsAggregateCache.size).toBe(0);
    });

    it('usesAggregates is per session and drives whether a scope is needed', () => {
      const s = store();
      s.configure([calcRule('g', 'g', '[px] * 2')]);
      s.configure([calcRule('a', 'a', 'AVG([px])')], 'sessA');
      expect(s.usesAggregates()).toBe(false);
      expect(s.usesAggregates('sessA')).toBe(true);
      // A session with no rules of its own inherits the global verdict.
      expect(s.usesAggregates('sessB')).toBe(false);
    });

    it('a row-local rule set never asks for a scope', () => {
      const s = store();
      s.configure([calcRule('c1', 'total', '[px] * 2')]);
      expect(s.usesAggregates()).toBe(false);
      expect(s.enrich({ px: 10 }).total).toBe(20);
    });
  });

  describe('computed-field stamp', () => {
    it('names the calculated fields it produced', () => {
      const s = new ExpressionRuleStore(fakeEngine({ DOUBLE: (ctx) => (ctx.data.px as number) * 2 }));
      s.configure([calcRule('c1', 'total', 'DOUBLE')]);
      expect(s.enrich({ px: 10 })[COMPUTED_FIELDS_KEY]).toEqual(['total']);
    });

    it('stamps nothing when no rule produces a field', () => {
      const s = new ExpressionRuleStore(fakeEngine({ RED: () => 'red' }));
      s.configure([{ id: 's1', expression: 'RED', kind: 'style' }]);
      expect(s.enrich({ px: 10 })[COMPUTED_FIELDS_KEY]).toBeUndefined();
    });

    it('omits a field whose expression failed to compile', () => {
      const s = new ExpressionRuleStore(fakeEngine({ OK: () => 1 }));
      s.configure([calcRule('c1', 'good', 'OK'), calcRule('c2', 'bad', 'UNREGISTERED')]);
      expect(s.enrich({ px: 10 })[COMPUTED_FIELDS_KEY]).toEqual(['good']);
    });

    it('is one shared array across rows, not a per-row allocation', () => {
      const s = new ExpressionRuleStore(fakeEngine({ DOUBLE: () => 1 }));
      s.configure([calcRule('c1', 'total', 'DOUBLE')]);
      expect(s.enrich({ px: 1 })[COMPUTED_FIELDS_KEY]).toBe(
        s.enrich({ px: 2 })[COMPUTED_FIELDS_KEY],
      );
    });
  });
});
