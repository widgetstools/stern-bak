import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigBrowserDialog } from './ConfigBrowserDialog.js';

vi.mock('@wellsfargo-starui/grid/config-browser', () => ({
  ConfigBrowserPanel: () => <div data-testid="config-browser-panel">panel</div>,
}));

afterEach(() => {
  cleanup();
});

describe('ConfigBrowserDialog', () => {
  it('renders the dialog shell when open and mounts the panel after defer', async () => {
    render(<ConfigBrowserDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByTestId('config-browser-dialog')).toBeInTheDocument();
    expect(await screen.findByTestId('config-browser-panel')).toBeInTheDocument();
  });

  it('does not mount the panel while closed', () => {
    render(<ConfigBrowserDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId('config-browser-panel')).not.toBeInTheDocument();
  });

  it('forwards close from the dialog', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ConfigBrowserDialog open onOpenChange={onOpenChange} />);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
