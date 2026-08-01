/**
 * DatePicker — shadcn-pattern composition of Popover + Button +
 * Calendar from `@wellsfargo-starui/react`. No native `<input type="date">`
 * (CLAUDE.md: no native input controls).
 *
 * Value is an ISO date string `YYYY-MM-DD` for compatibility with
 * the AppData entries the historical provider templates against.
 * The internal state uses a Date so the Calendar primitive can
 * highlight the selected day; conversion happens at the boundary.
 */

import { useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger, Button, Calendar } from '@wellsfargo-starui/react';
import { CalendarIcon } from 'lucide-react';

export interface DatePickerProps {
  /** ISO `YYYY-MM-DD`. Empty / null → no date selected. */
  value: string | null;
  onChange(next: string | null): void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date', className, disabled }: DatePickerProps) {
  const date = useMemo(() => isoToDate(value), [value]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`h-8 justify-start text-xs font-mono ${className ?? ''}`}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-3.5 w-3.5" />
          {value ? value : <span className="text-muted-foreground">{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date ?? undefined}
          onSelect={(d) => onChange(dateToIso(d ?? null))}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

function isoToDate(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function dateToIso(date: Date | null): string | null {
  if (!date) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
