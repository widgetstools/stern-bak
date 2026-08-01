import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MarketsGrid } from './MarketsGrid';
import { ToolbarDatePicker } from './ToolbarDatePicker';
import { dateToIso, isSameCalendarDay, todayIsoDate } from './toolbarDateUtils';

vi.mock('ag-grid-react', () => ({
  AgGridReact: () => <div data-testid="ag-grid-stub" />,
}));

vi.mock('@wellsfargo-starui/grid/customizer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/grid/customizer')>();
  return {
    ...actual,
    useProfileManager: () => ({
      profiles: [],
      activeProfileId: null,
      isDirty: false,
      createProfile: vi.fn(),
      loadProfile: vi.fn(),
      saveActiveProfile: vi.fn(),
      deleteProfile: vi.fn(),
      cloneProfile: vi.fn(),
      renameProfile: vi.fn(),
      exportProfile: vi.fn(),
      importProfile: vi.fn(),
    }),
  };
});

describe('MarketsGrid toolbar date picker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 28, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows today by default on the right edge of the primary toolbar', () => {
    render(
      <MarketsGrid
        gridId="datepicker-test"
        rowData={[{ id: '1' }]}
        columnDefs={[{ field: 'id' }]}
        showToolbar
      />,
    );

    expect(screen.getByTestId('toolbar-date-picker-trigger')).toHaveTextContent(
      todayIsoDate(),
    );
  });

  it('uses the controlled toolbarDate prop when supplied', () => {
    const { rerender } = render(
      <MarketsGrid
        gridId="datepicker-test"
        rowData={[{ id: '1' }]}
        columnDefs={[{ field: 'id' }]}
        showToolbar
        toolbarDate="2026-05-15"
      />,
    );

    expect(screen.getByTestId('toolbar-date-picker-trigger')).toHaveTextContent('2026-05-15');

    rerender(
      <MarketsGrid
        gridId="datepicker-test"
        rowData={[{ id: '1' }]}
        columnDefs={[{ field: 'id' }]}
        showToolbar
        toolbarDate="2026-06-01"
      />,
    );

    expect(screen.getByTestId('toolbar-date-picker-trigger')).toHaveTextContent('2026-06-01');
  });

  it('can be hidden with showToolbarDatePicker={false}', () => {
    render(
      <MarketsGrid
        gridId="datepicker-test"
        rowData={[{ id: '1' }]}
        columnDefs={[{ field: 'id' }]}
        showToolbar
        showToolbarDatePicker={false}
      />,
    );

    expect(screen.queryByTestId('toolbar-date-picker-trigger')).toBeNull();
  });

  it('resets to today when history is unavailable', () => {
    const onChange = vi.fn();
    render(
      <MarketsGrid
        gridId="datepicker-test"
        rowData={[{ id: '1' }]}
        columnDefs={[{ field: 'id' }]}
        showToolbar
        toolbarDate="2026-05-15"
        onToolbarDateChange={onChange}
        toolbarDateHistoryEnabled={false}
      />,
    );

    expect(onChange).toHaveBeenCalledWith(todayIsoDate());
  });
});

describe('ToolbarDatePicker history gating', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 28, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks non-today dates when history is unavailable', () => {
    const onChange = vi.fn();
    render(
      <ToolbarDatePicker
        value={todayIsoDate()}
        onChange={onChange}
        historyEnabled={false}
      />,
    );

    fireEvent.click(screen.getByTestId('toolbar-date-picker-trigger'));

    fireEvent.click(screen.getByRole('button', { name: /May 27/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes the popover after selecting a date', () => {
    const onChange = vi.fn();
    render(
      <ToolbarDatePicker
        value={todayIsoDate()}
        onChange={onChange}
        historyEnabled
      />,
    );

    fireEvent.click(screen.getByTestId('toolbar-date-picker-trigger'));
    expect(screen.getByRole('grid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /May 15/i }));
    expect(onChange).toHaveBeenCalledWith('2026-05-15');
    expect(screen.queryByRole('grid')).toBeNull();
  });

  it('ignores null calendar selection and respects disabled trigger', () => {
    const onChange = vi.fn();
    render(
      <ToolbarDatePicker
        value={todayIsoDate()}
        onChange={onChange}
        disabled
      />,
    );
    expect(screen.getByTestId('toolbar-date-picker-trigger')).toBeDisabled();
  });
});

describe('toolbarDateUtils', () => {
  it('round-trips ISO dates', () => {
    const iso = dateToIso(new Date(2026, 0, 5));
    expect(iso).toBe('2026-01-05');
  });

  it('compares calendar days', () => {
    expect(isSameCalendarDay(new Date(2026, 4, 28), new Date(2026, 4, 28))).toBe(true);
    expect(isSameCalendarDay(new Date(2026, 4, 28), new Date(2026, 4, 27))).toBe(false);
  });
});
