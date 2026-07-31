/**
 * Cockpit list rail — shared shadcn/cmdk primitive for every settings
 * panel's master-detail "items list" rail.
 *
 * Wraps `cmdk` (the unstyled primitive that shadcn's Command component
 * is also built on) so the four module panels — Column Settings,
 * Conditional Styling, Column Groups, Calculated Columns — share one
 * accessible, keyboard-navigable list rail instead of hand-rolled
 * `<ul><li><button>` markup.
 *
 * Selection model:
 *   - cmdk auto-sets `aria-selected="true"` on whichever item is
 *     currently *highlighted* (hovered / keyboard-focused). That is
 *     the cmdk "current" item, not the panel's "currently-edited"
 *     item.
 *   - Panel-level "this card is open in the editor" is encoded as
 *     `data-active="true"` on the item (set by callers via the
 *     `active` prop). The CSS keys the green left-border on
 *     `data-active`, with `aria-selected` falling back to a softer
 *     hover-style highlight for keyboard navigation discoverability.
 */
import { cn } from '@wellsfargo-starui/ui';
import { Command as CommandPrimitive } from 'cmdk';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from 'react';

export interface CockpitListProps
  extends Omit<ComponentPropsWithoutRef<typeof CommandPrimitive>, 'shouldFilter'> {
  /** Test hook applied to the inner `<CommandList>` element. */
  listTestId?: string;
}

/**
 * Outer Command + inner CommandList. The rail never shows a
 * search input, so cmdk's built-in filter is disabled — every item
 * passed in always renders.
 */
export const CockpitList = forwardRef<
  ElementRef<typeof CommandPrimitive>,
  CockpitListProps
>(function CockpitList({ children, listTestId, ...rest }, ref) {
  return (
    <CommandPrimitive ref={ref} shouldFilter={false} {...rest}>
      <CommandPrimitive.List
        className="ds-scrollbar list-none p-1 m-0 flex-1 flex flex-col gap-px"
        data-testid={listTestId}
      >
        {children}
      </CommandPrimitive.List>
    </CommandPrimitive>
  );
});

export interface CockpitListItemProps
  extends Omit<ComponentPropsWithoutRef<typeof CommandPrimitive.Item>, 'value'> {
  /** Stable id for the row — wired into cmdk's value model so keyboard
   *  navigation, click, and `onSelect` all dispatch with the same key. */
  value: string;
  /** True when this row's editor card is open in the panel's right
   *  pane. Encoded as `data-active="true"` so the theme can
   *  draw the persistent accent left-border without conflicting with
   *  cmdk's transient `aria-selected` highlight. */
  active?: boolean;
  /** Optional ghosting hook (`data-muted="true"`) for rows whose
   *  underlying record is disabled — preserves the existing
   *  conditional-styling rule list affordance. */
  muted?: boolean;
  /** Two-line rail rows (title + metadata). Default single-line `h-control-sm`. */
  multiline?: boolean;
}

const COCKPIT_LIST_ITEM_BASE =
  'flex w-full px-3.5 bg-transparent border-l-2 border-l-transparent text-foreground/90 text-[length:var(--ds-font-size-sm)] cursor-pointer select-none rounded-sm transition-colors data-[active=true]:bg-[var(--ds-primary-soft)] data-[active=true]:border-l-[color:var(--ds-primary)] data-[active=true]:text-foreground aria-selected:bg-muted/70 aria-selected:text-foreground data-[muted=true]:text-muted-foreground hover:bg-muted/60';

const COCKPIT_LIST_ITEM_SINGLE = 'items-center gap-2.5 h-control-sm';
const COCKPIT_LIST_ITEM_MULTILINE =
  'flex-col items-stretch gap-0.5 min-h-[3.25rem] h-auto py-2';

/** Secondary metadata line for multiline cockpit list rows. */
export function CockpitListItemMeta({ children }: { children: ReactNode }) {
  return (
    <span className="block w-full truncate text-[10px] leading-tight text-[color:var(--ds-text-muted)]">
      {children}
    </span>
  );
}

export const CockpitListItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  CockpitListItemProps
>(function CockpitListItem(
  { value, active, muted, multiline, className, children, style, ...rest },
  ref,
) {
  return (
    <CommandPrimitive.Item
      ref={ref}
      value={value}
      data-active={active ? 'true' : undefined}
      data-muted={muted ? 'true' : undefined}
      className={cn(
        COCKPIT_LIST_ITEM_BASE,
        multiline ? COCKPIT_LIST_ITEM_MULTILINE : COCKPIT_LIST_ITEM_SINGLE,
        className,
      )}
      style={style}
      {...rest}
    >
      {children}
    </CommandPrimitive.Item>
  );
});
