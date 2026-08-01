import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from './index';
import { tryCompileToAgString } from './compiler';
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
