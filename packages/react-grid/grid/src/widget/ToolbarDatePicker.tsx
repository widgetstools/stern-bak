/**
 * ToolbarDatePicker — shadcn Popover + Calendar on the primary toolbar.
 * No native `<input type="date">` (design-system rule).
 */

import { useMemo, useState, type ReactElement } from 'react';
import { CalendarIcon } from 'lucide-react';
import { Button, Calendar, Popover, PopoverContent, PopoverTrigger } from '@wellsfargo-starui/ui';
import { dateToIso, isSameCalendarDay, isoToDate, todayIsoDate } from './toolbarDateUtils';

export interface ToolbarDatePickerProps {
  /** ISO `YYYY-MM-DD`. */
  value: string;
  onChange(next: string): void;
  disabled?: boolean;
  /**
   * When `false`, only today's date is selectable (live data only).
   * Defaults to `true` (all dates selectable).
   */
  historyEnabled?: boolean;
}

export function ToolbarDatePicker({
  value,
  onChange,
  disabled,
  historyEnabled = true,
}: ToolbarDatePickerProps): ReactElement {
  const [open, setOpen] = useState(false);
  const date = useMemo(() => isoToDate(value), [value]);
  const today = useMemo(() => isoToDate(todayIsoDate()) ?? new Date(), []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ds-primary-date-picker"
          disabled={disabled}
          data-testid="toolbar-date-picker-trigger"
          aria-label={`Selected date ${value}`}
        >
          <CalendarIcon size={14} strokeWidth={2} aria-hidden />
          <span className="ds-primary-date-picker-label">{value}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end" sideOffset={6}>
        <Calendar
          mode="single"
          selected={date ?? undefined}
          onSelect={(d) => {
            const next = dateToIso(d ?? null);
            if (next) {
              onChange(next);
              setOpen(false);
            }
          }}
          disabled={
            historyEnabled
              ? undefined
              : (day) => !isSameCalendarDay(day, today)
          }
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
