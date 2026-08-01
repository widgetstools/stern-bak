import './testSetupMocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOneByText } from '../../../test-utils/queries';
import { mockApplyTheme, mockGetTheme } from './testSetupMocks';

const mockRender = vi.fn();

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: mockRender })),
}));

vi.mock('./App', () => ({
  App: () => null,
}));

describe('main', () => {
  beforeEach(() => {
    mockRender.mockClear();
    mockApplyTheme.mockClear();
    mockGetTheme.mockReturnValue({ theme: 'dark' });
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('bootstraps platform and mounts App on success', async () => {
    vi.resetModules();
    await import('./main');

    await vi.waitFor(() => expect(mockRender).toHaveBeenCalled());
    expect(mockGetTheme).toHaveBeenCalled();
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('renders bootstrap error UI when platform init fails', async () => {
    const { ensurePlatformReady } = await import('@wellsfargo-starui/host-data');
    vi.mocked(ensurePlatformReady).mockRejectedValueOnce(new Error('worker down'));

    vi.resetModules();
    const { render, screen } = await import('@testing-library/react');
    await import('./main');

    await vi.waitFor(() => expect(mockRender).toHaveBeenCalled());
    render(mockRender.mock.calls[0][0]);
    expect(getOneByText(/data services unavailable/i)).toBeInTheDocument();
    expect(getOneByText('worker down')).toBeInTheDocument();
  });

  it('renders bootstrap error UI for non-Error rejection', async () => {
    const { ensurePlatformReady } = await import('@wellsfargo-starui/host-data');
    vi.mocked(ensurePlatformReady).mockRejectedValueOnce('plain failure');

    vi.resetModules();
    const { render, screen } = await import('@testing-library/react');
    await import('./main');

    await vi.waitFor(() => expect(mockRender).toHaveBeenCalled());
    render(mockRender.mock.calls[0][0]);
    expect(getOneByText(/data services unavailable/i)).toBeInTheDocument();
    expect(getOneByText('plain failure')).toBeInTheDocument();
  });
});
