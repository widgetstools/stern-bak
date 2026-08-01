import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockInitWorkspace, resetStaruiMocks } from '../staruiVitestMocks';

vi.mock('../views/DataProviders', () => Promise.reject(new Error('chunk failed')));

describe('Provider prefetch failures', () => {
  beforeEach(() => {
    vi.resetModules();
    resetStaruiMocks();
    mockInitWorkspace.mockResolvedValue(undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('warns when a tool-window chunk fails to prefetch', async () => {
    const Provider = (await import('./Provider')).default;
    render(<Provider />);

    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringMatching(/\[provider\] prefetched \d+\/\d+ tool-window chunks/),
      );
    });
  });
});
