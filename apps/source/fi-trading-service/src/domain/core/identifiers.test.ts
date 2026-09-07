
import { describe, expect, it } from 'vitest';

import {
  ISSUE_ALPHABET, completeCusip, completeSedol, cusipCheckDigit, isValidCusip, isValidIsin,
  isValidSedol, isinCheckDigit, isinFromCusip, issueCode, sedolCheckDigit,
} from './identifiers.js';

describe('CUSIP', () => {
  it('reproduces the check digit of real published CUSIPs', () => {
    // Public, well-known identifiers; the check digit is part of the number.
    for (const cusip of ['037833100', '594918104', '17275R102', '88160R101', '459200101']) {
      expect(cusipCheckDigit(cusip.slice(0, 8))).toBe(Number(cusip[8]));
      expect(isValidCusip(cusip)).toBe(true);
    }
  });

  it('handles a Treasury CUSIP with a letter in the issue code', () => {
    expect(isValidCusip('912828ZQ6')).toBe(true);
  });

  it('completes a stem', () => {
    expect(completeCusip('03783310')).toBe('037833100');
  });

  it('rejects a wrong check digit and malformed input', () => {
    expect(isValidCusip('037833101')).toBe(false);
    expect(isValidCusip('03783310')).toBe(false);
    expect(cusipCheckDigit('0378331')).toBeNull();
    expect(cusipCheckDigit('03783 310')).toBeNull();
    expect(completeCusip('bad')).toBeNull();
  });

  it('accepts the three special characters the spec allows', () => {
    expect(cusipCheckDigit('0378331*')).not.toBeNull();
    expect(cusipCheckDigit('0378331@')).not.toBeNull();
    expect(cusipCheckDigit('0378331#')).not.toBeNull();
  });
});

describe('ISIN', () => {
  it('reproduces the check digit of real published ISINs', () => {
    expect(isinCheckDigit('US037833100')).toBe(5);
    expect(isValidIsin('US0378331005')).toBe(true);
    expect(isValidIsin('US5949181045')).toBe(true);
  });

  it('builds the US ISIN for a CUSIP', () => {
    expect(isinFromCusip('037833100')).toBe('US0378331005');
    expect(isinFromCusip('594918104')).toBe('US5949181045');
  });

  it('rejects a wrong check digit and malformed input', () => {
    expect(isValidIsin('US0378331004')).toBe(false);
    expect(isValidIsin('US037833100')).toBe(false);
    expect(isinCheckDigit('US03783310')).toBeNull();
    expect(isinCheckDigit('US03783310!')).toBeNull();
    expect(isinFromCusip('short')).toBeNull();
  });
});

describe('SEDOL', () => {
  it('reproduces the check digit of real published SEDOLs', () => {
    for (const sedol of ['0263494', '0798059', 'B0WNLY7', 'B0YBKJ7']) {
      expect(sedolCheckDigit(sedol.slice(0, 6))).toBe(Number(sedol[6]));
      expect(isValidSedol(sedol)).toBe(true);
    }
  });

  it('completes a stem', () => {
    expect(completeSedol('026349')).toBe('0263494');
  });

  it('rejects vowels, which SEDOLs never contain', () => {
    expect(sedolCheckDigit('B0WNLA')).toBeNull();
    expect(sedolCheckDigit('B0WNLE')).toBeNull();
  });

  it('rejects a wrong check digit and malformed input', () => {
    expect(isValidSedol('0263495')).toBe(false);
    expect(isValidSedol('026349')).toBe(false);
    expect(sedolCheckDigit('02634')).toBeNull();
    expect(completeSedol('!!!!!!')).toBeNull();
  });
});

describe('issue codes', () => {
  it('excludes I and O so they cannot be misread as 1 and 0', () => {
    expect(ISSUE_ALPHABET).not.toContain('I');
    expect(ISSUE_ALPHABET).not.toContain('O');
    expect(ISSUE_ALPHABET).toHaveLength(34);
  });

  it('is a bijection over its space and wraps cleanly', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 34 * 34; i++) seen.add(issueCode(i));
    expect(seen.size).toBe(34 * 34);
    expect(issueCode(34 * 34)).toBe(issueCode(0));
    expect(issueCode(-1)).toBe(issueCode(34 * 34 - 1));
  });

  it('produces CUSIPs that validate when combined with an issuer prefix', () => {
    for (let i = 0; i < 50; i++) {
      const cusip = completeCusip(`912828${issueCode(i)}`);
      expect(cusip).not.toBeNull();
      expect(isValidCusip(cusip as string)).toBe(true);
    }
  });
});
