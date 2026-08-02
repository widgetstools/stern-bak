import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOneByText } from '../../../../test-utils/queries';
import {
  mockInitWorkspace,
  mockInstallTestBridge,
  resetStaruiMocks,
} from '../staruiVitestMocks';

describe('Provider', () => {
  beforeEach(() => {
    resetStaruiMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('initializes workspace and prefetches tool chunks', async () => {
    mockInitWorkspace.mockImplementation(async (options) => {
      options?.onProgress?.('Starting…');
    });

    const Provider = (await import('./Provider')).default;
    render(<Provider />);

    expect(getOneByText('Star Demo · Platform Provider')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockInitWorkspace).toHaveBeenCalledWith(
        expect.objectContaining({
          roles: ['admin', 'developer'],
          dock: { excludeTools: ['export-config', 'import-config'] },
        }),
      );
    });
    await waitFor(() => {
      expect(getOneByText('Starting…')).toBeInTheDocument();
    });
  });

  it('installs test bridge in dev mode', async () => {
    mockInitWorkspace.mockResolvedValue(undefined);

    const Provider = (await import('./Provider')).default;
    render(<Provider />);

    await waitFor(() => {
      expect(mockInstallTestBridge).toHaveBeenCalled();
    });
  });

  it('installs test bridge when e2eBridge query param is set', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, search: '?e2eBridge=1' },
    });
    mockInitWorkspace.mockResolvedValue(undefined);

    const Provider = (await import('./Provider')).default;
    render(<Provider />);

    await waitFor(() => {
      expect(mockInstallTestBridge).toHaveBeenCalled();
    });
  });

  it('logs workspace init failures', async () => {
    const err = new Error('init failed');
    mockInitWorkspace.mockRejectedValue(err);

    const Provider = (await import('./Provider')).default;
    render(<Provider />);

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        'Failed to initialize workspace platform:',
        err,
      );
    });
  });

  it('logs successful chunk prefetch info', async () => {
    mockInitWorkspace.mockResolvedValue(undefined);

    const Provider = (await import('./Provider')).default;
    render(<Provider />);

    await waitFor(() => {
      expect(console.info).toHaveBeenCalledWith(
        expect.stringMatching(/\[provider\] prefetched \d+\/\d+ tool-window chunks/),
      );
    });
  });
});
