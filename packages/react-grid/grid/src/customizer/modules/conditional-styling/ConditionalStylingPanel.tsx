/**
 * Conditional Styling settings panel — v4 rewrite.
 *
 * Same three v2 antipatterns removed as phases 3b and 3c, plus a
 * couple of smaller ones specific to this panel:
 *
 *  1. File-level `dirtyRegistry = new Set<string>()` +
 *     `window.dispatchEvent('gc-dirty-change')` broadcast bus →
 *     `useDirty('conditional-styling:<ruleId>')` against the per-platform
 *     `DirtyBus`. Same fix as 3b / 3c.
 *  2. Local `useGridColumns()` hook with hand-rolled `tick` state and
 *     raw `api.addEventListener` → the platform `useGridColumns()` hook
 *     (fingerprint-cached, ApiHub-wired, auto-disposed). The platform
 *     hook exposes `cellDataType` natively too, so the local one-off
 *     shape bridge goes with it.
 *  3. `useDraftModuleItem({ store, … })` + `useModuleState(store, id)`
 *     compat shims → `useModuleDraft` + the 1-arg `useModuleState(id)`.
 *  4. `new ExpressionEngine()` at module-load, side-stepping the
 *     platform's shared engine. Switched to
 *     `useGridPlatform().resources.expression()` so the panel's
 *     validation matches the engine that actually evaluates the rules
 *     downstream.
 *  5. `<RuleRow>` subscribed to the whole `conditional-styling` module
 *     state on every render just to read a committed snapshot it then
 *     `void`-ed out and never used. Dropped — row re-render cost falls
 *     from "whenever any keystroke edits any rule" to "only when the
 *     rule prop changes".
 *
 * All `cs-*` testIds preserved.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { FormatColorPicker, FormatPopover } from '../../ui/format-editor';
import type { EditorPaneProps, ListPaneProps } from '@wellsfargo-starui/engine';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useModuleState } from '../../hooks/useModuleState';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useDirty } from '../../hooks/useDirty';
import { useGridColumns } from '../../hooks/useGridColumns';
import {
  Band,
  Caps,
  CockpitList,
  CockpitListItem,
  LedBar,
  Mono,
  PillToggleBtn,
  PillToggleGroup,
  SubLabel,
} from '../../ui/SettingsPanel';
import { ChromeButton } from '../../ui/ChromeButton';
import { StyleEditor } from '../../ui/StyleEditor';
import { Tooltip } from '../../ui/HoverTooltip';
import type {
  ConditionalRule,
  ConditionalStylingState,
  IndicatorPosition,
  IndicatorTarget,
  RuleIndicator,
} from './state';
import { INDICATOR_ICONS, findIndicatorIcon } from './indicatorIcons';
import { fromStyleEditorValue, toStyleEditorValue } from './styleBridge';
import { RuleEditorHeader } from './editor/RuleEditorHeader';
import { RuleMetaStrip } from './editor/RuleMetaStrip';
import { ExpressionBand } from './editor/ExpressionBand';
import { TargetColumnsBand } from './editor/TargetColumnsBand';
import { FlashBand } from './editor/FlashBand';
import { AnimateBand } from './editor/AnimateBand';
import { ValueFormatterBand } from './editor/ValueFormatterBand';

const MODULE_ID = 'conditional-styling';

function generateId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function makeUniqueRuleId(rules: ConditionalRule[]): string {
  const existingIds = new Set(rules.map((rule) => rule.id));
  let id = generateId();
  while (existingIds.has(id)) id = generateId();
  return id;
}

function makeUniqueCloneName(sourceName: string, rules: ConditionalRule[]): string {
  const existingNames = new Set(rules.map((rule) => rule.name));
  const baseName = `${sourceName} Copy`;
  if (!existingNames.has(baseName)) return baseName;

  let copyIndex = 2;
  while (existingNames.has(`${baseName} ${copyIndex}`)) copyIndex += 1;
  return `${baseName} ${copyIndex}`;
}

function copyRule(rule: ConditionalRule): ConditionalRule {
  return JSON.parse(JSON.stringify(rule)) as ConditionalRule;
}

// ─── Dirty LED for the list rail ───────────────────────────────────────

function DirtyListLed({ ruleId }: { ruleId: string }) {
  const { isDirty } = useDirty(`${MODULE_ID}:${ruleId}`);
  if (!isDirty) return null;
  return <LedBar amber on title="Unsaved changes" />;
}

// ─── List pane ─────────────────────────────────────────────────────────

export function ConditionalStylingList({ selectedId, onSelect }: ListPaneProps) {
  const [state, setState] = useModuleState<ConditionalStylingState>(MODULE_ID);

  const addRule = useCallback(() => {
    const newRule: ConditionalRule = {
      id: generateId(),
      name: 'New Rule',
      enabled: true,
      priority: state.rules.length,
      scope: { type: 'row' },
      expression: 'true',
      style: { light: {}, dark: {} },
    };
    setState((prev) => ({ ...prev, rules: [...prev.rules, newRule] }));
    onSelect(newRule.id);
  }, [state.rules.length, setState, onSelect]);

  const cloneRule = useCallback((sourceRuleId: string) => {
    const nextId = makeUniqueRuleId(state.rules);
    setState((prev) => {
      const sourceIndex = prev.rules.findIndex((rule) => rule.id === sourceRuleId);
      if (sourceIndex === -1) return prev;

      const source = prev.rules[sourceIndex];
      const clone: ConditionalRule = {
        ...copyRule(source),
        id: nextId,
        name: makeUniqueCloneName(source.name, prev.rules),
        enabled: false,
        priority: source.priority + 1,
      };
      const shiftedRules = prev.rules.map((rule) =>
        rule.priority > source.priority ? { ...rule, priority: rule.priority + 1 } : rule,
      );

      return {
        ...prev,
        rules: [
          ...shiftedRules.slice(0, sourceIndex + 1),
          clone,
          ...shiftedRules.slice(sourceIndex + 1),
        ],
      };
    });
    onSelect(nextId);
  }, [state.rules, setState, onSelect]);

  const deleteRule = useCallback((ruleId: string) => {
    const deleteIndex = state.rules.findIndex((rule) => rule.id === ruleId);
    if (deleteIndex === -1) return;

    const nextSelection = selectedId === ruleId
      ? state.rules[deleteIndex + 1]?.id ?? state.rules[deleteIndex - 1]?.id ?? null
      : selectedId;

    setState((prev) => ({
      ...prev,
      rules: prev.rules.filter((rule) => rule.id !== ruleId),
    }));
    onSelect(nextSelection);
  }, [selectedId, state.rules, setState, onSelect]);

  useEffect(() => {
    if (!selectedId && state.rules.length > 0) {
      onSelect(state.rules[0].id);
    }
  }, [selectedId, state.rules, onSelect]);

  return (
    <>
      <div className="flex items-center gap-2.5 sticky top-0 bg-background border-b border-border px-4 pt-3.5 pb-2.5">
        <Caps>Rules</Caps>
        <Mono color="var(--ds-text-faint)">
          {String(state.rules.length).padStart(2, '0')}
        </Mono>
        <span className="flex-1" />
        <ChromeButton
          type="button"
          onClick={addRule}
          title="Add rule"
          data-testid="cs-add-rule-btn"
          className="w-[22px] h-[22px] inline-flex items-center justify-center bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] border border-[var(--ds-primary-ring)] rounded-sm cursor-pointer p-0"
        >
          <Plus size={11} strokeWidth={2.5} />
        </ChromeButton>
      </div>
      <CockpitList listTestId="cs-rules-list">
        {state.rules.map((r) => (
          <RuleRow
            key={r.id}
            rule={r}
            active={r.id === selectedId}
            onSelect={() => onSelect(r.id)}
            onClone={() => cloneRule(r.id)}
            onDelete={() => deleteRule(r.id)}
          />
        ))}
      </CockpitList>
    </>
  );
}

/** One row in the list rail. Memoised on `rule` + `active` — dirty status
 *  comes from the DirtyBus via `<DirtyListLed>` which subscribes
 *  independently, so this component only re-renders when its own props
 *  change. v2 wired `useModuleState` at this level and read a committed
 *  snapshot it never used, which re-rendered every row on every edit. */
