/**
 * MultiSelect — shadcn-composed multi-value picker.
 *
 * Built from `Popover` + `Command` + `Checkbox` (all already in
 * `@wellsfargo-starui/ui`). Renders a dropdown trigger that lists current
 * selections as inline pills; opens a searchable command list with
 * checkboxes for multi-pick.
 *
 * Lives in the provider-editor package because today's only caller is
 * the keyColumn picker. Promote to `@wellsfargo-starui/ui` when a second
 * consumer appears.
 *
 * Selection semantics: callers receive an ordered string array. The
 * order matches selection order, not the underlying option order —
 * relevant for composite-key derivation, where `[col1, col2]` and
 * `[col2, col1]` produce different row ids.
 */

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from '@wellsfargo-starui/ui';

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional helper text shown after the label (e.g. cell type). */
  hint?: string;
}

export interface MultiSelectProps {
  options: readonly MultiSelectOption[];
  value: readonly string[];
  onChange(next: string[]): void;
  placeholder?: string;
  /** Optional empty-list message inside the dropdown. */
  emptyMessage?: string;
  /** Optional className on the trigger button. */
  className?: string;
  /** When true, the trigger renders disabled and the popover never opens. */
  disabled?: boolean;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  emptyMessage = 'No options',
  className,
  disabled,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const optionByValue = useMemo(() => {
    const m = new Map<string, MultiSelectOption>();
    for (const o of options) m.set(o.value, o);
    return m;
  }, [options]);

  const toggle = (v: string) => {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  };

  const remove = (v: string) => onChange(value.filter((x) => x !== v));

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-auto min-h-8 w-full justify-between px-2 py-1 text-left font-normal',
            className,
          )}
        >
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {value.length === 0 ? (
              <span className="text-xs text-muted-foreground">{placeholder}</span>
            ) : (
              value.map((v) => {
                const opt = optionByValue.get(v);
                return (
                  <Badge
                    key={v}
                    variant="secondary"
                    // `normal-case` overrides Badge's default `uppercase` — these
                    // pills show field identifiers (the keyColumn), which are
                    // case-sensitive (they drive getRowId + the worker cache key).
                    // Uppercasing them misreads `positionId` as `POSITIONID`.
                    className="h-5 px-1.5 text-[11px] font-mono normal-case gap-0.5"
                  >
                    {opt?.label ?? v}
                    <span
                      role="button"
                      aria-label={`Remove ${opt?.label ?? v}`}
                      tabIndex={-1}
                      className="rounded-sm hover:bg-muted-foreground/20 ml-0.5 cursor-pointer"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        remove(v);
                      }}
                    >
                      <X className="h-2.5 w-2.5" />
                    </span>
                  </Badge>
                );
              })
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command>
          <CommandInput placeholder="Search columns…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">
              {emptyMessage}
            </CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const checked = value.includes(opt.value);
                return (
                  <CommandItem
                    key={opt.value}
                    value={opt.value}
                    onSelect={() => toggle(opt.value)}
                    className="text-xs cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-3.5 w-3.5',
                        checked ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="font-mono">{opt.label}</span>
                    {opt.hint && (
                      <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                        {opt.hint}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
