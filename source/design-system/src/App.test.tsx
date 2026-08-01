import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getOneByTestId } from '../../../test-utils/queries';
import { App } from './App';
import { mockApplyTheme, mockGetTheme, mockToast } from './testSetupMocks';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
    mockToast.mockClear();
    mockApplyTheme.mockClear();
    mockGetTheme.mockReturnValue({ theme: 'dark' });
  });

  it('renders top bar, tabs, and dock manager', () => {
    render(<App />);
    expect(screen.getByTestId('ds-topbar')).toBeInTheDocument();
    expect(screen.getByTestId('dock-manager-core')).toBeInTheDocument();
    expect(screen.getByTestId('toaster')).toBeInTheDocument();
  });

  it('switches tabs', async () => {
    render(<App />);
    await userEvent.click(getOneByTestId('ds-tab-orders'));
    expect(getOneByTestId('widget-ordersKpi')).toBeInTheDocument();
  });

  it('opens trade ticket and RFQ overlays', async () => {
    render(<App />);
    await userEvent.click(getOneByTestId('topbar-new-order'));
    expect(getOneByTestId('float-ticket')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
    await userEvent.click(getOneByTestId('topbar-rfq'));
    expect(getOneByTestId('float-rfq')).toBeInTheDocument();
  });

  it('saves and resets layout with toast feedback', async () => {
    render(<App />);
    await userEvent.click(getOneByTestId('topbar-save'));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Layout saved' }),
      ),
    );
    await userEvent.click(getOneByTestId('topbar-reset'));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Layout reset' }),
      ),
    );
  });

  it('toggles theme from top bar', async () => {
    render(<App />);
    await userEvent.click(getOneByTestId('theme-toggle'));
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'light' });
  });
});
