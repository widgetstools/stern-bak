import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolbarDatePicker } from './ToolbarDatePicker';
import { todayIsoDate } from './toolbarDateUtils';

describe('ToolbarDatePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 4, 28, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders invalid ISO value as-is on the trigger', () => {
    render(
      <ToolbarDatePicker value="not-a-date" onChange={vi.fn()} />,
    );
    expect(screen.getByTestId('toolbar-date-picker-trigger')).toHaveTextContent('not-a-date');
  });

  it('allows selecting a non-today date when history is enabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ToolbarDatePicker
        value={todayIsoDate()}
        onChange={onChange}
        historyEnabled
      />,
    );

    await user.click(screen.getByTestId('toolbar-date-picker-trigger'));
    await user.click(screen.getByRole('button', { name: /May 15/i }));
    expect(onChange).toHaveBeenCalledWith('2026-05-15');
  });

  it('does not call onChange when calendar selection yields no ISO date', async () => {
    const onChange = vi.fn();
    render(
      <ToolbarDatePicker value={todayIsoDate()} onChange={onChange} />,
    );

    fireEvent.click(screen.getByTestId('toolbar-date-picker-trigger'));
    const grid = screen.getByRole('grid');
    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
