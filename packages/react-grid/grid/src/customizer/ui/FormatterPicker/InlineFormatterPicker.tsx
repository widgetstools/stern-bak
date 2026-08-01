import { useState } from 'react';
import { ChevronDown, ChevronLeft, Hash } from 'lucide-react';
import { isValidExcelFormat } from '@wellsfargo-starui/core';
import { controls, radius, spacing } from '@wellsfargo-starui/design-system/tokens';
import { FormatDropdown } from '../format-editor';
import { Caps, IconInput } from '../SettingsPanel';
import { ExcelReferencePopover } from './ExcelReferencePopover';
import { triggerCaption, type SharedBodyProps } from './formatterPickerShared';
import { ChromeButton } from '../ChromeButton';

/**
 * Inline (editor) presentation of FormatterPicker.
 *
 * Kept intentionally unchanged from the previous implementation —
 * editors have the vertical + horizontal room for a full row of
 * controls, and the inline form scans faster than opening a popover
 * on every format tweak inside a dense settings panel.
 *
 * Two sub-layouts:
 *  • `horizontal` (default): collapse-chevron + preset + custom + info + preview.
 *  • `vertical`: stack preset on top (full width), custom + info below.
 *    Suppresses the inline preview (the host header owns that). Designed
 *    for narrow panels (≤400px) like the FormattingPropertiesPanel popout
 *    where a single-row layout would overflow the column.
 */
