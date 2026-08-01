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

  it('passes through semantic types and maps numeric alias', () => {
    expect(inferPickerDataType('number')).toBe('datetime');
    expect(inferPickerDataType('currency')).toBe('datetime');
    expect(inferPickerDataType('percent')).toBe('datetime');
    expect(inferPickerDataType('datetime')).toBe('datetime');
    expect(inferPickerDataType('string')).toBe('string');
    expect(inferPickerDataType('boolean')).toBe('boolean');
    expect(inferPickerDataType('numeric')).toBe('number');
    expect(inferPickerDataType(undefined)).toBe('number');
    expect(inferPickerDataType('unknown')).toBe('number');
  });
});
