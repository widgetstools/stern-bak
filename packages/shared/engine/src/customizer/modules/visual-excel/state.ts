export const VISUAL_EXCEL_MODULE_ID = 'visual-excel';
export const VISUAL_EXCEL_SCHEMA_VERSION = 1;

export interface VisualExcelSettings {
  /** Master switch — when false, export uses plain AG Grid excel (no style registry). */
  enabled: boolean;
  /** Prefix for downloaded files when the host does not supply a name. */
  fileNamePrefix: string;
}

export interface VisualExcelState {
  settings: VisualExcelSettings;
}

export const INITIAL_VISUAL_EXCEL: VisualExcelState = {
  settings: {
    enabled: true,
    fileNamePrefix: 'markets-grid',
  },
};

export function deserializeVisualExcelState(raw: unknown): VisualExcelState {
  if (!raw || typeof raw !== 'object') return structuredClone(INITIAL_VISUAL_EXCEL);
  const d = raw as { settings?: Partial<VisualExcelSettings> };
  const s = d.settings ?? {};
  return {
    settings: {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : INITIAL_VISUAL_EXCEL.settings.enabled,
      fileNamePrefix:
        typeof s.fileNamePrefix === 'string' && s.fileNamePrefix.trim()
          ? s.fileNamePrefix.trim()
          : INITIAL_VISUAL_EXCEL.settings.fileNamePrefix,
    },
  };
}
