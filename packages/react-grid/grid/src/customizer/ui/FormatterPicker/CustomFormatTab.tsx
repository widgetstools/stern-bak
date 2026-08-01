import { Check, Copy, Hash, X } from 'lucide-react';
import { isValidExcelFormat } from '@wellsfargo-starui/core';
import { controls, radius, spacing, typography } from '@wellsfargo-starui/design-system/tokens';
import type { ValueFormatterTemplate } from '@wellsfargo-starui/core';
import { Caps, IconInput, SubLabel } from '../SettingsPanel';
import { ChromeButton } from '../ChromeButton';
import { EXCEL_EXAMPLES } from './excelExamples';
import { CURRENCY_QUICK_INSERT, applyCurrencySymbol } from './currencyQuickInsert';
import type { FormatterPickerDataType } from './presetsForDataType';

const CHIP_HEIGHT = '22px';

/**
 * Custom-format tab body — the always-on escape hatch.
 *
 * Replaces the old nested `ExcelReferencePopover`: the categorised Excel
 * examples now render **inline** here (no popover-in-popover), alongside the
 * raw Excel-format input and the currency-symbol quick-insert builder. Picking
 * an example or applying the input commits the format and closes the popover.
 */
export function CustomFormatTab({
  value,
  onChange,
  draftExcel,
  setDraftExcel,
  isExcelValid,
  commitExcel,
  dataType,
  close,
  testId,
}: {
  value: ValueFormatterTemplate | undefined;
  onChange: (template: ValueFormatterTemplate | undefined) => void;
  draftExcel: string;
  setDraftExcel: (next: string) => void;
  isExcelValid: boolean;
  commitExcel: (format: string) => void;
  dataType: FormatterPickerDataType;
  close: () => void;
  testId?: string;
}) {
  const pickExample = (format: string) => {
    // Clipboard write mirrors the old reference popover; swallow rejections
    // (clipboard can fail on http:// origins, etc.).
    void navigator.clipboard?.writeText(format).catch(() => {});
    setDraftExcel(format);
    commitExcel(format);
    close();
  };

  return (
    <div className="flex flex-col gap-2.5 font-sans" data-testid={testId ? `${testId}-custom` : undefined}>
      {/* Currency-symbol quick-insert — seeds / swaps the symbol in the draft. */}
      <div className="flex flex-col gap-1">
        <SubLabel>Custom Excel format</SubLabel>
        <div className="flex items-center gap-1 flex-wrap">
          <Caps size="2xs" color="var(--ds-text-faint)" style={{ paddingRight: spacing[1] }}>
            SYMBOL
          </Caps>
          {CURRENCY_QUICK_INSERT.map((c) => (
            <ChromeButton
              key={c.symbol}
              type="button"
              title={`Insert ${c.aria}`}
              aria-label={`Insert ${c.aria}`}
              data-testid={testId ? `${testId}-currency-${c.label.toLowerCase()}` : undefined}
              onClick={() => {
                const next = applyCurrencySymbol(draftExcel, c.symbol);
                setDraftExcel(next);
                commitExcel(next);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: controls.sm.height,
                height: CHIP_HEIGHT,
                padding: `0 ${spacing[1.5]}px`,
                background: 'var(--ds-surface-ground)',
                border: '1px solid var(--ds-border-primary)',
                borderRadius: radius.md,
                color: 'var(--ds-text-primary)',
                cursor: 'pointer',
                fontFamily: 'var(--ds-font-mono)',
                fontSize: controls.sm.fontSize,
                lineHeight: 1,
              }}
            >
              {c.label}
            </ChromeButton>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex-1">
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
          {/* Apply — commit + close. Disabled on empty / invalid. */}
          <CustomActionButton
            icon={<Check size={12} strokeWidth={2.25} />}
            title="Apply format"
            accent="green"
            disabled={!draftExcel.trim() || !isExcelValid}
            data-testid={testId ? `${testId}-apply` : undefined}
            onClick={() => {
              commitExcel(draftExcel);
              close();
            }}
          />
          {/* Clear — wipes draft + committed formatter, stays open to retype. */}
          <CustomActionButton
            icon={<X size={12} strokeWidth={2.25} />}
            title="Clear format"
            accent="red"
            disabled={!draftExcel && !value}
            data-testid={testId ? `${testId}-clear-inline` : undefined}
            onClick={() => {
              setDraftExcel('');
              onChange(undefined);
            }}
          />
        </div>
      </div>

      <div className="h-px bg-border shrink-0" />

      {/* Inline reference — formerly the nested ExcelReferencePopover. */}
      <div
        className="flex flex-col gap-2 overflow-y-auto pr-0.5"
        style={{ maxHeight: 220, scrollbarColor: 'var(--ds-border-primary) transparent', scrollbarWidth: 'thin' }}
        data-testid={testId ? `${testId}-reference` : undefined}
      >
        {EXCEL_EXAMPLES.map((cat) => (
          <div key={cat.title}>
            <SubLabel>{cat.title}</SubLabel>
            <ul className="m-0 mt-1 grid list-none gap-0.5 p-0">
              {cat.examples.map((ex) => {
                const copyable = !ex.format.startsWith('—');
                return (
                  <li key={`${cat.title}:${ex.format}`}>
                    <ChromeButton
                      type="button"
                      onClick={() => copyable && pickExample(ex.format)}
                      disabled={!copyable}
                      style={{
                        width: '100%',
                        display: 'grid',
                        gridTemplateColumns: '130px 1fr auto',
                        alignItems: 'center',
                        gap: spacing[2],
                        padding: `${spacing[1]}px ${spacing[1.5]}px`,
                        background: 'transparent',
                        border: '1px solid transparent',
                        borderRadius: radius.md,
                        cursor: copyable ? 'pointer' : 'default',
                        textAlign: 'left',
                        color: 'var(--ds-text-primary)',
                        fontFamily: 'inherit',
                        fontSize: controls.sm.fontSize,
                      }}
                      onMouseEnter={(e) => {
                        if (copyable) (e.currentTarget as HTMLButtonElement).style.background = 'var(--ds-surface-tertiary)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      <span style={{ color: 'var(--ds-text-secondary)' }}>{ex.label}</span>
                      <code
                        style={{
                          fontFamily: 'var(--ds-font-mono)',
                          fontSize: typography.fontSize.xs,
                          color: 'var(--ds-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {ex.format}
                      </code>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: spacing[1],
                          fontSize: typography.fontSize.xs,
                          color: 'var(--ds-text-muted)',
                          fontFamily: 'var(--ds-font-mono)',
                        }}
                      >
                        {ex.sample}
                        {copyable ? <Copy size={11} strokeWidth={1.75} style={{ opacity: 0.5 }} /> : null}
                      </span>
                    </ChromeButton>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Square accent-tinted icon button (Apply ✓ / Clear ×) next to the custom
 * input. Local to this tab — the design-system Pill is too heavy here.
 */
function CustomActionButton({
  icon,
  title,
  accent,
  disabled,
  onClick,
  ...rest
}: {
  icon: React.ReactNode;
  title: string;
  accent: 'green' | 'red';
  disabled?: boolean;
  onClick: () => void;
  'data-testid'?: string;
}) {
  return (
    <ChromeButton
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      data-testid={rest['data-testid']}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: controls.sm.height,
        height: controls.sm.height,
        padding: 0,
        background: 'transparent',
        border: '1px solid var(--ds-border-secondary)',
        borderRadius: radius.md,
        color: disabled ? 'var(--ds-text-faint)' : accent === 'green' ? 'var(--ds-primary)' : 'var(--ds-accent-negative)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {icon}
    </ChromeButton>
  );
}
