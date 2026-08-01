import '../staruiVitestMocks';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getOneByText } from '../../../../test-utils/queries';
import { AppMenubar } from './AppMenubar';

describe('AppMenubar', () => {
  const handlers = {
    onReset: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onOpenInspector: vi.fn(),
    onToggleTheme: vi.fn(),
    isDark: true,
  };

  it('renders File, View, and Help menus', () => {
    render(<AppMenubar {...handlers} />);
    expect(screen.getByText('File')).toBeInTheDocument();
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
  });

  it('calls export and import handlers from File menu', async () => {
    const user = userEvent.setup();
    render(<AppMenubar {...handlers} />);

    await user.click(getOneByText('Export config…'));
    expect(handlers.onExport).toHaveBeenCalledTimes(1);

    await user.click(getOneByText('Import config…'));
    expect(handlers.onImport).toHaveBeenCalledTimes(1);
  });

  it('calls reset from File menu', async () => {
    const user = userEvent.setup();
    render(<AppMenubar {...handlers} />);
    await user.click(getOneByText('Reset all layouts'));
    expect(handlers.onReset).toHaveBeenCalledTimes(1);
  });

  it('calls inspector and theme toggle from View menu', async () => {
    const user = userEvent.setup();
    render(<AppMenubar {...handlers} />);

    await user.click(getOneByText('Storage inspector'));
    expect(handlers.onOpenInspector).toHaveBeenCalledTimes(1);

    await user.click(getOneByText('Switch to light mode'));
    expect(handlers.onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('shows dark mode label when isDark is false', () => {
    render(<AppMenubar {...handlers} isDark={false} />);
    expect(getOneByText('Switch to dark mode')).toBeInTheDocument();
  });

  it('opens external links from Help menu', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<AppMenubar {...handlers} />);

    await user.click(getOneByText('About this demo'));
    expect(openSpy).toHaveBeenCalledWith(
      'https://github.com/nndrao/starui',
      '_blank',
      'noopener,noreferrer',
    );

    await user.click(getOneByText('AG-Grid documentation'));
    expect(openSpy).toHaveBeenCalledWith(
      'https://www.ag-grid.com/javascript-data-grid/',
      '_blank',
      'noopener,noreferrer',
    );

    openSpy.mockRestore();
  });
});
