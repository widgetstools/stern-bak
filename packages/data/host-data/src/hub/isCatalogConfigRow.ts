import type { AppConfigRow } from '@wellsfargo-starui/core/host/config';
import { COMPONENT_TYPE_APPDATA } from '../runtime/providers/appdata/store.js';
import { COMPONENT_TYPE_DATA_PROVIDER } from '../runtime/config/store.js';

/** True when a config row belongs in the worker {@link ConfigCatalogCache}. */
export function isCatalogConfigRow(row: AppConfigRow): boolean {
  return (
    row.componentType === COMPONENT_TYPE_DATA_PROVIDER
    || row.componentType === COMPONENT_TYPE_APPDATA
  );
}
