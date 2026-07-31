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
  showSmartEditToolbar?: boolean;
  showBulkUpdateToolbar?: boolean;
  showEditHistoryToolbar?: boolean;
}

/**
 * Resolve host-level editing toolbar visibility.
 * Legacy per-module props act as an allow-list; `showEditingToolbar` alone
 * enables all three segments (each still gated by module settings.enabled).
 */
export function resolveEditingToolbarAllow(
  props: EditingToolbarHostProps,
): EditingToolbarAllow {
  const {
    showEditingToolbar,
    showSmartEditToolbar,
    showBulkUpdateToolbar,
    showEditHistoryToolbar,
  } = props;

  const legacySpecified =
    showSmartEditToolbar !== undefined
    || showBulkUpdateToolbar !== undefined
    || showEditHistoryToolbar !== undefined;

  const legacyAny = Boolean(
    showSmartEditToolbar || showBulkUpdateToolbar || showEditHistoryToolbar,
  );

  // Use `||` so legacy props still enable the row when the unified prop is off.
  const rowVisible = Boolean(showEditingToolbar) || legacyAny;

  if (showEditingToolbar && !legacySpecified) {
    return {
      rowVisible,
      allowHistory: true,
      allowSmartEdit: true,
      allowBulkUpdate: true,
    };
  }

  return {
    rowVisible,
    allowHistory: Boolean(showEditHistoryToolbar),
    allowSmartEdit: Boolean(showSmartEditToolbar),
    allowBulkUpdate: Boolean(showBulkUpdateToolbar),
  };
}

export interface EditingModuleEnabledSnapshot {
  smartEdit: boolean;
  bulkUpdate: boolean;
  history: boolean;
}

function editingToolbarLegacyAny(props: EditingToolbarHostProps): boolean {
  return Boolean(
    props.showSmartEditToolbar || props.showBulkUpdateToolbar || props.showEditHistoryToolbar,
  );
}

/**
 * When the host did not opt in via props, derive the primary-row pencil toggle
 * from Custom Settings module switches (`settings.enabled` on smart-edit,
 * bulk-update, data-change-history). Explicit `showEditingToolbar: false`
 * (without legacy segment props) suppresses auto-detection.
 */
export function mergeEditingToolbarAllowWithModules(
  base: EditingToolbarAllow,
  hostProps: EditingToolbarHostProps,
  modules: EditingModuleEnabledSnapshot,
): EditingToolbarAllow {
  if (base.rowVisible) return base;

  if (hostProps.showEditingToolbar === false && !editingToolbarLegacyAny(hostProps)) {
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
