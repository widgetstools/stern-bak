import './testSetupMocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId } from '../../../test-utils/queries';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import {
  clearLocalStorage,
  loadFromLocalStorage,
  saveToLocalStorage,
} from '@widgetstools/dock-manager-core';
import { mockDockCore } from './testSetupMocks';
import { App } from './App';
import { initPlatformBootstrap } from './platformBootstrap';

describe('App', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockDockCore.reset();
    localStorage.clear();
    vi.mocked(getTheme).mockReturnValue({ theme: 'dark' } as never);
    vi.mocked(loadFromLocalStorage).mockReturnValue(null);
    vi.mocked(saveToLocalStorage).mockClear();
    vi.mocked(clearLocalStorage).mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    await initPlatformBootstrap();
  });

  it('renders the shell with dock manager and default widgets', () => {
    render(<App />);

    expect(screen.getByText('DataProvider Editor + ConfigBrowser')).toBeInTheDocument();
    expect(screen.getByTestId('dock-manager-core')).toBeInTheDocument();
    expect(screen.getByTestId('widget-stats')).toBeInTheDocument();
    expect(screen.getByTestId('widget-grid-a')).toBeInTheDocument();
    expect(screen.getByTestId('widget-grid-b')).toBeInTheDocument();
  });

  it('opens and closes the help sheet from the header button', async () => {
    render(<App />);

    const closedPanels = screen
      .queryAllByTestId('sheet')
      .filter((el) => el.closest('[data-state="open"]') !== null);
    expect(closedPanels).toHaveLength(0);
    await userEvent.click(getOneByTestId('help-toggle'));
    expect(getOneByTestId('sheet')).toBeInTheDocument();
  });

  it('toggles theme and applies the next design-system theme', async () => {
    render(<App />);

    await userEvent.click(getOneByTestId('theme-toggle'));
    expect(applyTheme).toHaveBeenCalledWith({ theme: 'light' });

    vi.mocked(getTheme).mockReturnValue({ theme: 'light' } as never);
    await userEvent.click(getOneByTestId('theme-toggle'));
    expect(applyTheme).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('handles keyboard shortcuts for help and theme', () => {
    render(<App />);

    fireEvent.keyDown(window, { key: '/', metaKey: true });
    expect(getOneByTestId('sheet')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '.', ctrlKey: true });
    expect(applyTheme).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('saves the current dock layout to localStorage', async () => {
    render(<App />);

    await userEvent.click(getOneByTestId('save-layout'));
    expect(saveToLocalStorage).toHaveBeenCalledOnce();
  });

  it('warns when saving the dock layout fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(saveToLocalStorage).mockImplementation(() => {
      throw new Error('save failed');
    });

    render(<App />);
    await userEvent.click(getOneByTestId('save-layout'));

    expect(warn).toHaveBeenCalledWith('[dock-layout] save failed', expect.any(Error));
    warn.mockRestore();
  });

  it('resets the dock layout after confirmation', async () => {
    render(<App />);

    await userEvent.click(getOneByTestId('reset-layout'));
    expect(clearLocalStorage).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reset the dock layout when confirmation is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<App />);

    await userEvent.click(getOneByTestId('reset-layout'));
    expect(clearLocalStorage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('opens a floating provider editor panel from the View menu', async () => {
    render(<App />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Provider Editor' })[0]!);

    expect(mockDockCore.dockApi.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'providerEditor', dockable: false }),
    );
    expect(mockDockCore.dockApi.floatPanel).toHaveBeenCalled();
    expect(mockDockCore.dockApi.bringToFront).toHaveBeenCalledWith('providerEditor');
  });

  it('closes an open floating panel when toggled again', async () => {
    mockDockCore.dockApi.hasPanel.mockReturnValue(true);
    render(<App />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Provider Editor' })[0]!);
    expect(mockDockCore.dockApi.closePanel).toHaveBeenCalledWith('providerEditor');
  });

  it('syncs floating panel state when a panel is closed via dock chrome', async () => {
    mockDockCore.dockApi.hasPanel.mockImplementation((id: string) => id === 'providerEditor');
    render(<App />);

    expect(
      screen.getAllByRole('button', { name: 'Provider Editor' }).find(
        (el) => el.getAttribute('data-checked') === 'true',
      ),
    ).toBeTruthy();

    await userEvent.click(getOneByTestId('close-provider-editor'));
    await waitFor(() => {
      expect(
        screen.getAllByRole('button', { name: 'Provider Editor' }).find(
          (el) => el.getAttribute('data-checked') === 'false',
        ),
      ).toBeTruthy();
    });
  });

  it('opens the provider editor when a grid requests edit', async () => {
    render(<App />);

    await userEvent.click(screen.getAllByTestId('edit-provider')[0]!);
    expect(mockDockCore.dockApi.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({ panelId: 'providerEditor' }),
    );
  });

  it('brings an existing provider editor to front when edit is requested again', async () => {
    mockDockCore.dockApi.hasPanel.mockImplementation((id: string) => id === 'providerEditor');
    render(<App />);

    await userEvent.click(screen.getAllByTestId('edit-provider')[0]!);
    expect(mockDockCore.dockApi.bringToFront).toHaveBeenCalledWith('providerEditor');
    expect(mockDockCore.dockApi.addPanel).not.toHaveBeenCalled();
  });

  it('uses the default layout when persisted layout is missing required panels', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(loadFromLocalStorage).mockReturnValue({
      state: {
        panels: new Map([['gridA', { id: 'gridA' }]]),
        layout: {},
        placements: new Map(),
      },
      warnings: [],
    } as never);

    render(<App />);
    expect(warn).toHaveBeenCalledWith(
      '[dock-layout] required panels missing — using default layout.',
      expect.objectContaining({ missing: expect.arrayContaining(['gridB', 'stats']) }),
    );
    warn.mockRestore();
  });

  it('restores a valid persisted layout and logs restore warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const persistedState = {
      panels: new Map([
        ['gridA', { id: 'gridA' }],
        ['gridB', { id: 'gridB' }],
        ['stats', { id: 'stats' }],
        ['configBrowser', { id: 'configBrowser' }],
      ]),
      layout: { type: 'split' },
      placements: new Map(),
    };

    vi.mocked(loadFromLocalStorage).mockReturnValue({
      state: persistedState,
      warnings: ['restored with warnings'],
    } as never);

    render(<App />);
    expect(warn).toHaveBeenCalledWith('[dock-layout] restore warnings:', ['restored with warnings']);
    warn.mockRestore();
  });

  it('falls back to default layout when persisted layout cannot be loaded', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(loadFromLocalStorage).mockImplementation(() => {
      throw new Error('bad blob');
    });

    render(<App />);
    expect(warn).toHaveBeenCalledWith('[dock-layout] failed to load persisted layout', expect.any(Error));
    warn.mockRestore();
  });

  it('uses light dock theme when the app theme is light', () => {
    vi.mocked(getTheme).mockReturnValue({ theme: 'light' } as never);
    render(<App />);
    expect(getOneByTestId('dock-manager-core')).toBeInTheDocument();
  });
});
