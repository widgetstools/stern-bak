import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { mockApplyTheme, mockGetTheme } from '../../markets-grid-lab/src/testSetupMocks';

const mockRender = vi.fn();
vi.mock('react-dom/client', () => ({ createRoot: vi.fn(() => ({ render: mockRender })) }));
vi.mock('./App', () => ({ App: () => <div data-testid="ssrm-lab-app" /> }));

describe('main', () => {
  beforeEach(() => {
    mockRender.mockClear();
    mockApplyTheme.mockClear();
    mockGetTheme.mockReturnValue({ theme: 'dark' });
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('applies the saved theme and mounts the lab inside the data hub', async () => {
    vi.resetModules();
    await import('./main');

    await vi.waitFor(() => expect(mockRender).toHaveBeenCalled());
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'dark' });

    render(mockRender.mock.calls[0][0]);
    expect(screen.getByTestId('ssrm-lab-app')).toBeInTheDocument();
    expect(screen.getByTestId('data-hub-provider')).toHaveAttribute('data-has-platform', 'true');
  });

  /**
   * Without the hub there is no SSRM engine, so every tab would render an
   * empty grid with no explanation. The bootstrap error names the cause.
   */
  it('renders the bootstrap error when the hub will not start', async () => {
    const { ensurePlatformReady } = await import('@wellsfargo-starui/data');
    vi.mocked(ensurePlatformReady).mockRejectedValueOnce(new Error('SharedWorker blocked'));
    vi.resetModules();
    await import('./main');

    await vi.waitFor(() => expect(mockRender).toHaveBeenCalled());
    render(mockRender.mock.calls[0][0]);

    expect(screen.getByText(/data services unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('SharedWorker blocked')).toBeInTheDocument();
  });

  it('renders a non-Error rejection as its string form', async () => {
    const { ensurePlatformReady } = await import('@wellsfargo-starui/data');
    vi.mocked(ensurePlatformReady).mockRejectedValueOnce('config 404');
    vi.resetModules();
    await import('./main');

    await vi.waitFor(() => expect(mockRender).toHaveBeenCalled());
    render(mockRender.mock.calls[0][0]);
    expect(screen.getByText('config 404')).toBeInTheDocument();
  });
});
