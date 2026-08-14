import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function mountToolbar(allow: React.ComponentProps<typeof EditingToolbar>['allow']) {
  const platform = new GridPlatform({ gridId: 'test-grid', modules: [] });
  platform.store.setModuleState(DATA_CHANGE_HISTORY_MODULE_ID, () => ({
    settings: { enabled: true },
    entries: [],
  }));
  platform.store.setModuleState<EditingState>(EDITING_MODULE_ID, () => ({
    ...structuredClone(INITIAL_EDITING),
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
  }));
  return render(
    <GridProvider platform={platform}>
      <EditingToolbar allow={allow} />
    </GridProvider>,
  );
}

describe('EditingToolbar', () => {
  it('renders null when row is not visible', () => {
    const { container } = mountToolbar({
      rowVisible: false,
      allowHistory: true,
      allowSmartEdit: true,
      allowBulkUpdate: true,
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders enabled segments when allowed', () => {
    mountToolbar({
      rowVisible: true,
      allowHistory: true,
      allowSmartEdit: true,
      allowBulkUpdate: true,
    });
    expect(screen.getByTestId('editing-toolbar-pinned')).toBeInTheDocument();
    expect(screen.getByTestId('history-segment')).toBeInTheDocument();
    expect(screen.getByTestId('smart-edit-segment')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-update-segment')).toBeInTheDocument();
    expect(screen.getByTestId('editing-toolbar-keyboard-menu')).toBeInTheDocument();
  });

  it('hides keyboard menu when no nudges or shortcuts enabled', () => {
    const platform = new GridPlatform({ gridId: 'test-grid', modules: [] });
    platform.store.setModuleState(DATA_CHANGE_HISTORY_MODULE_ID, () => ({
      settings: { enabled: true },
      entries: [],
    }));
    platform.store.setModuleState<EditingState>(EDITING_MODULE_ID, () => ({
      ...structuredClone(INITIAL_EDITING),
      plusMinus: { settings: { enabled: true, recordHistory: true }, nudges: [] },
      shortcuts: { settings: { enabled: false, recordHistory: true }, shortcuts: [] },
    }));
    render(
      <GridProvider platform={platform}>
        <EditingToolbar allow={{ rowVisible: true, allowHistory: true, allowSmartEdit: false, allowBulkUpdate: false }} />
      </GridProvider>,
    );
    expect(screen.queryByTestId('editing-toolbar-keyboard-menu')).toBeNull();
  });
});
