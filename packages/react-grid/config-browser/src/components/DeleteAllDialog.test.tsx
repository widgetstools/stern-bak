import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteAllDialog } from './DeleteAllDialog';

afterEach(cleanup);

function renderDialog(overrides: Partial<React.ComponentProps<typeof DeleteAllDialog>> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const onDownloadBackup = vi.fn();
  render(
    <DeleteAllDialog
      tableLabel="App Config"
      rowCount={12}
      scope="appId = trading"
      onCancel={onCancel}
      onConfirm={onConfirm}
      onDownloadBackup={onDownloadBackup}
      {...overrides}
    />,
  );
  return { onCancel, onConfirm, onDownloadBackup };
}

const deleteButton = () =>
  screen.getByRole('button', { name: /^Delete all/ }) as HTMLButtonElement;

/** Clear both guard rails so the delete button unlocks. */
async function passBothGuards(label = 'App Config') {
  await userEvent.click(screen.getByRole('button', { name: 'Download backup' }));
  await userEvent.click(screen.getByRole('textbox'));
  await userEvent.paste(label);
}

/**
 * This dialog wipes a whole config table. Everything below is about the one
 * question that matters: does `onConfirm` fire when — and *only* when — both
 * guard rails have been cleared? A Delete All that deletes on cancel, or that
 * unlocks before the backup is taken, is the bug worth catching.
 */
describe('DeleteAllDialog', () => {
  it('starts locked, with the backup step named as the blocker', () => {
    renderDialog();

    expect(deleteButton().disabled).toBe(true);
    expect(screen.getByText('Backup required')).toBeTruthy();
  });

  it('does not delete on a click while still locked', async () => {
    const { onConfirm } = renderDialog();

    await userEvent.click(deleteButton());

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps the confirmation box unusable until a backup is taken', async () => {
    renderDialog();

    // Ordering guard: typing the table name first must not be a way around
    // step 1.
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Download backup' }));

    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(false);
  });

  it('downloads the backup and marks step 1 done', async () => {
    const { onDownloadBackup } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Download backup' }));

    expect(onDownloadBackup).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Backup downloaded' })).toBeTruthy();
  });

  it('stays locked after a backup while the typed name is wrong', async () => {
    const { onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Download backup' }));
    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.paste('App Confi');

    expect(deleteButton().disabled).toBe(true);
    expect(screen.getByText('Confirmation required')).toBeTruthy();

    await userEvent.click(deleteButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('unlocks and deletes once both guards are cleared', async () => {
    const { onConfirm } = renderDialog();

    await passBothGuards();

    expect(deleteButton().disabled).toBe(false);
    expect(screen.getByText('Ready to delete 12 rows')).toBeTruthy();

    await userEvent.click(deleteButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['lower case', 'app config'],
    ['upper case', 'APP CONFIG'],
    ['surrounding whitespace', '  App Config  '],
  ])('accepts the table name with %s', async (_why, typed) => {
    const { onConfirm } = renderDialog();

    await passBothGuards(typed);
    await userEvent.click(deleteButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('rejects a name that only differs by inner whitespace', async () => {
    // `.trim()` strips the ends only — "AppConfig" is a different table name,
    // not a typo to forgive.
    const { onConfirm } = renderDialog();

    await passBothGuards('AppConfig');

    expect(deleteButton().disabled).toBe(true);
    await userEvent.click(deleteButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cannot be unlocked at all when the table is already empty', async () => {
    const { onConfirm } = renderDialog({ rowCount: 0 });

    // No backup is possible, so guard 1 can never be cleared.
    expect((screen.getByRole('button', { name: 'Download backup' }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(deleteButton().disabled).toBe(true);

    await userEvent.click(deleteButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels without deleting', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await passBothGuards();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('dismisses on a backdrop click without deleting', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await passBothGuards();
    await userEvent.click(screen.getByRole('dialog'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not dismiss when the panel itself is clicked', async () => {
    const { onCancel } = renderDialog();

    // The panel stops propagation; without that, typing in the confirm box
    // would close the dialog on every click.
    await userEvent.click(screen.getByText('Delete all rows in App Config'));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('states the row count and the scope being wiped', () => {
    renderDialog();

    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('appId = trading')).toBeTruthy();
  });

  it('singularises the row count at one row', async () => {
    renderDialog({ rowCount: 1 });

    await passBothGuards();

    expect(screen.getByText('Ready to delete 1 row')).toBeTruthy();
  });

  it('omits the scope line for a global table', () => {
    renderDialog({ tableLabel: 'Roles', scope: null });

    expect(screen.queryByText(/scoped to/)).toBeNull();
  });
});
