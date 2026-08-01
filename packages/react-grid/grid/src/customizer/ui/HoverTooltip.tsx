import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import {
  Tooltip as TooltipRoot,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@wellsfargo-starui/react';

export interface HoverTooltipProps extends Omit<ComponentPropsWithoutRef<'span'>, 'content'> {
  content: ReactNode;
  children: ReactNode;
}

/**
 * Grid-customizer tooltip with the legacy `content` + `children` API.
 * Built on `@wellsfargo-starui/react` Radix Tooltip (not a duplicate shadcn copy).
 *
 * forwardRef + spread is required so the wrapper can sit inside a Radix
 * `<PopoverTrigger asChild>` — Radix clones the immediate child to attach
 * a ref and merge event handlers.
 */
export const Tooltip = forwardRef<HTMLSpanElement, HoverTooltipProps>(function Tooltip(
  { content, children, className, ...rest },
  ref,
) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>
        <span ref={ref} className={cn('inline-flex', className)} {...rest}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[10px] px-1.5 py-0.5 max-w-xs">
        {content}
      </TooltipContent>
    </TooltipRoot>
  );
});
