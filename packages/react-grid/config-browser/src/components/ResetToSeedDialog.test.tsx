import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetToSeedDialog } from './ResetToSeedDialog';

afterEach(cleanup);

function renderDialog(overrides: Partial<React.ComponentProps<typeof ResetToSeedDialog>> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const onDownloadBackup = vi.fn();
  render(
    <ResetToSeedDialog
      seedUrl="/config/seed.json"
      onCancel={onCancel}
      onConfirm={onConfirm}
      onDownloadBackup={onDownloadBackup}
      {...overrides}
    />,
  );
  return { onCancel, onConfirm, onDownloadBackup };
}

const resetButton = () => screen.getByRole('button', { name: 'Reset to seed' }) as HTMLButtonElement;

/**
 * Reset-to-seed replaces EVERY config table, so the single guard rail (a full
 * backup must be downloaded first) is the only thing standing between a
 * mis-click and an unrecoverable wipe. The assertions below are about that
 * gate holding, and about cancel/dismiss never resetting.
 */
describe('ResetToSeedDialog', () => {
  it('names the seed file the database will be replaced from', () => {
    renderDialog();

    expect(screen.getByText('/config/seed.json')).toBeTruthy();
  });

  it('starts with Reset locked behind the backup step', async () => {
    const { onConfirm } = renderDialog();

    expect(resetButton().disabled).toBe(true);
    expect(screen.getByText('Backup required')).toBeTruthy();

    await userEvent.click(resetButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('unlocks Reset once the backup has been downloaded', async () => {
    const { onConfirm, onDownloadBackup } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Download backup' }));

    expect(onDownloadBackup).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Backup downloaded' })).toBeTruthy();
    expect(screen.getByText('Ready to reset')).toBeTruthy();
    expect(resetButton().disabled).toBe(false);

    await userEvent.click(resetButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not reset when cancelled after a backup', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not reset when dismissed via the backdrop', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    await userEvent.click(screen.getByRole('dialog'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not dismiss when the panel itself is clicked', async () => {
    const { onCancel } = renderDialog();

    await userEvent.click(screen.getByText('Reset all config to seed'));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('lets a repeated backup click through without unlocking anything extra', async () => {
    const { onDownloadBackup, onConfirm } = renderDialog();

    const backup = screen.getByRole('button', { name: 'Download backup' });
    await userEvent.click(backup);
    await userEvent.click(screen.getByRole('button', { name: 'Backup downloaded' }));

    expect(onDownloadBackup).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
