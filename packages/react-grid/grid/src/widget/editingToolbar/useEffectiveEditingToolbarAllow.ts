import { useMemo } from 'react';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  EDITING_MODULE_ID,
  type DataChangeHistoryState,
  type EditingState,
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
  const [editing] = useModuleState<EditingState>(EDITING_MODULE_ID);
  const [history] = useModuleState<DataChangeHistoryState>(DATA_CHANGE_HISTORY_MODULE_ID);

  return useMemo(() => {
    const base = resolveEditingToolbarAllow(hostProps);
    return mergeEditingToolbarAllowWithModules(base, hostProps, {
      smartEdit: Boolean(editing?.smartEdit?.settings?.enabled),
      bulkUpdate: Boolean(editing?.bulkUpdate?.settings?.enabled),
      history: Boolean(history?.settings?.enabled),
    });
  }, [
    hostProps.showEditingToolbar,
    editing?.smartEdit?.settings?.enabled,
    editing?.bulkUpdate?.settings?.enabled,
    history?.settings?.enabled,
  ]);
}
