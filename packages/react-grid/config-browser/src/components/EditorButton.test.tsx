import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorButton } from './EditorButton';

afterEach(cleanup);

/**
 * Every destructive action in this package (Delete all, Reset to seed) is an
 * EditorButton whose only guard is the `disabled` prop. So the assertion that
 * matters is not "it looks dimmed" but "the click genuinely does not fire" —
 * a button styled with `opacity-40` while still dispatching onClick would wipe
 * a config database with no confirmation step reached.
 */
describe('EditorButton', () => {
  it('renders its children and fires onClick', async () => {
    const onClick = vi.fn();
    render(<EditorButton onClick={onClick}>Cancel</EditorButton>);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('takes its accessible name from `title` when it is icon-only', () => {
    render(<EditorButton onClick={vi.fn()} title="Refresh" icon="lucide:refresh-cw" />);

    // Icon-only toolbar buttons are unreachable to a screen reader (and to
    // `getByRole(...,{name})`) without this.
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
  });

  it('does not fire onClick while disabled', async () => {
    const onClick = vi.fn();
    render(<EditorButton onClick={onClick} disabled>Delete all</EditorButton>);

    const button = screen.getByRole('button', { name: 'Delete all' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders an icon alongside a label', () => {
    const { container } = render(
      <EditorButton onClick={vi.fn()} icon="lucide:download">Download backup</EditorButton>,
    );

    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Download backup/ })).toBeTruthy();
  });

  it('renders no glyph when no icon is given', () => {
    const { container } = render(<EditorButton onClick={vi.fn()}>Cancel</EditorButton>);

    expect(container.querySelector('svg')).toBeNull();
  });

  it('merges a caller className on top of the variant classes', () => {
    render(
      <EditorButton onClick={vi.fn()} className="border-green-500">Backup downloaded</EditorButton>,
    );

    // DeleteAllDialog / ResetToSeedDialog paint the "done" state this way.
    expect(screen.getByRole('button', { name: 'Backup downloaded' }).className)
      .toContain('border-green-500');
  });

  it('distinguishes the three variants in the rendered markup', () => {
    const { rerender } = render(<EditorButton onClick={vi.fn()} variant="default">A</EditorButton>);
    const classesFor = (label: string) => screen.getByRole('button', { name: label }).className;
    const def = classesFor('A');

    rerender(<EditorButton onClick={vi.fn()} variant="primary">B</EditorButton>);
    const primary = classesFor('B');

    rerender(<EditorButton onClick={vi.fn()} variant="danger">C</EditorButton>);
    const danger = classesFor('C');

    expect(new Set([def, primary, danger]).size).toBe(3);
    // Primary must not re-paint colours — it relies on the shadcn `default`
    // variant so the design-system token supplies the foreground.
    expect(primary).not.toContain('--de-danger');
    expect(danger).toContain('--de-danger');
  });
});
