import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from './index';
import { tryCompileToAgString, tryCompileToPerspectiveExpression } from './compiler';
import type { ExpressionNode } from './types';

describe('tryCompileToAgString', () => {
  const engine = new ExpressionEngine();

  it('compiles simple comparisons on x', () => {
    const node = engine.parse('x > 100');
    expect(tryCompileToAgString(node)).toBe('x > 100');
  });

  it('compiles AND/OR/NOT and arithmetic', () => {
    expect(tryCompileToAgString(engine.parse('x > 0 AND x < 10'))).toBe('(x > 0) && (x < 10)');
    expect(tryCompileToAgString(engine.parse('NOT x == 0'))).toBe('!(x) == 0');
    expect(tryCompileToAgString(engine.parse('(x + 1) * 2'))).toBe('((x + 1) * 2)');
  });

  it('escapes single quotes in string literals', () => {
    const node = engine.parse("'it\\'s ok'");
    expect(tryCompileToAgString(node)).toBe("'it\\'s ok'");
  });

  it('maps value alias to x and preserves data variable', () => {
    expect(tryCompileToAgString(engine.parse('value > 0'))).toBe('x > 0');
    expect(tryCompileToAgString(engine.parse('data'))).toBe('data');
  });

  it('compiles member access on data', () => {
    const node: ExpressionNode = {
      type: 'member',
      object: { type: 'variable', name: 'data' },
      property: 'price',
    };
    expect(tryCompileToAgString(node)).toBe('data.price');
  });

  it('returns null for unsupported constructs', () => {
    expect(tryCompileToAgString(engine.parse('SUM([price])'))).toBeNull();
    expect(tryCompileToAgString(engine.parse('x ? 1 : 0'))).toBeNull();
    expect(tryCompileToAgString(engine.parse('[price]'))).toBeNull();
    expect(tryCompileToAgString(engine.parse('foo'))).toBeNull();
  });

  it('returns null for unknown binary operators without throwing', () => {
    const node: ExpressionNode = {
      type: 'binary',
      operator: 'IN',
      left: { type: 'literal', value: 1 },
      right: { type: 'literal', value: 2 },
    };
    expect(tryCompileToAgString(node)).toBeNull();
  });

  it('compiles boolean and null literals, unary minus, and modulo', () => {
    expect(tryCompileToAgString({ type: 'literal', value: true })).toBe('true');
    expect(tryCompileToAgString({ type: 'literal', value: false })).toBe('false');
    expect(tryCompileToAgString({ type: 'literal', value: null })).toBe('null');
    expect(tryCompileToAgString(engine.parse('-x'))).toBe('-(x)');
    expect(tryCompileToAgString(engine.parse('x % 2'))).toBe('(x % 2)');
    expect(tryCompileToAgString(engine.parse('x <= 1'))).toBe('x <= 1');
    expect(tryCompileToAgString(engine.parse('x != 0'))).toBe('x != 0');
  });

  it('returns null for unsupported unary operators and array nodes', () => {
    expect(tryCompileToAgString({
      type: 'unary',
      operator: '+',
      operand: { type: 'literal', value: 1 },
    } as ExpressionNode)).toBeNull();
    expect(tryCompileToAgString({
      type: 'array',
      elements: [{ type: 'literal', value: 1 }],
    } as ExpressionNode)).toBeNull();
  });
});

