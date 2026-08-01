import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check } from 'lucide-react';
import { cn } from '@wellsfargo-starui/react';
import { ChromeButton } from '../ChromeButton';
import { useResolvedPortalContainer } from '../PortalContainer';
import { clickIsInsideAnyOpenPopover, registerPopoverRoot } from './popoverStack';

/**
 * Portal dropdown with Figma-style checkmark rail, built on Radix Popover.
 * Used for select-style choices (thickness, style, preset, font-size, etc.)
 */
export function FormatDropdown<V extends string | number>({
  trigger,
  options,
  value,
  onChange,
  footer,
  width,
}: {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  options: Array<{ value: V; label: string; icon?: React.ReactNode }>;
  value: V;
  onChange: (v: V) => void;
  footer?: React.ReactNode;
  width?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  // Route through PortalContainer so the dropdown lands in the popout
  // window when the sheet is popped out.
  const portalContainer = useResolvedPortalContainer();

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
          align="start"
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
          )}
          style={{
            minWidth: width ?? 180,
            padding: 4,
            // Token-backed opaque background. Auto-flips for light/dark theme
            // via the design-system token cascade.
            background: 'var(--ds-surface-primary)',
            color: 'var(--ds-text-primary)',
            // Suppress the browser's default focus outline on the
            // Radix-focused Content element.
            outline: 'none',
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            const tag = (e.target as HTMLElement).tagName;
            if (tag !== 'SELECT' && tag !== 'INPUT' && tag !== 'OPTION') e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (clickIsInsideAnyOpenPopover(e.target as Node)) {
              e.preventDefault();
            }
          }}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <ChromeButton
                key={String(o.value)}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 8px 6px 4px',
                  background: 'transparent',
                  color: 'var(--ds-text-primary)',
                  border: 'none',
                  borderRadius: 'var(--ds-radius-sm)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  fontSize: 11,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--ds-state-hover-overlay)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span
                  style={{
                    width: 14,
                    display: 'inline-flex',
                    justifyContent: 'center',
                    color: selected ? 'var(--ds-accent-positive)' : 'transparent',
                  }}
                >
                  <Check size={11} strokeWidth={2} />
                </span>
                {o.icon && (
                  <span style={{ color: selected ? 'var(--ds-accent-positive)' : 'var(--ds-text-muted)', display: 'inline-flex' }}>
                    {o.icon}
                  </span>
                )}
                <span style={{ flex: 1 }}>{o.label}</span>
              </ChromeButton>
            );
          })}
          {footer && (
            <>
              <div style={{ height: 1, background: 'var(--ds-border-primary)', margin: '4px 0' }} />
              {footer}
            </>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
