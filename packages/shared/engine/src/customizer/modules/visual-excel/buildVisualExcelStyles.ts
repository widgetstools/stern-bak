import type { ExcelStyle } from 'ag-grid-community';
import type { ColDef } from 'ag-grid-community';
import type { AnyColDef } from '../../../platform/types.js';
import { presetToExcelFormat } from '../../../colDef/adapters/presetToExcelFormat.js';
import type { ValueFormatterTemplate } from '../../../colDef/types.js';
import type { ColumnCustomizationState } from '../column-customization/state.js';
import type { ConditionalRule, ConditionalStylingState } from '../conditional-styling/state.js';
import { cssEscapeColId } from '../column-customization/transforms.js';
import {
  VISUAL_EXCEL_CELL_STYLE,
  VISUAL_EXCEL_HEADER_STYLE,
  cellStyleToExcelStyle,
  numberFormatExcelStyle,
} from './cellStyleToExcelStyle.js';
import { formatExcelClassId } from './formatExcelClassId.js';

export interface BuildVisualExcelStylesInput {
  columnCustomization: ColumnCustomizationState;
  conditionalStyling: ConditionalStylingState;
  /** Theme slice used when a rule only defines light styles. */
  themeMode?: 'light' | 'dark';
}

function collectFormatStrings(state: ColumnCustomizationState): string[] {
  const formats = new Set<string>();
  const add = (t: ValueFormatterTemplate | undefined) => {
    const fmt = presetToExcelFormat(t);
    if (fmt) formats.add(fmt);
  };
  add(state.globalCellNumberFormatter);
  add(state.globalCellDateFormatter);
  for (const assignment of Object.values(state.assignments)) {
    add(assignment.valueFormatterTemplate);
  }
  return [...formats];
}

function ruleExcelClassId(ruleId: string): string {
  return `ds-rule-${cssEscapeColId(ruleId)}`;
}

/** Build the AG Grid `excelStyles` registry from profile module state. */
export function buildVisualExcelStyles(input: BuildVisualExcelStylesInput): ExcelStyle[] {
  const themeMode = input.themeMode ?? 'light';
  const byId = new Map<string, ExcelStyle>();

  const put = (style: ExcelStyle) => {
    if (!byId.has(style.id)) byId.set(style.id, style);
  };

  put(VISUAL_EXCEL_HEADER_STYLE);
  put(VISUAL_EXCEL_CELL_STYLE);

  for (const format of collectFormatStrings(input.columnCustomization)) {
    put(numberFormatExcelStyle(formatExcelClassId(format), format));
  }

  for (const rule of input.conditionalStyling.rules) {
    if (!rule.enabled) continue;
    const props = themeMode === 'dark'
      ? (rule.style.dark ?? rule.style.light)
      : (rule.style.light ?? rule.style.dark);
    if (!props) continue;
    put(cellStyleToExcelStyle(ruleExcelClassId(rule.id), props));
  }

  return [...byId.values()];
}

/** Stamp always-on format excel class rules onto columns that carry format templates. */
export function applyFormatExcelClasses(
  defs: AnyColDef[],
  state: ColumnCustomizationState,
): AnyColDef[] {
  return defs.map((def) => {
    if ('children' in def && Array.isArray(def.children)) {
      const next = applyFormatExcelClasses(def.children, state);
      const unchanged = next.length === def.children.length && next.every((c, i) => c === def.children[i]);
      return unchanged ? def : { ...def, children: next };
    }

    const colDef = def as ColDef;
    const colId = colDef.colId ?? colDef.field;
    if (!colId) return def;

    const assignment = state.assignments[colId];
    const template = assignment?.valueFormatterTemplate;
    const format = presetToExcelFormat(template);
    if (!format) return def;

    const classId = formatExcelClassId(format);
    const cellClassRules: NonNullable<ColDef['cellClassRules']> = {
      ...((colDef.cellClassRules as Record<string, unknown>) ?? {}),
      [classId]: () => true,
    } as NonNullable<ColDef['cellClassRules']>;

    return { ...colDef, cellClassRules };
  });
}

export function defaultVisualExcelFileName(prefix: string, gridId?: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const stem = [prefix, gridId].filter(Boolean).join('-') || 'export';
  return `${stem}-${stamp}.xlsx`;
}
