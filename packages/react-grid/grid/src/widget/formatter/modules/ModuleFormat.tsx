/**
 * 04 · FORMAT — currency / percent / thousands / decimals± / tick / picker.
 *
 * Quick-format actions for numeric data. The full FormatterPicker
 * (Excel-format input + presets) attaches at the end. Header target
 * disables the whole module since headers don't carry formatters.
 */
import { spacing } from '@wellsfargo-starui/design-system/tokens';
import {
  ArrowLeft, ArrowRight, DollarSign, Hash, Percent,
} from 'lucide-react';
import type { ValueFormatterTemplate } from '@wellsfargo-starui/core';
import { FormatterPicker } from '../../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import {
  BPS_TEMPLATE,
  COMMA_TEMPLATE,
  CURRENCY_FORMATTERS,
  PERCENT_TEMPLATE,
  isCommaTemplate,
  isPercentTemplate,
  templateDecimals,
} from '../../formatterPresets';
import { Hair, Module, Pill, ToolbarSelect } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

const TICK_MENU = [
  { token: 'TICK32',      label: '32nds',                 denominator: '32',  sample: '100-16' },
  { token: 'TICK32_PLUS', label: "32nds with +",          denominator: '32+', sample: '100-16+' },
  { token: 'TICK64',      label: '64ths',                 denominator: '64',  sample: '100-32' },
  { token: 'TICK128',     label: '128ths',                denominator: '128', sample: '100-064' },
  { token: 'TICK256',     label: '256ths',                denominator: '256', sample: '100-128' },
] as const;

function currentTickToken(t: ValueFormatterTemplate | undefined): typeof TICK_MENU[number]['token'] | null {
  return t && t.kind === 'tick' ? (t.tick as typeof TICK_MENU[number]['token']) : null;
}

function currencyKeyFromTemplate(t: ValueFormatterTemplate | undefined): string {
  if (!t) return '';
  if (t.kind === 'preset' && t.preset === 'currency') {
    const code = (t.options as { currency?: string } | undefined)?.currency;
    if (code && CURRENCY_FORMATTERS[code]) return code;
  }
  if (t.kind === 'expression' && BPS_TEMPLATE.kind === 'expression' && t.expression === BPS_TEMPLATE.expression) {
    return 'BPS';
  }
  return '';
}

/**
 * Body of the Format module without the Module wrapper — the horizontal
 * toolbar renders this directly as its NUMBER segment; the vertical
 * panel keeps the wrapped {@link ModuleFormat}.
 */
