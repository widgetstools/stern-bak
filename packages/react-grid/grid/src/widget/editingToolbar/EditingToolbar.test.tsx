import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/engine';
import {
  BULK_UPDATE_MODULE_ID,
  DATA_CHANGE_HISTORY_MODULE_ID,
  PLUS_MINUS_MODULE_ID,
  SHORTCUTS_MODULE_ID,
  SMART_EDIT_MODULE_ID,
} from '@wellsfargo-starui/engine';
import { GridProvider } from '@wellsfargo-starui/grid/customizer';
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
  platform.store.setModuleState(SMART_EDIT_MODULE_ID, () => ({
    settings: { enabled: true },
    rules: [],
  }));
  platform.store.setModuleState(BULK_UPDATE_MODULE_ID, () => ({
    settings: { enabled: true },
    rules: [],
  }));
  platform.store.setModuleState(PLUS_MINUS_MODULE_ID, () => ({
    settings: { enabled: true },
    nudges: [{ id: 'n1', name: 'Price', incrementStep: 1, decrementStep: 1, enabled: true }],
  }));
  platform.store.setModuleState(SHORTCUTS_MODULE_ID, () => ({
    settings: { enabled: true },
    shortcuts: [{ id: 's1', name: 'Fill', shortcutKey: 'f', operation: 'set', shortcutValue: '1', enabled: true }],
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
    platform.store.setModuleState(PLUS_MINUS_MODULE_ID, () => ({
      settings: { enabled: true },
      nudges: [],
    }));
    platform.store.setModuleState(SHORTCUTS_MODULE_ID, () => ({
      settings: { enabled: false },
      shortcuts: [],
    }));
    render(
      <GridProvider platform={platform}>
        <EditingToolbar allow={{ rowVisible: true, allowHistory: true, allowSmartEdit: false, allowBulkUpdate: false }} />
      </GridProvider>,
    );
    expect(screen.queryByTestId('editing-toolbar-keyboard-menu')).toBeNull();
  });
});
