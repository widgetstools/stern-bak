import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImportPreview } from '../hooks/useConfigBrowser';
import { ImportPreviewDialog } from './ImportPreviewDialog';

afterEach(cleanup);

function preview(over: Partial<ImportPreview> = {}): ImportPreview {
  const fresh = over.fresh ?? [{ configId: 'new-1' }, { configId: 'new-2' }];
  const conflicts = over.conflicts ?? [{ configId: 'existing-1' }];
  const invalid = over.invalid ?? [];
  return {
    rows: over.rows ?? [...fresh, ...conflicts, ...invalid.map((i) => i.row)],
    fresh,
    conflicts,
    invalid,
  };
}

function renderDialog(over: Partial<ImportPreview> = {}, props: Partial<React.ComponentProps<typeof ImportPreviewDialog>> = {}) {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(
    <ImportPreviewDialog
      preview={preview(over)}
      tableLabel="App Config"
      primaryKey="configId"
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onCancel, onConfirm };
}

const importButton = () => screen.getByRole('button', { name: /^Import/ }) as HTMLButtonElement;
const radio = (mode: 'skip-existing' | 'overwrite') =>
  screen.getAllByRole('radio').find((r) => r.getAttribute('value') === mode) as HTMLButtonElement;

/**
 * The import dialog is the last stop before rows are written to Dexie, and
 * the mode it hands back decides whether existing rows survive. The two
 * failures that would actually cost data are (a) confirming with a mode the
 * user didn't pick, and (b) the footer/button counts disagreeing with what
 * the chosen mode will really do.
 */
describe('ImportPreviewDialog', () => {
  it('summarises the parse against the primary key', () => {
    renderDialog();

    expect(screen.getByText('Import preview · App Config')).toBeTruthy();
    expect(screen.getByText('configId')).toBeTruthy();
    expect(screen.getByText('New').previousSibling?.textContent).toBe('2');
    expect(screen.getByText('Will overwrite').previousSibling?.textContent).toBe('1');
    expect(screen.getByText('Invalid').previousSibling?.textContent).toBe('0');
  });

  it('defaults to skip-existing and counts only the fresh rows', () => {
    renderDialog();

    expect(radio('skip-existing').getAttribute('data-state')).toBe('checked');
    expect(screen.getByText('2 import · 1 skip · 0 invalid')).toBeTruthy();
    expect(importButton().textContent).toContain('Import 2');
  });

  it('recounts when the user switches to overwrite', async () => {
    renderDialog();

    await userEvent.click(radio('overwrite'));

    // fresh + conflicts, and nothing is skipped any more.
    expect(screen.getByText('3 import · 0 skip · 0 invalid')).toBeTruthy();
    expect(importButton().textContent).toContain('Import 3');
  });

  it('confirms with the mode that is actually selected', async () => {
    const { onConfirm } = renderDialog();

    await userEvent.click(radio('overwrite'));
    await userEvent.click(importButton());

    // The whole point of the dialog: overwrite must not arrive as
    // skip-existing (silently importing nothing) or vice versa (clobbering
    // rows the user meant to keep).
    expect(onConfirm).toHaveBeenCalledWith('overwrite');
  });

  it('confirms with skip-existing when the default is left alone', async () => {
    const { onConfirm } = renderDialog();

    await userEvent.click(importButton());

    expect(onConfirm).toHaveBeenCalledWith('skip-existing');
  });

  it('cancels without importing', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('dismisses on a backdrop click without importing', async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole('dialog'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not dismiss when the panel is clicked', async () => {
    const { onCancel } = renderDialog();

    await userEvent.click(screen.getByText('Import preview · App Config'));

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('disables skip-existing when every row already exists, and blocks the import', async () => {
    const { onConfirm } = renderDialog({ fresh: [], conflicts: [{ configId: 'a' }] });

    expect(radio('skip-existing').disabled).toBe(true);
    // Default mode would import 0 rows — the button must say so rather than
    // running a no-op import and reporting success.
    expect(importButton().disabled).toBe(true);
    expect(screen.getByText('0 import · 1 skip · 0 invalid')).toBeTruthy();

    await userEvent.click(importButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('re-enables the import once overwrite is chosen for an all-conflict file', async () => {
    const { onConfirm } = renderDialog({ fresh: [], conflicts: [{ configId: 'a' }] });

    await userEvent.click(radio('overwrite'));

    expect(importButton().disabled).toBe(false);
    await userEvent.click(importButton());
    expect(onConfirm).toHaveBeenCalledWith('overwrite');
  });

  it('disables both modes when nothing is valid', async () => {
    const { onConfirm } = renderDialog({
      fresh: [],
      conflicts: [],
      invalid: [{ row: {}, reason: "missing primary key 'configId'" }],
    });

    expect(radio('skip-existing').disabled).toBe(true);
    expect(radio('overwrite').disabled).toBe(true);
    expect(importButton().disabled).toBe(true);

    await userEvent.click(importButton());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('lists invalid rows and truncates the list past five', () => {
    const invalid = Array.from({ length: 8 }, (_, i) => ({
      row: { n: i },
      reason: `bad row ${i}`,
    }));
    renderDialog({ invalid });

    expect(screen.getByText('8 invalid rows (will be ignored)')).toBeTruthy();
    expect(screen.getByText('bad row 0')).toBeTruthy();
    expect(screen.getByText('bad row 4')).toBeTruthy();
    expect(screen.queryByText('bad row 5')).toBeNull();
    expect(screen.getByText('… and 3 more')).toBeTruthy();
  });

  it('hides the invalid block entirely when the file is clean', () => {
    renderDialog();

    expect(screen.queryByText(/invalid rows? \(will be ignored\)/)).toBeNull();
  });

  it('singularises row wording throughout', () => {
    renderDialog({ fresh: [{ configId: 'a' }], conflicts: [{ configId: 'b' }], rows: [{}] });

    expect(screen.getByText(/Parsed/).textContent).toContain('row.');
    expect(screen.getByText(/Only insert 1 new row\./)).toBeTruthy();
    expect(screen.getByText(/Upsert all 2 valid rows\. 1 existing row will be replaced\./)).toBeTruthy();
  });
});
