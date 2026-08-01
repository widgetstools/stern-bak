import { describe, expect, it } from 'vitest';
import { parseMagnitudeSuffix } from './parseMagnitudeSuffix.js';

describe('parseMagnitudeSuffix', () => {
  it('parses plain numbers', () => {
    expect(parseMagnitudeSuffix('42')).toBe(42);
    expect(parseMagnitudeSuffix('-3.5')).toBe(-3.5);
  });

  it('parses K/M/B suffixes', () => {
    expect(parseMagnitudeSuffix('1.5M')).toBe(1_500_000);
    expect(parseMagnitudeSuffix('250k')).toBe(250_000);
    expect(parseMagnitudeSuffix('2B')).toBe(2_000_000_000);
  });

  it('returns null for non-numeric', () => {
    expect(parseMagnitudeSuffix('abc')).toBeNull();
    expect(parseMagnitudeSuffix('')).toBeNull();
  });
});
