import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const mockRender = vi.fn();
const mockApplyTheme = vi.fn();
const mockGetTheme = vi.fn(() => ({ theme: 'dark' }));
const mockInitPlatformBootstrap = vi.fn();

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: mockRender })),
}));

vi.mock('@wellsfargo-starui/design-system', () => ({
  applyTheme: (...args: unknown[]) => mockApplyTheme(...args),
  getTheme: () => mockGetTheme(),
}));

vi.mock('@wellsfargo-starui/react', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  AlertDescription: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
  AlertTitle: ({ children }: { children: React.ReactNode }) => React.createElement('h2', null, children),
}));

vi.mock('@wellsfargo-starui/grid', () => ({
  DataHubProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'data-hub-provider' }, children),
}));

vi.mock('./platformBootstrap', () => ({
  initPlatformBootstrap: (...args: unknown[]) => mockInitPlatformBootstrap(...args),
}));

vi.mock('./App', () => ({
  App: () => React.createElement('div', { 'data-testid': 'app' }, 'App'),
}));

vi.mock('./globals.css', () => ({}));

describe('main', () => {
  beforeEach(() => {
    vi.resetModules();
    mockRender.mockClear();
    mockApplyTheme.mockClear();
    mockInitPlatformBootstrap.mockReset();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('applies theme and mounts the app when bootstrap succeeds', async () => {
    mockInitPlatformBootstrap.mockResolvedValue({
      config: { userId: 'dev1' },
      platform: { id: 'platform' },
    });

    await import('./main');

    await vi.waitFor(() => expect(mockRender).toHaveBeenCalledOnce());
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('renders bootstrap error UI when platform initialization fails', async () => {
    mockInitPlatformBootstrap.mockRejectedValue(new Error('worker unavailable'));

    await import('./main');

    await vi.waitFor(() => expect(mockRender).toHaveBeenCalledOnce());

    const tree = mockRender.mock.calls[0]?.[0];
    const { render, screen } = await import('@testing-library/react');
    render(tree);
    expect(
      screen.getByText('DataProvider editor — data services unavailable'),
    ).toBeInTheDocument();
    expect(screen.getByText('worker unavailable')).toBeInTheDocument();
  });

  it('wraps non-Error bootstrap failures in an Error message', async () => {
    mockInitPlatformBootstrap.mockRejectedValue('plain failure');

    await import('./main');

    await vi.waitFor(() => expect(mockRender).toHaveBeenCalledOnce());

    const tree = mockRender.mock.calls[0]?.[0];
    const { render, screen } = await import('@testing-library/react');
    render(tree);
    expect(screen.getByText('plain failure')).toBeInTheDocument();
  });
});
