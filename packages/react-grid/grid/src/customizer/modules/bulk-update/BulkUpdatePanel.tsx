import { memo } from 'react';
import {
  BULK_UPDATE_MODULE_ID,
  type BulkUpdateSettings,
  type BulkUpdateState,
} from '@wellsfargo-starui/engine';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { Band, ObjectTitleRow, SettingsRow as Row, SharpBtn } from '../../ui/SettingsPanel';
import { BoolControl, NumberControl } from '../general-settings/fieldSchema';

function BulkUpdatePanelInner() {
  const { draft, setDraft, dirty, save, discard } = useModuleDraft<
    BulkUpdateState,
    BulkUpdateSettings
  >({
    moduleId: BULK_UPDATE_MODULE_ID,
    itemId: 'settings',
    selectItem: (s) => s.settings,
    commitItem: (settings) => (s) => ({ ...s, settings }),
  });

  const updateSetting = <K extends keyof BulkUpdateSettings>(
    key: K,
    value: BulkUpdateSettings[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="ds-sheet-v2 flex h-full flex-col" data-testid="bulk-update-panel">
      <ObjectTitleRow
        title="Bulk Update"
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
            data-testid="bu-enabled"
            control={(
              <BoolControl
                testId="bu-enabled-toggle"
                checked={draft.enabled}
                onChange={(v) => updateSetting('enabled', v)}
              />
            )}
          />
          <Row
            label="CONFIRM THRESHOLD"
            hint="Confirm when more than N cells are selected (0 = off)."
            data-testid="bu-confirm"
            control={(
              <NumberControl
                testId="bu-confirm-input"
                value={draft.confirmThreshold}
                min={0}
                onChange={(v) => updateSetting('confirmThreshold', v)}
              />
            )}
          />
          <Row
            label="SINGLE COLUMN"
            data-testid="bu-single-column"
            control={(
              <BoolControl
                testId="bu-single-column-toggle"
                checked={draft.enforceSingleColumn}
                onChange={(v) => updateSetting('enforceSingleColumn', v)}
              />
            )}
          />
          <Row
            label="RECORD HISTORY"
            data-testid="bu-record-history"
            control={(
              <BoolControl
                testId="bu-record-history-toggle"
                checked={draft.recordHistory}
                onChange={(v) => updateSetting('recordHistory', v)}
              />
            )}
          />
        </Band>
        <Band index="02" title="DROPDOWN">
          <Row
            label="DISTINCT VALUES"
            data-testid="bu-distinct"
            control={(
              <BoolControl
                testId="bu-distinct-toggle"
                checked={draft.showDistinctValues}
                onChange={(v) => updateSetting('showDistinctValues', v)}
              />
            )}
          />
          <Row
            label="MAX DROPDOWN"
            data-testid="bu-max-dropdown"
            control={(
              <NumberControl
                testId="bu-max-dropdown-input"
                value={draft.maxDropdownValues}
                min={1}
                onChange={(v) => updateSetting('maxDropdownValues', v)}
              />
            )}
          />
        </Band>
      </div>
    </div>
  );
}

export const BulkUpdatePanel = memo(BulkUpdatePanelInner);
