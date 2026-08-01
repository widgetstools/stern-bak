import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './textarea.js';

afterEach(cleanup);

describe('Textarea', () => {
  it('accepts typed text and exposes it to callers', async () => {
    const onChange = vi.fn();
    render(<Textarea aria-label="Notes" onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'Line one');

    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Notes' })).toHaveValue('Line one');
  });

  it('does not accept input while disabled', async () => {
    const onChange = vi.fn();
    render(<Textarea aria-label="Locked" disabled onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Locked' }), 'x');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Locked' })).toBeDisabled();
  });

  it('merges a caller className', () => {
    render(<Textarea aria-label="Tall" className="min-h-32" />);

    expect(screen.getByRole('textbox', { name: 'Tall' })).toHaveClass('min-h-32');
  });
});
