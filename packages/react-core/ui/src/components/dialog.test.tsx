import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog.js';

afterEach(cleanup);

describe('Dialog', () => {
  it('opens in a portal and exposes title and description', async () => {
    const onConfirm = vi.fn();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <button type="button">Open settings</button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Workspace settings</DialogTitle>
            <DialogDescription>Update your layout preferences.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" onClick={onConfirm}>
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Workspace settings' })).toBeInTheDocument();
    expect(screen.getByText('Update your layout preferences.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('merges className on dialog content', () => {
    render(
      <Dialog defaultOpen>
        <DialogContent className="max-w-xl">
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('max-w-xl');
  });
});
