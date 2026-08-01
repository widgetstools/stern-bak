import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger, cn } from '@wellsfargo-starui/react';

/**
 * Backward-compatible wrapper matching the old `<Popover trigger={…}>…</Popover>`
 * API. New code should use `@wellsfargo-starui/react` Popover primitives directly.
 */
export function PopoverCompat({
  trigger,
  children,
  align = 'start',
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Popover open={controlledOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span className="inline-flex cursor-pointer">{trigger}</span>
      </PopoverTrigger>
      <PopoverContent align={align} className={cn('w-auto', className)}>
        {children}
      </PopoverContent>
    </Popover>
  );
}