const RuleRow = memo(function RuleRow({
  rule,
  active,
  onSelect,
  onClone,
  onDelete,
}: {
  rule: ConditionalRule;
  active: boolean;
  onSelect: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  return (
    <CockpitListItem
      value={rule.id}
      active={active}
      muted={!rule.enabled}
      onSelect={onSelect}
      data-testid={`cs-rule-card-${rule.id}`}
    >
      <span className="w-0.5 inline-flex">
        <DirtyListLed ruleId={rule.id} />
      </span>
      <span className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {rule.name}
      </span>
      <Tooltip content="Clone">
        <ChromeButton
          type="button"
          aria-label="Clone"
          data-testid={`cs-rule-clone-${rule.id}`}
          className="w-6 h-6 inline-flex items-center justify-center rounded-sm text-muted-foreground cursor-pointer p-0 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary-ring)]"
          onClick={(event) => {
            event.stopPropagation();
            onClone();
          }}
        >
          <Copy size={14} strokeWidth={2} />
        </ChromeButton>
      </Tooltip>
      <Tooltip content="Delete">
        <ChromeButton
          type="button"
          aria-label="Delete"
          data-testid={`cs-rule-delete-${rule.id}`}
          className="w-6 h-6 inline-flex items-center justify-center rounded-sm text-muted-foreground cursor-pointer p-0 transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary-ring)]"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 size={14} strokeWidth={2} />
        </ChromeButton>
      </Tooltip>
    </CockpitListItem>
  );
});

// ─── Editor pane ───────────────────────────────────────────────────────

export function ConditionalStylingEditor({ selectedId }: EditorPaneProps) {
  const [state] = useModuleState<ConditionalStylingState>(MODULE_ID);

  if (!selectedId) {
    return (
      <div className="px-6 py-8">
        <Caps size="xs" style={{ marginBottom: 8, display: 'block' }}>
          No rule selected
        </Caps>
        <div className="text-xs text-muted-foreground">
          Select a rule from the list, or press <Mono>+</Mono> to add one.
        </div>
      </div>
    );
  }

  if (!state.rules.some((r) => r.id === selectedId)) return null;

  return <RuleEditor ruleId={selectedId} />;
}

// ─── RuleEditor — orchestrator (sub-bands live in ./editor/) ──────────

const RuleEditor = memo(function RuleEditor({
  ruleId,
}: {
  ruleId: string;
}) {
  const platform = useGridPlatform();
  const engine = platform.resources.expression();
  const columns = useGridColumns();

  // Stable ref so the Monaco completion provider isn't re-registered on
  // every render. The editor re-reads via its latest-value ref.
  const columnsProvider = useCallback(
    () => columns.map((c) => ({ colId: c.colId, headerName: c.headerName })),
    [columns],
  );
  const cellDataTypeForColumn = useCallback(
    (colId: string) => columns.find((c) => c.colId === colId)?.cellDataType,
    [columns],
  );

  const { draft, setDraft, dirty, save, discard, missing } = useModuleDraft<
    ConditionalStylingState,
    ConditionalRule
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

  const validation = engine.validate(draft.expression);
  // Placeholder — the real "applied" count would come from a grid
  // side-channel that watches rule matches. Preserved from v2 so the
  // meta strip layout is visually identical.
  const appliedCount = draft.enabled ? 132 : 0;

  return (
    <div
      data-testid="cs-rule-editor"
      data-rule-testid={`cs-rule-editor-${ruleId}`}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <RuleEditorHeader
        ruleId={ruleId}
        name={draft.name}
        dirty={dirty}
        onNameChange={(name) => setDraft({ name })}
        onReset={discard}
        onSave={save}
      />

      <div className="flex-1 min-h-0 overflow-y-auto pb-4">
        <RuleMetaStrip
          ruleId={ruleId}
          enabled={draft.enabled}
          scopeType={draft.scope.type}
          priority={draft.priority}
          flash={draft.flash}
          appliedCount={appliedCount}
          setDraft={setDraft}
        />

        <ExpressionBand
          ruleId={ruleId}
          expression={draft.expression}
          validation={validation}
          columnsProvider={columnsProvider}
          onExpressionChange={(v) => setDraft({ expression: v })}
        />

        {draft.scope.type === 'cell' && (
          <TargetColumnsBand
            columns={draft.scope.columns ?? []}
            onColumnsChange={(cols) =>
              setDraft({ scope: { type: 'cell', columns: cols } })
            }
          />
        )}

        {/* Shared StyleEditor.
            `format` dropped: the rule value-formatter now lives in its
            own Band below — the legacy FormatSection never persisted
            into conditional-styling state (styleBridge ignored it), so
            removing it is a behaviour fix, not a regression. */}
        <StyleEditor
          value={toStyleEditorValue(draft.style)}
          onChange={(patch) => {
            const merged = { ...toStyleEditorValue(draft.style), ...patch };
            setDraft({ style: fromStyleEditorValue(draft.style, merged) });
          }}
          sections={['text', 'color', 'border']}
          dataType="number"
          data-testid={`cs-rule-style-editor-${ruleId}`}
        />

        <FlashBand
          ruleId={ruleId}
          flash={draft.flash}
          activeDurationMs={draft.activeDurationMs}
          scopeType={draft.scope.type}
          setDraft={setDraft}
        />

        {/* INDICATOR — small top-right badge drawn on every matching cell
            (and matching headers) as a `::before` SVG. Opt-in per rule. */}
        <Band index="08" title="INDICATOR">
          <IndicatorPicker
            value={draft.indicator}
            onChange={(next) => setDraft({ indicator: next })}
            ruleId={ruleId}
          />
        </Band>

        <ValueFormatterBand
          ruleId={ruleId}
          scope={draft.scope}
          valueFormatter={draft.valueFormatter}
          cellDataTypeForColumn={cellDataTypeForColumn}
          setDraft={setDraft}
        />

        {/* ANIMATE — spin/pulse the value glyph (e.g. a 🔄 from the value
            format) while the rule matches. Cell-scope only: row-scope would
            animate every cell's value, which is what FLASH pulse is for. */}
        {draft.scope.type === 'cell' && (
          <AnimateBand
            ruleId={ruleId}
            animation={draft.animation}
            setDraft={setDraft}
          />
        )}

        <div className="h-5" />
      </div>
    </div>
  );
});

// ─── IndicatorPicker ───────────────────────────────────────────────────
//
// Curated icon grid + colour-picker trigger + "no indicator" clear pill.
// Renders the live lucide icon at button size so the user can see exactly
// what's about to paint on every matching cell.

const INDICATOR_GROUP_LABELS: Record<string, string> = {
  direction: 'Direction',
  alert: 'Alert',
  status: 'Status',
  lifecycle: 'Lifecycle',
  favorite: 'Favorite',
  classification: 'Classification',
};

/** Render the inline SVG for an indicator icon def directly. Avoids
 *  pulling every possible lucide-react component into the bundle just
 *  to preview the curated list — we already own the icon bodies. */
function IndicatorIconPreview({
  iconKey,
  color = 'currentColor',
  size = 14,
}: {
  iconKey: string;
  color?: string;
  size?: number;
}) {
  const def = findIndicatorIcon(iconKey);
  if (!def) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: def.body.replaceAll('currentColor', color) }}
    />
  );
}

