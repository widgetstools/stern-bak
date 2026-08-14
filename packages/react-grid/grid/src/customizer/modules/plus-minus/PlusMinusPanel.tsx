import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button,
  Input,
  Switch,
} from '@wellsfargo-starui/react';
import type { EditorPaneProps, ListPaneProps } from '@wellsfargo-starui/core';
import {
  defaultPlusMinusNudge,
  EDITING_MODULE_ID,
  type EditingState,
  type PlusMinusNudge,
  type PlusMinusSettings,
} from '@wellsfargo-starui/core';
import { useGridPlatform } from '../../hooks/GridProvider';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { useEditingSlice } from '../editing/useEditingSlice';
import { useGridColumns } from '../../hooks/useGridColumns';
import { ExpressionBand } from '../conditional-styling/editor/ExpressionBand';
import {
  Band,
  CockpitList,
  CockpitListItem,
  CockpitListItemMeta,
  ObjectTitleRow,
  SettingsRow as Row,
  SharpBtn,
  SubLabel,
} from '../../ui/SettingsPanel';
import { BoolControl, NumberControl } from '../general-settings/fieldSchema';

function NudgeListBody({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [state, setState] = useEditingSlice('plusMinus');

  const addNudge = () => {
    const nudge = defaultPlusMinusNudge(`Nudge ${state.nudges.length + 1}`);
    setState((prev) => ({ ...prev, nudges: [...prev.nudges, nudge] }));
    onSelect(nudge.id);
  };

  const removeNudge = (id: string) => {
    setState((prev) => ({ ...prev, nudges: prev.nudges.filter((n) => n.id !== id) }));
    if (selectedId === id) onSelect(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
      <Button type="button" variant="outline" size="sm" onClick={addNudge} data-testid="pm-add-nudge">
        <Plus className="mr-1 size-3.5" />
        Add nudge
      </Button>
      <CockpitList data-testid="pm-nudge-list">
        {state.nudges.map((nudge) => (
          <CockpitListItem
            key={nudge.id}
            value={nudge.id}
            active={selectedId === nudge.id}
            muted={!nudge.enabled}
            multiline
            onSelect={() => onSelect(nudge.id)}
            data-testid={`pm-nudge-item-${nudge.id}`}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="truncate text-xs font-medium">{nudge.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                aria-label={`Delete ${nudge.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  removeNudge(nudge.id);
                }}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
            <CockpitListItemMeta>
              {nudge.enabled ? 'On' : 'Off'}
              {' · '}
              step {nudge.incrementStep}
              {nudge.scope.columnIds.length > 0
                ? ` · ${nudge.scope.columnIds.join(', ')}`
                : ' · all numeric cols'}
            </CockpitListItemMeta>
          </CockpitListItem>
        ))}
      </CockpitList>
    </div>
  );
}

function NudgeEditorBody({ nudgeId }: { nudgeId: string }) {
  const [state, setState] = useEditingSlice('plusMinus');
  const platform = useGridPlatform();
  const columns = useGridColumns();

  const nudge = state.nudges.find((n) => n.id === nudgeId);
  const columnsProvider = useCallback(
    () => columns.map((c) => ({ colId: c.colId, headerName: c.headerName ?? c.colId })),
    [columns],
  );

  const validation = useMemo(() => {
    if (!nudge?.expression?.trim()) return { valid: true, errors: [] as { message: string }[] };
    const result = platform.resources.expression().validate(nudge.expression);
    return { valid: result.valid, errors: result.errors };
  }, [nudge?.expression, platform]);

  if (!nudge) return null;

  const updateNudge = (patch: Partial<PlusMinusNudge>) => {
    setState((prev) => ({
      ...prev,
      nudges: prev.nudges.map((n) => (n.id === nudgeId ? { ...n, ...patch } : n)),
    }));
  };

  const columnIdsText = nudge.scope.columnIds.join(', ');

  return (
    <div className="ds-editor-scroll min-h-0 flex-1 overflow-y-auto p-3">
      <Band index="01" title="NUDGE">
        <Row
          label="NAME"
          data-testid="pm-nudge-name"
          control={(
            <Input
              value={nudge.name}
              onChange={(e) => updateNudge({ name: e.target.value })}
              data-testid="pm-nudge-name-input"
            />
          )}
        />
        <Row
          label="ENABLED"
          data-testid="pm-nudge-enabled"
          control={(
            <Switch
              checked={nudge.enabled}
              onCheckedChange={(v) => updateNudge({ enabled: v })}
              data-testid="pm-nudge-enabled-toggle"
            />
          )}
        />
        <Row
          label="COLUMNS"
          hint="Comma-separated colIds/fields — empty = all numeric editable columns."
          data-testid="pm-nudge-columns"
          control={(
            <Input
              value={columnIdsText}
              onChange={(e) =>
                updateNudge({
                  scope: {
                    columnIds: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                })}
              placeholder="quantityFace, midPrice"
              data-testid="pm-nudge-columns-input"
            />
          )}
        />
        <Row
          label="INCREMENT"
          data-testid="pm-nudge-increment"
          control={(
            <NumberControl
              testId="pm-nudge-increment-input"
              value={nudge.incrementStep}
              min={0.000_001}
              onChange={(v) => updateNudge({ incrementStep: v })}
            />
          )}
        />
        <Row
          label="DECREMENT"
          hint="Defaults to increment when blank."
          data-testid="pm-nudge-decrement"
          control={(
            <NumberControl
              testId="pm-nudge-decrement-input"
              value={nudge.decrementStep ?? nudge.incrementStep}
              min={0.000_001}
              onChange={(v) => updateNudge({ decrementStep: v })}
            />
          )}
        />
      </Band>
      <ExpressionBand
        ruleId={nudgeId}
        expression={nudge.expression ?? ''}
        validation={validation}
        columnsProvider={columnsProvider}
        onExpressionChange={(next) => updateNudge({ expression: next || undefined })}
        expressionTestId={`pm-nudge-expression-${nudgeId}`}
      />
    </div>
  );
}

function PlusMinusSettingsBand() {
  const { draft, setDraft, dirty, save, discard } = useModuleDraft<
    EditingState,
    PlusMinusSettings
  >({
    moduleId: EDITING_MODULE_ID,
    itemId: 'plus-minus-settings',
    selectItem: (s) => s.plusMinus.settings,
    commitItem: (settings) => (s) => ({ ...s, plusMinus: { ...s.plusMinus, settings } }),
  });

  const updateSetting = <K extends keyof PlusMinusSettings>(
    key: K,
    value: PlusMinusSettings[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <>
      <ObjectTitleRow
        title="Plus / Minus"
        actions={(
          <>
            <SharpBtn variant="ghost" onClick={discard} disabled={!dirty}>Reset</SharpBtn>
            <SharpBtn variant="action" onClick={save} disabled={!dirty}>Save</SharpBtn>
          </>
        )}
      />
      <div className="border-b border-[color:var(--ds-border-primary)] p-3">
        <Band index="01" title="GLOBAL">
          <Row
            label="ENABLED"
            data-testid="pm-enabled"
            control={(
              <BoolControl
                testId="pm-enabled-toggle"
                checked={draft.enabled}
                onChange={(v) => updateSetting('enabled', v)}
              />
            )}
          />
          <Row
            label="RECORD HISTORY"
            data-testid="pm-record-history"
            control={(
              <BoolControl
                testId="pm-record-history-toggle"
                checked={draft.recordHistory}
                onChange={(v) => updateSetting('recordHistory', v)}
              />
            )}
          />
        </Band>
        <p className="mt-2 text-[11px] text-[color:var(--ds-text-secondary)]">
          When enabled, +/- keys use nudge rules here instead of Smart Edit&apos;s global increment step.
        </p>
      </div>
    </>
  );
}

export function PlusMinusList({ selectedId, onSelect }: ListPaneProps) {
  const [state] = useEditingSlice('plusMinus');

  useEffect(() => {
    if (!selectedId && state.nudges.length > 0) {
      onSelect(state.nudges[0].id);
    }
  }, [selectedId, state.nudges, onSelect]);

  return <NudgeListBody selectedId={selectedId} onSelect={onSelect} />;
}

export function PlusMinusEditor({ selectedId }: EditorPaneProps) {
  const ruleExists = selectedId != null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="plus-minus-editor-pane">
      <PlusMinusSettingsBand />
      {ruleExists ? (
        <NudgeEditorBody nudgeId={selectedId} />
      ) : (
        <p className="p-4 text-xs text-[color:var(--ds-text-secondary)]">
          Add a nudge rule to configure column scope, step size, and optional expression gate.
        </p>
      )}
    </div>
  );
}

function PlusMinusPanelInner() {
  const [state, setState] = useEditingSlice('plusMinus');
  const [selectedId, setSelectedId] = useState<string | null>(state.nudges[0]?.id ?? null);

  return (
    <div className="ds-sheet-v2 flex h-full flex-col" data-testid="plus-minus-panel-flat">
      <PlusMinusSettingsBand />
      <div className="grid min-h-0 flex-1 grid-cols-2 divide-x divide-[color:var(--ds-border-primary)]">
        <NudgeListBody selectedId={selectedId} onSelect={setSelectedId} />
        {selectedId ? <NudgeEditorBody nudgeId={selectedId} /> : null}
      </div>
    </div>
  );
}

export const PlusMinusPanel = memo(PlusMinusPanelInner);
