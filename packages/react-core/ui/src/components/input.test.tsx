import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input.js';

afterEach(cleanup);

describe('Input', () => {
  it('accepts typed text and exposes it to callers', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Name" onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Ada');

    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Ada');
  });

  it('does not accept input while disabled', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="Locked" disabled onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Locked' }), 'x');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Locked' })).toBeDisabled();
  });

  it('renders distinct types for password and email', () => {
    const { rerender } = render(<Input aria-label="Secret" type="password" />);
    expect(screen.getByLabelText('Secret')).toHaveAttribute('type', 'password');

    rerender(<Input aria-label="Contact" type="email" />);
    expect(screen.getByLabelText('Contact')).toHaveAttribute('type', 'email');
  });

  it('merges a caller className', () => {
    render(<Input aria-label="Wide" className="max-w-xs" />);

    expect(screen.getByRole('textbox', { name: 'Wide' })).toHaveClass('max-w-xs');
  });
});
