import { describe, expect, it } from 'vitest';
import { renderPreview, triggerCaption } from './formatterPickerShared';

describe('formatterPickerShared', () => {
  it('triggerCaption prefers active preset label', () => {
    expect(
      triggerCaption({ kind: 'excelFormat', format: '#,##0.00' }, {
        id: 'num-2dp',
        category: 'number',
        label: '2 decimals',
        template: { kind: 'excelFormat', format: '#,##0.00' },
      }),
    ).toBe('2 decimals');
  });

  it('triggerCaption truncates long excel formats', () => {
    const long = '#,##0.00'.repeat(5);
    expect(triggerCaption({ kind: 'excelFormat', format: long }, undefined)).toMatch(/…$/);
  });

  it('renderPreview returns empty for undefined template', () => {
    expect(renderPreview(undefined, 123)).toBe('');
  });

  it('renderPreview formats a sample value', () => {
    const out = renderPreview({ kind: 'excelFormat', format: '#,##0.00' }, 1234.5);
    expect(out).toContain('1');
  });

  it('renderPreview returns string without throwing for odd templates', () => {
    expect(() =>
      renderPreview({ kind: 'excelFormat', format: '%%%invalid%%%' }, 1),
    ).not.toThrow();
  });

  it('triggerCaption handles preset expression and tick kinds', () => {
    expect(triggerCaption({ kind: 'preset', preset: 'currency' }, undefined)).toBe('currency');
    expect(triggerCaption({ kind: 'expression', expression: '1+1' }, undefined)).toBe('Custom expression');
    expect(triggerCaption({ kind: 'tick', tick: 'TICK_UP_PLUS' }, undefined)).toBe('_up+');
    expect(triggerCaption(undefined, undefined)).toBe('Format');
  });
});
