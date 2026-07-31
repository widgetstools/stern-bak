import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

// StarUI status pill: fully-rounded, uppercase, bold, widest tracking.
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[length:var(--text-2xs)] font-bold uppercase tracking-[0.06em] leading-[1.6] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/80',
        outline: 'text-foreground',
        buy:
          'border-transparent bg-buy text-buy-foreground shadow-sm hover:bg-buy/90',
        sell:
          'border-transparent bg-sell text-sell-foreground shadow-sm hover:bg-sell/90',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
