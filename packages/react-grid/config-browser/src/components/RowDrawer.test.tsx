import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RowDrawer } from './RowDrawer';

afterEach(cleanup);

const ROW = { configId: 'grid-1', appId: 'trading', payload: { columns: 3 } };

function renderDrawer(props: Partial<React.ComponentProps<typeof RowDrawer>> = {}) {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const utils = render(
    <RowDrawer
      open
      mode="edit"
      initialRow={ROW}
      primaryKey="configId"
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { onClose, onSave, onDelete, ...utils };
}

const editor = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const saveButton = () => screen.getByRole('button', { name: /^(Save|Saving…)$/ }) as HTMLButtonElement;

/** Replace the whole editor contents — paste, not type, so a 3-line JSON
 *  document doesn't cost 60 re-renders. */
async function setJson(text: string) {
  await userEvent.clear(editor());
  await userEvent.click(editor());
  await userEvent.paste(text);
}

/**
 * RowDrawer is the only write path for a single row. Two behaviours carry
 * real risk: Save must not close the drawer when the underlying write failed
 * (the user would lose the edit and believe it landed), and Delete must
 * require a second, deliberate click.
 */
describe('RowDrawer', () => {
  it('loads the row as formatted JSON and titles itself with the primary key', () => {
    renderDrawer();

    expect(editor().value).toBe(JSON.stringify(ROW, null, 2));
    expect(screen.getByText('Edit row')).toBeTruthy();
    expect(screen.getByText('grid-1')).toBeTruthy();
  });

  it('saves the parsed object and then closes', async () => {
    const { onSave, onClose } = renderDrawer();

    await setJson('{"configId":"grid-1","appId":"trading","enabled":true}');
    await userEvent.click(saveButton());

    expect(onSave).toHaveBeenCalledWith({ configId: 'grid-1', appId: 'trading', enabled: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('blocks Save while the JSON is unparseable', async () => {
    const { onSave } = renderDrawer();

    await setJson('{"configId": ');

    expect(screen.getByText('Invalid JSON — save disabled')).toBeTruthy();
    expect(saveButton().disabled).toBe(true);

    await userEvent.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clears the invalid-JSON warning once the text parses again', async () => {
    renderDrawer();

    await setJson('{');
    expect(screen.getByText('Invalid JSON — save disabled')).toBeTruthy();

    await setJson('{"configId":"grid-1"}');
    expect(screen.queryByText('Invalid JSON — save disabled')).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  it('keeps the drawer open and surfaces the error when the save is rejected', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('optimistic lock conflict'));
    const { onClose } = renderDrawer({ onSave });

    await userEvent.click(saveButton());

    // Closing here would discard the user's edit while the row was never
    // written.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('optimistic lock conflict')).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
  });

  it('falls back to a generic message when the rejection carries none', async () => {
    const onSave = vi.fn().mockRejectedValue({});
    renderDrawer({ onSave });

    await userEvent.click(saveButton());

    expect(screen.getByText('Invalid JSON or save failed')).toBeTruthy();
  });

  it('requires a second click to delete', async () => {
    const { onDelete, onClose } = renderDrawer();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Click to confirm' })).toBeTruthy();
  });

  it('deletes by primary key on the confirming click and closes', async () => {
    const { onDelete, onClose } = renderDrawer();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Click to confirm' }));

    // The id must come from the ORIGINAL row, not from the edited textarea —
    // renaming the pk in the editor and hitting Delete must not delete a
    // different row.
    expect(onDelete).toHaveBeenCalledWith('grid-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('deletes the original row even after the pk was edited in the textarea', async () => {
    const { onDelete } = renderDrawer();

    await setJson('{"configId":"some-other-row"}');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Click to confirm' }));

    expect(onDelete).toHaveBeenCalledWith('grid-1');
  });

  it('keeps the drawer open and re-arms Delete when the delete fails', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('row is locked'));
    const { onClose } = renderDrawer({ onDelete });

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Click to confirm' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('row is locked')).toBeTruthy();
    // Back to the two-click guard rather than staying primed.
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });

  it('offers no Delete button in create mode', () => {
    renderDrawer({ mode: 'create', initialRow: { configId: '' } });

    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByText('New row')).toBeTruthy();
    expect(screen.getByText('new')).toBeTruthy();
  });

  it('starts create mode from an empty JSON object when there is no template row', () => {
    renderDrawer({ mode: 'create', initialRow: null });

    expect(editor().value).toBe('{\n  \n}');
  });

  it('labels a row whose primary key is missing rather than rendering "undefined"', () => {
    renderDrawer({ initialRow: { appId: 'trading' } });

    expect(screen.getByText('(unknown)')).toBeTruthy();
  });

  it('reloads the editor when a different row is opened', async () => {
    const { rerender } = renderDrawer();

    await setJson('{"configId":"edited-but-not-saved"}');
    rerender(
      <RowDrawer
        open
        mode="edit"
        initialRow={{ configId: 'grid-2' }}
        primaryKey="configId"
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    // Stale text from the previously-open row would be saved over the new one.
    expect(editor().value).toBe(JSON.stringify({ configId: 'grid-2' }, null, 2));
  });

  it('closes on the header X and on Cancel', async () => {
    const { onClose } = renderDrawer();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('closes on Escape while open', async () => {
    const { onClose } = renderDrawer();

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', async () => {
    const { onClose } = renderDrawer();

    await userEvent.keyboard('{Enter}');

    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores Escape while closed', async () => {
    const { onClose, container } = renderDrawer({ open: false });

    await userEvent.keyboard('{Escape}');

    // The drawer stays mounted for the slide-out animation, so a listener
    // left attached would close an already-closed drawer on every Escape.
    expect(onClose).not.toHaveBeenCalled();
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('exposes itself to assistive tech only while open', () => {
    const { container, rerender } = renderDrawer({ open: false });
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');

    rerender(
      <RowDrawer
        open
        mode="edit"
        initialRow={ROW}
        primaryKey="configId"
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('false');
  });
});
