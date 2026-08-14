import * as React from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  EDITING_MODULE_ID,
  INITIAL_EDITING,
  type EditingState,
} from '@wellsfargo-starui/core';
import { GridProvider } from '../../customizer/internal.js';
import { useEditingToolbarVisible } from './useEditingToolbarVisible';

function runHook(
  showEditingToolbar: boolean | undefined,
  opts: { smartEdit?: boolean; bulkUpdate?: boolean; history?: boolean } = {},
) {
  const { smartEdit = false, bulkUpdate = false, history = false } = opts;
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [] });
  platform.store.setModuleState(DATA_CHANGE_HISTORY_MODULE_ID, () => ({
    settings: { enabled: history },
    entries: [],
  }));
  const initial = structuredClone(INITIAL_EDITING);
  platform.store.setModuleState<EditingState>(EDITING_MODULE_ID, () => ({
    ...initial,
    smartEdit: { ...initial.smartEdit, settings: { ...initial.smartEdit.settings, enabled: smartEdit } },
    bulkUpdate: { ...initial.bulkUpdate, settings: { ...initial.bulkUpdate.settings, enabled: bulkUpdate } },
  }));
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <GridProvider platform={platform}>{children}</GridProvider>
  );
  return renderHook(() => useEditingToolbarVisible(showEditingToolbar), { wrapper }).result.current;
}

describe('useEditingToolbarVisible', () => {
  it('host true wins even with every module disabled', () => {
    expect(runHook(true)).toBe(true);
  });

  it('host false wins even with every module enabled', () => {
    expect(runHook(false, { smartEdit: true, bulkUpdate: true, history: true })).toBe(false);
  });

  it('undefined defers to modules — visible when any toolbar-bearing switch is on', () => {
    expect(runHook(undefined, { smartEdit: true })).toBe(true);
    expect(runHook(undefined, { bulkUpdate: true })).toBe(true);
    expect(runHook(undefined, { history: true })).toBe(true);
  });

  it('undefined with every module disabled stays hidden', () => {
    expect(runHook(undefined)).toBe(false);
  });
});
