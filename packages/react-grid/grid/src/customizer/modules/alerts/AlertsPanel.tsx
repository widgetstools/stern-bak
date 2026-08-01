/**
 * Alerts customizer panel — rules list (left) + module settings + rule editor (right).
 *
 * Mounted three ways:
 *   - SettingsSheet uses `ListPane` + `EditorPane` (master-detail).
 *   - `SettingsPanel` (`AlertsPanel`) is the flat combined layout fallback.
 *   - `AlertsSettingsBand` is reused in the toolbar bell popover for quick mute.
 *
 * Module-level settings (enable, frequency, channels, history) live in the
 * editor pane above the selected rule — not in the list rail.
 *
 * All form controls are shadcn primitives from `@wellsfargo-starui/react` — no native
 * `<input>`, `<select>`, or `<button>` (per CLAUDE.md UI stack rules).
 */

import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bell, Copy, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@wellsfargo-starui/react';
import type { EditorPaneProps, ListPaneProps } from '@wellsfargo-starui/engine';
import {
  DEFAULT_ALERTS_SETTINGS,
  type AlertChannel,
  type AlertRule,
  type AlertSeverity,
  type AlertsSettings,
  type AlertsState,
  type EvaluationMode,
  type RelativeChangeDirection,
  type RelativeChangeMode,
} from '@wellsfargo-starui/engine';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useModuleState } from '../../hooks/useModuleState';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useDirty } from '../../hooks/useDirty';
import { useGridColumns } from '../../hooks/useGridColumns';
import { RuleEditorHeader } from '../conditional-styling/editor/RuleEditorHeader';
import { ExpressionBand } from '../conditional-styling/editor/ExpressionBand';
import {
  Band,
  CockpitList,
  CockpitListItem,
  FigmaPanelSection,
  LedBar,
  SubLabel,
} from '../../ui/SettingsPanel';

const MODULE_ID = 'alerts';

// ─── Helpers ───────────────────────────────────────────────────────────────

