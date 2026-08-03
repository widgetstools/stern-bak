import { describe, expect, it } from 'vitest';
import { coerceEditedValue } from './cellEdits.js';

describe('coerceEditedValue', () => {
  it('parses the string a cell editor with no valueParser hands back', () => {
    // The reason this exists: `table.update()` coerces rather than rejects, so
    // "1250" reaching a float column is a silent write, visible in every peer
    // window.
    expect(coerceEditedValue('float', '1250.5')).toEqual({ ok: true, value: 1250.5 });
    expect(coerceEditedValue('integer', ' 42 ')).toEqual({ ok: true, value: 42 });
  });

  it('truncates to an integer column rather than storing a fraction', () => {
    expect(coerceEditedValue('integer', '42.9')).toEqual({ ok: true, value: 42 });
  });

  it('refuses a non-numeric value instead of writing NaN', () => {
    const result = coerceEditedValue('float', 'abc');
    expect(result.ok).toBe(false);
  });

  it('treats an empty edit as clearing the cell, at every type', () => {
    expect(coerceEditedValue('float', '')).toEqual({ ok: true, value: null });
    expect(coerceEditedValue('string', null)).toEqual({ ok: true, value: null });
    expect(coerceEditedValue('datetime', undefined)).toEqual({ ok: true, value: null });
  });

  it('takes only true/false for a boolean column', () => {
    expect(coerceEditedValue('boolean', 'TRUE')).toEqual({ ok: true, value: true });
    expect(coerceEditedValue('boolean', false)).toEqual({ ok: true, value: false });
    expect(coerceEditedValue('boolean', 'yes').ok).toBe(false);
  });

  it('parses a date column, and refuses one it cannot read', () => {
    const parsed = coerceEditedValue('date', '2026-07-29');
    expect(parsed.ok).toBe(true);
    expect((parsed as { value: Date }).value).toBeInstanceOf(Date);
    expect(coerceEditedValue('date', 'next tuesday').ok).toBe(false);
  });

  it('stringifies for a string column', () => {
    expect(coerceEditedValue('string', 42)).toEqual({ ok: true, value: '42' });
  });

  it('passes an unmodelled type through rather than guessing', () => {
    // A guess here would be a worse answer than letting the engine apply its
    // own rule.
    const value = { nested: true };
    expect(coerceEditedValue(undefined, value)).toEqual({ ok: true, value });
  });
});
