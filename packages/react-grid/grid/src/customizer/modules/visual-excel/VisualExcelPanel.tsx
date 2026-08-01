import { memo } from 'react';
import {
  VISUAL_EXCEL_MODULE_ID,
  type VisualExcelSettings,
  type VisualExcelState,
} from '@wellsfargo-starui/core';
import { useModuleDraft } from '../../hooks/useModuleDraft';
import { ObjectTitleRow, SettingsRow as Row, SharpBtn } from '../../ui/SettingsPanel';
import { BoolControl } from '../general-settings/fieldSchema';

function VisualExcelPanelInner() {
  const { draft, setDraft, dirty, save, discard } = useModuleDraft<
    VisualExcelState,
    VisualExcelSettings
  >({
    moduleId: VISUAL_EXCEL_MODULE_ID,
    itemId: 'settings',
    selectItem: (s) => s.settings,
    commitItem: (settings) => (s) => ({ ...s, settings }),
  });

  return (
    <div className="ds-sheet-v2 flex h-full flex-col" data-testid="visual-excel-panel">
      <ObjectTitleRow
        title="Visual Excel"
        actions={(
          <>
            <SharpBtn variant="ghost" onClick={discard} disabled={!dirty}>Reset</SharpBtn>
            <SharpBtn variant="action" onClick={save} disabled={!dirty}>Save</SharpBtn>
          </>
        )}
      />
      <div className="ds-editor-scroll flex-1 overflow-y-auto p-3">
        <Row
          label="ENABLED"
          hint="Apply display formatters and style-rule colours when exporting to Excel."
          data-testid="visual-excel-enabled"
          control={(
            <BoolControl
              testId="visual-excel-enabled-toggle"
              checked={draft.enabled}
              onChange={(enabled) => setDraft((prev) => ({ ...prev, enabled }))}
            />
          )}
        />
      </div>
    </div>
  );
}

export const VisualExcelPanel = memo(VisualExcelPanelInner);
