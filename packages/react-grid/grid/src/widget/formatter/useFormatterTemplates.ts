/**
 * Templates slice of useFormatter().
 *
 * Surfaces the column-templates module's state (list, active-on-column
 * lookup, "what would be captured" hint) and exposes the save / update /
 * rename / delete / apply / save-as-input actions the TemplateManager UI
 * wires to.
 *
 * Internal — composed by `useFormatter` in ./state.ts.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  addTemplateReducer,
  applyTemplateToColumnsReducer,
  pickTemplateFields,
  removeTemplateRefFromAssignmentsReducer,
  removeTemplateReducer,
  renameTemplateReducer,
  resolveTemplates,
  snapshotTemplate,
  snapshotTemplateUpdate,
  updateTemplateReducer,
  useGridPlatform,
  type ColumnCustomizationState,
  type ColumnTemplatesState,
} from '../../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import {
  readCellDataType,
  useFlashConfirm,
} from '../formattingToolbarHooks';
import type { FormatterSelection } from './useFormatterSelection';

export interface FormatterTemplatesSlice {
  /** Column templates — sorted alphabetically. */
  templates: Array<{ id: string; name: string }>;
  /** First template id chained on the active column, when any. */
  activeTemplateId?: string;
  /** Human-readable list of template categories the active column has
   *  authored that would be captured if "Save as new" / "Update" fired
   *  right now. Drives the TemplateManager's "what will be saved" hint. */
  capturableFields: ReadonlyArray<string>;
  /** Save-as-template input draft + flash-confirm flag. */
  saveAsTplName: string;
  saveAsTplConfirmed: boolean;
  actions: {
    applyTemplate: (tplId: string) => void;
    saveAsTemplate: (name: string) => string | undefined;
    updateTemplate: (tplId: string) => boolean;
    renameTemplate: (tplId: string, name: string) => boolean;
    deleteTemplate: (tplId: string) => void;
    setSaveAsTplName: (v: string) => void;
    flashSaveAsTpl: () => void;
  };
}

export interface FormatterTemplatesDeps {
  selection: FormatterSelection;
  custState: ColumnCustomizationState | undefined;
  tplState: ColumnTemplatesState | undefined;
  setTplState: (
    updater: (
      prev: ColumnTemplatesState | undefined,
    ) => ColumnTemplatesState | undefined,
  ) => void;
  /** Wrapper that pushes an undo entry before writing column state.
   *  Owned by useFormatterActions — passed through so deleteTemplate
   *  (which removes template refs from assignments) participates in
   *  the same undo stack as every other column edit. */
  setCustStateWithHistory: (
    updater: (
      prev: ColumnCustomizationState | undefined,
    ) => ColumnCustomizationState,
  ) => void;
}

export function useFormatterTemplates(deps: FormatterTemplatesDeps): FormatterTemplatesSlice {
  const platform = useGridPlatform();
  const { selection, custState, tplState, setTplState, setCustStateWithHistory } = deps;
  const colIdsRef = selection.refs.colIds;

  const [saveAsTplConfirmed, flashSaveAsTpl] = useFlashConfirm();
  const [saveAsTplName, setSaveAsTplName] = useState('');

  const templates = useMemo(() => {
    const t = tplState?.templates ?? {};
    return Object.values(t)
      .map((v) => ({ id: v.id, name: v.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tplState]);

  const activeTemplateId = selection.colIds.length > 0
    ? custState?.assignments?.[selection.colIds[0]]?.templateIds?.[0]
    : undefined;

  // Resolve the active column's effective state once, then map the
  // populated template categories into human-readable labels for the
  // TemplateManager's "what will be saved" hint.
  const capturableFields = useMemo<ReadonlyArray<string>>(() => {
    if (selection.colIds.length === 0) return [];
    const colId = selection.colIds[0];
    const assignment = custState?.assignments?.[colId];
    if (!assignment) return [];
    const tpls = tplState ?? { templates: {}, typeDefaults: {} };
    const t = readCellDataType(platform.api.api, colId);
    const dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined =
      t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean' ? t : undefined;
    const resolved = resolveTemplates(assignment, tpls, dataType);
    // Cast: resolveTemplates returns the base shape; values flowed
    // through unchanged from the narrowed source — same boundary cast
    // pattern snapshotTemplate uses.
    const fields = pickTemplateFields(
      resolved as unknown as Parameters<typeof pickTemplateFields>[0],
    );

    const labels: string[] = [];
    if (fields.cellStyleOverrides) labels.push('Cell style');
    if (fields.headerStyleOverrides) labels.push('Header style');
    if (fields.valueFormatterTemplate) labels.push('Formatter');
    // Behavior flags collapse into one bucket regardless of which
    // subset is set — the user doesn't need to know the granularity.
    if (
      typeof fields.editable === 'boolean' ||
      typeof fields.sortable === 'boolean' ||
      typeof fields.filterable === 'boolean' ||
      typeof fields.resizable === 'boolean'
    ) {
      labels.push('Behavior');
    }
    if (fields.cellEditorName || fields.cellEditorParams || fields.cellEditor) labels.push('Editor');
    if (fields.cellRendererName) labels.push('Renderer');
    if (fields.filter) labels.push('Filter');
    if (fields.rowGrouping) labels.push('Grouping');
    return labels;
  }, [selection.colIds, custState, tplState, platform]);

  const applyTemplate = useCallback((tplId: string) => {
    setCustStateWithHistory(applyTemplateToColumnsReducer(colIdsRef.current, tplId));
  }, [setCustStateWithHistory, colIdsRef]);

  const saveAsTemplate = useCallback((name: string): string | undefined => {
    const ids = colIdsRef.current;
    if (!ids.length) return undefined;
    const colId = ids[0];
    const t = readCellDataType(platform.api.api, colId);
    const dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined =
      t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean' ? t : undefined;
    const tpl = snapshotTemplate(custState, tplState, colId, name, dataType);
    if (!tpl) return undefined;
    setTplState(addTemplateReducer(tpl));
    return tpl.id;
  }, [platform, custState, tplState, setTplState, colIdsRef]);

  const updateTemplate = useCallback((tplId: string): boolean => {
    const ids = colIdsRef.current;
    if (!ids.length) return false;
    const colId = ids[0];
    const t = readCellDataType(platform.api.api, colId);
    const dataType: 'numeric' | 'date' | 'string' | 'boolean' | undefined =
      t === 'numeric' || t === 'date' || t === 'string' || t === 'boolean' ? t : undefined;
    const fields = snapshotTemplateUpdate(custState, tplState, colId, dataType);
    if (!fields) return false;
    setTplState(updateTemplateReducer(tplId, fields));
    return true;
  }, [platform, custState, tplState, setTplState, colIdsRef]);

  const renameTemplate = useCallback((tplId: string, name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const existing = tplState?.templates?.[tplId];
    if (!existing) return false;
    if (existing.name === trimmed) return false;
    setTplState(renameTemplateReducer(tplId, trimmed));
    return true;
  }, [tplState, setTplState]);

  const deleteTemplate = useCallback((tplId: string) => {
    setTplState(removeTemplateReducer(tplId));
    setCustStateWithHistory(removeTemplateRefFromAssignmentsReducer(tplId));
  }, [setTplState, setCustStateWithHistory]);

  return {
    templates,
    activeTemplateId,
    capturableFields,
    saveAsTplName,
    saveAsTplConfirmed,
    actions: {
      applyTemplate,
      saveAsTemplate,
      updateTemplate,
      renameTemplate,
      deleteTemplate,
      setSaveAsTplName,
      flashSaveAsTpl,
    },
  };
}
