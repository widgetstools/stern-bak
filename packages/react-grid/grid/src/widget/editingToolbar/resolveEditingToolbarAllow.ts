export interface EditingToolbarAllow {
  /** Show the unified editing toolbar row. */
  rowVisible: boolean;
  /** Host allows the edit-history segment (still requires module enabled). */
  allowHistory: boolean;
  allowSmartEdit: boolean;
  allowBulkUpdate: boolean;
}

export interface EditingToolbarHostProps {
  showEditingToolbar?: boolean;
}

/**
 * Resolve host-level editing toolbar visibility. `showEditingToolbar`
 * enables the row with all three segments allowed — each segment is
 * still gated by its module's `settings.enabled`.
 */
export function resolveEditingToolbarAllow(
  props: EditingToolbarHostProps,
): EditingToolbarAllow {
  const on = Boolean(props.showEditingToolbar);
  return {
    rowVisible: on,
    allowHistory: on,
    allowSmartEdit: on,
    allowBulkUpdate: on,
  };
}

export interface EditingModuleEnabledSnapshot {
  smartEdit: boolean;
  bulkUpdate: boolean;
  history: boolean;
}

/**
 * When the host did not opt in via props, derive the primary-row pencil toggle
 * from Custom Settings module switches (`settings.enabled` on smart-edit,
 * bulk-update, data-change-history). Explicit `showEditingToolbar: false`
 * suppresses auto-detection.
 */
export function mergeEditingToolbarAllowWithModules(
  base: EditingToolbarAllow,
  hostProps: EditingToolbarHostProps,
  modules: EditingModuleEnabledSnapshot,
): EditingToolbarAllow {
  if (base.rowVisible) return base;

  if (hostProps.showEditingToolbar === false) {
    return base;
  }

  const anyModuleEnabled = modules.smartEdit || modules.bulkUpdate || modules.history;
  if (!anyModuleEnabled) return base;

  return {
    rowVisible: true,
    allowHistory: true,
    allowSmartEdit: true,
    allowBulkUpdate: true,
  };
}
