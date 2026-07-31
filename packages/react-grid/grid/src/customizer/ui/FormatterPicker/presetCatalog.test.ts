import { describe, expect, it } from 'vitest';
import { isValidExcelFormat, valueFormatterFromTemplate } from '@wellsfargo-starui/engine';
import { CATEGORY_LABELS } from './formatCategories';
import {
  ALL_PRESETS,
  presetsForCategory,
  presetsForDataType,
  type FormatterPreset,
} from './presetsForDataType';

function render(p: FormatterPreset, value: unknown): string {
  return valueFormatterFromTemplate(p.template)({ value, data: {} });
}

describe('preset catalog — categories', () => {
  it('tags every preset with a label-backed category', () => {
    for (const p of ALL_PRESETS) {
      expect(p.category, `preset ${p.id} missing category`).toBeTruthy();
      expect(CATEGORY_LABELS[p.category], `category ${p.category} has no label`).toBeTruthy();
    }
  });

  it('every excelFormat preset is a valid Excel format', () => {
    for (const p of ALL_PRESETS) {
      if (p.template.kind === 'excelFormat') {
        expect(isValidExcelFormat(p.template.format), `bad format on ${p.id}`).toBe(true);
      }
    }
  });

  it('uses unique preset ids', () => {
    const ids = ALL_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('promoted formats (previously reference-only)', () => {
  const byId = (id: string) => ALL_PRESETS.find((p) => p.id === id);

  it('No-thousands lives under number', () => {
    const p = byId('num-no-thousands');
    expect(p?.category).toBe('number');
    expect(render(p!, 1234.567)).toBe('1234.57');
  });

  it('Red-only lives under negatives', () => {
    expect(byId('num-neg-red-only')?.category).toBe('negatives');
  });

  it('directional arrows + thresholds live under conditional', () => {
    expect(byId('num-cond-arrows')?.category).toBe('conditional');
    expect(byId('num-cond-thresholds')?.category).toBe('conditional');
  });

  it('Prefix text lives under text', () => {
    const p = byId('str-prefix');
    expect(p?.category).toBe('text');
    expect(render(p!, 'value')).toBe('PX value');
  });
});

describe('text transforms', () => {
  const byId = (id: string) => ALL_PRESETS.find((p) => p.id === id)!;

  it('UPPERCASE', () => expect(render(byId('str-upper'), 'aBc')).toBe('ABC'));
  it('lowercase', () => expect(render(byId('str-lower'), 'aBc')).toBe('abc'));
  it('Title Case', () => expect(render(byId('str-title'), 'foo bar')).toBe('Foo Bar'));
  it('camelCase', () => expect(render(byId('str-camel'), 'foo bar_baz')).toBe('fooBarBaz'));
  it('Capitalize first', () => expect(render(byId('str-capitalize'), 'foo bar')).toBe('Foo bar'));
  it('Trim whitespace', () => expect(render(byId('str-trim'), '  hi  ')).toBe('hi'));
});

describe('presetsForCategory / presetsForDataType', () => {
  it('presetsForCategory filters the master catalog', () => {
    const text = presetsForCategory('text');
    expect(text.length).toBeGreaterThanOrEqual(8);
    expect(text.every((p) => p.category === 'text')).toBe(true);
  });

  it('number columns surface numeric-family categories', () => {
    const cats = new Set(presetsForDataType('number').map((p) => p.category));
    expect(cats).toContain('number');
    expect(cats).toContain('negatives');
    expect(cats).toContain('conditional');
    expect(cats).toContain('tick');
  });

  it('string columns surface only text presets', () => {
    expect(presetsForDataType('string').every((p) => p.category === 'text')).toBe(true);
  });

  it('boolean columns surface boolean then text presets', () => {
    const cats = presetsForDataType('boolean').map((p) => p.category);
    expect(cats).toContain('boolean');
    expect(cats).toContain('text');
  });
});
