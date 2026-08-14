import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PrimaryToolbar } from './PrimaryToolbar';

vi.mock('./FiltersToolbar', () => ({ FiltersToolbar: () => <div data-testid="filters-toolbar" /> }));
vi.mock('./QuickSearch', () => ({ QuickSearch: () => <div data-testid="quick-search" /> }));
vi.mock('./ViewMenu', () => ({
  ViewMenu: (props: { onToggleStyleToolbar: () => void }) => (
    <button type="button" data-testid="view-menu" onClick={props.onToggleStyleToolbar}>View</button>
  ),
}));
vi.mock('./ProfileSelector', () => ({
  ProfileSelector: () => <div data-testid="profile-selector" />,
}));
vi.mock('./ToolbarDatePicker', () => ({
  ToolbarDatePicker: () => <div data-testid="toolbar-date-picker" />,
}));
vi.mock('./GridDensityPill', () => ({
  GridDensityPill: () => <div data-testid="grid-density-pill" />,
}));
vi.mock('../customizer/modules/alerts', () => ({
  AlertsBadge: () => <div data-testid="alerts-badge" />,
}));
vi.mock('./PrimaryToolbarOverflowMenu', () => ({
  PrimaryToolbarInlineActions: () => <div data-testid="inline-actions" />,
  PrimaryToolbarOverflowMenu: () => <div data-testid="overflow-actions" />,
}));

const profileActions = {
  onCreate: vi.fn(),
  onLoad: vi.fn(),
  onDelete: vi.fn(),
  onClone: vi.fn(),
  onRename: vi.fn(),
  onExport: vi.fn(),
  onImport: vi.fn(),
};

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    tabsHidden: false,
    caption: 'My Grid',
    onCaptionChange: vi.fn(),
    showFiltersToolbar: true,
    showFormattingToolbar: true,
    showAutoFormat: true,
    styleToolbarOpen: false,
    onToggleStyleToolbar: vi.fn(),
    showEditingToolbar: true,
    editingToolbarOpen: false,
    onToggleEditingToolbar: vi.fn(),
    onOpenColumnSelector: vi.fn(),
    showProfileSelector: true,
    profileList: [{ id: 'a', name: 'Default', updatedAt: 1 }],
    activeProfileId: 'a',
    profileActions,
    isDirty: true,
    showSaveButton: true,
    saveFlash: false,
    onSaveAll: vi.fn(),
    showSettingsButton: true,
    onOpenSettings: vi.fn(),
    showVisualExcelExport: true,
    visualExcelExportEnabled: true,
    onExportVisualExcel: vi.fn(),
    adminActions: undefined,
    componentName: undefined,
    gridId: 'grid-1',
    instanceId: undefined,
    appId: undefined,
    userId: undefined,
    toolbarDate: '2024-01-01',
    onToolbarDateChange: vi.fn(),
    toolbarDateHistoryEnabled: true,
    toolbarActionsLayout: 'inline' as const,
    gridDensity: 'comfortable' as const,
    ...overrides,
  };
}

describe('PrimaryToolbar', () => {
  it('renders filters toolbar, profile cluster, and inline actions', () => {
    render(<PrimaryToolbar {...baseProps()} />);
    expect(screen.getByTestId('filters-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('profile-selector')).toBeInTheDocument();
    expect(screen.getByTestId('inline-actions')).toBeInTheDocument();
    expect(screen.getByTestId('save-all-btn')).toHaveAttribute('data-state', 'dirty');
  });

  it('shows save flash check icon and overflow menu layout', () => {
    render(
      <PrimaryToolbar
        {...baseProps({
          saveFlash: true,
          toolbarActionsLayout: 'overflow',
          showFiltersToolbar: false,
        })}
      />,
    );
    expect(screen.getByTestId('save-all-btn')).toHaveAttribute('data-state', 'saved');
    expect(screen.getByTestId('overflow-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('filters-toolbar')).toBeNull();
  });

  it('always shows the toolbar date picker inside the profile cluster', () => {
    render(<PrimaryToolbar {...baseProps()} />);
    expect(screen.getByTestId('toolbar-date-picker')).toBeInTheDocument();
  });

  it('hides profile selector and save button when disabled (date picker stays)', () => {
    render(
      <PrimaryToolbar
        {...baseProps({
          showProfileSelector: false,
          showSaveButton: false,
        })}
      />,
    );
    expect(screen.queryByTestId('profile-selector')).toBeNull();
    expect(screen.queryByTestId('save-all-btn')).toBeNull();
    expect(screen.getByTestId('toolbar-date-picker')).toBeInTheDocument();
  });

  it('calls onSaveAll from save button', () => {
    const onSaveAll = vi.fn();
    render(<PrimaryToolbar {...baseProps({ onSaveAll })} />);
    fireEvent.click(screen.getByTestId('save-all-btn'));
    expect(onSaveAll).toHaveBeenCalled();
  });
});
