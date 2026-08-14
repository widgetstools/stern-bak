import type { ReactNode } from 'react';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  EDITING_MODULE_ID,
  type DataChangeHistoryState,
  type EditingState,
} from '@wellsfargo-starui/core';
import { useModuleState } from '../../customizer/hooks/useModuleState';
import { BulkUpdateToolbarBody } from '../../customizer/modules/bulk-update/BulkUpdateToolbarBody';
import { EditHistoryToolbarBody } from '../../customizer/modules/data-change-history/EditHistoryToolbarBody';
import { SmartEditToolbarBody } from '../../customizer/modules/smart-edit/SmartEditToolbarBody';
import { EditingToolbarKeyboardMenu } from './EditingToolbarKeyboardMenu';
import './editingToolbar.css';

function EditingHair() {
  return <span aria-hidden className="ex-hair" />;
}

function joinSegments(nodes: Array<ReactNode | false | null | undefined>) {
  const visible = nodes.filter(Boolean);
  return visible.flatMap((node, index) => (
    index === 0 ? [node] : [<EditingHair key={`sep-${index}`} />, node]
  ));
}

/** Unified editing toolbar — history, smart edit, bulk update, keyboard hints.
 *  Row visibility is the host's call (`useEditingToolbarVisible`); each
 *  segment gates on its own module switch here. */
export function EditingToolbar() {
  const [history] = useModuleState<DataChangeHistoryState>(DATA_CHANGE_HISTORY_MODULE_ID);
  const [editing] = useModuleState<EditingState>(EDITING_MODULE_ID);
  const { smartEdit, bulkUpdate, plusMinus, shortcuts } = editing;

  const showHistory = history.settings.enabled;
  const showSmartEdit = smartEdit.settings.enabled;
  const showBulkUpdate = bulkUpdate.settings.enabled;
  const showKeyboard =
    (plusMinus.settings.enabled && plusMinus.nudges.some((n) => n.enabled))
    || (shortcuts.settings.enabled && shortcuts.shortcuts.some((s) => s.enabled));
  const hasPrimarySegment = showHistory || showSmartEdit || showBulkUpdate;

  if (!hasPrimarySegment) return null;

  const primary = joinSegments([
    showHistory && <EditHistoryToolbarBody key="history" layout="segment" />,
    showSmartEdit && <SmartEditToolbarBody key="smart-edit" layout="segment" />,
    showBulkUpdate && <BulkUpdateToolbarBody key="bulk-update" layout="segment" />,
  ]);

  return (
    <div
      className="ex-shell ex-shell--horizontal shrink-0"
      data-testid="editing-toolbar-pinned"
    >
      {primary}
      {showKeyboard && (
        <>
          <EditingHair />
          <EditingToolbarKeyboardMenu />
        </>
      )}
    </div>
  );
}
