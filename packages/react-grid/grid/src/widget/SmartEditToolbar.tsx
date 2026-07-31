import { SmartEditToolbarBody } from '../customizer/modules/smart-edit/SmartEditToolbarBody';

export interface SmartEditToolbarProps {}

/** Optional toolbar row for bulk / arithmetic cell edits. */
export function SmartEditToolbar(_props: SmartEditToolbarProps) {
  return <SmartEditToolbarBody />;
}