describe('tryCompileToPerspectiveExpression', () => {
  const engine = new ExpressionEngine();
  const compile = (src: string) => tryCompileToPerspectiveExpression(engine.parse(src));
  const expectOk = (src: string) => {
    const result = compile(src);
    if (!result.ok) throw new Error(`expected ${src} to compile, got: ${result.reason}`);
    return result;
  };
  const expectRefused = (src: string) => {
    const result = compile(src);
    if (result.ok) throw new Error(`expected ${src} to be refused, got: ${result.expression}`);
    return result;
  };

  it('double-quotes column refs and string literals', () => {
    expect(expectOk('[px]').expression).toBe('"px"');
    expect(expectOk('[analytics.duration]').expression).toBe('"analytics.duration"');
    expect(expectOk("[book] == 'A'").expression).toBe('"book" == "A"');
  });

  it('escapes backslashes and double quotes inside literals and column ids', () => {
    expect(expectOk('[book] == \'A"B\'').expression).toBe('"book" == "A\\"B"');
    expect(expectOk("[book] == 'A\\\\B'").expression).toBe('"book" == "A\\\\B"');
    expect(
      tryCompileToPerspectiveExpression({ type: 'columnRef', columnId: 'we"ird' }),
    ).toEqual({ ok: true, expression: '"we\\"ird"', perspectiveType: undefined });
  });

  it('compiles arithmetic, comparisons and logical operators', () => {
    expect(expectOk('[px] * [qty]').expression).toBe('"px" * "qty"');
    expect(expectOk('[px] - 1').expression).toBe('"px" - 1');
    expect(expectOk('[px] >= 95').expression).toBe('"px" >= 95');
    expect(expectOk('[px] > 1 AND [qty] < 9').expression).toBe('("px" > 1 and "qty" < 9)');
    expect(expectOk('[px] > 1 OR [qty] < 9').expression).toBe('("px" > 1 or "qty" < 9)');
    expect(expectOk('-[px]').expression).toBe('-"px"');
    expect(expectOk('true').expression).toBe('true');
    expect(expectOk('null').expression).toBe('null');
  });

  it('negates with if(x, false, true), never not()', () => {
    expect(expectOk('NOT ([qty] > 10)').expression).toBe('if("qty" > 10, false, true)');
    expect(expectOk('NOT (NOT ([qty] > 10))').expression).toBe(
      'if(if("qty" > 10, false, true), false, true)',
    );
    expect(expectOk('NOT ([a] > 1 AND [b] > 2)').expression).toBe(
      'if(("a" > 1 and "b" > 2), false, true)',
    );
  });

  it('refuses a NOT whose operand is not known to be boolean', () => {
    // A non-boolean condition is ACCEPTED by 4.5.2 and reads truthy, so this
    // would compile into a column that is wrong without ever failing.
    expect(expectRefused('NOT [qty]').reason).toMatch(/boolean operand/);
    expect(expectRefused('NOT ([px] * 2)').reason).toMatch(/boolean operand/);
    expect(expectRefused("NOT 'x'").reason).toMatch(/boolean operand/);
  });

  it('never emits not( in any successful output', () => {
    const sources = [
      'NOT ([qty] > 10)',
      'NOT (NOT ([qty] > 10))',
      'NOT ([a] > 1) AND NOT ([b] > 2)',
      'NOT ([a] > 1) OR [b] > 2',
      'IF(NOT ([a] > 1), 1, 0)',
      'IFS(NOT ([a] > 1), 1, NOT ([b] > 2), 2, 0)',
    ];
    for (const src of sources) {
      const result = expectOk(src);
      expect(result.expression).not.toContain('not(');
    }
  });

  it('refuses viewport-only .old/.new column refs', () => {
    expect(expectRefused('[px.old] > 1').reason).toMatch(/viewport-only/);
    expect(expectRefused('[px.new] > 1').reason).toMatch(/viewport-only/);
    expect(expectRefused('[px.new]').reason).toContain('[px.new]');
  });

  it('compiles IF to if(c, a, b)', () => {
    expect(expectOk('IF([px] > 1, 10, 20)').expression).toBe('if("px" > 1, 10, 20)');
    expect(expectRefused('IF([px] > 1, 10)').reason).toMatch(/exactly 3 arguments/);
  });

  it('folds IFS right-to-left, defaulting to null when no default is given', () => {
    expect(expectOk('IFS([a] > 1, 10, [b] > 2, 20)').expression).toBe(
      'if("a" > 1, 10, if("b" > 2, 20, null))',
    );
    expect(expectOk('IFS([a] > 1, 10, [b] > 2, 20, 99)').expression).toBe(
      'if("a" > 1, 10, if("b" > 2, 20, 99))',
    );
    expect(expectOk('IFS([a] > 1, 10, 99)').expression).toBe('if("a" > 1, 10, 99)');
    expect(expectRefused('IFS([a] > 1)').reason).toMatch(/at least 2 arguments/);
  });

  it('refuses aggregate expressions by name', () => {
    expect(expectRefused('SUM([px])').reason).toContain('SUM');
    expect(expectRefused('AVG([px]) * 2').reason).toContain('AVG');
    expect(expectRefused('IF([px] > MAX([px]) - 1, 1, 0)').reason).toContain('MAX');
    expect(expectRefused('SUM([px])').reason).toMatch(/row-local/);
  });

  it('refuses variables, members, ternaries, arrays and unlisted functions', () => {
    expect(expectRefused('foo').reason).toMatch(/Unsupported variable/);
    expect(expectRefused('UPPER([book])').reason).toMatch(/Unsupported function/);
    expect(expectRefused('[px] ? 1 : 0').reason).toMatch(/ternary/);
    expect(expectRefused('[px] % 2').reason).toMatch(/Unsupported operator/);
    expect(
      tryCompileToPerspectiveExpression({
        type: 'member',
        object: { type: 'variable', name: 'data' },
        property: 'px',
      }),
    ).toEqual({ ok: false, reason: 'Unsupported expression construct: member' });
    expect(
      tryCompileToPerspectiveExpression({
        type: 'array',
        elements: [{ type: 'literal', value: 1 }],
      }),
    ).toEqual({ ok: false, reason: 'Unsupported expression construct: array' });
    expect(
      tryCompileToPerspectiveExpression({
        type: 'unary',
        operator: '+',
        operand: { type: 'literal', value: 1 },
      } as ExpressionNode),
    ).toEqual({ ok: false, reason: 'Unsupported unary operator: +' });
  });

  it('infers the perspective type where the AST determines it', () => {
    expect(expectOk('[px] > 1').perspectiveType).toBe('boolean');
    expect(expectOk('[a] > 1 AND [b] > 2').perspectiveType).toBe('boolean');
    expect(expectOk('NOT ([px] > 1)').perspectiveType).toBe('boolean');
    expect(expectOk('[px] * [qty]').perspectiveType).toBe('float');
    expect(expectOk('-[px]').perspectiveType).toBe('float');
    expect(expectOk('42').perspectiveType).toBe('integer');
    expect(expectOk('4.2').perspectiveType).toBe('float');
    expect(expectOk("'A'").perspectiveType).toBe('string');
    expect(expectOk('true').perspectiveType).toBe('boolean');
    expect(expectOk('null').perspectiveType).toBeUndefined();
    expect(expectOk('IF([px] > 1, 10, 20)').perspectiveType).toBeUndefined();
    expect(expectOk('[px]').perspectiveType).toBeUndefined();
  });

  it('is reachable from the engine instance', () => {
    expect(engine.tryCompileToPerspectiveExpression(engine.parse('[px] * 2'))).toEqual({
      ok: true,
      expression: '"px" * 2',
      perspectiveType: 'float',
    });
  });
});
