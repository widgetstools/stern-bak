import { Hash } from 'lucide-react';
import {
  Band,
  Caps,
  IconInput,
  PillToggleBtn,
  PillToggleGroup,
  TDivider,
} from '../../SettingsPanel';
import type {
  PresetId,
  ValueFormatterTemplate,
} from '@wellsfargo-starui/engine';
import type { StyleEditorDataType, StyleEditorValue } from '../types';

/**
 * FORMAT band — Cockpit.
 *
 *   PRESET  [NUM] [$] [%] [DATE] [DURATION]   │   EXCEL  [# ____________]
 *
 * Preset row toggles between `{kind:'preset'}` values; typing into the
 * Excel field switches the formatter to `{kind:'excelFormat'}`.
 */

export interface FormatSectionProps {
  value: StyleEditorValue;
  onChange: (patch: Partial<StyleEditorValue>) => void;
  dataType?: StyleEditorDataType;
  inlineBody?: boolean;
  index?: string;
}

const PRESETS_BY_TYPE: Record<StyleEditorDataType, PresetId[]> = {
  number: ['number', 'currency', 'percent', 'duration'],
  date: ['date', 'datetime'],
  text: [],
  boolean: [],
};

const PRESET_LABEL: Record<PresetId, string> = {
  number: 'NUM',
  currency: '$',
  percent: '%',
  date: 'DATE',
  datetime: 'DATE+TIME',
  duration: 'DURATION',
};

export function FormatSection({
  value,
  onChange,
  dataType = 'number',
  inlineBody,
  index = '05',
}: FormatSectionProps) {
  const presets = PRESETS_BY_TYPE[dataType] ?? [];
  const current = value.valueFormatter;
  const activePreset: PresetId | undefined =
    current && current.kind === 'preset' ? current.preset : undefined;
  const excelFormat: string = current && current.kind === 'excelFormat' ? current.format : '';

  const selectPreset = (preset: PresetId | undefined) => {
    const next: ValueFormatterTemplate | undefined = preset
      ? { kind: 'preset', preset }
      : undefined;
    onChange({ valueFormatter: next });
  };

  const setExcelFormat = (format: string) => {
    const trimmed = format.trim();
    if (!trimmed) return onChange({ valueFormatter: undefined });
    onChange({ valueFormatter: { kind: 'excelFormat', format: trimmed } });
  };

  const body = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '6px 8px',
        background: 'var(--ds-surface-secondary)',
        border: '1px solid var(--ds-border-primary)',
        borderRadius: 2,
      }}
    >
      {presets.length > 0 && (
        <>
          <Caps size="xs" style={{ paddingLeft: 4 }}>
            PRESET
          </Caps>
          <PillToggleGroup>
            {presets.map((p) => (
              <PillToggleBtn
                key={p}
                active={activePreset === p}
                onClick={() => selectPreset(activePreset === p ? undefined : p)}
                title={p}
                style={{
                  minWidth: 40,
                  fontFamily: 'var(--ds-font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  padding: '0 8px',
                }}
              >
                {PRESET_LABEL[p]}
              </PillToggleBtn>
            ))}
          </PillToggleGroup>
          <TDivider />
        </>
      )}
      <Caps size="xs">EXCEL</Caps>
      <IconInput
        icon={<Hash size={12} strokeWidth={2} />}
        value={excelFormat}
        onCommit={setExcelFormat}
        monospace
        placeholder={dataType === 'date' ? 'yyyy-mm-dd' : '#,##0.00'}
        data-testid="style-editor-excel-format"
      />
    </div>
  );

  if (inlineBody) return body;
  return (
    <Band index={index} title="FORMAT">
      {body}
    </Band>
  );
}
