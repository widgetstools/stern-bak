import { describe, expect, it } from 'vitest';
import { parsePriceCsv } from './csv';

describe('parsePriceCsv', () => {
  it('parses cusip,price lines, tolerating header, BOM, quotes and blank lines', () => {
    const text = '﻿cusip,price\n"ABC123XY9",99.125\n\nDEF456ZW1,101.5\n';
    const { rows, errors } = parsePriceCsv(text);
    expect(rows).toEqual([
      { cusip: 'ABC123XY9', price: 99.125 },
      { cusip: 'DEF456ZW1', price: 101.5 },
    ]);
    expect(errors).toEqual([]);
  });

  it('reports bad lines per line instead of dropping them', () => {
    const { rows, errors } = parsePriceCsv('A1,100\n,99\nB2,not-a-price\nC3,-5\nA1,101\n');
    expect(rows).toEqual([{ cusip: 'A1', price: 100 }]);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
    expect(errors[3].reason).toMatch(/duplicate/);
  });

  it('lower-cases in the file are normalised to upper-case cusips', () => {
    const { rows } = parsePriceCsv('abC123xy9,88.25');
    expect(rows[0].cusip).toBe('ABC123XY9');
  });
});