function IndicatorPicker({
  value,
  onChange,
  ruleId,
}: {
  value: RuleIndicator | undefined;
  onChange: (next: RuleIndicator | undefined) => void;
  ruleId: string;
}) {
  const groups = useMemo(() => {
    const grouped: Record<string, Array<(typeof INDICATOR_ICONS)[number]>> = {};
    for (const i of INDICATOR_ICONS) {
      (grouped[i.group] ??= []).push(i);
    }
    return grouped;
  }, []);

  const color = value?.color || 'var(--ds-accent-warning)';
  const currentTarget: IndicatorTarget = value?.target ?? 'cells+headers';
  const currentPosition: IndicatorPosition = value?.position ?? 'top-right';
  const POSITION_LABEL: Record<IndicatorPosition, string> = {
    'top-left': 'TL',
    'top-right': 'TR',
    'bottom-left': 'BL',
    'bottom-right': 'BR',
    'left-middle': 'LM',
    'right-middle': 'RM',
  };
  const POSITION_TITLE: Record<IndicatorPosition, string> = {
    'top-left': 'Top left',
    'top-right': 'Top right',
    'bottom-left': 'Bottom left',
    'bottom-right': 'Bottom right',
    'left-middle': 'Left middle',
    'right-middle': 'Right middle',
  };

  const patch = (next: Partial<RuleIndicator>) => {
    if (!value?.icon) return;
    onChange({ ...value, ...next });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Top bar: current selection + clear */}
      <div className="flex items-center gap-2.5">
        <span
          aria-label="Current indicator"
          className="size-control-sm inline-flex items-center justify-center p-1 border border-[var(--ds-border-secondary)] rounded-sm bg-background"
        >
          {value?.icon ? (
            <IndicatorIconPreview iconKey={value.icon} color={color} size={14} />
          ) : (
            <span className="px-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] leading-none text-muted-foreground">
              NONE
            </span>
          )}
        </span>
        <Caps size="xs" color="var(--ds-text-muted)">
          {value?.icon ? findIndicatorIcon(value.icon)?.label ?? value.icon : 'No indicator'}
        </Caps>

        <span className="flex-1" />

        {value?.icon && (
          <FormatPopover
            width={240}
            trigger={
              <ChromeButton
                type="button"
                title="Indicator colour"
                data-testid={`cs-rule-indicator-color-${ruleId}`}
                className="inline-flex items-center gap-1.5 py-0.5 pr-2 pl-0.5 bg-background border border-[var(--ds-border-secondary)] rounded-sm h-7 cursor-pointer"
              >
                <span
                  aria-hidden
                  style={{
                    width: 18,
                    height: 18,
                    background: color,
                    border: '1px solid var(--ds-border-secondary)',
                    borderRadius: 2,
                    display: 'inline-block',
                  }}
                />
                <Caps size="2xs" color="var(--ds-text-muted)">
                  {color.startsWith('#') ? color.toUpperCase() : 'COLOR'}
                </Caps>
              </ChromeButton>
            }
          >
            <FormatColorPicker
              value={color}
              onChange={(c) => {
                if (c) onChange({ ...(value as RuleIndicator), color: c });
              }}
              allowClear={false}
            />
          </FormatPopover>
        )}

        <ChromeButton
          type="button"
          onClick={() => onChange(undefined)}
          disabled={!value?.icon}
          style={{
            height: 28,
            padding: '0 10px',
            background: 'transparent',
            border: '1px solid var(--ds-border-secondary)',
            borderRadius: 2,
            color: value?.icon ? 'var(--ds-accent-negative)' : 'var(--ds-text-faint)',
            cursor: value?.icon ? 'pointer' : 'default',
            fontFamily: 'var(--ds-font-sans)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            opacity: value?.icon ? 1 : 0.5,
          }}
          data-testid={`cs-rule-indicator-clear-${ruleId}`}
        >
          CLEAR
        </ChromeButton>
      </div>

      {/* Target + Position — only meaningful when an icon is picked */}
      {value?.icon && (
        <div className="flex items-center gap-3.5 flex-wrap">
          <div className="flex items-center gap-2">
            <SubLabel>TARGET</SubLabel>
            <PillToggleGroup>
              {(
                [
                  ['cells', 'CELLS'],
                  ['headers', 'HEADERS'],
                  ['cells+headers', 'BOTH'],
                ] as ReadonlyArray<[IndicatorTarget, string]>
              ).map(([v, label]) => (
                <PillToggleBtn
                  key={v}
                  active={currentTarget === v}
                  onClick={() => patch({ target: v })}
                  style={{
                    height: 24,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    padding: '0 10px',
                    minWidth: 56,
                  }}
                  data-testid={`cs-rule-indicator-target-${v}-${ruleId}`}
                >
                  {label}
                </PillToggleBtn>
              ))}
            </PillToggleGroup>
          </div>
          <div className="flex items-center gap-2">
            <SubLabel>POSITION</SubLabel>
            <PillToggleGroup>
              {(
                [
                  ['top-left', 'TL'],
                  ['top-right', 'TR'],
                  ['bottom-left', 'BL'],
                  ['bottom-right', 'BR'],
                  ['left-middle', 'LM'],
                  ['right-middle', 'RM'],
                ] as ReadonlyArray<[IndicatorPosition, string]>
              ).map(([v]) => (
                <PillToggleBtn
                  key={v}
                  active={currentPosition === v}
                  onClick={() => patch({ position: v })}
                  title={POSITION_TITLE[v]}
                  style={{
                    height: 24,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    padding: '0 10px',
                    minWidth: 36,
                  }}
                  data-testid={`cs-rule-indicator-position-${v}-${ruleId}`}
                >
                  {POSITION_LABEL[v]}
                </PillToggleBtn>
              ))}
            </PillToggleGroup>
          </div>
        </div>
      )}

      {/* Grouped icon grid */}
      {Object.entries(groups).map(([group, icons]) => (
        <div key={group}>
          <SubLabel>{INDICATOR_GROUP_LABELS[group] ?? group}</SubLabel>
          <div
            className="grid gap-1 mt-1"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(28px, 1fr))' }}
          >
            {icons.map((i) => {
              const active = value?.icon === i.key;
              return (
                <ChromeButton
                  key={i.key}
                  type="button"
                  title={i.label}
                  aria-label={i.label}
                  aria-pressed={active ? 'true' : 'false'}
                  onClick={() => {
                    if (active) {
                      onChange(undefined);
                      return;
                    }
                    onChange({
                      icon: i.key,
                      target: value?.target ?? 'cells+headers',
                      position: value?.position ?? 'top-right',
                      ...(value?.color ? { color: value.color } : {}),
                    });
                  }}
                  style={{
                    width: '100%',
                    height: 28,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: active ? 'var(--ds-primary-soft)' : 'var(--ds-surface-ground)',
                    border: `1px solid ${active ? 'var(--ds-primary)' : 'var(--ds-border-secondary)'}`,
                    borderRadius: 2,
                    cursor: 'pointer',
                    color: active ? 'var(--ds-primary)' : 'var(--ds-text-secondary)',
                    padding: 0,
                    transition: 'background 120ms, border-color 120ms',
                  }}
                  data-testid={`cs-rule-indicator-icon-${i.key}-${ruleId}`}
                >
                  <IndicatorIconPreview
                    iconKey={i.key}
                    color={active ? color : 'currentColor'}
                    size={14}
                  />
                </ChromeButton>
              );
            })}
          </div>
        </div>
      ))}

      <Caps size="2xs" color="var(--ds-text-faint)">
        Shown as a 12×12 badge on the top-right of every cell (and column header) currently matching this rule.
      </Caps>
    </div>
  );
}

// ─── Legacy flat composition ───────────────────────────────────────────

export function ConditionalStylingPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div
      data-testid="cs-panel"
      className="grid h-full"
      style={{ gridTemplateColumns: '220px 1fr' }}
    >
      <aside className="border-r border-border overflow-y-auto bg-card">
        <ConditionalStylingList gridId="" selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <section className="overflow-y-auto">
        <ConditionalStylingEditor gridId="" selectedId={selectedId} />
      </section>
    </div>
  );
}