export function FormatCluster({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  const { fmt, disabled, isHeader, pickerDataType, scope } = state;
  const vft = fmt.valueFormatterTemplate;
  // Per-column (SELECTED): formatter only makes sense for `number` columns.
  // Global (ALL + CELLS): formatter is always available — the transform
  // filters at apply time so it only lands on number / date / string
  // columns. Headers never carry formatters in either scope.
  const fmtDisabled =
    isHeader ||
    (scope === 'selected' && (disabled || pickerDataType !== 'number'));

  const currencyValue = currencyKeyFromTemplate(vft);
  const tickValue = currentTickToken(vft) ?? '';
  const decimals = templateDecimals(vft);

  return (
    <>
      <ToolbarSelect
        value={currencyValue}
        onValueChange={(next) => {
          if (!next) {
            actions.doFormat(undefined);
            return;
          }
          if (next === 'BPS') {
            actions.doFormat(BPS_TEMPLATE);
            return;
          }
          const choice = CURRENCY_FORMATTERS[next];
          if (choice) actions.doFormat(choice.template);
        }}
        disabled={fmtDisabled}
        icon={<DollarSign size={13} strokeWidth={2.75} />}
        iconClassName="opacity-100 text-[color:var(--ds-accent-positive)]"
        placeholder="Currency"
        hideValueWhenEmpty
        tooltip="Pick a currency (USD, EUR, GBP, JPY, basis points)"
        aria-label="Currency format"
        data-testid="fmt-currency-select"
        options={[
          { value: '', label: 'None' },
          ...Object.entries(CURRENCY_FORMATTERS).map(([key, f]) => ({
            value: key,
            label: (
              <span className="inline-flex items-center gap-2">
                <span className="w-5 font-mono text-[color:var(--ds-text-secondary)]">{f.label}</span>
                <span>{key}</span>
              </span>
            ),
          })),
          { value: 'BPS', label: 'Basis points' },
        ]}
      />

      <Pill
        disabled={fmtDisabled}
        tooltip="Percentage"
        active={!fmtDisabled && isPercentTemplate(vft)}
        onClick={() => actions.doFormat(isPercentTemplate(vft) ? undefined : PERCENT_TEMPLATE)}
      >
        <Percent size={13} strokeWidth={1.75} />
      </Pill>

      <Pill
        disabled={fmtDisabled}
        tooltip="Thousands (1,234)"
        active={!fmtDisabled && isCommaTemplate(vft)}
        onClick={() => actions.doFormat(isCommaTemplate(vft) ? undefined : COMMA_TEMPLATE)}
      >
        <Hash size={13} strokeWidth={1.75} />
      </Pill>

      <Hair />

      {/* Decimals ± with a live precision readout between them, so the
          user sees the current decimal count instead of tapping blind. */}
      <Pill disabled={fmtDisabled} tooltip="Fewer decimals" onClick={actions.decreaseDecimals} variant="text">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing.px }}>
          <ArrowLeft size={9} strokeWidth={2} />
          .0
        </span>
      </Pill>
      <span
        data-testid="fmt-decimals-readout"
        aria-hidden
        title={
          decimals == null
            ? 'No fixed decimal places'
            : `${decimals} decimal place${decimals === 1 ? '' : 's'}`
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 14,
          height: 18,
          padding: `0 ${spacing[1]}px`,
          fontFamily: 'var(--ds-font-mono)',
          fontSize: 10,
          fontVariantNumeric: 'tabular-nums',
          color: fmtDisabled ? 'var(--ds-text-faint)' : 'var(--ds-text-secondary)',
          opacity: fmtDisabled ? 0.5 : 1,
        }}
      >
        {decimals == null ? '—' : decimals}
      </span>
      <Pill disabled={fmtDisabled} tooltip="More decimals" onClick={actions.increaseDecimals} variant="text">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing.px }}>
          .0
          <ArrowRight size={9} strokeWidth={2} />
        </span>
      </Pill>

      <Hair />

      <ToolbarSelect
        value={tickValue}
        onValueChange={(next) => {
          if (!next) {
            actions.doFormat(undefined);
            return;
          }
          actions.doFormat({ kind: 'tick', tick: next as typeof TICK_MENU[number]['token'] });
        }}
        disabled={fmtDisabled}
        icon={
          <span className="font-mono text-[10px] font-bold leading-none tabular-nums">1/32</span>
        }
        iconClassName="opacity-100 text-[color:var(--ds-text-secondary)]"
        placeholder="Tick"
        hideValueWhenEmpty
        tooltip="Tick precision — choose denominator (32, 64, 128, 256)"
        aria-label="Tick format"
        data-testid="fmt-tick-select"
        options={[
          { value: '', label: 'None' },
          ...TICK_MENU.map((m) => ({
            value: m.token,
            label: (
              <span className="inline-flex w-full items-center gap-2">
                <span className="flex-1">{m.label}</span>
                <span className="font-mono text-[10px] text-[color:var(--ds-text-secondary)] tabular-nums">{m.sample}</span>
              </span>
            ),
          })),
        ]}
      />

      <Hair />

      {/*
        CELLS + ALL scope renders TWO pickers — Number and Date/time — so
        the user can author a global number format AND a global date or
        datetime format without first selecting a column of the matching
        type. Other scopes keep a single picker driven by the active
        column's `pickerDataType`.
      */}
      {scope === 'all' && !isHeader ? (
        <>
          <FormatterPicker
            dataType="number"
            value={state.globalNumberFormatter}
            onChange={(next) => actions.doFormat(next, 'number')}
            defaultCollapsed
            compact
            data-testid="fmt-picker-toolbar-number"
          />
          <FormatterPicker
            dataType="datetime"
            value={state.globalDateFormatter}
            onChange={(next) => actions.doFormat(next, 'date')}
            defaultCollapsed
            compact
            data-testid="fmt-picker-toolbar-date"
          />
        </>
      ) : (
        <FormatterPicker
          dataType={pickerDataType}
          value={vft}
          onChange={(next) => actions.doFormat(next)}
          defaultCollapsed
          compact
          data-testid="fmt-picker-toolbar"
        />
      )}
    </>
  );
}

export function ModuleFormat({
  state,
  actions,
}: {
  state: FormatterState;
  actions: FormatterActions;
}) {
  return (
    <Module index="04" label="Format">
      <FormatCluster state={state} actions={actions} />
    </Module>
  );
}
