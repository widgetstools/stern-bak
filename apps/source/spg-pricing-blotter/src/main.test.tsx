import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  render: vi.fn(),
  applyTheme: vi.fn(),
  getTheme: vi.fn(() => ({ theme: 'dark' })),
  initPlatformBootstrap: vi.fn(async () => ({
    config: { userId: 'dev1' },
    platform: { hub: 'platform' },
  })),
}));

vi.mock('react-dom/client', () => ({ createRoot: vi.fn(() => ({ render: mocks.render })) }));
vi.mock('./styles.css', () => ({}));
vi.mock('./App', () => ({ App: () => <div data-testid="spg-app" /> }));
vi.mock('./platformBootstrap', () => ({ initPlatformBootstrap: mocks.initPlatformBootstrap }));
vi.mock('@wellsfargo-starui/design-system', () => ({
  applyTheme: mocks.applyTheme,
  getTheme: mocks.getTheme,
}));
vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  DataHubProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('main', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTheme.mockReturnValue({ theme: 'dark' });
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('applies the saved theme and mounts the app inside the data hub', async () => {
    vi.resetModules();
    await import('./main');

    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalled());
    expect(mocks.applyTheme).toHaveBeenCalledWith({ theme: 'dark' });

    render(mocks.render.mock.calls[0][0]);
    expect(screen.getByTestId('spg-app')).toBeInTheDocument();
  });

  /**
   * Without the hub there is no SSRM engine and no grid, so a silent failure
   * would leave the trader looking at an empty page with nothing to act on.
   * The bootstrap error names the cause and the fix.
   */
  it('renders the bootstrap error, with the failure message, when the hub will not start', async () => {
    mocks.initPlatformBootstrap.mockRejectedValueOnce(new Error('SharedWorker blocked'));
    vi.resetModules();
    await import('./main');

    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalled());
    render(mocks.render.mock.calls[0][0]);

    expect(screen.getByText(/data services unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('SharedWorker blocked')).toBeInTheDocument();
  });

  it('renders a non-Error rejection as its string form', async () => {
    mocks.initPlatformBootstrap.mockRejectedValueOnce('config 404');
    vi.resetModules();
    await import('./main');

    await vi.waitFor(() => expect(mocks.render).toHaveBeenCalled());
    render(mocks.render.mock.calls[0][0]);

    expect(screen.getByText('config 404')).toBeInTheDocument();
  });
});
