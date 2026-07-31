import { useMemo, useState } from 'react';
import { ChevronDown, Hash, Search, X } from 'lucide-react';
import { controls, radius, spacing, typography } from '@wellsfargo-starui/design-system/tokens';
import { Input, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@wellsfargo-starui/ui';
import type { ValueFormatterTemplate } from '@wellsfargo-starui/engine';
import { FormatPopover } from '../format-editor';
import { SubLabel } from '../SettingsPanel';
import { ChromeButton } from '../ChromeButton';
import { CATEGORY_LABELS, categoriesForDataType } from './formatCategories';
import { CustomFormatTab } from './CustomFormatTab';
import {
  defaultSampleValue,
  presetsForCategory,
  presetsForDataType,
  type FormatterPreset,
} from './presetsForDataType';
import { filterPresets } from './presetSearch';
import { renderPreview, triggerCaption, type SharedBodyProps } from './formatterPickerShared';

// Inline data-chip dimension (CURRENT preview, clear) — one step tighter
// than controls.xs so chip rows read as data, not controls.
const CHIP_HEIGHT = '22px';
const CUSTOM_TAB = '__custom__';

/**
 * Compact (toolbar) presentation of FormatterPicker.
 *
 * A single chip trigger opens a shadcn popover containing a vertical
 * shadcn `Tabs` rail: one tab per format category that fits the column's
 * data type (see `categoriesForDataType`), plus an always-on **Custom**
 * tab. Each category tab lists its presets with a live sample rendered
 * from the real cell value. The Custom tab folds in the Excel-format input
 * and the full reference examples inline — there is no nested popover.
 */
export function CompactFormatterPicker({
  value,
  onChange,
  activePreset,
  preview,
  draftExcel,
  setDraftExcel,
  isExcelValid,
  commitExcel,
  pickPreset,
  dataType,
  testId,
}: SharedBodyProps) {
  const categories = useMemo(() => categoriesForDataType(dataType), [dataType]);
  const sample = useMemo(() => defaultSampleValue(dataType), [dataType]);
  // Open on the category of the applied format, else the primary category.
  const [tab, setTab] = useState<string>(activePreset?.category ?? categories[0] ?? CUSTOM_TAB);

  // Free-text search across every preset for this data type. A non-blank
  // query replaces the tabbed view with a flat result list.
  const [query, setQuery] = useState('');
  const allPresets = useMemo(() => presetsForDataType(dataType), [dataType]);
  const results = useMemo(() => filterPresets(allPresets, query), [allPresets, query]);
  const searching = query.trim().length > 0;

  return (
    <FormatPopover
      width={440}
      trigger={
        <ChromeButton
          type="button"
          title="Value formatter"
          data-testid={testId ? `${testId}-trigger` : undefined}
          className={cn(
            'inline-flex h-7 min-h-7 max-w-[180px] items-center gap-1.5 px-2',
            'rounded-[2px] border border-border/55 bg-transparent text-[11px] font-medium shadow-none',
            'text-foreground/90 hover:bg-accent/45 hover:border-border',
            value ? 'text-primary' : undefined,
          )}
        >
          <Hash size={12} strokeWidth={1.75} className="shrink-0 opacity-70" />
          <span className={cn('min-w-0 truncate tabular-nums', activePreset || !value ? 'font-sans' : 'font-mono')}>
            {triggerCaption(value, activePreset)}
          </span>
          <ChevronDown size={11} strokeWidth={1.75} className="shrink-0 opacity-50" />
        </ChromeButton>
      }
    >
      {({ close }) => (
        <div data-testid={testId} className="flex min-h-0 flex-1 flex-col gap-2.5 font-sans p-0.5">
          {/* CURRENT — live preview of the applied format + clear */}
          <div className="flex items-center gap-2 shrink-0">
            <SubLabel>CURRENT</SubLabel>
            <span
              title={preview || 'No formatter applied'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: spacing[1],
                height: CHIP_HEIGHT,
                padding: `0 ${spacing[2]}px`,
                background: preview ? 'var(--ds-primary-soft)' : 'var(--ds-surface-ground)',
                border: `1px dashed ${preview ? 'var(--ds-border-secondary)' : 'var(--ds-border-primary)'}`,
                borderRadius: radius.md,
                color: preview ? 'var(--ds-primary)' : 'var(--ds-text-faint)',
                fontFamily: 'var(--ds-font-mono)',
                fontSize: controls.sm.fontSize,
                fontVariantNumeric: 'tabular-nums',
                flex: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {preview || '—'}
            </span>
            <ChromeButton
              type="button"
              onClick={() => {
                setDraftExcel('');
                onChange(undefined);
              }}
              disabled={!value}
              title="Clear formatter"
              data-testid={testId ? `${testId}-clear` : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: CHIP_HEIGHT,
                height: CHIP_HEIGHT,
                padding: 0,
                background: 'transparent',
                border: '1px solid var(--ds-border-secondary)',
                borderRadius: radius.md,
                color: value ? 'var(--ds-accent-negative)' : 'var(--ds-text-faint)',
                cursor: value ? 'pointer' : 'default',
                opacity: value ? 1 : 0.4,
              }}
            >
              <X size={11} strokeWidth={2} />
            </ChromeButton>
          </div>

          {/* Search — a non-blank query flattens the tabs into one result list */}
          <div className="relative shrink-0">
            <Search
              size={12}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 opacity-50"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search formats…"
              aria-label="Search formats"
              data-testid={testId ? `${testId}-search` : undefined}
              className="h-7 rounded-[2px] pl-7 text-[11px]"
            />
          </div>

          {searching ? (
            <div className="min-h-0 flex-1" data-testid={testId ? `${testId}-results` : undefined}>
              {results.length ? (
                <PresetList
                  presets={results}
                  activeId={activePreset?.id}
                  sample={sample}
                  onPick={(p) => {
                    pickPreset(p);
                    close();
                  }}
                  testId={testId}
                />
              ) : (
                <p className="px-1 py-6 text-center text-[11px]" style={{ color: 'var(--ds-text-faint)' }}>
                  No formats match “{query.trim()}”. Try the Custom tab for an Excel format.
                </p>
              )}
            </div>
          ) : (
          /* Vertical category rail (shadcn Tabs) */
          <Tabs
            orientation="vertical"
            value={tab}
            onValueChange={setTab}
            className="flex min-h-0 flex-1 flex-row gap-2"
          >
            <TabsList className="h-auto w-[124px] shrink-0 flex-col items-stretch justify-start gap-0.5 self-start bg-transparent p-0">
              {categories.map((c) => (
                <TabsTrigger
                  key={c}
                  value={c}
                  // Explicit click activation: the popover preventDefaults
                  // mousedown (blocking focus), and Radix Tabs' automatic mode
                  // selects on focus — so click alone wouldn't switch tabs.
                  onClick={() => setTab(c)}
                  data-testid={testId ? `${testId}-tab-${c}` : undefined}
                  className={cn(
                    'flex w-full items-center justify-between rounded-[2px] px-2 py-1.5 text-[11px] font-medium',
                    'text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-surface-tertiary)]',
                    'data-[state=active]:bg-[color:var(--ds-primary-soft)] data-[state=active]:font-semibold',
                    'data-[state=active]:text-[color:var(--ds-primary)] data-[state=active]:[box-shadow:inset_2px_0_0_var(--ds-primary)]',
                  )}
                >
                  <span className="truncate">{CATEGORY_LABELS[c]}</span>
                  <span className="ml-1 font-mono text-[9px] opacity-60">{presetsForCategory(c).length}</span>
                </TabsTrigger>
              ))}
              <TabsTrigger
                value={CUSTOM_TAB}
                onClick={() => setTab(CUSTOM_TAB)}
                data-testid={testId ? `${testId}-tab-custom` : undefined}
                className={cn(
                  'flex w-full items-center justify-between rounded-[2px] px-2 py-1.5 text-[11px] font-medium',
                  'text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-surface-tertiary)]',
                  'data-[state=active]:bg-[color:var(--ds-primary-soft)] data-[state=active]:font-semibold',
                  'data-[state=active]:text-[color:var(--ds-primary)] data-[state=active]:[box-shadow:inset_2px_0_0_var(--ds-primary)]',
                )}
              >
                <span className="truncate">Custom</span>
                <Hash size={11} strokeWidth={2} className="opacity-60" />
              </TabsTrigger>
            </TabsList>

            <div className="min-w-0 flex-1">
              {categories.map((c) => (
                <TabsContent key={c} value={c} className="mt-0">
                  <PresetList
                    presets={presetsForCategory(c)}
                    activeId={activePreset?.id}
                    sample={sample}
                    onPick={(p) => {
                      pickPreset(p);
                      close();
                    }}
                    testId={testId}
                  />
                </TabsContent>
              ))}
              <TabsContent value={CUSTOM_TAB} className="mt-0">
                <CustomFormatTab
                  value={value}
                  onChange={onChange}
                  draftExcel={draftExcel}
                  setDraftExcel={setDraftExcel}
                  isExcelValid={isExcelValid}
                  commitExcel={commitExcel}
                  dataType={dataType}
                  close={close}
                  testId={testId}
                />
              </TabsContent>
            </div>
          </Tabs>
          )}
        </div>
      )}
    </FormatPopover>
  );
}

// ─── Preset list ──────────────────────────────────────────────────────────

function codeText(t: ValueFormatterTemplate): string {
  switch (t.kind) {
    case 'excelFormat':
      return t.format;
    case 'tick':
      return t.tick.replace('TICK', 'denom ').replace('_PLUS', '+').toLowerCase();
    case 'expression':
      return 'ƒ(x)';
    case 'preset':
      return t.preset;
  }
}

function PresetList({
  presets,
  activeId,
  sample,
  onPick,
  testId,
}: {
  presets: ReadonlyArray<FormatterPreset>;
  activeId: string | undefined;
  sample: unknown;
  onPick: (preset: FormatterPreset) => void;
  testId?: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 overflow-y-auto pr-0.5"
      style={{ maxHeight: 300, scrollbarColor: 'var(--ds-border-primary) transparent', scrollbarWidth: 'thin' }}
    >
      {presets.map((p) => {
        const active = activeId === p.id;
        const out = renderPreview(p.template, p.sampleValue !== undefined ? p.sampleValue : sample);
        return (
          <ChromeButton
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            title={p.hint ? `${p.label} · ${p.hint}` : p.label}
            data-testid={testId ? `${testId}-preset-${p.id}` : undefined}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              alignItems: 'center',
              gap: spacing[2],
              padding: `${spacing[1.5]}px ${spacing[2]}px`,
              background: active ? 'var(--ds-primary-soft)' : 'transparent',
              border: `1px solid ${active ? 'var(--ds-primary)' : 'transparent'}`,
              borderRadius: radius.md,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--ds-surface-tertiary)';
            }}
            onMouseLeave={(e) => {
              if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <span className="min-w-0">
              <span
                className="block truncate font-semibold leading-[1.15]"
                style={{ fontSize: controls.sm.fontSize, color: active ? 'var(--ds-primary)' : 'var(--ds-text-primary)' }}
              >
                {p.label}
              </span>
              <span
                className="block truncate"
                style={{ fontFamily: 'var(--ds-font-mono)', fontSize: typography.fontSize.xs, color: 'var(--ds-text-faint)' }}
              >
                {codeText(p.template)}
              </span>
            </span>
            {out ? (
              <span
                style={{
                  fontFamily: 'var(--ds-font-mono)',
                  fontSize: typography.fontSize.xs,
                  color: active ? 'var(--ds-primary)' : 'var(--ds-text-muted)',
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {out}
              </span>
            ) : null}
          </ChromeButton>
        );
      })}
    </div>
  );
}
