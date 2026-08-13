import { useMemo } from 'react';
import {
  BULK_UPDATE_MODULE_ID,
  DATA_CHANGE_HISTORY_MODULE_ID,
  SMART_EDIT_MODULE_ID,
  type BulkUpdateState,
  type DataChangeHistoryState,
  type SmartEditState,
} from '@wellsfargo-starui/core';
import { useModuleState } from '../../customizer/hooks/useModuleState';
import {
  mergeEditingToolbarAllowWithModules,
  resolveEditingToolbarAllow,
  type EditingToolbarAllow,
  type EditingToolbarHostProps,
} from './resolveEditingToolbarAllow';

/** Host props + profile module switches → effective editing toolbar allow-list. */
export function useEffectiveEditingToolbarAllow(
  hostProps: EditingToolbarHostProps,
): EditingToolbarAllow {
  const [smartEdit] = useModuleState<SmartEditState>(SMART_EDIT_MODULE_ID);
  const [bulkUpdate] = useModuleState<BulkUpdateState>(BULK_UPDATE_MODULE_ID);
  const [history] = useModuleState<DataChangeHistoryState>(DATA_CHANGE_HISTORY_MODULE_ID);

  return useMemo(() => {
    const base = resolveEditingToolbarAllow(hostProps);
    return mergeEditingToolbarAllowWithModules(base, hostProps, {
      smartEdit: Boolean(smartEdit?.settings?.enabled),
      bulkUpdate: Boolean(bulkUpdate?.settings?.enabled),
      history: Boolean(history?.settings?.enabled),
    });
  }, [
    hostProps.showEditingToolbar,
    smartEdit?.settings?.enabled,
    bulkUpdate?.settings?.enabled,
    history?.settings?.enabled,
  ]);
}
