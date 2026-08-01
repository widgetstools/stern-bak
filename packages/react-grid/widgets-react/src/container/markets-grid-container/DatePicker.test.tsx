import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@wellsfargo-starui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/react')>();
  return {
    ...actual,
    Calendar: ({ onSelect }: { onSelect?: (d: Date | undefined) => void }) => (
      <button type="button" onClick={() => onSelect?.(new Date(2026, 6, 15))}>
        pick-day
      </button>
    ),
  };
});

import { DatePicker } from './DatePicker.js';

describe('DatePicker', () => {
  it('shows placeholder when no value is set', () => {
    render(<DatePicker value={null} onChange={vi.fn()} placeholder="Pick date" />);
    expect(screen.getByRole('button', { name: /Pick date/i })).toBeInTheDocument();
  });

  it('shows the ISO value on the trigger button', () => {
    render(<DatePicker value="2026-07-31" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '2026-07-31' })).toBeInTheDocument();
  });

  it('disables the trigger when disabled', () => {
    render(<DatePicker value="2026-07-31" onChange={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: '2026-07-31' })).toBeDisabled();
  });

  it('opens the calendar popover', async () => {
    const user = userEvent.setup();
    render(<DatePicker value={null} onChange={vi.fn()} />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: 'pick-day' })).toBeInTheDocument();
  });

  it('converts calendar selection to ISO yyyy-mm-dd', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('button', { name: 'pick-day' }));
    expect(onChange).toHaveBeenCalledWith('2026-07-15');
  });
});
