import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@wellsfargo-starui/react';
import { useResolvedPortalContainer } from '../PortalContainer';
import { clickIsInsideAnyOpenPopover, registerPopoverRoot } from './popoverStack';

/**
 * FormatPopover — thin wrapper around the Radix Popover for use in the
 * format-editor primitive set. Preserves the cloneElement trigger API
 * that existing consumers (PropColor, ColorPickerPopover, FormatSwatch,
 * BorderSidesEditor, ConditionalStylingPanel) expect.
 *
 * Radix handles:
 *   - Portal rendering (escapes overflow:hidden)
 *   - Collision detection (flip + shift to stay in viewport)
 *   - Focus management + keyboard dismiss (Escape)
 *   - Accessibility (aria-expanded, role, etc.)
 *
 * We add:
 *   - --ds-* design-system token theming
 *   - Popover stack registration for nested-popover awareness
 *   - stopPropagation on mousedown inside content
 *   - max z-index (2147483647)
 */
/**
 * `children` can be either a static React node OR a render function
 * that receives `{ close }`. The function form lets popover content
 * drive its own dismissal (e.g. an inline "apply" button on the
 * format-string input that needs to commit + close in one click).
 * Plain-node consumers stay unchanged — the type union is checked at
 * runtime so existing callsites compile and run as before.
 */
export type FormatPopoverChildren =
  | React.ReactNode
  | ((api: { close: () => void }) => React.ReactNode);

export function FormatPopover({
  trigger,
  children,
  width = 240,
  align = 'start',
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  children: FormatPopoverChildren;
  width?: number;
  align?: 'start' | 'center' | 'end';
}) {
  const [open, setOpen] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  // Route the Radix portal via the PortalContainer context so this
  // popover lands in the popout window's body when the settings sheet
  // is popped out.
  const portalContainer = useResolvedPortalContainer();

  // Register in the shared popover stack for nested-popover close logic.
  React.useEffect(() => {
    if (!open || !contentRef.current) return;
    return registerPopoverRoot(contentRef.current);
  }, [open]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        {trigger}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={portalContainer}>
        <PopoverPrimitive.Content
          ref={contentRef}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            'z-[2147483647] rounded-md',
            'bg-card text-card-foreground',
            'border border-border',
            'shadow-card',
            'font-sans text-[11px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
            'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2',
          )}
          // Keep the popover inside the viewport. Radix exposes
          // `--radix-popover-content-available-height` = the max height
          // that fits before it would hit the viewport edge (given the
          // `collisionPadding` below). Cap there and let CHILDREN
          // manage their own internal scroll — flex-column + overflow-hidden
          // on this Content means the FormatterPicker's preset grid can
          // be the single scrollable region (flex: 1; min-height: 0;
          // overflow-y: auto) while the CURRENT chip + custom-Excel row
          // stay pinned. Without this the popover would also scroll,
          // producing the doubled scrollbars users complained about.
          style={{
            width,
            maxWidth: 'calc(100vw - 16px)',
            maxHeight: 'var(--radix-popover-content-available-height, 80vh)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            padding: 10,
            // Token-backed background — inline wins the cascade race.
            // Flips automatically between dark/light via the --ds-* cascade.
            background: 'var(--ds-surface-primary)',
            color: 'var(--ds-text-primary)',
            // Suppress the browser's default focus outline on the
            // Radix Content element — Radix focuses the content on
            // open, which paints a bright blue/white ring around the
            // popover that isn't part of our design system. The
            // in-popover controls keep their own focus-visible
            // styling.
            outline: 'none',
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const tag = (e.target as HTMLElement).tagName;
            if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
          }}
          // Prevent Radix from auto-closing when clicking inside nested
          // popovers (e.g., the thickness dropdown inside the border editor).
          onInteractOutside={(e) => {
            if (clickIsInsideAnyOpenPopover(e.target as Node)) {
              e.preventDefault();
            }
          }}
        >
          {typeof children === 'function'
            ? children({ close: () => setOpen(false) })
            : children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
