/**
 * Phase T1 contract tests: every golden fixture's `expected` is the CLIENT
 * evaluator's output (semantics pin), and its `compiles` flag is the
 * compiler's verdict (grammar pin). The same fixture file is the corpus
 * the rangrez WASM engine must reproduce when T3 lands — if a fixture
 * changes here, the engine contract changed, on the record.
 */
import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from './index';
import {
  classifySsrmExpression,
  compileToEngineExpression,
  toComputedColumnSpec,
} from './compileToEngineExpression';
import fixtures from './ssrmExpressionContract.fixtures.json';

interface Fixture {
  name: string;
  source: string;
  row?: Record<string, unknown>;
  allRows?: Array<Record<string, unknown>>;
  expected?: unknown;
  compiles: boolean;
  requires?: string[];
}

const engine = new ExpressionEngine();

function evaluate(f: Fixture): unknown {
  const ast = engine.parse(f.source);
  const data = f.row ?? {};
  return engine.evaluate(ast, {
    x: null,
    value: null,
    data,
    columns: data,
    ...(f.allRows ? { allRows: f.allRows } : {}),
  });
}

describe('SSRM expression contract v1 (golden fixtures)', () => {
  for (const f of (fixtures as { cases: Fixture[] }).cases) {
    it(f.name, () => {
      // Semantics pin — the client evaluator IS the contract's semantics.
      if ('expected' in f) {
        expect(evaluate(f)).toEqual(f.expected);
      }

      // Grammar pin — compiles exactly when the fixture says so, and an
      // uncompilable expression is REPORTED, never silently dropped.
      const result = compileToEngineExpression(engine.parse(f.source));
      if (f.compiles) {
        expect(result.expr, result.untranslatable.join('; ')).not.toBeNull();
        expect(result.untranslatable).toEqual([]);
        expect(result.requires.sort()).toEqual([...(f.requires ?? [])].sort());
      } else {
        expect(result.expr).toBeNull();
        expect(result.untranslatable.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('compileToEngineExpression wire shapes', () => {
  const parse = (s: string) => engine.parse(s);

  it('lowers the operator zoo to the wire ops', () => {
    const { expr } = compileToEngineExpression(parse('([a] + [b]) * 2 >= 10 AND NOT ([c] == null)'));
    expect(expr).toEqual({
      k: 'bin',
      op: 'and',
      l: {
        k: 'bin',
        op: 'ge',
        l: { k: 'bin', op: 'mul', l: { k: 'bin', op: 'add', l: { k: 'col', name: 'a' }, r: { k: 'col', name: 'b' } }, r: { k: 'lit', v: 2 } },
        r: { k: 'lit', v: 10 },
      },
      r: { k: 'un', op: 'not', a: { k: 'bin', op: 'eq', l: { k: 'col', name: 'c' }, r: { k: 'lit', v: null } } },
    });
  });

  it('lowers ternary to a cond node and IN/BETWEEN to their node forms', () => {
    expect(compileToEngineExpression(parse('[a] > 0 ? 1 : 2')).expr).toEqual({
      k: 'cond',
      branches: [{ when: { k: 'bin', op: 'gt', l: { k: 'col', name: 'a' }, r: { k: 'lit', v: 0 } }, then: { k: 'lit', v: 1 } }],
      else: { k: 'lit', v: 2 },
    });
    expect(compileToEngineExpression(parse("[s] IN ['x','y']")).expr).toEqual({
      k: 'in',
      a: { k: 'col', name: 's' },
      list: [{ k: 'lit', v: 'x' }, { k: 'lit', v: 'y' }],
    });
    expect(compileToEngineExpression(parse('[a] BETWEEN 1 AND 5')).expr).toEqual({
      k: 'between',
      a: { k: 'col', name: 'a' },
      lo: { k: 'lit', v: 1 },
      hi: { k: 'lit', v: 5 },
    });
  });

  it('lowers SUM([col]) to an agg node but keeps scalar MIN(a,b) a fn', () => {
    expect(compileToEngineExpression(parse('SUM([mv])')).expr).toEqual({ k: 'agg', fn: 'sum', col: 'mv' });
    expect(compileToEngineExpression(parse('MIN([a], [b])')).expr).toEqual({
      k: 'fn',
      name: 'MIN',
      args: [{ k: 'col', name: 'a' }, { k: 'col', name: 'b' }],
    });
  });

  it('builds a versioned computed-column spec, or null when uncompilable', () => {
    expect(toComputedColumnSpec('ratio', parse('[pnl] / [mv]'))).toEqual({
      as: 'ratio',
      version: 1 as const,
      expr: { k: 'bin', op: 'div', l: { k: 'col', name: 'pnl' }, r: { k: 'col', name: 'mv' } },
    });
    expect(toComputedColumnSpec('bad', parse('MEDIAN([mv])'))).toBeNull();
  });

  it('reports a malformed AST instead of throwing', () => {
    const result = compileToEngineExpression({ type: 'nonsense' });
    expect(result.expr).toBeNull();
    expect(result.untranslatable[0]).toMatch(/node type/);
  });
});

describe('classifySsrmExpression', () => {
  const classify = (s: string) => classifySsrmExpression(engine.parse(s));

  it('row-local grammar expression → compiled, no requirements', () => {
    expect(classify('[price] * [qty]')).toEqual({
      tier: 'compiled',
      requires: [],
      engineAggregates: [],
      loadedRowAggregates: [],
      untranslatable: [],
    });
  });

  it('engine-aggregate expression → compiled, requires aggregates (T4)', () => {
    const c = classify('[mv] / SUM([mv])');
    expect(c.tier).toBe('compiled');
    expect(c.requires).toEqual(['aggregates']);
    expect(c.engineAggregates).toEqual(['SUM']);
  });

  it('date-part expression → compiled, requires dateFns (T6)', () => {
    expect(classify('YEAR([maturity]) > 2030').requires).toEqual(['dateFns']);
  });

  it('outside-grammar but row-local → materialized', () => {
    const c = classify("REGEX_MATCH([s], '^G')");
    expect(c.tier).toBe('materialized');
    expect(c.untranslatable[0]).toMatch(/REGEX_MATCH/);
  });

  it('loaded-rows aggregate → unsupported, whatever else it contains', () => {
    const c = classify('[px] - MEDIAN([px])');
    expect(c.tier).toBe('unsupported');
    expect(c.loadedRowAggregates).toEqual(['MEDIAN']);
  });
});
