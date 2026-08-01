import { describe, it, expect } from 'vitest';
import { valueFormatterFromTemplate } from './valueFormatterFromTemplate';
import type { FormatterParams } from './formatterTypes';

// 2026-06-14T13:05:00Z — a Sunday afternoon (UTC). timeZone is pinned to UTC
// inside the preset so these assertions hold regardless of the CI machine's
// timezone.
const EPOCH = Date.UTC(2026, 5, 14, 13, 5, 0);

const p = (value: unknown): FormatterParams => ({ value } as FormatterParams);

describe('date preset — locale-aware', () => {
  it('formats US locale month-first', () => {
    const fmt = valueFormatterFromTemplate({ kind: 'preset', preset: 'date', options: { locale: 'en-US' } });
    const out = fmt(p(EPOCH));
    expect(out).toContain('2026');
    expect(out).toContain('Jun');
    expect(out).toContain('14');
  });

  it('formats GB locale day-first', () => {
    const fmt = valueFormatterFromTemplate({ kind: 'preset', preset: 'date', options: { locale: 'en-GB' } });
    const out = fmt(p(EPOCH));
    // Day precedes month in en-GB ordering.
    expect(out.indexOf('14')).toBeLessThan(out.indexOf('Jun'));
  });

  it('accepts epoch-ms numbers, Date instances and ISO strings', () => {
    const fmt = valueFormatterFromTemplate({ kind: 'preset', preset: 'date', options: { locale: 'en-US' } });
    expect(fmt(p(EPOCH))).toBe(fmt(p(new Date(EPOCH))));
    expect(fmt(p('2026-06-14T13:05:00Z'))).toContain('Jun');
  });

  it('returns empty string for null / unparseable values', () => {
    const fmt = valueFormatterFromTemplate({ kind: 'preset', preset: 'date', options: { locale: 'en-US' } });
    expect(fmt(p(null))).toBe('');
    expect(fmt(p('not-a-date'))).toBe('');
  });
});

describe('datetime preset — locale-aware', () => {
  it('includes both date and time parts', () => {
    const fmt = valueFormatterFromTemplate({ kind: 'preset', preset: 'datetime', options: { locale: 'en-US' } });
    const out = fmt(p(EPOCH));
    expect(out).toContain('2026');
    expect(out).toContain('Jun');
    // 13:05 UTC → 1:05 PM
    expect(out).toMatch(/PM/i);
    expect(out).toContain('05');
  });
});
