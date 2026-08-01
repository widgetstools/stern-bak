import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UnsavedSwitchDialog } from './UnsavedSwitchDialog.js';

vi.mock('../customizer/index.js', () => {
  let onOpenChangeRef: ((next: boolean) => void) | undefined;
  return {
    AlertDialog: ({ children, open, onOpenChange }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (next: boolean) => void;
    }) => {
      onOpenChangeRef = onOpenChange;
      return (
        <div data-testid="alert-dialog" data-open={String(open)}>
          <button type="button" data-testid="dialog-open" onClick={() => onOpenChange(true)} />
          <button type="button" data-testid="dialog-close" onClick={() => onOpenChange(false)} />
          {open ? children : null}
        </div>
      );
    },
    AlertDialogContent: ({ children, ...rest }: React.ComponentProps<'div'>) => <div {...rest}>{children}</div>,
    AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogAction: ({ children, ...rest }: React.ComponentProps<'button'>) => (
      <button type="button" {...rest}>{children}</button>
    ),
    AlertDialogCancel: ({ children, ...rest }: React.ComponentProps<'button'>) => (
      <button
        type="button"
        {...rest}
        onClick={(e) => {
          onOpenChangeRef?.(false);
          rest.onClick?.(e);
        }}
      >
        {children}
      </button>
    ),
  };
});

describe('UnsavedSwitchDialog', () => {
  it('wires save, discard, and cancel actions', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onDiscard = vi.fn();
    const onSave = vi.fn();

    render(
      <UnsavedSwitchDialog
        open
        onCancel={onCancel}
        onDiscard={onDiscard}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByTestId('profile-switch-discard'));
    expect(onDiscard).toHaveBeenCalled();

    await user.click(screen.getByTestId('profile-switch-save'));
    expect(onSave).toHaveBeenCalled();

    await user.click(screen.getByTestId('profile-switch-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when dialog closes via onOpenChange', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <UnsavedSwitchDialog
        open
        onCancel={onCancel}
        onDiscard={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    await user.click(screen.getByTestId('dialog-close'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('does not call onCancel when dialog open state becomes true', async () => {
    const onCancel = vi.fn();
    render(
      <UnsavedSwitchDialog
        open
        onCancel={onCancel}
        onDiscard={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('dialog-open'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when dialog open state becomes false', async () => {
    const onCancel = vi.fn();
    render(
      <UnsavedSwitchDialog
        open
        onCancel={onCancel}
        onDiscard={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByTestId('dialog-close'));
    expect(onCancel).toHaveBeenCalled();
  });
});
