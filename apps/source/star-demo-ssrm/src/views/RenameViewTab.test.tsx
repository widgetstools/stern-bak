import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOneByDisplayValue,
  getOneByPlaceholderText,
  getOneByRole,
} from '../../../../test-utils/queries';

const finMock = {
  me: {
    getOptions: vi.fn(async () => ({
      customData: { view: { uuid: 'view-1', name: 'Tab' }, currentTitle: 'Old Title' },
    })),
  },
  View: {
    wrapSync: vi.fn(() => ({
      executeJavaScript: vi.fn(async () => {}),
      getOptions: vi.fn(async () => ({ customData: {} })),
      updateOptions: vi.fn(async () => {}),
    })),
  },
  Window: {
    getCurrentSync: vi.fn(() => ({ close: vi.fn(async () => {}) })),
  },
};

describe('RenameViewTab', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fin', finMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    finMock.me.getOptions.mockResolvedValue({
      customData: { view: { uuid: 'view-1', name: 'Tab' }, currentTitle: 'Old Title' },
    });
  });

  it('loads customData and saves renamed title', async () => {
    const user = userEvent.setup();
    const RenameViewTab = (await import('./RenameViewTab')).default;
    render(<RenameViewTab />);

    await waitFor(() => {
      expect(getOneByDisplayValue('Old Title')).toBeInTheDocument();
    });

    const input = getOneByPlaceholderText('Tab name');
    await user.clear(input);
    await user.type(input, 'New Tab Name');
    await user.click(getOneByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(finMock.View.wrapSync).toHaveBeenCalledWith({ uuid: 'view-1', name: 'Tab' });
    });
  });

  it('closes on Cancel', async () => {
    const close = vi.fn(async () => {});
    finMock.Window.getCurrentSync.mockReturnValue({ close });

    const user = userEvent.setup();
    const RenameViewTab = (await import('./RenameViewTab')).default;
    render(<RenameViewTab />);

    await user.click(getOneByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalled();
  });

  it('saves on Enter key', async () => {
    const user = userEvent.setup();
    const RenameViewTab = (await import('./RenameViewTab')).default;
    render(<RenameViewTab />);

    await waitFor(() => {
      expect(getOneByDisplayValue('Old Title')).toBeInTheDocument();
    });

    await user.type(getOneByPlaceholderText('Tab name'), '{Enter}');
    await waitFor(() => {
      expect(finMock.View.wrapSync).toHaveBeenCalled();
    });
  });

  it('closes on Escape key', async () => {
    const close = vi.fn(async () => {});
    finMock.Window.getCurrentSync.mockReturnValue({ close });

    const user = userEvent.setup();
    const RenameViewTab = (await import('./RenameViewTab')).default;
    render(<RenameViewTab />);

    await user.type(getOneByPlaceholderText('Tab name'), '{Escape}');
    expect(close).toHaveBeenCalled();
  });

  it('warns when customData read fails', async () => {
    finMock.me.getOptions.mockRejectedValue(new Error('no customData'));

    const RenameViewTab = (await import('./RenameViewTab')).default;
    render(<RenameViewTab />);

    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        '[rename-view-tab] failed to read customData',
        expect.any(Error),
      );
    });
  });

  it('handles executeJavaScript failure', async () => {
    const target = {
      executeJavaScript: vi.fn(async () => {
        throw new Error('js failed');
      }),
      getOptions: vi.fn(async () => ({ customData: {} })),
      updateOptions: vi.fn(async () => {}),
    };
    finMock.View.wrapSync.mockReturnValue(target);

    const user = userEvent.setup();
    const RenameViewTab = (await import('./RenameViewTab')).default;
    render(<RenameViewTab />);

    await waitFor(() => {
      expect(getOneByDisplayValue('Old Title')).toBeInTheDocument();
    });

    await user.click(getOneByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        '[rename-view-tab] executeJavaScript failed',
        expect.any(Error),
      );
    });
  });

  it('warns when customData persistence fails', async () => {
    const target = {
      executeJavaScript: vi.fn(async () => {}),
      getOptions: vi.fn(async () => {
        throw new Error('opts failed');
      }),
      updateOptions: vi.fn(async () => {}),
    };
    finMock.View.wrapSync.mockReturnValue(target);

    const user = userEvent.setup();
    const RenameViewTab = (await import('./RenameViewTab')).default;
    render(<RenameViewTab />);

    await waitFor(() => {
      expect(getOneByDisplayValue('Old Title')).toBeInTheDocument();
    });

    await user.click(getOneByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(console.warn).toHaveBeenCalledWith(
        '[rename-view-tab] customData persistence failed',
        expect.any(Error),
      );
    });
  });
});
