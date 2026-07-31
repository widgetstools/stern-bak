import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Calendar } from './calendar.js';

afterEach(cleanup);

describe('Calendar', () => {
  it('renders a grid of days for the selected month', () => {
    render(<Calendar mode="single" defaultMonth={new Date(2026, 6, 1)} />);

    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Wednesday, July 15th, 2026' }),
    ).toBeInTheDocument();
  });

  it('selects a day when clicked', async () => {
    const onSelect = vi.fn();
    function ControlledCalendar() {
      const [selected, setSelected] = useState<Date | undefined>();
      return (
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            setSelected(date);
            onSelect(date);
          }}
          defaultMonth={new Date(2026, 6, 1)}
        />
      );
    }

    render(<ControlledCalendar />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Friday, July 10th, 2026' }),
    );

    expect(onSelect).toHaveBeenCalled();
    expect(onSelect.mock.calls[0][0]?.getDate()).toBe(10);
  });

  it('merges a caller className on the root picker', () => {
    const { container } = render(
      <Calendar className="shadow-lg" defaultMonth={new Date(2026, 6, 1)} />,
    );

    expect(container.firstElementChild).toHaveClass('shadow-lg');
  });
});
