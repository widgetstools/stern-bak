/**
 * Selection + derived-state slice of useFormatter().
 *
 * Owns the user-facing column-selection / scope / target tri-state plus
 * everything trivially derivable from it (resolved formatting view,
 * single-column flag, picker data type, header-name label). Exposes refs
 * for the actions sub-hook to read the *current* values without
 * re-binding callbacks on every render.
 *
 * Internal — composed by `useFormatter` in ./state.ts; not exported via
 * the package barrel.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGridPlatform, useModuleState } from '../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import type { ColumnCustomizationState } from '../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import {
  readHeaderName,
  resolveToolbarPickerDataType,
  useActiveColumns,
  useColumnFormatting,
  type ResolvedFormatting,
  type ScopeKind,
  type TargetKind,
} from '../formattingToolbarHooks';
import type { PickerDataType } from './state';

export interface FormatterSelection {
  /** Currently-targeted columns. Empty when no column is focused. */
  colIds: string[];
  /** Single-column display label (header name or fallback id). */
  colLabel: string;
  /** Per-call site `cellDataType` of the first targeted column. */
  pickerDataType: PickerDataType;
  /** Cell vs header — drives whether type/colour writes go into
   *  cellStyleOverrides or headerStyleOverrides. */
  target: TargetKind;
  setTarget: (t: TargetKind) => void;
  /** Selected-column override vs global baseline. */
  scope: ScopeKind;
  setScope: (s: ScopeKind) => void;
  /** True when no column is selected. Modules use this to disable. */
  disabled: boolean;
  /** True when target = 'header'. Format module disables itself. */
  isHeader: boolean;
  /** Resolved styling + formatter view of the active assignment. */
  fmt: ResolvedFormatting;
  /** True only when exactly one column is selected — gates the inline
   *  column-caption rename UI. */
  singleColumnSelected: boolean;
  /** Refs for the actions sub-hook to capture current values without
   *  forcing a re-binding of every callback on each selection change. */
  refs: {
    colIds: React.MutableRefObject<string[]>;
    target: React.MutableRefObject<TargetKind>;
    scope: React.MutableRefObject<ScopeKind>;
  };
}

export function useFormatterSelection(): FormatterSelection {
  const platform = useGridPlatform();
  const [cust] = useModuleState<ColumnCustomizationState>('column-customization');
  const colIds = useActiveColumns();
  const colIdsRef = useRef(colIds);
  colIdsRef.current = colIds;

  const [target, setTarget] = useState<TargetKind>('cell');
  const targetRef = useRef(target);
  targetRef.current = target;

  // Default scope is SELECTED so the most common edit (style this column)
  // is the no-extra-clicks path; users opt into ALL to push a baseline
  // across the grid.
  const [scope, setScope] = useState<ScopeKind>('selected');
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  const fmt = useColumnFormatting(colIds, target, scope);
  // The selected-scope branch needs a selected column to make sense.
  // Global scope is always available — disable only when the user is
  // in SELECTED mode without a column.
  const disabled = scope === 'selected' && colIds.length === 0;
  const isHeader = target === 'header';

  const colLabel = useMemo(() => {
    if (colIds.length === 0) return 'Select a cell';
    if (colIds.length === 1) {
      const colId = colIds[0];
      const assigned = cust?.assignments?.[colId]?.headerName?.trim();
      if (assigned) return assigned;
      return readHeaderName(platform.api.api, colId) ?? colId;
    }
    return `${colIds.length} columns`;
  }, [colIds, cust, platform]);

  // pickerDataType — re-evaluates on column / data-render events so
  // auto-detected types take effect once they land on the colDef.
  const [colEventTick, setColEventTick] = useState(0);
  useEffect(() => {
    const bump = () => setColEventTick((n) => n + 1);
    const disposers: Array<() => void> = [
      platform.api.on('columnEverythingChanged', bump),
      platform.api.on('displayedColumnsChanged', bump),
      platform.api.on('firstDataRendered', bump),
    ];
    return () => {
      for (const d of disposers) {
        try { d(); } catch { /* teardown race */ }
      }
    };
  }, [platform]);

  const pickerDataType = useMemo(() => {
    if (colIds.length === 0) return 'number' as const;
    return resolveToolbarPickerDataType(platform.api.api, colIds[0]);
    // Reason: `platform.api.api` is read inside the callback but is a
    // mutable ApiHub field, not a React-tracked dep. `colEventTick`
    // increments whenever AG-Grid fires a column-related event, which
    // is the actual invalidator — listing platform.api here would never
    // change identity and would mask the explicit tick-based recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colIds, platform, colEventTick]);

  return {
    colIds,
    colLabel,
    pickerDataType,
    target,
    setTarget,
    scope,
    setScope,
    disabled,
    isHeader,
    fmt,
    singleColumnSelected: colIds.length === 1,
    refs: { colIds: colIdsRef, target: targetRef, scope: scopeRef },
  };
}
