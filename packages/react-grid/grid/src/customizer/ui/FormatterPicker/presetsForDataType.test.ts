import { describe, expect, it } from 'vitest';
import {
  ALL_PRESETS,
  defaultSampleValue,
  findMatchingPreset,
  presetsForCategory,
  presetsForDataType,
} from './presetsForDataType';

describe('presetsForDataType', () => {
  it('filters presets by data type categories', () => {
    const numberPresets = presetsForDataType('number');
    expect(numberPresets.some((p) => p.id === 'num-2dp')).toBe(true);
    expect(numberPresets.some((p) => p.category === 'boolean')).toBe(false);
    expect(presetsForDataType('boolean').some((p) => p.category === 'boolean')).toBe(true);
  });

  it('presetsForCategory returns stable subset', () => {
    const ticks = presetsForCategory('tick');
    expect(ticks.every((p) => p.category === 'tick')).toBe(true);
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('findMatchingPreset resolves by template equality', () => {
    const preset = ALL_PRESETS.find((p) => p.id === 'num-2dp')!;
    expect(findMatchingPreset('number', preset.template)?.id).toBe('num-2dp');
    expect(findMatchingPreset('number', { kind: 'excelFormat', format: 'custom' })).toBeUndefined();
  });

  it('defaultSampleValue returns type-appropriate samples', () => {
    expect(defaultSampleValue('boolean')).toBe(true);
    expect(defaultSampleValue('percent')).toBe(0.1234);
    expect(defaultSampleValue('date')).toBeInstanceOf(Date);
    expect(defaultSampleValue('datetime')).toBeInstanceOf(Date);
    expect(defaultSampleValue('currency')).toBe(1234.5678);
    expect(defaultSampleValue('string')).toBe('sample');
  });

  it('findMatchingPreset resolves expression and tick templates', () => {
    const expr = ALL_PRESETS.find((p) => p.template.kind === 'expression')!;
    const tick = ALL_PRESETS.find((p) => p.template.kind === 'tick')!;
    expect(findMatchingPreset('number', expr.template)?.id).toBe(expr.id);
    expect(findMatchingPreset('number', tick.template)?.id).toBe(tick.id);
    expect(findMatchingPreset('number', undefined)).toBeUndefined();
  });

  it('presetsForDataType includes currency and percent categories', () => {
    expect(presetsForDataType('currency').some((p) => p.category === 'currency')).toBe(true);
    expect(presetsForDataType('percent').some((p) => p.category === 'percent')).toBe(true);
    expect(presetsForDataType('datetime').some((p) => p.category === 'date')).toBe(true);
  });
});
