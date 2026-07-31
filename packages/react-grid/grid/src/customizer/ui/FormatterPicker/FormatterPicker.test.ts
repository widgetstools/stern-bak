import { describe, expect, it } from 'vitest';
import { inferPickerDataType } from './FormatterPicker';

describe('inferPickerDataType', () => {
  it('maps ag-grid dateString to datetime presets', () => {
    expect(inferPickerDataType('dateString')).toBe('datetime');
  });

  it('maps ag-grid dateTimeString to datetime presets', () => {
    expect(inferPickerDataType('dateTimeString')).toBe('datetime');
  });

  it('keeps plain date on date-only presets', () => {
    expect(inferPickerDataType('date')).toBe('date');
  });
});
