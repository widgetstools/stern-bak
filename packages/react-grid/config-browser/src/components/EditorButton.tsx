import type { ReactNode } from 'react';
import { Button, cn } from '@wellsfargo-starui/ui';
import { DynamicIcon as Icon } from '../icons.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)

type EditorButtonVariant = 'default' | 'primary' | 'danger';

export function EditorButton({
  onClick,
  title,
  icon,
  children,
  variant = 'default',
  disabled,
  className,
}: {
  onClick: () => void;
  title?: string;
  icon?: string;
  children?: ReactNode;
  variant?: EditorButtonVariant;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      variant={variant === 'primary' ? 'default' : 'outline'}
      size="sm"
      className={cn(
        'h-[30px] gap-1.5 px-2 text-xs font-medium font-[var(--de-font)] shadow-none',
        // Primary uses the shadcn `default` variant (above), which already
        // paints `bg-primary text-primary-foreground` from the design system
        // (dark foreground on the brand primary). Only add layout padding —
        // do NOT re-paint colours here. (The old override wrapped an OKLCH
        // token in `hsl(...)`, which clamped the text to white.)
        variant === 'primary' && 'px-3',
        variant === 'danger' &&
          'border-[color-mix(in_srgb,var(--de-danger,var(--ds-accent-negative))_35%,var(--de-border))] bg-[color-mix(in_srgb,var(--de-danger,var(--ds-accent-negative))_8%,var(--de-bg-surface))] text-[var(--de-danger,var(--ds-accent-negative))] hover:text-[var(--de-danger,var(--ds-accent-negative))]',
        variant === 'default' &&
          'border-[var(--de-border)] bg-[var(--de-bg-surface)] text-[var(--de-text-secondary)] hover:bg-[var(--de-bg-surface)]',
        disabled && 'opacity-40',
        className,
      )}
    >
      {icon ? <Icon icon={icon} className="w-3.5 h-3.5" /> : null}
      {children}
    </Button>
  );
}
