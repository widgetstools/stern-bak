import { describe, expect, it } from 'vitest';
import { ExpressionEngine } from './index';

/**
 * CASE WHEN … END and `if (…) { … } else { … }` sugar — both desugar to the
 * existing short-circuiting ternary, so they compose with everything else and
 * the legacy CASE()/IF()/IFS() functions keep working.
 */
describe('ExpressionEngine conditional sugar', () => {
  const engine = new ExpressionEngine();
  const evalWith = (expr: string, data: Record<string, unknown>) =>
    engine.parseAndEvaluate(expr, { x: null, value: null, data, columns: data });

  describe('CASE WHEN … THEN … ELSE … END', () => {
    const expr =
      'CASE WHEN [rating] == "AAA" THEN 1 WHEN [rating] == "AA" THEN 2 ELSE 99 END';

    it('returns the first matching branch', () => {
      expect(evalWith(expr, { rating: 'AAA' })).toBe(1);
      expect(evalWith(expr, { rating: 'AA' })).toBe(2);
    });

    it('falls through to ELSE', () => {
      expect(evalWith(expr, { rating: 'B' })).toBe(99);
    });

    it('returns null when no branch matches and there is no ELSE', () => {
      expect(evalWith('CASE WHEN [x] > 0 THEN "pos" END', { x: -1 })).toBeNull();
    });

    it('is case-insensitive (case/when/then/else/end)', () => {
      expect(evalWith('case when [x] > 0 then "p" else "n" end', { x: 5 })).toBe('p');
    });

    it('nests inside other expressions', () => {
      expect(
        evalWith('CONCAT("=", CASE WHEN [x] > 0 THEN "P" ELSE "N" END)', { x: 1 }),
      ).toBe('=P');
    });
  });

  describe('if (…) { … } else { … } blocks', () => {
    it('evaluates a simple if/else with return', () => {
      const expr = 'if ([x] > 5) { return "hi" } else { return "lo" }';
      expect(evalWith(expr, { x: 9 })).toBe('hi');
      expect(evalWith(expr, { x: 1 })).toBe('lo');
    });

    it('allows blocks without an explicit return, and trailing semicolons', () => {
      expect(evalWith('if ([x] == 1) { [a]; } else { [b]; }', { x: 1, a: 'A', b: 'B' })).toBe('A');
    });

    it('chains else if', () => {
      const expr =
        'if ([n] == 1) { return "one" } else if ([n] == 2) { return "two" } else { return "many" }';
      expect(evalWith(expr, { n: 1 })).toBe('one');
      expect(evalWith(expr, { n: 2 })).toBe('two');
      expect(evalWith(expr, { n: 7 })).toBe('many');
    });

    it('returns null when the if is false and there is no else', () => {
      expect(evalWith('if ([x] > 0) { return [x] }', { x: -3 })).toBeNull();
    });
  });

  it('expresses the CUSIP / inventoryName example as an if/else block', () => {
    const expr =
      'if (STARTS_WITH([cusip], "SPCL") AND [inventoryName] == null) {' +
      '  return [pnlDetailsFinal.pnlWrapper.PnlCalcInputInOutput.rdiInventoryName]' +
      '} else {' +
      '  return [inventoryName]' +
      '}';

    expect(
      evalWith(expr, {
        cusip: 'SPCL1',
        inventoryName: null,
        pnlDetailsFinal: { pnlWrapper: { PnlCalcInputInOutput: { rdiInventoryName: 'RDI' } } },
      }),
    ).toBe('RDI');
    expect(evalWith(expr, { cusip: 'SPCL1', inventoryName: 'Has' })).toBe('Has');
    expect(evalWith(expr, { cusip: 'OTHER', inventoryName: 'Keep' })).toBe('Keep');
  });

  describe('backward compatibility', () => {
    it('keeps the CASE(expr, …) value-switch function working', () => {
      expect(evalWith('CASE([side], "BUY", 1, "SELL", -1, 0)', { side: 'SELL' })).toBe(-1);
      expect(evalWith('CASE([side], "BUY", 1, 0)', { side: 'X' })).toBe(0);
    });

    it('keeps the IF(cond, then, else) function working', () => {
      expect(evalWith('IF([x] > 0, "p", "n")', { x: 1 })).toBe('p');
    });

    it('keeps the IFS(...) multi-branch function working', () => {
      expect(evalWith('IFS([x] > 10, "H", [x] > 5, "M", "L")', { x: 7 })).toBe('M');
    });

    it('keeps the legacy {col} column reference working', () => {
      expect(evalWith('{rating}', { rating: 'AAA' })).toBe('AAA');
    });

    it('still parses plain ternaries', () => {
      expect(evalWith('[x] > 0 ? "p" : "n"', { x: -1 })).toBe('n');
    });
  });

  describe('validation', () => {
    it('flags an unterminated CASE', () => {
      expect(engine.validate('CASE WHEN [x] > 0 THEN 1').valid).toBe(false);
    });
    it('flags an if-block missing its braces', () => {
      expect(engine.validate('if ([x] > 0) return 1').valid).toBe(false);
    });
    it('accepts a well-formed CASE', () => {
      expect(engine.validate('CASE WHEN [x] > 0 THEN 1 ELSE 0 END').valid).toBe(true);
    });
  });
});
