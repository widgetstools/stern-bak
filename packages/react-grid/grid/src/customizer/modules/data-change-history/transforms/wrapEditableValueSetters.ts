import type { ValueSetterParams } from 'ag-grid-community';
import type { AnyColDef, DataChangeHistoryState, TransformContext } from '@wellsfargo-starui/core';
import { recordCellEditorPatch } from '../runtime/recordCellEditorPatch.js';

const WRAPPED = Symbol('dchValueSetter');

type ColDefWithSetter = AnyColDef & {
  field?: string;
  editable?: boolean | ((params: unknown) => boolean);
  valueSetter?: (params: ValueSetterParams) => boolean;
};

function isEditableCol(def: ColDefWithSetter): boolean {
  if (def.editable === false) return false;
  if (def.field == null || def.field === '') return false;
  return def.editable === true || typeof def.editable === 'function';
}

function wrapDef(
  def: AnyColDef,
  state: DataChangeHistoryState,
  ctx: TransformContext,
): AnyColDef {
  if ('children' in def && Array.isArray(def.children)) {
    const children = def.children.map((child) => wrapDef(child, state, ctx));
    const unchanged = children.every((child, i) => child === def.children![i]);
    return unchanged ? def : { ...def, children };
  }

  const col = def as ColDefWithSetter;
  if (!isEditableCol(col)) return def;

  const prevSetter = col.valueSetter;
  if (prevSetter && (prevSetter as { [WRAPPED]?: boolean })[WRAPPED]) return def;

  const field = col.field!;

  const wrapped = (params: ValueSetterParams): boolean => {
    const oldValue = params.oldValue;
    let accepted = true;
    if (typeof prevSetter === 'function') {
      accepted = prevSetter(params) !== false;
    } else {
      (params.data as Record<string, unknown>)[field] = params.newValue;
    }

    if (accepted) {
      recordCellEditorPatch(state, ctx, {
        data: params.data as Record<string, unknown>,
        field,
        colId: params.column?.getColId?.() ?? field,
        oldValue,
        newValue: params.newValue,
      });
    }

    return accepted;
  };

  (wrapped as unknown as { [WRAPPED]: boolean })[WRAPPED] = true;

  return { ...def, valueSetter: wrapped };
}

/** Wrap editable columns so in-cell commits journal even when AG Grid omits cellValueChanged. */
export function wrapEditableValueSetters(
  defs: AnyColDef[],
  state: DataChangeHistoryState,
  ctx: TransformContext,
): AnyColDef[] {
  if (!state.settings.enabled || !state.settings.recordSources.cellEditor) return defs;
  if (state.settings.suspended) return defs;
  return defs.map((def) => wrapDef(def, state, ctx));
}
