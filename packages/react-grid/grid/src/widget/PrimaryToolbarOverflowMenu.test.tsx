import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PrimaryToolbarInlineActions,
  PrimaryToolbarOverflowMenu,
} from './PrimaryToolbarOverflowMenu';

vi.mock('./LazySettingsSheet', () => ({
  preloadSettingsSheet: vi.fn(),
}));

vi.mock('../customizer/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../customizer/index.js')>();
  return {
    ...actual,
    useActiveThemeMode: () => 'dark',
  };
});

function makeProps(overrides = {}) {
  return {
    showVisualExcelExport: true,
    visualExcelExportEnabled: true,
    onExportVisualExcel: vi.fn(),
    showSettingsButton: true,
    onOpenSettings: vi.fn(),
    adminActions: [{ id: 'diag', label: 'Diagnostics', onClick: vi.fn() }],
    componentName: 'Grid',
    gridId: 'grid-1',
    instanceId: 'inst-1',
    appId: 'app',
    userId: 'user',
    ...overrides,
  };
}

describe('PrimaryToolbarOverflowMenu', () => {
  it('opens overflow menu actions and grid info dialog', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<PrimaryToolbarOverflowMenu {...props} />);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByTestId('visual-excel-export-btn'));
    expect(props.onExportVisualExcel).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    await user.click(screen.getByTestId('grid-info-btn'));
    expect(screen.getByText('Grid')).toBeInTheDocument();
  });
});

describe('PrimaryToolbarInlineActions', () => {
  it('renders inline export, settings, admin, and info buttons', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<PrimaryToolbarInlineActions {...props} />);

    await user.click(screen.getByRole('button', { name: 'Export to Excel' }));
    expect(props.onExportVisualExcel).toHaveBeenCalled();

    await user.click(screen.getByTestId('v2-settings-open-btn'));
    expect(props.onOpenSettings).toHaveBeenCalled();
    expect(screen.getByTestId('admin-action-diag')).toBeInTheDocument();
    expect(screen.getByTestId('grid-info-btn')).toBeInTheDocument();
  });
});
