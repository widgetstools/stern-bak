import * as React from 'react';

import { cn } from '../lib/utils';

/**
 * ButtonGroup — joins multiple `<Button>`s (or shadcn `<DropdownMenuTrigger
 * asChild><Button>`s) into a single attached strip with shared borders.
 *
 *   - Outer corners stay rounded; inner corners go square.
 *   - 1px negative gap (`-space-x-px`) collapses the seam.
 *   - `focus-within:relative` lifts the focused child above its
 *     neighbours so the ring isn't clipped by the next button.
 *
 * Standard shadcn primitive — port of:
 *   https://ui.shadcn.com/docs/components/button-group
 */
const ButtonGroup = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="group"
    className={cn(
      'inline-flex -space-x-px',
      '[&>*]:rounded-none',
      '[&>:first-child]:rounded-l-md',
      '[&>:last-child]:rounded-r-md',
      '[&>*]:focus-visible:relative [&>*]:focus-visible:z-10',
      className,
    )}
    {...props}
  />
));
ButtonGroup.displayName = 'ButtonGroup';

export { ButtonGroup };
