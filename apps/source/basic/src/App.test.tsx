import './staruiVitestMocks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { getOneByTestId, getOneByText } from '../../../test-utils/queries';
import {
  mockApplyTheme,
  mockGetTheme,
  mockMarketsGridEvents,
} from './staruiVitestMocks';

const STORAGE_KEY = 'bundle:bond-blotter-v1';
const ACTIVE_KEY = 'active:bond-blotter-v1';

function fireShortcut(key: string, opts: { shift?: boolean; meta?: boolean } = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: opts.meta !== false,
    metaKey: opts.meta !== false,
    shiftKey: opts.shift ?? false,
    bubbles: true,
  });
  window.dispatchEvent(event);
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApplyTheme.mockClear();
    mockGetTheme.mockReturnValue({ theme: 'dark' });
    mockMarketsGridEvents.on.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the bond blotter shell', async () => {
    const { App } = await import('./App');
    render(<App />);
    expect(screen.getByText('Bond Blotter')).toBeInTheDocument();
    expect(screen.getByTestId('markets-grid')).toBeInTheDocument();
    expect(screen.getByTestId('markets-grid')).toHaveAttribute(
      'data-grid-id',
      'bond-blotter-v1',
    );
  });

  it('toggles theme via button', async () => {
    const user = userEvent.setup();
    const { App } = await import('./App');
    render(<App />);

    await user.click(getOneByTestId('theme-toggle'));
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('toggles theme via Ctrl+.', async () => {
    const { App } = await import('./App');
    render(<App />);
    fireShortcut('.');
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('opens help via button and Ctrl+/', async () => {
    const user = userEvent.setup();
    const { App } = await import('./App');
    render(<App />);

    await user.click(getOneByTestId('help-toggle'));
    expect(getOneByText('Help & documentation')).toBeInTheDocument();

    fireShortcut('/');
    await waitFor(() => {
      const openPanels = screen
        .queryAllByText('Help & documentation')
        .filter((el) => el.closest('[data-state="open"]') !== null);
      expect(openPanels).toHaveLength(0);
    });
  });

  it('toggles inspector via Ctrl+J', async () => {
    const { App } = await import('./App');
    render(<App />);
    fireShortcut('j');
    await waitFor(() => {
      expect(getOneByText('Layout storage inspector')).toBeInTheDocument();
    });
    fireShortcut('j');
    await waitFor(() => {
      expect(screen.queryAllByText('Layout storage inspector')).toHaveLength(0);
    });
  });

  it('exports config on Ctrl+E when storage exists', async () => {
    localStorage.setItem(STORAGE_KEY, '{"profiles":[]}');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:url');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const { App } = await import('./App');
    render(<App />);
    fireShortcut('e');

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();

    clickSpy.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('does nothing on Ctrl+E when storage is empty', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { App } = await import('./App');
    render(<App />);
    fireShortcut('e');
    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('triggers import file picker on Ctrl+I', async () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const { App } = await import('./App');
    render(<App />);
    fireShortcut('i');
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('resets storage and reloads on Ctrl+Shift+R', async () => {
    localStorage.setItem(STORAGE_KEY, '{"profiles":[]}');
    localStorage.setItem(ACTIVE_KEY, 'p1');
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    const { App } = await import('./App');
    render(<App />);
    fireShortcut('r', { shift: true });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(reload).toHaveBeenCalled();
  });

  it('reads profile pulse from localStorage on mount', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profiles: [{ id: 'p1', name: 'My Layout', state: {} }],
        activeProfileId: 'p1',
      }),
    );
    localStorage.setItem(ACTIVE_KEY, 'p1');

    const { App } = await import('./App');
    render(<App />);
    expect(screen.getAllByText('My Layout').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
  });

  it('subscribes to grid profile events on ready', async () => {
    const { App } = await import('./App');
    render(<App />);
    await waitFor(() => {
      expect(mockMarketsGridEvents.on).toHaveBeenCalledWith(
        'profile:loaded',
        expect.any(Function),
      );
      expect(mockMarketsGridEvents.on).toHaveBeenCalledWith(
        'profile:saved',
        expect.any(Function),
      );
    });
  });

  it('updates pulse when profile:loaded fires', async () => {
    const { App } = await import('./App');
    render(<App />);
    await waitFor(() => expect(mockMarketsGridEvents.on).toHaveBeenCalled());

    const loadedHandler = mockMarketsGridEvents.on.mock.calls.find(
      (c) => c[0] === 'profile:loaded',
    )?.[1] as () => void;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profiles: [{ id: 'p2', name: 'Updated', state: {} }],
        activeProfileId: 'p2',
      }),
    );
    localStorage.setItem(ACTIVE_KEY, 'p2');

    loadedHandler();

    await waitFor(() => {
      expect(screen.getAllByText('Updated').length).toBeGreaterThan(0);
    });
  });

  it('shows light-mode icon when theme is light', async () => {
    mockGetTheme.mockReturnValue({ theme: 'light' });
    const { App } = await import('./App');
    render(<App />);
    expect(screen.getAllByLabelText('Switch to dark mode')[0]).toBeInTheDocument();
  });

  it('handles corrupt localStorage gracefully', async () => {
    localStorage.setItem(STORAGE_KEY, '{bad json');
    const { App } = await import('./App');
    render(<App />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