function newRuleId(): string {
  return `alert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function defaultRule(): AlertRule {
  return {
    id: newRuleId(),
    name: 'New alert',
    enabled: true,
    priority: 0,
    severity: 'warning',
    trigger: { kind: 'dataChange', expression: '' },
    message: '{rule} fired on {rowId}',
    channels: ['toast', 'badge', 'openfin'],
  };
}

function cloneRule(source: AlertRule, existingNames: ReadonlyArray<string>): AlertRule {
  const names = new Set(existingNames);
  const base = `${source.name} (copy)`;
  let candidate = base;
  let i = 2;
  while (names.has(candidate)) {
    candidate = `${base} ${i}`;
    i += 1;
  }
  return {
    ...JSON.parse(JSON.stringify(source)),
    id: newRuleId(),
    name: candidate,
  } as AlertRule;
}

function isOpenFinHost(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as unknown as { fin?: unknown }).fin);
}

// ─── Settings band (module-level controls) ─────────────────────────────────

interface AlertsSettingsBandProps {
  settings: AlertsSettings;
  onChange: (updater: (prev: AlertsSettings) => AlertsSettings) => void;
}

export function AlertsSettingsBand({ settings, onChange }: AlertsSettingsBandProps) {
  const openFinDetected = isOpenFinHost();
  const setEvalMode = (mode: EvaluationMode) =>
    onChange((prev) => ({ ...prev, evaluationMode: mode }));

  return (
    <div
      className="ds-alerts-settings-band grid grid-cols-2 gap-x-3 gap-y-0 [&_section]:px-4"
      data-testid="alerts-settings-band"
    >
      <div className="min-w-0">
        <Band title="Alerts">
          <div className="flex items-center justify-between gap-3 py-1">
            <SubLabel>Enable alerts</SubLabel>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => onChange((prev) => ({ ...prev, enabled: v }))}
              aria-label="Enable alerts"
              data-testid="alerts-enabled-switch"
            />
          </div>
        </Band>

        <Band title="Frequency">
          <div className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <SubLabel>Evaluation mode</SubLabel>
              <RadioGroup
                value={settings.evaluationMode}
                onValueChange={(v) => setEvalMode(v as EvaluationMode)}
                className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-3"
              >
                <Label className="flex items-center gap-1.5 text-xs">
                  <RadioGroupItem value="realtime" data-testid="alerts-mode-realtime" />
                  Realtime
                </Label>
                <Label className="flex items-center gap-1.5 text-xs">
                  <RadioGroupItem value="throttled" data-testid="alerts-mode-throttled" />
                  Throttled
                </Label>
                <Label className="flex items-center gap-1.5 text-xs">
                  <RadioGroupItem value="paused" data-testid="alerts-mode-paused" />
                  Paused
                </Label>
              </RadioGroup>
            </div>

            <SliderRow
              label="Default debounce (ms)"
              min={0}
              max={10_000}
              step={100}
              value={settings.defaultDebounceMs}
              onChange={(v) => onChange((prev) => ({ ...prev, defaultDebounceMs: v }))}
              testIdPrefix="alerts-debounce"
            />

            <SliderRow
              label="Max notifications / sec"
              min={1}
              max={50}
              step={1}
              value={settings.maxNotificationsPerSecond}
              onChange={(v) =>
                onChange((prev) => ({ ...prev, maxNotificationsPerSecond: v }))
              }
              testIdPrefix="alerts-rate"
            />
          </div>
        </Band>
      </div>

      <div className="min-w-0">
        <Band title="Channels">
          <div className="space-y-2">
            <ChannelToggle
              label="Show toasts"
              checked={settings.enabledChannels.toast}
              onChange={(v) =>
                onChange((prev) => ({
                  ...prev,
                  enabledChannels: { ...prev.enabledChannels, toast: v },
                }))
              }
              testId="alerts-channel-toast"
            />
            <ChannelToggle
              label="Show toolbar badge"
              checked={settings.enabledChannels.badge}
              onChange={(v) =>
                onChange((prev) => ({
                  ...prev,
                  enabledChannels: { ...prev.enabledChannels, badge: v },
                }))
              }
              testId="alerts-channel-badge"
            />
            <ChannelToggle
              label={
                openFinDetected
                  ? 'OpenFin notification centre'
                  : 'OpenFin notification centre (host not detected)'
              }
              checked={settings.enabledChannels.openfin}
              onChange={(v) =>
                onChange((prev) => ({
                  ...prev,
                  enabledChannels: { ...prev.enabledChannels, openfin: v },
                }))
              }
              disabled={!openFinDetected}
              testId="alerts-channel-openfin"
            />
          </div>
        </Band>

        <Band title="History">
          <div className="flex items-center justify-between gap-3 py-1">
            <SubLabel>Keep last N notifications</SubLabel>
            <Input
              type="number"
              min={1}
              max={5000}
              value={settings.historyLimit}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next >= 1) {
                  onChange((prev) => ({ ...prev, historyLimit: Math.min(next, 5000) }));
                }
              }}
              className="w-24 text-right"
              data-testid="alerts-history-limit"
            />
          </div>
        </Band>
      </div>
    </div>
  );
}

/** Module-level settings — collapsed by default to preserve rule editor space. */
function AlertsGlobalSettingsSection({ settings, onChange }: AlertsSettingsBandProps) {
  return (
    <FigmaPanelSection
      title="Global settings"
      defaultCollapsed
      data-testid="alerts-global-settings"
    >
      <AlertsSettingsBand settings={settings} onChange={onChange} />
    </FigmaPanelSection>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  testIdPrefix,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <SubLabel>{label}</SubLabel>
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => {
            const next = Number(e.target.value);
            if (Number.isFinite(next)) onChange(Math.min(Math.max(next, min), max));
          }}
          className="w-24 text-right"
          data-testid={`${testIdPrefix}-input`}
        />
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(arr) => {
          const next = arr[0];
          if (Number.isFinite(next)) onChange(next);
        }}
        data-testid={`${testIdPrefix}-slider`}
      />
    </div>
  );
}

function ChannelToggle({
  label,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <SubLabel>{label}</SubLabel>
      <Switch
        checked={checked && !disabled}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
        data-testid={testId}
      />
    </div>
  );
}

// ─── Dirty LED for the list rail ───────────────────────────────────────────

function DirtyListLed({ ruleId }: { ruleId: string }) {
  const { isDirty } = useDirty(`${MODULE_ID}:${ruleId}`);
  if (!isDirty) return null;
  return <LedBar amber on title="Unsaved changes" />;
}

const SEVERITIES: AlertSeverity[] = ['info', 'success', 'warning', 'critical'];

// ─── Severity picker (text labels need auto width — not 28px pill toggles) ─

function AlertsSeverityPicker({
  value,
  onChange,
  ruleId,
}: {
  value: AlertSeverity;
  onChange: (severity: AlertSeverity) => void;
  ruleId: string;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as AlertSeverity)}
      className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
      data-testid={`alerts-severity-group-${ruleId}`}
    >
      {SEVERITIES.map((s) => (
        <Label
          key={s}
          className="flex cursor-pointer items-center gap-2 rounded-sm border border-border px-2 py-1.5 text-xs has-[[data-state=checked]]:border-[color:var(--ds-primary)] has-[[data-state=checked]]:bg-[var(--ds-primary-soft)]"
        >
          <RadioGroupItem value={s} data-testid={`alerts-severity-${s}-${ruleId}`} />
          <span className="capitalize">{s}</span>
        </Label>
      ))}
    </RadioGroup>
  );
}

// ─── List pane ─────────────────────────────────────────────────────────────

function AlertsRulesList({
  selectedId,
  onSelect,
}: ListPaneProps) {
  const [state, setState] = useModuleState<AlertsState>(MODULE_ID);

  const addRule = useCallback(() => {
    const rule = defaultRule();
    setState((prev) => ({ ...prev, rules: [...prev.rules, rule] }));
    onSelect(rule.id);
  }, [setState, onSelect]);

  const cloneSelected = useCallback(
    (sourceId: string) => {
      setState((prev) => {
        const src = prev.rules.find((r) => r.id === sourceId);
        if (!src) return prev;
        const clone = cloneRule(src, prev.rules.map((r) => r.name));
        return { ...prev, rules: [...prev.rules, clone] };
      });
    },
    [setState],
  );

  const deleteRule = useCallback(
    (id: string) => {
      setState((prev) => ({ ...prev, rules: prev.rules.filter((r) => r.id !== id) }));
      if (selectedId === id) onSelect(null);
    },
    [setState, selectedId, onSelect],
  );

  return (
    <div className="ds-alerts-list flex min-h-0 flex-1 flex-col gap-2 p-2">
      <div className="flex shrink-0 items-center justify-between">
        <SubLabel>Alert rules</SubLabel>
        <Button
          variant="ghost"
          size="icon"
          onClick={addRule}
          aria-label="Add rule"
          data-testid="alerts-add-rule"
        >
          <Plus size={14} />
        </Button>
      </div>
      <CockpitList className="min-h-0 flex-1 overflow-y-auto">
        {state.rules.length === 0 ? (
          <div className="px-2 py-3 text-xs text-[color:var(--ds-text-muted)]">
            No rules yet — click <Plus className="inline" size={10} /> to create one.
          </div>
        ) : (
          state.rules.map((rule) => (
            <CockpitListItem
              key={rule.id}
              value={rule.id}
              active={rule.id === selectedId}
              onSelect={() => onSelect(rule.id)}
              data-testid={`alerts-rule-row-${rule.id}`}
            >
              <div className="flex w-full items-center gap-2">
                <Bell
                  size={12}
                  className={rule.enabled ? '' : 'opacity-40'}
                  aria-hidden
                />
                <span className="flex-1 truncate text-xs">{rule.name}</span>
                <DirtyListLed ruleId={rule.id} />
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  {rule.trigger.kind === 'dataChange'
                    ? 'data'
                    : rule.trigger.kind === 'relativeChange'
                      ? 'Δ'
                      : 'row'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    cloneSelected(rule.id);
                  }}
                  aria-label="Clone rule"
                  data-testid={`alerts-clone-${rule.id}`}
                >
                  <Copy size={11} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteRule(rule.id);
                  }}
                  aria-label="Delete rule"
                  data-testid={`alerts-delete-${rule.id}`}
                >
                  <Trash2 size={11} />
                </Button>
              </div>
            </CockpitListItem>
          ))
        )}
      </CockpitList>
    </div>
  );
}

export function AlertsList({ selectedId, onSelect }: ListPaneProps) {
  const [state] = useModuleState<AlertsState>(MODULE_ID);

  useEffect(() => {
    if (!selectedId && state.rules.length > 0) {
      onSelect(state.rules[0].id);
    }
  }, [selectedId, state.rules, onSelect]);

  return <AlertsRulesList selectedId={selectedId} onSelect={onSelect} gridId="" />;
}

// ─── Editor pane ───────────────────────────────────────────────────────────

export function AlertsEditor({ selectedId }: EditorPaneProps) {
  const [state, setState] = useModuleState<AlertsState>(MODULE_ID);

  const onSettingsChange = useCallback(
    (updater: (prev: AlertsSettings) => AlertsSettings) =>
      setState((prev) => ({
        ...prev,
        settings: updater(prev.settings ?? { ...DEFAULT_ALERTS_SETTINGS }),
      })),
    [setState],
  );

  const ruleExists =
    selectedId != null && state.rules.some((r) => r.id === selectedId);

  return (
    <div
      data-testid="alerts-panel"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      {ruleExists ? (
        <AlertRuleEditor ruleId={selectedId}>
          <AlertsGlobalSettingsSection
            settings={state.settings}
            onChange={onSettingsChange}
          />
        </AlertRuleEditor>
      ) : (
        <div className="ds-editor-scroll min-h-0 flex-1 overflow-y-auto">
          <AlertsGlobalSettingsSection
            settings={state.settings}
            onChange={onSettingsChange}
          />
          <p className="px-4 py-6 text-xs text-[color:var(--ds-text-muted)]">
            Select a rule in the list to edit its trigger, message, and channels.
          </p>
        </div>
      )}
    </div>
  );
}

const AlertRuleEditor = memo(function AlertRuleEditor({
  ruleId,
  children,
}: {
  ruleId: string;
  children?: ReactNode;
}) {
  const platform = useGridPlatform();
  const engine = platform.resources.expression();
  const columns = useGridColumns();
  const columnIds = useMemo(
    () => columns.map((c) => c.colId).filter((id): id is string => !!id),
    [columns],
  );
  const columnsProvider = useCallback(
    () => columns.map((c) => ({ colId: c.colId, headerName: c.headerName })),
    [columns],
  );

  const { draft, setDraft, dirty, save, discard, missing } = useModuleDraft<
    AlertsState,
    AlertRule
  >({
    moduleId: MODULE_ID,
    itemId: ruleId,
    selectItem: (state) => state.rules.find((r) => r.id === ruleId),
    commitItem: (next) => (state) => ({
      ...state,
      rules: state.rules.map((r) => (r.id === ruleId ? next : r)),
    }),
  });

  if (missing || !draft) return null;

  const expression =
    draft.trigger.kind === 'dataChange' ? draft.trigger.expression : '';
  const validation = engine.validate(expression);

  const setTriggerKind = (kind: AlertRule['trigger']['kind']) => {
    if (kind === draft.trigger.kind) return;
    if (kind === 'dataChange') {
      setDraft({ trigger: { kind: 'dataChange', expression: '' } });
    } else if (kind === 'relativeChange') {
      setDraft({
        trigger: {
          kind: 'relativeChange',
          column: columnIds[0] ?? '',
          mode: 'ANY_CHANGE',
          direction: 'both',
        },
      });
    } else {
      setDraft({ trigger: { kind: 'rowChange', event: 'ROW_ADDED' } });
    }
  };

  return (
    <div
      data-testid="alerts-rule-editor"
      data-rule-testid={`alerts-rule-editor-${ruleId}`}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <RuleEditorHeader
        testIdPrefix="alerts-rule"
        ruleId={ruleId}
        name={draft.name}
        dirty={dirty}
        onNameChange={(name) => setDraft({ name })}
        onReset={discard}
        onSave={save}
      />

      <div className="ds-editor-scroll min-h-0 flex-1 overflow-y-auto pb-4">
        {children}
        <Band title="Rule">
          <div className="flex items-center justify-between py-1">
            <SubLabel>Enabled</SubLabel>
            <Switch
              checked={draft.enabled}
              onCheckedChange={(v) => setDraft({ enabled: v })}
              data-testid={`alerts-rule-enabled-${ruleId}`}
            />
          </div>
        </Band>

        <Band title="Severity">
          <AlertsSeverityPicker
            ruleId={ruleId}
            value={draft.severity}
            onChange={(severity) => setDraft({ severity })}
          />
        </Band>

        <Band title="Trigger">
          <Tabs value={draft.trigger.kind} onValueChange={(v) => setTriggerKind(v as AlertRule['trigger']['kind'])}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="dataChange" data-testid={`alerts-trigger-dataChange-${ruleId}`}>
                Expression
              </TabsTrigger>
              <TabsTrigger
                value="relativeChange"
                data-testid={`alerts-trigger-relativeChange-${ruleId}`}
              >
                Delta
              </TabsTrigger>
              <TabsTrigger value="rowChange" data-testid={`alerts-trigger-rowChange-${ruleId}`}>
                Row
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dataChange" className="space-y-2 pt-3">
              <ExpressionBand
                ruleId={ruleId}
                expression={draft.trigger.kind === 'dataChange' ? draft.trigger.expression : ''}
                validation={validation}
                columnsProvider={columnsProvider}
                expressionTestId={`alerts-rule-expression-${ruleId}`}
                onExpressionChange={(v) => {
                  if (draft.trigger.kind !== 'dataChange') return;
                  setDraft({ trigger: { ...draft.trigger, expression: v } });
                }}
              />
              <ColumnPicker
                label="Restrict to column (optional)"
                value={draft.trigger.kind === 'dataChange' ? draft.trigger.column ?? '' : ''}
                onChange={(v) => {
                  if (draft.trigger.kind !== 'dataChange') return;
                  const next = { ...draft.trigger };
                  if (v) next.column = v;
                  else delete next.column;
                  setDraft({ trigger: next });
                }}
                allowEmpty
                columnIds={columnIds}
                testId={`alerts-datachange-column-${ruleId}`}
              />
            </TabsContent>

            <TabsContent value="relativeChange" className="space-y-2 pt-3">
              {draft.trigger.kind === 'relativeChange' ? (
                <RelativeChangeBody
                  trigger={draft.trigger}
                  columnIds={columnIds}
                  onChange={(next) => setDraft({ trigger: next })}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="rowChange" className="space-y-2 pt-3">
              {draft.trigger.kind === 'rowChange' ? (
                <RadioGroup
                  value={draft.trigger.event}
                  onValueChange={(v) =>
                    setDraft({
                      trigger: {
                        kind: 'rowChange',
                        event: v as 'ROW_ADDED' | 'ROW_REMOVED',
                      },
                    })
                  }
                  className="flex flex-row gap-3"
                >
                  <Label className="flex items-center gap-1.5 text-xs">
                    <RadioGroupItem value="ROW_ADDED" data-testid={`alerts-row-added-${ruleId}`} />
                    Row added
                  </Label>
                  <Label className="flex items-center gap-1.5 text-xs">
                    <RadioGroupItem
                      value="ROW_REMOVED"
                      data-testid={`alerts-row-removed-${ruleId}`}
                    />
                    Row removed
                  </Label>
                </RadioGroup>
              ) : null}
            </TabsContent>
          </Tabs>
        </Band>

        <Band title="Message">
          <div className="space-y-1.5">
            <SubLabel>Template — placeholders: {'{rule} {rowId} {column} {value} {prev}'}</SubLabel>
            <Input
              value={draft.message}
              onChange={(e) => setDraft({ message: e.target.value })}
              data-testid={`alerts-message-input-${ruleId}`}
            />
          </div>
        </Band>

        <Band title="Channels">
          <div className="space-y-1">
            {(['toast', 'badge', 'openfin'] as const).map((channel) => (
              <div key={channel} className="flex items-center justify-between gap-3">
                <SubLabel>
                  {channel === 'toast'
                    ? 'Toast'
                    : channel === 'badge'
                      ? 'Toolbar badge'
                      : 'OpenFin notification centre'}
                </SubLabel>
                <Switch
                  checked={draft.channels.includes(channel)}
                  onCheckedChange={(v) => {
                    const set = new Set<AlertChannel>(draft.channels);
                    if (v) set.add(channel);
                    else set.delete(channel);
                    setDraft({ channels: Array.from(set) });
                  }}
                  data-testid={`alerts-rule-channel-${channel}-${ruleId}`}
                />
              </div>
            ))}
          </div>
        </Band>

        <Band title="Debounce">
          <SliderRow
            label="Per-rule debounce (ms, 0 = use default)"
            min={0}
            max={30_000}
            step={250}
            value={draft.debounceMs ?? 0}
            onChange={(v) =>
              setDraft({
                ...(v > 0 ? { debounceMs: v } : { debounceMs: undefined }),
              })
            }
            testIdPrefix={`alerts-rule-debounce-${ruleId}`}
          />
        </Band>
      </div>
    </div>
  );
});

function RelativeChangeBody({
  trigger,
  columnIds,
  onChange,
}: {
  trigger: Extract<AlertRule['trigger'], { kind: 'relativeChange' }>;
  columnIds: string[];
  onChange: (next: Extract<AlertRule['trigger'], { kind: 'relativeChange' }>) => void;
}) {
  return (
    <div className="space-y-2">
      <ColumnPicker
        label="Column"
        value={trigger.column}
        onChange={(v) => onChange({ ...trigger, column: v })}
        columnIds={columnIds}
        testId="alerts-relative-column"
      />
      <div className="flex flex-col gap-1">
        <SubLabel>Mode</SubLabel>
        <Select
          value={trigger.mode}
          onValueChange={(v) => onChange({ ...trigger, mode: v as RelativeChangeMode })}
        >
          <SelectTrigger data-testid="alerts-relative-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PERCENT_CHANGE">Percent change</SelectItem>
            <SelectItem value="ABSOLUTE_CHANGE">Absolute change</SelectItem>
            <SelectItem value="ANY_CHANGE">Any change</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {trigger.mode !== 'ANY_CHANGE' && (
        <div className="flex items-center gap-2">
          <Label className="w-20 text-xs">Threshold</Label>
          <Input
            type="number"
            min={0}
            step={trigger.mode === 'PERCENT_CHANGE' ? 0.1 : 0.01}
            value={trigger.threshold ?? 0}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next) && next >= 0) {
                onChange({ ...trigger, threshold: next });
              }
            }}
            data-testid="alerts-relative-threshold"
          />
          {trigger.mode === 'PERCENT_CHANGE' && <span className="text-xs">%</span>}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <SubLabel>Direction</SubLabel>
        <RadioGroup
          value={trigger.direction ?? 'both'}
          onValueChange={(v) =>
            onChange({ ...trigger, direction: v as RelativeChangeDirection })
          }
          className="flex flex-row gap-3"
        >
          <Label className="flex items-center gap-1.5 text-xs">
            <RadioGroupItem value="both" data-testid="alerts-relative-direction-both" />
            Either
          </Label>
          <Label className="flex items-center gap-1.5 text-xs">
            <RadioGroupItem value="up" data-testid="alerts-relative-direction-up" />
            Up only
          </Label>
          <Label className="flex items-center gap-1.5 text-xs">
            <RadioGroupItem value="down" data-testid="alerts-relative-direction-down" />
            Down only
          </Label>
        </RadioGroup>
      </div>
    </div>
  );
}

function ColumnPicker({
  label,
  value,
  onChange,
  columnIds,
  allowEmpty = false,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  columnIds: string[];
  allowEmpty?: boolean;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <SubLabel>{label}</SubLabel>
      <Select
        value={value || (allowEmpty ? '__none__' : '')}
        onValueChange={(v) => onChange(v === '__none__' ? '' : v)}
      >
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder="Pick a column" />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value="__none__">Any column</SelectItem>}
          {columnIds.map((id) => (
            <SelectItem key={id} value={id}>
              {id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Combined panel (settings + list + editor) ─────────────────────────────

export function AlertsPanel() {
  const [state] = useModuleState<AlertsState>(MODULE_ID);
  const [selectedId, setSelectedId] = useState<string | null>(state.rules[0]?.id ?? null);

  return (
    <div className="ds-alerts-panel flex min-h-0 flex-1 overflow-hidden border-t border-[color:var(--ds-border-default)]">
      <aside className="flex w-64 min-h-0 shrink-0 flex-col overflow-y-auto border-r border-[color:var(--ds-border-default)]">
        <AlertsRulesList
          gridId=""
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </aside>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AlertsEditor gridId="" selectedId={selectedId} />
      </section>
    </div>
  );
}
