/**
 * Shared types + render helpers used by both the compact and inline
 * FormatterPicker presentations. Pulled out so the picker's two
 * presentation files (CompactFormatterPicker, InlineFormatterPicker)
 * can share a typed body-props contract without importing from each
 * other.
 */
import {
  valueFormatterFromTemplate,
  type ValueFormatterTemplate,
} from '@wellsfargo-starui/core';
import type { FormatterPickerDataType, FormatterPreset } from './presetsForDataType';

/** Body-props contract shared by CompactFormatterPicker + InlineFormatterPicker.
 *  Holds the picker's derived state and committed callbacks. */
export interface SharedBodyProps {
  value: ValueFormatterTemplate | undefined;
  onChange: (template: ValueFormatterTemplate | undefined) => void;
  presets: ReadonlyArray<FormatterPreset>;
  activePreset: FormatterPreset | undefined;
  preview: string;
  draftExcel: string;
  setDraftExcel: (next: string) => void;
  isExcelValid: boolean;
  commitExcel: (format: string) => void;
  pickPreset: (preset: FormatterPreset) => void;
  dataType: FormatterPickerDataType;
  testId?: string;
}

/** Safely render a formatter against a sample value. Swallows all errors
 *  — the preview chip is a help hint, not the source of truth. */
export function renderPreview(
  template: ValueFormatterTemplate | undefined,
  sample: unknown,
): string {
  if (!template) return '';
  try {
    const fn = valueFormatterFromTemplate(template);
    return fn({ value: sample, data: {} });
  } catch {
    return '';
  }
}

/** Short caption for the compact trigger chip and the inline collapsed
 *  trigger. Prefer the active preset's label when one is selected; fall
 *  back to a truncated format-string / token. */
export function triggerCaption(
  template: ValueFormatterTemplate | undefined,
  activePreset: FormatterPreset | undefined,
): string {
  if (!template) return 'Format';
  if (activePreset) return activePreset.label;
  switch (template.kind) {
    case 'preset':
      return template.preset;
    case 'excelFormat':
      return template.format.length > 20 ? template.format.slice(0, 19) + '…' : template.format;
    case 'expression':
      return 'Custom expression';
    case 'tick':
      return template.tick.replace('TICK', '').replace('_PLUS', '+').toLowerCase();
  }
}