export function InlineFormatterPicker({
  value,
  onChange,
  presets,
  activePreset,
  preview,
  draftExcel,
  setDraftExcel,
  isExcelValid,
  commitExcel,
  pickPreset,
  dataType,
  defaultCollapsed,
  layout = 'horizontal',
  testId,
}: SharedBodyProps & { defaultCollapsed: boolean; layout?: 'horizontal' | 'vertical' }) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  // All inline-form rows snap to the md control tier so picker controls
  // align with sibling editor inputs (28px high).
  const rowHeight = controls.md.height;

  // Vertical layout: stack preset on top, custom input + info below.
  // No collapse chevron (the host section is always-expanded in this
  // layout). No inline preview (host header owns that). Everything
  // full-width so it fits a narrow (≤360px) column without overflow.
  if (layout === 'vertical') {
    return (
      <div
        data-testid={testId}
        className="flex flex-col gap-1.5 w-full"
      >
        {/* Preset row — full-width dropdown trigger */}
        <FormatDropdown<string>
          value={activePreset?.id ?? ''}
          onChange={(id) => {
            const match = presets.find((p) => p.id === id);
            if (match) pickPreset(match);
          }}
          options={presets.map((p) => ({
            value: p.id,
            label: p.hint ? `${p.label} — ${p.hint}` : p.label,
          }))}
          width={280}
          trigger={
            <ChromeButton
              type="button"
              title="Presets"
              data-testid={testId ? `${testId}-preset` : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing[1.5],
                width: '100%',
                height: rowHeight,
                padding: `0 ${spacing[2]}px 0 ${spacing[2.5]}px`,
                background: 'var(--ds-surface-ground)',
                border: '1px solid var(--ds-border-primary)',
                borderRadius: radius.md,
                color: 'var(--ds-text-primary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: controls.sm.fontSize,
                letterSpacing: '0.02em',
              }}
            >
              <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis">
                {activePreset?.label ?? 'Preset…'}
              </span>
              <ChevronDown size={12} strokeWidth={1.75} className="opacity-60" />
            </ChromeButton>
          }
        />

        {/* Custom format row — input grows, info tooltip pinned right */}
        <div className="flex gap-1.5 w-full">
          <div className="flex-1 min-w-0">
            <IconInput
              icon={<Hash size={12} strokeWidth={2} />}
              value={draftExcel}
              onChange={(v) => {
                setDraftExcel(v);
                const trimmed = v.trim();
                if (!trimmed) {
                  if (value?.kind === 'excelFormat') onChange(undefined);
                  return;
                }
                if (isValidExcelFormat(trimmed)) {
                  onChange({ kind: 'excelFormat', format: trimmed });
                }
              }}
              onCommit={commitExcel}
              monospace
              placeholder={dataType === 'date' || dataType === 'datetime' ? 'yyyy-mm-dd' : '#,##0.00'}
              error={!isExcelValid}
              data-testid={testId ? `${testId}-excel` : undefined}
            />
          </div>
          <ExcelReferencePopover
            onPick={(format) => {
              setDraftExcel(format);
              commitExcel(format);
            }}
            data-testid={testId ? `${testId}-info` : undefined}
          />
        </div>
      </div>
    );
  }

  if (!expanded) {
    return (
      <ChromeButton
        type="button"
        onClick={() => setExpanded(true)}
        title="Expand format picker"
        data-testid={testId ? `${testId}-collapsed` : undefined}
        className="inline-flex items-center gap-1.5 h-7 px-2 bg-background border border-border rounded-sm text-foreground font-sans text-[length:var(--ds-control-sm-font-size)] cursor-pointer transition-[background,border-color] duration-120"
      >
        <Hash size={12} strokeWidth={1.75} className="opacity-60" />
        <span className="max-w-[140px] whitespace-nowrap overflow-hidden text-ellipsis font-mono tabular-nums">
          {triggerCaption(value, activePreset)}
        </span>
        <ChevronDown size={11} strokeWidth={1.75} className="opacity-50" />
      </ChromeButton>
    );
  }

  return (
    <div
      data-testid={testId}
      className="inline-flex items-center gap-1.5 p-1 bg-[var(--ds-surface-secondary)] border border-border rounded-sm font-sans"
    >
      <ChromeButton
        type="button"
        onClick={() => setExpanded(false)}
        title="Collapse"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: rowHeight,
          height: rowHeight,
          padding: 0,
          background: 'transparent',
          border: 'none',
          color: 'var(--ds-text-muted)',
          cursor: 'pointer',
        }}
      >
        <ChevronLeft size={12} strokeWidth={1.75} />
      </ChromeButton>

      <FormatDropdown<string>
        value={activePreset?.id ?? ''}
        onChange={(id) => {
          const match = presets.find((p) => p.id === id);
          if (match) pickPreset(match);
        }}
        options={presets.map((p) => ({
          value: p.id,
          label: p.hint ? `${p.label} — ${p.hint}` : p.label,
        }))}
        width={240}
        trigger={
          <ChromeButton
            type="button"
            title="Presets"
            data-testid={testId ? `${testId}-preset` : undefined}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: spacing[1.5],
              height: rowHeight,
              minWidth: 120,
              maxWidth: 240,
              padding: `0 ${spacing[1.5]}px 0 ${spacing[2.5]}px`,
              background: 'var(--ds-surface-ground)',
              border: '1px solid var(--ds-border-primary)',
              borderRadius: radius.md,
              color: 'var(--ds-text-primary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: controls.sm.fontSize,
              letterSpacing: '0.02em',
            }}
          >
            <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis">
              {activePreset?.label ?? 'Preset…'}
            </span>
            <ChevronDown size={12} strokeWidth={1.75} className="opacity-60" />
          </ChromeButton>
        }
      />

      <div className="w-[180px]">
        <IconInput
          icon={<Hash size={12} strokeWidth={2} />}
          value={draftExcel}
          onChange={(v) => {
            setDraftExcel(v);
            const trimmed = v.trim();
            if (!trimmed) {
              if (value?.kind === 'excelFormat') onChange(undefined);
              return;
            }
            if (isValidExcelFormat(trimmed)) {
              onChange({ kind: 'excelFormat', format: trimmed });
            }
          }}
          onCommit={commitExcel}
          monospace
          placeholder={dataType === 'date' || dataType === 'datetime' ? 'yyyy-mm-dd' : '#,##0.00'}
          error={!isExcelValid}
          data-testid={testId ? `${testId}-excel` : undefined}
        />
      </div>

      <ExcelReferencePopover
        onPick={(format) => {
          setDraftExcel(format);
          commitExcel(format);
        }}
        data-testid={testId ? `${testId}-info` : undefined}
      />

      {preview ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing[1],
            height: rowHeight,
            padding: `0 ${spacing[2]}px`,
            background: 'var(--ds-primary-soft)',
            border: '1px dashed var(--ds-border-secondary)',
            borderRadius: radius.md,
            color: 'var(--ds-primary)',
            fontFamily: 'var(--ds-font-mono)',
            fontSize: controls.sm.fontSize,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 180,
          }}
          title={`Preview: ${preview}`}
        >
          <Caps size="2xs" color="var(--ds-primary)">
            PREVIEW
          </Caps>
          {preview}
        </span>
      ) : null}
    </div>
  );
}
