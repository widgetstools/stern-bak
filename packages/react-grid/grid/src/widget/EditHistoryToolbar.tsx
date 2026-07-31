import { EditHistoryToolbarBody } from '../customizer/modules/data-change-history/EditHistoryToolbarBody';

export interface EditHistoryToolbarProps {}

/** Optional toolbar row for global edit undo/redo. */
export function EditHistoryToolbar(_props: EditHistoryToolbarProps) {
  return <EditHistoryToolbarBody />;
}
