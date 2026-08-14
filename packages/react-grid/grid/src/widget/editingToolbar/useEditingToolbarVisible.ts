import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  EDITING_MODULE_ID,
  type DataChangeHistoryState,
  type EditingState,
} from '@wellsfargo-starui/core';
import { useModuleState } from '../../customizer/hooks/useModuleState';

/**
 * Host prop + profile module switches → editing toolbar row visibility.
 *
 * `showEditingToolbar` is tri-state: `true`/`false` are host verdicts and
 * win outright; `undefined` defers to the profile — the row auto-appears
 * when any toolbar-bearing module switch (editing.smartEdit,
 * editing.bulkUpdate, data-change-history) is enabled. Each segment is
 * additionally gated by its own module switch inside `EditingToolbar`.
 */
export function useEditingToolbarVisible(showEditingToolbar?: boolean): boolean {
  const [editing] = useModuleState<EditingState>(EDITING_MODULE_ID);
  const [history] = useModuleState<DataChangeHistoryState>(DATA_CHANGE_HISTORY_MODULE_ID);

  if (showEditingToolbar !== undefined) return showEditingToolbar;
  return (
    Boolean(editing?.smartEdit?.settings?.enabled)
    || Boolean(editing?.bulkUpdate?.settings?.enabled)
    || Boolean(history?.settings?.enabled)
  );
}
