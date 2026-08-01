import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isValidExcelFormat,
  type ValueFormatterTemplate,
} from '@wellsfargo-starui/core';
import {
  defaultSampleValue,
  findMatchingPreset,
  presetsForDataType,
  type FormatterPickerDataType,
  type FormatterPreset,
} from './presetsForDataType';
import { renderPreview } from './formatterPickerShared';
import { CompactFormatterPicker } from './CompactFormatterPicker';
import { InlineFormatterPicker } from './InlineFormatterPicker';

/**
 * FormatterPicker — the shared format selector. Two presentations:
 *
 *   compact  (toolbar host)   → single chip trigger that opens a
 *                               shadcn popover containing a preset
 *                               tile grid, currency quick-insert,
 *                               custom Excel input, and live preview.
 *                               One toolbar slot replaces the old
 *                               preset dropdown + custom input +
 *                               info icon triple.
 *
 *   non-compact (editor hosts) → inline row: collapse chevron, preset
 *                                dropdown, custom Excel input, info
 *                                popover, live preview chip. Editors
 *                                have horizontal room to breathe, so
 *                                the inline layout stays faster to
 *                                scan than a popover.
 *
 * The value shape stays `ValueFormatterTemplate | undefined` across
 * both presentations, so hosts and downstream resolvers are unaware of
 * the UI split. Test-ids are preserved so existing tests keep working.
 *
 * This file is the slim dispatcher — it owns the picker's state +
 * derived values, then renders either CompactFormatterPicker or
 * InlineFormatterPicker. Sub-components and per-domain helpers
 * (currency quick-insert, preset grouping, shared body types) live in
 * sibling files.
 */
export interface FormatterPickerProps {
  dataType: FormatterPickerDataType;
  value: ValueFormatterTemplate | undefined;
  onChange: (template: ValueFormatterTemplate | undefined) => void;
  /** Optional explicit sample value used for the live preview. Falls
   *  back to `defaultSampleValue(dataType)` when omitted. */
  sampleValue?: unknown;
  /** Start collapsed? Host-dependent. Ignored in compact mode (the
   *  trigger chip is always the collapsed form there). */
  defaultCollapsed?: boolean;
  /** Toolbar = true, editors = false. Controls the entire
   *  presentation (popover vs inline). */
  compact?: boolean;
  /**
   * Inline (non-compact) layout direction. `horizontal` (default)
   * is one row: collapse-chevron + preset + custom + info + preview.
   * `vertical` stacks: preset on top (full width), custom + info
   * below (full width), preview suppressed (the host should own a
   * preview chip elsewhere — e.g. in a panel header).
   *
   * Vertical is designed for narrow panels (≤400px) like the
   * FormattingPropertiesPanel popout, where a single-row layout
   * would overflow the column.
   */
  layout?: 'horizontal' | 'vertical';
  'data-testid'?: string;
}

/**
 * Map any host's incoming dataType into the picker's 7-valued enum.
 * Hosts that use the 4-value `ColumnDataType` can call this directly;
 * hosts that already know the fine-grained semantic (e.g. "currency")
 * can pass it through untouched.
 */
export function inferPickerDataType(
  raw: string | undefined,
): FormatterPickerDataType {
  switch (raw) {
    case 'number':
    case 'currency':
    case 'percent':
    case 'date':
    case 'datetime':
    case 'dateString':
    case 'dateTimeString':
      return raw === 'date' ? 'date' : 'datetime';
    case 'string':
    case 'boolean':
      return raw;
    case 'numeric':
      return 'number';
    default:
      return 'number';
  }
}

export function FormatterPicker({
  dataType,
  value,
  onChange,
  sampleValue,
  defaultCollapsed = false,
  compact = false,
  layout = 'horizontal',
  'data-testid': testId,
}: FormatterPickerProps) {
  const presets = useMemo(() => presetsForDataType(dataType), [dataType]);
  const activePreset = useMemo(() => findMatchingPreset(dataType, value), [dataType, value]);
  const sample = sampleValue !== undefined ? sampleValue : defaultSampleValue(dataType);

  // Custom-input draft — source of truth stays the committed template,
  // but while the user is typing we hold the working string so a
  // validation error doesn't thrash the input.
  const excelFromTemplate = value?.kind === 'excelFormat' ? value.format : '';
  const [draftExcel, setDraftExcel] = useState(excelFromTemplate);
  const lastCommittedRef = useRef(excelFromTemplate);
  useEffect(() => {
    if (value?.kind !== 'excelFormat' || value.format !== lastCommittedRef.current) {
      const nextText = value?.kind === 'excelFormat' ? value.format : '';
      setDraftExcel(nextText);
      lastCommittedRef.current = nextText;
    }
  }, [value]);

  const isExcelValid = draftExcel.length === 0 || isValidExcelFormat(draftExcel);

  const commitExcel = useCallback(
    (format: string) => {
      const trimmed = format.trim();
      lastCommittedRef.current = trimmed;
      if (!trimmed) {
        onChange(undefined);
        return;
      }
      if (!isValidExcelFormat(trimmed)) return;
      onChange({ kind: 'excelFormat', format: trimmed });
    },
    [onChange],
  );

  const pickPreset = useCallback(
    (preset: FormatterPreset) => {
      onChange(preset.template);
      if (preset.template.kind === 'excelFormat') {
        setDraftExcel(preset.template.format);
        lastCommittedRef.current = preset.template.format;
      } else {
        setDraftExcel('');
        lastCommittedRef.current = '';
      }
    },
    [onChange],
  );

  const preview = useMemo(() => {
    const presetSample =
      activePreset?.sampleValue !== undefined ? activePreset.sampleValue : sample;
    return renderPreview(value, presetSample);
  }, [value, activePreset, sample]);

  if (compact) {
    return (
      <CompactFormatterPicker
        value={value}
        onChange={onChange}
        presets={presets}
        activePreset={activePreset}
        preview={preview}
        draftExcel={draftExcel}
        setDraftExcel={setDraftExcel}
        isExcelValid={isExcelValid}
        commitExcel={commitExcel}
        pickPreset={pickPreset}
        dataType={dataType}
        testId={testId}
      />
    );
  }

  return (
    <InlineFormatterPicker
      value={value}
      onChange={onChange}
      presets={presets}
      activePreset={activePreset}
      preview={preview}
      draftExcel={draftExcel}
      setDraftExcel={setDraftExcel}
      isExcelValid={isExcelValid}
      commitExcel={commitExcel}
      pickPreset={pickPreset}
      dataType={dataType}
      defaultCollapsed={defaultCollapsed}
      layout={layout}
      testId={testId}
    />
  );
}
