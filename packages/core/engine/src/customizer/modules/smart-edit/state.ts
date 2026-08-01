/**
 * Smart Edit — bulk update, arithmetic across selections, +/- increment,
 * and K/M/B magnitude shortcuts for numeric editable cells.
 */

export const SMART_EDIT_MODULE_ID = 'smart-edit';
export const SMART_EDIT_SCHEMA_VERSION = 2;

export type SmartEditOp = 'multiply' | 'divide' | 'add' | 'subtract' | 'set';

export interface SmartEditSettings {
  /** Master switch — when false, toolbar hidden and keyboard hooks inactive. */
  enabled: boolean;
  /** Default step for +/- keys on numeric cells. */
  incrementStep: number;
  /** Allow K/M/B suffix parsing in numeric editors. */
  magnitudeShortcutsEnabled: boolean;
  /** Which ops appear in the toolbar quick menu. */
  enabledOps: SmartEditOp[];
  /** Confirm before applying ops affecting more than N cells (0 = never confirm). */
  confirmThreshold: number;
  /** AdapTable parity: only one column per smart-edit apply. */
  enforceSingleColumn: boolean;
  /** Show preview table before apply (lab profiles enable this). */
  previewBeforeApply: boolean;
  /** Record applies in the shared edit journal for undo/redo. */
  recordHistory: boolean;
}

export interface SmartEditState {
  settings: SmartEditSettings;
}

export const INITIAL_SMART_EDIT: SmartEditState = {
  settings: {
    enabled: true,
    incrementStep: 1,
    magnitudeShortcutsEnabled: true,
    enabledOps: ['multiply', 'divide', 'add', 'subtract', 'set'],
    confirmThreshold: 50,
    enforceSingleColumn: true,
    previewBeforeApply: false,
    recordHistory: true,
  },
};

const ALL_OPS: SmartEditOp[] = ['multiply', 'divide', 'add', 'subtract', 'set'];

function isSmartEditOp(v: unknown): v is SmartEditOp {
  return typeof v === 'string' && (ALL_OPS as string[]).includes(v);
}

export function deserializeSmartEditState(raw: unknown): SmartEditState {
  if (!raw || typeof raw !== 'object') return structuredClone(INITIAL_SMART_EDIT);
  const d = raw as { settings?: Partial<SmartEditSettings> };
  const s = d.settings ?? {};
  const enabledOps = Array.isArray(s.enabledOps)
    ? s.enabledOps.filter(isSmartEditOp)
    : INITIAL_SMART_EDIT.settings.enabledOps;
  return {
    settings: {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : INITIAL_SMART_EDIT.settings.enabled,
      incrementStep:
        typeof s.incrementStep === 'number' && Number.isFinite(s.incrementStep) && s.incrementStep > 0
          ? s.incrementStep
          : INITIAL_SMART_EDIT.settings.incrementStep,
      magnitudeShortcutsEnabled:
        typeof s.magnitudeShortcutsEnabled === 'boolean'
          ? s.magnitudeShortcutsEnabled
          : INITIAL_SMART_EDIT.settings.magnitudeShortcutsEnabled,
      enabledOps: enabledOps.length > 0 ? enabledOps : INITIAL_SMART_EDIT.settings.enabledOps,
      confirmThreshold:
        typeof s.confirmThreshold === 'number' && Number.isFinite(s.confirmThreshold) && s.confirmThreshold >= 0
          ? s.confirmThreshold
          : INITIAL_SMART_EDIT.settings.confirmThreshold,
      enforceSingleColumn:
        typeof s.enforceSingleColumn === 'boolean'
          ? s.enforceSingleColumn
          : INITIAL_SMART_EDIT.settings.enforceSingleColumn,
      previewBeforeApply:
        typeof s.previewBeforeApply === 'boolean'
          ? s.previewBeforeApply
          : INITIAL_SMART_EDIT.settings.previewBeforeApply,
      recordHistory:
        typeof s.recordHistory === 'boolean'
          ? s.recordHistory
          : INITIAL_SMART_EDIT.settings.recordHistory,
    },
  };
}
