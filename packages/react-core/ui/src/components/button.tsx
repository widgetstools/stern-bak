import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

// StarUI v1: semibold + tracking-tight; heights follow --control-h tokens
// (sm 26 / default 30 / lg 36) via Tailwind arbitrary values.
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        /** No accent hover — chrome/toolbar wrappers own colors via `.ds-*` CSS. */
        chrome: '',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-[var(--control-h)] px-[14px] gap-1.5 text-[length:var(--text-md)]',
        sm:      'h-[var(--control-h-sm)] rounded-md px-[var(--control-px)] gap-1 text-[length:var(--text-sm)]',
        lg:      'h-[var(--control-h-lg)] rounded-md px-[18px] gap-2 text-[length:var(--text-lg)]',
        icon:    'h-[var(--control-h)] w-[var(--control-h)]',
        /** Strip sizing — `.ds-*` / `.fx-*` CSS owns dimensions + color. */
        chrome:  'min-h-0 w-auto max-w-none px-0 py-0 gap-0 font-inherit tracking-normal rounded-none',
      },
    },
    compoundVariants: [
      {
        variant: 'chrome',
        size: 'chrome',
        class:
          'font-normal tracking-normal rounded-none whitespace-normal transition-none shadow-none focus-visible:ring-0 disabled:opacity-100 leading-none text-[length:inherit]',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
