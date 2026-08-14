import { memo } from 'react';
import {
  EDITING_MODULE_ID,
  type EditingState,
  type SmartEditOp,
  type SmartEditSettings,
} from '@wellsfargo-starui/core';
import { Button } from '@wellsfargo-starui/react';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { Band, ObjectTitleRow, SettingsRow as Row, SharpBtn } from '../../ui/SettingsPanel';
import { BoolControl, NumberControl } from '../general-settings/fieldSchema';

const ALL_OPS: { op: SmartEditOp; label: string }[] = [
  { op: 'multiply', label: '×' },
  { op: 'divide', label: '÷' },
  { op: 'add', label: '+' },
  { op: 'subtract', label: '−' },
  { op: 'set', label: 'Set' },
];

function SmartEditPanelInner() {
  const { draft, setDraft, dirty, save, discard } = useModuleDraft<
    EditingState,
    SmartEditSettings
  >({
    moduleId: EDITING_MODULE_ID,
    itemId: 'smart-edit-settings',
    selectItem: (s) => s.smartEdit.settings,
    commitItem: (settings) => (s) => ({ ...s, smartEdit: { ...s.smartEdit, settings } }),
  });

  const updateSetting = <K extends keyof SmartEditSettings>(key: K, value: SmartEditSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const toggleOp = (op: SmartEditOp) => {
    setDraft((prev) => {
      const ops = new Set(prev.enabledOps);
      if (ops.has(op)) ops.delete(op);
      else ops.add(op);
      return { ...prev, enabledOps: [...ops] as SmartEditOp[] };
    });
  };

  return (
    <div className="ds-sheet-v2 flex h-full flex-col" data-testid="smart-edit-panel">
      <ObjectTitleRow
        title="Smart Edit"
        actions={(
          <>
            <SharpBtn variant="ghost" onClick={discard} disabled={!dirty}>Reset</SharpBtn>
            <SharpBtn variant="action" onClick={save} disabled={!dirty}>Save</SharpBtn>
          </>
        )}
      />
      <div className="ds-editor-scroll flex-1 overflow-y-auto p-3">
        <Band index="01" title="GLOBAL">
          <Row
            label="ENABLED"
            data-testid="se-enabled"
            control={(
              <BoolControl
                checked={draft.enabled}
                onChange={(v) => updateSetting('enabled', v)}
                testId="se-enabled-toggle"
              />
            )}
          />
          <Row
            label="INCREMENT STEP"
            data-testid="se-increment"
            control={(
              <NumberControl
                value={draft.incrementStep}
                onChange={(v) => updateSetting('incrementStep', v ?? 1)}
                min={0.0001}
                testId="se-increment-input"
              />
            )}
          />
          <Row
            label="K / M / B SHORTCUTS"
            data-testid="se-magnitude"
            control={(
              <BoolControl
                checked={draft.magnitudeShortcutsEnabled}
                onChange={(v) => updateSetting('magnitudeShortcutsEnabled', v)}
                testId="se-magnitude-toggle"
              />
            )}
          />
        </Band>
        <Band index="02" title="OPERATIONS">
          <Row
            label="TOOLBAR OPS"
            data-testid="se-ops"
            control={(
              <div className="flex flex-wrap gap-1">
                {ALL_OPS.map(({ op, label }) => (
                  <Button
                    key={op}
                    type="button"
                    size="sm"
                    variant={draft.enabledOps.includes(op) ? 'default' : 'outline'}
                    data-testid={`se-op-${op}`}
                    onClick={() => toggleOp(op)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            )}
          />
        </Band>
        <Band index="03" title="SAFETY">
          <Row
            label="CONFIRM ABOVE N CELLS"
            data-testid="se-confirm"
            hint="0 = never confirm"
            control={(
              <NumberControl
                value={draft.confirmThreshold}
                onChange={(v) => updateSetting('confirmThreshold', v ?? 0)}
                min={0}
                testId="se-confirm-input"
              />
            )}
          />
          <Row
            label="SINGLE COLUMN ONLY"
            data-testid="se-single-column"
            hint="AdapTable parity — one numeric column per apply"
            control={(
              <BoolControl
                checked={draft.enforceSingleColumn}
                onChange={(v) => updateSetting('enforceSingleColumn', v)}
                testId="se-single-column-toggle"
              />
            )}
          />
          <Row
            label="PREVIEW BEFORE APPLY"
            data-testid="se-preview"
            control={(
              <BoolControl
                checked={draft.previewBeforeApply}
                onChange={(v) => updateSetting('previewBeforeApply', v)}
                testId="se-preview-toggle"
              />
            )}
          />
          <Row
            label="RECORD EDIT HISTORY"
            data-testid="se-history"
            hint="Enables undo via Data Change History module (Phase 3 UI)"
            control={(
              <BoolControl
                checked={draft.recordHistory}
                onChange={(v) => updateSetting('recordHistory', v)}
                testId="se-history-toggle"
              />
            )}
          />
        </Band>
      </div>
    </div>
  );
}

export const SmartEditPanel = memo(SmartEditPanelInner);
