import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LazySettingsSheet, preloadSettingsSheet } from './LazySettingsSheet';

vi.mock('./SettingsSheet', () => ({
  SettingsSheet: ({ open }: { open: boolean }) => (
    open ? <div data-testid="settings-sheet-loaded">Settings loaded</div> : null
  ),
}));

describe('LazySettingsSheet', () => {
  it('preloads the settings chunk without rendering', async () => {
    expect(() => preloadSettingsSheet()).not.toThrow();
  });

  it('lazy-loads SettingsSheet when opened', async () => {
    const user = userEvent.setup();
    render(<LazySettingsSheet open onOpenChange={vi.fn()} modules={[]} activeModuleId="general-settings" onSelectModule={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('settings-sheet-loaded')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('settings-sheet-loaded'));
  });
});
