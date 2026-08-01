import { describe, expect, it } from 'vitest';
import { migrateExpressionSyntax, migrateExpressionsInObject } from './migrate';

describe('migrateExpressionSyntax', () => {
  it('rewrites legacy brace column refs to bracket syntax', () => {
    expect(migrateExpressionSyntax('{price} > 100')).toBe('[price] > 100');
    expect(migrateExpressionSyntax('SUM({qty}) + {fee}')).toBe('SUM([qty]) + [fee]');
  });

  it('returns the same reference when nothing changes', () => {
    const src = '[price] > 100';
    expect(migrateExpressionSyntax(src)).toBe(src);
    expect(migrateExpressionSyntax('')).toBe('');
  });

  it('leaves brace tokens inside string literals untouched', () => {
    expect(migrateExpressionSyntax("'hello {name}' + {price}")).toBe(
      "'hello {name}' + [price]",
    );
    expect(migrateExpressionSyntax('"prefix {id}"')).toBe('"prefix {id}"');
  });

  it('ignores invalid brace tokens that are not identifiers', () => {
    expect(migrateExpressionSyntax('{123}')).toBe('{123}');
    expect(migrateExpressionSyntax('{ price }')).toBe('{ price }');
  });
});

describe('migrateExpressionsInObject', () => {
  it('migrates only named string fields and preserves structural sharing', () => {
    const input = {
      condition: '{price} > 0',
      label: 'unchanged',
      nested: { expression: 'MIN({qty})' },
    };
    const out = migrateExpressionsInObject(input, ['condition', 'expression']);
    expect(out).not.toBe(input);
    expect(out).toEqual({
      condition: '[price] > 0',
      label: 'unchanged',
      nested: { expression: 'MIN([qty])' },
    });
  });

  it('returns the original reference when no field changes', () => {
    const input = { expression: '[price] > 0' };
    expect(migrateExpressionsInObject(input, ['expression'])).toBe(input);
  });

  it('walks arrays without mutating primitives', () => {
    expect(migrateExpressionsInObject(null as unknown as object, ['x'])).toBeNull();
    const arr = [{ expression: '{a}' }];
    const out = migrateExpressionsInObject(arr, ['expression']);
    expect(out[0].expression).toBe('[a]');
  });
});
