/**
 * Security identifier check digits.
 *
 * Real CUSIPs, ISINs and SEDOLs carry a check digit, and anyone who has worked
 * with security masters can spot an invalid one. The generated universe uses
 * plausible issuer prefixes with CORRECT check digits — the identifiers are
 * well-formed but deliberately do not correspond to real issued securities.
 */

/** CUSIP character values: digits, then A=10..Z=35, then the three specials. */
function cusipCharValue(ch: string): number {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 55;
  if (ch === '*') return 36;
  if (ch === '@') return 37;
  if (ch === '#') return 38;
  return Number.NaN;
}

/**
 * CUSIP check digit over the first 8 characters (modulus 10, double-add-
 * double). Returns null when the input is not 8 valid CUSIP characters.
 */
export function cusipCheckDigit(first8: string): number | null {
  if (first8.length !== 8) return null;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const value = cusipCharValue(first8[i] as string);
    if (Number.isNaN(value)) return null;
    // Positions are 1-indexed in the spec; every even position doubles.
    const weighted = i % 2 === 1 ? value * 2 : value;
    sum += Math.floor(weighted / 10) + (weighted % 10);
  }
  return (10 - (sum % 10)) % 10;
}

/** Complete an 8-character stem into a 9-character CUSIP. */
export function completeCusip(first8: string): string | null {
  const check = cusipCheckDigit(first8);
  return check === null ? null : `${first8}${check}`;
}

export function isValidCusip(cusip: string): boolean {
  if (cusip.length !== 9) return false;
  const check = cusipCheckDigit(cusip.slice(0, 8));
  return check !== null && check === Number(cusip[8]);
}

/** ISIN check digit: expand letters to two digits, then Luhn over the whole. */
export function isinCheckDigit(first11: string): number | null {
  if (first11.length !== 11) return null;
  let digits = '';
  for (const ch of first11) {
    if (ch >= '0' && ch <= '9') digits += ch;
    else if (ch >= 'A' && ch <= 'Z') digits += String(ch.charCodeAt(0) - 55);
    else return null;
  }
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i--) {
    let value = digits.charCodeAt(i) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    double = !double;
    sum += value;
  }
  return (10 - (sum % 10)) % 10;
}

/** Build the US ISIN for a CUSIP: country code, CUSIP, check digit. */
export function isinFromCusip(cusip: string, countryCode = 'US'): string | null {
  if (cusip.length !== 9) return null;
  const stem = `${countryCode}${cusip}`;
  const check = isinCheckDigit(stem);
  return check === null ? null : `${stem}${check}`;
}

export function isValidIsin(isin: string): boolean {
  if (isin.length !== 12) return false;
  const check = isinCheckDigit(isin.slice(0, 11));
  return check !== null && check === Number(isin[11]);
}

const SEDOL_WEIGHTS = [1, 3, 1, 7, 3, 9] as const;

/** SEDOL check digit over the first 6 characters. SEDOLs exclude vowels. */
export function sedolCheckDigit(first6: string): number | null {
  if (first6.length !== 6) return null;
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    const ch = first6[i] as string;
    let value: number;
    if (ch >= '0' && ch <= '9') value = ch.charCodeAt(0) - 48;
    else if (ch >= 'A' && ch <= 'Z') value = ch.charCodeAt(0) - 55;
    else return null;
    if ('AEIOU'.includes(ch)) return null;
    sum += value * (SEDOL_WEIGHTS[i] as number);
  }
  return (10 - (sum % 10)) % 10;
}

export function completeSedol(first6: string): string | null {
  const check = sedolCheckDigit(first6);
  return check === null ? null : `${first6}${check}`;
}

export function isValidSedol(sedol: string): boolean {
  if (sedol.length !== 7) return false;
  const check = sedolCheckDigit(sedol.slice(0, 6));
  return check !== null && check === Number(sedol[6]);
}

/**
 * Issue-code alphabet for synthesised CUSIPs: digits plus letters, minus I and
 * O so they cannot be read as 1 and 0. 34 characters, matching real practice.
 */
export const ISSUE_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ISSUE_SPACE = ISSUE_ALPHABET.length ** 2;

/** Two-character issue code from an index, for `<6-char issuer><2><check>`. */
export function issueCode(n: number): string {
  const size = ISSUE_ALPHABET.length;
  const wrapped = ((n % ISSUE_SPACE) + ISSUE_SPACE) % ISSUE_SPACE;
  return (
    (ISSUE_ALPHABET[Math.floor(wrapped / size)] as string) +
    (ISSUE_ALPHABET[wrapped % size] as string)
  );
}
