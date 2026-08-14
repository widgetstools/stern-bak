import { useCallback } from 'react';
import { EDITING_MODULE_ID, type EditingState } from '@wellsfargo-starui/core';
import { useModuleState } from '../../hooks/useModuleState';

/**
 * Typed binding for one slice of the merged `editing` module —
 * `useEditingSlice('smartEdit')` replaces the pre-merge
 * `useModuleState<SmartEditState>(SMART_EDIT_MODULE_ID)`.
 */
export function useEditingSlice<K extends keyof EditingState>(
  key: K,
): [EditingState[K], (updater: (prev: EditingState[K]) => EditingState[K]) => void] {
  const [state, setState] = useModuleState<EditingState>(EDITING_MODULE_ID);
  const setSlice = useCallback(
    (updater: (prev: EditingState[K]) => EditingState[K]) => {
      setState((prev) => ({ ...prev, [key]: updater(prev[key]) }));
    },
    [setState, key],
  );
  return [state[key], setSlice];
}
