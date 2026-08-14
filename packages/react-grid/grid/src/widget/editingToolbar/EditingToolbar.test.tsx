import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  EDITING_MODULE_ID,
  INITIAL_EDITING,
  type EditingState,
} from '@wellsfargo-starui/core';
import { GridProvider } from '../../customizer/internal.js';
import { EditingToolbar } from './EditingToolbar';

vi.mock('../../customizer/modules/bulk-update/BulkUpdateToolbarBody', () => ({
  BulkUpdateToolbarBody: () => <div data-testid="bulk-update-segment" />,
}));
vi.mock('../../customizer/modules/data-change-history/EditHistoryToolbarBody', () => ({
  EditHistoryToolbarBody: () => <div data-testid="history-segment" />,
}));
vi.mock('../../customizer/modules/smart-edit/SmartEditToolbarBody', () => ({
  SmartEditToolbarBody: () => <div data-testid="smart-edit-segment" />,
}));

function mountToolbar(
  editing: Partial<EditingState> = {},
  historyEnabled = true,
) {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [] });
  platform.store.setModuleState(DATA_CHANGE_HISTORY_MODULE_ID, () => ({
    settings: { enabled: historyEnabled },
    entries: [],
  }));
  platform.store.setModuleState<EditingState>(EDITING_MODULE_ID, () => ({
    ...structuredClone(INITIAL_EDITING),
    ...editing,
  }));
  return render(
    <GridProvider platform={platform}>
      <EditingToolbar />
    </GridProvider>,
  );
}

function disabledSlice<S extends { settings: { enabled: boolean } }>(slice: S): S {
  return { ...slice, settings: { ...slice.settings, enabled: false } };
}

describe('EditingToolbar', () => {
  it('renders null when no primary module is enabled', () => {
    const initial = structuredClone(INITIAL_EDITING);
    const { container } = mountToolbar(
      {
        smartEdit: disabledSlice(initial.smartEdit),
        bulkUpdate: disabledSlice(initial.bulkUpdate),
      },
      false,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders every enabled segment plus the keyboard menu', () => {
    mountToolbar({
      plusMinus: {
        settings: { enabled: true, recordHistory: true },
        nudges: [
          { id: 'n1', name: 'Price', incrementStep: 1, decrementStep: 1, enabled: true, scope: { columnIds: [] } },
        ],
      },
      shortcuts: {
        settings: { enabled: true, recordHistory: true },
        shortcuts: [
          {
            id: 's1',
            name: 'Fill',
            shortcutKey: 'f',
            operation: 'multiply',
            shortcutValue: 1,
            enabled: true,
            scope: { columnIds: [] },
          },
        ],
      },
    });
    expect(screen.getByTestId('editing-toolbar-pinned')).toBeInTheDocument();
    expect(screen.getByTestId('history-segment')).toBeInTheDocument();
    expect(screen.getByTestId('smart-edit-segment')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-update-segment')).toBeInTheDocument();
    expect(screen.getByTestId('editing-toolbar-keyboard-menu')).toBeInTheDocument();
  });

  it('omits a segment whose module switch is off', () => {
    const initial = structuredClone(INITIAL_EDITING);
    mountToolbar({ bulkUpdate: disabledSlice(initial.bulkUpdate) });
    expect(screen.getByTestId('smart-edit-segment')).toBeInTheDocument();
    expect(screen.queryByTestId('bulk-update-segment')).toBeNull();
  });

  it('hides keyboard menu when no nudges or shortcuts enabled', () => {
    mountToolbar({
      plusMinus: { settings: { enabled: true, recordHistory: true }, nudges: [] },
      shortcuts: { settings: { enabled: false, recordHistory: true }, shortcuts: [] },
    });
    expect(screen.getByTestId('editing-toolbar-pinned')).toBeInTheDocument();
    expect(screen.queryByTestId('editing-toolbar-keyboard-menu')).toBeNull();
  });
});
