import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mockApplyTheme, mockGetTheme } from './staruiVitestMocks';

const mockRender = vi.fn();

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({ render: mockRender })),
}));

vi.mock('./App', () => ({
  App: () => null,
}));

vi.mock('./globals.css', () => ({}));

describe('main', () => {
  beforeEach(() => {
    mockRender.mockClear();
    mockApplyTheme.mockClear();
    mockGetTheme.mockReturnValue({ theme: 'dark' });
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('applies theme and mounts App in StrictMode', async () => {
    vi.resetModules();
    await import('./main');

    expect(mockGetTheme).toHaveBeenCalled();
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'dark' });
    expect(mockRender).toHaveBeenCalledTimes(1);
  });
});
