import type { ReactNode } from 'react';
import {
  BULK_UPDATE_MODULE_ID,
  DATA_CHANGE_HISTORY_MODULE_ID,
  PLUS_MINUS_MODULE_ID,
  SHORTCUTS_MODULE_ID,
  SMART_EDIT_MODULE_ID,
  type BulkUpdateState,
  type DataChangeHistoryState,
  type PlusMinusState,
  type ShortcutsState,
  type SmartEditState,
} from '@wellsfargo-starui/core';
import { useModuleState } from '../../customizer/hooks/useModuleState';
import { BulkUpdateToolbarBody } from '../../customizer/modules/bulk-update/BulkUpdateToolbarBody';
import { EditHistoryToolbarBody } from '../../customizer/modules/data-change-history/EditHistoryToolbarBody';
import { SmartEditToolbarBody } from '../../customizer/modules/smart-edit/SmartEditToolbarBody';
import { EditingToolbarKeyboardMenu } from './EditingToolbarKeyboardMenu';
import type { EditingToolbarAllow } from './resolveEditingToolbarAllow';
import './editingToolbar.css';

export interface EditingToolbarProps {
  allow: EditingToolbarAllow;
}

function EditingHair() {
  return <span aria-hidden className="ex-hair" />;
}

function joinSegments(nodes: Array<ReactNode | false | null | undefined>) {
  const visible = nodes.filter(Boolean);
  return visible.flatMap((node, index) => (
    index === 0 ? [node] : [<EditingHair key={`sep-${index}`} />, node]
  ));
}

/** Unified editing toolbar — history, smart edit, bulk update, keyboard hints. */
export function EditingToolbar({ allow }: EditingToolbarProps) {
  const [history] = useModuleState<DataChangeHistoryState>(DATA_CHANGE_HISTORY_MODULE_ID);
  const [smartEdit] = useModuleState<SmartEditState>(SMART_EDIT_MODULE_ID);
  const [bulkUpdate] = useModuleState<BulkUpdateState>(BULK_UPDATE_MODULE_ID);
  const [plusMinus] = useModuleState<PlusMinusState>(PLUS_MINUS_MODULE_ID);
  const [shortcuts] = useModuleState<ShortcutsState>(SHORTCUTS_MODULE_ID);

  const showHistory = allow.allowHistory && history.settings.enabled;
  const showSmartEdit = allow.allowSmartEdit && smartEdit.settings.enabled;
  const showBulkUpdate = allow.allowBulkUpdate && bulkUpdate.settings.enabled;
  const showKeyboard =
    (plusMinus.settings.enabled && plusMinus.nudges.some((n) => n.enabled))
    || (shortcuts.settings.enabled && shortcuts.shortcuts.some((s) => s.enabled));
  const hasPrimarySegment = showHistory || showSmartEdit || showBulkUpdate;

  if (!allow.rowVisible || !hasPrimarySegment) return null;

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
