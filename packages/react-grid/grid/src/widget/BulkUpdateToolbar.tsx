import { BulkUpdateToolbarBody } from '../customizer/modules/bulk-update/BulkUpdateToolbarBody';

export interface BulkUpdateToolbarProps {}

/** Optional toolbar row for bulk replace on cell selection. */
export function BulkUpdateToolbar(_props: BulkUpdateToolbarProps) {
  return <BulkUpdateToolbarBody />;
}
