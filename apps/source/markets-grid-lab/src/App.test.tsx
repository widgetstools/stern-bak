import './testSetupMocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId, getOneByText } from '../../../test-utils/queries';
import { App } from './App';
import { mockApplyTheme, mockGetTheme } from './testSetupMocks';

const ALL_TAB_IDS = [
  'overview',
  'formatting',
  'visual-excel',
  'renderers',
  'toolbar',
  'groups',
  'calc',
  'conditional',
  'filters',
  'live',
  'alerts',
  'editing',
  'bulk-update',
  'plus-minus',
  'shortcuts',
  'profiles',
  'stress',
];

describe('App', () => {
  beforeEach(() => {
    mockApplyTheme.mockClear();
    mockGetTheme.mockReturnValue({ theme: 'dark' });
  });

  it('renders home tab by default', () => {
    render(<App />);
    expect(getOneByText('MarketsGrid Feature Lab')).toBeInTheDocument();
    expect(getOneByTestId('lab-home')).toBeInTheDocument();
  });

  it('navigates to every feature tab', async () => {
    render(<App />);
    for (const tabId of ALL_TAB_IDS) {
      await userEvent.click(getOneByTestId(`lab-tab-${tabId}`));
      await waitFor(
        () => expect(getOneByTestId(`tab-panel-${tabId}`)).toBeInTheDocument(),
        { timeout: 3000 },
      );
    }
  }, 60_000);

  it('returns to home from sidebar', async () => {
    render(<App />);
    await userEvent.click(getOneByTestId('lab-tab-overview'));
    // Same 3s the navigation test above allows: every tab is a lazy chunk, and
    // the default 1s is thin once the whole suite runs in parallel under
    // coverage instrumentation.
    await waitFor(() => expect(getOneByTestId('markets-grid')).toBeInTheDocument(), {
      timeout: 3000,
    });
    await userEvent.click(getOneByTestId('lab-tab-home'));
    expect(getOneByTestId('lab-home')).toBeInTheDocument();
  });

  it('toggles theme from header', async () => {
    render(<App />);
    await userEvent.click(getOneByTestId('theme-toggle'));
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'light' });
  });

  it('filters sidebar tabs and clears filter', async () => {
    render(<App />);
    await userEvent.type(getOneByTestId('lab-sidebar-filter'), 'format');
    expect(getOneByTestId('lab-tab-formatting')).toBeInTheDocument();
    await userEvent.clear(getOneByTestId('lab-sidebar-filter'));
  });

  it('shows tab hint in header for active tab', async () => {
    render(<App />);
    await userEvent.click(getOneByTestId('lab-tab-live'));
    await waitFor(() => expect(getOneByText(/High-frequency stream/)).toBeInTheDocument());
  });
});
