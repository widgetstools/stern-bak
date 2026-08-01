import { describe, expect, it } from 'vitest';
import { hashString } from './hash.js';

describe('hashString', () => {
  it('returns a positive integer', () => {
    expect(hashString('hello')).toBeGreaterThan(0);
    expect(Number.isInteger(hashString('hello'))).toBe(true);
  });

  it('is deterministic for the same input', () => {
    expect(hashString('seed-abc')).toBe(hashString('seed-abc'));
  });

  it('produces different hashes for different strings', () => {
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('returns 1 for empty string (Math.abs(0) || 1)', () => {
    expect(hashString('')).toBe(1);
  });

  it('handles unicode and special characters', () => {
    const h1 = hashString('positions-TRADER001');
    const h2 = hashString('positions-TRADER002');
    expect(h1).not.toBe(h2);
    expect(hashString('🎯')).toBeGreaterThan(0);
  });
});
