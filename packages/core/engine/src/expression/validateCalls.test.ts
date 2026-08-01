import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from './index';

describe('ExpressionEngine.validate — call sites', () => {
  const engine = new ExpressionEngine();

  it('rejects unknown functions at validate time', () => {
    const result = engine.validate('NOPE([price])');
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/Unknown function/i);
  });

  it('rejects wrong arity at validate time', () => {
    const result = engine.validate('STARTS_WITH([name])');
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toMatch(/expects 2-2 arguments/i);
  });

  it('accepts known functions with correct arity', () => {
    expect(engine.validate('CONCAT([region], "/", [country])').valid).toBe(true);
  });
});
