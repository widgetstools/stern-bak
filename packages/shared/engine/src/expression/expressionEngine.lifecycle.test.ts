import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from './index';

describe('ExpressionEngine — validate and registry', () => {
  const engine = new ExpressionEngine();

  it('validate returns parse errors with position metadata', () => {
    const bad = engine.validate('x >');
    expect(bad.valid).toBe(false);
    expect(bad.errors[0]?.message).toBeTruthy();
    expect(typeof bad.errors[0]?.position).toBe('number');
  });

  it('validate returns call-site errors for unknown functions', () => {
    const bad = engine.validate('NOPE(x)');
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
  });

  it('validate succeeds for well-formed expressions', () => {
    expect(engine.validate('x > 0').valid).toBe(true);
  });

  it('registerFunction adds custom callable to evaluation', () => {
    engine.registerFunction({
      name: 'DOUBLE',
      category: 'Custom',
      description: 'double',
      signature: 'DOUBLE(x)',
      minArgs: 1,
      maxArgs: 1,
      evaluate: ([x]) => Number(x) * 2,
    });
    expect(engine.parseAndEvaluate('DOUBLE(4)', { x: null, value: null, data: {}, columns: {} })).toBe(8);
  });

  it('getFunctionsByCategory groups builtins', () => {
    const grouped = engine.getFunctionsByCategory();
    expect(grouped.Math?.some((f) => f.name === 'ABS')).toBe(true);
    expect(grouped.String?.some((f) => f.name === 'CONCAT')).toBe(true);
  });

  it('compile cache evicts oldest entry when bound exceeded', () => {
    const first = engine.compile('[col_0]');
    for (let i = 1; i <= 1500; i++) engine.compile(`[col_${i}]`);
    expect(engine.compile('[col_0]')).not.toBe(first);
  });
});
